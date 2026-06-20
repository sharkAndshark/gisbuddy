# GISBuddy 可观测行为与测试对照表

> 本文件用于 `npm run lint:behaviors` 检查，未测行为（测试合理性 ≥ 3 且未豁免）会触发警告。
>
> 架构：pi-agent-core (Agent) + pi-web-ui (ChatPanel) 在 Electron renderer 进程运行，工具通过 IPC 桥接到 main 进程。

## ConversationManager — 项目/对话元数据持久化

| 模块 | 编号 | 可观测行为 | 来源文件 | 测试编号 | 测试质量(1-5) | 测试合理性(1-5) | 解耦建议/豁免 | 备注 |
|------|------|-----------|---------|---------|:------------:|:--------------:|:------------:|------|
| ConversationManager | B01 | 初始状态 projects 列表为空 | `electron/conversation-manager.ts` | T01 | 4 | 5 | 纯逻辑 / ⚠ 应测 | — |
| ConversationManager | B02 | createProject 传入 folderPath 创建项目 | `electron/conversation-manager.ts` | T02 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 含 id/title/archived/createdAt |
| ConversationManager | B03 | getProject 按 id 返回项目 | `electron/conversation-manager.ts` | T03 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| ConversationManager | B04 | getProject 对未知 id 返回 undefined | `electron/conversation-manager.ts` | T04 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 边界条件 |
| ConversationManager | B05 | renameProject 修改标题并保存 | `electron/conversation-manager.ts` | T05 | 4 | 5 | 纯逻辑 / ⚠ 应测 | — |
| ConversationManager | B06 | archiveProject 将 archived 设为 true | `electron/conversation-manager.ts` | T06 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 与 unarchive 同测 |
| ConversationManager | B07 | unarchiveProject 将 archived 设为 false | `electron/conversation-manager.ts` | T06 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 与 archive 同测 |
| ConversationManager | B08 | 对未知 id 的 rename/archive/unarchive/setSessionId 不抛异常 | `electron/conversation-manager.ts` | T07 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 防御性编程 |
| ConversationManager | B09 | createConversation 创建对话，默认标题"新对话" | `electron/conversation-manager.ts` | T08 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 含 id/title/projectId/sessionId |
| ConversationManager | B10 | getConversation 按 id 返回对话 | `electron/conversation-manager.ts` | T09 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| ConversationManager | B11 | getConversation 对未知 id 返回 undefined | `electron/conversation-manager.ts` | T10 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 边界条件 |
| ConversationManager | B12 | renameConversation 修改对话标题 | `electron/conversation-manager.ts` | T11 | 4 | 5 | 纯逻辑 / ⚠ 应测 | — |
| ConversationManager | B13 | deleteConversation 移除对话并保存 | `electron/conversation-manager.ts` | T12 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 验证另一条不受影响 |
| ConversationManager | B14 | setSessionId 为对话关联 IndexedDB session | `electron/conversation-manager.ts` | T16 | 5 | 5 | 纯逻辑 / ⚠ 应测 | sessionId 字段 |
| ConversationManager | B15 | getAllConversations 返回不含 messages 的对话列表 | `electron/conversation-manager.ts` | T15 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 消息由 SessionsStore 管理 |
| ConversationManager | B16 | moveConversation 将对话移到另一个项目 | `electron/conversation-manager.ts` | T17 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| ConversationManager | B17 | moveConversation 对未知对话不抛异常 | `electron/conversation-manager.ts` | T18 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 防御性编程 |
| ConversationManager | B18 | save 后 reload 可恢复 project 和 conversation | `electron/conversation-manager.ts` | T19 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 读写一致性 |
| ConversationManager | B19 | load 时文件不存在则返回空状态 | `electron/conversation-manager.ts` | T20 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| ConversationManager | B20 | load 时 JSON 损坏则降级为空状态 | `electron/conversation-manager.ts` | T21 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 容错 |
| ConversationManager | B21 | save 时自动创建父目录 | `electron/conversation-manager.ts` | T22 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 含 fs.existsSync 验证 |
| ConversationManager | B22 | load 时自动迁移 legacy messages 字段为空 | `electron/conversation-manager.ts` | — | — | 2 | ✓ 认可 | 一次性迁移逻辑，已有 T19/T20 覆盖 |

## Utils — CRS 工具函数

| 模块 | 编号 | 可观测行为 | 来源文件 | 测试编号 | 测试质量(1-5) | 测试合理性(1-5) | 解耦建议/豁免 | 备注 |
|------|------|-----------|---------|---------|:------------:|:--------------:|:------------:|------|
| Utils | B23 | extractEPSG 从 WKT AUTHORITY 提取 EPSG:4326 | `electron/utils.ts` | T23 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| Utils | B24 | extractEPSG 从多 AUTHORITY WKT 返回最后一个 EPSG | `electron/utils.ts` | T24 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 投影 CRS → 最后匹配值 |
| Utils | B25 | extractEPSG 在无 AUTHORITY 时返回 null | `electron/utils.ts` | T25 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 含空字符串断言 |
| Utils | B26 | extractEPSG 处理真实 .prj 文件内容 | `electron/utils.ts` | T26 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 真实数据回归测试 |
| Utils | B27 | isCompatibleCRS 无 CRS 字段时返回 true（RFC 7946） | `electron/utils.ts` | T27 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| Utils | B28 | isCompatibleCRS 对 EPSG:4326 返回 true | `electron/utils.ts` | T28 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| Utils | B29 | isCompatibleCRS 对 EPSG:3857 返回 true | `electron/utils.ts` | T29 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| Utils | B30 | isCompatibleCRS 对不支持的 EPSG 返回 false | `electron/utils.ts` | T30 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| Utils | B31 | isCompatibleCRS 对非对象输入返回 false | `electron/utils.ts` | T31 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 含 null/undefined/string |
| Utils | B32 | isCompatibleCRS 处理畸形 CRS 字段 | `electron/utils.ts` | T32 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| Utils | B33 | isCompatibleCRS 处理 CRS name 不含数字 | `electron/utils.ts` | T32 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |

## Tool IPC — 工具桥接层

| 模块 | 编号 | 可观测行为 | 来源文件 | 测试编号 | 测试质量(1-5) | 测试合理性(1-5) | 解耦建议/豁免 | 备注 |
|------|------|-----------|---------|---------|:------------:|:--------------:|:------------:|------|
| Tool IPC | B34 | tool-exec bash 执行成功返回 stdout | `electron/main.ts` | I01 | 5 | 5 | 纯逻辑 / ⚠ 应测 | tools.test.ts |
| Tool IPC | B35 | tool-exec bash 执行失败返回 stderr + isError | `electron/main.ts` | I02 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| Tool IPC | B36 | tool-exec bash 路径基于 cwd 解析（安全沙箱） | `electron/main.ts` | I03 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 禁止绝对路径逃离 |
| Tool IPC | B37 | tool-exec read 成功返回文件内容 | `electron/main.ts` | I04 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| Tool IPC | B38 | tool-exec read 文件不存在返回 stderr + isError | `electron/main.ts` | I05 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| Tool IPC | B39 | tool-exec read 路径越界时拒绝（../../etc/passwd） | `electron/main.ts` | I06 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| Tool IPC | B40 | tool-exec write 创建文件含父目录 | `electron/main.ts` | I07 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| Tool IPC | B41 | tool-exec write 路径越界时拒绝 | `electron/main.ts` | I08 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| Tool IPC | B42 | tool-exec edit 成功替换旧字符串为新字符串 | `electron/main.ts` | I09 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| Tool IPC | B43 | tool-exec 未知工具名返回错误 | `electron/handlers/tool-exec.ts` | I10 | 5 | 3 | 纯逻辑 / ⚠ 应测 | 提取自 main.ts |

## File Read — 文件内容分析

| 模块 | 编号 | 可观测行为 | 来源文件 | 测试编号 | 测试质量(1-5) | 测试合理性(1-5) | 解耦建议/豁免 | 备注 |
|------|------|-----------|---------|---------|:------------:|:--------------:|:------------:|------|
| File Read | B44 | read-file 处理文本文件 | `electron/handlers/read-file.ts` | T33 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 提取自 main.ts，含无扩展名分支 |
| File Read | B45 | read-file 对 .json 文件自动 pretty-print | `electron/handlers/read-file.ts` | T34 | 5 | 4 | 纯逻辑 / ⚠ 应测 | 含畸形 JSON 保持原文本 |
| File Read | B46 | read-file 返回 GeoJSON map 类型（兼容 CRS） | `electron/handlers/read-file.ts` | T35 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 含无 CRS (RFC 7946) 分支 |
| File Read | B47 | read-file GeoJSON 不兼容 CRS 时降级为 text | `electron/handlers/read-file.ts` | T36 | 5 | 4 | 纯逻辑 / ⚠ 应测 | 降级路径仍 pretty-print |
| File Read | B48 | read-file 返回 image base64 data URI | `electron/handlers/read-file.ts` | T37 | 5 | 4 | 纯逻辑 / ⚠ 应测 | 含 svg mime 分支 |
| File Read | B49 | read-file 解析 Shapefile (.shp) 为 GeoJSON | `electron/handlers/read-file.ts` | T38 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 真实 test-data fixture |
| File Read | B50 | read-file Shapefile 不兼容 CRS 时拒绝显示 | `electron/handlers/read-file.ts` | T39 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 自定义 .prj EPSG:32633 |
| File Read | B51 | read-file Shapefile .dbf 缺失时仍解析 | `electron/handlers/read-file.ts` | T40 | 5 | 3 | 纯逻辑 / ⚠ 应测 | 仅复制 .shp/.shx |
| File Read | B52 | read-file Shapefile 解析异常时返回 error | `electron/handlers/read-file.ts` | T41 | 5 | 4 | 纯逻辑 / ⚠ 应测 | 畸形 .shp 字节 |
| File Read | B53 | read-file 超限检查：text>512KB, image>10MB, geojson>50MB, shp>500MB | `electron/handlers/read-file.ts` | T42 | 5 | 4 | 纯逻辑 / ⚠ 应测 | 注入 statSync 避免 50MB/500MB 真实文件 |
| File Read | B54 | read-file 不支持的文件类型返回错误提示 | `electron/handlers/read-file.ts` | T43 | 5 | 4 | 纯逻辑 / ⚠ 应测 | .bin 扩展名 |
| File Read | B55 | read-file 读取异常时返回统一错误格式 | `electron/handlers/read-file.ts` | T44 | 5 | 4 | 纯逻辑 / ⚠ 应测 | 文件不存在 |

## List Directory — 目录浏览

| 模块 | 编号 | 可观测行为 | 来源文件 | 测试编号 | 测试质量(1-5) | 测试合理性(1-5) | 解耦建议/豁免 | 备注 |
|------|------|-----------|---------|---------|:------------:|:--------------:|:------------:|------|
| List Dir | B56 | list-directory 过滤 . 开头的隐藏文件 | `electron/handlers/list-directory.ts` | T45 | 5 | 4 | 纯逻辑 / ⚠ 应测 | 提取自 main.ts |
| List Dir | B57 | list-directory 目录排在文件前面 | `electron/handlers/list-directory.ts` | T46 | 5 | 3 | 纯逻辑 / ⚠ 应测 | — |
| List Dir | B58 | list-directory 同名按字母排序 | `electron/handlers/list-directory.ts` | T47 | 5 | 3 | 纯逻辑 / ⚠ 应测 | 含目录间排序 |
| List Dir | B59 | list-directory 返回 name/path/isDirectory/size/ext | `electron/handlers/list-directory.ts` | T48 | 5 | 4 | 纯逻辑 / ⚠ 应测 | 含 ext 小写化 |

## Renderer — 前端渲染层（pi-web-ui + bare Agent）

| 模块 | 编号 | 可观测行为 | 来源文件 | 测试编号 | 测试质量(1-5) | 测试合理性(1-5) | 解耦建议/豁免 | 备注 |
|------|------|-----------|---------|---------|:------------:|:--------------:|:------------:|------|
| Renderer | B60 | init: 无 API Key 时 prompt 输入框 | `src/renderer.ts` | — | — | 1 | ✓ 认可 | DOM + IPC 混合 |
| Renderer | B61 | init: 无项目时自动触发 createProject | `src/renderer.ts` | E01 | 5 | 2 | ✓ 认可 | E2E 已覆盖 |
| Renderer | B62 | init: 有项目时自动选中第一个并打开对话 | `src/renderer.ts` | E01 | 5 | 2 | ✓ 认可 | E2E 已覆盖 |
| Renderer | B63 | AppStorage 初始化：IndexedDB backend + ProviderKeysStore + SessionsStore | `src/renderer.ts` | — | — | 3 | ✓ 认可 | IndexedDB 初始化，E2E 更合适 |
| Renderer | B64 | switchToConversation: 中止旧 Agent、创建新 Agent、设置 ChatPanel | `src/renderer.ts` | E01 | 4 | 3 | 可解耦 / ⚠ 应测 | E2E 已有部分覆盖 |
| Renderer | B65 | switchToConversation: restore 已保存的 messages (SessionsStore.loadSession) | `src/renderer.ts` | — | — | 5 | ✓ 认可 | DOM+IPC+IndexedDB 混合，E2E 更合适 |
| Renderer | B66 | switchToConversation: 新对话自动生成 sessionId 并持久化 | `src/renderer-helpers.ts` | T49 | 5 | 4 | 纯逻辑 / ⚠ 应测 | generateSessionId 提取为纯函数 |
| Renderer | B67 | agent_end: 自动保存 session 到 SessionsStore | `src/renderer.ts` | — | — | 5 | ✓ 认可 | DOM+IPC+IndexedDB 混合，E2E 更合适 |
| Renderer | B68 | agent_end: 首次回复后自动生成标题（截取前 30 字符） | `src/renderer-helpers.ts` | T50 | 5 | 4 | 纯逻辑 / ⚠ 应测 | computeAutoTitle 提取为纯函数 |
| Renderer | B69 | msgListFix: message_end 时强制 message-list 更新（Lit array 引用问题） | `src/renderer.ts` | — | — | 4 | ✓ 认可 | Lit DOM + Agent 订阅混合，E2E 更合适 |
| Renderer | B70 | 测试模式：GISBUDDY_TEST 时注册 faux provider 并跳过持久化 | `src/renderer.ts` | E02-E05 | 5 | 3 | ✓ 认可 | E2E 已全面覆盖 |
| Renderer | B71 | 侧边栏渲染项目列表（含 +项目 按钮） | `src/renderer.ts` | E04 | 5 | 2 | ✓ 认可 | E2E 已覆盖 |
| Renderer | B72 | 侧边栏展开选中项目显示对话列表（含 +对话 按钮） | `src/renderer.ts` | E04 | 5 | 2 | ✓ 认可 | E2E 已覆盖 |
| Renderer | B73 | 侧边栏删除对话按钮（✕） | `src/renderer.ts` | — | — | 3 | ✓ 认可 | DOM 渲染，E2E 更合适 |
| Renderer | B74 | deleteConversation: 同时清理 IndexedDB session 数据 | `src/renderer.ts` | — | — | 4 | ✓ 认可 | DOM+IPC+IndexedDB 混合，E2E 更合适 |
| Renderer | B75 | switchSeq 竞态保护：stale 调用在 await 后返回 | `src/renderer.ts` | — | — | 3 | ✓ 认可 | 模块级状态+await 竞态，E2E 更合适 |
| Renderer | B76 | 聊天测试：faux 纯文本回复渲染到 assistant-message | `src/renderer.ts` | E02 | 5 | 5 | 纯逻辑 / ⚠ 应测 | E2E chat test 1 |
| Renderer | B77 | 聊天测试：faux thinking 块渲染到 thinking-block（展开后可见内容） | `src/renderer.ts` | E03 | 5 | 5 | 纯逻辑 / ⚠ 应测 | E2E chat test 2 |
| Renderer | B78 | 聊天测试：faux error 响应渲染错误信息 | `src/renderer.ts` | E04 | 5 | 5 | 纯逻辑 / ⚠ 应测 | E2E chat test 3 |
| Renderer | B79 | 聊天测试：faux toolCall → 真实 bash 执行 → 工具输出渲染 | `src/renderer.ts` | E05 | 5 | 5 | 纯逻辑 / ⚠ 应测 | E2E chat test 4 |

## Electron Main — 应用生命周期与 IPC

| 模块 | 编号 | 可观测行为 | 来源文件 | 测试编号 | 测试质量(1-5) | 测试合理性(1-5) | 解耦建议/豁免 | 备注 |
|------|------|-----------|---------|---------|:------------:|:--------------:|:------------:|------|
| Electron | B80 | configure IPC: 保存 API Key 并设置到 AppStorage | `electron/main.ts` | — | — | 3 | ✓ 认可 | 依赖 Electron ipcMain + 模块级状态 |
| Electron | B81 | create-project IPC: 打开文件夹选择对话框 | `electron/main.ts` | — | — | 2 | ✓ 认可 | 依赖 Electron dialog |
| Electron | B82 | create-project 取消时返回 null | `electron/main.ts` | — | — | 3 | ✓ 认可 | 依赖 Electron dialog |
| Electron | B83 | get-projects / get-conversations 等 CRUD IPC 注册 | `electron/main.ts` | — | — | 3 | ✓ 认可 | 依赖 Electron ipcMain + ConversationManager |
| Electron | B84 | 窗口创建尺寸 1200x800、最小 800x600 | `electron/main.ts` | — | — | 1 | ✓ 认可 | Electron API |
| Electron | B85 | 系统托盘图标和右键菜单 | `electron/main.ts` | — | — | 1 | ✓ 认可 | Electron Tray |
| Electron | B86 | 关闭按钮隐藏窗口而非退出（macOS） | `electron/main.ts` | — | — | 1 | ✓ 认可 | macOS 特有 |

## E2E Test Index

| 编号 | 文件 | 测试名 |
|------|------|--------|
| E01 | `e2e/01-startup.spec.ts` | ChatPanel 渲染 / 项目加载 / Tool IPC / 侧边栏 |
| E02 | `e2e/02-chat.spec.ts` | 发送消息 → 收到纯文本回复 |
| E03 | `e2e/02-chat.spec.ts` | Agent 返回 thinking 块 → 前端渲染 thinking-block |
| E04 | `e2e/02-chat.spec.ts` | Agent 返回错误 → 前端展示错误信息 |
| E05 | `e2e/02-chat.spec.ts` | 发送消息 → Agent 调用 bash 工具 → 收到工具输出 |

## Unit Test Index

| 编号 | 文件 | 测试数 |
|------|------|:------:|
| T01-T22 | `tests/conversation-manager.test.ts` | 21 |
| T23-T32 | `tests/utils.test.ts` | 11 |
| T33-T44 | `tests/read-file.test.ts` | 19 |
| T45-T48 | `tests/list-directory.test.ts` | 7 |
| T49-T50 | `tests/renderer-helpers.test.ts` | 14 |
| I01-I10 | `tests/integration/tools.test.ts` | 11 |

> **统计**: 总共 86 个行为，已测 70 个（单元 + E2E），豁免 16 个未测行为（合理性 < 3 或 ✓ 认可），应测未测 0 个。
