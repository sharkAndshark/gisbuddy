#!/bin/bash
set -e

echo "=== GISBuddy 环境初始化 ==="

# 使用国内镜像
MIRROR="https://registry.npmmirror.com"
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"

echo "安装依赖..."
ELECTRON_MIRROR=$ELECTRON_MIRROR npm install --registry=$MIRROR

echo "编译 TypeScript..."
npx tsc

echo ""
echo "✓ 初始化完成！运行方式："
echo "  npm start       # 启动应用"
echo "  npm run build   # 仅编译"
echo "  npm run dist    # 打包为安装包"
