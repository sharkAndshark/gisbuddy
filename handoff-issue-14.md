# Handoff — Issue #14 (feat/pi-coding-agent-sdk)

**给下一个 agent**：本文档总结 `feat/pi-coding-agent-sdk` 分支上为 issue #14 完成的全部工作，以及剩余事项。读完本文档 + `handoff.md`（项目总览）即可接手 commit / PR。

---

## 1. 上下文

- **分支**：`feat/pi-coding-agent-sdk`（基于 main `d37dc66`）
- **Issue**: https://github.com/sharkAndshark/gisbuddy/issues/14
- **目标**：把 Agent 循环从 renderer（pi-agent-core）迁到 main（pi-coding-agent SDK），删除自造的工具/会话基建，根除 ESM/undici 在 renderer 崩溃的根因
- **Spec**：`ISSUES/002-Agent迁入main进程-采用pi-coding-agent-SDK.md`

## 2. 已完成工作（全部 ✅）

| # | 阶段 | 结果 |
|---|---|---|
| 0 | Spike：Node 20 / Electron 33 能跑 coding-agent；bash 能调 GDAL | ✅ scripts 已删 |
| 1 | Main agent 基建：`agent-session-manager` / `handlers/agent` / `gis-resource-loader` / `faux` | ✅ |
| 2 | Renderer `AgentProxy`：IPC 转发，ChatPanel 不改 | ✅ |
| 3 | 持久化：`SessionManager.create/open` JSONL；conversation.sessionId 改文件路径 | ✅ |
| 4 | 清理：删 `electron/tools/*.ts` / `tool-exec.ts` / `tools.test.ts` / build-renderer 的 faux plugin | ✅ |
| 5 | 测试基建：faux 走 IPC `faux:set-responses`；e2e 全绿 | ✅ |
| 6 | system-prompt 补 grep/find/ls 说明 | ✅ |
| 7 | 全量验收 + handoff 更新 | ✅ |
| 8 | **bundled GDAL PATH 注入**：`createBashTool` + `BashSpawnHook` 把 `gdal-bin/` 拼到 PATH | ✅ |
| 9 | **IndexedDB 死代码清理**：删 `SessionsStore`，dbName bump 到 `gisbuddy-pi-v2` | ✅ |
| 10 | **GIS 场景 e2e**：`e2e/06-gis.spec.ts` 真实 ogrinfo + Leaflet 地图渲染 | ✅ |

## 3. 测试状态（最终）

```
npm run build        # PASS (tsc + esbuild)
npm test             # 78/78 PASS (vitest)
npm run test:e2e     # 12/12 PASS + 3 skipped (real-API 需 DEEPSEEK_API_KEY)
npm run lint         # 0 errors, 5 warnings（全 pre-existing）
```

包含的 GIS 自动化验收（`e2e/06-gis.spec.ts`）：
- `Agent 调用 ogrinfo 读取 GeoJSON` — 用系统 GDAL 真跑 `ogrinfo -al cities.geojson`，验证 tool 输出
- `点击 GeoJSON → Leaflet 地图渲染` — 验证 `#gisbuddy-map` + `.leaflet-container` 出现

## 4. 文件变更清单

### 新增（8 个文件）
- `electron/agent-session-manager.ts` — 每对话一个 AgentSession；JSONL 文件持久化；GDAL PATH spawnHook
- `electron/handlers/agent.ts` — agent:switch/prompt/abort/get-state/dispose IPC
- `electron/gis-resource-loader.ts` — 自定义 ResourceLoader（注入 GIS 系统提示，无 extensions）
- `electron/faux.ts` — 测试模式 faux provider 注册（file URL 绕 pi-ai exports 限制）
- `src/agent-proxy.ts` — Agent 接口 renderer 端镜像，转发 IPC
- `tests/integration/agent-flow.test.ts` — 7 个测试（含 sessionFilePath resume）
- `e2e/fixtures/faux.ts` — faux builder + `setFauxResponses` IPC helper
- `e2e/06-gis.spec.ts` — GIS 场景验收（ogrinfo + Leaflet）

### 删除（6 个文件）
- `electron/tools/bash.tool.ts` / `edit.tool.ts` / `read.tool.ts` / `write.tool.ts`
- `electron/handlers/tool-exec.ts`
- `tests/integration/tools.test.ts`

### 修改
- `electron/main.ts` — 注册 agent IPC；model/authStorage 启动设置；sessionDir 创建；delete-conversation 调 disposeSession；configure 同步 authStorage
- `electron/preload.ts` — 暴露 agent API（+ `onAgentEvent` push）；移除 toolExec
- `electron/system-prompt.ts` — 补 grep/find/ls 工具说明
- `electron/agent-session-manager.ts` — 见上
- `src/renderer.ts` — switchToConversation 用 AgentProxy；删 createTools/restoreSession/msgListFix/setupAppStorage 的 SessionsStore
- `scripts/build-renderer.mjs` — 删 faux esbuild plugin；加 `@opentelemetry/api` external
- `e2e/01-startup.spec.ts` — 删冗余 "Tool IPC 桥" 测试（已被 02/06 覆盖）
- `e2e/02-chat.spec.ts` — 用 `setFauxResponses` helper 而非 window.__faux
- `e2e/04-persistence.spec.ts` — 改测 main disposeSession（持久化层由 agent-flow.test.ts 的 resume 测试覆盖）
- `package.json` — pi-* 全部对齐到 0.74.2；新增 pi-coding-agent
- `handoff.md` — 反映新架构

### 新增 issue 文档
- `ISSUES/002-Agent迁入main进程-采用pi-coding-agent-SDK.md`

## 5. 关键技术决策（别踩坑）

1. **pi-* 全部锁 0.74.2**：0.79.x 要求 Node 22.19+，与 Electron 33（Node 20）冲突。npmmirror 同步延迟曾让 `npm view` 显示 0.79.9 但实际装 0.74.2——以 `package.json` 实际锁的为准。
2. **faux 通过 file URL 加载**：`pi-ai@0.74.2` 的 `package.json exports` 没声明 `./faux`，`electron/faux.ts` 用 `pathToFileURL(process.cwd() + '/node_modules/...')` 绕过。版本对齐后只 1 份 pi-ai 副本，注册和 AgentSession 共享 api-registry。
3. **AgentProxy 用类型断言**：`Agent` 是 class 不是 interface，AgentProxy 不继承，用 `as unknown as Agent` cast 给 `ChatPanel.setAgent()`。AgentInterface 实际只消费 `state/subscribe/prompt/abort/streamFn/getApiKey` 这几个字段。
4. **streamFn/getApiKey 占位**：AgentProxy 的 `streamFn = null`（让 `=== streamSimple` 检查失败）+ `getApiKey = async () => 'managed-by-main'`（避免被 AgentInterface 自动赋值）。
5. **IPC state snapshot 剥离函数**：`tools` 数组含 `execute` 函数无法跨 IPC structured clone。`handlers/agent.ts` 的 `snapshotState` 只保留 name/label/description/parameters。
6. **ChatPanel.setAgent 会覆盖 state.tools**：它会注入自己的 `artifacts` tool。main 真实 tools 不变，仅 renderer UI 显示。已知 tradeoff，不影响功能。
7. **持久化路径**：sessionDir = `<userData>/sessions/`；`conversation.sessionId` 字段语义从 IndexedDB key 改为 jsonl 文件路径；切换对话时 renderer 把它作为 `sessionFilePath` 传给 `agent:switch`，main 用 `SessionManager.open` resume。
8. **msgListFix 自然消失**：AgentProxy 每次 `agent_end` 拉 `agent:get-state` 快照，用新数组引用替换 `state.messages`，Lit 自然重渲染。
9. **build-renderer 的 `@opentelemetry/api` external**：mistralai 的 optional dep；renderer 不走 mistral provider 路径，标 external 跳过解析。

## 6. 待办（按优先级）

### P0 — 立即要做（用户尚未授权 commit）
- [ ] **commit + PR**：用户全程没说 commit，分支上 17 文件变更全部 staged 待提交
  - 建议 commit 信息：`feat: migrate agent to pi-coding-agent SDK (issue #14)` 或拆成 3-4 个逻辑 commit（infra / renderer / cleanup / tests）
  - PR 标题：`Agent 迁入 main 进程：采用 pi-coding-agent SDK (closes #14)`
  - 标签：`enhancement`

### P1 — 短期改进（独立 PR）
- [ ] **sessions JSONL 删除策略**：当前 `disposeSession` 只清内存缓存，jsonl 文件保留在 `<userData>/sessions/`。决定：保留作历史 vs 删除（用户体验）。
- [ ] **real-API e2e smoke**：`e2e/05-smoke-real.spec.ts` 跑通需要真实 DEEPSEEK_API_KEY + 网络。CI 上 skip 没问题，但偶尔手动跑一次能 catch 网络/真实模型行为。
- [ ] **CSP 收紧**：main.ts 的 BrowserWindow 用 `contextIsolation: false` + `nodeIntegration: true`，且 02-chat 错误日志显示 "Insecure Content-Security- Policy"。生产环境前应改回 contextIsolation。

### P2 — 中期重构
- [ ] **完整重启 e2e**：当前 `04-persistence` 只测 dispose IPC，没测"关闭 app → 重启 → 历史恢复"完整链路。需要 fixtures/app.ts 支持"两阶段 launchApp 共享 userDataDir 但不删"。
- [ ] **deleteFile 后端**：删对话时清理对应 jsonl 文件（如决定不保留历史）。

### P3 — 长期/已知 tradeoff
- [ ] **bundled GDAL 二进制**：`gdal-bin/` 目录现在只有 `.gitkeep`。release 打包前要填入真实 GDAL 二进制（macOS/Windows/Linux 三套）。注入逻辑已就绪（`BashSpawnHook`）。
- [ ] **compaction 启用**：`SettingsManager.inMemory({ compaction: { enabled: false } })` 当前禁用。DeepSeek 1M 窗口暂不需要，未来开启只需改 settings。
- [ ] **behaviors.md 未测试行为警告**：29 个 pre-existing，与新架构无关。

## 7. 如何继续

```bash
# 当前分支
git branch --show-current    # feat/pi-coding-agent-sdk

# 验证状态
npm run test:all             # 78 单元 + 12 e2e + 3 skipped
npm run lint                 # 0 errors

# 手动跑应用
npm start                    # 默认 DeepSeek 模式（需 GISBUDDY_API_KEY）
GISBUDDY_TEST=1 npm start    # faux 测试模式（不发真实请求）

# 真实 API smoke（手动，需 key）
DEEPSEEK_API_KEY=sk-... npx playwright test e2e/05-smoke-real.spec.ts

# Commit（建议拆 4 个）
# 1) 依赖版本对齐 + main agent 基建
#    package.json package-lock.json electron/main.ts electron/preload.ts
#    electron/agent-session-manager.ts electron/handlers/agent.ts
#    electron/gis-resource-loader.ts electron/faux.ts electron/system-prompt.ts
# 2) renderer AgentProxy
#    src/agent-proxy.ts src/renderer.ts scripts/build-renderer.mjs
# 3) 清理旧路径
#    electron/tools/* electron/handlers/tool-exec.ts tests/integration/tools.test.ts
# 4) 测试 + 文档
#    tests/integration/agent-flow.test.ts e2e/* ISSUES/002-*.md handoff*.md
```

## 8. 已知限制 & Tradeoff（复述）

| 项 | 影响 | 备注 |
|---|---|---|
| ChatPanel 覆盖 state.tools | 低 | artifacts tool 注入；不影响 main 实际执行 |
| faux 路径硬编码 process.cwd() | 低 | 仅 testMode，cwd 总是项目根 |
| `deleteFile` 不删 jsonl | 低 | 保留作历史；可改 |
| `gdal-bin/` 仓库内为空 | 中 | 注入逻辑就绪，release 前填二进制 |
| IndexedDB dbName 升到 v2 | 低 | 用户首次启动会重建（API key 重输） |

---

**Git 提示**：
- 本会话所有改动都已落到工作区，**没有任何 commit**
- 老的 `feat/pi-coding-agent-sdk-old` 分支是 #2 时代遗留，已重命名保留，可删
- pre-commit hook（`.husky/`）会跑 lint + behaviors + vitest，已知 78 测试全绿应能通过

**联系点**：issue #14 已评论两次（spike 报告 + 完成报告），PR 创建后 reference `closes #14`。
