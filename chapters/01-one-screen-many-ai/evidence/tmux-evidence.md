# tmux 真实行为 · 实测证据

- 采集日期（UTC）：`Tue Oct  6 15:00:50 UTC 2026`
- `[exit=N]` 为该命令退出码。

## 文件头 · 基础指纹

```
$ uname -a
Linux <sandbox-host> 5.10.134-18.0.12.lifsea8.x86_64 #1 SMP <build-date> 2026 x86_64 x86_64 x86_64 GNU/Linux
```

```
$ cat /etc/os-release
PRETTY_NAME="Ubuntu 22.04.5 LTS"
NAME="Ubuntu"
VERSION_ID="22.04"
VERSION="22.04.5 LTS (Jammy Jellyfish)"
VERSION_CODENAME=jammy
ID=ubuntu
ID_LIKE=debian
HOME_URL="https://www.ubuntu.com/"
SUPPORT_URL="https://help.ubuntu.com/"
BUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"
PRIVACY_POLICY_URL="https://www.ubuntu.com/legal/terms-and-policies/privacy-policy"
UBUNTU_CODENAME=jammy
```

```
$ tmux -V
tmux 3.2a
```

---

## 第一步：机器指纹

```
$ uname -a
Linux <sandbox-host> 5.10.134-18.0.12.lifsea8.x86_64 #1 SMP Tue Aug 4 16:35:16 CST 2026 x86_64 x86_64 x86_64 GNU/Linux
[exit=0]
```

```
$ cat /etc/os-release
PRETTY_NAME="Ubuntu 22.04.5 LTS"
NAME="Ubuntu"
VERSION_ID="22.04"
VERSION="22.04.5 LTS (Jammy Jellyfish)"
VERSION_CODENAME=jammy
ID=ubuntu
ID_LIKE=debian
HOME_URL="https://www.ubuntu.com/"
SUPPORT_URL="https://help.ubuntu.com/"
BUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"
PRIVACY_POLICY_URL="https://www.ubuntu.com/legal/terms-and-policies/privacy-policy"
UBUNTU_CODENAME=jammy
[exit=0]
```

```
$ id
uid=0(root) gid=0(root) groups=0(root)
[exit=0]
```

```
$ tmux -V
tmux 3.2a
[exit=0]
```

```
$ command -v apt && command -v sudo
/usr/bin/apt
[exit=1]
```

```
$ ls -l /dev/net/tun
crw-rw-rw- 1 root root 10, 200 Oct  6 14:59 /dev/net/tun
[exit=0]
```

---

## 第二步：装 tmux

```
$ apt-get install -y tmux
Reading package lists...
Building dependency tree...
Reading state information...
tmux is already the newest version (3.2a-4ubuntu0.2).
0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.
[exit=0]
```

```
$ tmux -V
tmux 3.2a
[exit=0]
```

---

## 第三步：关掉终端 ≠ 杀掉进程

### 3.1 建会话 + 列会话

```
$ tmux new -s desk1 -d 'sleep 600; echo DONE > /data/desk1-done.txt'
[exit=0]
```

```
$ tmux ls
desk1: 1 windows (created Tue Oct  6 14:59:45 2026)
[exit=0]
```

```
$ ps -ef | grep 'sleep 600' | grep -v grep
root         173       1  0 14:59 ?        00:00:00 tmux new -s desk1 -d sleep 600; echo DONE > /data/desk1-done.txt
root         174     173  0 14:59 pts/0    00:00:00 bash -c sleep 600; echo DONE > /data/desk1-done.txt
root         176     174  0 14:59 pts/0    00:00:00 sleep 600
[exit=0]
```

### 3.2 杀会话后再查

```
$ tmux kill-session -t desk1
[exit=0]
```

```
$ tmux ls
no server running on /tmp/tmux-0/default
[exit=1]
```

```
$ ps -ef | grep 'sleep 600' | grep -v grep
[exit=1]
```

### 3.3 补充（desk1 的 echo 是否执行）

```
$ cat /data/desk1-done.txt
cat: /data/desk1-done.txt: No such file or directory
[exit=1]
```

---

## 第四步：离开再回来，它还在跑

```
$ tmux new -s desk2 -d 'for i in $(seq 1 300); do echo tick $i >> /data/desk2.log; sleep 1; done'
[exit=0]
```

```
$ tmux ls
desk2: 1 windows (created Tue Oct  6 14:59:59 2026)
[exit=0]
```

```
$ wc -l /data/desk2.log
1 /data/desk2.log
[exit=0]
```

```
$ sleep 5
[exit=0]
```

```
$ wc -l /data/desk2.log
5 /data/desk2.log
[exit=0]
```

---

## 第五步：一块屏幕分给三个"AI"

```
$ tmux new -s ai-a -d
[exit=0]
```

```
$ tmux new -s ai-b -d
[exit=0]
```

```
$ tmux new -s ai-c -d
[exit=0]
```

```
$ tmux ls
ai-a: 1 windows (created Tue Oct  6 15:00:11 2026)
ai-b: 1 windows (created Tue Oct  6 15:00:11 2026)
ai-c: 1 windows (created Tue Oct  6 15:00:11 2026)
desk2: 1 windows (created Tue Oct  6 14:59:59 2026)
[exit=0]
```

```
$ tmux list-panes -a -F '#{session_name} #{window_index} #{pane_index} #{pane_current_command}'
ai-a 0 0 bash
ai-b 0 0 bash
ai-c 0 0 bash
desk2 0 0 bash
[exit=0]
```

```
$ tmux split-window -t ai-b
[exit=0]
```

```
$ tmux list-panes -t ai-b -F '#{pane_index} #{pane_current_command}'
0 bash
1 bash
[exit=0]
```

### 5.1 补充（全量 pane 视图、desk2 仍在推进）

```
$ tmux list-panes -a -F '#{session_name} #{window_index} #{pane_index} #{pane_current_command}'
ai-a 0 0 bash
ai-b 0 0 bash
ai-b 0 1 bash
ai-c 0 0 bash
desk2 0 0 bash
[exit=0]
```

```
$ tail -3 /data/desk2.log
tick 37
tick 38
tick 39
[exit=0]
```

```
$ wc -l /data/desk2.log
39 /data/desk2.log
[exit=0]
```

### 5.2 关服务器

```
$ tmux kill-server
[exit=0]
```

```
$ tmux ls
server exited unexpectedly
[exit=1]
```

```
$ ps -ef | grep -E 'tmux|sleep 600' | grep -v grep
root         173       1  0 14:59 ?        00:00:00 [tmux: server] <defunct>
root         219       1  0 14:59 ?        00:00:00 [tmux: server] <defunct>
[exit=0]
```

```
$ wc -l /data/desk2.log
46 /data/desk2.log
[exit=0]
```

```
$ ls -l /data
total 8412
-rw-r--r-- 1 root root     359 Oct  6 15:00 desk2.log
-rwxr-xr-x 1 root root 8605880 Oct  6 15:00 environment-manager
[exit=0]
```

```
$ tmux ls
no server running on /tmp/tmux-0/default
[exit=1]
```

```
$ date -u
Tue Oct  6 15:00:50 UTC 2026
[exit=0]
```

---

## 报错原文汇总（命令 · 退出码 · 输出）

```
$ command -v apt && command -v sudo
[exit=1]
（无输出）

$ tmux ls
no server running on /tmp/tmux-0/default
[exit=1]
（kill-session -t desk1 之后）

$ cat /data/desk1-done.txt
cat: /data/desk1-done.txt: No such file or directory
[exit=1]

$ ps -ef | grep 'sleep 600' | grep -v grep
[exit=1]
（无输出）

$ tmux ls
server exited unexpectedly
[exit=1]
（kill-server 之后第一次）

$ tmux ls
no server running on /tmp/tmux-0/default
[exit=1]
（kill-server 之后第二次）
```
