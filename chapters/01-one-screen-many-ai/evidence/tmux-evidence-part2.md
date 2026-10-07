# tmux 真实行为 · 实测证据 part 2

- 采集日期（UTC）：`Tue Oct  6 16:14:48 UTC 2026`
- `[exit=N]` 为该命令退出码。

```
$ uname -a
Linux <sandbox-host> 5.10.134-18.0.12.lifsea8.x86_64 #1 SMP <build-date> 2026 x86_64 x86_64 x86_64 GNU/Linux
```

```
$ tmux -V
tmux 3.2a
```

---

## 1. 离开（detach）不杀进程

### 1.1 建会话

```
$ tmux new -s desk4 -d 'for i in $(seq 1 120); do echo tick $i >> /data/desk4.log; sleep 1; done'
[exit=0]
```

```
$ tmux ls
desk4: 1 windows (created Tue Oct  6 16:14:56 2026)
[exit=0]
```

### 1.2 attach

```
$ tmux attach-session -t desk4
open terminal failed: not a terminal
[exit=1]
```

```
$ tmux attach -t desk4
open terminal failed: not a terminal
[exit=1]
```

```
$ tmux detach-client -t desk4 2>&1; echo "detach-exit=$?"
can't find client: desk4
detach-exit=1
```

### 1.3 attach 失败后仍在跑

```
$ tmux ls
desk4: 1 windows (created Tue Oct  6 16:14:56 2026)
[exit=0]
```

```
$ wc -l /data/desk4.log
10 /data/desk4.log
[exit=0]
```

```
$ sleep 5
[exit=0]
```

```
$ wc -l /data/desk4.log
15 /data/desk4.log
[exit=0]
```

---

## 2. 杀会话才杀进程

```
$ ps -ef | grep 'seq 1 120' | grep -v grep
root         105       1  0 16:14 ?        00:00:00 tmux new -s desk4 -d for i in $(seq 1 120); do echo tick $i >> /data/desk4.log; sleep 1; done
root         106     105  0 16:14 pts/0    00:00:00 bash -c for i in $(seq 1 120); do echo tick $i >> /data/desk4.log; sleep 1; done
[exit=0]
```

```
$ tmux kill-session -t desk4
[exit=0]
```

```
$ ps -ef | grep 'seq 1 120' | grep -v grep
[exit=1]
```

```
$ tmux ls
no server running on /tmp/tmux-0/default
[exit=1]
```

---

## 3. 对照：普通终端里的活

```
$ bash -c 'for i in $(seq 1 60); do echo x >> /data/plain.log; sleep 1; done' & echo "bg-pid=$!"
bg-pid=206
[exit=0]
```

```
$ sleep 3
[exit=0]
```

```
$ wc -l /data/plain.log
3 /data/plain.log
[exit=0]
```

### 3.1 补充（跨命令调用后该进程仍在）

```
$ ps -ef | grep 'seq 1 60' | grep -v grep
root         206       1  0 16:15 ?        00:00:00 bash -c for i in $(seq 1 60); do echo x >> /data/plain.log; sleep 1; done
[exit=0]
```

```
$ wc -l /data/plain.log
8 /data/plain.log
[exit=0]
```

```
$ sleep 3
[exit=0]
```

```
$ wc -l /data/plain.log
16 /data/plain.log
[exit=0]
```

### 3.2 pkill

```
$ pkill -f 'seq 1 60' ; echo "pkill-exit=$?"
pkill-exit=0
```

```
$ ps -ef | grep 'seq 1 60' | grep -v grep
[exit=1]
```

### 3.3 补充（pkill 后行数不再增长）

```
$ wc -l /data/plain.log
16 /data/plain.log
[exit=0]
```

```
$ sleep 3
[exit=0]
```

```
$ wc -l /data/plain.log
16 /data/plain.log
[exit=0]
```

```
$ ps -ef | grep 'seq 1' | grep -v grep
[exit=1]
```

```
$ ls -l /data
total 8428
-rw-r--r-- 1 root root     359 Oct  6 15:00 desk2.log
-rw-r--r-- 1 root root     151 Oct  6 16:15 desk4.log
-rwxr-xr-x 1 root root 8605880 Oct  6 16:15 environment-manager
-rw-r--r-- 1 root root      32 Oct  6 16:15 plain.log
-rw-r--r-- 1 root root    5641 Oct  6 16:14 tmux-evidence.md
[exit=0]
```

---

## 报错原文汇总（命令 · 退出码 · 输出）

```
$ tmux attach-session -t desk4
open terminal failed: not a terminal
[exit=1]

$ tmux attach -t desk4
open terminal failed: not a terminal
[exit=1]

$ tmux detach-client -t desk4
can't find client: desk4
detach-exit=1

$ ps -ef | grep 'seq 1 120' | grep -v grep
[exit=1]
（无输出，kill-session 之后）

$ tmux ls
no server running on /tmp/tmux-0/default
[exit=1]
（kill-session 之后）

$ ps -ef | grep 'seq 1 60' | grep -v grep
[exit=1]
（无输出，pkill 之后）

$ ps -ef | grep 'seq 1' | grep -v grep
[exit=1]
（无输出）
```
