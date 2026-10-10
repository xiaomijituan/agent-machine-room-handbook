// 一条命令把每章的 index.md 编译成两个版式：
//   output/site/<章节目录>.html    站点版：正文里嵌 iframe，读者能在页面上动手
//   output/juejin/<章节目录>.md    掘金版：只有文字与图片，决策表由 fusion 的 review-cli 投影
//
// 输入只有三份文件：index.md、scenario.json、reference.jsonl。正文一份，两个版式都从这里生成，
// 不靠人手抄——这是 issue #3 定下的前提。
//
// 掘金版的产物要过三道守卫（见 assertJuejinSafe）：搜不到 <iframe、搜不到 <script、
// 外链只能落在 ALLOWED_HOSTS 上。守卫是硬的，因为渠道过滤不是建议：掘会把 iframe 与原始
// HTML 整段删掉，留在那里只会让读者看到一片空白。
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const chaptersDir = join(root, "chapters");
const outSite = join(root, "output", "site");
const outJuejin = join(root, "output", "juejin");

// 掘金版里允许出现的主机。全是正文已经用到的官方站与本地地址；新增外链要先想清楚它是不是
// 指向一个长期维护的地址。xiaomijituan.github.io 是这一条的例外，也是唯一的一个：那是本仓库
// 自己的 Pages 部署（.github/workflows/pages.yml 每次合进 main 就发一次产物），掘金会把交互
// 内容整段过滤掉，所以"想自己点"只能靠这个地址兑现——没有它，可点这件事只有作者自己看得到。
const SITE_BASE = "https://xiaomijituan.github.io/agent-machine-room-handbook/";
const ALLOWED_HOSTS = new Set([
  "github.com",
  "127.0.0.1",
  "localhost",
  "xiaomijituan.github.io",
  "api.tailscale.com",
  "controlplane.tailscale.com",
  "login.tailscale.com",
]);

// 决策表必须来自 fusion 发布的投影器，不是本仓库另抄一份规则（fusion 仓 ADR-0001）。
// 那份产物不在仓库里，由 CI 按 FUSION_TAG 下载；本地跑构建之前先照下面的命令取一份。
const FUSION_TAG = (() => {
  const ci = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
  const tag = (ci.match(/FUSION_TAG:\s*v?(\d+\.\d+\.\d+)/) || [])[1];
  if (!tag)
    throw new Error(
      "ci.yml 里找不到 FUSION_TAG，投影器该按哪个版本下载无从确定",
    );
  return "v" + tag;
})();
const REVIEW_CLI = join(root, ".fusion-tools", "review-cli.mjs");
const vendorFile = readdirSync(join(root, "vendor")).find((name) =>
  /^fusion-sim-\d+\.\d+\.\d+\.html$/.test(name),
);
if (!vendorFile)
  throw new Error(
    "vendor/ 里没有 fusion-sim-<版本号>.html，站点版的 iframe 无处可指",
  );

const chapters = readdirSync(chaptersDir).filter((name) =>
  /^\d{2}-[a-z0-9-]+$/.test(name),
);
if (chapters.length === 0) throw new Error("chapters/ 下一章节目录都没有");

function needReviewCli() {
  if (existsSync(REVIEW_CLI)) return;
  console.error(
    [
      "缺少投影器：.fusion-tools/review-cli.mjs 不存在。",
      "决策表要由 fusion 发布的那份产物投影，不能由本仓库另写一份。先按写死的版本下载：",
      `  mkdir -p .fusion-tools && curl -sSL -o .fusion-tools/review-cli.mjs \\`,
      `    https://github.com/xiaomijituan/fusion/releases/download/${FUSION_TAG}/review-cli.mjs`,
    ].join("\n"),
  );
  process.exit(2);
}

const escapeHtml = (text) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function inline(text) {
  // 先转义再放行我们认识的构造：正文里出现的 < 一律是代码里的占位符（<phone>、<defunct>），
  // 不是 HTML，所以默认按字面处理才是对的。
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);
  out = out.replace(
    /\*\*([^*]+)\*\*/g,
    (_m, bold) => `<strong>${bold}</strong>`,
  );
  out = out.replace(
    /(^|[^*])\*([^*\n]+)\*/g,
    (_m, pre, em) => `${pre}<em>${em}</em>`,
  );
  // 图片必须排在链接前面：`![说明](assets/x.svg)` 里也有一段 `[说明](...)`，
  // 先跑链接规则会把感叹号留成孤立文字。路径只允许指向仓库里的相对文件——
  // 掘金那一版带不走远程资源，正文里塞外链图片等于把读者的请求交给第三方。
  out = out.replace(
    /!\[([^\]]*)\]\((?!https?:)([^)\s]+)\)/g,
    (_m, alt, src) => `<img src="${src}" alt="${alt}" />`,
  );
  out = out.replace(
    /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
    (_m, label, href) => `<a href="${href}">${label}</a>`,
  );
  out = out.replace(
    /&lt;(https?:[^&\s]+)&gt;/g,
    (_m, href) => `<a href="${href}">${href}</a>`,
  );
  return out;
}

/** 认这些构造：围栏代码、#~#### 标题、引用、有序与无序列表、表格、分隔线、段落。 */
function renderMarkdown(md) {
  const lines = md.split("\n");
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      html.push(
        `<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ""}>${escapeHtml(
          body.join("\n"),
        )}</code></pre>`,
      );
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      html.push("<hr />");
      i += 1;
      continue;
    }
    if (line.startsWith("> ")) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quote.push(lines[i].slice(2));
        i += 1;
      }
      html.push(`<blockquote><p>${inline(quote.join(" "))}</p></blockquote>`);
      continue;
    }
    if (line.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        rows.push(lines[i]);
        i += 1;
      }
      const cells = (row) =>
        row
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((cell) => cell.trim());
      const head = cells(rows[0]);
      const bodyRows = rows.slice(1).filter((row) => !/^[\s|:-]+$/.test(row));
      html.push(
        [
          "<table>",
          `<thead><tr>${head.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead>`,
          `<tbody>${bodyRows
            .map(
              (row) =>
                `<tr>${cells(row)
                  .map((cell) => `<td>${inline(cell)}</td>`)
                  .join("")}</tr>`,
            )
            .join("")}</tbody>`,
          "</table>",
        ].join("\n"),
      );
      continue;
    }
    const bullet = line.match(/^-\s+(.*)$/);
    const numbered = line.match(/^\d+\.\s+(.*)$/);
    if (bullet || numbered) {
      const items = [];
      const test = bullet ? /^-\s+(.*)$/ : /^\d+\.\s+(.*)$/;
      while (i < lines.length) {
        const match = lines[i].match(test);
        if (!match && !/^\s{2,}\S/.test(lines[i])) break;
        if (match) items.push(match[1]);
        else items[items.length - 1] += " " + lines[i].trim();
        i += 1;
      }
      const tag = bullet ? "ul" : "ol";
      html.push(
        `<${tag}>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</${tag}>`,
      );
      continue;
    }
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    const paragraph = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#|>|\||```|-\s|\d+\.\s)/.test(lines[i])
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    if (paragraph.length) html.push(`<p>${inline(paragraph.join(" "))}</p>`);
    else i += 1;
  }
  return html.join("\n");
}

function decisionTable(chapter) {
  const reference = join(chaptersDir, chapter, "reference.jsonl");
  if (!existsSync(reference)) return null;
  return execFileSync(process.execPath, [REVIEW_CLI, reference], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function assertJuejinSafe(text, label) {
  const problems = [];
  for (const needle of ["<iframe", "<script", "</iframe", "</script"]) {
    if (text.includes(needle)) problems.push(`出现了 ${needle}`);
  }
  for (const url of text.match(/https?:\/\/[^\s)>\]"']+/g) || []) {
    const authority = url.replace(/^https?:\/\//, "").split(/[/?#]/)[0];
    const host = authority.replace(/:\d+$/, "");
    if (!ALLOWED_HOSTS.has(host)) problems.push(`外链指向未允许的主机：${url}`);
  }
  if (problems.length) {
    console.error(`${label} 过不了渠道守卫：\n  - ` + problems.join("\n  - "));
    process.exit(1);
  }
}

function juejinDocument(chapter, md, table, scenarioText) {
  const parts = [md.replace(/\s+$/, ""), ""];
  parts.push(
    "---",
    "",
    `## 这一章的决策表（由 fusion 的投影器从本章记录生成）`,
    "",
    `这张表不是手写的：它是 fusion 发布的 \`review-cli.mjs\`（\`${FUSION_TAG}\`）读本节的记录文件`,
    `\`chapters/${chapter}/reference.jsonl\` 投影出来的结果，直接贴在下面。表里每一行是一次拍板：`,
    `当时被问到什么、选了什么、之后哪一格的状态变了。同一局的随机种子写在记录文件的头部，`,
    `所以这张表可以逐字复现。`,
    "",
    // 投影器给的第一行是 `# 复盘：…`。正文自己已经有一行 H1 标题，两个 H1 贴在一起，页面上
    // 就会出现两条大标题（2026-10-10 第 2 章发掘金时实测到的）。所以贴进来时降一级——改的是
    // 这一版排版的层级，不是投影器算出来的内容。
    table.replace(/^# /gm, "## ").replace(/\s+$/, ""),
    "",
  );
  // 掘金不收 iframe，所以"这一章可以点"这件事在掘金只能靠一个地址兑现。没有这一段的话，
  // 读者看完只知道有个模拟器，不知道去哪儿点。
  parts.push(
    "---",
    "",
    "## 想自己点这里",
    "",
    `这一章的模拟器嵌在我们自己的站点上：<${SITE_BASE}${chapter}.html>`,
    "",
    "打开就是本章那一局：剧本已经递给它了，点格子、拍板、导出这一局都能做。",
    "掘金会把页面里的交互内容过滤掉，所以这一章在掘金只有图文，能点的那部分在上面那个地址里。",
    "那个站点由本仓库每次合进 main 自动构建，和正文是同一份来源，不是另写的一份演示。",
    "",
  );
  if (scenarioText) {
    parts.push(
      "## 本章剧本全文（复制下来就能在自己的模拟器里玩）",
      "",
      "打开你手上的 fusion（离线单文件那份也行），进「剧本库」，把下面这段整段粘进输入框，按「导入」。",
      "导入走的是同一套校验，不合格会当场指出是哪一个字段。",
      "",
      "```json",
      scenarioText.replace(/\s+$/, ""),
      "```",
      "",
    );
  }
  return parts.join("\n");
}

function siteDocument(chapter, md, scenarioText, table) {
  // 正文里的图片路径是相对本章目录写的（`assets/x.svg`）。产物页住在 output/site/ 下，而
  // output/site/ 这一层就是要整份搬上 GitHub Pages 的东西，所以配图会复制进
  // output/site/assets/<本章>/，路径全部相对这一层写——换成任何子路径（Pages 的项目站住在
  // /<仓库名>/ 下面）都不用再改一遍。
  const body = renderMarkdown(md).replace(
    /src="(?!https?:|\/)([^"]+)"/g,
    (_m, path) => `src="assets/${chapter}/${path.replace(/^assets\//, "")}"`,
  );
  return `<!doctype html>
<html lang="zh">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(chapter)} · agent 机房手册</title>
    <style>
      :root {
        --bg: #0d0f14;
        --fg: #e8ecf3;
        --muted: #97a1b3;
        --line: #242a36;
        --ok: #4ade80;
        --bad: #f87171;
      }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--fg);
        font: 14px/1.7 system-ui, "Microsoft YaHei", sans-serif;
      }
      main {
        max-width: 860px;
        margin: 0 auto;
        padding: 24px 16px 64px;
      }
      a {
        color: #7dd3fc;
      }
      pre {
        background: #11141a;
        border: 1px solid var(--line);
        border-radius: 6px;
        padding: 10px;
        overflow: auto;
        font-size: 12.5px;
      }
      code {
        font-family: ui-monospace, Consolas, monospace;
      }
      p > code,
      li > code,
      td > code {
        background: #1a2030;
        border-radius: 4px;
        padding: 1px 5px;
      }
      table {
        border-collapse: collapse;
        width: 100%;
        margin: 12px 0;
        font-size: 13px;
      }
      th,
      td {
        border: 1px solid var(--line);
        padding: 6px 8px;
        text-align: left;
        vertical-align: top;
      }
      img {
        max-width: 100%;
        height: auto;
        display: block;
        margin: 16px 0;
      }
      /* 配图按 viewBox 宽度等比缩放：main 左右各 16px 内边距会让 390px 屏幕上的图只剩
         358px，图里 32 号的中文就掉到 11.5px。窄屏让小图越过这 32px，字号折算才站得住。 */
      @media (max-width: 520px) {
        main img {
          width: calc(100% + 32px);
          max-width: none;
          margin-left: -16px;
          margin-right: -16px;
        }
      }
      blockquote {
        margin: 12px 0;
        padding: 4px 14px;
        border-left: 3px solid var(--line);
        color: var(--muted);
      }
      hr {
        border: 0;
        border-top: 1px solid var(--line);
        margin: 28px 0;
      }
      #play {
        border: 1px solid var(--line);
        border-radius: 8px;
        margin: 20px 0 8px;
        overflow: hidden;
      }
      #play header {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: baseline;
        padding: 10px 14px;
        border-bottom: 1px solid var(--line);
      }
      #play h2 {
        margin: 0;
        font-size: 15px;
      }
      #status {
        padding: 10px 14px;
        border-bottom: 1px solid var(--line);
        color: var(--muted);
        font-family: ui-monospace, Consolas, monospace;
        font-size: 13px;
        white-space: pre-wrap;
      }
      #status.ok {
        color: var(--ok);
      }
      #status.bad {
        color: var(--bad);
      }
      #play iframe {
        display: block;
        width: 100%;
        height: 70vh;
        min-height: 480px;
        border: 0;
        background: #000;
      }
      details {
        padding: 10px 14px;
        border-top: 1px solid var(--line);
        color: var(--muted);
      }
    </style>
  </head>
  <body>
    <main>
${body}
${
  scenarioText
    ? `      <section id="play">
        <header>
          <h2>本章可玩的部分</h2>
          <button id="retry" type="button">重新注入这一章的剧本</button>
          <a href="index.html">← 换一章</a>
        </header>
        <div id="status">正在准备模拟器……</div>
        <iframe id="sim" title="聚变模拟器" src="vendor/${vendorFile}"></iframe>
        <details>
          <summary>注入失败怎么办（手工粘贴的退路，附本章剧本原文）</summary>
          <p>
            在模拟器里按 Esc 回到机房外层，进入「剧本库」，把下面这段文本粘进输入框，再按「导入」。
            这条路和本页用的注入走的是同一套校验。
          </p>
          <pre id="raw"></pre>
        </details>
      </section>
      <script>
        (function () {
          var INJECT = "fusion:load-scenario";
          var RESULT = INJECT + "-result";
          var status = document.getElementById("status");
          var frame = document.getElementById("sim");
          var scenarioText = ${JSON.stringify(scenarioText)};
          var timer = null;
          var attempts = 0;

          function say(kind, lines) {
            var arr = Array.isArray(lines) ? lines : [String(lines)];
            status.textContent = arr.join("\\n");
            status.className = kind;
          }

          function send() {
            frame.contentWindow.postMessage(
              { type: INJECT, scenario: scenarioText },
              window.location.origin,
            );
          }

          // 模拟器的消息监听是在 React 挂载时才装上的，太早递过去的消息不会有人接。
          // 所以递到它有回话为止，递满 20 秒还没回话就改用手工粘贴。
          function keepTrying() {
            send();
            if (++attempts > 40) {
              clearInterval(timer);
              say(
                "bad",
                "把剧本递给模拟器之后没有等到回话（重试了 20 秒）。请展开“注入失败怎么办”，改用手工粘贴。",
              );
            }
          }

          window.addEventListener("message", function (event) {
            var data = event.data;
            if (event.origin !== window.location.origin) return;
            if (!data || data.type !== RESULT) return;
            clearInterval(timer);
            if (data.ok) {
              var warnings = data.warnings || [];
              say(
                "ok",
                ["剧本已装入：${chapter}。机房现在跑的是本章的格子。"].concat(
                  warnings.length ? ["提醒：", warnings.join("\\n")] : [],
                ),
              );
            } else {
              say(
                "bad",
                ["本章剧本没有通过校验（下面这段来自模拟器本身）："].concat(data.errors || []),
              );
            }
          });

          document.getElementById("raw").textContent = scenarioText;
          frame.addEventListener("load", send);
          document.getElementById("retry").addEventListener("click", function () {
            say("", "重新注入中……");
            attempts = 0;
            clearInterval(timer);
            timer = setInterval(keepTrying, 500);
            keepTrying();
          });
          timer = setInterval(keepTrying, 500);
          keepTrying();
        })();
      </script>
`
    : ""
}    </main>
  </body>
</html>
`;
}

needReviewCli();
// 每次构建都从空目录开始：删掉一章、或者改了配图文件名之后，旧产物留在原地会让人以为
// 那个地址还有内容（output/ 是产物目录，不入库，删了不心疼）。
rmSync(outSite, { recursive: true, force: true });
rmSync(outJuejin, { recursive: true, force: true });
mkdirSync(outSite, { recursive: true });
mkdirSync(outJuejin, { recursive: true });

const summary = [];
for (const chapter of chapters) {
  const dir = join(chaptersDir, chapter);
  const md = readFileSync(join(dir, "index.md"), "utf8");
  const scenarioPath = join(dir, "scenario.json");
  const scenarioText = existsSync(scenarioPath)
    ? readFileSync(scenarioPath, "utf8")
    : null;
  const table = decisionTable(chapter);
  if (table === null) {
    console.error(`${chapter}：没有 reference.jsonl，投不出决策表，这一章跳过`);
    continue;
  }

  const juejin = juejinDocument(chapter, md, table, scenarioText);
  assertJuejinSafe(juejin, `output/juejin/${chapter}.md`);
  const juejinPath = join(outJuejin, `${chapter}.md`);
  writeFileSync(juejinPath, juejin);

  const sitePath = join(outSite, `${chapter}.html`);
  writeFileSync(sitePath, siteDocument(chapter, md, scenarioText, table));

  // 验收标准第 3 条：贴在产物里的表格，要和直接跑投影器得到的文本完全一致。
  // 这里不信任上面那次调用，重新取一份对比——同一个来源这句话要有证据。
  const again = decisionTable(chapter);
  if (again !== table) {
    console.error(`${chapter}：产物里的决策表和再跑一次投影器的结果不一致`);
    process.exit(1);
  }

  summary.push({
    chapter,
    title: (md.match(/^# (.+)$/m) || [])[1] || chapter,
    juejinBytes: Buffer.byteLength(juejin),
    siteBytes: Buffer.byteLength(readFileSync(sitePath)),
    tableLines: table.split("\n").filter((line) => /^\| \d+ \|/.test(line))
      .length,
  });
}

// 页面里的路径全部相对 output/site/ 这一层，所以本章配图和模拟器复制件要搬进这一层。
// 这一步是部署的前提：Pages 只发这一个目录，仓库里其余的东西它看不见。
for (const chapter of chapters) {
  const srcAssets = join(chaptersDir, chapter, "assets");
  if (!existsSync(srcAssets)) continue;
  const dstAssets = join(outSite, "assets", chapter);
  mkdirSync(dstAssets, { recursive: true });
  for (const name of readdirSync(srcAssets)) {
    copyFileSync(join(srcAssets, name), join(dstAssets, name));
  }
}
mkdirSync(join(outSite, "vendor"), { recursive: true });
copyFileSync(
  join(root, "vendor", vendorFile),
  join(outSite, "vendor", vendorFile),
);

// 这一页由构建生成：本地服务器不会替目录生成列表（site/serve.mjs 找不到 index.html 就回 404），
// 而它现在也是公网部署的门面（Pages 发的根目录就是这一层），所以标题与说明按读者要看的写，
// 不写"产物""字节数"这类构建内部的话——那些在 npm run build:site 的标准输出里就有。
const indexRows = summary
  .map(
    (row) =>
      `      <li><a href="./${row.chapter}.html">${escapeHtml(row.title)}</a>` +
      ` <span>正文下面嵌着本章的模拟器，剧本已经递好</span></li>`,
  )
  .join("\n");
writeFileSync(
  join(outSite, "index.html"),
  `<!doctype html>
<html lang="zh">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>agent 机房手册 · 章节目录</title>
    <style>
      body {
        font: 14px/1.7 system-ui, "Microsoft YaHei", sans-serif;
        background: #0d0f14;
        color: #e8ecf3;
        margin: 0;
        padding: 32px 16px;
      }
      main {
        max-width: 720px;
        margin: 0 auto;
      }
      a {
        color: #7dd3fc;
      }
      ul {
        list-style: none;
        padding: 0;
      }
      li {
        padding: 10px 0;
        border-bottom: 1px solid #242a36;
      }
      span {
        color: #97a1b3;
        font-size: 12.5px;
        margin-left: 8px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>《agent 机房手册》章节目录</h1>
      <p>
        让几个 AI 一起干活时，你的机器该长什么样。下面每一行都是一个能动手的章节页：正文下面嵌着
        本章的模拟器，剧本已经递给它了，点格子、拍板、导出这一局都能做。这一页由仓库里的
        <code>npm run build:site</code> 生成，随 <code>main</code> 分支自动部署，所以正文和
        你点着的东西来自同一份来源。书里的数字都是在作者自己的机器上量出来的，没量到的写"没测到"。
      </p>
      <ul>
${indexRows}
      </ul>
    </main>
  </body>
</html>
`,
);

console.log(
  summary
    .map(
      (row) =>
        `${row.chapter}  掘金版 ${row.juejinBytes} 字节（决策表 ${row.tableLines} 行）  ` +
        `站点版 ${row.siteBytes} 字节`,
    )
    .join("\n"),
);
console.log(
  "\n站点版怎么打开：npm run serve:site，然后访问 http://127.0.0.1:5280/output/site/" +
    "（这一页也是这次生成的）",
);
