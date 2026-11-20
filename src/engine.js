// 同步引擎：钉钉数据 → 小钉找来的候选 → 你确认后进清单（今天 / 待办池）
const EventEmitter = require('events');
const dws = require('./dws');
const N = require('./normalize');
const R = require('./recognize');
const S = require('./shared');
const demo = require('./demo');
const Views = require('./views');

const DAY = S.DAY;
const uid = () => Math.random().toString(36).slice(2, 10);
const normPri = (p) => (['P0', 'P1', 'P2'].includes(p) ? p : p === 'P3' ? null : null);

class Engine extends EventEmitter {
  constructor(store, llm, { demoMode = false } = {}) {
    super();
    this.store = store; this.llm = llm; this.demo = demoMode;
    this.conn = { state: 'checking' };
    this.me = demoMode ? demo.me : null;
    this.busy = false;
    this.tidying = null;   // 一键识别进行中的进度
    this.alerts = [];      // 到点的提醒（task id）
    this.lastGroups = [];  // 最近一次看到的群名，给「排除的群」用
  }
  get data() { return this.store.get(); }
  get settings() { return this.data.settings; }
  save() { this.store.save(); this.emit('change'); }

  // ---------- 连接 ----------
  async checkConnection() {
    if (this.settings.disconnected) { this.conn = { state: 'off' }; this.emit('change'); return this.conn; }
    if (this.demo) { this.conn = { state: 'connected', demo: true, me: demo.me }; this.me = demo.me; this.data.marks.everConnected = true; this.emit('change'); return this.conn; }
    this.conn = { state: 'checking' }; this.emit('change');
    const st = await dws.status();
    if (st.state === 'not_logged_in' && this.data.marks.everConnected) st.state = 'expired'; // 授权过期或被收回
    this.conn = st;
    if (st.me) this.me = st.me;
    if (st.state === 'connected') this.data.marks.everConnected = true;
    this.save();
    return this.conn;
  }
  get connected() { return this.conn.state === 'connected'; }
  disconnect() { this.settings.disconnected = true; this.conn = { state: 'off' }; this.save(); return this.conn; }
  async connect() { this.settings.disconnected = false; this.store.save(); return this.checkConnection(); }

  // ---------- 读钉钉 ----------
  filterBySources(msgs) {
    const src = this.settings.sources; const ex = new Set(this.settings.excludedGroups || []);
    return msgs.filter((m) => (m.isGroup ? src.group && !ex.has(m.convName) : src.private));
  }
  async fetchMessages(since, onStep = () => {}) {
    if (this.demo) { onStep('all'); await sleep(900); onStep('atme'); await sleep(600); return this.filterBySources(demo.messages()); }
    const all = await dws.listAllMessages(new Date(since)).catch((e) => { if (e.kind === 'not_logged_in') throw e; return null; });
    onStep('all');
    const atme = await dws.listAtMe(Math.max(1, Math.ceil((Date.now() - since) / DAY))).catch(() => null);
    onStep('atme');
    if (!all && !atme) throw Object.assign(new Error('没有读到钉钉消息'), { kind: 'failed' });
    const atIds = new Set(atme ? N.normalizeMessages(atme).map((m) => m.id) : []);
    const merged = N.normalizeMessages({ a: all, b: atme });
    const msgs = merged.map((m) => ({ ...m, atMe: m.atMe || atIds.has(m.id) })).filter((m) => m.time >= since - 60e3);
    this.lastGroups = [...new Set(msgs.filter((m) => m.isGroup && m.convName).map((m) => m.convName))];
    return this.filterBySources(msgs);
  }

  async recognize(messages) {
    const now = new Date();
    const { workEnd } = this.settings;
    const ruleHits = R.fromMessages(messages, this.me, { now, workEnd }).map((c) => ({ ...c, priority: normPri(c.priority), why: R.WHY[c.priority] || '', by: 'rule' }));
    if (!this.llm.enabled) return ruleHits;
    const isMine = (m) => this.me && ((this.me.userId && m.senderId === this.me.userId) || (this.me.name && m.senderName === this.me.name));
    const hitIds = new Set(ruleHits.map((c) => c.id.slice(4)));
    const pool = messages.filter((m) => m.text.length >= 4 && (hitIds.has(m.id) || m.atMe || !m.isGroup || isMine(m)))
      .slice(-120).map((m) => ({ ...m, mine: isMine(m) }));
    const verdicts = await this.llm.judgeMessages(pool, this.me, now);
    if (!verdicts.size) return ruleHits; // 模型不可用，退回规则
    const byRule = new Map(ruleHits.map((c) => [c.id, c]));
    const out = [];
    for (const m of pool) {
      const v = verdicts.get(m.id); const rule = byRule.get(`msg:${m.id}`);
      if (!v) { if (rule) out.push(rule); continue; }
      if (!v.isTask) continue;
      const base = rule || {
        id: `msg:${m.id}`, quote: m.text.slice(0, 160), createdAt: m.time, atMe: !!m.atMe,
        source: m.isGroup ? { type: 'group', name: m.convName || '群聊', person: m.senderName, convId: m.convId, msgId: m.id, time: m.time }
          : { type: 'person', name: m.senderName || m.convName, convId: m.convId, msgId: m.id, time: m.time },
      };
      out.push({ ...base, id: `msg:${m.id}`, title: v.title || base.title || R.cleanTitle(m.text), direction: v.direction || base.direction || 'toMe',
        priority: normPri(v.priority), why: v.why || '', due: v.due ?? base.due ?? null, unsure: !!v.unsure, by: 'ai' });
    }
    return out;
  }

  async minutesCandidates() {
    if (!this.settings.sources.minutes) return { items: [], meetings: 0 };
    const d = this.data;
    const list = this.demo ? demo.minutesList() : N.normalizeMinutesList(await dws.listMinutes());
    const seen = new Set(d.seenMinutes);
    const recent = list.filter((m) => !seen.has(m.id) && (m.endTime || m.startTime || 0) > Date.now() - 2 * DAY).slice(0, 3);
    const out = [];
    for (const m of recent) {
      const raw = this.demo ? demo.minutesDetail(m.id) : await dws.minutesDetail(m.id);
      const det = N.normalizeMinutesDetail(raw, m);
      d.seenMinutes.push(m.id);
      for (const c of R.fromMinutes(m.id, det, this.me, { workEnd: this.settings.workEnd })) {
        if (c.direction !== 'toMe') continue; // 只要分给你的
        out.push({ ...c, priority: normPri(c.priority), why: R.WHY[c.priority] || '', by: 'rule' });
      }
    }
    return { items: out, meetings: recent.length };
  }

  /** 定时同步：新识别的候选进「主动提醒」队列 */
  async tick() {
    if (this.busy || this.tidying) return;
    if (!this.connected) await this.checkConnection();
    if (!this.connected || !this.settings.onboarded) return;
    this.busy = true;
    try {
      const d = this.data;
      const since = Math.max(d.marks.lastMsgSync || 0, Date.now() - DAY);
      const msgs = await this.fetchMessages(since);
      let found = await this.recognize(msgs);
      try { found = found.concat((await this.minutesCandidates()).items || []); } catch (e) { console.warn('[minutes]', e.message); }
      d.marks.lastMsgSync = Date.now(); d.marks.lastSyncAt = Date.now();
      this.addCandidates(found, { pushed: true });
    } catch (e) { this.onError(e); }
    finally { this.busy = false; this.save(); }
  }

  addCandidates(found, { pushed }) {
    const d = this.data;
    const marked = R.markAgainst(found, d.tasks.filter((t) => !t.done));
    const known = new Set([...d.candidates.map((c) => c.id), ...d.ignored, ...d.tasks.map((t) => t.originId).filter(Boolean)]);
    const fresh = marked.filter((c) => !known.has(c.id) && c.fit !== 'inlist' && !c.unsure && c.direction !== 'others')
      .map((c) => ({ ...c, seenAt: Date.now(), pushed: !!pushed }));
    d.candidates.push(...fresh);
    // 3 天前、已处理的候选清掉
    d.candidates = d.candidates.filter((c) => !c.handled || Date.now() - (c.seenAt || 0) < 3 * DAY);
    return fresh;
  }

  onError(e) {
    console.warn('[engine]', e.message, e.detail || '');
    if (e.kind === 'not_logged_in') this.conn = { state: this.data.marks.everConnected ? 'expired' : 'not_logged_in', error: e.message };
    if (e.kind === 'not_installed') this.conn = { state: 'not_installed', error: e.message };
  }

  // ---------- 一键识别（带阶段，给左边的小钉卡片用） ----------
  cancelTidy() { if (this.tidying) this.tidying.cancel = true; }
  async tidy({ days } = {}) {
    if (this.tidying) return null;
    await this.checkConnection();
    if (!this.connected) throw Object.assign(new Error(this.conn.error || '钉钉未连接'), { kind: this.conn.state });
    const src = this.settings.sources;
    const sources = [src.private && { key: 'private', label: '私聊' }, src.group && { key: 'group', label: '群聊' }, src.minutes && { key: 'minutes', label: '听记' }].filter(Boolean)
      .map((s) => ({ ...s, state: 'todo', n: null }));
    const p = this.tidying = { stage: 'read', reading: sources[0]?.label || '', sources, found: 0, pct: 4, cancel: false, startedAt: Date.now() };
    const tick = () => this.emit('tidy', { ...p, cancel: undefined });
    const set = (key, patch) => { const s = sources.find((x) => x.key === key); if (s) Object.assign(s, patch); };
    tick();
    const d = this.data;
    const since = days ? Date.now() - days * DAY : Math.max(Math.min(d.marks.lastTidyAt || 0, Date.now() - 12 * 3600e3), S.at(Date.now() - DAY, this.settings.workEnd) - 0);
    try {
      set('private', { state: 'ing' }); set('group', { state: 'ing' }); tick();
      const msgs = await this.fetchMessages(since, (step) => { p.pct = step === 'all' ? 35 : 50; tick(); });
      const priv = msgs.filter((m) => !m.isGroup).length, grp = msgs.filter((m) => m.isGroup);
      set('private', { state: 'ok', n: priv }); set('group', { state: 'ok', n: new Set(grp.map((m) => m.convName)).size });
      p.reading = '听记'; set('minutes', { state: 'ing' }); p.pct = 58; tick();
      let mins = { items: [], meetings: 0 };
      if (src.minutes && !p.cancel) { try { mins = await this.minutesCandidates(); } catch (e) { set('minutes', { state: 'fail' }); } }
      if (sources.find((s) => s.key === 'minutes')?.state !== 'fail') set('minutes', { state: 'ok', n: mins.meetings });
      if (p.cancel) return this.finishTidy(p, [], { stopped: true, msgs });
      p.stage = 'think'; p.pct = 70; tick();
      const found = (await this.recognize(msgs)).concat(mins.items || []);
      p.found = found.length; p.pct = 90; tick();
      return this.finishTidy(p, found, { msgs, meetings: mins.meetings, stopped: p.cancel });
    } catch (e) {
      this.tidying = null; this.emit('tidy', null); this.onError(e); this.emit('change');
      throw e;
    }
  }
  finishTidy(p, found, { msgs = [], meetings = 0, stopped = false }) {
    const d = this.data;
    const ignored = new Set(d.ignored);
    const marked = R.markAgainst(found.filter((c) => !ignored.has(c.id)), d.tasks.filter((t) => !t.done))
      .filter((c) => c.fit !== 'inlist' && !d.tasks.some((t) => t.originId === c.id));
    const rank = { P0: 0, P1: 1, P2: 2 };
    const sorted = marked.sort((a, b) => (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3) || (a.due || 9e15) - (b.due || 9e15));
    const main = sorted.filter((c) => !c.unsure && c.direction !== 'others');
    const maybe = sorted.filter((c) => c.unsure || c.direction === 'others');
    // 结果里的条目也放进候选，方便加入 / 忽略
    for (const c of sorted) if (!d.candidates.find((x) => x.id === c.id)) d.candidates.push({ ...c, seenAt: Date.now(), pushed: false });
    d.candidates.forEach((c) => { if (sorted.find((x) => x.id === c.id)) c.bubbleSeen = true; });
    d.marks.lastTidyAt = Date.now(); d.marks.lastMsgSync = Date.now();
    const stats = { messages: msgs.length, private: msgs.filter((m) => !m.isGroup).length, groupMsgs: msgs.filter((m) => m.isGroup).length,
      meetings, ms: Date.now() - p.startedAt, stopped, sources: p.sources };
    this.tidying = null; this.emit('tidy', null); this.save();
    return { main, maybe, stats, at: Date.now() };
  }

  // ---------- 首次连接用：认识了你什么 ----------
  async onboardStats() {
    if (this.demo) return { groups: 12, atMe: 38, meetings: 5 };
    const [atme, mins] = await Promise.allSettled([dws.listAtMe(7), dws.listMinutes()]);
    const at = atme.status === 'fulfilled' ? N.normalizeMessages(atme.value) : [];
    const ms = mins.status === 'fulfilled' ? N.normalizeMinutesList(mins.value) : [];
    const wk = S.mondayOf(Date.now());
    return { groups: new Set(at.filter((m) => m.isGroup).map((m) => m.convName)).size, atMe: at.length, meetings: ms.filter((m) => (m.startTime || 0) >= wk).length };
  }

  // ---------- 你的动作 ----------
  saveView(rawName, view) {
    const name = S.tagName(rawName);
    if (!name || name.length > 30) throw new Error('视图名称需要 1 到 30 个字');
    const available = [...Views.builtins, ...this.data.savedViews];
    if (available.some(v => S.tagKey(v.name) === S.tagKey(name))) throw new Error('已有同名视图，换个名字即可保存');
    if (!view || !['today', 'all'].includes(view.scope) ||
        !['manual', 'due', 'priority'].includes(view.sort) || typeof view.group !== 'boolean' ||
        typeof view.tag !== 'string' || (view.tag && !this.data.tagLibrary.includes(view.tag))) {
      throw new Error('视图条件无效，请重新选择');
    }
    const saved = { id: uid(), name, config: Views.config(view.scope, view.tag, view.sort, view.group) };
    this.data.savedViews.push(saved);
    this.save();
    return saved;
  }
  registerTag(rawName) {
    const name = S.tagName(rawName);
    if (!name) return '';
    const key = S.tagKey(name);
    const existing = this.data.tagLibrary.find((tag) => S.tagKey(tag) === key);
    if (existing) return existing;
    this.data.tagLibrary.push(name);
    this.store.save();
    return name;
  }
  taskTags(names) {
    return [...new Set((Array.isArray(names) ? names : []).map((name) => this.registerTag(name)).filter(Boolean))];
  }
  toggleTag(id, rawName) {
    const task = this.data.tasks.find((t) => t.id === id);
    if (!task) return null;
    const name = this.registerTag(rawName);
    if (!name) return null;
    const tags = task.tags || [];
    task.tags = tags.includes(name) ? tags.filter((tag) => tag !== name) : [...tags, name];
    this.save();
    return task;
  }
  nextOrder(list, top = false) {
    const same = this.data.tasks.filter((t) => t.list === list);
    if (!same.length) return 0;
    return top ? Math.min(...same.map((t) => t.order || 0)) - 1 : Math.max(...same.map((t) => t.order || 0)) + 1;
  }
  makeTask(base) {
    const now = Date.now();
    const t = {
      id: uid(), title: base.title, priority: base.priority ?? null, priorityAI: !!base.priorityAI, why: base.why || '',
      due: base.due ?? null, list: base.list === 'pool' ? 'pool' : 'today',
      remindAt: null, remindAuto: false, remindWhy: '', reminded: false,
      follow: !!base.follow, source: base.source || { type: 'manual', name: '你记的' }, quote: base.quote || '', originId: base.originId || null,
      tags: this.taskTags(base.tags), createdAt: now, done: false, doneAt: null,
    };
    if (base.remindAt !== undefined) {
      t.remindAt = base.remindAt;
      t.remindDisabled = base.remindAt === null;
    }
    else { const r = S.recommendRemind(t.due, now, this.settings); if (r) Object.assign(t, { remindAt: r.at, remindAuto: true, remindWhy: r.why }); }
    t.order = this.nextOrder(t.list, t.priority === 'P0');
    return t;
  }
  add(id, edits = {}) {
    const d = this.data;
    const c = d.candidates.find((x) => x.id === id);
    if (!c || c.handled) return null;
    const due = edits.due !== undefined ? edits.due : c.due ?? null;
    const task = this.makeTask({
      title: edits.title || c.title, tags: edits.tags,
      priority: edits.priority !== undefined ? edits.priority : c.priority,
      priorityAI: edits.priority === undefined && !!c.priority, why: c.why,
      due,
      remindAt: edits.remindAt, follow: c.direction === 'theyPromise', source: c.source, quote: c.quote, originId: c.id,
    });
    d.tasks.push(task);
    c.handled = 'added';
    this.save();
    return task;
  }
  addAll(ids, edits = {}) { return ids.map((id) => this.add(id, edits[id])).filter(Boolean); }
  ignore(id) { const c = this.data.candidates.find((x) => x.id === id); if (c) { c.handled = 'ignored'; this.data.ignored.push(id); } this.save(); }
  unignore(id) { const d = this.data; d.ignored = d.ignored.filter((x) => x !== id); const c = d.candidates.find((x) => x.id === id); if (c) delete c.handled; this.save(); }
  unadd(taskId) {
    const d = this.data; const t = d.tasks.find((x) => x.id === taskId); if (!t) return;
    d.tasks = d.tasks.filter((x) => x.id !== taskId);
    const c = d.candidates.find((x) => x.id === t.originId); if (c) delete c.handled;
    this.save();
  }
  bubbleSeen(id) { const c = this.data.candidates.find((x) => x.id === id); if (c) c.bubbleSeen = true; this.save(); }
  addManual(text, where = 'today', attrs = {}) {
    const title = String(text || '').trim();
    if (!title) return null;
    const t = this.makeTask({
      title, tags: attrs.tags, list: where === 'today' ? 'today' : 'pool', priority: normPri(attrs.priority),
      due: Number.isFinite(attrs.due) ? attrs.due : null,
      ...('remindAt' in attrs ? { remindAt: Number.isFinite(attrs.remindAt) ? attrs.remindAt : null } : {}),
      source: { type: 'manual', name: '你记的' },
    });
    this.data.tasks.push(t); this.save(); return t;
  }
  update(id, patch) {
    const t = this.data.tasks.find((x) => x.id === id); if (!t) return null;
    const p = { ...patch };
    if ('done' in p) p.doneAt = p.done ? Date.now() : null;
    if ('priority' in p) { p.priority = normPri(p.priority); p.priorityAI = false; }
    if ('remindAt' in p) {
      p.remindAuto = false;
      p.remindDisabled = p.remindAt === null;
      p.reminded = false;
      p.remindWhy = '';
    }
    if ('due' in p && !('remindAt' in p) && !t.remindDisabled && (t.remindAuto || !t.remindAt)) {
      const r = S.recommendRemind(p.due, Date.now(), this.settings);
      Object.assign(p, r ? { remindAt: r.at, remindAuto: true, remindWhy: r.why, reminded: false } : { remindAt: null, remindAuto: false, remindWhy: '' });
    }
    if ('remindAt' in p) this.alerts = this.alerts.filter((taskId) => taskId !== id);
    Object.assign(t, p); this.save(); return t;
  }
  /** 拖动：移入目标清单，在 beforeId 前插入，或放在末尾。 */
  move(id, { beforeId = null, list } = {}) {
    const d = this.data; const t = d.tasks.find((x) => x.id === id); if (!t) return null;
    if (list === 'today' || list === 'pool') t.list = list;
    const same = d.tasks.filter((x) => x !== t && x.list === t.list).sort((a, b) => (a.order || 0) - (b.order || 0));
    const i = beforeId ? same.findIndex((x) => x.id === beforeId) : -1;
    same.splice(i < 0 ? same.length : i, 0, t);
    same.forEach((task, order) => { task.order = order; });
    this.save(); return t;
  }
  remove(id) { const d = this.data; const t = d.tasks.find((x) => x.id === id); d.tasks = d.tasks.filter((x) => x.id !== id); this.save(); return t; }
  restore(t) { if (t && !this.data.tasks.find((x) => x.id === t.id)) this.data.tasks.push(t); this.save(); }
  snooze(id, at) { this.alerts = this.alerts.filter((x) => x !== id); return this.update(id, { remindAt: at }); }
  dismissAlert(id) { this.alerts = this.alerts.filter((x) => x !== id); this.emit('change'); }

  /** 每 30 秒：到点的提醒 */
  dueReminders() {
    const now = Date.now();
    const due = this.data.tasks.filter((t) => !t.done && t.remindAt && t.remindAt <= now && !t.reminded &&
      (!t.remindAuto || !t.due || t.due > now - 60e3));
    due.forEach((t) => { t.reminded = true; if (!this.alerts.includes(t.id)) this.alerts.push(t.id); });
    if (due.length) this.save();
    return due;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
module.exports = { Engine };
