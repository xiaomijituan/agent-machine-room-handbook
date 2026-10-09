# Tailscale in China - measured evidence

collected: 2026-10-06 18:15:25 UTC
operator box: a Windows 10 machine in mainland China, behind a home NAT, Tailscale native client

NOTE: public IP, LAN addresses and tailnet hostnames are replaced by placeholders in this file and in the chapter. What is redacted is listed at the end.

```
$ tailscale version
1.102.2
  go version: go1.26.5 (tailscale/go 63ae404c82)

$ tailscale status (redacted summary)
BackendState = Running
Self.Online  = true
Self.TailscaleIPs = 100.x.y.z (redacted)
PeerCount    = 1

$ tailscale netcheck
Report:
	* Time: 2026-10-07 02:15:28.9370557+08:00
	* UDP: true
	* IPv4: yes, 203.0.113.9:37271
	* IPv6: no, but OS has support
	* MappingVariesByDestIP: false
	* PortMapping:
	* CaptivePortal: false
	* Nearest DERP: Seattle
	* DERP latency:
		- sea: 170.9ms (Seattle)
		- nue: 171.6ms (Nuremberg)
		- sfo: 173.7ms (San Francisco)
		- lax: 174.2ms (Los Angeles)
		- den: 186.9ms (Denver)
		- hel: 191.7ms (Helsinki)

$ curl HEAD control-plane, DIRECT (no proxy)
https://api.tailscale.com http=302 dns=0.014006s total=0.503369s
https://login.tailscale.com http=302 dns=0.009126s total=0.501870s
https://controlplane.tailscale.com http=302 dns=0.008905s total=0.525447s

$ curl HEAD control-plane, VIA LOCAL PROXY 127.0.0.1:7897
https://api.tailscale.com http=302 total=0.803610s
https://login.tailscale.com http=302 total=0.790480s
```

```
$ tailscale ping -c 5 <peer-100.x.y.z>
pong from <phone> (100.104.0.2) via 192.0.2.184:34111 in 14ms

$ tailscale ping -c 5, output masked
pong from <phone> (100.x.y.z) via <lan-ip:port> in 6ms
```

## 已涂改项（原文不外传）

- 公网 IP → 203.0.113.9（文档保留段）
- 内网地址 3 个 → 192.0.2.x（文档保留段）
- tailnet IP 1 个 → 100.104.0.2
- 手机主机名 → <phone>；本机主机名 → <this-box>；tailnet 账号 → <account>

注意：`via` 后面那个地址（占位符 192.0.2.184 原来的值）是一个**内网地址**，不是公网地址。也就是说这次测到的只是"同一个局域网里走直连"，**没有测到跨网络打洞**。含义与下一步见 verify.md。

```
$ tailscale ping -c 5 100.x.y.z   # 手机关掉 Wi-Fi、走蜂窝流量之后
pong from <phone> (100.x.y.z) via DERP(tok) in 320ms
pong from <phone> (100.x.y.z) via DERP(tok) in 371ms
pong from <phone> (100.x.y.z) via DERP(tok) in 310ms
pong from <phone> (100.x.y.z) via DERP(tok) in 329ms
pong from <phone> (100.x.y.z) via DERP(tok) in 316ms
direct connection not established

（计数：走 DERP 5 次 / 直连 0 次。命令退出码非 0，因为直连没打通。）
```

**这一组是第 2 章的核心证据**：同一对设备，手机在自家 Wi-Fi 里时是内网直连、6～14 毫秒；手机切到蜂窝流量后，直连打洞失败，五次全部改走中继（代号 tok），310～371 毫秒。上面那段 `pong ... via <lan-ip:port>` 和这段 `pong ... via DERP(tok)` 就是"直连"和"走中继"两种形态的原文对照。

第一轮（更早那次，同一个蜂窝场景的首个 pong）出现过 987 毫秒，随后稳定在 310～370 毫秒区间。首包特别慢这件事正文里会提，但只写成"我们看到过一次 987 毫秒的首包"，不推断原因。

```
$ tailscale ping -c 5 100.x.y.z   # 2026-10-07 05:03:20 UTC | peer on cellular data (Wi-Fi off)
pong from <phone> (100.x.y.z) via DERP(<region>) in 387ms
pong from <phone> (100.x.y.z) via DERP(<region>) in 412ms
pong from <phone> (100.x.y.z) via DERP(<region>) in 447ms
pong from <phone> (100.x.y.z) via DERP(<region>) in 315ms
pong from <phone> (100.x.y.z) via DERP(<region>) in 392ms
direct connection not established
```

分类结果：走中继 5 次 / 内网直连 0 次 / 公网直连（打洞成功）0 次 / 往返 315～447 毫秒

```
$ tailscale ping -c 5 100.x.y.z   # 2026-10-07 05:05:19 UTC | peer on cellular data (Wi-Fi off)
pong from <peer> (100.x.y.z) via DERP(tok) in 1.804s
pong from <peer> (100.x.y.z) via DERP(tok) in 314ms
pong from <peer> (100.x.y.z) via DERP(tok) in 881ms
pong from <peer> (100.x.y.z) via DERP(tok) in 304ms
pong from <peer> (100.x.y.z) via DERP(tok) in 297ms
direct connection not established
```

分类结果：走中继 5 次 / 内网直连 0 次 / 公网直连（打洞成功）0 次 / 往返 297～881 毫秒

## 蜂窝网络下三次复测的汇总（手机走流量，Wi-Fi 关闭）

| 次序   | 走 DERP(tok) | 内网直连 | 公网直连 | 往返区间          |
| ------ | ------------ | -------- | -------- | ----------------- |
| 第一次 | 5            | 0        | 0        | 310 ～ 371 ms     |
| 第二次 | 5            | 0        | 0        | 315 ～ 447 ms     |
| 第三次 | 5            | 0        | 0        | 297 ms ～ 1.804 s |

**15 次 pong，全部走中继，一次直连都没打通。** 抖动还很大：最快 297 毫秒，最慢一下 1.8 秒。

对照同一家里 Wi-Fi 下的两次：`via <lan-ip:port>`，6～14 毫秒。

**差别的来源没有查明**，这里只记现象：手机离开家庭网络、走蜂窝流量后，打洞失败。蜂窝网络通常是运营商级 NAT（CGNAT），那种情况打洞难是公认常识，但**"因为 CGNAT 所以失败"是推测，不是这次测出来的**。正文按这个分寸写。
