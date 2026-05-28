#!/bin/bash
# 启动 Poker Night 开发服务器
cd "$(dirname "$0")"
echo "🎴 启动 Poker Night..."
echo "   首次启动如果没装依赖会自动 npm install"
if [ ! -d node_modules ]; then
  npm install
fi
echo ""
echo "✅ 启动后浏览器访问: http://localhost:5173/"
echo "   登录账号: player01  密码: poker01"
echo "   （或登录页点'查看 10 个内置账号'看全部）"
echo ""
npm run dev
