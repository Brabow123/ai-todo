// 钉钉 dws 命令行适配层：找到 dws、调用、解析 JSON、判断登录状态。
// 所有钉钉数据都通过本机已登录的 dws 读取，凭证留在 macOS 钥匙串里，本应用不碰 token。
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

let cachedBin = null;
let shellEnv = null;

// 从桌面启动的 App 没有终端里的 PATH（npm 装的 dws 需要 node），先向登录 shell 要一份
function getEnv() {
  if (shellEnv) return Promise.resolve(shellEnv);
  const home = os.homedir();
  const extra = ['/opt/homebrew/bin', '/usr/local/bin', path.join(home, '.npm-global/bin'), path.join(home, '.local/bin'), path.join(home, '.bun/bin'), path.join(home, '.volta/bin')];
  return new Promise((resolve) => {
    const shell = process.env.SHELL || '/bin/zsh';
    execFile(shell, ['-ilc', 'printf "__P__%s__P__" "$PATH"'], { timeout: 10000 }, (_e, out) => {
      const m = (out || '').match(/__P__(.*?)__P__/s);
      const parts = [...(m ? m[1].split(':') : []), ...(process.env.PATH || '').split(':'), ...extra].filter(Boolean);
      shellEnv = { ...process.env, PATH: [...new Set(parts)].join(':'), NO_COLOR: '1' };
      resolve(shellEnv);
    });
  });
}

function candidates() {
  const home = os.homedir();
  return [
    process.env.DWS_BIN,
    path.join(home, '.local/bin/dws'),
    path.join(home, '.npm-global/bin/dws'),
    '/opt/homebrew/bin/dws',
    '/usr/local/bin/dws',
    path.join(home, 'go/bin/dws'),
    path.join(home, '.dws/bin/dws'),
  ].filter(Boolean);
}

// 从 Finder 启动的 Electron 拿不到终端里的 PATH，所以先查常见位置，再问一次登录 shell。
function findBin() {
  if (cachedBin) return Promise.resolve(cachedBin);
  for (const p of candidates()) {
    try { fs.accessSync(p, fs.constants.X_OK); cachedBin = p; return Promise.resolve(p); } catch {}
  }
  return new Promise((resolve) => {
    const shell = process.env.SHELL || '/bin/zsh';
    execFile(shell, ['-lc', 'command -v dws'], { timeout: 8000 }, (err, out) => {
      const p = (out || '').trim().split('\n').pop();
      if (!err && p) { cachedBin = p; resolve(p); } else resolve(null);
    });
  });
}

class DwsError extends Error {
  constructor(kind, message, detail) { super(message); this.kind = kind; this.detail = detail; }
}

const AUTH_HINTS = /(not logged in|unauthori[sz]ed|auth login|未登录|登录已过期|token.*(expired|invalid)|请先登录|no (active )?profile|401)/i;

function parseJson(stdout) {
  const s = (stdout || '').trim();
  if (!s) return null;
  try { return JSON.parse(s); } catch {}
  // 有些版本会在 JSON 前打印提示行，截取第一个 { 或 [ 之后的部分再试
  const i = s.search(/[\[{]/);
  if (i > 0) { try { return JSON.parse(s.slice(i)); } catch {} }
  return null;
}

const DEBUG_DIR = path.join(os.homedir(), 'Desktop/AI待办/debug');
function dump(args, json, text) {
  try {
    if (!fs.existsSync(path.dirname(DEBUG_DIR))) return;
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const name = args.filter((a) => !a.startsWith('-')).slice(0, 4).join('_').replace(/[^\w+]/g, '') + '.json';
    fs.writeFileSync(path.join(DEBUG_DIR, name), JSON.stringify({ args, at: new Date().toISOString(), json, text: json ? undefined : String(text).slice(0, 20000) }, null, 2));
  } catch {}
}

async function run(args, { timeout = 60000 } = {}) {
  const bin = await findBin();
  const env = await getEnv();
  if (!bin) throw new DwsError('not_installed', '没有找到 dws，请先安装钉钉 Workspace CLI');
  const full = [...args];
  if (!full.includes('--format') && !full.includes('-f')) full.push('--format', 'json');
  return new Promise((resolve, reject) => {
    execFile(bin, full, { timeout, maxBuffer: 64 * 1024 * 1024, env }, (err, stdout, stderr) => {
      const json = parseJson(stdout);
      dump(full, json, `${stderr}\n${stdout}`);
      const text = `${stderr || ''}\n${stdout || ''}`;
      if (AUTH_HINTS.test(text) && (!json || json.ok === false || json.success === false || err)) {
        return reject(new DwsError('not_logged_in', '钉钉还没登录，请在终端运行 dws auth login', text.slice(0, 2000)));
      }
      // 退出码 7 = partial_failure，数据仍然可用
      if (err && !(json && (err.code === 7 || json.data))) {
        return reject(new DwsError('failed', `dws ${args.slice(0, 3).join(' ')} 失败：${text.trim().slice(0, 400)}`, text.slice(0, 2000)));
      }
      resolve(json);
    });
  });
}

async function status() {
  const bin = await findBin();
  if (!bin) return { state: 'not_installed' };
  try {
    const me = await run(['contact', 'user', 'get-self'], { timeout: 20000 });
    return { state: 'connected', bin, me: pickSelf(me) };
  } catch (e) {
    // get-self 不可用时，用 auth status 判断是否已登录
    try {
      const st = await run(['auth', 'status'], { timeout: 20000 });
      const txt = JSON.stringify(st || {});
      if (st && !/not.?logged|未登录|false/i.test(txt.slice(0, 400))) return { state: 'connected', bin, me: pickSelf(st), via: 'auth-status' };
    } catch {}
    return { state: e.kind || 'failed', bin, error: e.message, detail: e.detail };
  }
}

function pickSelf(raw) {
  // get-self 返回结构随版本变化，宽松地取 userId / 名字 / 组织
  const found = {};
  (function walk(v, depth) {
    if (!v || typeof v !== 'object' || depth > 5) return;
    for (const [k, val] of Object.entries(v)) {
      if (typeof val === 'string' || typeof val === 'number') {
        if (!found.userId && /^(userId|userid|staffId|unionId)$/.test(k)) found.userId = String(val);
        if (!found.name && /^(orgUserName|name|nick|userName|staffName|displayName)$/.test(k)) found.name = String(val);
        if (!found.org && /^(orgName|corpName|organizationName)$/.test(k)) found.org = String(val);
        if (!found.openDingTalkId && /^openDingTalkId$/.test(k)) found.openDingTalkId = String(val);
      } else walk(val, depth + 1);
    }
  })(raw, 0);
  return found;
}

// ---- 业务读取 ----
const fmt = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const OLD_CLI = /(unknown (flag|command|shorthand)|available_flags|for valid flags|未知(参数|命令)|unknown subcommand)/i;

// 按顺序尝试多种写法：新版 dws 的快捷命令 → 老版本的原子命令
async function tryEach(variants) {
  let last;
  for (const v of variants) {
    try { return await v(); }
    catch (e) { last = e; if (e.kind === 'not_logged_in' || e.kind === 'not_installed' || !OLD_CLI.test(`${e.message}\n${e.detail || ''}`)) throw e; }
  }
  throw last;
}

function nextCursor(raw) {
  let cur = null, more = null;
  (function walk(v, d) {
    if (!v || typeof v !== 'object' || d > 4) return;
    for (const [k, x] of Object.entries(v)) {
      if (cur == null && /^(nextCursor|next_cursor|nextToken|next_token)$/.test(k) && x !== '' && x != null) cur = String(x);
      if (more == null && /^(hasMore|has_more)$/.test(k)) more = !!x;
      if (x && typeof x === 'object') walk(x, d + 1);
    }
  })(raw, 0);
  return more === false ? null : cur;
}

// 手动翻页（老版本没有 --page-all）
async function paged(args, maxPages = 10) {
  const pages = []; let cursor = null;
  for (let i = 0; i < maxPages; i++) {
    const r = await run(cursor ? [...args, '--cursor', cursor] : args);
    pages.push(r);
    const n = nextCursor(r);
    if (!n || n === cursor || n === '0') break;
    cursor = n;
  }
  return { pages };
}

module.exports = {
  findBin, run, status, DwsError, parseJson, pickSelf,
  // 时间窗内我能看到的全部会话消息（群聊 + 单聊）
  listAllMessages: (since, until = new Date()) => tryEach([
    () => run(['chat', 'message', 'list-all', '--start', fmt(since), '--end', fmt(until), '--page-all']),
    () => paged(['chat', 'message', 'list-all', '--start', fmt(since), '--end', fmt(until), '--limit', '100']),
  ]),
  // @我 的消息，信号最强
  listAtMe: (days = 1) => tryEach([
    () => run(['chat', '+at-me', '--days', String(Math.max(1, days)), '--page-all']),
    () => run(['chat', '+at-me', '--days', String(Math.max(1, days)), '--limit', '100']),
    () => paged(['chat', 'message', 'list-mentions', '--start', String(Date.now() - days * 864e5), '--end', String(Date.now()), '--limit', '50'], 3),
  ]),
  // 听记：我创建的 + 共享给我的
  listMinutes: () => tryEach([
    () => run(['minutes', '+list-all', '--limit', '20']),
    async () => ({ mine: await run(['minutes', 'list', 'mine']), shared: await run(['minutes', 'list', 'shared']).catch(() => null) }),
    () => run(['minutes', 'list', 'all']),
  ]),
  minutesDetail: (id) => tryEach([
    () => run(['minutes', '+detail', '--id', id, '--artifacts', 'basic,summary,todos'], { timeout: 90000 }),
    async () => ({
      basic: await run(['minutes', 'get', 'info', '--id', id]).catch(() => null),
      summary: await run(['minutes', 'get', 'summary', '--id', id]).catch(() => null),
      todos: await run(['minutes', 'get', 'todos', '--id', id]).catch(() => null),
    }),
  ]),
};
