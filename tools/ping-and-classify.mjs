// 跑一次 tailscale ping，把结果分类（走中继 / 内网直连 / 公网直连打洞），
// 只把掩码后的行写进证据文件——原始地址、主机名、账号一律不落盘。
//
//   node tools/ping-and-classify.mjs            # 自动挑第一个在线的对端
//   node tools/ping-and-classify.mjs 100.x.y.z  # 指定对端的 tailnet IP
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

const TS =
  process.env.TAILSCALE_BIN ?? "C:/Program Files/Tailscale/tailscale.exe";
const EVIDENCE = resolve(
  import.meta.dirname,
  "../chapters/02-tailscale-china-relay/evidence/tailscale-cn-probe.md",
);
const LAN = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

const json = execFileSync(TS, ["status", "--json"], {
  encoding: "utf8",
  maxBuffer: 8 << 20,
});
const status = JSON.parse(json);
const peers = Object.values(status.Peer ?? {});
const wanted = process.argv[2];
const peer = wanted
  ? peers.find((p) => (p.TailscaleIPs ?? []).includes(wanted))
  : peers.find(
      (p) =>
        p.Online && (p.TailscaleIPs ?? []).some((ip) => ip.startsWith("100.")),
    );

if (!peer) {
  console.error(
    "没有在线的对端。status 里的对端列表：",
    peers
      .map((p) => `${p.HostName}=${p.Online ? "online" : "offline"}`)
      .join(", ") || "(空)",
  );
  process.exit(1);
}

const target = (peer.TailscaleIPs ?? []).find((ip) => ip.startsWith("100."));
console.log(
  `对端：${peer.HostName} | online=${peer.Online} | tailnet IP = 100.x.y.z（已掩码）`,
);

// tailscale ping 在直连没打通时退出码非 0；execFileSync 遇到非 0 会抛异常，
// 并把未掩码的 stdout 打进错误对象里——那是会泄露主机名和 IP 的。所以用 spawnSync 自己读。
const ping = spawnSync(TS, ["ping", "-c", "5", target], { encoding: "utf8" });
const raw = `${ping.stdout ?? ""}${ping.stderr ?? ""}`;

let relay = 0;
let lanDirect = 0;
let publicDirect = 0;
const masked = [];
for (const line of raw.trim().split("\n")) {
  const one = line.trim();
  if (!one) continue;
  const derp = one.match(/via\s+DERP\((\w+)\)/);
  const addr = one.match(/via\s+(\d{1,3}(?:\.\d{1,3}){3}):(\d+)/);
  const ms = one.match(/in\s+(\d+)ms/);
  let kind;
  let out = one;
  // 先把"pong from <主机名> ("里的主机名拿掉：ping 输出用的是小写连字符形式，
  // 与 status --json 里的 HostName 不一定一致，靠字符串匹配会漏（我们真漏过一次）。
  out = out.replace(/(pong from )(\S+)( \()/, "$1<peer>$3");
  if (derp) {
    kind = "relay";
    relay += 1;
    // 中继地区代码（tok / sfo 这种）是公开基础设施信息，保留——它是这一章要引用的数字的一部分。
    out = out.replace(/100\.\d+\.\d+\.\d+/, "100.x.y.z");
  } else if (addr) {
    out = one
      .replace(/100\.\d+\.\d+\.\d+/, "100.x.y.z")
      .replace(
        `${addr[1]}:${addr[2]}`,
        LAN.test(addr[1]) ? "<lan-ip:port>" : "<public-ip:port>",
      );
    if (LAN.test(addr[1])) {
      kind = "lan-direct";
      lanDirect += 1;
    } else {
      kind = "public-direct";
      publicDirect += 1;
    }
  } else {
    kind = "other";
    out = one.replace(/100\.\d+\.\d+\.\d+/, "100.x.y.z");
  }
  masked.push({ kind, ms: ms ? Number(ms[1]) : null, line: out });
}

const first = masked.find((m) => m.kind !== "other");
const numbers = masked.map((m) => m.ms).filter((n) => n !== null);
const maskHost = (text) => String(text).replaceAll(peer.HostName, "<phone>");
const summary = {
  peerOnline: Boolean(peer.Online),
  relay,
  lanDirect,
  publicDirect,
  msMin: numbers.length ? Math.min(...numbers) : null,
  msMax: numbers.length ? Math.max(...numbers) : null,
};

console.log("分类：", JSON.stringify(summary));
console.log(
  "样例行：",
  first ? maskHost(first.line) : maskHost(masked[0]?.line ?? "(无)"),
);

const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
const body = masked.map((m) => maskHost(m.line)).join("\n");
appendFileSync(
  EVIDENCE,
  `\n\`\`\`\n$ tailscale ping -c 5 100.x.y.z   # ${stamp} UTC | peer on cellular data (Wi-Fi off)\n${body}\n\`\`\`\n\n分类结果：走中继 ${relay} 次 / 内网直连 ${lanDirect} 次 / 公网直连（打洞成功）${publicDirect} 次 / 往返 ${summary.msMin}～${summary.msMax} 毫秒\n`,
);
console.log("已把掩码后的结果追加进证据文件。");
