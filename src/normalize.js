// 把 dws 返回的 JSON 归一成应用内部结构。
// dws 自己也是“多候选字段名”宽松投影（见 internal/shortcut/chatmsg），这里沿用同一套字段名。

const first = (obj, keys) => {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  return undefined;
};

function toMs(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  if (/^\d+$/.test(String(v))) return toMs(Number(v));
  const s = String(v).replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, '$1T$2');
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

// 在任意嵌套里找“像消息的对象数组”
function findArrays(root, looksLike, maxDepth = 6) {
  const out = [];
  (function walk(v, d) {
    if (!v || typeof v !== 'object' || d > maxDepth) return;
    if (Array.isArray(v)) {
      const objs = v.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
      if (objs.length && objs.filter(looksLike).length >= Math.ceil(objs.length / 2)) { out.push(...objs.filter(looksLike)); return; }
      v.forEach((x) => walk(x, d + 1));
      return;
    }
    Object.values(v).forEach((x) => walk(x, d + 1));
  })(root, 0);
  return out;
}

const TEXT_KEYS = ['text', 'content', 'msgContent', 'message', 'msg', 'body', 'plainText'];
const isMessage = (o) => first(o, TEXT_KEYS) !== undefined && (first(o, ['createTime', 'sendTime', 'gmtCreate', 'createAt', 'timestamp', 'time', 'msgTime']) !== undefined || first(o, ['messageId', 'openMessageId', 'msgId']) !== undefined);

function messageText(m) {
  const v = first(m, TEXT_KEYS);
  if (typeof v === 'string') {
    // 有时 content 是 JSON 字符串
    if (/^\s*\{/.test(v)) { try { return messageText(JSON.parse(v)) || v; } catch { return v; } }
    return v;
  }
  if (v && typeof v === 'object') {
    const inner = first(v, ['text', 'content', 'richText', 'title', 'value']);
    if (typeof inner === 'string') return inner;
    if (Array.isArray(inner)) return inner.map((x) => (typeof x === 'string' ? x : first(x, ['text', 'content']) || '')).join('');
  }
  return '';
}

function senderOf(m) {
  let name = first(m, ['senderName', 'sender_name', 'senderNick', 'fromName', 'senderStaffName', 'nick', 'userName']);
  let id = first(m, ['senderId', 'sender_id', 'senderUserId', 'senderStaffId', 'senderOpenDingTalkId', 'openDingTalkId']);
  const obj = first(m, ['sender', 'from', 'senderUser']);
  if (obj && typeof obj === 'object') {
    name = name || first(obj, ['name', 'nick', 'userName', 'staffName', 'displayName']);
    id = id || first(obj, ['userId', 'id', 'staffId', 'openDingTalkId']);
  } else if (typeof obj === 'string' && !name) name = obj;
  return { name: name ? String(name) : '', id: id ? String(id) : '' };
}

// dws 按会话分组返回：{conversationMessagesList:[{title,singleChat,openConversationId,messages:[...]}]}
// 把外层会话信息补到每条消息上
function annotateConversations(root, d = 0) {
  if (!root || typeof root !== 'object' || d > 8) return;
  if (Array.isArray(root)) { root.forEach((x) => annotateConversations(x, d + 1)); return; }
  const msgs = root.messages || root.messageList;
  if (Array.isArray(msgs)) {
    for (const m of msgs) if (m && typeof m === 'object') {
      if (root.title && !m.conversationTitle) m.conversationTitle = root.title;
      if (root.singleChat !== undefined && m.__single === undefined) m.__single = !!root.singleChat;
      if (root.openConversationId && !m.openConversationId) m.openConversationId = root.openConversationId;
    }
  }
  Object.values(root).forEach((x) => annotateConversations(x, d + 1));
}

function normalizeMessages(raw) {
  annotateConversations(raw);
  const seen = new Set();
  return findArrays(raw, isMessage).map((m) => {
    const s = senderOf(m);
    const convId = first(m, ['openConversationId', 'conversationId', 'conversation_id', 'cid', 'chatId']);
    const convName = first(m, ['conversationTitle', 'chatTitle', 'groupName', 'conversationName', 'title']);
    const convType = first(m, ['conversationType', 'chatType', 'convType']);
    const id = String(first(m, ['messageId', 'openMessageId', 'msgId', 'id']) || `${convId}|${s.id}|${first(m, ['createTime', 'sendTime', 'createAt'])}`);
    return {
      id,
      text: messageText(m).trim(),
      senderName: s.name,
      senderId: s.id,
      time: toMs(first(m, ['createTime', 'sendTime', 'gmtCreate', 'createAt', 'timestamp', 'time', 'msgTime'])) || Date.now(),
      convId: convId ? String(convId) : '',
      convName: convName ? String(convName) : '',
      isGroup: m.__single !== undefined ? !m.__single : convType ? /group|2|群/.test(String(convType)) : !!convName,
      atMe: !!m.__atMe,
    };
  }).filter((m) => m.text && !seen.has(m.id) && seen.add(m.id));
}

// ---- 听记 ----
const isMinute = (o) => first(o, ['taskUuid', 'minutesId', 'uuid']) !== undefined;

function normalizeMinutesList(raw) {
  const seen = new Set();
  return findArrays(raw, isMinute).map((o) => ({
    id: String(first(o, ['taskUuid', 'minutesId', 'uuid'])),
    title: String(first(o, ['title', 'name', 'minutesTitle']) || '未命名会议'),
    startTime: toMs(first(o, ['startTime', 'gmtStart', 'createTime', 'gmtCreate', 'createAt'])),
    endTime: toMs(first(o, ['endTime', 'gmtEnd', 'finishTime', 'gmtModified'])),
    duration: first(o, ['duration']) || null,
  })).filter((m) => !seen.has(m.id) && seen.add(m.id));
}

function collectStrings(v, keys, out = [], d = 0) {
  if (!v || d > 6) return out;
  if (typeof v === 'string') { out.push(v); return out; }
  if (Array.isArray(v)) { v.forEach((x) => collectStrings(x, keys, out, d + 1)); return out; }
  if (typeof v === 'object') {
    const t = first(v, keys);
    if (typeof t === 'string') out.push(t);
    else Object.values(v).forEach((x) => collectStrings(x, keys, out, d + 1));
  }
  return out;
}

function findKey(root, re, d = 0) {
  if (!root || typeof root !== 'object' || d > 6) return undefined;
  for (const [k, v] of Object.entries(root)) if (re.test(k) && v) return v;
  for (const v of Object.values(root)) { const r = findKey(v, re, d + 1); if (r) return r; }
  return undefined;
}

function normalizeMinutesDetail(raw, fallback = {}) {
  const summaryRaw = findKey(raw, /^(summary|aiSummary|fullSummary|summaryContent|minutesSummary)$/i);
  const summary = typeof summaryRaw === 'string' ? summaryRaw : collectStrings(summaryRaw, ['content', 'text', 'summary']).join('\n');
  const todosRaw = findKey(raw, /^(todos|actionItems|dingtalkTodoList)$/i) || findKey(raw, /^actions$/i);
  const todoObjs = Array.isArray(todosRaw) ? todosRaw : (todosRaw && typeof todosRaw === 'object' ? (findArrays(todosRaw, (o) => !!first(o, ['content', 'text', 'title', 'subject']))) : []);
  const todos = todoObjs.map((t) => (typeof t === 'string' ? { text: t } : {
    text: String(first(t, ['content', 'text', 'title', 'subject', 'action']) || ''),
    owner: String(first(t, ['executorName', 'assigneeName', 'ownerName', 'owner', 'executor', 'speaker']) || ''),
    due: toMs(first(t, ['dueTime', 'deadline', 'dueDate'])),
  })).filter((t) => t.text);
  const title = findKey(raw, /^(title|minutesTitle)$/);
  // 结论：优先取摘要里以“结论/决定/确定”开头的行，其次取摘要前几行
  const lines = summary.split(/\n+/).map((l) => l.replace(/^[\s#>*\-•\d.、]+/, '').trim()).filter((l) => l.length > 3);
  let conclusions = lines.filter((l) => /^(结论|决定|决议|确定|共识|达成)/.test(l) || /(决定|确定|结论是|达成一致)/.test(l));
  if (!conclusions.length) conclusions = lines.slice(0, 3);
  return {
    title: typeof title === 'string' ? title : fallback.title || '会议',
    summary,
    topic: (lines.find((l) => /^(主题|议题)[:：]/.test(l)) || lines[0] || '').replace(/^(主题|议题)[:：]\s*/, ''),
    conclusions: conclusions.slice(0, 4).map((l) => l.replace(/^(结论|决定|决议|共识)[:：]\s*/, '')),
    todos,
  };
}

module.exports = { toMs, normalizeMessages, normalizeMinutesList, normalizeMinutesDetail, findArrays, messageText };
