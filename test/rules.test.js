// npm test：截止标签、推荐提醒，以及待办清单和引擎操作。
const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const S = require('../src/shared'); const { Store } = require('../src/store'); const { Engine } = require('../src/engine');

// 2026-11-19 周四 14:00
const NOW = new Date(2026, 10, 19, 14, 0).getTime();
const day = (d, h = 18, m = 30) => new Date(2026, 10, d, h, m).getTime();

test('截止标签保留相对日期和具体时刻', () => {
  assert.equal(S.deadlineLabel(day(19), NOW), '今天截止');
  assert.equal(S.deadlineLabel(day(19, 15, 0), NOW), '今天 15:00截止');
  assert.equal(S.deadlineLabel(day(20), NOW), '明天截止');
  assert.equal(S.deadlineLabel(day(18), NOW), '昨天截止');
  assert.equal(S.deadlineLabel(day(19), NOW, null), '今天 18:30截止');
  assert.equal(S.deadlineLabel(null, NOW), '');
});

test('截止快捷选项只包括未来时间', () => {
  const opts = S.dueOptions(new Date(2026, 10, 19, 19).getTime());
  assert.deepEqual(opts, [day(20), day(23)]);
});
test('推荐提醒：今天截止 → 截止前 30 分钟', () => {
  const r = S.recommendRemind(day(19, 17, 30), NOW);
  assert.equal(r.at, day(19, 17, 0)); assert.equal(r.why, '截止前 30 分钟');
});
test('推荐提醒：明天截止，今天 10 点已过 → 今天下班前', () => {
  const r = S.recommendRemind(day(20), NOW);
  assert.equal(r.why, '今天下班前'); assert.equal(r.at, day(19, 17, 30));
});
test('推荐提醒：下周三截止 → 截止前一天上午', () => {
  const r = S.recommendRemind(day(25), NOW);
  assert.equal(r.at, day(24, 10, 0)); assert.equal(r.why, '截止前一天上午');
});
test('推荐提醒：下周一截止 → 前一天是周日，挪到周五', () => {
  const r = S.recommendRemind(day(23), NOW);
  assert.equal(r.at, day(20, 10, 0));
});
test('没截止不推荐；提醒选项去重', () => {
  assert.equal(S.recommendRemind(null, NOW), null);
  const { rec, opts } = S.remindOptions(day(19, 17, 30), NOW);
  assert.ok(rec); assert.ok(opts.every((o) => Math.abs(o.at - rec.at) > 30 * 60e3));
});

function mkEngine() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'at-test-'));
  const store = new Store(dir); store.save = () => {};
  const e = new Engine(store, { enabled: false }, { demoMode: true });
  e.save = () => {};
  return e;
}
test('同名标签跨任务与候选复用，移除最后一次使用后仍可再次选择', () => {
  const e = mkEngine();
  const first = e.addManual('手记', 'pool', { tags: ['  OKR ', 'okr', '等反馈', '  '], priority: 'P0' });
  e.data.candidates.push({ id: 'from-message', title: '候选' });
  const [second] = e.addAll(['from-message'], { 'from-message': { tags: ['OkR'] } });
  assert.deepEqual(first.tags, ['OKR', '等反馈']);
  assert.deepEqual(second.tags, ['OKR']);
  e.toggleTag(first.id, '等反馈');
  assert.deepEqual(second.tags, ['OKR']);
  assert.equal(first.priority, 'P0');
  assert.equal(first.list, 'pool');
  e.remove(first.id);
  e.store.flush();
  const reopened = new Store(path.dirname(e.store.file)).get();
  assert.deepEqual(reopened.tagLibrary, ['OKR', '等反馈']);
  assert.deepEqual(reopened.tasks[0].tags, ['OKR']);
});
test('旧任务首次打标签保留原有属性，连续选择可逐项移除', () => {
  const e = mkEngine();
  const legacy = { id: 'legacy', title: '复盘', priority: 'P1', due: 123, remindAt: 100, list: 'pool' };
  e.data.tasks.push({ ...legacy });
  e.toggleTag('legacy', '调研');
  e.toggleTag('legacy', '待确认');
  e.toggleTag('legacy', '调研');
  assert.deepEqual(e.data.tasks[0], { ...legacy, tags: ['待确认'] });
});
test('加入候选：有无截止都默认进今天', () => {
  const e = mkEngine(); const d = e.data;
  const later = Date.now() + 3 * S.DAY;
  d.candidates.push({ id: 'a', title: '发清单', priority: 'P1', due: later, source: {} }, { id: 'b', title: '看竞品', priority: null, due: null, source: {} }, { id: 'c', title: '写方案', priority: null, due: null, source: {} });
  const ta = e.add('a'), tb = e.add('b'), tc = e.add('c', { due: later });
  assert.equal(ta.list, 'today'); assert.equal(ta.due, later); assert.ok(ta.priorityAI);
  assert.equal(tb.list, 'today'); assert.equal(tb.remindAt, null);
  assert.equal(tc.list, 'today');
});
test('改截止：自动的提醒跟着变，手动的不动', () => {
  const e = mkEngine();
  const t = e.addManual('写周报', 'today');
  e.update(t.id, { due: Date.now() + 3 * S.DAY });
  assert.ok(t.remindAuto);
  e.update(t.id, { remindAt: Date.now() + 3600e3 });
  const keep = t.remindAt;
  e.update(t.id, { due: Date.now() + 5 * S.DAY });
  assert.equal(t.remindAt, keep);
});
test('明确关闭提醒后改截止不会重新开启，手动提醒在截止之后仍有效', () => {
  const e = mkEngine();
  const task = e.addManual('回访', 'today', { remindAt: null });
  e.update(task.id, { due: Date.now() + 5 * S.DAY });
  assert.equal(task.remindAt, null);

  e.update(task.id, { due: Date.now() - 2 * S.DAY, remindAt: Date.now() - 1000 });
  assert.deepEqual(e.dueReminders().map((t) => t.id), [task.id]);
  e.update(task.id, { remindAt: null });
  assert.deepEqual(e.alerts, []);
  e.update(task.id, { due: Date.now() + 7 * S.DAY });
  assert.equal(task.remindAt, null);
});
test('批量加入接受候选的编辑，重复操作不会新增重复任务', () => {
  const e = mkEngine();
  e.data.candidates.push({ id: 'a', title: '原始标题' }, { id: 'b', title: '另一个事项' });
  const tasks = e.addAll(['a', 'b'], { a: { priority: 'P0', title: '修改后的标题' } });
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].title, '修改后的标题');
  assert.equal(tasks[0].priority, 'P0');
  assert.deepEqual(e.addAll(['a', 'b']), []);
  for (const task of tasks) e.unadd(task.id);
  assert.equal(e.data.tasks.length, 0);
  assert.ok(e.data.candidates.every((candidate) => !candidate.handled));
});
test('旧数据迁移后保留所在清单、截止和提醒，重启后仍一致', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'at-migration-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const today = S.startOfDay();
  const future = S.addDays(today, 2);
  const deadline = S.at(today, '18:30');
  const reminder = S.at(today, '15:00');
  fs.writeFileSync(path.join(dir, 'ai-todo-data.json'), JSON.stringify({
    tasks: [
      { id: 'old-today', planDate: today, planSetAt: today, due: deadline, remindAt: reminder, order: 0 },
      { id: 'old-next', planDate: future, due: deadline, order: 0 },
      { id: 'old-none', planDate: null, remindAt: reminder, order: 0 },
    ],
  }));
  const store = new Store(dir);
  clearTimeout(store._t);
  store.flush();
  const expected = [
    { id: 'old-today', list: 'today', due: deadline, remindAt: reminder, order: 0 },
    { id: 'old-next', list: 'pool', due: deadline, order: 0 },
    { id: 'old-none', list: 'pool', remindAt: reminder, order: 1 },
  ];
  assert.deepEqual(store.get().tasks, expected);
  assert.deepEqual(new Store(dir).get().tasks, expected);
});
test('跨清单拖动设定位置，截止与提醒保持原值', () => {
  const e = mkEngine();
  const due = Date.now() + 2 * S.DAY, remindAt = Date.now() + S.DAY;
  const a = e.addManual('一', 'today'), b = e.addManual('二', 'today'), c = e.addManual('三', 'pool', { due, remindAt });
  e.move(c.id, { beforeId: a.id, list: 'today' });
  const order = e.data.tasks.filter((t) => t.list === 'today').sort((x, y) => x.order - y.order).map((t) => t.title);
  assert.deepEqual(order, ['三', '一', '二']);
  assert.equal(c.due, due);
  assert.equal(c.remindAt, remindAt);
});

test('新增保存优先级、截止和提醒，修改截止后任务留在原清单', () => {
 const e = mkEngine(); const due = Date.now() + 5*S.DAY, remindAt = Date.now()+S.DAY;
 const a=e.addManual('组合属性', 'today', {priority:'P0',due,remindAt});
 assert.equal(a.priority,'P0'); assert.equal(a.due,due); assert.equal(a.remindAt,remindAt); assert.equal(a.list,'today');
 const b=e.addManual('以后做','pool',{priority:'P1',due,remindAt:null});
 assert.equal(b.list,'pool'); assert.equal(b.remindAt,null);
 e.update(a.id,{due:due+S.DAY}); assert.equal(a.list,'today'); assert.equal(a.remindAt,remindAt);
 e.update(a.id,{priority:'P2'}); assert.equal(a.priority,'P2');
 e.update(a.id,{priority:null}); assert.equal(a.priority,null);
});

test('汇总排序不改清单，多标签任务可出现在多个组，未设截止排末尾', () => {
  const V = require('../src/views');
  const rows = [
    { id: 'a', list: 'today', tags: ['调研', '评审'], due: 200, priority: 'P0' },
    { id: 'b', list: 'pool', tags: ['调研'], due: 100, priority: 'P2' },
    { id: 'c', list: 'today' },
  ];
  const original = structuredClone(rows);
  assert.deepEqual(V.selectTasks(rows, V.config('all', '', 'due')).map(t => t.id), ['b', 'a', 'c']);
  assert.deepEqual(V.selectTasks(rows, V.config('all', '', 'priority')).map(t => t.id), ['a', 'b', 'c']);
  assert.deepEqual(V.selectTasks(rows, V.config('today', '调研')).map(t => t.id), ['a']);
  assert.deepEqual(V.tagGroups(rows, ['评审', '调研']).map(([g, ts]) => [g, ts.map(t => t.id)]),
    [['评审', ['a']], ['调研', ['a', 'b']], [null, ['c']]]);
  assert.deepEqual(rows, original);
});

test('视图保存条件且不复制事项，拒绝重名或无效条件', () => {
  const V = require('../src/views');
  const e = mkEngine(); e.addManual('报告', 'pool', { tags: ['调研'] });
  const cfg = V.config('all', '调研', 'due', true);
  const v = e.saveView(' 我的调研 ', cfg);
  assert.deepEqual(v.config, cfg); assert.equal(v.name, '我的调研');
  assert.throws(() => e.saveView('我的调研', cfg));
  assert.throws(() => e.saveView('今天', cfg));
  assert.throws(() => e.saveView('新视图', { ...cfg, scope: 'other' }));
  assert.equal(e.data.tasks.length, 1); assert.equal(e.data.savedViews.length, 1);
});
