// 主进程和界面共用的规则：截止、提醒规则和时间格式。
// 在 Node 里 require，在界面里用 <script> 直接加载（挂到 window.Shared）。
(function (root) {
  const DAY = 864e5;
  const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const addDays = (t, n) => { const d = new Date(startOfDay(t)); d.setDate(d.getDate() + n); return d.getTime(); };
  const at = (day, hm) => { const [h, m] = hm.split(':').map(Number); const d = new Date(day); d.setHours(h, m, 0, 0); return d.getTime(); };
  const pad = (n) => String(n).padStart(2, '0');
  const hm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  // 本周一 / 下周一
  const mondayOf = (t) => { const s = startOfDay(t); const wd = new Date(s).getDay(); return addDays(s, -((wd + 6) % 7)); };
  const isWeekend = (t) => [0, 6].includes(new Date(t).getDay());

  /** 日子的说法：今天 / 明天 / 周五 / 下周三 / 12/20 */
  function dayWord(t, now = Date.now()) {
    const s = startOfDay(t), t0 = startOfDay(now);
    const diff = Math.round((s - t0) / DAY);
    if (diff === 0) return '今天';
    if (diff === 1) return '明天';
    if (diff === -1) return '昨天';
    const thisMon = mondayOf(now), nextMon = addDays(thisMon, 7);
    if (s >= thisMon && s < nextMon) return WD[new Date(s).getDay()];
    if (s >= nextMon && s < addDays(nextMon, 7)) return '下' + WD[new Date(s).getDay()];
    const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  /** 截止标签：默认下班时间用「今天截止」，指定时刻用「今天 15:00截止」。 */
  function deadlineLabel(due, now = Date.now(), workEnd = '18:30') {
    if (!due) return '';
    const day = dayWord(due, now);
    const time = hm(due);
    return time === workEnd ? `${day}截止` : `${day} ${time}截止`;
  }
  function remindWord(t, now = Date.now()) {
    if (!t) return '';
    return startOfDay(t) === startOfDay(now) ? hm(t) : `${dayWord(t, now)} ${hm(t)}`;
  }

  /**
   * 推荐提醒：有截止才推荐。返回 {at, why} 或 null。
   * 规则：今天截止 → 截止前 30 分钟；明天到本周 → 截止前一天上午 10:00（已过 → 今天下班前）；下周及以后 → 截止前一天上午。
   * 只推荐工作时间，周末往前挪到周五。
   */
  function recommendRemind(due, now = Date.now(), s = {}) {
    if (!due || due <= now) return null;
    const workEnd = s.workEnd || '18:30';
    const t0 = startOfDay(now);
    const beforeEnd = at(t0, workEnd) - 60 * 60e3; // 今天下班前 = 下班前 1 小时
    if (startOfDay(due) === t0) {
      const r = due - 30 * 60e3;
      return r > now + 5 * 60e3 ? { at: r, why: '截止前 30 分钟' } : null;
    }
    let day = addDays(due, -1);
    while (isWeekend(day) && day > t0) day = addDays(day, -1);
    let r = at(day, '10:00');
    if (r > now + 5 * 60e3) return { at: r, why: '截止前一天上午' };
    if (beforeEnd > now + 5 * 60e3 && beforeEnd < due) return { at: beforeEnd, why: '今天下班前' };
    r = at(startOfDay(due), '10:00');
    if (r > now + 5 * 60e3 && r < due) return { at: r, why: '截止当天上午' };
    return null;
  }

  /** 提醒弹层里的两个快捷选项（和推荐重复的不列） */
  function remindOptions(due, now = Date.now(), s = {}) {
    const workEnd = s.workEnd || '18:30';
    const t0 = startOfDay(now);
    const beforeEnd = at(t0, workEnd) - 60 * 60e3;
    const rec = recommendRemind(due, now, s);
    let opts = [];
    if (!due) {
      opts = [['今天下班前', beforeEnd], ['明天上午', at(addDays(t0, 1), '09:30')], ['下周一上午', at(addDays(mondayOf(now), 7), '09:30')]];
    } else if (startOfDay(due) === t0) {
      opts = [['半小时后', now + 30 * 60e3], ['1 小时后', now + 60 * 60e3]];
    } else if (startOfDay(due) < addDays(mondayOf(now), 7)) {
      opts = [['今天下班前', beforeEnd], ['截止当天上午', at(startOfDay(due), '09:30')]];
    } else {
      opts = [['明天上午', at(addDays(t0, 1), '09:30')], ['截止当天上午', at(startOfDay(due), '09:30')]];
    }
    opts = opts.filter(([, t]) => t > now + 60e3 && (!rec || Math.abs(t - rec.at) > 30 * 60e3)).slice(0, 3);
    return { rec, opts: opts.map(([label, t]) => ({ label, at: t })) };
  }

  /** 截止弹层的快捷选项 */
  function dueOptions(now = Date.now(), s = {}) {
    const workEnd = s.workEnd || '18:30';
    const t0 = startOfDay(now);
    const fri = addDays(mondayOf(now), 4);
    const opts = [at(t0, workEnd), at(addDays(t0, 1), workEnd)];
    if (fri > addDays(t0, 1)) opts.push(at(fri, workEnd));
    const nextMon = addDays(mondayOf(now), 7);
    if (nextMon !== addDays(t0, 1)) opts.push(at(nextMon, workEnd));
    return opts.filter(t => t > now);
  }

  const tagName = (value) => typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/gu, ' ') : '';
  const tagKey = (value) => tagName(value).toLowerCase();
  const api = { DAY, WD, startOfDay, addDays, at, hm, mondayOf, dayWord, deadlineLabel, remindWord, recommendRemind, remindOptions, dueOptions, tagName, tagKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Shared = api;
})(typeof window !== 'undefined' ? window : globalThis);
