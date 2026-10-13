// 语域检查。只扫 chapters/ 下的 Markdown——STYLE.md 和 README.md 里必须写着反例本身，
// 扫它们等于让规矩检查自己打自己。
//
// 这份脚本管六件事：语域黑名单（含"那条路"这类空间比喻）、正文里的"读者"、自称词（本章/本节/这一节/这一段）计数、
// 每段"你"出现超过一次、小节标题里的疑问式口语、双音词被压成单音（裸用的"量"该写"测量"）。
//
// 它故意不管两件事，因为探针给不出可靠的数：代号在读者那边能不能落地、句子有没有真正的论元。
// 那两条要人判，写进 STYLE.md 第七条的末尾。
//
// 默认是报告模式（退出码 0），打印的是欠账清单。加 --strict 之后任何一条命中都会让退出码变非零，
// 九章改完之后把 --strict 接进 CI。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const strict = process.argv.includes("--strict");

const BLACKLIST = [
  "乱子",
  "坑",
  "咬你",
  "兜底",
  "收口",
  "说白了",
  "其实就是",
  "怎么验",
  "去倒水",
  "顺手",
  "这章",
  "那章",
  // 空间比喻顶替机制说法：见 STYLE.md 第七节的病因表最后一行
  "那条路",
  "哪条路",
  "两条路",
  "这条路",
];
const SELF_REFERENCE = ["本章", "本节", "这一节", "这一段"];
// 双音词被压成单音：动词"量"该写"测量"。前面的字要排掉那些本来就是复合词的情况
// （流量、变量、数量、质量、重量、尽量、容量、度量、计算量、样本量、测量），
// 后面要求跟着一个补语（到/过/出/得了/一次/这/那/遍），这才是动词用法。
const BARE_MEASURE =
  /(?:^|[^测流变数质重尽力容度能计样衡理])量[到过出得了次这那遍一]/;
const READERS = "读者";
const TITLE_SPOKEN = ["怎么", "什么时候", "干嘛", "咋", "吗"];

const collect = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "output") continue;
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    // STYLE.md 里必须写着反例本身（"乱子""坑"这些原句），扫它等于让规矩检查自己打自己；
    // LICENSE-docs.md 是许可证的人类可读摘要，措辞由许可证决定，而且"读者看得见的位置"
    // 正是规矩允许的那两处元话语之一。
    if (entry.name === "STYLE.md" || entry.name === "LICENSE-docs.md") continue;
    if (entry.isDirectory()) out.push(...collect(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
};

// 代码块内不算文笔；行内代码里的标识符也不算；署名行是许可证文本。
// 引号里是当时敲进模拟器的那句话、剧本台词或原始输出——那些是证据，一字不改，也不该算成我们
// 自己写的说明文字。配对必须跨行做：一段引文被 Markdown 换行劈成两行时，按行配对会错乱
// （它曾把记账里"两条路"这种被引用的旧说法当成裸用），所以这里用一个带状态的扫描。
const strip = (line, state) => {
  if (/^\s*>\s*©|^\s*©/.test(line)) return "";
  const plain = line
    .replace(/`[^`]*`/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  let out = "";
  for (const ch of plain) {
    if (ch === "“") {
      state.quote = true;
      out += " ";
      continue;
    }
    if (ch === "”") {
      state.quote = false;
      out += " ";
      continue;
    }
    if (ch === '"') {
      state.quote = !state.quote;
      out += " ";
      continue;
    }
    out += state.quote ? " " : ch;
  }
  return out;
};

const hits = [];
const perChapter = new Map();

for (const file of collect(root)) {
  const label = file.slice(root.length + 1).replace(/\\/g, "/");
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const state = { fence: false, quote: false };
  let paragraph = [];
  let paragraphStart = 0;
  const selfCount = [];
  const readerLines = [];

  const flushParagraph = (at) => {
    const text = paragraph.join("");
    const you = (text.match(/你/g) || []).length;
    if (you > 1) {
      hits.push({
        kind: "每段第二人称超过一次",
        where: `${label}:${paragraphStart}`,
        detail: `${you} 次"你" —— ${text.slice(0, 40)}……`,
      });
    }
    paragraph = [];
    paragraphStart = at;
  };

  lines.forEach((raw, index) => {
    const number = index + 1;
    if (/^\s*(```|~~~)/.test(raw)) {
      state.fence = !state.fence;
      return;
    }
    const line = strip(raw, state);
    if (!line.trim()) {
      flushParagraph(number);
      return;
    }
    if (!paragraph.length) paragraphStart = number;
    // 表格单元按规矩可以省主语，每个单元各说各话，把整行算成一个自然段只会制造假红
    if (/^\s*\|/.test(line)) {
      flushParagraph(number);
      return;
    }
    paragraph.push(line);

    const isHeading = /^\s*#{1,6}\s/.test(line);
    if (isHeading) {
      const spoken = TITLE_SPOKEN.filter((word) => line.includes(word));
      if (spoken.length) {
        hits.push({
          kind: "小节标题里有疑问式口语",
          where: `${label}:${number}`,
          detail: `${spoken.join("、")} —— ${line.trim()}`,
        });
      }
    } else {
      for (const word of BLACKLIST) {
        if (line.includes(word)) {
          hits.push({
            kind: "语域黑名单",
            where: `${label}:${number}`,
            detail: `「${word}」 —— ${line.trim().slice(0, 60)}`,
          });
        }
      }
      if (BARE_MEASURE.test(line)) {
        hits.push({
          kind: "双音词被压成单音（裸用的量）",
          where: `${label}:${number}`,
          detail: `该写"测量" —— ${line.trim().slice(0, 60)}`,
        });
      }
      if (line.includes(READERS)) readerLines.push(number);
      const found = SELF_REFERENCE.filter((word) => line.includes(word));
      if (found.length) selfCount.push({ number, words: found });
    }
  });
  flushParagraph(lines.length + 1);

  // 探针自检：扫到文件末尾还停在"引号里"，说明这个文件的引号数是奇数。
  // 那样会有一大段正文被当成引文吞掉，检查会假绿——所以把它报出来，不悄悄放过。
  if (state.quote) {
    hits.push({
      kind: "引号没配平（探针可能吞掉了一段正文）",
      where: `${label}`,
      detail:
        "文件末尾仍处于引号内：本文件的引号数量是奇数，请补齐或把被引用的原文改用行内代码",
    });
  }

  if (readerLines.length) {
    hits.push({
      kind: "正文用「读者」当主语",
      where: `${label}（${readerLines.length} 处：第 ${readerLines.slice(0, 8).join("、")} 行）`,
      detail: "改成「你」、「我们」，或者让被讲的东西当主语",
    });
  }
  const chapter = label.split("/")[1];
  if (!chapter) continue;
  if (!perChapter.has(chapter)) perChapter.set(chapter, []);
  if (label.endsWith("index.md")) perChapter.set(chapter, selfCount);

  const hereCount = lines
    .map((raw, i) => ({ raw, i }))
    .filter(({ raw }) => raw.includes("这里")).length;
  if (hereCount > 5) {
    hits.push({
      kind: "「这里」偏多（弱信号，只报数）",
      where: `${label}（${hereCount} 处）`,
      detail: "逐条看是不是在躲主语",
    });
  }
}

for (const [chapter, selfCount] of perChapter) {
  if (selfCount.length > 3) {
    hits.push({
      kind: "自称词超过 3 次",
      where: `第 ${chapter.replace(/^0+/, "")} 章 index.md（${selfCount.length} 处：第 ${selfCount
        .slice(0, 8)
        .map((entry) => entry.number)
        .join("、")} 行）`,
      detail: "留下范围声明那一句，其余换成被讲的东西当主语",
    });
  }
}

const byKind = new Map();
for (const hit of hits) {
  if (!byKind.has(hit.kind)) byKind.set(hit.kind, []);
  byKind.get(hit.kind).push(hit);
}

console.log(
  `语域检查：仓库 Markdown（STYLE.md 与许可证摘要除外）共 ${hits.length} 条命中，分 ${byKind.size} 类。` +
    (strict ? "（--strict：命中即失败）" : "（报告模式：不判失败）"),
);
for (const [kind, list] of byKind) {
  console.log(`\n## ${kind} —— ${list.length} 条`);
  for (const hit of list) console.log(`  ${hit.where}\n      ${hit.detail}`);
}

if (strict && hits.length) process.exit(1);
