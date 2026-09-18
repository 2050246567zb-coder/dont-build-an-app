# 2026-09-18：千问办公与 Claude Desktop / Cowork

## 范围

用户指定 Claude 桌面应用/Cowork（不是 Claude Code）及千问办公；允许在千问已有“安装 GitHub 仓库 skill”任务中发送同步测试消息。没有新建模型会话、增加 API Key 或付费服务。本次未上传 GitHub。

## 千问办公

- 本机版本：Windows 1.0.6-26091603。
- 实现：`qwenwork-local-connector`，发送走原应用 `qw_action` 的原任务 `send_message`；从宿主只读 SQLite 中按 chat_id 读取消息。宿主任务摘要截断约2000字，且混合过程文本，故不作为完整正文来源。
- 只采用 `status=completed` 和 `finalTextId` 明确标记的正式回复，排除工具、思考、过程文本；消息保持宿主 ID 和序号。
- 原任务通过其本身的 `QODERWORK_SOURCE_CHAT_ID` 启动后台桥和读取 runtime，未手填绑定、未借用 Codex 标识。重启前后仍绑定原任务。
- 安装器支持 `--host qwenwork`；旧 Skill 已备份，新的 runtime-location 修正之前误记为 codex 的宿主，指向当前开发工程。
- 网页发送使用不重复的回执注释来绑定宿主消息。首次实验发现 action 回执不同于 query 数据结构，消息实际已发出；未重发，核对原任务后修正解析，并增加回归检查。
- 类型检查、构建、21项相关测试通过：包含正式正文筛选、长文本不截断、原任务隔离、回执唯一性、网络地址限制及现有服务器/WorkBuddy行为。

### 实际往返与恢复

- 网页点击「开始游戏」，向原任务发送一次 `【天才设计师系统·开场】`；宿主产生正式用户消息，桥的提交状态为 confirmed。用户亲自确认该消息直接显示在千问原窗口。
- 千问在同一原任务暂存召唤剧情，并正式回复；网页实际显示系统精灵开场，回看包含三段完整台词。
- 用户从千问原窗口发送的实际内容为「原窗口收到」。该原生用户消息和其后的正式回复均已在网页回看中读取；以实际消息为依据，不以模型自称“同步成功”为验收证据。
- 浏览器刷新后，经「读取存档 → 继续对话」恢复该任务。刷新前后均为14条消息、14个唯一ID，ID顺序完全一致；提交记录保持1条，没有重发开场。
- 本次只做短程双向实测。未验证完整失败矩阵、长时间运行、跨宿主切换、macOS、国际版、多执行线程或版本升级，仍标为实验适配，不做全面认证。

## Claude Desktop / Cowork

- 本机版本：Windows Store Claude 2.2553.0.0。
- 用户同意仅限本机调试实验，并完全退出应用后，尝试从原客户端用 `--remote-debugging-port=19327 --remote-debugging-address=127.0.0.1` 启动。
- 客户端退出码1，明确输出：`Claude: refusing to start — a debugging or network-override switch is present on the command line.`；没有产生可用调试监听。
- 停止该路线，未修改客户端、未绕过启动限制、未导出账号凭证。已不带调试参数重新启动 Claude，并核对进程存在。
- 当前不提供 Cowork 同步适配，不列为兼容。安装纯文本 Skill、支持 MCP、本地存在会话文件，都不等于能控制同一原任务进行双向同步。
- 官方资料参考：[Claude 本地 MCP](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)、[Cowork 架构](https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview)、[千问办公 Skills](https://docs.qwenwork.ai/zh/desktop/skills)。资料说明宿主扩展机制；本次兼容结论以本机实际结果为准。
