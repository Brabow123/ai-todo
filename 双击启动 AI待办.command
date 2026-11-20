#!/bin/bash
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.npm-global/bin:$PATH"
REG=https://registry.npmmirror.com
echo "== AI待办 =="
if ! command -v node >/dev/null; then
  echo "这台电脑还没装 Node.js，正在打开下载页，装好后再双击本文件。"
  open "https://nodejs.org/zh-cn/download"; read -p "按回车关闭"; exit 1
fi
echo "Node $(node -v)"
if [ ! -d node_modules/electron ]; then
  echo "第一次运行：安装依赖（1-3 分钟）…"
  ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install --registry=$REG || { read -p "安装失败，截图给 Claude，按回车关闭"; exit 1; }
fi
if ! command -v dws >/dev/null; then
  echo "安装钉钉 dws…"
  npm install -g dingtalk-workspace-cli --registry=$REG 2>/dev/null || {
    mkdir -p "$HOME/.npm-global"; npm config set prefix "$HOME/.npm-global"
    npm install -g dingtalk-workspace-cli --registry=$REG; }
fi
command -v dws >/dev/null && echo "dws 已就绪" || echo "dws 没装上，先用演示模式"
echo "启动中…（这个窗口别关，关了 AI待办 也会退出）"
npm start
