# 重生之我有天才设计师系统

**把产品设计聊成一场 GalGame，最后带走可以交给 AI 开发的方案。**

原名「不要再做 App 了」。系统精灵陪你筛查创意，乔布斯追问产品核心，小黑从真实使用角度挑刺。网页有立绘、逐字台词、章节主题、剧情转场、进度节点、存档与设计文档道具；底层仍是你当前的 Agent 原任务。

## 下载完整版

**main 现在就是完整产品：Skill + 网页 UI + 内置素材 + 宿主适配代码。** 不再需要切到开发分支，也不要只安装 Skill 文件夹。

- [下载最新版完整安装包](https://github.com/2050246567zb-coder/dont-build-an-app/releases/latest)：Windows x64 包自带 Node、运行依赖和已构建程序，解压后运行 `install.cmd`。
- [安装与更新说明](INSTALL.md)：给用户和安装 Agent 的统一入口。
- [运行原理与使用细节](GALGAME.md)。

直接把下面这段发给你的 Agent：

```text
请完整安装并运行“重生之我有天才设计师系统”：
https://github.com/2050246567zb-coder/dont-build-an-app

先阅读 main 的 INSTALL.md。安装完整版，包含 Skill、网页、素材与启动程序，
不要只复制 skills 文件夹。Windows x64 优先使用最新 Release 的完整 ZIP。
按当前宿主安装，再从当前原任务启动网页，打开实际返回的本机链接。
保留同一原会话，不另建模型会话；宿主未适配时说明具体限制。
```

安装后说：**“使用天才设计师系统，审查我的创意：我想做一个……”**。完整版默认进入网页；你也可以明确要求纯文字。

## 当前能在哪用

| 应用 | 网页同步情况 |
| --- | --- |
| Windows Codex Desktop | 已实测原任务双向同步，实验适配 |
| Windows 千问办公 CN | 已实测原任务双向同步，实验适配 |
| Windows WorkBuddy | 已实测原任务双向同步，首次需同意并配置本机调试 |
| Claude Desktop / Cowork、Claude Code | 暂不支持网页同步 |
| macOS、其他应用 | 尚未实测 |

具体版本与限制见 [兼容记录](docs/compatibility.json)。安装 Skill 不会给未适配的宿主自动增加同步能力。网页不另收模型费用，聊天与实时生图仍使用你原 Agent 的额度。

**Live2D SDK 没有随公开包分发**；基础精灵动效和全部 UI 可直接使用，未配置 SDK 时自动使用内置静帧。[可选 Live2D 设置](experiments/live2d/README.md)。

## 从想法到方案

1. **筛查价值**：搜索类似产品，聊清独特点和具体自用价值；没搜到不代表全网原创。
2. **乔布斯问核心**：明确给谁做、为何值得做、首版必须做好什么。
3. **小黑挑体验**：从操作、等待、误解、中断和犯错的场景追问。
4. **领取设计文档**：关键决定确认后，交付可阅读、下载并给 AI 执行的产品方案。

角色有独立判断，不会把每句“好”当作问题已解决。你可以求助、委托普通实现决定，或者暂停保存。网页与原任务逐条同步，存档可恢复；同一电脑中已接入的宿主共用网页存档入口。

角色预审不能替代真实用户验证。提前要求整理时会保留未决内容，不把草案伪装成已通过的方案。人物依据见 [persona-sources.md](skills/dont-build-an-app/references/persona-sources.md)。

## 仓库内容

```text
skills/dont-build-an-app/  Skill、人物职责与审查规则
web/                      GalGame UI、立绘、场景与动效
src/                      原任务适配、同步服务与剧情协议
scripts/                  安装、启动、打包与诊断工具
docs/                     开发说明、兼容边界与实际结果
install.cmd               Windows 完整包安装入口
```

问题反馈：[Issues](https://github.com/2050246567zb-coder/dont-build-an-app/issues)。分享日志前移除私人对话、token 和产品资料。
