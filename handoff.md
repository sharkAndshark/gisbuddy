# GISBuddy Handoff

## 项目概述

GISBuddy 是一个 Electron 桌面应用，用于 GIS 数据处理。用户通过聊天界面与 AI Agent 交互，Agent 可以执行 bash 命令、读写文件、编辑文件。支持预览文本/图片/GeoJSON/Shapefile，GeoJSON 以 Leaflet 地图渲染。

## 技术栈

- **运行时**: Electron 33, Node.js（renderer 启用 `nodeIntegration: true`, `contextIsolation: false`）
- **AI（main 进程）**: `@earendil-works/pi-coding-agent` SDK — `createAgentSession()` 管理完整 agent 生命周期（compaction/retry/queue/分支）
- **AI（共享）**: `@earendil-works/pi-agent-core` (Agent 类型) + `@earendil-works/pi-ai` (DeepSeek V4 Pro, 1M token 窗口; faux provider for tests)
- **UI**: `@earendil-works/pi-web-ui` (ChatPanel) + Lit (模板渲染, 非组件框架)
- **构建**: esbuild (IIFE 格式, platform: 'node'), TypeScript (main/preload)
- **测试**: Vitest (单元/集成 78 个) + Playwright (E2E 12 个, 3 real-API skip)
- **包管理**: npm

> 所有 pi-* 包锁定在 0.74.2（Node 20 兼容；0.79.x 要求 Node 22.19+，与 Electron 33 内置 Node 冲突）

## 编译 & 测试命令

```
npm run build        # tsc + esbuild → dist/
npm start            # build + electron .
npm test             # vitest (78 tests)
npm run test:e2e     # build + playwright (12 tests + 3 skipped real-API)
npm run test:all     # 全量 (90 tests)
npm run lint         # eslint
npm run lint:behaviors  # 行为-测试对照表审计
```

## 文件结构

```
src/
  renderer.ts       # 主渲染入口 (Lit 模板, 侧边栏/文件树/地图预览)
  agent-proxy.ts    # Agent 接口的 renderer 端镜像，转发 IPC（issue #14 核心）
  index.html        # HTML 壳 (CSP, Leaflet CSS, bundle.js 引用)

electron/
  main.ts           # 主进程: window, IPC 注册, model/authStorage 启动设置
  preload.ts        # 暴露 gisbuddy API (agent + 旧的 conversation/project/file)
  conversation-manager.ts  # 项目/对话元数据 (conversations.json, 不含消息)
  agent-session-manager.ts # 每对话一个 AgentSession (JSONL file-backed; sessionDir = userData/sessions)
  handlers/
    agent.ts        # agent:switch/prompt/abort/get-state/dispose + faux:set-responses
    read-file.ts    # 文件预览 IPC（用户点击文件树）
    list-directory.ts # 文件树列表
  gis-resource-loader.ts # 自定义 ResourceLoader（注入 GIS 系统提示，无 extensions/skills）
  system-prompt.ts  # GIS 系统提示词（含 7 工具说明）
  gdal-path.ts      # bundled GDAL PATH 解析（dev 环境为空，用系统 GDAL）
  faux.ts           # 测试模式注册 faux provider（file URL 加载 pi-ai/faux）
  utils.ts          # CRS 工具函数 (extractEPSG, isCompatibleCRS)

scripts/
  build-renderer.mjs  # esbuild 构建 (无 faux plugin，所有 pi-* 已对齐)

tests/
  utils.test.ts                # CRS 函数 (11 tests)
  conversation-manager.test.ts # 项目/对话元数据 (21 tests)
  read-file.test.ts            # read-file handler (19 tests)
  list-directory.test.ts       # list-directory handler (7 tests)
  renderer-helpers.test.ts     # auto-title / formatFileSize 等 (13 tests)
  integration/agent-flow.test.ts # AgentSession + IPC 主路径 (7 tests)

e2e/
  fixtures/app.ts   # launchApp/cleanupApp
  fixtures/faux.ts  # faux response builder + setFauxResponses IPC helper
  01-startup.spec.ts # 启动测试 (3 tests)
  02-chat.spec.ts    # 聊天测试 (4 tests: text/thinking/error/tool)
  03-file-tree.spec.ts # 文件树测试 (2 tests)
  04-persistence.spec.ts # 会话 dispose 测试 (1 test)
  05-smoke-real.spec.ts # 真实 API smoke (3 tests, 需 DEEPSEEK_API_KEY)
  06-gis.spec.ts        # GIS 场景验收 (2 tests: ogrinfo + Leaflet)

dist/
  electron/        # tsc 编译 (main.js, preload.cjs)
  renderer/        # esbuild 输出 (bundle.js + sourcemap + leaflet.css + images/)
```

## 架构流程（issue #14 后）

```
用户输入 → pi-web-ui ChatPanel
  → AgentProxy.prompt(text)
  → IPC 'agent:prompt' → main AgentSession.prompt()
    → DeepSeek API（或 faux 测试模式）
    → Agent 流式返回 → session.subscribe → IPC 'agent:event' 推送
    → AgentProxy.dispatch → 本地 listeners（AgentInterface 订阅渲染消息）
    → 如有 toolCall → main AgentSession 内置工具执行（bash/read/write/edit/grep/find/ls）
    → toolResult → 继续循环
    → agent_end → IPC 'agent:prompt' resolve 返回完整 state snapshot
  → AgentProxy 更新 state（新引用，Lit 自然重渲染）
  → auto-title via proxy.subscribe('agent_end')
```

**关键 IPC 协议**：
- `agent:switch(convId, cwd)` → `{ sessionId, state }` — 切换/创建对话
- `agent:prompt(convId, text)` → state snapshot
- `agent:abort(convId)`
- `agent:get-state(convId)` → state snapshot
- `agent:dispose(convId)`
- `agent:event` (main→renderer push) — `{ conversationId, event }`
- `faux:set-responses(responses)`

## 关键设计决策

1. **Agent 迁入 main（issue #14）**: 之前 Agent 在 renderer（pi-agent-core），ESM/CJS/undici 崩溃。现在 main 用 pi-coding-agent SDK 的 `createAgentSession()`，renderer 只做 UI。
2. **AgentProxy 伪装 Agent**: pi-web-ui ChatPanel/AgentInterface 期望 Agent 实例。AgentProxy 实现必要接口（state/subscribe/prompt/abort + streamFn/getApiKey 占位），用 `as unknown as Agent` cast。
3. **state 引用替换**: AgentProxy 在 `agent_end`/`message_end` 拉 `agent:get-state` 快照，用新数组引用替换 `state.messages`，触发 Lit 重渲染（消除了原 msgListFix workaround）。
4. **Tools 全部内置**: 启用 pi-coding-agent 全部 7 个工具（read/bash/edit/write/grep/find/ls），删除自造的 `electron/tools/*.ts`。
5. **faux 走 IPC**: 测试响应通过 `gisbuddy.fauxSetResponses` IPC 注入到 main 的 faux provider，不再 renderer 注册。faux.ts 用 `pathToFileURL` 加载 pi-ai 的深路径（pi-ai@0.74.2 的 `./faux` 子路径未在 package.json exports 声明）。
6. **pi-ai 版本对齐**: 所有 pi-* 锁定 0.74.2（Electron 33 / Node 20 兼容上限），消除嵌套副本，让 faux 全局注册和 AgentSession 共享 api-registry。
7. **会话持久化（JSONL）**: `SessionManager.create(cwd, sessionDir)` 把每对话存为 `<userData>/sessions/*.jsonl`；`conversation.sessionId` 字段存 jsonl 文件路径；切换对话时 `SessionManager.open` resume。
8. **会话压缩白送**: pi-coding-agent 内置 compaction（当前禁用，1M token 窗口暂不需要），未来开启只需 settingsManager 配置。

## 已知限制 & Tradeoffs

| 问题 | 影响 | 说明 |
|------|------|------|
| 渲染端 tool 元数据被 ChatPanel 覆盖 | 低 | ChatPanel.setAgent 把 artifacts tool 注入 state.tools；main 的真实 tools 不变，仅 UI 显示用 |
| faux 路径硬编码 process.cwd() | 低 | 仅 GISBUDDY_TEST=1 时调用，cwd 总是项目根 |
| `deleteFile` 不删 jsonl | 低 | 删对话时 dispose 内存缓存，jsonl 文件保留作历史；如需清理是独立小改动 |
| `gdal-bin/` 仓库内为空 | 中 | GDAL PATH 注入逻辑已就绪（`BashSpawnHook`），release 打包前需填入 macOS/Windows/Linux 三套二进制 |

## 未完成工作（优先级排序）

### P1 — bundled GDAL 二进制填入
- 当前: `gdal-bin/` 仅有 `.gitkeep`；dev 用系统 GDAL（brew 装在 /opt/homebrew/bin）
- 需要: release 打包前填入真实 GDAL 二进制（macOS/Windows/Linux 三套）；注入逻辑已就绪（`agent-session-manager.ts` 的 `BashSpawnHook`）
- 影响: release 包能找到 bundled GDAL

### P2 — read-file / list-directory 单元测试（B44-B59）
- 既有，handoff 历史项，与新架构无关

### P3 — 移除 behaviors.md 中未测试的行为警告

## 调试提示

- E2E 测试失败时, 查看 `test-results/` 目录下的 error-context.md 和 trace
- 手动启动测试模式: `GISBUDDY_TEST=1 npm start`
- IndexedDB 数据位置: Electron userData 目录（`GISBUDDY_USER_DATA` 环境变量）
- Leaflet 地图不渲染: 检查 `dist/renderer/images/`，检查 CSP
- 消息不显示: 检查 AgentProxy.subscribe 是否绑定、IPC `agent:event` 是否到达（看 main 进程 console）
- faux 注册失败: 确认所有 pi-* 版本对齐 0.74.2（`find node_modules -name api-registry.js` 应只 1 个结果）

## Git 工作流

- 主分支: `main`
- PR 基于功能分支 (`feat/*`), squash merge
- Pre-commit hook 运行 lint + behaviors 检查 + vitest
- 本 issue 用分支: `feat/pi-coding-agent-sdk`
