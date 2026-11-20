// AI待办 · 界面
// 渲染方式：状态变化 → 重画各个区块（输入框单独保留，不打断输入）。所有点击走 data-a 事件委托。
const Sh = window.Shared;
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const A = async (name, ...a) => { const r = await window.xd.act(name, ...a); if (r?.__error) throw new Error(r.__error); return r; };

let S = null;                // 主进程快照
const ui = {
  undoStack: [], undoing: false, todayOptions: false, titleDrafts: {}, focusEdit: false, drafts: { today: { title: '' }, pool: { title: '' } }, submitting: {}, expanded: false, menu: null, openRow: null, editRow: null, connPanel: false, groupsOpen: false,
  bubbleHidden: false, bubbleTimer: null, bubbleHover: false, lastBubbleId: null,
  tidy: null, tidyResult: null, tidyMaybeOpen: false, tidyErr: null,
  onboard: { step: 1, stats: null, err: null, connecting: [] },
  edits: {}, toast: null, drag: null, poolOpen: false, laterOpen: false, pose: null, coach: null, dateInput: null,
};

// ---------- 小图标 ----------
const I = {
  more: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>`,
  flag: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4m0 0c5-4 9 4 14 0v11c-5 4-9-4-14 0"/></svg>`,
  tag: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13 11 22 2 13V4h9z"/><circle cx="7" cy="9" r="1"/></svg>`,
  search: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>`,
  trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>`,
  sp: (s = 12) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z"/></svg>`,
  clk: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  bell: (s = 12) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4"/></svg>`,
  x: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  up: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 15l6-6 6 6"/></svg>`,
  down: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>`,
  chev: `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>`,
  tick: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>`,
  okg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#17803D" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>`,
  todo: `<svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="#C9CFD9" stroke-width="2" stroke-dasharray="3 3"/></svg>`,
  spin: (s = 16) => `<svg class="spin" width="${s}" height="${s}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#D5DEF5" stroke-width="3"/><path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="#1A5CFF" stroke-width="3" stroke-linecap="round"/></svg>`,
  grip: `<svg width="8" height="12" viewBox="0 0 10 14" fill="currentColor"><circle cx="2.5" cy="2.5" r="1.4"/><circle cx="7.5" cy="2.5" r="1.4"/><circle cx="2.5" cy="7" r="1.4"/><circle cx="7.5" cy="7" r="1.4"/><circle cx="2.5" cy="11.5" r="1.4"/><circle cx="7.5" cy="11.5" r="1.4"/></svg>`,
  ring: `<svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#F6C9B4" stroke-width="3"/><path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="#E2713A" stroke-width="3" stroke-linecap="round"/></svg>`,
  stop: `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
  refresh: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1A4BD6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg>`,
};
const POSE = (n) => `assets/${n}.png`;
const AVC = ['#FFE2D3', '#ECE5FF', '#DDF3E4', '#FFF3D6', '#FCE4EC', '#E3F0FF'];
const avc = (name) => AVC[[...String(name || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % AVC.length];
const PRI_NAME = { P0: '紧急', P1: '重要', P2: '一般' };

// ---------- 数据视图 ----------
const now = () => Date.now();
const rendererStartedAt = now();
const strikeDuration = 240;
const t0 = () => Sh.startOfDay();
const tasks = () => S?.tasks || [];
const open = () => tasks().filter((t) => !t.done);
const isOverdue = (t) => t.due && t.due <= (t.done ? t.doneAt : now());
const inToday = (t) => t.list === 'today';
const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
const viewTasks = () => Views.selectTasks(tasks(), viewState.config);
const poolTasks = () => tasks().filter((t) => !inToday(t)).sort(byOrder);
const doneToday = () => tasks().filter((t) => t.done && t.doneAt >= t0());
const pending = () => (S?.candidates || []);
const bubbleQueue = () => pending().filter((c) => c.pushed && !c.bubbleSeen).sort((a, b) => (b.seenAt || 0) - (a.seenAt || 0));
const taskById = (id) => tasks().find((t) => t.id === id);
const candById = (id) => pending().find((c) => c.id === id) || [...(ui.tidyResult?.main || []), ...(ui.tidyResult?.maybe || [])].find((c) => c.id === id);
const workEnd = () => S?.settings?.workEnd || '18:30';
const deadlineLabel = (due, n = now()) => Sh.deadlineLabel(due, n, workEnd());

function flashInfo() {
  const n = now();
  const urgent = open().filter((t) => t.due && t.due > n && t.due - n <= 30 * 60e3 && (t.priority === 'P0' || t.priority === 'P1' || t.follow))
    .sort((a, b) => a.due - b.due)[0];
  if (urgent) {
    const minutes = Math.max(1, Math.round((urgent.due - n) / 60e3));
    const short = `${minutes} 分钟后截止`;
    return { kind: 'urgent', task: urgent, text: `${urgent.title} · ${short}`, short, pct: Math.min(100, Math.max(4, 100 - (urgent.due - n) / (30 * 60e3) * 100)) };
  }
  const unseen = pending().filter((c) => !c.bubbleSeen).length;
  if (unseen >= 5) return { kind: 'many', text: `有 ${unseen} 件还没看`, short: `有 ${unseen} 件还没看` };
  return null;
}
function poseNow() {
  const f = flashInfo();
  if (ui.tidy) return { p: ui.tidy.stage === 'think' ? 'think' : 'search', peek: true };
  if (f && f.kind === 'urgent') return { p: 'ring', peek: true };
  if (currentAlert() || (bubbleQueue().length && !ui.bubbleHidden)) return { p: 'hang', peek: true };
  if (f && f.kind === 'many') return { p: 'what', peek: true };
  if (ui.offWork) return { p: 'hug', peek: true };
  return { p: 'empty', peek: false };
}
const currentAlert = () => (S?.alerts || []).map(taskById).find((t) => t && !t.done);

// ---------- 小部件 ----------
function connChip(mini) {
  const st = S?.conn?.state;
  if (st === 'connected' && mini) return `<button class="conn mini nodrag" data-a="connPanel" title="已连接钉钉"><span class="gdot"></span><span class="dk">钉</span></button>`;
  if (st === 'connected') return `<button class="conn ${ui.connPanel ? 'on' : ''} nodrag" data-a="connPanel"><span class="st0">已连接</span><span class="dk">钉</span>钉钉 ${I.chev}</button>`;
  if (st === 'checking') return `<span class="conn">${I.spin(12)}<span class="st0">连接中</span><span class="dk">钉</span>钉钉</span>`;
  if (st === 'expired') return `<button class="conn warn nodrag" data-a="connPanel">需要重新授权 <span class="dk">钉</span>钉钉 ${I.chev}</button>`;
  return `<button class="conn nodrag" data-a="connPanel"><span class="dot"></span><span class="st0">未连接</span></button>`;
}
function poseImg(big) {
  const p = poseNow();
  const changed = ui.pose !== p.p; ui.pose = p.p;
  return `<span class="pose ${p.peek ? 'peek' : ''} ${changed ? 'pop' : ''}"><img src="${POSE(p.p)}" alt="小钉"></span>`;
}
function tidyBtn() {
  if (ui.tidy) return `<span class="kbs busy">${I.spin(13)}识别中</span>`;
  if (S?.conn?.state !== 'connected') return `<button class="kbs nodrag" data-a="connect">连接钉钉</button>`;
  return `<button class="kbs nodrag" data-a="tidy">一键识别</button>`;
}
const pchip = (p, ai, attrs) => p ? `<button class="pc p${p[1]}" ${attrs} aria-label="编辑优先级：${p}">${ai ? I.sp(9) : ''}${p}</button>` : '';

function tagPill(name) {
  const color = Array.from(Sh.tagKey(name)).reduce((sum, char) => sum + char.codePointAt(0), 0) % 5;
  return `<span class="custom-tag tone-${color}" title="${esc(name)}">${esc(name)}</span>`;
}
function tagSummary(names, attrs, compact = false) {
  if (!names?.length) return '';
  const visible = compact ? names.slice(0, 1) : names;
  const more = names.length - visible.length;
  return `<button class="task-tags ${compact ? 'compact' : ''}" ${attrs} aria-label="编辑标签：${esc(names.join('、'))}">${visible.map(tagPill).join('')}${more ? `<span class="tag-count">+${more}</span>` : ''}</button>`;
}

function srcWhere(s) {
  if (!s) return '';
  if (s.type === 'group') return s.name;
  if (s.type === 'person') return '私聊';
  if (s.type === 'meet') return s.name;
  if (s.type === 'self') return '文件小助手';
  return '';
}
const srcWho = (s) => (s?.type === 'group' ? s.person : s?.type === 'person' ? s.name : s?.type === 'manual' ? '' : '') || '';

// 原话里钉钉的富文本占位，换成人话
const cleanQuote = (q) => String(q || '')
  .replace(/\[图片消息\]\s*\(mediaId=[^)]*\)/g, '[图片]')
  .replace(/\[([^\]]{1,20})\]\s*\((?:mediaId|dingtalk|https?):[^)]*\)/g, '[$1]')
  .replace(/\(mediaId=[^)]*\)/g, '')
  .replace(/\s*[–-]\s*[–-]?1(?=\[)/g, ' ')
  .trim();

// ---------- 清单里的一行 ----------
const rowInstance = el => el.closest('[data-instance]')?.dataset.instance || 'main';
const isTaskProperty = menu => menu?.scope === 'task' && ['more', 'pri', 'tags'].includes(menu.k);
function taskPropertyAttrs(id, instance, key, anchor = key) {
  const menu = ui.menu;
  const expanded = isTaskProperty(menu) && menu.id === id && menu.instance === instance && menu.anchor === anchor;
  return `data-a="menu" data-k="${key}" data-id="${id}" data-prop-anchor="${anchor}" aria-expanded="${expanded}" aria-controls="taskPopover"`;
}
function taskRow(t, opts = {}) {
  const instance = opts.instance || (opts.pool ? 'pool' : 'main');
  const editing = ui.editRow === t.id && ui.editInstance === instance;
  const n = now();
  let right = '';
  if (t.due) {
    const overdue = isOverdue(t);
    const tone = overdue ? 'over' : t.due - n <= 24 * 3600e3 ? 'red' : 'due';
    const label = deadlineLabel(t.due, n) + (overdue ? ' · 已逾期' : '');
    const date = new Date(t.due).toLocaleString('zh-CN', { hour12: false });
    right = `<button class="rt ${tone}" data-a="menu" data-k="due" data-id="${t.id}" title="${esc(date)}截止${overdue ? ' · 已逾期' : ''}">${label}</button>`;
  } else if (t.remindAt && !t.reminded) {
    right = `<button class="rt blue" data-a="menu" data-k="rem" data-id="${t.id}">${I.bell()}${Sh.remindWord(t.remindAt, n)} 提醒</button>`;
  }
  const tags = [];
  if (t.follow) tags.push('<span class="tag f">跟进</span>');
  const compact = S.settings.density !== 'detail';
  const labels = tagSummary(t.tags, taskPropertyAttrs(t.id, instance, 'tags'), compact);
  const detail = S.settings.density === 'detail' && (srcWho(t.source) || srcWhere(t.source))
    ? `<div class="srcl">${srcWho(t.source) ? `<span class="sc2"><span class="pav" style="background:${avc(srcWho(t.source))}">${esc(srcWho(t.source)[0])}</span>${esc(srcWho(t.source))}</span>` : ''}<span class="sc2">${esc(srcWhere(t.source) || '你记的')}</span></div>` : '';
  const striking = t.done && t.doneAt >= rendererStartedAt && n - t.doneAt < strikeDuration;
  const cls = `nr${t.done ? ' done' : ''}${striking ? ' striking' : ''}`;
  const motion = striking ? ` style="--strike-duration:${strikeDuration}ms;--strike-delay:${t.doneAt - n}ms"` : '';
  let h = `<div class="${cls}"${motion} draggable="${ui.editRow !== t.id}" data-drag="task" data-id="${t.id}">
    <span class="grip">${I.grip}</span>
    <button class="ck${t.done ? ' on' : ''}" type="button" role="checkbox" aria-checked="${!!t.done}" aria-label="完成：${esc(t.title)}" data-a="check" data-id="${t.id}">${t.done ? I.tick : ''}</button>
    <div class="nb"><div class="nt">${pchip(t.priority, t.priorityAI, taskPropertyAttrs(t.id, instance, 'pri'))}${editing ? `<input class="edit title-edit" aria-label="修改任务标题" data-edit="${t.id}" value="${esc(ui.titleDrafts[t.id] ?? t.title)}">` : `<span class="tx" tabindex="0" data-title="${t.id}" data-a="openRow" data-id="${t.id}" title="双击修改标题">${esc(t.title)}</span>`}${tags.join('')}${compact && !editing ? labels : ''}</div>${compact ? '' : labels}${detail}</div>
    ${opts.pool ? `<button class="plus" data-a="toToday" data-id="${t.id}">+ 今天</button>` : ''}${right}<button class="row-more" ${taskPropertyAttrs(t.id, instance, 'more')} aria-label="任务操作：${esc(t.title)}" title="任务操作">${I.more}</button></div>`;
  if (ui.openRow === t.id && ui.openInstance === instance) h += detailHtml(t, instance);
  if (!isTaskProperty(ui.menu) && ui.menu?.id === t.id && ui.menu.scope === 'task' && ui.menu.instance === instance) h += menuHtml(ui.menu.k, t, 'task');
  return `<div class="task-instance" data-instance="${esc(instance)}">${h}</div>`;
}
function detailHtml(t, instance) {
  const s = t.source || {};
  const who = srcWho(s) || (s.type === 'manual' ? '你记的' : s.name || '');
  const timeText = (at) => `${Sh.dayWord(at)} ${Sh.hm(at)}`;
  const reminder = t.remindAt
    ? `${timeText(t.remindAt)}${t.reminded ? ' · 已提醒' : t.remindAuto ? ' · 小钉推荐' : ''}`
    : t.remindDisabled ? '不提醒' : '未设置';
  const times = [
    ['due', '截止', t.due ? Sh.deadlineLabel(t.due, now(), null) : '未设置'],
    ['rem', '提醒', reminder],
  ];

  return `<div class="dtl">
    ${t.quote ? `<div class="qh"><span class="pav" style="background:${avc(who)}">${esc(who[0] || '钉')}</span>${esc(who)}${srcWhere(s) ? ' · ' + esc(srcWhere(s)) : ''}${s.time ? ' · ' + Sh.dayWord(s.time) + ' ' + Sh.hm(s.time) : ''}<a data-a="openDingTalk">去钉钉看 ↗</a></div>「${esc(cleanQuote(t.quote))}」` : `<div class="ss">${s.type === 'manual' ? '你自己记的' : '没有原话'}</div>`}
    <div class="task-times">${times.map(([key, label, value]) => `<button class="task-time" data-a="menu" data-k="${key}" data-id="${t.id}"><span>${label}</span><b class="${key === 'due' && t.due ? 'deadline-label' : ''}">${value}</b>${I.chev}</button>`).join('')}</div>
    <div class="acts"><button ${taskPropertyAttrs(t.id, instance, 'pri', 'detail-pri')}>${t.priority ? '改优先级' : '设优先级'}</button><button ${taskPropertyAttrs(t.id, instance, 'tags', 'detail-tags')}>标签</button><button data-a="copy" data-id="${t.id}">复制</button><button class="del" data-a="remove" data-id="${t.id}">删除</button></div></div>`;
}

function selectedTags({ scope, id }) {
  if (scope === 'draft') return draftTags(id);
  if (scope === 'cand') return ui.edits[id]?.tags || [];
  return taskById(id)?.tags || [];
}
function tagOptions(menu) {
  const query = Sh.tagName(menu.query);
  const key = Sh.tagKey(query);
  const selected = selectedTags(menu);
  const library = S.tagLibrary || [];
  const matches = library.filter((name) => Sh.tagKey(name).includes(key));
  const exact = matches.find((name) => Sh.tagKey(name) === key);
  const options = (exact ? [exact, ...matches.filter((name) => name !== exact)] : matches).map((name) => {
    const added = selected.includes(name);
    return `<button class="mi tag-option" data-a="toggleTag" data-tag="${esc(name)}" aria-pressed="${added}"><span class="tag-option-name">${esc(name)}</span><span class="tag-check" aria-hidden="true">${added ? '✓' : ''}</span></button>`;
  });
  if (query && !exact) options.push(`<button class="mi tag-option create-tag" data-a="toggleTag" data-tag="${esc(query)}"><span class="tag-option-name">创建「${esc(query)}」</span></button>`);
  return options.join('') || '<p class="tag-empty">还没有可用标签</p>';
}
function propertyMenuHead(title, scope) {
  return `<div class="property-menu-head"><strong>${title}</strong>${scope === 'task' ? `<button type="button" class="property-close" data-a="closeTaskProperty" aria-label="关闭${title}">${I.x}</button>` : ''}</div>`;
}
function tagPicker(scope) {
  const menu = ui.menu;
  const selected = selectedTags(menu);
  const chips = selected.map(name => `<button type="button" class="tag-remove" data-a="toggleTag" data-tag="${esc(name)}" aria-label="移除标签：${esc(name)}">${tagPill(name)}<span aria-hidden="true">×</span></button>`).join('');
  return `<div class="tag-picker">${propertyMenuHead('标签', scope)}
    ${chips ? '<div class="tag-section">已添加</div><div class="tag-selected">' + chips + '</div>' : ''}
    <label class="tag-search-box">${I.search}<input class="tag-search" aria-label="搜索或创建标签" placeholder="搜索或创建标签…" value="${esc(menu.query)}"></label>
    <div class="tag-section" data-tag-section>${Sh.tagName(menu.query) ? '搜索结果' : '可用标签'}</div>
    <div class="tag-options">${tagOptions(menu)}</div></div>`;
}

// ---------- 弹层：优先级 / 截止 / 提醒 ----------
function menuHtml(k, item, scope) {
  const id = item.id; const ed = scope === 'cand' ? (ui.edits[id] || {}) : {};
  const val = (f) => (scope === 'cand' && f in ed ? ed[f] : item[f]);
  const da = (extra) => `data-a="pick" data-scope="${scope}" data-id="${id}" ${extra}`;
  if (k === 'more') {
    return `<div class="menu task-action-menu" role="group" aria-label="任务操作">
      <button type="button" class="mi task-action" data-a="taskProperty" data-k="pri"><span>${I.flag}${item.priority ? '编辑优先级' : '设置优先级'}</span>${I.chev}</button>
      <button type="button" class="mi task-action" data-a="taskProperty" data-k="tags"><span>${I.tag}编辑标签</span>${I.chev}</button>
      <div class="sep"></div><button type="button" class="mi task-action task-action-delete" data-a="remove" data-id="${id}"><span>${I.trash}删除任务</span></button>
    </div>`;
  }
  if (k === 'tags') return `<div class="menu" role="group" aria-label="标签">${tagPicker(scope)}</div>`;
  if (k === 'pri') {
    const cur = val('priority');
    const why = item.why && (scope === 'cand' ? !('priority' in ed) : item.priorityAI) ? `<div class="why">小钉的理由：${esc(item.why)}</div>` : '';
    return `<div class="menu" role="group" aria-label="优先级">${propertyMenuHead('优先级', scope)}${['P0', 'P1', 'P2'].map((p) => `<button class="mi ${cur === p ? 'sel' : ''}" ${da(`data-f="priority" data-v="${p}"`)} aria-pressed="${cur === p}"><span><i class="dot p${p[1]}" aria-hidden="true"></i>${p} · ${PRI_NAME[p]}</span><span aria-hidden="true">${cur === p ? '✓' : ''}</span></button>`).join('')}
      ${cur ? `<button class="mi" ${da('data-f="priority" data-v=""')}>清除优先级</button>` : ''}${why}</div>`;
  }
  if (k === 'due') {
    const cur = val('due');
    const n = now();
    const opts = Sh.dueOptions(n, S.settings);
    return `<div class="menu r"><div class="pt">截止 · 最晚何时完成</div>${opts.map((at) => `<button class="mi ${cur && Math.abs(cur - at) < 60e3 ? 'sel' : ''}" ${da(`data-f="due" data-v="${at}"`)}><span class="deadline-label">${deadlineLabel(at, n)}</span><span class="sub">${Sh.hm(at)}</span></button>`).join('')}
      ${dateRow(scope, id, 'due', cur)}<div class="sep"></div><button class="mi" ${da('data-f="due" data-v=""')}><span style="color:var(--mute)">清除截止</span></button></div>`;
  }
  if (k === 'rem') {
    const due = val('due');
    const { rec, opts } = Sh.remindOptions(due, now(), S.settings);
    const cur = scope === 'cand' ? ('remindAt' in ed ? ed.remindAt : rec?.at)
      : scope === 'draft' && !('remindAt' in item) ? rec?.at : item.remindAt;
    const disabled = scope === 'task' ? item.remindDisabled
      : (scope === 'cand' ? ed : item).remindAt === null;
    const recRow = rec ? `<button class="mi ${cur && Math.abs(cur - rec.at) < 60e3 ? 'sel' : ''}" ${da(`data-f="remindAt" data-v="${rec.at}"`)}><span>${I.sp(10)} ${Sh.remindWord(rec.at)}</span><span class="sub">${rec.why}</span></button><div class="why">小钉推荐：${rec.why}，在工作时间里</div>` : '';
    return `<div class="menu r"><div class="pt">提醒 · 何时通知你</div><input class="tin" data-timein="${scope}:${id}" placeholder="打时间，比如「周四下午」，回车">${recRow}
      ${opts.map((o) => `<button class="mi ${cur && Math.abs(cur - o.at) < 60e3 ? 'sel' : ''}" ${da(`data-f="remindAt" data-v="${o.at}"`)}><span>${o.label}</span><span class="sub">${Sh.remindWord(o.at)}</span></button>`).join('')}
      ${dateRow(scope, id, 'remindAt', cur)}<div class="sep"></div><button class="mi ${disabled ? 'sel' : ''}" ${da('data-f="remindAt" data-v=""')}><span style="color:var(--mute)">不提醒</span></button></div>`;
  }
  return '';
}
function dateRow(scope, id, f, current) {
  const label = '选日期和时间';
  if (ui.dateInput === `${scope}:${id}:${f}`) {
    const d = new Date(current ?? now() + 3600e3);
    const pad = (n) => String(n).padStart(2, '0');
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const value = `${day}T${Sh.hm(d.getTime())}`;
    return `<div style="display:flex;gap:6px;padding:4px 6px"><input type="datetime-local" class="tin" style="margin:0" aria-label="${label}" data-datein="${scope}:${id}:${f}" value="${value}"><button class="kbs" data-a="dateOk" data-key="${scope}:${id}:${f}">好</button></div>`;
  }
  return `<button class="mi" data-a="dateInput" data-key="${scope}:${id}:${f}"><span>${label}…</span></button>`;
}

// ---------- 统一待办行（气泡 / 识别结果） ----------
function candRow(c, { first = false, bubble = false } = {}) {
  const ed = ui.edits[c.id] || {};
  const pri = 'priority' in ed ? ed.priority : c.priority;
  const due = 'due' in ed ? ed.due : c.due;
  const rec = Sh.recommendRemind(due, now(), S.settings);
  const rem = 'remindAt' in ed ? ed.remindAt : rec?.at;
  const remAuto = !('remindAt' in ed) && rec;
  const id = esc(c.id);
  const da = (k) => `data-a="menu" data-k="${k}" data-id="${id}" data-scope="cand"`;
  const on = (k) => (ui.menu && ui.menu.id === c.id && ui.menu.k === k ? 'on' : '');
  const pc = pri ? `<button type="button" class="chip p${pri[1]} ${on('pri')}" aria-label="编辑优先级" ${da('pri')}>${!('priority' in ed) ? I.sp(10) : ''}${pri}${I.chev}</button>` : `<button type="button" class="chip ghost ${on('pri')}" aria-label="编辑优先级" ${da('pri')}>+ 优先级</button>`;
  const dc = due ? `<button type="button" class="chip ddl ${on('due')}" aria-label="编辑截止时间" ${da('due')} title="${Sh.deadlineLabel(due, now(), null)}">${I.clk}${deadlineLabel(due)}</button>` : `<button type="button" class="chip ghost ${on('due')}" aria-label="编辑截止时间" ${da('due')}>${I.clk}加截止</button>`;
  const rc = rem ? `<button type="button" class="chip rem ${on('rem')}" aria-label="编辑提醒" ${da('rem')}>${remAuto ? I.sp(10) : ''}${I.bell()}${Sh.remindWord(rem)} 提醒</button>` : `<button type="button" class="chip ghost ${on('rem')}" aria-label="编辑提醒" ${da('rem')}>${I.bell()}${ed.remindAt === null ? '不提醒' : '加提醒'}</button>`;
  const who = srcWho(c.source);
  const per = who ? `<span class="chip per"><span class="pav" style="background:${avc(who)}">${esc(who[0])}</span>${esc(who)}</span>` : '';
  const quoteOn = revealedQuotes.has(c.id);
  const quoteButton = c.quote ? `<button class="tidy-quote-toggle" data-a="tidyQuote" data-id="${esc(c.id)}" aria-expanded="${quoteOn}">原话</button>` : '';
  const where = srcWhere(c.source) ? `<span class="where">${esc(srcWhere(c.source))}</span>` : '';
  const tags = tagSummary(ed.tags, da('tags'), true) || `<button type="button" class="chip ghost ${on('tags')}" ${da('tags')}>＋标签</button>`;
  const title = `<div class="tt">${esc(ed.title || c.title)}</div>`;
  const add = `<button class="add" data-a="add" data-id="${id}">加入</button>`;
  const ignore = `<button class="ign" data-a="ignore" data-id="${id}">忽略</button>`;
  const source = per + where + quoteButton;
  const properties = pc + dc + rc;
  const body = bubble
    ? `<div class="rb">${title}<div class="chips">${properties}${source}${tags}</div></div><div class="bt">${add}${ignore}</div>`
    : `<span class="grip" aria-hidden="true">${I.grip}</span>${title}<div class="bt">${ignore}${add}</div>
       <div class="source-line">${source}</div><div class="chips">${properties}${tags}</div>`;
  let h = `<div class="urow ${first ? 'first' : ''}" draggable="true" data-drag="cand" data-id="${id}">${body}</div>`;
  if (quoteOn && c.quote) h += `<blockquote class="tidy-quote"><span class="ss">${esc([who, srcWhere(c.source), c.source?.type === 'meet' ? '听记' : '', c.source?.time ? Sh.dayWord(c.source.time) + ' ' + Sh.hm(c.source.time) : ''].filter(Boolean).join(' · '))}</span>「${esc(cleanQuote(c.quote))}」</blockquote>`;
  if (ui.menu && ui.menu.id === c.id && ui.menu.scope === 'cand') h += `<div style="padding:0 12px 6px">${menuHtml(ui.menu.k, c, 'cand')}</div>`;
  return h;
}
function bubbleHead(c) {
  const s = c.source || {};
  const who = srcWho(s) || s.name || '钉钉';
  let t;
  if (c.direction === 'fromMe') t = `你答应了${esc(s.name || who)}`;
  else if (c.direction === 'theyPromise') t = `${esc(who)}答应你`;
  else if (s.type === 'group') t = `${esc(who)}在${esc(s.name)}${c.atMe ? ' @你' : ''}`;
  else if (s.type === 'meet') t = `听记 · ${esc(s.name)}`;
  else if (s.type === 'self') t = '你发给自己的';
  else t = `${esc(who)}私聊你`;
  const time = c.createdAt ? Sh.hm(c.createdAt) : '';
  return `<div class="uhead"><span class="hav" style="background:${avc(who)}">${esc((who || '钉')[0])}${s.type === 'group' ? '<i class="g"></i>' : ''}</span><span class="t"><b>${t}</b> <span class="ss">· ${time}</span></span><button class="ib" data-a="bubbleClose" data-id="${c.id}">${I.x}</button></div>`;
}
function bubbleHtml() {
  const q = bubbleQueue();
  if (!q.length || ui.bubbleHidden) return '';
  const c = q[0];
  if (ui.lastBubbleId !== c.id) { ui.lastBubbleId = c.id; armBubbleTimer(); }
  const card = `<div class="card" data-bubble="1">${bubbleHead(c)}${candRow(c, { first: true, bubble: true })}</div>`;
  return q.length > 1 ? `<div class="stack"><div class="peek2"></div><div style="position:relative">${card}</div><span class="more">+${q.length - 1}</span></div>` : card;
}
function armBubbleTimer() {
  clearTimeout(ui.bubbleTimer);
  ui.bubbleTimer = setTimeout(() => { if (ui.bubbleHover || ui.menu) return armBubbleTimer(); ui.bubbleHidden = true; render(); }, 8000);
}

// ---------- 提醒到点 ----------
function alertHtml() {
  const t = currentAlert(); if (!t) return '';
  const why = t.remindWhy || '你设的';
  const later = ui.laterOpen ? `<div style="padding:0 12px 10px 52px"><div class="menu" style="margin:0"><div class="pt">再提醒我</div>
      ${[['10 分钟后', now() + 10 * 60e3], ['半小时后', now() + 30 * 60e3], ['明天上午', Sh.at(Sh.addDays(now(), 1), '10:00')]].map(([l, at]) => `<button class="mi" data-a="snooze" data-id="${t.id}" data-v="${at}"><span>${l}</span><span class="sub">${Sh.remindWord(at)}</span></button>`).join('')}
      ${dateRow('snooze', t.id, 'remindAt')}</div></div>` : '';
  const who = srcWho(t.source);
  return `<div class="card"><div class="rbh"><span class="belt">${I.bell(15)}</span><span style="flex:1"><b>${Sh.hm(t.remindAt)} 提醒</b> <span class="ss">· ${esc(why)}</span></span><button class="ib" data-a="alertClose" data-id="${t.id}" title="知道了">${I.x}</button></div>
    <div class="rbb"><div style="flex:1;min-width:0"><div class="tt" style="font-size:15px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</div>
      <div class="chips">${t.priority ? `<span class="chip p${t.priority[1]}">${t.priorityAI ? I.sp(10) : ''}${t.priority}</span>` : ''}${t.due ? `<span class="chip ddl" title="${Sh.deadlineLabel(t.due, now(), null)}">${I.clk}${deadlineLabel(t.due)}</span>` : ''}${who ? `<span class="chip per"><span class="pav" style="background:${avc(who)}">${esc(who[0])}</span>${esc(who)}</span>` : ''}</div></div>
      <div class="rbtn"><button class="done" data-a="alertDone" data-id="${t.id}">完成</button><button class="later ${ui.laterOpen ? 'on' : ''}" data-a="laterOpen">稍后 ▾</button></div></div>${later}</div>`;
}

// ---------- 一键识别：小钉卡片 → 结果 ----------
let tidyPlayback = null;
const revealedQuotes = new Set();
function tidyHtml() {
  if (ui.tidyErr) return `<div class="card"><div class="cbox"><img src="${POSE('oops')}" alt="小钉"><div style="flex:1"><b style="font-size:16px">没读成</b><div class="ss" style="margin-top:4px">${esc(ui.tidyErr)}</div></div><button class="ib" data-a="tidyClose">${I.x}</button></div></div>`;
  if (ui.tidy) return progressCard(ui.tidy);
  const r = ui.tidyResult; if (!r) return '';
  const main = r.main.filter((c) => !c._done), maybe = r.maybe.filter((c) => !c._done);
  const st = r.stats;
  if (!r.main.length && !r.maybe.length) {
    return `<div class="card"><div class="cbox"><img src="${POSE('empty')}" alt="小钉"><div style="flex:1"><b style="font-size:16px">${st.stopped ? '已停止整理' : '没找到新的待办'}</b><div class="ss" style="margin-top:4px">${st.stopped ? '可以随时重新识别。' : `读了 ${st.messages} 条消息${st.meetings ? `、${st.meetings} 场会` : ''}。`}${(st.sources || []).some(s => s.state === 'fail') ? '部分来源暂时读不到。' : ''}</div></div><button class="ib" data-a="tidyClose">${I.x}</button></div></div>`;
  }
  const sourcesRead = [st.private && `私聊 ${st.private} 条`, st.groupMsgs && `群聊 ${st.groupMsgs} 条`, st.meetings && `听记 ${st.meetings} 场`].filter(Boolean).join(' · ');
  const failed = (st.sources || []).filter((s) => s.state === 'fail');
  const coach = ui.coach === 'tidy' ? `<div class="coach">${I.sp(12)}<span>每一件你都能点标签改，<b>加入</b>才会进清单，<b>忽略</b>就不再提。</span><button class="ib" style="color:#fff;margin-left:auto" data-a="coachOff">${I.x}</button></div>` : '';
  return `${coach}<div class="card motion-results"><header class="motion-head">${art('laptop')}<div role="status"><h2>${st.stopped ? '已停止整理' : main.length + maybe.length ? `找到 ${main.length + maybe.length} 件待确认` : '这批处理好了'}</h2>
      <p class="ss">可修改属性，也可查看原话</p></div><div class="head-actions"><button class="ib" data-a="tidy" title="重新识别">${I.refresh}</button><button class="ib" data-a="tidyClose" aria-label="收起识别结果">${I.x}</button></div></header>
    ${failed.length ? `<div class="warnl"><span style="flex:1">「${failed.map((s) => s.label).join('、')}」暂时读不到，下面是其它来源的结果</span></div>` : ''}
    <div class="sum"><span class="sum-line"><span title="${esc(sourcesRead)}">已读 ${st.messages} 条${st.private === st.messages && st.messages ? '私聊' : '消息'}${st.meetings ? '、' + st.meetings + ' 场听记' : ''}</span><i aria-hidden="true"></i><b>${main.length} 件要处理</b></span></div>
    <div class="list" style="max-height:420px">${main.map((c, i) => candRow(c, { first: i === 0 })).join('') || '<div class="ss" style="padding:10px 16px">这批都处理完了</div>'}
    ${maybe.length ? `<button type="button" class="fold" data-a="maybeOpen" aria-expanded="${ui.tidyMaybeOpen}">${I.chev}可能不用管 · ${maybe.length}</button>${ui.tidyMaybeOpen ? maybe.map((c) => candRow(c)).join('') : ''}` : ''}</div>
    <div class="ft"><button class="kb2" data-a="tidyClose">稍后</button>${main.length ? `<button class="kb1" data-a="addAll">全部加入 (${main.length})</button>` : ''}</div></div>`;
}

// ---------- 便签 ----------
function noteHead() {
  return `<div class="head drag">${poseImg()}<span class="brand">AI待办</span>${connChip()}<span class="sp"></span>${tidyBtn()}<button class="kbs off nodrag" data-a="offWork" title="下班">下班</button><button class="ib nodrag" data-a="quit" title="退出 AI待办">×</button><button class="ib nodrag" data-a="collapse" title="收起">${I.up}</button></div>`;
}
function connPanelHtml() {
  if (!ui.connPanel) return '';
  const st = S.conn.state; const s = S.settings;
  if (st !== 'connected') {
    const body = st === 'not_installed'
      ? `<div class="ss">没有找到钉钉 Workspace CLI（dws）。在终端里装一下：</div><code class="cmd">npm install -g dingtalk-workspace-cli</code>`
      : `<div class="ss">${st === 'expired' ? '钉钉的授权过期了，主动提醒和一键识别先暂停。' : '连上钉钉后，小钉才能帮你从消息里找事。'}授权在钉钉的登录页完成，只读。</div>`;
    return `<div class="cpanel"><div class="cph"><span class="dk big">钉钉</span><div style="flex:1"><b>钉钉（DWS）</b><div class="ss">${st === 'expired' ? '需要重新授权' : '未连接'}</div></div></div>
      <div style="padding:8px 2px">${body}</div><div class="cpf"><button data-a="login">打开钉钉登录</button><button data-a="connect">我登好了，连接</button></div></div>`;
  }
  const row = (k, label, sub) => `<div class="cpr"><span style="flex:1">${label}${sub ? ` <span class="ss">· ${sub}</span>` : ''}</span><span class="tg ${s.sources[k] ? '' : 'off'}" data-a="src" data-k="${k}"></span></div>`;
  const groups = ui.groupsOpen ? `<div class="gl">${(S.groups || []).length ? S.groups.map((g) => `<label><input type="checkbox" data-exg="${esc(g)}" ${s.excludedGroups.includes(g) ? 'checked' : ''}>${esc(g)}</label>`).join('') : '<div class="ss">同步一次后这里会列出最近有消息的群</div>'}</div>` : '';
  const last = S.marks.lastSyncAt ? `${Sh.dayWord(S.marks.lastSyncAt)} ${Sh.hm(S.marks.lastSyncAt)} 同步` : '还没同步';
  return `<div class="cpanel"><div class="cph"><span class="dk big">钉钉</span><div style="flex:1"><b>钉钉（DWS）${S.demo ? ' · 演示数据' : ''}</b><div class="ss">已连接 · ${esc(S.me?.name || '')}${S.me?.org ? ' · ' + esc(S.me.org) : ''} · ${last}</div></div></div>
    ${row('private', '私聊')}${row('group', '群里和你有关的', s.excludedGroups.length ? `已排除 ${s.excludedGroups.length} 个群` : '')}${row('minutes', '会议听记')}${row('calendar', '日程', '用来推荐提醒时间')}
    ${groups}<div class="cpf"><button data-a="sync">立即同步</button><button data-a="groupsOpen">管理排除的群</button><button class="dis" data-a="disconnect">断开</button></div></div>`;
}
function flashHtml() {
  const f = flashInfo(); if (!f) return '';
  if (f.kind === 'urgent') return `<div class="flash">${I.ring}<span class="tx">${esc(f.text)}</span><button class="go" data-a="flashGo" data-id="${f.task.id}">去做 ›</button><i class="ubar" style="width:${f.pct}%"></i></div>`;
  return `<div class="flash blue"><span class="tx">${esc(f.text)}</span><button class="go" data-a="tidy">看看 ›</button></div>`;
}
function tabsHtml() {
  const incomplete = open();
  const pc = incomplete.filter(t => !inToday(t)).length;
  const count = viewTasks().filter(t => !t.done).length;
  const v = currentView();
  const title = viewTrigger('views', `<span>${esc(v.name)}</span><em>${count}</em>${I.chev}`, '切换视图：' + v.name, 'view-title');
  return `<div class="tabrow"><div class="todayh"${viewState.config.scope === 'today' ? ' data-dropt="today"' : ''}>${title}</div>
    <button class="poolbtn ${ui.poolOpen ? 'on' : ''}" data-a="poolToggle" data-dropt="pool" title="${ui.poolOpen ? '收起待办池' : '展开待办池'}">${ui.poolOpen ? '‹ ' : ''}待办池<em>${pc}</em>${ui.poolOpen ? '' : ' ›'}</button>
    <div class="seg"><button class="${S.settings.density !== 'detail' ? 'on' : ''}" data-a="density" data-v="simple">简洁</button><button class="${S.settings.density === 'detail' ? 'on' : ''}" data-a="density" data-v="detail">详细</button></div></div>${viewToolbar()}${viewPopup()}`;
}
function listHtml() {
  const ts = viewTasks(), view = viewState.config;
  const dropEnd = view.scope !== 'today' ? '' : `<div class="nr-end" data-dropend="today">${ts.length ? '' : '<span class="dz drag-only">拖到这里，放进今天</span>'}</div>`;
  if (view.tag && !ts.length) {
    return `<div class="emp sm"><b>这个视图还没有待办</b><div class="es">在下方新增时，会带上「${esc(view.tag)}」标签。</div></div>${dropEnd}`;
  }
  if (!ts.length) {
    const conn = S.conn.state === 'connected';
    return `<div class="emp"><img src="${POSE('empty')}" alt="小钉"><b>还没有待办</b><div class="es">${conn ? '在下面记一件事；或者让小钉从钉钉里帮你找。' : '你现在只能手动记。连上钉钉，小钉才能帮你找。'}</div>${conn ? '<button class="kbs" data-a="tidy">一键识别</button>' : '<button class="kbs" data-a="connPanel">连接钉钉</button>'}</div>${dropEnd}`;
  }
  return ts.map(t => taskRow(t)).join('') + dropEnd;
}
function poolHtml() {
  const ps = poolTasks();
  const unseen = bubbleQueue().length;
  const head = `<div class="ph"><b>待办池</b><em>${ps.filter(t => !t.done).length}</em><span class="ss">${viewState.config.scope === 'today' ? '拖到「今天」即可移入' : '点行上的「+ 今天」即可移入'}</span><span class="sp"></span>${unseen ? `<button class="cnt" data-a="poolBubbles">${unseen} 条新的</button>` : ''}<button class="ib" data-a="poolToggle" title="收起">${I.x}</button></div>`;
  const empty = !ps.length ? `<div class="emp drag-hidden"><img src="${POSE('empty')}" alt="小钉"><b>待办池是空的</b><div class="es">从「今天」拖入待办，或在下方新增。</div></div>` : '';
  const body = empty + ps.map(t => taskRow(t, { pool: true })).join('') + `<div class="nr-end" data-dropend="pool"></div>`;
  return `<div class="card pool" data-dropt="pool">${head}<div class="list pl">${body}</div><div class="pf composer"><input id="poolIn" aria-label="待办池新增标题" placeholder="记一件以后做的事，回车加入" value="${esc(ui.drafts.pool.title)}"><div id="poolTools">${composerTools('pool')}</div></div></div>`;
}
function offWorkHtml() {
  if (!ui.offWorkShow) return { k: '', h: '' };
  const dn = doneToday(); const ai = dn.filter((t) => t.originId).length; const left = open().filter(inToday).length;
  const colors = ['#3370FF', '#FFB020', '#22A06B', '#F05B6E', '#8E6CF0', '#28B5E0'];
  let conf = '';
  for (let i = 0; i < 36; i++) conf += `<i style="--dx:${Math.round(Math.random() * 140 - 70)}px;left:${Math.round(Math.random() * 100)}%;background:${colors[i % colors.length]};animation-delay:${(Math.random() * 0.6).toFixed(2)}s;animation-duration:${(1.6 + Math.random() * 1.2).toFixed(2)}s;transform:rotate(${Math.round(Math.random() * 360)}deg)"></i>`;
  const title = dn.length ? `今天完成了 <em>${dn.length}</em> 件事` : '今天辛苦了';
  const sub = dn.length ? `${ai ? `其中 ${ai} 件是小钉帮你找到的。` : ''}${left ? `还有 ${left} 件没做，明天打开还在。` : '清单都清空了。'}` : (left ? `还有 ${left} 件没做，明天打开还在。` : '');
  return { k: ui.offWorkShow, h: `<div class="offw"><div class="conf">${conf}</div><img class="bob" src="${POSE('hug')}" alt="小钉"><b class="ot">下班啦！</b><div class="on">${title}</div>${sub ? `<div class="os">${sub}</div>` : ''}<div class="ob"><button class="kb2" data-a="offWorkClose">再看看</button><button class="kb1" data-a="offWorkBye">收起，明天见</button></div></div>` };
}
function toastHtml() {
  const t = ui.toast; if (!t) return '';
  return `<div class="toast"><span class="tx2">${esc(t.text)}</span></div>`;
}

// ---------- 首次连接 ----------
function onboardHtml() {
  const o = ui.onboard; const st = S.conn.state;
  const tg = (k) => `<span class="tg ${S.settings.sources[k] ? '' : 'off'}" data-a="src" data-k="${k}"></span>`;
  if (o.step === 1) return `<div class="onb"><div class="hero"><img src="${POSE('wave')}" style="width:150px" alt="小钉"></div><div class="ot">你好，我是小钉</div>
    <div class="od">我会帮你从钉钉的群聊、私聊和会议里，把你要做的事找出来、写好。<br>每一件都由你确认，我不会替你做决定。</div>
    <button class="btnp" data-a="ob" data-v="2">连接钉钉，开始</button><button class="btns" data-a="obSkip">先不连，自己记</button></div>`;
  if (o.step === 2) return `<div class="onb"><div class="ot">我会看这些</div><div class="od">只为找出你要做的事。每一项都能关掉，以后在连接面板里也能改。</div>
    <div class="perm"><div class="pm2"><div style="flex:1"><b>私聊</b><span class="ss">别人交代你、你答应别人的</span></div>${tg('private')}</div>
    <div class="pm2"><div style="flex:1"><b>群里和你有关的</b><span class="ss">@你的、提到你名字的；可以排除某些群</span></div>${tg('group')}</div>
    <div class="pm2"><div style="flex:1"><b>会议听记</b><span class="ss">会上分给你的事</span></div>${tg('minutes')}</div>
    <div class="pm2"><div style="flex:1"><b>日程</b><span class="ss">只用来推荐提醒时间，避开你的会</span></div>${tg('calendar')}</div></div>
    <div class="nope"><b>我不会：</b>替你发消息；把内容给别人看；用你的消息训练模型。${S.llm ? '识别时，相关消息正文会发给 DeepSeek 接口判断。' : ''}</div>
    <button class="btnp" data-a="ob" data-v="3">同意并连接</button><button class="btns" data-a="ob" data-v="1">返回</button></div>`;
  if (o.step === 3) {
    // 钉钉授权 / 连接中
    if (st === 'connected' || o.connecting.length) {
      const steps = [['连上钉钉 DWS', ''], ['认识你的同事', ''], ['看看你在哪些群', ''], ['读一下本周的日程', '']];
      const k = o.connecting.length;
      return `<div class="onb"><div class="link"><span class="dk big">钉钉</span><div class="dots">${[0, 1, 2, 3, 4].map((i) => `<i class="${i <= k ? 'on' : ''}"></i>`).join('')}</div><img src="${POSE('run')}" style="width:90px" alt="小钉"></div>
        <div class="ot" style="text-align:center">正在认识你的工作…</div>
        <div class="cst">${steps.map(([s], i) => `<div class="st ${i < k ? '' : i === k ? 'ing' : 'todo'}">${i < k ? I.okg : i === k ? I.spin() : I.todo}<span>${s}</span></div>`).join('')}</div>
        <div class="ss" style="text-align:center">大约 10 秒，只做这一次。</div></div>`;
    }
    const body = st === 'not_installed'
      ? `<div class="od">这台电脑还没装钉钉 Workspace CLI（dws）。在终端里运行下面这行，装好后点「我装好了」。</div><code class="cmd">npm install -g dingtalk-workspace-cli</code><button class="btnp" data-a="obConnect">我装好了</button>`
      : st === 'checking' ? `<div class="od" style="text-align:center">${I.spin()} 正在检查钉钉…</div>`
      : `<div class="od">点下面的按钮，会打开钉钉的授权登录（经钉钉 DWS，只读）。选好组织、点授权后回到这里。</div><button class="btnp" data-a="login">打开钉钉授权</button><button class="btns" data-a="obConnect">我授权好了，继续</button>`;
    return `<div class="onb"><div class="link"><img src="${POSE('empty')}" style="width:44px" alt="小钉"><div class="dots"><i class="on"></i><i class="on"></i><i class="on"></i></div><span class="dk big">钉钉</span></div>
      <div class="ot" style="text-align:center;font-size:18px">AI待办 通过钉钉 DWS 读取你的数据</div>${body}${o.err ? `<div class="warnl">${esc(o.err)}</div>` : ''}<button class="btns" data-a="obSkip">先不连，自己记</button></div>`;
  }
  if (o.step === 4) {
    const s = o.stats || { groups: '…', atMe: '…', meetings: '…' };
    return `<div class="onb"><div class="hero"><img src="${POSE('hug')}" style="width:120px" alt="小钉"></div><div class="ot" style="text-align:center">连上了，以后我在这儿</div>
      <div class="stat"><div><b>${s.groups}</b><span>个群和你有关</span></div><div><b>${s.atMe}</b><span>条消息 @过你</span></div><div><b>${s.meetings}</b><span>场会在本周</span></div></div>
      <div class="od" style="text-align:center">要不要我先把最近 3 天的事找一遍？</div><button class="btnp" data-a="obTidy">帮我找出最近 3 天的待办</button><button class="btns" data-a="obDone">先不用，我看看</button></div>`;
  }
  return '';
}

// ---------- 总渲染 ----------
let lastSize = '';
let refreshPending = false;
let editorPointerDown = false;
let composing = false;
const activeFormField = 'input.title-edit, input[data-timein], input[data-datein], input.tag-search, #viewName';
function taskMenuRow({ id, instance }) {
  return $(`.task-instance[data-instance="${CSS.escape(instance)}"] > .nr[data-id="${CSS.escape(id)}"]`);
}
function taskPropertyAnchor(menu) {
  const row = taskMenuRow(menu);
  return row?.parentElement.querySelector(`[data-prop-anchor="${CSS.escape(menu.anchor || 'more')}"]`) || row?.querySelector('.row-more');
}
function closeTaskProperty(restoreFocus = false) {
  if (!isTaskProperty(ui.menu)) return;
  const anchor = taskPropertyAnchor(ui.menu);
  ui.menu = null;
  $('#taskPopover').replaceChildren();
  anchor?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) anchor?.focus({ preventScroll: true });
  requestAnimationFrame(reportSize);
}
function positionTaskPopover() {
  const layer = $('#taskPopover');
  const popup = layer.firstElementChild;
  if (!popup || !isTaskProperty(ui.menu)) return;
  const anchor = taskPropertyAnchor(ui.menu);
  if (!anchor) { closeTaskProperty(); return; }
  const a = anchor.getBoundingClientRect();
  const list = anchor.closest('.list')?.getBoundingClientRect();
  if (list && (a.bottom <= list.top || a.top >= list.bottom)) { closeTaskProperty(); return; }
  const pane = anchor.closest('#note,#panel').getBoundingClientRect();
  const width = popup.offsetWidth, height = popup.offsetHeight;
  const left = anchor.dataset.propAnchor === 'more' ? a.right - width : a.left;
  const below = a.bottom + 4, above = a.top - height - 4;
  const bottomLimit = screen.availHeight - 36;
  layer.style.left = Math.max(pane.left + 8, Math.min(left, pane.right - width - 8)) + 'px';
  layer.style.top = (below + height <= bottomLimit ? below : above >= 8 ? above : Math.max(8, bottomLimit - height)) + 'px';
}
function render() {
  if (!S) return;
  if (ui.drag || editorPointerDown || composing) { refreshPending = true; return; }
  refreshPending = false;
  const search = document.activeElement?.matches('.tag-search') ? document.activeElement : null;
  const focusedCheck = document.activeElement?.matches('.ck') ? document.activeElement : null;
  const app = $('#app'); app.classList.toggle('right', S.side === 'right');
  if (ui.menu?.k === 'tags' && !isTaskProperty(ui.menu)) app.style.setProperty('--tag-panel-height', (screen.availHeight - 40) + 'px');
  const tidyLeft = !!(ui.tidy || ui.tidyResult || ui.tidyErr);
  app.classList.toggle('tidy-left', tidyLeft);
  if (tidyLeft) {
    app.style.setProperty('--tidy-panel-height', Math.max(160, screen.availHeight - 44) + 'px');
    app.style.setProperty('--tidy-panel-width', Math.max(170, Math.min(460, screen.availWidth - 452)) + 'px');
  }
  const onboarding = !S.settings.onboarded;
  // 便签
  const note = $('#note');
  if (onboarding) {
    note.innerHTML = `<div class="card">${onboardHtml()}</div>`;
  } else if (!ui.expanded) {
    const f = flashInfo();
    const unseen = bubbleQueue().length;
    const sub = ui.tidy ? '' : f ? `<span class="bsub ${f.kind === 'urgent' ? 'warn' : ''}">${esc(f.kind === 'urgent' ? f.task.title.slice(0, 8) + ' ' + f.short : f.short)}</span>`
      : ui.offWork ? '<span class="bsub ok">下班啦</span>' : '';
    const cnt = ui.bubbleHidden && unseen ? `<button class="cnt nodrag" data-a="bubbleShow">${unseen} 条新的</button>` : '';
    const under = currentAlert() ? alertHtml() : bubbleHtml();
    note.innerHTML = `<div class="card bar"><div class="head drag" style="padding:0">${poseImg()}<span class="brand" data-a="expand" style="cursor:pointer">AI待办</span>${connChip(!!(sub || cnt))}<span class="sp"></span>${sub}${cnt}${tidyBtn()}<button class="ib nodrag" data-a="expand" title="展开">${I.down}</button></div></div>${connPanelInBar()}${ui.tidy || ui.tidyResult || ui.tidyErr ? '' : under}`;
  } else {
    if (!note.querySelector('.ibox input')) {
      note.innerHTML = `<div class="card" id="noteCard"><div id="nHead"></div><div id="nConn"></div><div id="nFlash"></div><div id="nTabs"></div><div id="nList" class="list"></div><div class="ibar" id="todayComposer"><div class="ibox"><input id="manual" aria-label="今天新增标题" placeholder="记一件事，回车加进今天"></div><div id="manualTools"></div><div id="nToast"></div></div><div id="nOff"></div></div>`;
    }
    $('#nHead').innerHTML = noteHead();
    $('#nConn').innerHTML = connPanelHtml();
    $('#nFlash').innerHTML = flashHtml();
    const tabs = $('#nTabs'), markup = tabsHtml();
    if (tabs._markup !== markup || (viewState.menu && !tabs.querySelector('.view-popup'))) {
      tabs.innerHTML = markup; tabs._markup = markup;
    }
    const scroll = $('#nList').scrollTop;
    $('#nList').innerHTML = listHtml();
    $('#nList').scrollTop = scroll;
    $('#nToast').innerHTML = toastHtml();
    const off = offWorkHtml(); if ($('#nOff').dataset.k !== off.k) { $('#nOff').innerHTML = off.h; $('#nOff').dataset.k = off.k; }
    positionViewPopup();
    renderTodayTools();
    const manual = $('#manual'), c = viewState.config;
    manual.placeholder = c.tag ? `记一件「${c.tag}」的事，回车加入` : c.scope === 'today' ? '记一件事，回车加进今天' : '记一件事，回车加入';
    manual.setAttribute('aria-label', c.scope === 'today' ? '今天新增标题' : '全部待办新增标题');
    if ($('#manual').value !== ui.drafts.today.title) $('#manual').value = ui.drafts.today.title;
  }
  if (!ui.expanded && !onboarding && ui.toast) note.insertAdjacentHTML('beforeend', `<div class="card" style="padding:0 10px 10px">${toastHtml()}</div>`);
  // 左边：识别卡 / 提醒 / 气泡（展开时）
  const panel = $('#panel');
  let ph = '';
  if (ui.tidy || ui.tidyResult || ui.tidyErr) ph = tidyHtml() + (ui.expanded && !onboarding && ui.poolOpen ? poolHtml() : '');
  else if (ui.expanded && !onboarding && ui.poolOpen) ph = (currentAlert() ? alertHtml() : '') + poolHtml();
  else if (ui.expanded && !onboarding) ph = currentAlert() ? alertHtml() : bubbleHtml();
  const pin = $('#poolIn'); const pinFocus = pin && document.activeElement === pin;
  const plScroll = $('#panel .pl')?.scrollTop || 0;
  if (!tidyLeft || panel._tidyMarkup !== ph) {
    const previous = evidencePositions(panel);
    const extracting = !!panel.querySelector('.motion-progress[data-stage="think"]');
    const hadResult = !!panel.querySelector('.motion-results');
    const resultScroll = panel.querySelector('.motion-results .list')?.scrollTop || 0;
    panel.innerHTML = ph;
    if (tidyLeft) animateTidyPanel(panel, previous, extracting, hadResult);
    if (resultScroll && hadResult) {
      const list = panel.querySelector('.motion-results .list');
      if (list) list.scrollTop = resultScroll;
    }
  }
  panel._tidyMarkup = tidyLeft ? ph : null;
  const pin2 = $('#poolIn'); if (pin2) { pin2.value = ui.drafts.pool.title; if (pinFocus) { pin2.focus(); pin2.setSelectionRange(pin.selectionStart, pin.selectionEnd); } }
  const pl2 = $('#panel .pl'); if (pl2) pl2.scrollTop = plScroll;
  if (focusedCheck) $(`[data-instance="${CSS.escape(rowInstance(focusedCheck))}"] .ck[data-id="${CSS.escape(focusedCheck.dataset.id)}"]`)?.focus({ preventScroll: true });
  // 编辑框聚焦
  const ed = $('input.title-edit'); if (ed && document.activeElement !== ed) { ed.focus(); if (ui.focusEdit) ed.select(); else ed.setSelectionRange(ed.value.length, ed.value.length); ui.focusEdit = false; }
  // 移除当前分组标签时，这一处任务行可能随即消失。
  if (ui.menu?.scope === 'task' && !taskMenuRow(ui.menu)) {
    ui.menu = null;
  }
  const popover = $('#taskPopover');
  popover.innerHTML = isTaskProperty(ui.menu) ? menuHtml(ui.menu.k, taskById(ui.menu.id), 'task') : '';
  positionTaskPopover();
  const newSearch = $('.tag-search');
  if (newSearch && (ui.menu?.focusSearch || search)) {
    newSearch.focus();
    if (search && search.value === newSearch.value) newSearch.setSelectionRange(search.selectionStart, search.selectionEnd);
    ui.menu.focusSearch = false;
  }
  if (ui.menu?.focusOptions) {
    ui.menu.focusOptions = false;
    $('.mi', popover)?.focus({ preventScroll: true });
  }
  if (newSearch && ui.menu?.reveal) {
    ui.menu.reveal = false;
    const list = newSearch.closest('.list');
    if (list) {
      const bounds = list.getBoundingClientRect();
      const menu = newSearch.closest('.menu').getBoundingClientRect();
      const offset = menu.bottom > bounds.bottom ? Math.min(menu.bottom - bounds.bottom + 6, menu.top - bounds.top) : Math.min(0, menu.top - bounds.top);
      list.scrollTop += offset;
    }
  }
  requestAnimationFrame(reportSize);
}
function connPanelInBar() { return ui.connPanel ? `<div class="card" style="padding-top:8px">${connPanelHtml()}</div>` : ''; }
function reportSize() {
  const n = $('#note').getBoundingClientRect(); const p = $('#panel');
  const pr = p.innerHTML ? p.getBoundingClientRect() : { width: 0, height: 0 };
  const menuBottom = $('#taskPopover').firstElementChild?.getBoundingClientRect().bottom || 0;
  const noteHeight = Math.max(n.height, menuBottom);
  const tidyLeft = $('#app').classList.contains('tidy-left');
  const key = [n.width, noteHeight, pr.width, pr.height, Number(tidyLeft)].map(Math.ceil).join(',');
  if (key === lastSize) return; lastSize = key;
  A('layout', { tidyLeft, noteW: Math.ceil(n.width), noteH: Math.ceil(noteHeight) + 24, panelW: Math.ceil(pr.width), panelH: Math.ceil(pr.height) + 24 });
}
new ResizeObserver(() => requestAnimationFrame(reportSize)).observe(document.body);
document.addEventListener('scroll', (event) => {
  if (!isTaskProperty(ui.menu) || !event.target.matches?.('.list')) return;
  positionTaskPopover();
  requestAnimationFrame(reportSize);
}, true);

// ---------- 提示条 / 撤销 ----------
function rememberUndo(undo) {
  if (ui.undoing) return;
  ui.undoStack.push(undo); if (ui.undoStack.length > 50) ui.undoStack.shift();
}
function toast(text, undo) {
  clearTimeout(ui.toastTimer);
  if (undo) { rememberUndo(undo); ui.toast = null; render(); return; }
  ui.toast = { text };
  ui.toastTimer = setTimeout(() => { ui.toast = null; render(); }, 4000);
  render();
}
// ---------- 动作 ----------
async function addCand(id, el) {
  const c = candById(id); if (!c) return;
  const movement = arrivalSnapshot([id]);
  const edits = ui.edits[id];
  const t = await A('add', id, edits || {});
  if (!t) return;
  delete ui.edits[id];
  if (ui.tidyResult) {
    markTidy(id);
    ui.expanded = true;
  }
  rememberUndo(async () => { if (edits) ui.edits[id] = edits; await A('unadd', t.id); unmarkTidy(id); });
  render();
  landInToday(movement, [t]);
}
async function ignoreCand(id, el) {
  const c = candById(id); if (!c) return;
  el?.closest('.urow')?.classList.add('out');
  await A('ignore', id);
  if (ui.tidyResult) markTidy(id);
  toast(`已忽略「${c.title}」`, async () => { await A('unignore', id); unmarkTidy(id); });
}
function markTidy(...ids) {
  const result = ui.tidyResult;
  const candidates = [...result.main, ...result.maybe];
  for (const candidate of candidates) {
    if (ids.includes(candidate.id)) candidate._done = true;
  }
  if (candidates.some(c => !c._done)) return;
  // Keep both columns in place until the final title lands in the list.
  setTimeout(() => {
    if (ui.tidyResult !== result || candidates.some(c => !c._done)) return;
    ui.tidyResult = null; render();
  }, ids.length > 1 ? 1050 : 800);
}
function unmarkTidy(id) { if (!ui.tidyResult) return; for (const k of ['main', 'maybe']) (ui.tidyResult[k] || []).forEach((c) => { if (c.id === id) c._done = false; }); render(); }

async function runTidy(opts) {
  if (tidyPlayback) return;
  revealedQuotes.clear();
  const playback = new TidyPlayback(p => { ui.tidy = p; refreshFromState(); });
  tidyPlayback = playback;
  ui.tidyErr = null; ui.tidyResult = null; ui.coach = null;
  ui.tidy = playback.progress; render();
  try {
    const r = await A('tidy', opts);
    await playback.finish(r);
    ui.tidy = null;
    if (r && playback.stopped) r.stats.stopped = true;
    if (r) { ui.tidyResult = r; if (!S.settings.tips.tidy) { ui.coach = 'tidy'; A('settings', { tips: { tidy: true } }); } }
  } catch (e) { ui.tidy = null; ui.tidyErr = e.kind === 'not_logged_in' || e.kind === 'expired' ? '钉钉还没授权，点头部的连接状态重新授权。' : e.message; }
  playback.stop(); tidyPlayback = null;
  render();
}

async function pick(scope, id, f, v) {
  const menu = ui.menu;
  const val = v === '' ? null : f === 'priority' ? v : Number(v);
  if (scope === 'draft') { ui.drafts[id][f] = val; ui.menu = null; ui.dateInput = null; render(); return; }
  if (scope === 'cand') {
    ui.edits[id] = { ...(ui.edits[id] || {}), [f]: val };
  } else {
    const patch = { [f]: val };
    await A('update', id, patch);
  }
  if (ui.menu !== menu) return;
  if (isTaskProperty(menu)) { closeTaskProperty(true); return; }
  ui.menu = null; ui.dateInput = null; render();
}

async function toggleTag(el) {
  const menu = ui.menu;
  if (!menu) return;
  const { id, scope } = menu;
  const name = el.dataset.tag;
  menu.query = '';
  menu.focusSearch = true;
  try {
    if (scope === 'task') {
      const task = await A('toggleTag', id, name);
      if (task) rememberUndo(() => A('toggleTag', id, name));
    } else {
      const entry = scope === 'draft' ? ui.drafts[id] : (ui.edits[id] ||= {});
      const tags = scope === 'draft' ? draftTags(id) : entry.tags || [];
      entry.tags = tags.includes(name) ? tags.filter((tag) => tag !== name) : [...tags, name];
      if (!S.tagLibrary.includes(name)) {
        await A('registerTag', name);
        if (!S.tagLibrary.includes(name)) S.tagLibrary.push(name);
      }
    }
    render();
  } catch (error) { toast('标签未保存：' + error.message); }
}

const handlers = {
  viewMenu: toggleViewMenu,
  viewPick: pickViewOption,
  closeTodayOptions: () => setTodayOptions(false),
  quit: () => A('quit'),
  submitDraft: (el) => submitDraft(el.dataset.where),
  expand: () => { ui.expanded = true; ui.connPanel = false; render(); },
  poolToggle: () => { ui.poolOpen = !ui.poolOpen; ui.menu = null; render(); },
  poolBubbles: () => { ui.poolOpen = false; ui.bubbleHidden = false; render(); },
  offWork: () => { ui.offWork = true; ui.offWorkShow = Date.now(); render(); },
  offWorkClose: () => { ui.offWorkShow = 0; render(); },
  offWorkBye: () => { ui.offWorkShow = 0; ui.expanded = false; ui.connPanel = false; ui.menu = null; render(); },
  collapse: () => { ui.expanded = false; ui.connPanel = false; ui.menu = null; render(); },
  connPanel: () => { ui.connPanel = !ui.connPanel; render(); },
  groupsOpen: () => { ui.groupsOpen = !ui.groupsOpen; render(); },
  connect: async () => { if (S.conn.state === 'connected') return; ui.connPanel = true; render(); await A('reconnect'); },
  login: () => A('openTerminalLogin'),
  disconnect: async () => { await A('disconnect'); ui.connPanel = false; toast('已断开钉钉，清单保留，可以手动记'); },
  sync: async () => { toast('正在同步…'); await A('sync'); toast('同步好了'); },
  src: (el) => { const k = el.dataset.k; A('settings', { sources: { [k]: !S.settings.sources[k] } }); },
  density: (el) => A('settings', { density: el.dataset.v }),
  tidy: () => { if (!ui.tidy) runTidy(); },
  tidyStop: () => {
    tidyPlayback?.stop();
    if (ui.tidy) { ui.tidy.stopping = true; render(); }
    return A('cancelTidy');
  },
  tidyQuote: el => {
    const id = el.dataset.id;
    if (revealedQuotes.has(id)) revealedQuotes.delete(id); else revealedQuotes.add(id);
    render();
    document.querySelector(`[data-a="tidyQuote"][data-id="${CSS.escape(id)}"]`)?.focus({preventScroll:true});
  },
  tidyClose: () => { ui.tidyResult = null; ui.tidyErr = null; ui.coach = null; render(); },
  coachOff: () => { ui.coach = null; render(); },
  maybeOpen: () => { ui.tidyMaybeOpen = !ui.tidyMaybeOpen; render(); },
  addAll: async () => {
    const result = ui.tidyResult;
    if (!result) return;
    const ids = result.main.filter((c) => !c._done).map((c) => c.id);
    const edits = Object.fromEntries(ids.filter((id) => ui.edits[id]).map((id) => [id, ui.edits[id]]));
    const movement = arrivalSnapshot(ids);
    const tasks = await A('addAll', ids, edits);
    for (const { originId } of tasks) delete ui.edits[originId];
    if (tasks.length && ui.tidyResult === result) markTidy(...tasks.map(t => t.originId));
    ui.expanded = true;
    if (tasks.length) rememberUndo(async () => {
      for (const task of tasks) await A('unadd', task.id);
      Object.assign(ui.edits, edits);
      if (ui.tidyResult === result) for (const task of tasks) unmarkTidy(task.originId);
    });
    render();
    landInToday(movement, tasks);
  },
  add: (el) => addCand(el.dataset.id, el),
  ignore: (el) => ignoreCand(el.dataset.id, el),
  bubbleClose: (el) => { A('bubbleSeen', el.dataset.id); },
  bubbleShow: () => { ui.bubbleHidden = false; armBubbleTimer(); render(); },
  menu: (el) => {
    const { id, k, scope = 'task', propAnchor: anchor } = el.dataset;
    clearTimeout(titleClickTimer);
    const instance = rowInstance(el);
    const previous = ui.menu;
    const same = previous?.id === id && previous.k === k && previous.scope === scope && previous.instance === instance && previous.anchor === anchor;
    if (same && isTaskProperty(previous)) { closeTaskProperty(true); return; }
    ui.menu = same ? null : { id, k, scope, instance, anchor, query: '', focusSearch: k === 'tags', focusOptions: !!anchor && k !== 'tags', reveal: !anchor };
    ui.dateInput = null; render();
    const tin = $('input.tin[data-timein]'); if (tin) tin.focus();
  },
  taskProperty: (el) => {
    if (!isTaskProperty(ui.menu)) return;
    const k = el.dataset.k;
    Object.assign(ui.menu, { k, query: '', focusSearch: k === 'tags', focusOptions: k === 'pri' });
    render();
  },
  closeTaskProperty: () => closeTaskProperty(true),
  toggleTag,
  pick: (el) => pick(el.dataset.scope, el.dataset.id, el.dataset.f, el.dataset.v),
  dateInput: (el) => { ui.dateInput = el.dataset.key; render(); },
  dateOk: (el) => {
    const key = el.dataset.key; const inp = document.querySelector(`[data-datein="${key}"]`);
    const [scope, ...parts] = key.split(':');
    const f = parts.pop();
    const id = parts.join(':');
    const v = inp?.value ? Date.parse(inp.value) : NaN;
    if (!Number.isFinite(v)) return;
    if (scope === 'snooze') { ui.laterOpen = false; ui.dateInput = null; A('snooze', id, v); return; }
    pick(scope, id, f, String(v));
  },
  check: async (el) => {
    const t = taskById(el.dataset.id); if (!t) return;
    await A('update', t.id, { done: !t.done });
    if (!t.done) toast(`已完成「${t.title}」`, () => A('update', t.id, { done: false }));
  },
  openRow: (el) => { clearTimeout(titleClickTimer); const id = el.dataset.id, instance = rowInstance(el); titleClickTimer = setTimeout(() => { ui.openRow = ui.openRow === id && ui.openInstance === instance ? null : id; ui.openInstance = instance; ui.menu = null; render(); }, 550); },
  copy: (el) => { const t = taskById(el.dataset.id); A('copy', t?.title || ''); toast('已复制'); },
  remove: async (el) => { const t = await A('remove', el.dataset.id); ui.openRow = null; if (t) toast(`已删除「${t.title}」`, () => A('restore', t)); },
  openDingTalk: () => A('openDingTalk'),
  toToday: async (el) => { await A('move', el.dataset.id, { list: 'today' }); toast('已移到今天'); },
  undo: async () => { if (ui.undoing) return; const u = ui.undoStack.pop(); if (!u) return; ui.undoing = true; try { await u(); } catch (e) { ui.undoStack.push(u); toast('未能撤销：' + e.message); } finally { ui.undoing = false; render(); } },
  flashGo: (el) => { ui.expanded = true; changeView(Views.builtins[inToday(taskById(el.dataset.id) || {}) ? 0 : 1]); ui.openRow = el.dataset.id; ui.openInstance = 'main'; render(); },
  alertDone: async (el) => { const id = el.dataset.id; await A('update', id, { done: true }); await A('dismissAlert', id); ui.laterOpen = false; toast('已完成', () => A('update', id, { done: false })); },
  alertClose: (el) => { A('dismissAlert', el.dataset.id); ui.laterOpen = false; },
  laterOpen: () => { ui.laterOpen = !ui.laterOpen; render(); },
  snooze: async (el) => { ui.laterOpen = false; await A('snooze', el.dataset.id, Number(el.dataset.v)); toast(`好，${Sh.remindWord(Number(el.dataset.v))} 再提醒你`); },
  // 首次连接
  ob: (el) => { ui.onboard.step = Number(el.dataset.v); ui.onboard.err = null; render(); if (ui.onboard.step === 3) obConnect(); },
  obConnect: () => obConnect(),
  obSkip: async () => { await A('disconnect'); await A('settings', { onboarded: true }); ui.expanded = true; render(); },
  obTidy: async () => { await A('settings', { onboarded: true }); ui.expanded = true; render(); runTidy({ days: 3 }); },
  obDone: async () => { await A('settings', { onboarded: true }); ui.expanded = true; render(); },
};
async function obConnect() {
  const o = ui.onboard; o.err = null; render();
  const c = await A('reconnect');
  if (c.state !== 'connected') { o.err = c.state === 'not_installed' ? null : c.state === 'checking' ? null : (c.error ? '还没连上：' + c.error.slice(0, 80) : null); render(); return; }
  o.connecting = [];
  const statsP = A('onboardStats').catch(() => ({ groups: '—', atMe: '—', meetings: '—' }));
  for (let i = 1; i <= 4; i++) { await new Promise((r) => setTimeout(r, 700)); o.connecting.push(i); render(); }
  o.stats = await statsP; o.step = 4; render();
}

function renderTodayTools() {
  const tools = $('#manualTools');
  if (!tools) return;
  tools.innerHTML = ui.todayOptions
    ? `<div class="composer-secondary-head"><span>设置这件事</span><button class="ib" data-a="closeTodayOptions" aria-label="收起新增属性">${I.up}</button></div>` + composerTools('today')
    : '';
}

function setTodayOptions(show) {
  if (show === ui.todayOptions) return;
  ui.todayOptions = show;
  if (!show && ui.menu?.scope === 'draft' && ui.menu.id === 'today') {
    ui.menu = null;
    ui.dateInput = null;
  }
  renderTodayTools();
  requestAnimationFrame(reportSize);
}

function draftTags(where) {
  const tag = where === 'today' && viewState.config.tag;
  return ui.drafts[where].tags ?? (tag ? [tag] : []);
}
function composerTools(where) {
  const d = ui.drafts[where];
  const button = (k, text, tone = '') => `<button class="draft-chip${tone ? ' ' + tone : ''}" data-a="menu" data-k="${k}" data-scope="draft" data-id="${where}">${text}</button>`;
  const rec = 'remindAt' in d ? null : Sh.recommendRemind(d.due, now(), S.settings);
  const remind = d.remindAt ? Sh.remindWord(d.remindAt) + ' 提醒'
    : rec ? Sh.remindWord(rec.at) + ' 推荐提醒' : d.remindAt === null ? '不提醒' : '+ 提醒';
  const labels = tagSummary(draftTags(where), `data-a="menu" data-k="tags" data-scope="draft" data-id="${where}"`, true) || button('tags', '+ 标签');
  const due = d.due ? button('due', deadlineLabel(d.due), 'ddl') : button('due', '+ 截止');
  let h = `<div class="draft-tools">${button('pri', d.priority || '+ 优先级')}${labels}${due}${button('rem', remind)}<button class="draft-add" data-a="submitDraft" data-where="${where}" ${ui.submitting[where] ? 'disabled' : ''}>加入</button></div>`;
  if (ui.menu?.scope === 'draft' && ui.menu.id === where) h += menuHtml(ui.menu.k, { ...d, id: where }, 'draft');
  return h;
}
async function submitDraft(where) {
  const d = ui.drafts[where]; if (!d.title.trim() || ui.submitting[where]) return;
  ui.submitting[where] = true;
  try {
    const target = where === 'today' && viewState.config.scope === 'today' ? 'today' : 'pool';
    const task = await A('addManual', d.title, target, { ...d, tags: draftTags(where) });
    if (!task?.id) throw new Error('没有保存成功，请重试');
    ui.drafts[where] = { title: '' }; ui.menu = null; if (where === 'today') ui.todayOptions = false;
    rememberUndo(() => A('remove', task.id));
  } catch (e) { toast('未添加：' + e.message); }
  finally { ui.submitting[where] = false; render(); }
}
document.addEventListener('input', e => {
  if (e.target.id === 'viewName') viewState.name = e.target.value;
  if (e.target.matches('.tag-search') && ui.menu) {
    ui.menu.query = e.target.value;
    const picker = e.target.closest('.tag-picker');
    $('[data-tag-section]', picker).textContent = Sh.tagName(e.target.value) ? '搜索结果' : '可用标签';
    $('.tag-options', picker).innerHTML = tagOptions(ui.menu);
    positionTaskPopover();
    requestAnimationFrame(reportSize);
  }
  if (e.target.matches('input.title-edit')) ui.titleDrafts[e.target.dataset.edit] = e.target.value;
  if (e.target.id === 'manual') {
    ui.drafts.today.title = e.target.value;
    setTodayOptions(true);
  }
  if (e.target.id === 'poolIn') ui.drafts.pool.title = e.target.value;
});
document.addEventListener('focusin', (e) => {
  if (e.target.id === 'manual') setTodayOptions(true);
  else if (e.target !== document.body && !e.target.closest('#todayComposer')) setTodayOptions(false);
});

let titleClickTimer;
function editTitle(id, instance) {
  ui.editInstance = instance;
  const t = taskById(id); if (!t) return;
  clearTimeout(titleClickTimer); ui.editRow = id; ui.titleDrafts[id] = t.title;
  ui.focusEdit = true; ui.openRow = null; ui.menu = null; render();
}
async function saveTitle(input) {
  const id = input.dataset.edit; if (ui.editRow !== id) return;
  const title = input.value.trim(); ui.editRow = null;
  try { const before = taskById(id)?.title; if (title && title !== before) { await A('update', id, { title }); rememberUndo(() => A('update', id, { title: before })); } delete ui.titleDrafts[id]; }
  catch (e) { toast('未保存：' + e.message); }
  render();
}
document.addEventListener('dblclick', e => {
  const title = e.target.closest('[data-title]');
  if (title) { e.preventDefault(); editTitle(title.dataset.title, rowInstance(title)); }
});
document.addEventListener('focusout', e => { if (e.target.matches('input.title-edit')) saveTitle(e.target); });

// ---------- 事件 ----------
document.addEventListener('click', (e) => {
  if (!e.target.closest('.view-popup,[data-a="viewMenu"]')) closeViewMenu();
  if (e.target.id === 'manual') setTodayOptions(true);
  else if (!e.target.closest('#todayComposer')) setTodayOptions(false);
  const el = e.target.closest('[data-a]');
  if (isTaskProperty(ui.menu) && !e.target.closest('#taskPopover') && el?.dataset.a !== 'menu') closeTaskProperty();
  if (!el) { if (ui.menu && !e.target.closest('.menu')) { ui.menu = null; render(); } return; }
  const h = handlers[el.dataset.a]; if (h) { e.stopPropagation(); h(el, e); }
});
document.addEventListener('mouseover', (e) => { ui.bubbleHover = !!e.target.closest('[data-bubble]'); });
document.addEventListener('keydown', async (e) => {
  if (e.isComposing || e.keyCode === 229) return;
  const t = e.target;
  if (viewState.menu && e.key === 'Escape') {
    e.preventDefault(); closeViewMenu(true); return;
  }
  if (isTaskProperty(ui.menu) && e.key === 'Escape') {
    e.preventDefault(); closeTaskProperty(true); return;
  }
  if (t.closest('.view-popup') && ['ArrowDown', 'ArrowUp'].includes(e.key)) {
    const options = [...document.querySelectorAll('.view-item')];
    if (options.length) {
      e.preventDefault();
      options[(options.indexOf(t) + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length].focus();
    }
    return;
  }
  if (t.closest('.tag-picker')) {
    const picker = t.closest('.tag-picker');
    if (e.key === 'Escape' && ui.menu) {
      e.preventDefault();
      const { id, scope, instance } = ui.menu;
      ui.menu = null; render();
      if (scope === 'draft') $(id === 'today' ? '#manual' : '#poolIn')?.focus();
      else if (scope === 'task') document.querySelector(`[data-instance="${CSS.escape(instance)}"] [data-title="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
      return;
    }
    const options = [...picker.querySelectorAll('.tag-option')];
    if (t.matches('.tag-search') && e.key === 'Enter') {
      e.preventDefault();
      if (Sh.tagName(t.value)) options[0]?.click();
      return;
    }
    if (['ArrowDown', 'ArrowUp'].includes(e.key) && options.length) {
      e.preventDefault();
      const index = options.indexOf(t);
      const next = index + (e.key === 'ArrowDown' ? 1 : -1);
      (next < 0 ? picker.querySelector('.tag-search') : options[Math.min(next, options.length - 1)]).focus();
      return;
    }
  }
  if (['manual', 'poolIn'].includes(t.id)) {
    const where = t.id === 'manual' ? 'today' : 'pool';
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); await submitDraft(where); }
    if (e.key === 'Escape') {
      ui.drafts[where] = { title: '' };
      t.value = '';
      ui.menu = null;
      ui.dateInput = null;
      if (where === 'today') ui.todayOptions = false;
      render();
    }
  }
  if (t.matches('input.title-edit')) {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); await saveTitle(t); }
    if (e.key === 'Escape') { e.preventDefault(); ui.editRow = null; delete ui.titleDrafts[t.dataset.edit]; render(); }
  }
  if (t.dataset.title && e.key === 'F2') { e.preventDefault(); editTitle(t.dataset.title, rowInstance(t)); }
  if (t.dataset.title && ['Delete', 'Backspace'].includes(e.key)) { e.preventDefault(); handlers.remove(t); }
  if (t.dataset.title && e.key === 'Enter') handlers.openRow(t);
  if (t.matches('input[data-timein]') && e.key === 'Enter' && !e.isComposing) {
    const [scope, ...parts] = t.dataset.timein.split(':');
    const id = parts.join(':');
    const at = await A('parseTime', t.value);
    if (at) pick(scope, id, 'remindAt', String(at)); else { t.value = ''; t.placeholder = '没认出来，换个说法试试'; }
  }
  if (e.key === 'Escape' && ui.menu) { ui.menu = null; render(); }
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && ui.undoStack.length && !(t.matches('input, textarea') && t.value) && !t.isContentEditable) { e.preventDefault(); handlers.undo(); }
});
document.addEventListener('change', (e) => {
  const g = e.target.dataset?.exg;
  if (g != null) { const ex = new Set(S.settings.excludedGroups); e.target.checked ? ex.add(g) : ex.delete(g); A('settings', { excludedGroups: [...ex] }); }
});

// 拖拽：清单里的行、气泡 / 识别结果里的行
function endDrag() {
  if (!ui.drag) return;
  ui.drag = null;
  $('#app').classList.remove('is-dragging');
  document.querySelectorAll('.dragging,.dropbefore,.drop').forEach((el) => el.classList.remove('dragging', 'dropbefore', 'drop'));
}
document.addEventListener('dragstart', (e) => {
  const el = e.target.closest('[data-drag][draggable="true"]');
  if (!el) return;
  clearTimeout(titleClickTimer);
  closeTaskProperty();
  const drag = { type: el.dataset.drag, id: el.dataset.id };
  ui.drag = drag;
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', drag.id);
  requestAnimationFrame(() => {
    if (ui.drag !== drag) return;
    $('#app').classList.add('is-dragging');
    el.classList.add('dragging');
    reportSize();
  });
});
document.addEventListener('dragend', () => { endDrag(); render(); });
function dropPlan(e, drag) {
  const target = e.target.closest('.nr[data-drag="task"], [data-dropt], [data-dropend]');
  if (!target) return null;
  const before = target.matches('.nr') ? taskById(target.dataset.id) : null;
  if (before?.id === drag.id) return null;
  const list = before?.list || target.dataset.dropend || target.dataset.dropt;
  if (!list) return null;

  // 汇总清单里的排序只改变展示。跨清单移动必须有明确的「今天」或「待办池」目标。
  if (target.closest('#nList')) {
    const config = viewState.config;
    const from = drag.type === 'task' ? taskById(drag.id)?.list : null;
    if (config.scope === 'all' && (from !== list || config.sort !== 'manual')) return null;
    if (config.sort !== 'manual') return from === list ? null : { target, list };
  }
  return { target, list, beforeId: before?.id };
}
document.addEventListener('dragover', (e) => {
  if (!ui.drag) return;
  const tg = dropPlan(e, ui.drag)?.target;
  document.querySelectorAll('.dropbefore,.drop').forEach((x) => x !== tg && x.classList.remove('dropbefore', 'drop'));
  if (!tg) return;
  e.preventDefault();
  if (tg.matches('.nr')) tg.classList.add('dropbefore'); else tg.classList.add('drop');
});
document.addEventListener('drop', async (e) => {
  const drag = ui.drag;
  if (!drag) return;
  const plan = dropPlan(e, drag);
  endDrag();
  if (!plan) { render(); return; }
  const { target, list, beforeId } = plan;
  e.preventDefault();
  try {
    let task = taskById(drag.id);
    if (drag.type === 'cand') {
      const edits = ui.edits[drag.id];
      task = await A('add', drag.id, edits);
      if (!task) return;
      delete ui.edits[drag.id];
      if (ui.tidyResult) markTidy(drag.id);
      rememberUndo(async () => { if (edits) ui.edits[drag.id] = edits; await A('unadd', task.id); unmarkTidy(drag.id); });
    }
    if (!task) return;
    if (beforeId || target.dataset.dropend || list !== task.list) {
      await A('move', task.id, { list, beforeId });
    }
  } catch (error) {
    toast('拖放未完成：' + error.message);
  } finally { render(); }
});

// ---------- 启动 ----------
function refreshFromState() {
  if (ui.editRow || document.activeElement?.matches(activeFormField)) { refreshPending = true; return; }
  render();
}
// Let a click on another control finish before replacing the editor's DOM on blur.
document.addEventListener('pointerdown', () => {
  editorPointerDown = !!document.activeElement?.matches(activeFormField);
}, true);
function releaseEditor() {
  if (!editorPointerDown) return;
  setTimeout(() => {
    editorPointerDown = false;
    if (refreshPending) refreshFromState();
  }, 0);
}
document.addEventListener('pointerup', releaseEditor, true);
document.addEventListener('pointercancel', releaseEditor, true);
window.addEventListener('blur', releaseEditor);
document.addEventListener('compositionstart', () => { composing = true; });
document.addEventListener('compositionend', () => {
  composing = false;
  if (refreshPending) setTimeout(refreshFromState, 0);
});
document.addEventListener('focusout', () => {
  if (refreshPending) setTimeout(() => { if (refreshPending) refreshFromState(); }, 0);
});
window.xd.on('state', (s) => { S = s; refreshFromState(); });
window.xd.on('tidy', p => { if (p) tidyPlayback?.update(p); });
window.xd.on('side', (side) => {
  if (S) S.side = side;
  $('#app').classList.toggle('right', side === 'right');
  positionTaskPopover();
});
(async () => {
  S = await A('state');
  if (S.settings.onboarded) ui.expanded = true;
  render();
  setInterval(refreshFromState, 30e3);
})();
