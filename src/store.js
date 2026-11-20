// 本地存储：一个 JSON 文件，放在 ~/Library/Application Support/AI待办/
const fs = require('fs');
const path = require('path');
const { addDays } = require('./shared');

const DEFAULTS = {
  tasks: [],          // 已进清单的待办（今天 / 待办池 / 已完成）
  savedViews: [],     // 用户命名的视图条件，不复制任务
  tagLibrary: [],     // 用户创建过的标签，移出某个任务后仍可复用
  candidates: [],     // 小钉找来、等你确认的（必须点「加入」才进清单）
  ignored: [],        // 点过「忽略」的候选 id，不再推
  seenMinutes: [],    // 已读过的听记 id
  settings: {
    workStart: '09:30',
    workEnd: '18:30',
    pollMinutes: 5,
    density: 'simple',                 // simple / detail
    sources: { private: true, group: true, minutes: true, calendar: true },
    excludedGroups: [],                // 排除的群（会话名）
    onboarded: false,                  // 首次连接走完没有
    disconnected: false,               // 用户在连接面板里点了「断开」，或首次选了「先不连」
    tips: {},                          // 一次性提示是否出过
  },
  marks: { lastMsgSync: 0, lastMinutesSync: 0, lastSyncAt: 0, everConnected: false },
};

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'ai-todo-data.json');
    try { this.data = { ...structuredClone(DEFAULTS), ...JSON.parse(fs.readFileSync(this.file, 'utf8')) }; }
    catch { this.data = structuredClone(DEFAULTS); }
    this.data.settings = { ...DEFAULTS.settings, ...this.data.settings, sources: { ...DEFAULTS.settings.sources, ...(this.data.settings || {}).sources } };
    this.data.marks = { ...DEFAULTS.marks, ...this.data.marks };
    this._t = null;
    const tasks = this.data.tasks;
    const legacy = tasks.filter(t => 'planDate' in t || 'planSetAt' in t || (t.list !== 'today' && t.list !== 'pool'));
    if (legacy.length) {
      const tomorrow = addDays(Date.now(), 1);
      for (const task of legacy) {
        if (task.list !== 'today' && task.list !== 'pool') {
          task.list = task.planDate != null && task.planDate < tomorrow ? 'today' : 'pool';
        }
        delete task.planDate;
        delete task.planSetAt;
      }
      // 旧数据在不同日期下可能使用相同的排序值。
      for (const list of ['today', 'pool']) {
        tasks.filter(t => !t.done && t.list === list)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .forEach((task, index) => { task.order = index; });
      }
      this.save();
    }
  }
  save() {
    clearTimeout(this._t);
    this._t = setTimeout(() => this.flush(), 150);
  }
  flush() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
  get() { return this.data; }
}

module.exports = { Store, DEFAULTS };
