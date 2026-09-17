# 系统精灵 Live2D 本地试验

这是实际 Cubism 模型和 Web SDK 的本地试验。缺少本地 SDK 时，主程序继续使用原 PNG 动效。当前没有把 Live2D 运行库打入公开安装包，也不扩大宿主兼容声明。

## 已保存的素材

`system-spirit/` 包含生图原始图集、七图层 PSD、Cubism 导出的 `.cmo3` 工程、`.moc3`、模型描述和纹理。模型有七个 ArtMesh；球体与金环共用一层，眼睛和嘴巴独立。当前只做眨眼、二维视线位移、呼吸和表情，没有三维头转、独立光环物理或语音口型。

模型由本机 Cubism Editor 5.1.03 的组件导出。使用 [autoLive2d](https://github.com/KonshinHaoshin/autoLive2d) 的桥接代码（MIT，提交 `4fcdf472d21488c8e8258fd05a601b2822855705`），增加了本精灵的多参数网格绑定。它是第三方桥接，**不是 Live2D 官方支持的命令行导出接口**。`.moc3` 已通过实际 Core 检查及浏览器渲染；`.cmo3` 尚未在编辑器界面重新打开验收。

## 在本地运行已导出的模型

从 [Live2D 官方页面](https://www.live2d.com/en/sdk/download/web/) 获取 SDK，遵循相应许可。此次固定使用 `CubismSdkForWeb-5-r.5`，其中 Core 自报版本为 6.0.1。

```powershell
npm ci
node scripts/prepare-live2d.mjs "你的 CubismSdkForWeb-5-r.5 目录" experiments/live2d/system-spirit
node scripts/verify-live2d.mjs
npm run build
npm run stop
npm run launch
```

`prepare-live2d.mjs` 只读本机 SDK，并将 Core、Framework 构建产物、官方 shader 和精灵模型复制到被 Git 忽略的 `web/vendor/live2d/`。运行时只请求同源本地资源，不访问 CDN，不提交鼠标信息，不调用聊天、生图或独立模型服务。网页设置里的“Live2D 动态精灵”可以切回原立绘。

## 重新制作模型

`make-spirit.mjs` 只裁切、定位并打包生图图集为 PSD，不绘制人物或补画部件。`rig-spirit.mjs` 对上述固定提交的桥接源文件加入精灵绑定。图集及提示词见 `prompt.md`。

```powershell
# 本项目根目录；先在 tmp/live2d/autolive2d 准备上述固定版本和其 npm 依赖
node experiments/live2d/make-spirit.mjs tmp/live2d/autolive2d tmp/live2d/source
node experiments/live2d/rig-spirit.mjs tmp/live2d/autolive2d
# 使用本机 Cubism 5.1.03 和 JDK 17，在该桥接目录运行：
# npx tsx src/cli.ts export:official-moc3-from-psd --source <Cubism目录> --psd ../source/system-spirit.psd --output-moc3 ../rigged/spirit.moc3 --output-report ../rigged/report.json
```

桥接依赖编辑器内部组件，版本升级可能失效；不将编辑器 JAR/DLL、JDK 或桥接 vendor 目录提交到本项目。试验环境安装的编辑器位于 `D:\codexdata\tools\Live2D-Cubism-5.1`，未激活付费订阅。

## 发布边界

开发验证与对外发行是不同阶段。官方 SDK 包列出可再分发的 Core 文件，但仍须遵循其专有许可、Framework 的开放软件许可，以及适用的发行许可。个人/小规模企业豁免有“可扩展应用”例外；此次没有判定本产品最终发行类别，也没有把运行库并入正式发布。参见 [官方发行许可](https://www.live2d.com/en/sdk/license/) 和 [Core 说明](https://docs.live2d.com/en/cubism-sdk-manual/cubism-core/)。
