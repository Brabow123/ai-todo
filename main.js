// AI待办 · 桌面主进程
// 一个无边框透明窗口：便签（横条 / 展开）在一侧，气泡和小钉卡片贴在便签左边（便签贴屏幕左边缘时换到右边）。
const { app, BrowserWindow, ipcMain, screen, shell, Menu, Notification, clipboard } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const { Store } = require('./src/store');
const { Engine } = require('./src/engine');
const { LLM } = require('./src/llm');
const S = require('./src/shared');

const DEMO = process.env.AT_DEMO === '1' || process.argv.includes('--demo');
app.setName('AI待办');
app.setPath('userData', process.env.AT_USER_DATA || path.join(app.getPath('appData'), 'AI待办'));
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
const GAP = 12;
let win, store, engine;
const layout = { noteX: 0, noteY: 0, noteW: 440, noteH: 64, panelW: 0, panelH: 0, side: 'left' };

function applyBounds() {
  if (!win || win.isDestroyed()) return;
  const wa = screen.getDisplayNearestPoint({ x: layout.noteX, y: layout.noteY }).workArea;
  const hasPanel = layout.panelW > 0;
  layout.side = hasPanel && layout.noteX - layout.panelW - GAP < wa.x ? 'right' : 'left';
  const w = layout.noteW + (hasPanel ? layout.panelW + GAP : 0);
  const h = Math.min(Math.max(layout.noteH, hasPanel ? layout.panelH : 0), wa.height - 16);
  const x = hasPanel && layout.side === 'left' ? layout.noteX - layout.panelW - GAP : layout.noteX;
  const y = Math.max(wa.y + 8, Math.min(layout.noteY, wa.y + wa.height - h - 8));
  win.__moving = true;
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) });
  setTimeout(() => (win.__moving = false), 80);
  win.webContents.send('side', layout.side);
}

function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  layout.noteX = wa.x + wa.width - layout.noteW - 24;
  layout.noteY = wa.y + 24;
  win = new BrowserWindow({
    width: layout.noteW, height: layout.noteH, x: layout.noteX, y: layout.noteY,
    frame: false, transparent: true, resizable: false, hasShadow: false, alwaysOnTop: true,
    fullscreenable: false, title: 'AI待办', acceptFirstMouse: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'renderer/index.html'));
  win.on('moved', () => {
    if (win.__moving) return;
    const b = win.getBounds();
    layout.noteX = layout.panelW && layout.side === 'left' ? b.x + layout.panelW + GAP : b.x;
    layout.noteY = b.y;
    applyBounds();
  });
}

function snapshot() {
  const d = store.get();
  const t0 = S.startOfDay();
  return {
    demo: DEMO,
    conn: { state: engine.conn.state, error: engine.conn.error, detail: engine.conn.detail },
    me: engine.me,
    llm: engine.llm.enabled,
    busy: engine.busy,
    tidying: engine.tidying ? { ...engine.tidying, cancel: undefined } : null,
    tasks: d.tasks.filter((t) => !t.done || (t.doneAt && t.doneAt >= t0)),
    tagLibrary: d.tagLibrary,
    savedViews: d.savedViews,
    candidates: d.candidates.filter((c) => !c.handled),
    alerts: engine.alerts,
    settings: d.settings,
    marks: d.marks,
    groups: engine.lastGroups,
    side: layout.side,
    now: Date.now(),
  };
}
const push = () => win && !win.isDestroyed() && win.webContents.send('state', snapshot());

const actions = {
  state: () => snapshot(),
  layout: ({ noteW, noteH, panelW, panelH }) => { Object.assign(layout, { noteW, noteH, panelW: panelW || 0, panelH: panelH || 0 }); applyBounds(); return layout.side; },
  add: (id, edits) => engine.add(id, edits),
  addAll: (ids, edits) => engine.addAll(ids, edits),
  ignore: (id) => engine.ignore(id),
  unignore: (id) => engine.unignore(id),
  unadd: (taskId) => engine.unadd(taskId),
  bubbleSeen: (id) => engine.bubbleSeen(id),
  addManual: (text, where, attrs) => engine.addManual(text, where, attrs),
  saveView: (name, view) => engine.saveView(name, view),
  registerTag: (name) => engine.registerTag(name),
  toggleTag: (id, name) => engine.toggleTag(id, name),
  update: (id, patch) => engine.update(id, patch),
  move: (id, opts) => engine.move(id, opts),
  remove: (id) => engine.remove(id),
  restore: (t) => engine.restore(t),
  snooze: (id, at) => engine.snooze(id, at),
  dismissAlert: (id) => engine.dismissAlert(id),
  parseTime: (text) => require('./src/recognize').parseDue(text, new Date(), store.get().settings.workEnd),
  tidy: (opts) => engine.tidy(opts || {}),
  cancelTidy: () => engine.cancelTidy(),
  onboardStats: () => engine.onboardStats(),
  settings: (patch) => {
    const s = store.get().settings;
    for (const [k, v] of Object.entries(patch)) s[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...s[k], ...v } : v;
    store.save(); push(); return s;
  },
  reconnect: () => engine.connect(),
  disconnect: () => engine.disconnect(),
  sync: () => engine.tick(),
  openDingTalk: () => execFile('open', ['-a', 'DingTalk'], (e) => e && shell.openExternal('dingtalk://')),
  openTerminalLogin: () => execFile('osascript', ['-e', 'tell application "Terminal" to do script "dws auth login"', '-e', 'tell application "Terminal" to activate']),
  copy: (text) => clipboard.writeText(String(text || '')),
  quit: () => app.quit(),
};

ipcMain.handle('act', async (_e, name, ...args) => {
  if (!actions[name]) throw new Error(`unknown action ${name}`);
  try { return await actions[name](...args); }
  catch (e) { return { __error: e.message, kind: e.kind || 'failed' }; }
});

app.whenReady().then(async () => {
  app.setName('AI待办');
  store = new Store(app.getPath('userData'));
  engine = new Engine(store, new LLM(__dirname), { demoMode: DEMO });
  engine.on('change', push);
  engine.on('tidy', (p) => win && !win.isDestroyed() && win.webContents.send('tidy', p));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'AI待办', submenu: [{ label: 'AI待办 0.5.0', enabled: false }, { type: 'separator' }, { label: '立即同步', accelerator: 'Cmd+R', click: () => engine.tick() }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'quit' }] },
    { role: 'editMenu' },
  ]));
  createWindow();
  await engine.checkConnection();
  engine.tick();
  let last = Date.now();
  setInterval(() => {
    push();
    for (const t of engine.dueReminders()) {
      // 「有人在等」或 P0 的提醒，不在电脑前时也发系统通知
      if (!win.isFocused() && (t.priority === 'P0' || t.follow || t.priority === 'P1')) {
        const n = new Notification({ title: `${S.hm(t.remindAt)} 提醒`, body: t.title + (t.due ? `（${S.deadlineLabel(t.due, Date.now(), null)}）` : '') });
        n.on('click', () => { win.show(); win.focus(); });
        n.show();
      }
    }
    if (Date.now() - last >= Math.max(1, store.get().settings.pollMinutes) * 60e3) { last = Date.now(); engine.tick(); }
  }, 30e3);
  app.on('activate', () => { if (!win || win.isDestroyed()) createWindow(); else win.show(); });
});
app.on('before-quit', () => { try { store.flush(); } catch {} });
app.on('window-all-closed', () => app.quit());
