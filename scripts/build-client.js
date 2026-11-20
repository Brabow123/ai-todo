// npm run pack：使用本机已有 Electron 缓存，产出独立 macOS 客户端。
const fs = require('fs');
const path = require('path');
const os = require('os');
const packager = require('@electron/packager');
const { productName, version: appVersion } = require('../package.json');
const root = path.resolve(__dirname, '..');
const version = require('electron/package.json').version;
const cache = path.join(os.homedir(), 'Library/Caches/electron');
let electronZipDir;
if (fs.existsSync(cache)) {
  electronZipDir = fs.readdirSync(cache).map(n => path.join(cache, n)).find(d => fs.existsSync(path.join(d, `electron-v${version}-darwin-arm64.zip`)));
}

packager({
  dir: root,
  name: `${productName} ${appVersion}`,
  platform: 'darwin',
  arch: 'arm64',
  appBundleId: 'com.xiaoding.aitodo050',
  out: path.join(root, 'dist'),
  overwrite: true,
  electronZipDir,
  osxSign: { identity: '-', continueOnError: false },
  ignore: [
    /^\/(dist|debug|test|scripts)(\/|$)/,
    /^\/\.(env|git)/,
    /(^|\/)\.DS_Store$/,
    /^\/ai-todo-data\.json/,
    /^\/[^/]+\.command$/,
  ],
}).then(paths => paths.forEach(p => console.log(p))).catch(e => {
  console.error(e.message);
  process.exitCode = 1;
});
