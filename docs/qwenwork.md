# 千问办公实验适配

Windows 千问办公 1.0.6-26091603 的本机连接器负责向原任务发送，消息库以只读方式提供完整历史。没有独立模型、浏览器 API Key 或云端中转。

安装：`npm run install:skill -- --host qwenwork`。默认国内版目录 `~/.qwenworkcn/skills/dont-build-an-app`；国际版和 macOS 未实测，不自动猜路径。

从当前千问办公原任务运行：

1. 读取已安装 Skill 的 `runtime-location.json`，进入其中的工程目录。
2. 原任务必须提供 `QODERWORK_SOURCE_CHAT_ID`。不要复制 Codex 的会话 ID，也不要手填最近任务来冒充从原会话启动。
3. 用宿主后台命令工具执行 `npm run launch -- serve`，普通短命令的子进程可能被清理。
4. `npm run runtime` 获取本任务 URL 和 runtimePath。网页可打开并与其他已接入宿主共用存档目录。
5. 每轮仍由 `node dist/publish.js <runtimePath> <scene.json>` 暂存，再把返回的 finalText 原样写入原任务最终回复。

连接器配置只在本机读取，凭证不进入网页。任务摘要会截断文本且混合过程消息，因此不能作为剧情来源；适配器只读取宿主 `completed` 消息中 `finalTextId` 指定的正文，排除思考与工具输出。

连接器不支持客户端消息 ID，网页发送末尾附加 `<!-- galgame-receipt:UUID -->` 作为回执标记，网页展示会移除它。它不是角色台词，也不是用户的产品决定。以原生消息 ID、原任务和回执匹配确认，发送结果不明时不自动重试。

当前只验证单执行线程任务。遇到消息库结构变化、多个执行线程、权限确认或宿主运行中会停止发送并提示；不会绕过权限或创建替代模型会话。
