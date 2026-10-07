# tmux 真实行为 · 实测证据 part 3

- 采集日期（UTC）：Tue Oct 6 16:33:26 UTC 2026
- '[exit=N]' 为该命令退出码。

```
$ uname -a
Linux <sandbox-host> 5.10.134-18.0.12.lifsea8.x86_64 #1 SMP <build-date> 2026 x86_64 x86_64 x86_64 GNU/Linux

$ tmux -V
tmux 3.2a
```

---

## 1. 先确认 script 和 timeout 在不在

```
$ command -v script; command -v timeout
/usr/bin/script
/usr/bin/timeout
[exit=0]
```

---

## 2. 在 tmux 里：终端被关掉，它还在

```
$ tmux new -s desk5 -d 'for i in $(seq 1 120); do echo tick $i >> /data/desk5.log; sleep 1; done'
[exit=0]
$ tmux ls
desk5: 1 windows (created Tue Oct  6 16:33:26 2026)
[exit=0]
$ wc -l /data/desk5.log
1 /data/desk5.log
[exit=0]
$ timeout 3 script -qec 'tmux attach -t desk5' /dev/null; echo "attach-exit=$?"
[?1049h[22;0;0t[?1h=[H[2J[?12l[?25h[?1000l[?1002l[?1003l[?1006l[?1005l(B[m[?12l[?25h[?1006l[?1000l[?1002l[?1003l[?2004l[1;1H[1;24r[>c[>q[1;1H[?25l[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K[30m[42m
[desk5] 0:bash*                          "<sandbox-host>" 16:33 06-Oct-26(B[m[?12l[?25h[1;1H(B[m[?12l[?25h[?1006l[?1000l[?1002l[?1003l[?2004l[1;1H[1;24r[1;1H[?25l[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K
[K[30m[42m
[desk5] 0:bash*                          "<sandbox-host>" 16:33 06-Oct-26(B[m[?12l[?25h[1;1H[?7727h
Session terminated, killing shell... ...killed.
attach-exit=124
[exit=0]
$ tmux ls
desk5: 1 windows (created Tue Oct  6 16:33:26 2026)
[exit=0]
$ wc -l /data/desk5.log
6 /data/desk5.log
[exit=0]
$ sleep 5
[exit=0]
$ wc -l /data/desk5.log
11 /data/desk5.log
[exit=0]
$ ps -ef | grep 'seq 1 120' | grep -v grep
root         139       1  0 16:33 ?        00:00:00 tmux new -s desk5 -d for i in $(seq 1 120); do echo tick $i >> /data/desk5.log; sleep 1; done
root         140     139  0 16:33 pts/0    00:00:00 bash -c for i in $(seq 1 120); do echo tick $i >> /data/desk5.log; sleep 1; done
[exit=0]
```

---

## 3. 不在 tmux 里：终端被关掉，它就没了

```
$ timeout 3 script -qec 'bash -c "for i in $(seq 1 60); do echo y >> /data/plain2.log; sleep 1; done"' /dev/null; echo "exit=$?"
bash: -c: line 2: syntax error near unexpected token `2'
bash: -c: line 2: `2'
exit=2
[exit=0]
$ ps -ef | grep 'seq 1 60' | grep -v grep
[exit=1]
$ wc -l /data/plain2.log
wc: /data/plain2.log: No such file or directory
[exit=1]
$ sleep 5
[exit=0]
$ wc -l /data/plain2.log
wc: /data/plain2.log: No such file or directory
[exit=1]
$ ps -ef | grep 'seq 1 60' | grep -v grep
[exit=1]
```

---

## 4. 收尾

```
$ tmux kill-server
[exit=0]
$ tmux ls
no server running on /tmp/tmux-0/default
[exit=1]
$ date -u
Tue Oct  6 16:33:41 UTC 2026
[exit=0]
$ ls -l /data
total 8448
-rw-r--r-- 1 root root     359 Oct  6 15:00 desk2.log
-rw-r--r-- 1 root root     151 Oct  6 16:15 desk4.log
-rw-r--r-- 1 root root     119 Oct  6 16:33 desk5.log
-rwxr-xr-x 1 root root 8605880 Oct  6 16:33 environment-manager
-rw-r--r-- 1 root root    5641 Oct  6 16:32 file_00rmeyjurcsu86nsxzrw
-rw-r--r-- 1 root root      32 Oct  6 16:15 plain.log
-rw-r--r-- 1 root root    3670 Oct  6 16:32 tmux-evidence-part2.md
-rw-r--r-- 1 root root    2901 Oct  6 16:33 tmux-evidence-part3.md
-rw-r--r-- 1 root root    5641 Oct  6 16:32 tmux-evidence.md
[exit=0]
```

---

## 3R. 上组第 1 条的 $(seq 1 60) 被 script 的 sh 提前展开导致语法报错，改为 \$(seq 1 60) 后重跑

```
$ timeout 3 script -qec 'bash -c "for i in \$(seq 1 60); do echo y >> /data/plain2.log; sleep 1; done"' /dev/null; echo "exit=$?"

Session terminated, killing shell... ...killed.
exit=124
[exit=0]
$ ps -ef | grep 'seq 1 60' | grep -v grep
[exit=1]
$ wc -l /data/plain2.log
3 /data/plain2.log
[exit=0]
$ sleep 5
[exit=0]
$ wc -l /data/plain2.log
3 /data/plain2.log
[exit=0]
$ ps -ef | grep 'seq 1 60' | grep -v grep
[exit=1]
$ ps -ef | grep 'plain2' | grep -v grep
[exit=1]
```
