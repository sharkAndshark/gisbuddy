# GISBuddy Handoff

## 项目概述

GISBuddy 是一个 Electron 桌面应用，用于 GIS 数据处理。用户通过聊天界面与 AI Agent 交互，Agent 可以执行 bash 命令、读写文件、编辑文件。支持预览文本/图片/GeoJSON/Shapefile，GeoJSON 以 Leaflet 地图渲染。

## 技术栈

- **运行时**: Electron 33, Node.js（renderer 启用 `nodeIntegration: true`, `contextIsolation: false`）
- **AI**: `@earendil-works/pi-agent-core` (Agent) + `@earendil-works/pi-ai` (DeepSeek V4 Pro, 1M token 窗口)
- **UI**: `@earendil-works/pi-web-ui` (ChatPanel) + Lit (模板渲染, 非组件框架)
- **构建**: esbuild (IIFE 格式, platform: 'node'), TypeScript (main/preload)
- **测试**: Vitest (单元/集成 41 个) + Playwright (E2E 11 个)
- **包管理**: npm

## 编译 & 测试命令

```
npm run build        # tsc + esbuild → dist/
npm start            # build + electron .
npm test             # vitest (41 tests)
npm run test:e2e     # build + playwright (11 tests)
npm run test:all     # 全量 (52 tests)
npm run lint         # eslint
npm run lint:behaviors  # 行为-测试对照表审计
```

## 文件结构

```
src/
  renderer.ts       # 主渲染入口 (esbuild bundle, lit 模板, 全局状态)
  index.html        # HTML 壳 (CSP, Leaflet CSS, bundle.js 引用)
  app.js            # 已删除 (PR #10, 旧版渲染代码, 由 renderer.ts 替代)

electron/
  main.ts           # 主进程: IPC handler, 窗口, 托盘, tool-exec, read-file, list-directory
  preload.ts        # 预加载: contextIsolation=false, 暴露 gisbuddy API
  conversation-manager.ts  # 项目/对话元数据 (JSON 文件持久化, 不含消息)
  utils.ts          # CRS 工具函数 (extractEPSG, isCompatibleCRS)
  tools/            # 工具实现 (bash, read, write, edit)

scripts/
  build-renderer.mjs  # esbuild 构建 (faux plugin, CSS copy, import.meta.url shim)

e2e/
  fixtures/app.ts   # launchApp/cleanupApp (isolated userData, testMode support)
  01-startup.spec.ts  # 启动测试 (4 tests)
  02-chat.spec.ts     # 聊天测试 (4 tests: text/thinking/error/tool)
  03-file-tree.spec.ts # 文件树测试 (2 tests)
  04-persistence.spec.ts # 持久化清洁测试 (1 test)

tests/
  utils.test.ts              # CRS 函数 (11 tests)
  conversation-manager.test.ts # 项目/对话元数据 (21 tests)
  integration/tools.test.ts  # 工具 IPC (9 tests)

dist/
  electron/        # tsc 编译 (main.js, preload.cjs)
  renderer/        # esbuild 输出 (bundle.js + sourcemap + leaflet.css + images/)
```

## 架构流程

```
用户输入 → pi-web-ui ChatPanel → Agent.prompt()
  → faux provider (测试模式) 或 DeepSeek API (生产)
  → Agent 流式返回 → ChatPanel 渲染消息
  → 如有 toolCall → IPC tool-exec → main 进程执行工具 → 返回结果 → Agent 循环
  → agent_end → 保存到 IndexedDB SessionsStore (非测试模式)
  → agent_end → 自动标题 (首次回复取前30字)
```

## 关键设计决策

1. **Bare Agent 而非 AgentHarness**: pi-coding-agent 在 renderer 中崩溃 (undici, ESM/CJS, node: imports)。pi-agent-core 的 `Agent` 类兼容浏览器环境
2. **pi-web-ui ChatPanel**: 使用自定义 Lit 元素 (`<pi-chat-panel>`, `<agent-interface>`, `<message-list>`), 通过 `setAgent()` 注入 Agent 实例
3. **工具 IPC 桥**: 工具在 renderer 定义, 执行通过 `ipcRenderer.invoke('tool-exec')` 转到 main 进程 (安全: 路径解析基于 cwd, 禁止越界)
4. **Lit 渲染修复**: pi-agent-core 用 `.push()` 原地修改 `state.messages`, Lit 的 `@property` 检查引用相等 → message-list 不会重渲染。修复: agent 订阅中强行设置 `msgList.messages = [...agent.state.messages]` (新引用)
5. **Faux Provider (测试)**: `GISBUDDY_TEST=1` 时注册 faux LLM provider, esbuild plugin 绕过 pi-ai exports 限制, 测试通过 `window.__faux.setResponses()` 控制
6. **会话持久化**: IndexedDB SessionsStore, 在 `agent_end` 保存, `switchToConversation` 恢复, 删除对话时清理
7. **Leaflet 打包**: npm 包替代 CDN, 构建时复制 CSS + images 到 dist/renderer/

## 已知限制 & Tradeoffs

| 问题 | 影响 | 说明 |
|------|------|------|
| IndexedDB read-before-write 竞态 | 低 | 快速切换对话时可能读到旧消息, 下一次 agent_end 自动覆盖 |
| 会话 ID 持久化不是原子的 | 低 | sessionId 先存 IndexedDB, 再 IPC 存 metadata。崩溃可能导致孤儿 session |
| Faux 模块始终打包 | 低 | ~10KB, 生产环境不执行 (isTestMode guard) |
| 测试模式跳过持久化 | 设计 | 防止 faux 数据污染 IndexedDB。持久化 E2E 测试需手动注入数据 |
| Leaflet zoom 图标路径依赖 dist/renderer/images/ | 低 | 构建脚本自动复制, 不复制则 zoom 按钮显示空白 |

## 未完成工作 (优先级排序)

### P1 — read-file 单元测试 (B44-B55, 12 个行为)
- 当前: `electron/main.ts` 中 read-file handler 是内联函数, 无法单独测试
- 需要: 提取到 `electron/handlers/read-file.ts`, mock fs/shapefile, 测试各种文件类型和边界
- 覆盖: text/image/geojson/shapefile/大小限制/错误处理

### P2 — list-directory 单元测试 (B56-B59, 4 个行为)
- 当前: 内联在 main.ts
- 需要: 提取到 `electron/handlers/list-directory.ts`, 测试排序/过滤/返回结构

### P2 — Renderer 单元测试 (B65-B69, B73-B75)
- switchToConversation 的 session restore / sessionId 生成 / auto-title
- msgListFix (Lit 引用问题) 
- deleteConversation IndexedDB 清理
- switchSeq 竞态保护
- 注意: 需要 mock DOM/IndexedDB/IPC, 可能适合 E2E 而非单元测试

### P3 — 会话压缩
- DeepSeek 1M token 窗口暂不需要, 但未来可能需要
- 需要在 main 进程运行 AgentSession (pi-coding-agent) 并通过 IPC 桥接

### P3 — 移除 behaviors.md 中未测试的行为警告
- 当前 29 个未测行为 warning, 完成上述测试后可显著减少

## 调试提示

- E2E 测试失败时, 查看 `test-results/` 目录下的 error-context.md 和 trace
- 手动启动测试模式: `GISBUDDY_TEST=1 npm start`
- IndexedDB 数据位置: Electron userData 目录 (由 `GISBUDDY_USER_DATA` 环境变量控制)
- Leaflet 地图不渲染: 检查 `dist/renderer/images/` 是否存在, 检查 CSP 是否允许 tile 图片
- 消息不显示: 检查 Lit message-list 重渲染问题 (msgListFixUnsub), 确认 agent 订阅正确设置

## Git 工作流

- 主分支: `main`
- PR 基于功能分支 (`feat/*`), squash merge
- Pre-commit hook 运行 lint + behaviors 检查 + vitest
- 最近 PR: #8 (E2E chat), #9 (session persistence + file tree), #10 (cleanup + E2E tests)
