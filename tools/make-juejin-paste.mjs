// 把 output/juejin/<章节目录>.md 变成能粘进掘金编辑器的版本。
//
// 下面三处改动都是 2026-10-10 第 2 章首发实测逼出来的，不是预防性处理：
// 1) 正文首行那个 H1 要删掉。掘金的标题字段会把同一句话再显示一遍，实测预览页面上出现两条同名
//    大标题；章号改写进导语那句完整的话里（导语占位行会提醒你）。
// 2) 署名行要挪到文末。首页卡片上的"介绍"不是单独填的字段，而是正文开头截出来的——实测卡片截
//    100 个字，而署名行自己就占 120 个字，等于把导语的位置全占了。
// 3) 图片语法要换成插图标记，而且标记里点名要 PNG。掘金不认仓库里的相对路径；实测把 SVG 传上去
//    它收（上传控件没设 accept 过滤），但在服务端转成位图，而转码机上没有中文字体，图里的中文
//    全部渲染成方框。所以仓库里的 SVG 只能当数据附，不能当图传。
//
// 用法：npm run juejin:paste -- 02-tailscale-china-relay
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const chapter = process.argv[2];
if (!chapter) {
  console.error("要给哪一章？npm run juejin:paste -- 02-tailscale-china-relay");
  process.exit(2);
}

const src = join("output", "juejin", `${chapter}.md`);
if (!existsSync(src)) {
  console.error(`没有 ${src}。先跑 npm run build:site。`);
  process.exit(2);
}

const original = readFileSync(src, "utf8");
const failures = [];

// 代码块里的 `#` 是脚本注释，不是标题。第一次拿九章各跑一遍时，第 1 章 tmux 输出里的 `#` 和第 8 章
// shell 脚本里的 `#` 都被当成了多余的 H1，所以凡是在文档里判断"这一行是不是标题"，都要先过这一关。
function h1Lines(text) {
  const found = [];
  let open = false;
  text.split("\n").forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      open = !open;
      return;
    }
    if (!open && /^# /.test(line)) found.push({ index, line });
  });
  return found;
}

// 署名行按内容找：scripts/check.mjs 只规定"开头 6 行里要有含 CC BY 4.0 的那一行"，而第 1 到 5 章
// 把它写成引用块、第 6 章往后直接一行，所以不能按 `> ©` 前缀找。
const isCredit = (line) => line.includes("CC BY 4.0");

const lines = original.split("\n");
const headings = h1Lines(original);
const firstH1 = headings.length > 0 ? headings[0] : null;
const creditIndex = lines.slice(0, 6).findIndex(isCredit);
const credit = creditIndex >= 0 ? lines[creditIndex] : null;
if (!credit) failures.push("开头 6 行里找不到署名行，这一版不该存在");
if (!firstH1) failures.push("正文首行没有 H1，和 build-variants 的约定不一致");
if (headings.length > 1)
  failures.push(
    `正文里还有别的 H1（要在 chapters/<章>/index.md 里改成二级，不是在这里绕过）：${headings[1].line}`,
  );

// 图片语法 → 插图标记。
// 注意：这里不能用 \s*$ —— \s 含换行，会把图片行后面的空行一起吞掉，下一个标题就粘在标记那一行
// 下面（Markdown 里标题前没有空行就不成标题）。这是上一版踩过的坑。
let figureCount = 0;
let body = original.replace(
  /^!\[([^\]]*)\]\((assets\/[^)\s]+)\)$/gm,
  (_match, alt, path) => {
    figureCount += 1;
    const svg = path.split("/").pop();
    return [
      `【插图标记 ${figureCount}：在这里上传 ${chapter}__${svg.replace(/\.svg$/, "")}.png】`,
      "",
      `这张图要这样生成：在装了中文字体的机器上把 ${path} 按 2 倍尺寸渲染成 PNG`,
      "（2000 宽或更宽；实测 2 倍 PNG 上传后中文完整、显示尺寸正常）。",
      "",
      "图注用这句（掘金把它写进 img 的 alt 属性，页面上不显示，别指望它当图注）：",
      alt,
      "",
    ].join("\n");
  },
);

if (firstH1) {
  body = body
    .split("\n")
    .filter((_, index) => index !== firstH1.index)
    .join("\n");
}
if (credit) {
  body = body
    .split("\n")
    .filter((line) => !isCredit(line))
    .join("\n");
  body = `${body.replace(/\s+$/, "")}\n\n${credit}\n`;
}

// 导语占位放在最顶端，不去匹配某一章才有的措辞（第 1 章的第一段和第 2 章的第一段不是同一句话）。
const LEAD_PLACEHOLDER = [
  "【导语占位：写完删掉本行。100 字以内，把量到的数字放进前 40 个字——首页卡片只显示正文开头这 100 个字。",
  "第 2 章那句是：手机一出家门，我对家里那台机器测了 15 次：15 次全绕境外中继，最快 297 毫秒，",
  "最慢 1.8 秒，一次直连都没有。】",
].join("");
body = `${LEAD_PLACEHOLDER}\n\n${body.replace(/^\s+/, "")}`;

// 自检：改完要能自证。渠道改动一旦变成"凭感觉复制粘贴"，下一次发第几章都会漏东西。
if (h1Lines(body).length > 0)
  failures.push(`粘贴版里还剩 H1：${h1Lines(body)[0].line}`);
const creditPos = body.split("\n").findIndex(isCredit);
if (credit && creditPos < body.split("\n").length - 3)
  failures.push("署名行不在文末，卡片还是会截到它");
if (/!\[[^\]]*\]\(assets\//.test(body))
  failures.push("还留着相对路径的图片语法，掘金读不到");
if (!body.includes("【插图标记")) failures.push("没有插图标记，配图行去哪了？");
if (!body.startsWith("【导语占位")) failures.push("导语占位没在最顶端");
if (figureCount === 0) failures.push("这一章没有配图行？");

const outDir = join("output", "juejin-paste");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `${chapter}.md`);
writeFileSync(out, body);

console.log(`读 ${src}`);
console.log(`写 ${out}`);
console.log(
  `删掉的 H1：${firstH1 ? firstH1.line : "（无）"}\n挪到文末的署名行：${credit ? `${credit.slice(0, 40)}…` : "（无）"}`,
);
console.log(`插图标记：${figureCount} 处`);
console.log(
  `字数：正文 ${original.length} → 粘贴版 ${body.length}（卡片只显示正文开头 100 字，实测）`,
);

if (failures.length > 0) {
  console.error("\n粘贴版不合格：");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(
  "\n合格。粘之前最后一步：在装了中文字体的机器上把配图渲染成 2 倍 PNG。",
);
