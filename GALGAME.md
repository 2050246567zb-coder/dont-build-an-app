# 不要再做 App 了 · GalGame 对话端

版本：**0.1.0-alpha.2，可运行的实验初版**。将现有 Skill 的筛查、乔布斯质询、小黑体验挑刺及方案交付呈现在浏览器里，推理仍由当前原 Agent 完成。

当前是 **Windows Codex Desktop 的实验适配**，依赖本地桌面管道和只读日志格式。真实原任务双向消息已经跑通；用户于 2026-09-16 结束继续人工编号测试。未完成的兼容验收仍保留，**正式认证列表为空**。Claude Code 未实现适配；macOS 没有真实宿主测试。

新增 **WorkBuddy 5.5.6 / Windows 实验适配**：原任务启动、双向消息、重连去重和正式剧情已做实测。它需要经用户同意开启本机调试，并由 WorkBuddy 后台命令运行服务。按 [WorkBuddy 专用安装说明](docs/workbuddy.md) 操作；完整兼容验收尚未完成，见 [实际记录](docs/reports/2026-09-17-workbuddy-feasibility.md)。

完整范围见 [开发规格](docs/galgame-development-spec.md)，证据见 [同步记录](docs/reports/2026-09-16-sync-validation.md) 与 [本版交付记录](docs/reports/2026-09-16-galgame-alpha2.md)。纯 Skill 仍可按 [INSTALL.md](INSTALL.md) 安装。

系统精灵新增 [Live2D 本地试验](experiments/live2d/README.md)：实际模型支持眨眼、视线跟随和点击表情。SDK 尚未打入公开安装包；未准备 SDK 时继续使用原 PNG 动效。[实测记录](docs/reports/2026-09-17-live2d-trial.md) 区分了已验证项与发布边界。

## 发给 Agent 安装

```text
请安装并运行“不要再做 App 了 · GalGame 对话端”实验版：
https://github.com/2050246567zb-coder/dont-build-an-app/tree/codex/galgame-v0.1.0

读取开发分支 codex/galgame-v0.1.0 的 GALGAME.md，检查当前宿主能力，
完成依赖、构建和 Skill 安装，然后从当前原任务启动网页。
不要另建模型会话，不添加 API Key。缺少原任务绑定能力时报告限制。
```

需要 Node.js 24+、npm、Git。下面是 **Codex 桌面**步骤，需要当前任务提供 CODEX_THREAD_ID、CODEX_APP_TOOLS_PIPE_PATH、CODEX_HOME。WorkBuddy 使用自己的 CODEBUDDY_SESSION_ID，按上面的专用说明安装，不能手填 Codex 变量绕过绑定。

```sh
git clone --branch codex/galgame-v0.1.0 https://github.com/2050246567zb-coder/dont-build-an-app.git
cd dont-build-an-app
npm ci
npm run build
npm run install:skill
npm run probe
npm run launch
```

安装器把整个 Skill 安装到当前 CODEX_HOME/skills/dont-build-an-app；WorkBuddy 用 `npm run install:skill -- --host workbuddy` 安装到 `~/.workbuddy/skills/dont-build-an-app`。二者都备份旧版并记录本机工程路径，不改模型或全局 MCP 配置。搬迁工程后重新安装 Skill。

让 Agent 打开 launch 输出的本机链接，然后说“使用不要再做 App 了，进入 GalGame 网页模式”。同一任务重复启动复用服务，不创建模型会话。Agent 必须读取 [网页输出约定](skills/dont-build-an-app/references/galgame-mode.md)；普通未结构化回复保留原文并允许续聊，不猜测角色。

## 使用

- 开始游戏：选择当前已连接的存档，或开始当前任务的新网页记录。
- 名字、情绪立绘和台词按顺序播放。立即显示只跳过当前逐字动画；点击继续进入下一段；最后的问题才开放输入。
- 设置可调整文字速度，选择内置立绘或原 Agent 实时生成的图片。默认使用随包提供的生成立绘，运行时不消耗生图额度；实时图片使用原 Agent 的能力和额度，失败回退。
- 自动保存草稿，刷新后从主菜单读档。等待过久、连接失败会提醒检查原 Agent，不自动重发未知结果的消息。
- 在原窗口打断并收到普通回复后，可在网页「查看原回复」、直接填写回答，或点击「恢复角色对话」。本次发送会附带格式提醒，仍只使用原会话的一次回复；没有后台自动修复循环。被打断的未发布剧情不会锁住后续，旧内容继续保留。旧服务需要从对应原任务停止并重启一次，保留存档后生效。
- 小黑告别后由 AI 交付实际 Markdown，可阅读、下载。主动选择“返回原 Agent 开始开发”并确认，才发送执行指令并切回原任务。
- 删除网页存档移除剧情、草稿和专属缓存，保留原 Agent 历史及已交付的共享文件。重建须从对应原任务重新启动；当前不会恢复已删的旧剧情。

「读取存档」汇总**这台电脑、同一个系统账号**下所有通过本产品连接并开始游戏的任务，显示所属 Agent、名称、更新时间和连接状态，支持按 Agent 筛选。可以在同一网页地址切换 Codex / WorkBuddy 存档；消息、草稿、配图、文档仍由对应的原任务负责。多份工程安装默认使用同一目录，不需要额外模型或云端同步。

只安装 Skill 不会自动导入全部私人聊天，也不会让未适配的应用变成兼容。每个原任务需启动过一次网页并开始游戏（或发布首段剧情）。服务离线后存档仍列出；回原 Agent 对应对话重新启动，再点「刷新存档」。所有本机服务都停止时，先从任一已适配原任务打开网页入口。入口服务停止会让该页面暂不可用，可从另一个仍在线的原任务打开入口。

每个任务仍有独立桥接服务与数据目录。统一入口只在本机转发到经身份核对的已有任务，不合并会话记忆，不把 A 的聊天送给 B 的模型。多个页面打开同一存档时只允许一个发送，可显式接管。完整实现与验证范围见 [统一存档记录](docs/reports/2026-09-17-shared-catalog.md)。

## MCP 与命令行桥接

提供真正的 stdio MCP 服务，负责读取网页偏好、校验和暂存剧情；**MCP 本身不提供原会话同步能力**。同步由固定绑定当前任务的适配器完成。

```sh
npm run runtime
```

返回当前任务的 runtimePath、mcpCommand、mcpArgs。宿主能为此任务配置 MCP 时，可用返回值设置 stdio 服务。该实例只属于一个任务，不应作为所有任务共用的全局绑定。本机未自动安装 MCP，无需重启宿主即可使用等价 CLI：

```sh
node dist/publish.js "/actual/runtime.json" --context
node dist/publish.js "/actual/runtime.json" "/actual/scene.json"
```

第二条返回 finalText。Agent 必须把它原样作为**当前原任务的最终回复**，全部角色图文都在正式正文中。网页观察到一致正文后才播放；工具输出、思考记录不能代替正式回复。

协议见 [galgame-mode.md](skills/dont-build-an-app/references/galgame-mode.md)：系统/乔布斯/小黑、六种情绪、片段顺序、图片归属、文档关联及闭合/草案状态。未匹配回复保留原文并提供恢复入口，不静默漏掉角色，也不阻断用户续聊。详见 [中断恢复记录](docs/reports/2026-09-17-interruption-recovery.md)。

## 数据与停止

```text
网页输入 → 本机 HTTP → Codex 当前任务的 app-tools 管道 → 当前原任务
当前原任务只读日志 → 已确认消息 → 匹配暂存剧情 → 网页播放
```

新任务数据默认位于 Windows 的 %LOCALAPPDATA%/DontBuildAnApp 或 macOS 的 ~/Library/Application Support/DontBuildAnApp，其中 catalog/ 是各安装共用的本地存档索引。macOS 路径实现不代表宿主已实测。工程以前的 .galgame 数据继续复用并登记到共享索引。可用 GALGAME_HOME、GALGAME_DATA_DIR、GALGAME_PORT 覆盖；只有明确需要隔离时才为不同安装设置不同的 GALGAME_HOME 或 GALGAME_REGISTRY_DIR。

只监听 127.0.0.1，校验来源和凭证。不要分享含 token 的链接。数据目录包含私有消息镜像、草稿和凭证，禁止整目录上传。published/ 是已链接到原 Agent 的共享交付文件，不随网页存档删除。

```sh
npm run stop
```

只停止当前服务，保留原 Agent 和数据。更新：停止后 git pull、npm ci、npm run build、npm run install:skill，再启动。WorkBuddy 安装时加 --host workbuddy，并由宿主后台工具重新运行 serve。已有存档和剧情保留；旧服务必须重启后才能作为新版统一入口，不能只刷新旧服务就声称已升级。卸载：先停止，再按需移除工程与安装的 Skill；保留文档请先备份 published。没有系统服务、独立模型服务、浏览器 API Key 或额外付费依赖；聊天和生图仍使用原有额度。

## 开发检查

```sh
npm run check
npm test
npm run build
node --import tsx scripts/ui-fixture.ts
```

最后一条启动标有“离线界面测试（无模型）”的确定性夹具，默认端口 4318，用于检查界面，**不能作为真实同步证明**。统一存档界面另可运行 `node --import tsx scripts/catalog-fixture.ts`，创建两个无模型演示存档与一个断线条目，不写进真实存档目录。自动检查涵盖正式正文核对、数据边界、角色顺序、文档、MCP stdio、宿主区分、重连、幂等、跨存档路由和生成素材路由。

2026-09-17 的「夜间创作室」视觉更新包括 19 张生成素材、经典 GalGame 排版和桌面分栏适配，见 [美术说明与预览](docs/visual-direction.md)。系统精灵会微微浮动，点击切换开心/惊讶反应；交互完全在本地完成。角色、背景及装饰边框不再使用代码绘制的占位图。

同日补充三个人物的口语台词规则、等待时递增循环的省略号，以及先加载再淡出/淡入的立绘切换。详见 [台词与动效记录](docs/reports/2026-09-17-dialogue-motion.md)。原会话已发出的旧台词不会自动重写，继续时让 Agent 重新读取更新后的 Skill。

角色场景现会整套切换：系统精灵保留夜间创作室；乔布斯进入苹果设计办公室意象，所有控件变为简约银白皮肤；小黑使用侦探动画黑影登场般的黑色放射背景与黑白线框。输入框和交付面板对三名角色统一避让。角色切换、按钮、输入、菜单、弹窗和存档卡片具有一致的缓动反馈；尊重减少动态效果偏好。新增 4 张生成 PNG，不增加运行时生图或模型费用。详见 [角色主题验收](docs/reports/2026-09-17-role-themes.md)。

设置环境变量 `GALGAME_FIXTURE_THEMES=1` 后运行上述 `ui-fixture.ts`，可依次检查系统精灵提问、乔布斯提问、双角色交接、小黑提问和系统文档交付。夹具只写演示存档，不连接模型。

真实宿主诊断页保留在 /verifier。不再要求当前用户重复编号测试；其他环境的认证仍须独立完成 [验收记录](docs/sync-run-template.md)。

2026-09-18：章节移至顶栏，清理品牌/连接提示等常驻文字，新增生成的设置与操作图标。对话框内左右箭头支持只读回放，实际进度、草稿与原任务不回退；右箭头仅回看时显示。详见 [布局与回放验收](docs/reports/2026-09-18-dialogue-controls.md)。
