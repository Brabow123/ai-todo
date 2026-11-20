// npm run check-dws：检查 dws 是否装好、是否登录，并把真实返回存到 debug/ 方便调字段
const fs = require('fs');
const path = require('path');
const dws = require('../src/dws');
const N = require('../src/normalize');
const R = require('../src/recognize');

(async () => {
  const out = path.join(__dirname, '..', 'debug');
  fs.mkdirSync(out, { recursive: true });
  const st = await dws.status();
  console.log('dws:', st.bin || '没找到');
  console.log('状态:', st.state, st.me ? `${st.me.name || ''} ${st.me.org || ''} (${st.me.userId || ''})` : '', st.error || '');
  if (st.state !== 'connected') { if (st.detail) console.log(st.detail); process.exit(1); }
  const save = (n, v) => fs.writeFileSync(path.join(out, n), JSON.stringify(v, null, 2));
  const since = new Date(Date.now() - 24 * 3600e3);
  for (const [name, fn] of [['messages-all', () => dws.listAllMessages(since)], ['messages-atme', () => dws.listAtMe(1)], ['minutes-list', () => dws.listMinutes()]]) {
    try { const raw = await fn(); save(name + '.json', raw); console.log(`✓ ${name} 已保存`); }
    catch (e) { console.log(`✗ ${name}: ${e.message}\n${e.detail || ''}`); }
  }
  try {
    const msgs = N.normalizeMessages(JSON.parse(fs.readFileSync(path.join(out, 'messages-all.json'))));
    console.log(`最近 24 小时消息 ${msgs.length} 条`);
    const c = R.fromMessages(msgs, st.me);
    console.log(`规则识别出 ${c.length} 件：`); c.slice(0, 15).forEach((x) => console.log(`  [${x.direction}] ${x.priority} ${x.title}`));
  } catch {}
  try {
    const ms = N.normalizeMinutesList(JSON.parse(fs.readFileSync(path.join(out, 'minutes-list.json'))));
    console.log(`听记 ${ms.length} 条：`, ms.slice(0, 5).map((m) => m.title).join(' / '));
    if (ms[0]) { const raw = await dws.minutesDetail(ms[0].id); save('minutes-detail.json', raw); const d = N.normalizeMinutesDetail(raw, ms[0]); console.log('最新一场:', d.title, '| 主题:', d.topic, '| 待办', d.todos.length, '件'); }
  } catch (e) { console.log('听记详情:', e.message); }
})();
