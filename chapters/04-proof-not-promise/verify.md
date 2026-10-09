# 验证记录 · 第 4 章

## 每条断言的来源

| 正文里的说法                                      | 来源                                 | 等级               |
| ------------------------------------------------- | ------------------------------------ | ------------------ |
| 三件套（文件清单、跑的命令、完整输出）才叫交付    | 方法，不是实验                       | 无实验支撑，属建议 |
| 数字不一致时先核对文件清单                        | 方法                                 | 无实验支撑，属建议 |
| `warning: LF will be replaced by CRLF` 会误人     | **本机复现**                         | A 级               |
| 同一仓库里不同文件行尾不一样                      | **本机实测**（`git ls-files --eol`） | A 级               |
| 我一开始把那条警告读错了                          | 本节下面原样记着                     | A 级               |
| 行尾会让 AI 按行匹配失败                          | 经验，**这次没复现**                 | C 级               |
| shell 脚本带回车在 Linux 报 `bad interpreter: ^M` | 别处见过，**这次没复现**             | C 级               |
| diff 显示每行都不同                               | 别处见过，**这次没复现**             | C 级               |

## 复现过程（原文）

```
$ git config --get core.autocrlf
true

$ git add crlf-demo.txt
warning: LF will be replaced by CRLF in crlf-demo.txt.
The file will have its original line endings in your working directory

$ git ls-files --eol crlf-demo.txt
i/lf    w/lf    attr/                   crlf-demo.txt

$ 读文件字节，检查有没有 0d（回车符）
worktree bytes: 231,172,172,228,184,128,232,161,140,10,...  有 CR? false

$ git ls-files --eol -- AGENTS.md CONTEXT.md README.md
i/lf    w/crlf  attr/                   AGENTS.md
i/lf    w/lf    attr/                   CONTEXT.md
i/lf    w/lf    attr/                   README.md
```

## 我读错的那一次，原样记在这里

看到第一行警告"LF will be replaced by CRLF"，我当时的判断是"这台 Windows 上的文件都会变成 CRLF"，并准备把这句话写进正文当"Windows 用户的固有坑"。

**查了那个文件的真实行尾之后，这个判断被自己的输出否掉了**：演示文件的工作区仍是 LF（`w/lf`），字节里也没有回车符 `0d`。而同一仓库里 `AGENTS.md` 是 `w/crlf`、`CONTEXT.md` 是 `w/lf`——**同一台机器、同一个设置，两种行尾并存**。

这件事本身就是这一章最好的教材：**我拿一条通用警告推断了一个具体文件，就错了。要判断某个文件，查那个文件。**

## 没测到什么

- **为什么不同文件行尾会不一样**（取决于文件是谁写的、有没有重新检出过）。这次只记录了现象，没有做成对照实验。
- **改 `core.autocrlf` 或加 `.gitattributes` 之后会怎样**。没动用户机器上的任何配置。
- **三条"行尾咬人"的后果**（AI 按行匹配失败、`bad interpreter`、diff 满屏不同）。**都没在本机复现**，正文里也标了这句。
- **配图本身未做可读性实测。** `assets/three-piece-delivery.svg` 是示意图：图中每个元素都取自本章正文已经写明的东西（三件套、"三样缺一样，就当没做完"、"末行可以由任何一条命令产生"），图上没有新增任何实测结论。

## 证据等级

行尾那一组：**A 级**（本机复现、原始输出留档、我读错的推断也留着）。
方法与三条后果：**B/C 级**（建议与经验，没做实验）。

## 本机工具版本

| 工具            | 版本                                                               |
| --------------- | ------------------------------------------------------------------ |
| 操作系统        | Windows 10                                                         |
| git             | 2.33.1.windows.1                                                   |
| `core.autocrlf` | `true`（**这是这台机器现有的设置，我们没有改动它，也不建议照抄**） |

行尾行为跟 git 版本、`core.autocrlf`、有没有 `.gitattributes` 都有关。上面三个值就是这一章输出的适用范围。

## 涂改了哪些

**这一章没有需要涂的身份信息**：输出里只有文件名、行尾标记（`i/lf`、`w/crlf`）和字节值。文件里没有出现路径中的用户名、IP 或账号。

一处特意处理：演示文件建在本仓库目录里，取完证据就删掉了，仓库里不留 `crlf-demo.txt`。
