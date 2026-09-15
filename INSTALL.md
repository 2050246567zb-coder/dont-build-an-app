# 安装 dont-build-an-app

本仓库包含一个 Skill。安装单元是整个 `skills/dont-build-an-app/` 文件夹，不能只下载 `SKILL.md`。

- 仓库：https://github.com/2050246567zb-coder/dont-build-an-app
- 默认分支：`main`
- 技能名：`dont-build-an-app`
- 仓库内路径：`skills/dont-build-an-app`
- 目录链接：https://github.com/2050246567zb-coder/dont-build-an-app/tree/main/skills/dont-build-an-app

## 给正在执行安装的 agent

1. 确认当前宿主支持本地 Skill，并识别其实际安装目录。优先使用宿主自带的 Skill 安装器；不要把作者的路径当作接收者的路径。
2. 从上面的仓库目录安装整个 Skill，保留 `SKILL.md`、`references/`、`assets/` 和 `agents/` 的相对结构。没有自带安装器时，可以下载仓库 ZIP 或克隆仓库，再复制这个文件夹。
3. 已存在同名 Skill 时先比较版本；相同则无需覆盖，有本地修改时先保留副本再按用户意图更新。无需执行任何仓库安装脚本，也不需要修改用户的全局提示词。
4. 读取安装后的 `SKILL.md`，核对其引用的参考文件和两张图片都存在；按当前宿主的实际加载方式启用，并报告安装位置和使用方式。
5. 无法访问网络、写入文件或加载 Skill 时，说明具体限制，不把“读过仓库”称为安装成功。

安装无需 API 密钥、登录作者账号或开通付费服务。搜索与生图使用接收者现有 agent 的能力，第一阶段支持生图时直接生成一张结论图，不额外询问许可，用户可关闭；后续逐轮人物配图会单独征询意愿。此仓库不包含对话记录和用户产品进度。

## 方式一：宿主自带的安装器

例如，Codex 的 `skill-installer` 可使用上述 Skill 目录链接，或向其脚本传入：

```text
--repo 2050246567zb-coder/dont-build-an-app --path skills/dont-build-an-app
```

由当前 Codex 找到自身的 `install-skill-from-github.py` 并执行，不要假设所有机器上的脚本路径相同。

## 方式二：Skills CLI

当前机器有 Node.js/npm 时，可以使用 [Vercel 的 Skills CLI](https://github.com/vercel-labs/skills)：

```sh
npx skills add 2050246567zb-coder/dont-build-an-app --skill dont-build-an-app
```

按提示选择要安装到的 agent 与安装方式。默认安装到当前项目；需要用户级安装时加 `--global`。安装器支持的宿主以其当前列表为准，不代表本 Skill 在所有模型和宿主中都已实测。

只查看仓库里可发现的技能，不安装：

```sh
npx skills add 2050246567zb-coder/dont-build-an-app --list
```

## 方式三：下载后复制

1. 在 GitHub 仓库页面选择 **Code → Download ZIP**，或克隆本仓库。
2. 解压后找到 `skills/dont-build-an-app/`。
3. 将整个文件夹放入当前 agent 的技能安装目录；以宿主配置或文档为准。
4. 按宿主的加载方式启用，再说“使用不要再做 App 了审查我的创意：……”。

正确的安装结果应类似：

```text
<当前 agent 的技能目录>/
└── dont-build-an-app/
    ├── SKILL.md
    ├── agents/openai.yaml
    ├── assets/jobs-product-review.png
    ├── assets/xiaohei-character.png
    └── references/...
```

## 更新

使用原来的安装方式更新。手动更新时替换技能目录中的发布文件，保留用户自己保存的产品方案和进度文档；这些用户文档应放在工作区，不放进 Skill 安装目录。旧对话已经读过旧规则时，让 agent 重新读取新版入口及当前阶段的参考文件再继续。
