# Issue #002 — Agent 迁入 main 进程：采用 pi-coding-agent SDK

**创建日期：** 2026-06-22
**状态：** 📋 Plan 已确认，待执行
**类型：** Refactor / Architecture

---

## 一、背景与动机

继 #3（自定义 Agent → pi-agent-core）、#5（自写 UI → pi-web-ui）两轮 pi 化之后，Agent 栈仍有一个核心矛盾：**pi-coding-agent（整车）从未采用，我们只用 pi-agent-core（引擎）**。

具体债务：

- 自造 4 个工具（`electron/tools/*.ts`），与 coding-agent 内置工具同构
- 自造会话管理、`msgListFix`（Lit 引用突变 workaround）、faux 测试基建
- `handoff.md:76` 记录的根因未解决：曾尝试把 coding-agent 放进 renderer，因 undici / `node:` imports / ESM-CJS interop 崩溃而放弃
- 会话压缩（handoff P3）、会话分支、自动重试全部缺失

**目标：** 将 Agent 循环从 renderer 迁入 Electron main 进程，使用 coding-agent SDK 的 `createAgentSession()`；renderer 保留 pi-web-ui ChatPanel，通过 AgentProxy 聚合 IPC 事件驱动 UI。

---

## 二、已锁定决策

| 项 | 选择 | 理由 |
|---|---|---|
| 持久化 | `SessionManager.create(cwd)` JSONL 文件 | 白送分支/恢复/list API；取代 renderer IndexedDB SessionsStore |
| 运行时 | `createAgentSession` 简单方案 | 无分支需求，每对话 dispose+新建 |
| 节奏 | Big bang 新分支 `feat/pi-coding-agent-sdk` | 双路径混合反而复杂 |
| 工具集 | 启用全部 7 个内置工具（read/bash/edit/write/grep/find/ls） | 减少 bash 滥用，grep/find/ls 更精准 |

---

## 三、目标架构

```
┌─ Renderer (浏览器环境) ──────────────────────────────────────┐
│  + src/agent-proxy.ts: 实现 Agent 接口, 聚合 IPC 事件          │
│  · src/renderer.ts (瘦身): 侧边栏/文件树/Leaflet 保留          │
│  · ChatPanel.setAgent(agentProxy): 保留 pi-web-ui              │
│  - 删: createTools / new Agent() / msgListFix / faux 注册      │
└─────────────────┬───────────────────────────────────────────┘
                  │ IPC (事件流 + 命令)
┌─ Main (Node) ───┴───────────────────────────────────────────┐
│  + electron/agent-session-manager.ts: 每对话一个 session       │
│  + electron/handlers/agent.ts: agent:prompt/abort/switch/...   │
│  + electron/gis-resource-loader.ts: GIS 系统提示注入           │
│  + electron/faux.ts: 测试模式 faux provider 注册               │
│  · electron/main.ts / preload.ts / conversation-manager.ts     │
│  · electron/{system-prompt,gdal-path}.ts (保留)                │
│  · electron/handlers/{read-file,list-directory}.ts (保留)      │
│  - electron/tools/*.ts / handlers/tool-exec.ts (删)            │
└──────────────────────────────────────────────────────────────┘
```

---

## 四、IPC 协议

| Handler | 方向 | 说明 |
|---|---|---|
| `agent:prompt` | r→m | `(convId, text \| message)` → 等到 turn 完成 |
| `agent:abort` | r→m | 中止当前 prompt |
| `agent:switch` | r→m | `(convId, cwd, sessionId?)` → 就绪 |
| `agent:get-state` | r→m | 拉取完整 `{messages,tools,model,...}` 快照 |
| `agent:event` | m→r | 转发 `AgentSessionEvent`（subscribe 流） |
| `faux:set-responses` | r→m | 测试模式注入响应序列 |

删除：`configure`（迁到 AuthStorage）、`tool-exec`、`set-conversation-session-id`（sessionId 由 SessionManager 管，语义变了）。

---

## 五、文件变更清单

| 操作 | 文件 |
|---|---|
| 新建 | `electron/agent-session-manager.ts`、`electron/handlers/agent.ts`、`electron/gis-resource-loader.ts`、`electron/faux.ts`、`src/agent-proxy.ts` |
| 改造 | `electron/main.ts`、`electron/preload.ts`、`electron/conversation-manager.ts`、`src/renderer.ts`、`scripts/build-renderer.mjs`、`electron/system-prompt.ts`（补 grep/find/ls）、`package.json` |
| 改造测试 | `tests/integration/tools.test.ts` → `agent-flow.test.ts`、`e2e/02-chat.spec.ts`、`e2e/fixtures/app.ts` |
| 删除 | `electron/tools/{bash,edit,read,write}.tool.ts`、`electron/handlers/tool-exec.ts` |

---

## 六、实施阶段

| 阶段 | 内容 | 验证 |
|---|---|---|
| 0 | Spike：验证 main 能 import coding-agent / bash 能调 GDAL / faux 在 main 能跑 | 独立 ts 脚本 |
| 1 | main agent-session-manager + handlers/agent + gis-resource-loader | 新 agent-flow 单测 |
| 2 | renderer agent-proxy + switchToConversation 改 IPC | spike 单轮 prompt+tool_call 渲染 |
| 3 | 持久化迁移：SessionManager.create 恢复对话列表 | 启动恢复测试 |
| 4 | 清理旧路径（tools/、tool-exec、faux plugin、msgListFix） | build 通过 |
| 5 | 测试基建：main faux 注册、preload 暴露、e2e 改写 | test:all 全绿 |
| 6 | system-prompt 补 grep/find/ls 说明 | — |
| 7 | 全量验收 | 见第七节 |

---

## 七、验收标准

- [ ] `npm run build` 通过
- [ ] `npm test` 全绿（含新 `agent-flow.test.ts`）
- [ ] `npm run test:e2e` 11 个 spec 全绿
- [ ] `npm run lint` 无新增 warning
- [ ] 手动：创建项目 → 新对话 → `gdalinfo`/`ogr2ogr` 可跑 → GeoJSON 地图预览 → 切换对话完整恢复 → 删除对话清理 jsonl
- [ ] 删除文件清单全部删除
- [ ] `handoff.md` 更新（移除 ESM 崩溃 workaround 记录，补新架构说明）

---

## 八、风险

| 风险 | 概率 | 应对 |
|---|---|---|
| AgentProxy 的 state 引用语义触发 Lit 不更新 | 中 | 每次 `agent_end` 用新数组引用替换，参照 `msgListFix` 教训 |
| coding-agent bash 工具的 PATH 找不到 GDAL | 中 | 阶段 0 spike；必要时用 `defineTool` 覆盖 bash 注入 PATH |
| IPC 序列化丢失消息字段（如 `pendingToolCalls` 是 Set） | 低 | 序列化为数组，反序列化还原 |
| AgentSession 未 dispose 句柄泄漏 | 中 | deleteConversation 触发 dispose；app quit 清理 |

---

## 九、关联

- 前序：#3、#5（第一、二轮 pi 化）
- 阻塞：handoff.md P3（会话压缩）—— 本 issue 完成后自动消除
