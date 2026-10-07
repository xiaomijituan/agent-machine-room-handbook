# agent 机房手册 — 仓库说明

《agent 机房手册》的内容仓库。**这是教材，不是编排工具。** 产品说明见 [README.md](./README.md)，
写作规矩见 [STYLE.md](./STYLE.md)，术语只准用 [GLOSSARY.md](./GLOSSARY.md) 里那 20 个词。

## 跑起来

```bash
npm install --registry=https://registry.npmmirror.com
npm run check        # 内容自检（下面详述）
npm run format       # 格式化；钩子只检查不改写
```

`npm run check` 不需要联网，也不用 fusion 的源码。

## 门禁

本地（Husky，`core.hooksPath=.husky/_`，由 `npx husky init` 自己设的）：

- pre-commit：`npm run check` + `npx prettier --check .`

CI（`.github/workflows/ci.yml` 里那个叫 `gates` 的作业）：`npm ci` → `format:check` → `check`。

服务端（GitHub 分支保护，本地绕不过）：改 `main` 必须走 PR、`gates` 必须绿、
禁止 force push 与删除 `main`。管理员豁免（单人节奏，所以你自己直推仍能过）。

**别把门禁当摆设**：`scripts/check.mjs` 每次加规则都要用临时坏文件证明它会红，
再删掉那个坏文件。现有两条已这样验过。

## 一章 = 五个文件

```
chapters/NN-slug/
  index.md          # 正文，纯 Markdown（要能整段粘去掘金）
  scenario.json     # 可玩剧本，fusion 的剧本格式
  reference.jsonl   # 我们真跑出来的一局记录，用来跟读者那局对拍
  verify.md         # 验证记录：测到什么、没测到什么、涂改了哪几处
  china.md          # 国内网络差异卡片：命令 → 看到的 → 坑
```

`verify.md` 有五个必填点，`check.mjs` 会查：机器、版本、没测、等级、涂改。

## 约定

- **写作规矩在 `STYLE.md`，六条**。最容易被违反的两条：不用"它/那个/前者/后者"这类
  回指词；词表外的术语第一次出现必须当场解释。
- **测到的和推出来的分开写。** 没复现的结论标"没测到"，并列出验证命令。
  宁可少一条结论，也不要写没依据的话。
- **证据入库前必须涂掉身份信息**（公网 IP、内网地址、设备名、账号）。
  掩码要按格式替换，别按名字替换——名字的大小写和连字符形式会变，我们会过一次。
  `check.mjs` 里那两条掩码检查不需要知道真实名字，所以真实名字也不会溜进脚本。
- **不 import、也不复制 fusion 的源码**（fusion 仓 ADR-0001）。依赖面只能是它发布的产物。
  剧本格式的权威校验是那份 `scenario-check.mjs`，等 fusion 打出 `v0.1.0` 之后再启用
  `ci.yml` 里注释好的那一步。
- **别引入后端、账号、排行榜**（fusion 仓 ADR-0005：文件即分享物）。
- 采集证据的命令，标签一律用英文——终端是中文环境时中文标签会变乱码，
  而输出要一字不改地进仓库。

## 仓库边界（什么不提交）

- `任务*.md`、`docs/GIT.md`、`docs/build-log.md`、`docs/grill-checkpoint.md`、
  `docs/from-zero-to-public.md`、`docs/ci-playbook.md`：作者的过程稿与教学稿。
- `node_modules/`、`output/`、`screenshots/`、`.vercel/`：产物。
- **教学稿不是规范。** 决策只认 ADR 与本文件；教程里写的裁剪建议没有约束力。

## 待办（还没定的事）

- 备用两章（连起两台电脑、断网了 AI 会不会丢）等有第二节点在线之后再写。
- 配图（archify）待补。
- **fusion 那边也得挂 MIT**（已定，待做）：ADR-0008 要手册把 fusion 的构建产物拷一份进
  `vendor/`，而 fusion 现在**没有 LICENSE 文件、README 也没有许可声明**，默认是"保留所有权利"——
  那份拷贝在法律上就没有授权。这条不解决，vendor 那一步不能走。
