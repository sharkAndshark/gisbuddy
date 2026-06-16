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

# 编译 TypeScript
build:
  npx tsc

# 编译 + 启动（开发模式）
start: build
  npx electron .

# ── 打包 ────────────────────────────────────────────

# 打包为 .app（不含 GDAL 捆绑）
pack: build
  npx electron-builder --dir --mac

# 打包为可分发的 DMG 安装包
dist: build
  npx electron-builder --mac

# 将 .app 安装到 /Applications
install-app: pack
  cp -r "release/mac/GISBuddy.app" "/Applications/GISBuddy.app"
  @echo "✓ GISBuddy.app 已安装到 /Applications"

# ── GDAL 捆绑 ──────────────────────────────────────

# 从 Homebrew 提取 GDAL CLI + 依赖库到 gdal-bin/
bundle-gdal:
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

# 完整打包（含 GDAL 捆绑）
pack-full: bundle-gdal pack
  @echo "✓ 完整打包完成（含 GDAL）"

dist-full: bundle-gdal dist
  @echo "✓ 完整分发包完成（含 GDAL）"

# ── 清理 ────────────────────────────────────────────

# 清理构建产物
clean:
  rm -rf dist/ release/
  @echo "✓ 已清理构建产物"

# 完全清理（含 GDAL 包）
clean-all: clean
  rm -rf gdal-bin/
  @echo "✓ 已完全清理"
