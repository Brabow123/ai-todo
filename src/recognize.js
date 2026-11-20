// 规则识别：从钉钉消息 / 听记里找出“可能是待办”的候选。
// MVP 不接大模型，规则宁可漏一点也不乱报；每个候选都要用户确认才进清单。

const REQUEST = /(帮(我|忙)|麻烦|请(你|您)?.{0,4}(帮|看|确认|处理|提供|发|准备|跟进|评审|过一下|补|改|整理|填)|辛苦|能不能|能否|可以.{0,10}(吗|么|嘛)[?？]?|需要你|你(来|负责|跟进|看下|看一下|确认|处理)|记得|别忘了|尽快|抓紧|今天(之内|下班前|内)|明天(之前|前|上午|下午)|周[一二三四五六日天](之前|前)|截止|ddl|deadline|before|待办|todo|评审|review|过一下|对齐一下|同步一下|反馈一下|回复我|提交|发我|给我)/i;
const COMMIT = /(我来|我去(做|弄|搞|处理|跟)|我跟进|我负责|我会|我这边(来|处理|跟进|看|弄|整理)|稍后(给|发|同步|回)|晚点(给|发|同步|回)|回头(给|发|同步)|明天(给|发|同步)你|收到[，,! ！]*我|好的[，,! ！]*我|ok[，,! ！]*我|我(今天|明天|下午|晚上|待会|等下)(给|发|整理|处理|看|弄|改|补))/i;
const NEGATIVE = /(不用了|不需要了|已(经)?(完成|搞定|处理|发)|搞定了|done\b|已解决|取消了|没事了|谢谢[!！。]*$|^收到[!！。]*$|^好的[!！。]*$|^ok[!！。]*$|^嗯+$)/i;
const URGENT = /(尽快|紧急|加急|急[!！]|asap|马上|立刻|立即|今天(之内|下班前|内))/i;
const SELF_CHAT = /(文件传输助手|文件小助手|我的文件|自己)/;

const WEEK = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };

function endOfWork(d, workEnd = '18:30') {
  const [h, m] = workEnd.split(':').map(Number);
  const x = new Date(d); x.setHours(h, m, 0, 0); return x;
}

// 从中文里解析截止时间；没说就返回 null（没有截止时间的事不默认标 deadline）
function parseDue(text, now = new Date(), workEnd = '18:30') {
  let day = null;
  const base = new Date(now); base.setHours(0, 0, 0, 0);
  const addDays = (n) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };
  let m;
  if (/(今天|今晚|今日|下班前|今儿)/.test(text)) day = addDays(0);
  else if (/(明天|明日|明早|明晚)/.test(text)) day = addDays(1);
  else if (/后天/.test(text)) day = addDays(2);
  else if ((m = text.match(/下(个)?(周|星期|礼拜)([一二三四五六日天])/))) {
    const target = WEEK[m[3]]; const cur = base.getDay();
    const toMon = ((1 - cur + 7) % 7) || 7; // 到下周一
    day = addDays(toMon + ((target + 6) % 7));
  } else if ((m = text.match(/(周|星期|礼拜)([一二三四五六日天])/))) {
    const target = WEEK[m[2]]; const cur = base.getDay();
    let diff = (target - cur + 7) % 7; day = addDays(diff);
  } else if ((m = text.match(/(\d{1,2})月(\d{1,2})[日号]/))) {
    day = new Date(base.getFullYear(), Number(m[1]) - 1, Number(m[2]));
    if (day < base) day.setFullYear(day.getFullYear() + 1);
  } else if ((m = text.match(/(\d{1,2})[号日](之前|前|下班)?/))) {
    day = new Date(base.getFullYear(), base.getMonth(), Number(m[1]));
    if (day < base) day.setMonth(day.getMonth() + 1);
  }
  // 只说了时刻没说哪天（“晚上24点前”“下午3点”）→ 当天
  if (!day && /(上午|中午|下午|晚上|今晚|傍晚)?\s*\d{1,2}\s*[点:：]/.test(text) && /(前|之前|截止|给我|交|发)/.test(text)) day = addDays(0);
  if (!day) return null;
  // 具体时刻
  let t = text.match(/(上午|早上|中午|下午|晚上|傍晚)?\s*(\d{1,2})[点:：](\d{1,2}|半)?/);
  if (t) {
    let h = Number(t[2]); if (h === 24) { day.setHours(23, 59, 0, 0); return day.getTime(); }
    const _m = t[3] === '半' ? 30 : Number(t[3] || 0);
    if (/(下午|晚上|傍晚)/.test(t[1] || '') && h < 12) h += 12;
    if (!t[1] && h < 8) h += 12; // “3点”默认下午
    day.setHours(h, _m, 0, 0);
    return day.getTime();
  }
  if (/(上午|早上|明早)/.test(text)) { day.setHours(12, 0, 0, 0); return day.getTime(); }
  if (/中午/.test(text)) { day.setHours(13, 0, 0, 0); return day.getTime(); }
  return endOfWork(day, workEnd).getTime();
}

function cleanTitle(text) {
  let s = String(text)
    .replace(/<@[^>]+>/g, '')
    .replace(/@\S+?(\s|$)/g, ' ')
    .replace(/\[[^\]]{1,6}\]/g, '') // [微笑] 之类表情
    .replace(/https?:\/\/\S+/g, '（链接）')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/^(你好|您好|hi|hello|在吗|好的|好嘞|收到|ok|嗯嗯?)[，,！!。\s]*/i, '');
  s = s.replace(/^(麻烦|辛苦|请|帮忙|帮我)(你|您)?(一下)?[，,\s]*/, '');
  s = s.replace(/[。！!~～\s]+$/, '');
  if (s.length > 48) s = s.slice(0, 46) + '…';
  return s;
}

// 优先级：P0 紧急 / P1 重要 / P2 一般 / null 没判出来（界面上是虚线「+P」）
function priorityOf(text, due, now, { atMe }) {
  if (URGENT.test(text)) return 'P0';
  if (due && due - now.getTime() < 24 * 3600e3) return 'P1';
  if (due && due - now.getTime() < 3 * 24 * 3600e3) return 'P2';
  if (atMe) return 'P2';
  return null;
}
const WHY = { P0: '消息里说了紧急', P1: '一天内截止', P2: '三天内截止或被点名' };

function isMe(msg, me) {
  if (!me) return false;
  if (me.userId && msg.senderId && msg.senderId === me.userId) return true;
  if (me.openDingTalkId && msg.senderId && msg.senderId === me.openDingTalkId) return true;
  if (me.name && msg.senderName && msg.senderName === me.name) return true;
  return false;
}

/**
 * @param {Array} messages normalizeMessages 的结果
 * @param {{userId?:string,name?:string}} me
 */
function fromMessages(messages, me, { now = new Date(), workEnd = '18:30' } = {}) {
  const out = [];
  for (const m of messages) {
    const text = m.text || '';
    if (text.length < 4 || NEGATIVE.test(text.trim())) continue;
    const mine = isMe(m, me);
    const selfChat = SELF_CHAT.test(m.convName || '');
    let direction = null;
    if (selfChat && mine) direction = 'self';
    else if (!mine && (m.atMe || !m.isGroup) && REQUEST.test(text)) direction = 'toMe';
    else if (!mine && m.isGroup && me?.name && text.includes(me.name) && REQUEST.test(text)) direction = 'toMe';
    else if (mine && COMMIT.test(text)) direction = 'fromMe';
    else if (!mine && !m.isGroup && COMMIT.test(text)) direction = 'theyPromise'; // 别人答应你 → 跟进
    if (!direction) continue;
    const due = parseDue(text, now, workEnd);
    const source = selfChat
      ? { type: 'self', name: '文件小助手' }
      : m.isGroup
        ? { type: 'group', name: m.convName || '群聊', person: mine ? '' : m.senderName }
        : { type: 'person', name: mine ? (m.convName || '对方') : (m.senderName || m.convName || '同事') };
    out.push({
      id: `msg:${m.id}`,
      title: cleanTitle(text),
      direction,
      priority: priorityOf(text, due, now, m),
      due,
      source: { ...source, convId: m.convId, msgId: m.id, time: m.time },
      atMe: !!m.atMe,
      quote: text.length > 120 ? text.slice(0, 118) + '…' : text,
      createdAt: m.time,
    });
  }
  return out;
}

function fromMinutes(meetingId, detail, me, { now = new Date(), workEnd = '18:30' } = {}) {
  return (detail.todos || []).map((t, i) => {
    const mineOwner = !t.owner || (me?.name && t.owner.includes(me.name));
    const due = t.due || parseDue(t.text, now, workEnd);
    return {
      id: `meet:${meetingId}:${i}`,
      title: cleanTitle(t.text),
      direction: mineOwner ? 'toMe' : 'others',
      owner: t.owner || '',
      priority: priorityOf(t.text, due, now, {}),
      due,
      source: { type: 'meet', name: detail.title || '会议', meetingId },
      quote: t.text,
      createdAt: now.getTime(),
      defaultChecked: !!mineOwner,
    };
  });
}

// ---- 去重：和清单里已有的任务比较 ----
function bigrams(s) {
  const t = String(s).replace(/[\s，,。.!！?？:：、（）()「」"'“”]/g, '').toLowerCase();
  const set = new Set();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  if (t.length === 1) set.add(t);
  return set;
}
function similarity(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach((x) => B.has(x) && inter++);
  return inter / (A.size + B.size - inter);
}

/** 给候选标上：new / inlist（已在清单）/ dup（很像，指向 matchId） */
function markAgainst(cands, tasks) {
  return cands.map((c) => {
    const exact = tasks.find((t) => t.originId === c.id);
    if (exact) return { ...c, fit: 'inlist', matchId: exact.id, matchTitle: exact.title };
    let best = null, score = 0;
    for (const t of tasks) {
      if (t.done) continue;
      const s = similarity(c.title, t.title);
      if (s > score) { score = s; best = t; }
    }
    if (best && score >= 0.75) return { ...c, fit: 'inlist', matchId: best.id, matchTitle: best.title };
    if (best && score >= 0.4) return { ...c, fit: 'dup', matchId: best.id, matchTitle: best.title };
    return { ...c, fit: 'new' };
  });
}

module.exports = { WHY, priorityOf, fromMessages, fromMinutes, parseDue, cleanTitle, similarity, markAgainst, REQUEST, COMMIT };
