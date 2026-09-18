# WorkBuddy 实验接入（Windows）

适用范围：WorkBuddy 5.5.6 的本机桌面任务。依赖版本相关的桌面接口，尚不属于稳定公开 API；更新应用后须重新验证。实际结果与未验证项见 [本机记录](reports/2026-09-17-workbuddy-feasibility.md)。

网页复用当前 WorkBuddy 任务的模型、上下文与额度。没有独立模型服务、云端中转或新的 API Key；原有聊天、生图仍会消耗你的原有额度。

## 1. 一次性的本机调试启动

先保存工作并从系统托盘完全退出 WorkBuddy，确认没有运行中的任务。调试端口允许本机程序控制桌面窗口；这是实验模式的启动要求，安装 Agent 必须先说明并取得用户同意，不可静默开启。已在当前会话同意时不要重复询问。

定位本机 WorkBuddy.exe 后，用 PowerShell 启动（替换实际路径）：

```powershell
$env:WORKBUDDY_REMOTE_DEBUGGING_PORT='9229'
try {
  Start-Process -FilePath 'D:\workbuddy\WorkBuddy.exe' -ArgumentList '--remote-debugging-address=127.0.0.1' -WindowStyle Hidden
} finally {
  Remove-Item Env:\WORKBUDDY_REMOTE_DEBUGGING_PORT
}
Get-NetTCPConnection -LocalPort 9229 -State Listen
```

等应用就绪后，核对监听地址为 **127.0.0.1**，OwningProcess 是该 WorkBuddy 进程；非本机监听应停止实验。不要设置通配地址、公开到局域网、读取账户密钥或关闭鉴权。用完可完全退出该实例并普通启动，关闭调试入口。

## 2. 从要使用的原任务安装并启动

在 **WorkBuddy 的目标对话** 内执行，不能从另一个 Agent 手填任务 ID 代替：

```powershell
git clone --branch main https://github.com/2050246567zb-coder/dont-build-an-app.git
cd dont-build-an-app
npm ci
npm run build
npm run install:skill -- --host workbuddy
$env:GALGAME_HOST='workbuddy'
$env:GALGAME_WORKBUDDY_CDP='http://127.0.0.1:9229'
npm run probe:workbuddy
```

已有工程先更新、构建即可。Skill 默认安装到用户主目录 `.workbuddy/skills/dont-build-an-app`，原文件先备份，不写入 Codex 的全局 Skill。Windows 中文路径建议终端使用 UTF-8。

**服务启动必须用 WorkBuddy 命令工具的后台任务模式**：让它调用 PowerShell/Bash 工具并设置 `run_in_background=true`，在同一次命令里设置上述两个变量，再执行：

```powershell
npm run launch -- serve
```

该命令本身持续运行。不要再在里面用 `Start-Process`、`&` 或 Node detached 子进程尝试脱离工具：本机实测普通命令结束会回收这些子进程。后台任务不是新的模型会话。

随后在同一原任务另一条命令中再次设置两个变量，执行 `npm run runtime`，核对服务仍可访问，并打开它返回的 URL。`CODEBUDDY_SESSION_ID` 必须来自 WorkBuddy 自动提供的环境，不可猜测或手填。若当前宿主没有后台命令能力，停止并报告限制，不谎报已打开。

Skill 的 `runtime-location.json` 指向实际工程。启动器优先识别 WorkBuddy 自己的任务标识，即使进程继承了 Codex 变量也不会混用。每个原任务有独立本机端口、存档和消息镜像。

## 3. 正常对话与停止

打开链接后使用“不要再做 App 了，进入 GalGame 网页模式”。Agent 读取 [网页协议](../skills/dont-build-an-app/references/galgame-mode.md)，先暂存剧情，再将返回的 `finalText` 放到当前任务最终回复。只有在原历史读到相同正文后，网页才播放角色台词。无需全局配置 MCP，随包 CLI 提供同样的剧情工具。

当前任务忙碌时网页拒绝再发；未知发送结果不会自动重试。原窗口正常发出的消息也从同一历史读取。页面刷新保留本地存档/草稿；重连重新核对任务 ID，按持久消息 ID 去重。

从同一原任务运行 `npm run stop`（仍需上述两个变量），只停止网页服务并保留数据。关闭网页不停止 WorkBuddy；停止网页服务也不取消模型任务。不要分享 URL 中的 token，不要上传 runtime.json、消息数据库或私人测试输出。

目前不能用这个文档声称其他 WorkBuddy 版本、macOS、Claude Code 或十轮完整验收已通过。
