# 换行符 · 实测证据

采集：2026-10-07，作者本人 Windows 机器。这一组是第 4 章"读输出，别读结论"那条的最好例子：**我自己一开始也把这行警告读错了。**

## 机器设置

```
$ git config --get core.autocrlf
true
```

## 复现那条警告

新建一个只有换行符 LF 的文件，`git add`：

```
$ printf '第一行\n第二行\n' > crlf-demo.txt && cp crlf-demo.txt ./crlf-demo.txt
$ git add crlf-demo.txt
warning: LF will be replaced by CRLF in crlf-demo.txt.
The file will have its original line endings in your working directory
```

再看仓库里和工作区里分别是什么行尾：

```
$ git ls-files --eol crlf-demo.txt
i/lf    w/lf    attr/                   crlf-demo.txt

$ 读文件字节，看有没有 0d（回车符 CR）
worktree bytes: 231,172,172,228,184,128,232,161,140,10,...  有 CR? false
```

**注意警告说的和实际发生的并不一致**：警告说"会被换成 CRLF"，第二行也说清楚了"你工作区里保持原样"。而 `--eol` 显示这个文件的**工作区仍然是 LF**。

## 同一台机器上，不同文件行尾并不相同

在 fusion 那个仓库里查三个已经提交过的文件：

```
$ git ls-files --eol -- AGENTS.md CONTEXT.md README.md
i/lf    w/crlf  attr/                   AGENTS.md
i/lf    w/lf    attr/                   CONTEXT.md
i/lf    w/lf    attr/                   README.md
```

**同一台机器、同一个设置、同一个仓库：`AGENTS.md` 的工作区是 CRLF，另外两个是 LF。** 仓库里存的都是 LF。

## 这一组要教会读者的那一条

看到 `warning: LF will be replaced by CRLF in xxx.` 就断言"我这台 Windows 上的文件都是 CRLF"——**这个推断是错的**，上面的输出就是反例：同一个仓库里两种行尾并存。

**要判断某个文件的真实行尾，查它自己**：

```bash
git ls-files --eol <文件路径>        # i/ 是仓库里存的，w/ 是你工作区里的
```

或者看字节里有没有 `0d`。

## 这条坑跟"多个 AI 干活"的关系

把日志或脚本内容复制给 AI 时，行尾不一致会造成三种看起来像 AI 出错的事：

1. AI 按行匹配文本，`\r\n` 让匹配不上
2. shell 脚本带着 `\r` 在 Linux 上跑，报 `bad interpreter: /bin/bash^M`
3. 两份"内容一样"的文件，diff 显示每行都不同

**这三种都不是 AI 的锅，是行尾的锅。** 判别方法就一条：先查文件的真实行尾，再决定怀疑谁。

## 没测到的

- 不同编辑器/工具写出 CRLF 文件的规律 —— 没系统测。
- 上面第 2、3 条只在别处见过、我们这次没有复现 —— 书里不写成结论。
- `core.autocrlf` 改成别的值、或加 `.gitattributes` 之后行为怎么变 —— 没测（也不许在用户机器上擅自改配置）。
