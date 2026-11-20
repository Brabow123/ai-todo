// DeepSeek（OpenAI 兼容接口）：把规则粗筛出的消息交给模型判断，失败时退回规则结果。
const fs = require('fs');
const path = require('path');

function loadEnv(dir) {
  const env = {};
  for (const f of ['.env.local', '.env']) {
    try {
      fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((l) => {
        const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      });
    } catch {}
  }
  return env;
}

class LLM {
  constructor(appDir) {
    const env = { ...loadEnv(appDir), ...loadEnv(require('electron').app.getPath('userData')), ...process.env };
    this.key = env.DEEPSEEK_API_KEY || '';
    this.base = (env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
    this.model = env.DEEPSEEK_MODEL || 'deepseek-chat';
  }
  get enabled() { return !!this.key; }

  async chat(system, user, { timeout = 45000 } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(`${this.base}/chat/completions`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.key}` },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        }),
      });
      if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const j = await res.json();
      return JSON.parse(j.choices[0].message.content);
    } finally { clearTimeout(t); }
  }

  /**
   * 判断一批消息里哪些是待办。
   * @param msgs [{id,text,senderName,convName,isGroup,atMe,mine,time}]
   * @returns Map<msgId,{isTask,title,direction,priority,due}>
   */
  async judgeMessages(msgs, me, now = new Date()) {
    const out = new Map();
    if (!this.enabled || !msgs.length) return out;
    const system = `你是工作待办识别助手。用户是「${me?.name || '我'}」。今天是 ${now.toLocaleDateString('zh-CN')} ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()]}，现在 ${now.toTimeString().slice(0, 5)}。
从钉钉消息里找出需要用户本人去做、用户答应别人要做、或别人答应用户要做的具体事情。闲聊、通知、已完成、无需行动的不要。
只输出 JSON：{"items":[{"id":"消息id","isTask":true/false,"title":"不超过24字，动词开头的动宾短语，不带人名称呼和时间词","direction":"toMe|fromMe|self|theyPromise","priority":"P0|P1|P2|null","why":"不超过14字，为什么是这个优先级","due":"YYYY-MM-DD HH:mm 或 null","unsure":true/false}]}
direction：别人让用户做=toMe；用户答应别人=fromMe；用户发给自己的备忘=self；别人答应给用户做某事=theyPromise。
priority：P0=明确紧急或今天必须完成；P1=一天内截止或领导点名；P2=三天内或一般被点名；判断不了填 null。没说截止时间就填 null，不要猜。
unsure：拿不准是不是用户的事时填 true。`;
    for (let i = 0; i < msgs.length; i += 40) {
      const batch = msgs.slice(i, i + 40).map((m) => ({
        id: m.id, from: m.mine ? '我' : m.senderName, chat: m.isGroup ? `群:${m.convName}` : `单聊:${m.convName || m.senderName}`,
        atMe: !!m.atMe, time: new Date(m.time).toLocaleString('zh-CN', { hour12: false }), text: m.text.slice(0, 400),
      }));
      try {
        const r = await this.chat(system, JSON.stringify(batch));
        for (const it of r.items || []) {
          const due = it.due ? Date.parse(String(it.due).replace(' ', 'T')) : null;
          out.set(String(it.id), { ...it, due: Number.isNaN(due) ? null : due });
        }
      } catch (e) { console.warn('[llm] judgeMessages', e.message); }
    }
    return out;
  }

  /** 会议卡：主题 / 结论 / 待办 */
  async meetingCard(title, summary, todos, me) {
    if (!this.enabled || !summary) return null;
    const system = `把会议纪要整理成会议卡。用户是「${me?.name || '我'}」。只输出 JSON：{"topic":"一句话主题，不超过30字","conclusions":["最多4条结论，每条不超过30字"],"todos":[{"text":"不超过24字","owner":"负责人或空","mine":true/false}]}。
待办优先使用已给出的听记待办，没有时再从纪要里提取。`;
    try {
      return await this.chat(system, JSON.stringify({ title, summary: summary.slice(0, 6000), todos }));
    } catch (e) { console.warn('[llm] meetingCard', e.message); return null; }
  }
}

module.exports = { LLM, loadEnv };
