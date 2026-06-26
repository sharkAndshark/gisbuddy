# GISBuddy 构建与打包工具
# 需要: Node.js 20+, just 1.x
# 可选: Homebrew (用于 bundle-gdal)

default:
  @just --list --justfile {{justfile()}}

# ── 初始化 ──────────────────────────────────────────

# 安装 npm 依赖（国内镜像）
setup:
  ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" \
    npm install --registry=https://registry.npmmirror.com

# ── 开发 ────────────────────────────────────────────

# 编译 TypeScript + preload + renderer bundle（与 `npm run build` 一致）
build:
  npm run build

# 编译 + 启动（开发模式）
start: build
  -@pkill -f "gisbuddy/node_modules/electron/dist/Electron.app" 2>/dev/null || true
  npx electron .

# ── 打包 ────────────────────────────────────────────

# 打包为 .app（不含 GDAL 捆绑，macOS）
pack-mac: build
  npx electron-builder --dir --mac

# 打包为可分发的 DMG/ZIP 安装包（macOS）
dist-mac: build
  npx electron-builder --mac

# 打包为未安装目录（Windows，产出 win-unpacked/）
pack-win: build
  npx electron-builder --dir --win

# 打包为可分发的 NSIS 安装包（Windows）
dist-win: build
  npx electron-builder --win

# 将 .app 安装到 /Applications（macOS）
install-app: pack-mac
  cp -r "release/mac/GISBuddy.app" "/Applications/GISBuddy.app"
  @echo "✓ GISBuddy.app 已安装到 /Applications"

# ── GDAL 捆绑 ──────────────────────────────────────

# 从 Homebrew 提取 GDAL CLI + 依赖库到 gdal-bin/（macOS）
bundle-gdal-mac:
  @mkdir -p gdal-bin
  @echo "=== 提取 GDAL 二进制 ==="
  @set -e; \
  for cmd in gdalinfo ogrinfo ogr2ogr gdal_translate gdalwarp gdal_calc.py gdal_merge.py gdal_edit.py gdal_rasterize gdal_polygonize.py; do \
    path=$$(which $$cmd 2>/dev/null || true); \
    if [ -n "$$path" ]; then \
      cp -fL "$$path" gdal-bin/ 2>/dev/null && echo "  ✓ $$cmd"; \
    else \
      echo "  ✗ $$cmd (未找到)"; \
    fi; \
  done
  @echo "=== 提取动态库依赖 ==="
  @for f in gdal-bin/*; do \
    if [ -f "$$f" ] && [ -x "$$f" ]; then \
      for lib in $$(otool -L "$$f" 2>/dev/null | grep '/opt/homebrew\|/usr/local' | awk '{print $$1}'); do \
        cp -n "$$lib" gdal-bin/ 2>/dev/null || true; \
      done; \
    fi; \
  done
  @echo ""
  @echo "✓ GDAL 已打包到 gdal-bin/"
  @ls -lh gdal-bin/ | wc -l | xargs -I{} echo "  共 {} 个文件"

# 下载预打包的 GDAL Windows zip 并解压到 gdal-bin/（Windows）
#   URL 取自参数或 GDAL_WIN_URL 环境变量
#   推荐源: GIS Internals (https://www.gisinternals.com/release.php)
bundle-gdal-win URL='':
  node scripts/bundle-gdal-win.mjs {{URL}}

# 完整打包（含 GDAL 捆绑，macOS）
pack-full-mac: bundle-gdal-mac pack-mac
  @echo "✓ 完整打包完成（含 GDAL，macOS）"

# 完整分发包（含 GDAL 捆绑，macOS）
dist-full-mac: bundle-gdal-mac dist-mac
  @echo "✓ 完整分发包完成（含 GDAL，macOS）"

# 完整打包（含 GDAL 捆绑，Windows）
pack-full-win URL='':
  just bundle-gdal-win {{URL}}
  just pack-win
  @echo "✓ 完整打包完成（含 GDAL，Windows）"

# 完整分发包（含 GDAL 捆绑，Windows）
dist-full-win URL='':
  just bundle-gdal-win {{URL}}
  just dist-win
  @echo "✓ 完整分发包完成（含 GDAL，Windows）"

# ── 图标 ────────────────────────────────────────────

# 下载 Windows 端捆绑的 busybox-w32 shell（构建前置，仅 Windows 打包需要）
fetch-busybox:
  @echo "=== 下载 busybox-w32 ==="
  @mkdir -p build
  curl -sL -o build/busybox64.exe https://frippery.org/files/busybox/busybox64.exe
  @echo "✓ build/busybox64.exe 已下载"

# 重新生成 macOS 应用图标（SVG → .icns + PNG，需 iconutil）
icon-mac:
  @echo "=== 生成 macOS 图标 ==="
  node -e "const sharp=require('sharp');const fs=require('fs');const p=require('path');const svg='build/icon-duck.svg';const is='build/icon-duck.iconset';fs.mkdirSync(is,{recursive:true});const sz=[[16,16],[32,32],[128,128],[256,256],[512,512]];(async()=>{for(const[w,h]of sz){await sharp(svg,{density:144}).resize(w,h).png().toFile(p.join(is,'icon_'+w+'x'+h+'.png'));await sharp(svg,{density:288}).resize(w*2,h*2).png().toFile(p.join(is,'icon_'+w+'x'+h+'@2x.png'));}await sharp(svg,{density:144}).resize(512,512).png().toFile('build/icon-duck.png');})()"
  iconutil -c icns build/icon-duck.iconset -o build/icon-duck.icns
  @echo "✓ macOS 图标已生成: build/icon-duck.icns + build/icon-duck.png"

# 重新生成 Windows 应用图标（SVG → .ico，跨平台，无需 iconutil）
icon-win:
  @echo "=== 生成 Windows 图标 ==="
  node scripts/build-icon-win.mjs
  @echo "✓ Windows 图标已生成: build/icon-duck.ico"

# 一次性生成两端图标
icon-all: icon-mac icon-win

# ── 清理 ────────────────────────────────────────────

# 清理构建产物
clean:
  rm -rf dist/ release/
  @echo "✓ 已清理构建产物"

# 完全清理（含 GDAL 包）
clean-all: clean
  rm -rf gdal-bin/
  @echo "✓ 已完全清理"
