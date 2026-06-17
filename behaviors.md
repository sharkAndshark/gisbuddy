# GISBuddy 可观测行为与测试对照表

> 本文件用于 `npm run lint:behaviors` 检查，未测行为（测试合理性 ≥ 3 且未豁免）会触发警告。

## ConversationManager — 数据持久化

| 模块 | 编号 | 可观测行为 | 来源文件 | 测试编号 | 测试质量(1-5) | 测试合理性(1-5) | 解耦建议/豁免 | 备注 |
|------|------|-----------|---------|---------|:------------:|:--------------:|:------------:|------|
| ConversationManager | B01 | 初始状态 projects 列表为空 | `electron/conversation-manager.ts:27-45` | T01 | 4 | 5 | 纯逻辑 / ⚠ 应测 | — |
| ConversationManager | B02 | createProject 传入 folderPath 创建项目、自定标题 | `electron/conversation-manager.ts:63-75` | T02 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 含 id/title/archived/createdAt 断言 |
| ConversationManager | B03 | getProject 按 id 返回项目 | `electron/conversation-manager.ts:59-61` | T03 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| ConversationManager | B04 | getProject 对未知 id 返回 undefined | `electron/conversation-manager.ts:59-61` | T04 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 边界条件 |
| ConversationManager | B05 | renameProject 修改标题并保存 | `electron/conversation-manager.ts:77-84` | T05 | 4 | 5 | 纯逻辑 / ⚠ 应测 | — |
| ConversationManager | B06 | archiveProject 将 archived 设为 true | `electron/conversation-manager.ts:86-92` | T06 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 与 unarchive 同测 |
| ConversationManager | B07 | unarchiveProject 将 archived 设为 false | `electron/conversation-manager.ts:95-102` | T06 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 与 archive 同测 |
| ConversationManager | B08 | 对未知 id 的 rename/archive/unarchive 不抛异常 | `electron/conversation-manager.ts:77-102` | T07 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 防御性编程 |
| ConversationManager | B09 | create 在项目下创建对话、默认标题"新对话" | `electron/conversation-manager.ts:123-135` | T08 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 含 id/title/projectId/messages/createdAt 断言 |
| ConversationManager | B10 | get 按 id 返回对话（含 messages 字段） | `electron/conversation-manager.ts:119-121` | T09 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| ConversationManager | B11 | get 对未知 id 返回 undefined | `electron/conversation-manager.ts:119-121` | T10 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 边界条件 |
| ConversationManager | B12 | rename 修改对话标题 | `electron/conversation-manager.ts:142-149` | T11 | 4 | 5 | 纯逻辑 / ⚠ 应测 | — |
| ConversationManager | B13 | delete 移除对话并保存 | `electron/conversation-manager.ts:137-140` | T12 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 验证另一条不受影响 |
| ConversationManager | B14 | getMessages 对新对话返回空数组 | `electron/conversation-manager.ts:151-153` | T13 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| ConversationManager | B15 | getMessages 对未知对话返回空数组 | `electron/conversation-manager.ts:151-153` | T14 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 防御性编程 |
| ConversationManager | B16 | getAll 返回不含 messages 字段的对话列表 | `electron/conversation-manager.ts:115-117` | T15 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 防止消息泄露 |
| ConversationManager | B17 | moveConversation 将对话移到另一个项目 | `electron/conversation-manager.ts:104-111` | T16 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| ConversationManager | B18 | moveConversation 对未知对话不抛异常 | `electron/conversation-manager.ts:104-111` | T17 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 防御性编程 |
| ConversationManager | B19 | save 后 reload 可恢复 project 和 conversation | `electron/conversation-manager.ts:27-51` | T18 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 读写一致性 |
| ConversationManager | B20 | load 时文件不存在则返回空状态 | `electron/conversation-manager.ts:32-45` | T19 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| ConversationManager | B21 | load 时 JSON 损坏则降级为空状态 | `electron/conversation-manager.ts:32-45` | T20 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 容错 |
| ConversationManager | B22 | save 时自动创建父目录 | `electron/conversation-manager.ts:47-51` | T21 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 含 fs.existsSync 验证 |

## Utils — CRS 工具函数

| 模块 | 编号 | 可观测行为 | 来源文件 | 测试编号 | 测试质量(1-5) | 测试合理性(1-5) | 解耦建议/豁免 | 备注 |
|------|------|-----------|---------|---------|:------------:|:--------------:|:------------:|------|
| Utils | B23 | extractEPSG 从 WKT AUTHORITY 提取 EPSG:4326 | `electron/utils.ts:23-30` | T22 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| Utils | B24 | extractEPSG 从多 AUTHORITY WKT 返回最后一个 EPSG | `electron/utils.ts:23-30` | T23 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 投影 CRS → 最后匹配值 |
| Utils | B25 | extractEPSG 在无 AUTHORITY 时返回 null | `electron/utils.ts:23-30` | T24 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 含空字符串断言 |
| Utils | B26 | extractEPSG 处理真实 .prj 文件内容 | `electron/utils.ts:23-30` | T25 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 真实数据回归测试 |
| Utils | B27 | isCompatibleCRS 无 CRS 字段时返回 true（RFC 7946） | `electron/utils.ts:1-16` | T26 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 含 {} 和 {type} 输入 |
| Utils | B28 | isCompatibleCRS 对 EPSG:4326 返回 true | `electron/utils.ts:1-16` | T27 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 含 urn 和 EPSG: 两种格式 |
| Utils | B29 | isCompatibleCRS 对 EPSG:3857 返回 true | `electron/utils.ts:1-16` | T28 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| Utils | B30 | isCompatibleCRS 对不支持的 EPSG 返回 false | `electron/utils.ts:1-16` | T29 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |
| Utils | B31 | isCompatibleCRS 对非对象输入返回 false | `electron/utils.ts:1-16` | T30 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 含 null/undefined/string |
| Utils | B32 | isCompatibleCRS 处理畸形 CRS 字段 | `electron/utils.ts:1-16` | T31 | 5 | 5 | 纯逻辑 / ⚠ 应测 | 含 crs:null/string/number/缺属性 |
| Utils | B33 | isCompatibleCRS 处理 CRS name 不含数字 | `electron/utils.ts:1-16` | T31 | 5 | 5 | 纯逻辑 / ⚠ 应测 | — |

## Agent — AI 代理

| 模块 | 编号 | 可观测行为 | 来源文件 | 测试编号 | 测试质量(1-5) | 测试合理性(1-5) | 解耦建议/豁免 | 备注 |
|------|------|-----------|---------|---------|:------------:|:--------------:|:------------:|------|
| Agent | B34 | 构造函数接收 apiKey 并创建 OpenAI client | `electron/agent.ts:201-208` | 无 | — | 4 | 可解耦 / ⚠ 应测 | mock OpenAI SDK 即可 |
| Agent | B35 | chat() 自动在消息前注入 SYSTEM_PROMPT | `electron/agent.ts:211-220` | 无 | — | 4 | 可解耦 / ⚠ 应测 | 验证 apiMessages[0] 含 prompt |
| Agent | B36 | chat() 发送流式请求到 DeepSeek API | `electron/agent.ts:232-242` | 无 | — | 3 | 可解耦 / ⚠ 应测 | mock API 验证参数 |
| Agent | B37 | chat() 通过 text_delta 事件流式输出文本 | `electron/agent.ts:275-278` | 无 | — | 4 | 可解耦 / ⚠ 应测 | mock stream chunk 验证回调 |
| Agent | B38 | chat() 通过 thinking 事件流式输出推理内容 | `electron/agent.ts:267-273` | 无 | — | 3 | 可解耦 / ⚠ 应测 | reasoning_content 流 |
| Agent | B39 | chat() 从 stream chunk 累积 tool_calls | `electron/agent.ts:280-291` | 无 | — | 4 | 可解耦 / ⚠ 应测 | 验证 toolCallAccum 累积逻辑 |
| Agent | B40 | chat() finish_reason=tool_calls 时执行工具 | `electron/agent.ts:304-378` | 无 | — | 5 | 可解耦 / ⚠ 应测 | 核心循环逻辑 |
| Agent | B41 | chat() 最多迭代 10 次后报错 | `electron/agent.ts:222,389-392` | 无 | — | 4 | 可解耦 / ⚠ 应测 | 需要模拟多次 tool_calls |
| Agent | B42 | chat() AbortSignal 在 API 调用前中止 | `electron/agent.ts:224-227` | 无 | — | 4 | 可解耦 / ⚠ 应测 | 传入 aborted signal |
| Agent | B43 | chat() AbortSignal 在 stream 中中止 | `electron/agent.ts:262-265,299-301` | 无 | — | 3 | 可解耦 / ⚠ 应测 | mid-stream abort |
| Agent | B44 | chat() 处理 API 调用异常并发送 error 事件 | `electron/agent.ts:243-252` | 无 | — | 4 | 可解耦 / ⚠ 应测 | mock API throw |
| Agent | B45 | chat() 最终返回完整文本内容 | `electron/agent.ts:381-387` | 无 | — | 4 | 可解耦 / ⚠ 应测 | 验证返回值 |
| Agent | B46 | chat() 达最大迭代时发送 error 事件 | `electron/agent.ts:390-392` | 无 | — | 4 | 可解耦 / ⚠ 应测 | 触发 onEvent('error') |
| Agent | B47 | getBundledGdalPath 在 __dirname 找到 gdal-bin | `electron/agent.ts:109-119` | 无 | — | 3 | 可解耦 / ⚠ 应测 | 需要 mock fs.existsSync |
| Agent | B48 | getBundledGdalPath 未找到时返回 null | `electron/agent.ts:109-119` | 无 | — | 3 | 可解耦 / ⚠ 应测 | mock 所有路径均不存在 |
| Agent | B49 | executeTool bash 执行成功返回 stdout | `electron/agent.ts:123-146` | 无 | — | 5 | 可解耦 / ⚠ 应测 | mock execSync 返回 |
| Agent | B50 | executeTool bash 执行失败返回 stderr | `electron/agent.ts:139-146` | 无 | — | 5 | 可解耦 / ⚠ 应测 | mock execSync throw |
| Agent | B51 | executeTool bash 将 gdal-bin 追加到 PATH | `electron/agent.ts:125-129` | 无 | — | 4 | 可解耦 / ⚠ 应测 | 验证 env.PATH |
| Agent | B52 | executeTool read 成功返回文件内容 | `electron/agent.ts:149-157` | 无 | — | 5 | 可解耦 / ⚠ 应测 | mock fs.readFileSync |
| Agent | B53 | executeTool read 文件不存在返回 stderr | `electron/agent.ts:154-156` | 无 | — | 4 | 可解耦 / ⚠ 应测 | mock throw |
| Agent | B54 | executeTool write 创建文件含父目录 | `electron/agent.ts:160-172` | 无 | — | 5 | 可解耦 / ⚠ 应测 | 验证 mkdirSync + writeFileSync 调用 |
| Agent | B55 | executeTool write 失败返回 stderr | `electron/agent.ts:168-170` | 无 | — | 4 | 可解耦 / ⚠ 应测 | mock throw |
| Agent | B56 | executeTool edit 成功替换文本 | `electron/agent.ts:174-199` | 无 | — | 5 | 可解耦 / ⚠ 应测 | mock 文件读写，验证 replacement |
| Agent | B57 | executeTool edit 未找到匹配文本时返回失败 | `electron/agent.ts:180-186` | 无 | — | 5 | 可解耦 / ⚠ 应测 | content 不含 oldStr |
| Agent | B58 | executeTool edit 文件不存在时返回错误 | `electron/agent.ts:190-192` | 无 | — | 4 | 可解耦 / ⚠ 应测 | mock readFileSync throw |

## File Browser — 文件浏览器

| 模块 | 编号 | 可观测行为 | 来源文件 | 测试编号 | 测试质量(1-5) | 测试合理性(1-5) | 解耦建议/豁免 | 备注 |
|------|------|-----------|---------|---------|:------------:|:--------------:|:------------:|------|
| File Browser | B59 | list-directory 过滤 . 开头的隐藏文件 | `electron/main.ts:266-284` | 无 | — | 4 | 可解耦 / ⚠ 应测 | mock fs.readdirSync |
| File Browser | B60 | list-directory 目录排在文件前面 | `electron/main.ts:266-284` | 无 | — | 3 | 可解耦 / ⚠ 应测 | 验证排序规则 |
| File Browser | B61 | list-directory 同名按字母排序 | `electron/main.ts:266-284` | 无 | — | 3 | 可解耦 / ⚠ 应测 | localeCompare |
| File Browser | B62 | list-directory 返回 name/path/isDirectory/size/ext | `electron/main.ts:266-284` | 无 | — | 4 | 可解耦 / ⚠ 应测 | 验证返回结构 |
| File Browser | B63 | read-file 处理文本文件 | `electron/main.ts:249-258` | 无 | — | 5 | 可解耦 / ⚠ 应测 | mock fs.statSync + readFileSync |
| File Browser | B64 | read-file 对 .json 文件自动 pretty-print | `electron/main.ts:253-256` | 无 | — | 4 | 可解耦 / ⚠ 应测 | 验证 JSON.stringify 缩进 |
| File Browser | B65 | read-file 返回 GeoJSON map 类型（兼容 CRS） | `electron/main.ts:200-215` | 无 | — | 5 | 可解耦 / ⚠ 应测 | CRS 4326/3857 → geojson 类型 |
| File Browser | B66 | read-file GeoJSON 不兼容 CRS 时降级为 text | `electron/main.ts:206-215` | 无 | — | 4 | 可解耦 / ⚠ 应测 | 验证 fallback 路径 |
| File Browser | B67 | read-file 返回 image base64 data URI | `electron/main.ts:191-198` | 无 | — | 4 | 可解耦 / ⚠ 应测 | mock image buffer |
| File Browser | B68 | read-file 解析 Shapefile (.shp) 为 GeoJSON | `electron/main.ts:218-247` | 无 | — | 5 | 可解耦 / ⚠ 应测 | mock shapefile.read |
| File Browser | B69 | read-file Shapefile 不兼容 CRS 时拒绝显示 | `electron/main.ts:224-236` | 无 | — | 5 | 可解耦 / ⚠ 应测 | EPSG 非 4326/3857 → error |
| File Browser | B70 | read-file Shapefile .dbf 缺失时仍解析 | `electron/main.ts:239-241` | 无 | — | 3 | 可解耦 / ⚠ 应测 | dbfPath = null 路径 |
| File Browser | B71 | read-file Shapefile 解析异常时返回 error | `electron/main.ts:244-246` | 无 | — | 4 | 可解耦 / ⚠ 应测 | mock read throw |
| File Browser | B72 | read-file 文本文件 > 512KB 返回尺寸超限错误 | `electron/main.ts:250-252` | 无 | — | 4 | 可解耦 / ⚠ 应测 | mock stat.size 超限 |
| File Browser | B73 | read-file 图片 > 10MB 返回尺寸超限错误 | `electron/main.ts:192-194` | 无 | — | 3 | 可解耦 / ⚠ 应测 | mock stat.size 超限 |
| File Browser | B74 | read-file GeoJSON > 50MB 返回尺寸超限错误 | `electron/main.ts:201-203` | 无 | — | 3 | 可解耦 / ⚠ 应测 | mock stat.size 超限 |
| File Browser | B75 | read-file Shapefile > 500MB 返回尺寸超限错误 | `electron/main.ts:219-221` | 无 | — | 3 | 可解耦 / ⚠ 应测 | mock stat.size 超限 |
| File Browser | B76 | read-file 不支持的文件类型返回错误提示 | `electron/main.ts:260` | 无 | — | 4 | 可解耦 / ⚠ 应测 | 未在 TEXT_EXTS/IMAGE_EXTS/geojson/shp |
| File Browser | B77 | read-file 读取异常时返回统一错误格式 | `electron/main.ts:261-263` | 无 | — | 4 | 可解耦 / ⚠ 应测 | try-catch 兜底 |

## Chat Handler — 聊天 IPC

| 模块 | 编号 | 可观测行为 | 来源文件 | 测试编号 | 测试质量(1-5) | 测试合理性(1-5) | 解耦建议/豁免 | 备注 |
|------|------|-----------|---------|---------|:------------:|:--------------:|:------------:|------|
| Chat Handler | B78 | chat 未配置 agent 时抛出错误 | `electron/main.ts:287-289` | 无 | — | 4 | 可解耦 / ⚠ 应测 | agent === null 路径 |
| Chat Handler | B79 | chat 对话不存在时抛出错误 | `electron/main.ts:291-292` | 无 | — | 4 | 可解耦 / ⚠ 应测 | conv undefined 路径 |
| Chat Handler | B80 | chat 对话所属项目不存在时抛出错误 | `electron/main.ts:294-295` | 无 | — | 4 | 可解耦 / ⚠ 应测 | project undefined 路径 |
| Chat Handler | B81 | chat 自动解归档：archived 项目发消息时取消归档 | `electron/main.ts:298-300` | 无 | — | 5 | 可解耦 / ⚠ 应测 | 验证 unarchiveProject 调用 |
| Chat Handler | B82 | chat 中止同一 convId 的旧请求 | `electron/main.ts:303-308` | 无 | — | 4 | 可解耦 / ⚠ 应测 | 验证 controller.abort 调用 |
| Chat Handler | B83 | chat 将用户消息存入 conv.messages | `electron/main.ts:311-312` | 无 | — | 4 | 可解耦 / ⚠ 应测 | 验证 push + updatedAt |
| Chat Handler | B84 | chat 在 agent.chat() 完成后调用 save() | `electron/main.ts:342` | 无 | — | 3 | 可解耦 / ⚠ 应测 | 验证 save 调用时机 |
| Chat Handler | B85 | chat 首次回复时自动生成标题（截取前 30 字符） | `electron/main.ts:344-349` | 无 | — | 4 | 可解耦 / ⚠ 应测 | title==='新对话' 且 finalReply 存在 |
| Chat Handler | B86 | chat 返回 updatedTitle 给渲染进程 | `electron/main.ts:352` | 无 | — | 3 | 可解耦 / ⚠ 应测 | 验证返回值结构 |
| Chat Handler | B87 | cancel-chat 中止并清除 abort controller | `electron/main.ts:355-363` | 无 | — | 3 | 可解耦 / ⚠ 应测 | 验证 abort + delete |
| Chat Handler | B88 | safeSend 忽略已销毁窗口的发送错误 | `electron/main.ts:316-321` | 无 | — | 3 | 可解耦 / ⚠ 应测 | 窗口关闭时静默丢弃 |

## Electron Main — 应用生命周期

| 模块 | 编号 | 可观测行为 | 来源文件 | 测试编号 | 测试质量(1-5) | 测试合理性(1-5) | 解耦建议/豁免 | 备注 |
|------|------|-----------|---------|---------|:------------:|:--------------:|:------------:|------|
| Electron Main | B89 | configure IPC 创建 Agent 实例 | `electron/main.ts:113-116` | 无 | — | 3 | 可解耦 / ⚠ 应测 | mock IPC handler |
| Electron Main | B90 | create-project IPC 打开文件夹选择对话框 | `electron/main.ts:145-161` | 无 | — | 2 | 难解耦 / ✓ 认可 | 依赖 Electron dialog，集成测试更适合 |
| Electron Main | B91 | create-project 取消时返回 null | `electron/main.ts:155-158` | 无 | — | 3 | 可解耦 / ⚠ 应测 | mock dialog 取消 |
| Electron Main | B92 | get-projects / get-conversations 等查询 IPC 注册 | `electron/main.ts:120-122,141-143` | 无 | — | 3 | 可解耦 / ⚠ 应测 | 验证 handler 调用 CM 方法 |
| Electron Main | B93 | 窗口创建尺寸 1200x800、最小 800x600 | `electron/main.ts:61-65` | 无 | — | 1 | 难解耦 / ✓ 认可 | Electron BrowserWindow 构造，集成测试 |
| Electron Main | B94 | macOS 隐藏 Dock 图标 | `electron/main.ts:57-59` | 无 | — | 1 | 难解耦 / ✓ 认可 | 平台特定行为 |
| Electron Main | B95 | 系统托盘图标和右键菜单 | `electron/main.ts:24-53` | 无 | — | 1 | 难解耦 / ✓ 认可 | Electron Tray API |
| Electron Main | B96 | 托盘点击切换窗口显隐 | `electron/main.ts:46-53` | 无 | — | 1 | 难解耦 / ✓ 认可 | 依赖 Tray 和 BrowserWindow |
| Electron Main | B97 | F12 键切换开发者工具 | `electron/main.ts:86-89` | 无 | — | 1 | 难解耦 / ✓ 认可 | 开发便捷功能，非核心 |
| Electron Main | B98 | 关闭按钮隐藏窗口而非退出 | `electron/main.ts:79-84` | 无 | — | 1 | 难解耦 / ✓ 认可 | macOS 特有行为 |
| Electron Main | B99 | getIconPath 开发/生产路径兼容 | `electron/main.ts:16-22` | 无 | — | 2 | 可解耦 / ✓ 认可 | 非关键逻辑 |

## Renderer — UI 层

| 模块 | 编号 | 可观测行为 | 来源文件 | 测试编号 | 测试质量(1-5) | 测试合理性(1-5) | 解耦建议/豁免 | 备注 |
|------|------|-----------|---------|---------|:------------:|:--------------:|:------------:|------|
| Renderer | B100 | 启动时从 localStorage 恢复 API Key 并配置 Agent | `src/app.js:1224-1236` | 无 | — | 1 | 难解耦 / ✓ 认可 | Electron 环境 + IPC 调用 |
| Renderer | B101 | 启动时恢复用户头像和昵称 | `src/app.js:149-160,1225` | 无 | — | 1 | 难解耦 / ✓ 认可 | localStorage 依赖 |
| Renderer | B102 | 欢迎页展示 4 个快捷操作按钮 | `src/app.js:208-214` | 无 | — | 1 | 难解耦 / ✓ 认可 | DOM 渲染验证 |
| Renderer | B103 | 设置模态框：输入 API Key 并保存 | `src/app.js:104-147` | 无 | — | 2 | 难解耦 / ✓ 认可 | DOM + IPC 混合 |
| Renderer | B104 | 用户 Profile 模态框：选择头像、编辑昵称 | `src/app.js:163-199` | 无 | — | 1 | 难解耦 / ✓ 认可 | 20 个 emoji 选择器 |
| Renderer | B105 | 侧边栏对话列表按项目层级渲染 | `src/app.js:228-389` | 无 | — | 1 | 难解耦 / ✓ 认可 | 大量 DOM 操作 |
| Renderer | B106 | 项目折叠/展开 toggle（状态存 localStorage） | `src/app.js:254-366,469-476` | 无 | — | 1 | 难解耦 / ✓ 认可 | DOM + localStorage |
| Renderer | B107 | 右键上下文菜单：项目操作 | `src/app.js:295-299,517-537` | 无 | — | 1 | 难解耦 / ✓ 认可 | 动态 DOM 创建与事件 |
| Renderer | B108 | 右键上下文菜单：对话操作（移动、删除） | `src/app.js:450,539-573` | 无 | — | 1 | 难解耦 / ✓ 认可 | 含子菜单 |
| Renderer | B109 | 双击标题进入内联编辑模式 | `src/app.js:291-294,429-449` | 无 | — | 1 | 难解耦 / ✓ 认可 | 创建 input 元素并绑定事件 |
| Renderer | B110 | 文件浏览器标签栏：最大缓存 20 个文件 | `src/app.js:701-858` | 无 | — | 1 | 难解耦 / ✓ 认可 | Tab 切换和缓存逻辑 |
| Renderer | B111 | Markdown 渲染 AI 回复（marked 库） | `src/app.js:1048-1051,1187-1192` | 无 | — | 1 | 难解耦 / ✓ 认可 | 文本 → HTML 转换 |
| Renderer | B112 | Thinking 块流式渲染 | `src/app.js:1009-1019,1167-1173` | 无 | — | 1 | 难解耦 / ✓ 认可 | DOM 流式追加 |
| Renderer | B113 | Tool Call 卡片渲染（含展开/折叠） | `src/app.js:1068-1165` | 无 | — | 1 | 难解耦 / ✓ 认可 | 复杂的 DOM 结构 |
| Renderer | B114 | Leaflet 地图渲染 GeoJSON（circleMarker） | `src/app.js:799-831` | 无 | — | 1 | 难解耦 / ✓ 认可 | Leaflet 库依赖 |
| Renderer | B115 | 对话切换时清理旧 listener 和 abort controller | `src/app.js:861-937` | 无 | — | 2 | 部分可解耦 / ✓ 认可 | 逻辑可抽离为纯函数 |
| Renderer | B116 | 输入框 Enter 发送、Ctrl+Enter 换行 | `src/app.js:95-100` | 无 | — | 1 | 难解耦 / ✓ 认可 | 键盘事件处理 |
