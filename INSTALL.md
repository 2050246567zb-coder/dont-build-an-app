# 安装完整版：Skill + GalGame 网页

默认分支 `main` 包含完整产品，默认安装方式不再只复制 Skill。网页复用当前 Agent 原任务，不增加模型服务、API Key 或聊天订阅。

## Windows x64 完整安装包（推荐）

1. 从 [最新发布](https://github.com/2050246567zb-coder/dont-build-an-app/releases/latest) 下载 `dont-build-an-app-v0.2.1-windows-x64.zip`，完整解压到一个准备长期保留的文件夹。不要直接在压缩包中运行。
2. 双击 `install.cmd`，自动给检测到的 Codex、WorkBuddy、千问办公安装配套 Skill；已有版本先备份。包内含 Node.js 24.19.0、已构建程序、运行依赖、网页、人物和场景素材，安装步骤无需另行下载 npm 依赖。
3. 回到对应 Agent，刷新 Skill 列表或新建一个正常任务，说：**使用天才设计师系统，打开网页审查我的创意：……**。网页必须由这个原任务启动，双击安装器不会创建模型会话。

Agent 自动安装时，先识别 Windows x64 和当前宿主，下载完整 Release 包并校验 SHA256SUMS.txt。解压后执行（路径按实际替换）：

```powershell
& './runtime/node.exe' './scripts/setup.mjs' --host codex
# 千问办公用 --host qwenwork；WorkBuddy 用 --host workbuddy
```

安装后读取 `<宿主技能目录>/dont-build-an-app/runtime-location.json`。其中 `node`、`launcher`、`publisher` 都是本机实际绝对路径。**有内置 Node 时不依赖全局 npm**：

```powershell
# Codex 原任务内，用 runtime-location.json 的真实路径：
& '<node>' '<launcher>'
# 千问办公 / WorkBuddy：由宿主后台命令工具执行
& '<node>' '<launcher>' serve
# 随后在同一原任务获取 URL：
& '<node>' '<launcher>' info
```

不要填写其他任务 ID。打开实际返回的 URL，读取 Skill 的 `references/galgame-mode.md` 与 `story-direction.md`，用同一原任务发布剧情。不能启动演示夹具冒充同步完成。

## 已验证的宿主范围

| 宿主 | 状态 | 首次使用要求 |
| --- | --- | --- |
| Windows Codex Desktop | 实验适配，原任务双向实测 | 从桌面原任务启动，有宿主注入的会话与工具管道环境 |
| Windows 千问办公 CN 1.0.6-26091603 | 实验适配，原任务双向实测 | 本机连接器、原任务环境与后台命令工具；[说明](docs/qwenwork.md) |
| Windows WorkBuddy 5.5.6 | 实验适配，原任务双向实测 | 用户同意本机调试后重启应用，再由后台命令工具启动；[说明](docs/workbuddy.md) |
| Claude Desktop / Cowork、Claude Code | 暂不支持网页同步 | 不替换为新模型会话 |
| macOS 与其他宿主 | 未实测 | 不宣称安装即用 |

安装器不会静默开启调试端口、修改全局 MCP、重启宿主或扫描导入全部聊天。各宿主的当前版本可能改变接口；详细证据见 [兼容记录](docs/compatibility.json)。

## 从源码安装

需要 Node.js 24+、npm、Git（下载源码 ZIP 时不需要 Git），在当前 Agent 原任务执行：

```sh
git clone https://github.com/2050246567zb-coder/dont-build-an-app.git
cd dont-build-an-app
npm run setup -- --host codex
```

`setup` 自动安装依赖、构建并安装 Skill。千问用 `--host qwenwork`；WorkBuddy 用 `--host workbuddy`。启动方式及原任务限制同上。源码 ZIP 也包含全部自有素材，但不内置 Node 或 npm 依赖，需要联网完成首次安装。

## 精灵动效与 Live2D

基础精灵动效、召唤效果、角色立绘和完整剧情 UI 随包可用，不需要实时生图。Live2D 专有 SDK **未包含**，未准备时自动回退内置 PNG 动效，不阻止游戏。已有合法本地 SDK 的用户可按 [Live2D 说明](experiments/live2d/README.md) 启用；不要复制作者电脑上的 SDK 或代用户接受许可。

## 更新与迁移

先在各原任务停止其旧网页服务；将新完整包解压到一个新目录，运行安装器更新 Skill 指向，再从原任务启动。存档位于当前系统账号的共享数据目录，不在发布包里；更新不会删除原 Agent 对话或存档。确认切换成功前保留旧目录。移动程序目录后重新运行安装器，修正绝对路径。

## 仅安装文字 Skill（主动选择）

如果只需要聊天审查，可以仅安装整个 `skills/dont-build-an-app/` 文件夹，保留 references、assets 和 agents。这种方式**不包含可运行网页**，不要把它作为完整版安装结果。搜索和实时生图继续依赖宿主已有能力。
