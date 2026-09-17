# GalGame 网页模式

仅在用户要求网页审查、恢复网页存档或正在回答该模式的问题时使用。网页复用当前原任务，不能新建模型会话、索要模型密钥或改用独立推理服务。审查逻辑、乔布斯/小黑人设、真实证据与设计闭合规则继续由本 Skill 负责。

## 启动与读取上下文

1. 完整工程的安装说明是仓库 `GALGAME.md`。经工程安装器安装的本 Skill 带有 `runtime-location.json`，记录本机工程与 Node 路径；先读取它。若仅装了纯文本 Skill，没有工程，按 GitHub 仓库 GALGAME.md 的说明安装完整开发分支，不猜作者电脑路径。
2. 在工程目录由**当前原任务**启动：Codex 桌面执行 `npm run launch`；WorkBuddy Windows 实验模式先读取工程 `docs/workbuddy.md`，按已同意的本机调试配置，用宿主命令工具 `run_in_background=true` 运行 `npm run launch -- serve`，随后 `npm run runtime` 核对服务仍存活，再打开实际返回的本地链接。后者需要宿主提供 `CODEBUDDY_SESSION_ID`，不得手填、猜测任务 ID 或继承另一应用的 ID。`npm run runtime` 返回当前任务的运行信息与 MCP 配置参数。普通 CLI、Claude Code 和其他应用尚未验证原任务同步，不宣称支持。运行环境不支持后台工具时报告具体限制，不把瞬间启动当作可用。
3. 调用 `galgame_context`，或执行 `node dist/publish.js <runtime.json的实际路径> --context`，读取图片设置与存档状态。使用内置立绘时不生成图片；实时生成时使用当前宿主已有生图能力，失败就让 `asset_id=null` 并使用内置对应情绪。首阶段结论图仍按原 Skill 的单独规则处理；用户明确选择全程内置模式时使用文字/内置替代，不额外生图。
4. 首次开场由系统出场。若网页已显示输入框，可简短说明已打开，等待用户说出创意；不要自动拿当前开发任务当新创意审查。无需反复让用户做同步测试。

网页的配图选项就是本模式的选择入口：已选择实时配图视为授权，选择内置则不生图，进入第二阶段不重复询问。网页模式的交付以可打开、可下载的完整文档为准；系统简短说明并关联文件，不把整份文档强塞入逐字对话框。其余产品审查与闭合要求保持不变。

## 本机统一存档

完整版本默认共用当前系统账号的 `DontBuildAnApp` 数据目录，与工程克隆位置及安装到哪个 Agent 无关。各 Agent 从自己的原任务启动网页并开始游戏（或发布首段剧情）后，任何新版入口的「读取存档」都能看到它；按 Agent 筛选，在同一网页地址切换。不要为每个宿主设置不同的 `GALGAME_HOME` 或 `GALGAME_REGISTRY_DIR`，除非用户明确要求隔离。

安装 Skill 本身不会扫描、导入全部私人聊天，也不会给尚未适配的 Agent 增加同步能力。当前只说明 Codex Desktop / WorkBuddy 的实验接入范围，不宣称所有安装了 Skill 的应用都兼容。各存档保留自己的原任务、消息、草稿、图片、文档和发送目标；网页切换不转移角色记忆，不把其他 Agent 的聊天发进当前原任务。CLI/MCP 发布仍使用当前宿主自己的 runtime，不能跟着浏览器所选存档改绑。

服务离线时列表仍保留存档名称，提示回对应 Agent 的原对话重启，再点「刷新存档」。不会偷偷创建替代会话。仅宿主断开但本机桥仍在运行时可以回看；整个桥已停止则不能在网页加载剧情。所有服务都停止后，须先由任一已适配原任务启动一个入口。更新旧版时重启入口服务才能启用同页切换；已有旧版任务可被新入口识别，后续重启会更新索引而非新增一份存档。

## 每轮输出：一份内容，两个窗口

先准备本轮剧情 JSON 文件。调用 MCP `galgame_stage_scene({scene_file:绝对路径})`；没有已安装 MCP 工具时，在工程目录执行：

```sh
node dist/publish.js /absolute/path/runtime.json /absolute/path/scene.json
```

运行实例文件来自 `npm run runtime`，不得自行填另一个任务 ID。工具返回 `finalText`，把它**原样放进当前原任务的最终回复**。不要只在 commentary 或工具结果中说台词，不要在 finalText 之前/之后加自己的总结。网页必须观察到这份正式正文才会播放；未正式发布不能报已同步。

如果校验失败，最多修正一次格式并再次暂存。不得用新一轮模型请求无限修格式。出现正文不一致时保留原文，向用户说明回原 Agent 处理，不把缺失角色或漏句判成成功。

## JSON 合同

```json
{
  "schema_version": "1.0",
  "turn_id": "turn_001",
  "stage": "design",
  "design_closed": false,
  "delivery_kind": "ready",
  "segments": [
    {"segment_id":"jobs_1","speaker":"jobs","text":"你把核心任务说清楚了。但你准备放弃什么？","emotion":"skeptical","asset_id":null,"advance":"reply","document_id":null}
  ],
  "assets": [],
  "documents": []
}
```

- `stage`：`screening / design / experience / delivery`。
- `speaker`：`system / jobs / xiaohei`。用户消息由桥接自动取得，模型不代写用户答案。
- `emotion`：`neutral / thinking / skeptical / angry / approval / surprised`。依据用户真实回答选择情绪，别为凑状态强行发怒。
- 文本不包含姓名前缀，工具会为原任务添加“乔布斯：”“小黑：”；网页单独显示姓名。
- 台词遵循 conversation-style 的口语规则。一个片段表达一个连贯意思，通常 1–3 句；自然停顿处再拆段，不逐句拆到用户需要不停点击。系统精灵负责开场和交付，乔布斯追产品取舍，小黑讲眼前的使用麻烦。不要把后台分析、检查项或文档表格塞进人物台词，也不要靠额外模型请求逐轮润色，直接在当前回复里写好。
- 长话按自然段分片段，保持原意。前面的片段都是 `click`，只有最后一段能是 `reply` 或 `complete`。一次 1—3 个相互关联的问题放在最后的提问片段，不替用户答题。
- 每个回合、片段、图片、文档的 ID 只用字母数字、下划线和短横线。同一回合重试保留 ID；不能把同一 ID 改成另一份内容。
- 图片：`assets` 中放 `{"id":"jobs_img_1","speaker":"jobs","mime":"image/png","file_path":"图片绝对路径"}`，片段的 `asset_id` 对应该 ID。MCP/CLI 在本机读取并上传受控副本，不在对话中塞 base64。支持 PNG/JPEG/WebP，每张不超过 5 MB。图不可用则不声明该资源存在。
- 文档：`documents` 中放 `{"id":"plan_1","title":"产品设计方案","file_path":"Markdown 绝对路径"}`，也可直接给 `markdown` 内容。完整内容写进实际文件，不用文件名冒充文档。

## 人物交接与闭合

乔布斯回应用户 → 乔布斯认可并介绍小黑 → 小黑承接前文 → 小黑提问。按顺序拆成片段，前面 `click`，最后 `reply`；不在中间打开输入框。

小黑回应最后的回答并告别 → 系统出场交付文档。交付前先完成 `decision-closure.md` 的检查，正常完成时 `design_closed=true`；最后是 `system + complete + document_id`。用户明确提前交付时使用 `delivery_kind=draft` 并如实保留缺口，不能伪装过关。

网页会保存剧情位置、已确认内容及草稿。用户删网页存档不删除原任务；之后须从原任务显式重新启动。不要重发已经存在的正式回复来补动画。返回开发只有用户点击对应操作并明确发送执行意图后才开始，读文档和下载本身不是开发授权。
