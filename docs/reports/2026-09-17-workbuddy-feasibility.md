# WorkBuddy 原任务适配调查

状态：**WorkBuddy 5.5.6 / Windows 实验适配已实现，原任务双向消息、重连去重及剧情发布已做实测；完整认证仍未完成。** 脱敏数据见 [同步结果](2026-09-17-workbuddy-sync.json)，安装见 [WorkBuddy 接入](../workbuddy.md)。

## 已核对的事实

- 本机已运行 WorkBuddy 5.5.6（Windows），安装包版本与本地 `/workbuddy/probe` 可交叉核对。
- 桌面端使用独立 daemon 管理会话；随包代码中的 `wb:conversations:get`、`requests`、`sendPrompt` 路由通过会话 ID 获取同一池内的 Conversation 实例。这是候选接入点，不是稳定公开接口承诺。
- 本机 sidecar 的 REST health/status 请求返回 `401 AUTH_REQUIRED`。未读取账户凭证、关闭鉴权或重启其他模型进程。
- 本机预加载层向原桌面窗口提供 `__wbInvoke`。用户已同意实验并从托盘完全退出应用，本次通过其内置调试开关启动，实际监听为 `127.0.0.1:9229`，进程归属已核对。通过原窗口调用 get、requests 和 sendPrompt，没有 create/fork 或独立推理进程。
- 已实现独立 WorkBuddy 适配器、原任务历史读取、稳定消息 ID 去重、客户端提交 ID 确认，以及启动器、发布器和安装目录的宿主区分。只有用户输入和完成后的末尾正文进入镜像；工具、推理及先前过程文字不当作最终回复。这个映射依赖当前版本的数据结构。

## 采用路线与用户决定

已采用本机 CDP 路线：网页 → 本机 GalGame 服务 → WorkBuddy 原窗口接口 → 指定已有任务。回复从同一任务正式历史读取。保留原有账号与模型，不另建模型会话、不接入云端中转。

首次需要完全退出应用，再启用本机调试。用户本次明确选择“接受，先做本机实验适配”，随后确认已完全退出。其他用户仍须了解并同意这一启动要求，不能因为本次同意就静默替他们开启。调试端口只限本机；本机其他程序也可能使用它。

本机执行的启动方式为（路径因机器而异）：

```powershell
# 先通过 WorkBuddy 自身界面完全退出；不强杀进程。
$env:WORKBUDDY_REMOTE_DEBUGGING_PORT='9229'
try {
  Start-Process -FilePath 'D:\workbuddy\WorkBuddy.exe' -ArgumentList '--remote-debugging-address=127.0.0.1' -WindowStyle Hidden
} finally {
  Remove-Item Env:\WORKBUDDY_REMOTE_DEBUGGING_PORT
}
```

其他机器必须先定位安装路径。验证实际监听地址与进程归属，不能仅凭传参声称隔离成立。关闭该调试实例并普通启动即可关闭调试入口。

FR-01/FR-02 的验收边界继续适用：

1. 从目标 WorkBuddy 原任务取得 `CODEBUDDY_SESSION_ID`，以 SDK 返回的会话 ID 核对；禁止猜最新会话、跨任务或调用 create/fork。
2. 只绑定该任务，验证网页消息成为原窗口可见的用户输入，正式助手回复在双方一致呈现。
3. 验证消息顺序、重连去重、未知发送结果不自动重发及双端交替输入。
4. 若模型回复只进入工具区、发生新会话、权限交互被另一连接接管，或无法确认同一任务，则停止并记录失败。
5. 通过后再接剧情、存档、图片与文档；兼容记录限定实测 WorkBuddy 版本和系统。

## 已交付的只读探测

```sh
npm run probe:workbuddy
```

脚本只访问三个官方本机探活端口；若用户自行提供 `GALGAME_WORKBUDDY_CDP=http://127.0.0.1:9229`，再读取该端口的 `/json/version`。不扫描聊天、不调用消息发送、不读取账号令牌、不自动开启调试。必须在目标 WorkBuddy 任务中运行才能得到对应会话环境标识；在 Codex 运行不会冒认已绑定 WorkBuddy。探活成功永远不等于通过同步。

## 参考与替代路线

- [WorkBuddy MCP 指引](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide)：确认工具与配置能力，不能据此推断已有任务同步。
- [WorkBuddy Open API](https://open.workbuddy.cn/docs/openapi)：本地助理消息入口未在文档中提供任意桌面任务 ID 选择参数；需要 OAuth 注册与授权。云端任务 API 会改变任务/数据路径，不能替代本产品的原任务绑定。
- [WorkBuddy Remote 作者项目](https://github.com/vergess3/workbuddy-remote)：提供通过 CDP 转发原桌面 API 的案例，支持调查这条路线；该项目成功不等于本产品当前适配通过。本次没有复制其代码或部署其服务。

## 真实执行与修正

1. 直接桥接向同一已有任务发出测试消息，历史中读到对应用户消息及正式回复。
2. 让 WorkBuddy 在该原任务自己的终端执行启动器。其 `CODEBUDDY_SESSION_ID` 与原任务匹配；未手填 ID。发现普通工具结束会回收 Node detached 子进程，导致服务短暂成功后消失。改为 `run_in_background=true` 执行 `launch -- serve`，服务跨后续命令及对话保持可访问。
3. 用户确认“后台启动验证”直接显示为原窗口用户消息，并从 WorkBuddy 原窗口输入“原窗口收到”；网页实际呈现了这条输入及其回复。
4. 从内置浏览器验证页发送两条真实消息，两条都由提交 ID 对应到原任务。首次剧情发布暴露了发布器仍错误比较继承的 Codex ID；修复为按当前宿主验证，保留跨任务拒绝，并补回归检查。
5. 再次由 WorkBuddy 自己运行发布器，原任务最终正文与暂存内容一致；网页提交系统 → 乔布斯 → 乔布斯交接 → 小黑四个片段。工具中的正文没有提前当成正式回复。
6. 同一提交 ID 再次请求返回已有记录；重连前后均 20 条消息、20 个唯一持久 ID、顺序不变，没有多发一轮模型请求。

上述 20 条包含测试前已有历史，不代表完成 10 轮交替验收。网页实际发送了 2 条验证消息。每条网页输入的原窗口像素可见性并未逐条人工核对；用户确认的是后台启动测试条目。

## 未验证与限制

- 未完成十轮交替、发送在途退出宿主、两条真实 WorkBuddy 任务并行隔离、WorkBuddy 整体重启恢复，以及 WorkBuddy 上完整审查到文档交付的端到端流程。
- 读取/恢复、格式、文档、隔离与失败处理有自动合同检查，不能把这些模拟检查当作上述真实宿主验收。
- 当前“回原 Agent”提示手动返回 WorkBuddy，未实现自动聚焦原窗口；网页发送开发意图仍指向同一原任务。
- macOS、其他 WorkBuddy 版本及 Claude Code 未验证；正式认证列表保持为空。
- 当前接口不是公开稳定 API；应用升级、后台任务被取消或调试入口关闭都可能使服务失效。提示用户检查原 Agent，不自动补发。
