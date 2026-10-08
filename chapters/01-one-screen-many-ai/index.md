# 第 1 章 · 一个屏幕开好几块，各跑各的

> © 2026 xiaomijituan · 正文 CC BY 4.0，代码与数据 MIT · 原仓库 https://github.com/xiaomijituan/agent-machine-room-handbook

这一章教你一件事：**把活放进 tmux 之后，你关掉终端窗口，活还在干。**

下面所有命令和输出都是真跑出来的，不是抄文档。跑在一台 Ubuntu 22.04 的云端沙箱上，tmux 版本 3.2a。每一次真实输出后面都注明了能在哪找到原始记录。

## 先说清楚这章解决谁的麻烦

你让三个 AI 同时帮你干活。一个在装依赖，一个在改代码，一个在跑测试。

麻烦马上就来：

- 你只有一个屏幕。开三个终端窗口来回切，切到第三个就忘了第一个在干什么。
- 更要命的是，你合上笔记本、关掉终端窗口、或者 ssh 断了一次——**正在跑的东西全没了**。回来只能重跑。

网上讲 tmux 的文章，绝大多数讲的是"你自己怎么开多个终端方便"。这不是这章要说的。这章要说的是：**屏幕是分给 AI 的，不是分给你自己的。** 你给每个 AI 一块屏幕，然后你可以走开。

## 三分钟上手

三条命令，现在就敲：

```bash
tmux                      # 进去一块新屏幕
tmux ls                   # 看看你有几块
tmux new -s ai-1 -d       # 不开屏，直接在背后建一个，起名叫 ai-1
```

第一条会把你带进一个新会话（tmux 里叫 session，就是"一个能长期活着的工作台"）。界面几乎没变，只是最下面多了一条状态栏。

想出去，按 `Ctrl-b` 松开，再按 `d`。这叫**离开**（detach）。你走了，会话还在。

再进来，敲 `tmux attach`。这叫**回来**（attach）。

## 真正的那件事：关掉终端，它还在不在

这是整章唯一的重点，所以我们做了一次对照实验：同样一个每秒写一行的程序，一个放进 tmux，一个不放；然后用同一个办法把它的"终端窗口"掐掉。

**怎么掐的**：我们没法真的去点一个窗口，所以用 `script` 造一个假终端，再用 `timeout 3` 三秒后把它杀掉（退出码 `124` 就是"被 timeout 杀了"的记号）。这在效果上等同于你关掉终端窗口——窗口没了，系统会给里面的进程发一个"挂断信号"。

### 放进 tmux 的那个

先建会话，让它每秒往 `/data/desk5.log` 写一行：

```bash
tmux new -s desk5 -d 'for i in $(seq 1 120); do echo tick $i >> /data/desk5.log; sleep 1; done'
```

然后接上去看三秒，再把终端掐掉：

```bash
timeout 3 script -qec 'tmux attach -t desk5' /dev/null
```

输出末尾是：

```
Session terminated, killing shell... ...killed.
```

终端死了。现在看会话和进程：

```bash
$ tmux ls
desk5: 1 windows (created Tue Oct  6 16:33:26 2026)

$ wc -l /data/desk5.log
6 /data/desk5.log

$ sleep 5

$ wc -l /data/desk5.log
11 /data/desk5.log

$ ps -ef | grep 'seq 1 120' | grep -v grep
root   139   1  0 16:33 ?    00:00:00 tmux new -s desk5 -d for i in $(seq 1 120); ...
root   140 139  0 16:33 pts/0 00:00:00 bash -c for i in $(seq 1 120); ...
```

**终端死了，会话还在，日志从 6 行涨到 11 行，两条进程都活着。**

（原始记录：`evidence/tmux-evidence-part3.md` 第 2 节。那段掐断前的输出里还能看到 tmux 的状态栏 `[desk5] 0:bash*`，说明真的接上去过。）

### 没放进 tmux 的那个

同一个假终端、同一个三秒掐断，只是里面没有 tmux：

```bash
timeout 3 script -qec 'bash -c "for i in \$(seq 1 60); do echo y >> /data/plain2.log; sleep 1; done"' /dev/null
```

结果：

```
Session terminated, killing shell... ...killed.

$ ps -ef | grep 'seq 1 60' | grep -v grep
（什么都没有，退出码 1）

$ wc -l /data/plain2.log
3 /data/plain2.log

$ sleep 5

$ wc -l /data/plain2.log
3 /data/plain2.log
```

**死了，行数卡在 3，不再涨。**

这就是 tmux 存在的意义：它把"活"从"你的终端窗口"里拿出来，交给背后一个叫 **tmux 服务器**的进程管。你的窗口只是**一块屏幕的临时观众**，观众走了，戏还在演。

### 用 `&` 丢后台，和用 tmux，管的不是同一件事

看到这儿你会想问：我不用 tmux，在命令后面加一个 `&`，让命令到后台跑，行不行？

**先说 `&` 是干什么的**：`&` 的意思是"这条命令别占着屏幕，跑到后面去"。你可以继续敲别的命令。

**`&` 有一个弱点**：加了 `&` 的命令，**仍然归你当前这个终端窗口管**。你把窗口一关，系统会给窗口里所有命令发一个"该走了"的信号（术语叫挂断信号）。后台命令也照样收到，也一起死。

**我们的实测能不能证明这个弱点？不能直接证明。** 实测直接证明的是另一半：**不在 tmux 里的命令，所属的终端被掐掉，那条命令就死了**——见前面那个对照实验。

**那为什么另一次实测里，加了 `&` 的命令活下来了？**

```
$ ps -ef | grep 'seq 1 60' | grep -v grep
root   206   1  0 16:15 ?   00:00:00 bash -c for i in $(seq 1 60); ...
#                 ↑ 这个 1 是"上级进程"的编号
```

这里能看到那条命令的**上级进程编号是 1**（术语叫父进程，指"谁把这条命令生出来"；1 号是机器上最早启动的那个总管家进程，所有失去上级的进程最后都归它）。上级已经变成 1 号，说明原来那个 shell 早就退出了。

**据此推出来的解释是**：云端沙箱执行命令的方式，是每条命令配一个全新的 shell，命令一跑完 shell 就退出，**从头到尾没有"终端窗口"这个东西存在过**。既然没有窗口被关掉，也就没人发"该走了"的信号。所以那条 `&` 命令是**侥幸活着**，不是因为 `&` 扛住了关窗口。

**记住这个区别**：

| 你想解决的事                                         | 该用什么        |
| ---------------------------------------------------- | --------------- |
| "这条命令别占着屏幕，我还要敲别的"                   | 用 `&` 丢后台   |
| "我关掉窗口、合上笔记本、ssh 断了，这条命令还得活着" | **只能用 tmux** |

你要的是第二件事。`&` 给不了。

## 一块屏幕切给三个 AI

建三个会话，一个名字一个 AI：

```bash
tmux new -s ai-a -d
tmux new -s ai-b -d
tmux new -s ai-c -d
```

看看有什么：

```bash
$ tmux ls
ai-a: 1 windows (created Tue Oct  6 15:00:11 2026)
ai-b: 1 windows (created Tue Oct  6 15:00:11 2026)
ai-c: 1 windows (created Tue Oct  6 15:00:11 2026)
desk2: 1 windows (created Tue Oct  6 14:59:59 2026)

$ tmux list-panes -a -F '#{session_name} #{window_index} #{pane_index} #{pane_current_command}'
ai-a 0 0 bash
ai-b 0 0 bash
ai-c 0 0 bash
desk2 0 0 bash
```

想把 `ai-b` 那一屏切成两块：

```bash
tmux split-window -t ai-b
```

```bash
$ tmux list-panes -t ai-b -F '#{pane_index} #{pane_current_command}'
0 bash
1 bash
```

**每一块小屏幕（tmux 里叫 pane）就是一个独立的位置。** 你可以让一块跑测试、一块盯着日志、一块等你敲下一条命令。三个 AI 各占一块，你一眼能看全。

（原始记录：`evidence/tmux-evidence.md` 第 5 节。）

## 三个动作千万别搞混

这是新手最容易犯的错误，而且犯了才知道贵。

| 你做的事             | 命令                                   | 里面的活会怎样       |
| -------------------- | -------------------------------------- | -------------------- |
| 离开                 | 按 `Ctrl-b` 然后 `d`，或 `tmux detach` | **继续活着**         |
| 杀掉一个会话         | `tmux kill-session -t 名字`            | **一起被杀掉**       |
| 关掉整个 tmux 服务器 | `tmux kill-server`                     | **全部会话一起没了** |

第二条我们专门验过。杀掉 `desk1` 会话之后：

```bash
$ tmux ls
no server running on /tmp/tmux-0/default

$ ps -ef | grep 'sleep 600' | grep -v grep
（空，退出码 1）

$ cat /data/desk1-done.txt
cat: /data/desk1-done.txt: No such file or directory
```

那个会话原本要在跑完之后写一个 `desk1-done.txt` 文件。文件从来没出现过——**因为整条命令链被一起掐死了**，那句写文件的命令根本没机会执行。

（原始记录：`evidence/tmux-evidence.md` 第 3 节，`evidence/tmux-evidence-part2.md` 第 2 节，两次独立复现。）

所以：**想让它活着，用离开；想让它彻底没了，才用杀会话。** 别把"我关掉了"当成"我杀掉了"。

## 一个意外发现：没有真终端，你"回来"不了

这一点几乎所有 tmux 教程都不讲，但你一定会撞上。

我们在一个没有真终端的环境里（云端沙箱，命令是一条一条独立跑的，压根没有窗口这个东西）试 `tmux attach`：

```bash
$ tmux attach-session -t desk4
open terminal failed: not a terminal

$ tmux detach-client -t desk4
can't find client: desk4
```

**报错原文就是这样。**

意思是：没有真终端的时候，你接不上去。不是命令写错了，是那个环境里就没有"屏幕"可以给你看。

这对你有什么用？三种情况你都会撞上：CI 流水线、脚本、别人给的临时沙箱。这时候别折腾 `attach`，改用这几条看状态：

```bash
tmux ls                                    # 有哪些会话
tmux list-panes -a -F '#{pane_index} #{pane_current_command}'   # 每块屏在跑什么
tmux capture-pane -t desk5 -p              # 把那块屏幕上的文字抓下来
tmux send-keys -t ai-a 'npm test' Enter    # 不接屏幕，直接往里敲
```

最后一句是重点：**你不需要"接上屏幕"也能指挥它。** `send-keys` 就是隔着门往里喊话。

（原始记录：`evidence/tmux-evidence-part2.md` 第 1.2 节。）

## 你大概率会撞上的一个报错

上面那个对照组实验，第一次跑出来是这个：

```
bash: -c: line 2: syntax error near unexpected token `2'
```

原因是 `$(seq 1 60)` 被**提前展开**了。命令要穿过 `script` 那一层 shell，它先把 `$(...)` 算成了一个数字，传下去的已经不是你以为的那句。

修法：把 `$` 转义。

```bash
script -qec 'bash -c "for i in \$(seq 1 60); do ... done"' /dev/null
#                          ↑ 加了反斜杠
```

这件事值得记住，因为你会在很多地方再撞上它：**只要命令要再过一层 shell——`ssh`、`tmux new -d`、`script`、`docker exec`——就要问一句：这个 `$(...)` 会在哪一层被算掉？**

（原始记录：`evidence/tmux-evidence-part3.md` 第 3 节和第 3R 节，失败和改好后的两次都在。）

## 顺手知道一下：僵尸进程

`tmux kill-server` 之后，`ps` 里会留下这种东西：

```
root   173   1  0 14:59 ?   00:00:00 [tmux: server] <defunct>
root   219   1  0 14:59 ?   00:00:00 [tmux: server] <defunct>
```

`<defunct>` 就是**僵尸进程**：已经死了，但它的记录还没被收走。在容器和沙箱里这很常见，因为负责收尸的那个 1 号进程不一定干了这件事。

看到它**不用慌，也不用管**——它不占内存，只占一个记录位。

（原始记录：`evidence/tmux-evidence.md` 第 5.2 节。）

## 这章带走三句话

1. **屏幕是给 AI 分的，不是给你自己的。** 一个 AI 一个会话，或者一个 AI 一块屏幕，你只管派活和看结果。
2. **离开和杀掉是两回事。** `Ctrl-b d` 走了，它照跑；`kill-session` 才是真杀。
3. **没有真终端就别 attach。** 用 `send-keys` 隔着门喊话，用 `capture-pane` 看结果。

## 你自己怎么验

书里的东西都在一台云端 Ubuntu 上测过。你在自己机器上复现，三条就够：

```bash
tmux new -s test -d 'for i in $(seq 1 30); do echo $i >> /tmp/t.log; sleep 1; done'
tmux ls
wc -l /tmp/t.log        # 隔几秒再敲一次，数字一直在涨
```

然后**把那个终端窗口直接关掉**，重开一个窗口敲 `tmux ls`——`test` 还在。这就是这章的全部。

---

### 本章的证据在哪

所有输出的原始文件在 `evidence/` 目录：`tmux-evidence.md`（基础行为）、`tmux-evidence-part2.md`（失败的一轮）、`tmux-evidence-part3.md`（对照实验）。机器、系统版本、软件版本、怎么测的、**哪些没测到**，都写在 `verify.md` 里。

### 这一章的配套文件与提醒

- **可以点着玩的部分**：这一章配了一份剧本（`scenario.json`）。在仓库根目录执行 `npm run serve:site`，然后打开 <http://127.0.0.1:5280/site/chapter.html?chapter=01-one-screen-many-ai>：页面会把这份剧本交给嵌在下面的模拟器，机房会变成剧本里描述的那三块屏幕，主机一栏是 `laptop` 和 `cloud`。如果页面提示没有成功，就把 `scenario.json` 的全文复制下来，粘贴进模拟器的「剧本库」再按「导入」——那是不走注入的另一条入口，校验规则完全一样。
- **对拍**：`reference.jsonl` 是这一章的一局记录，只有两次决策（一次拍板、一次下发）。你玩出来的那一局导出后跟它并排比，看差别落在哪一步。**它不是标准答案**，是一把尺子。
- **Windows 上怎么办**：单独写在 `china.md`，因为 Windows 上根本装不了 tmux，这不是三句话能说清的。
- **一条使用提醒**：别把模拟器挂在后台标签页。浏览器会给看不见的页面限速，我们实测三分钟里它只推进了 6 拍（正常情况下差不多一秒一拍）。
