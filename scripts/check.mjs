// 本仓库的自检。不依赖任何外部包，只用 node 自带模块。
//
// 它查六件事：章节文件齐不齐、剧本字段合不合法、记录文件能不能解析、
// 相对链接有没有断、验证记录缺不缺字段、有没有把真实身份信息写进正文。
//
// 注意：剧本格式的权威校验在 fusion 的发版产物 scenario-check.mjs 里。
// 那份产物要等 fusion 打出 v0.1.0 才存在。在那之前本脚本只做结构自检，
// 不等于规范校验 —— 别把它当门禁的全部。
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

const root = resolve(import.meta.dirname, "..");
const problems = [];
const fail = (where, msg) => problems.push(where + " — " + msg);
const rel = (path) =>
  path
    .slice(root.length)
    .replace(/^[\\/]/, "")
    .replace(/\\/g, "/");

const chaptersDir = join(root, "chapters");
const chapters = readdirSync(chaptersDir).filter((name) =>
  statSync(join(chaptersDir, name)).isDirectory(),
);
if (chapters.length === 0) fail("chapters/", "一个章节目录都没有");

const REQUIRED_FILES = [
  "index.md",
  "scenario.json",
  "reference.jsonl",
  "verify.md",
  "china.md",
];
const VERIFY_MARKS = ["机器", "版本", "没测", "等级", "涂改"];
// 文档保留地址段（RFC 5737）、掩码写法，以及回环地址——都不指向任何人
const ALLOWED_IP = [
  /^203\.0\.113\./,
  /^192\.0\.2\./,
  /^127\./,
  /^100\.x\.y\.z$/,
  /^100\.104\./,
];

const KNOWN_KINDS = ["answer", "dispatch", "kill"];
const KNOWN_TYPES = ["transition", "decision", "run.end"];
const KNOWN_STATUS = ["working", "blocked", "done", "idle"];

const collect = (dir, extension) => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(full, extension));
    else if (entry.name.endsWith(extension)) out.push(full);
  }
  return out;
};

const mdFiles = collect(root, ".md");
const textFiles = mdFiles.concat(collect(root, ".jsonl"));

// 一、真实身份信息不许进正文：扫出非保留段的 IPv4 就报错
const ipv4 = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/g;
for (const file of mdFiles) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(ipv4)) {
    const ip = match[1];
    if (!ALLOWED_IP.some((re) => re.test(ip))) {
      fail(
        rel(file),
        "出现了不是占位符的 IPv4：" +
          ip +
          "（入库前换成 203.0.113.x 或 192.0.2.x）",
      );
    }
  }
}

// 同类检查：设备名必须已掩码。pong from 后面只准出现占位符——
// 这样门禁不需要知道真实名字是什么，真实名字也就不会被写进这个脚本里。
const pongName = /pong from (\S+) \(/g;
for (const file of textFiles) {
  for (const match of readFileSync(file, "utf8").matchAll(pongName)) {
    if (!/^<.*>$/.test(match[1])) {
      fail(
        rel(file),
        "pong from 后面是真实设备名，入库前换成 <phone> 或 <peer>",
      );
    }
  }
}

// 二、相对链接不能断
for (const file of mdFiles) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/\]\((?!https?:)([^)#]+)(#[^)]*)?\)/g)) {
    const target = match[1].trim();
    if (!target || target.startsWith("<") || target.includes("{")) continue;
    const resolved = resolve(dirname(file), target);
    if (!existsSync(resolved)) fail(rel(file), "相对链接断了：" + target);
  }
}

for (const chapter of chapters) {
  const dir = join(chaptersDir, chapter);
  const label = "chapters/" + chapter;

  // 三、五件套齐不齐
  for (const name of REQUIRED_FILES) {
    if (!existsSync(join(dir, name))) fail(label, "缺文件 " + name);
  }

  // 三b、署名必须长在正文里。
  // MIT/CC 的署名要求在"整章被复制到别的平台"时不会自动跟过去——
  // 别人不会顺手带上 LICENSE 文件。所以署名写在开头，并由门禁保证它没被删。
  if (existsSync(join(dir, "index.md"))) {
    const head = readFileSync(join(dir, "index.md"), "utf8")
      .split(/\r?\n/)
      .slice(0, 6)
      .join("\n");
    if (!head.includes("CC BY 4.0") || !head.includes("xiaomijituan")) {
      fail(
        label + "/index.md",
        "开头 6 行内缺署名行（要含 CC BY 4.0 与作者名）",
      );
    }
  }

  // 四、剧本结构
  let scenario = null;
  if (existsSync(join(dir, "scenario.json"))) {
    try {
      scenario = JSON.parse(readFileSync(join(dir, "scenario.json"), "utf8"));
    } catch (error) {
      fail(label, "scenario.json 不是合法 JSON：" + error.message);
    }
    if (scenario) {
      const allowedTop = [
        "schemaVersion",
        "id",
        "version",
        "name",
        "hosts",
        "tasks",
        "panes",
      ];
      for (const key of Object.keys(scenario)) {
        if (!allowedTop.includes(key))
          fail(label + "/scenario.json", "规范里没有的顶层字段：" + key);
      }
      if (!Number.isInteger(scenario.schemaVersion))
        fail(label + "/scenario.json", "schemaVersion 必须是整数");
      for (const key of ["id", "version", "name"]) {
        if (typeof scenario[key] !== "string" || !scenario[key].trim())
          fail(label + "/scenario.json", key + " 必须是非空字符串");
      }
      const hostIds = new Set((scenario.hosts || []).map((h) => h.id));
      if (hostIds.size !== (scenario.hosts || []).length)
        fail(label + "/scenario.json", "hosts 里有重复 id");
      if (!scenario.hosts || scenario.hosts.length < 1)
        fail(label + "/scenario.json", "hosts 至少要一个");
      const taskKeys = new Set((scenario.tasks || []).map((t) => t.key));
      if (taskKeys.size !== (scenario.tasks || []).length)
        fail(label + "/scenario.json", "tasks 里有重复 key");
      for (const task of scenario.tasks || []) {
        const lines = task.lines && task.lines.zh;
        if (!Array.isArray(lines) || lines.length < 2) {
          fail(
            label + "/scenario.json",
            "任务 " + task.key + " 的 lines.zh 至少要有两行",
          );
        }
        // 规范允许文本写成字符串，也允许写成 { zh, en }；en 可缺省
        const qText = task.question && task.question.text;
        const filled = (value) =>
          typeof value === "string" && value.trim().length > 0;
        if (!qText || (!filled(qText) && !filled(qText.zh))) {
          fail(
            label + "/scenario.json",
            "任务 " + task.key + " 缺 question.text（字符串或 { zh } 都行）",
          );
        }
        const options = task.question && task.question.options;
        if (
          !Array.isArray(options) ||
          options.length < 1 ||
          options.length > 6
        ) {
          fail(
            label + "/scenario.json",
            "任务 " + task.key + " 的选项数必须是 1 到 6",
          );
        } else if (new Set(options.map((o) => o.id)).size !== options.length) {
          fail(
            label + "/scenario.json",
            "任务 " + task.key + " 的选项 id 有重复",
          );
        }
      }
      for (const pane of scenario.panes || []) {
        if (!hostIds.has(pane.host))
          fail(
            label + "/scenario.json",
            "pane 引用了不存在的主机：" + pane.host,
          );
        if (!taskKeys.has(pane.task))
          fail(
            label + "/scenario.json",
            "pane 引用了不存在的任务：" + pane.task,
          );
        if (pane.status && !KNOWN_STATUS.includes(pane.status)) {
          fail(label + "/scenario.json", "pane 状态不合法：" + pane.status);
        }
        if (
          typeof pane.progress === "number" &&
          (pane.progress < 0 || pane.progress > 100)
        ) {
          fail(
            label + "/scenario.json",
            "pane progress 必须在 0 到 100：" + pane.progress,
          );
        }
      }
    }
  }

  // 五、记录文件
  if (existsSync(join(dir, "reference.jsonl"))) {
    const raw = readFileSync(join(dir, "reference.jsonl"), "utf8").trim();
    const lines = raw ? raw.split(/\r?\n/) : [];
    if (lines.length < 2) {
      fail(label, "reference.jsonl 至少要有 header 加一行事件");
    } else {
      let header;
      let previousSeq = 0;
      try {
        header = JSON.parse(lines[0]);
      } catch (error) {
        fail(
          label + "/reference.jsonl",
          "header 行不是合法 JSON：" + error.message,
        );
      }
      if (header) {
        if (!Number.isInteger(header.schemaVersion))
          fail(label + "/reference.jsonl", "header 缺整数 schemaVersion");
        if (typeof header.seed !== "number")
          fail(label + "/reference.jsonl", "header 缺随机种子 seed");
        if (!header.snapshot || !Array.isArray(header.snapshot.panes)) {
          fail(
            label + "/reference.jsonl",
            "header 缺 snapshot（外来文件要能自己讲清楚自己）",
          );
        }
        if (
          scenario &&
          header.snapshot &&
          header.scenario &&
          header.scenario.name !== scenario.name
        ) {
          fail(
            label + "/reference.jsonl",
            "记录里的剧本名和 scenario.json 不一致",
          );
        }
        if (scenario && header.snapshot) {
          const fromScenario = scenario.panes
            .map((_, index) => "a" + (index + 1))
            .join(",");
          const fromRun = header.snapshot.panes.map((p) => p.id).join(",");
          if (fromScenario !== fromRun)
            fail(label + "/reference.jsonl", "snapshot 的面板编号与剧本不一致");
        }
      }
      for (const line of lines.slice(1)) {
        let event;
        try {
          event = JSON.parse(line);
        } catch (error) {
          fail(
            label + "/reference.jsonl",
            "有一行不是合法 JSON：" + error.message,
          );
          break;
        }
        if (!KNOWN_TYPES.includes(event.type))
          fail(label + "/reference.jsonl", "事件类型不合法：" + event.type);
        if (typeof event.seq !== "number" || event.seq <= previousSeq) {
          fail(
            label + "/reference.jsonl",
            "seq 必须是递增整数，出问题的行 seq=" + event.seq,
          );
          break;
        }
        previousSeq = event.seq;
        if (
          event.type === "decision" &&
          !KNOWN_KINDS.includes(event.payload && event.payload.kind)
        ) {
          fail(
            label + "/reference.jsonl",
            "决策种类不合法：" + (event.payload && event.payload.kind),
          );
        }
        if (event.type === "transition") {
          const p = event.payload || {};
          if (!KNOWN_STATUS.includes(p.from) || !KNOWN_STATUS.includes(p.to)) {
            fail(
              label + "/reference.jsonl",
              "状态跃迁的两端必须都在已知状态里：" + p.from + " -> " + p.to,
            );
          }
        }
      }
    }
  }

  // 六、验证记录的必填项
  if (existsSync(join(dir, "verify.md"))) {
    const text = readFileSync(join(dir, "verify.md"), "utf8");
    for (const mark of VERIFY_MARKS) {
      if (!text.includes(mark))
        fail(label + "/verify.md", "缺必填内容，没提到「" + mark + "」");
    }
  }
}

// 七、vendor/ 与 site/：复制进来的模拟器和用它拼起来的试玩页必须对得上
const vendorDir = join(root, "vendor");
const vendorFiles = existsSync(vendorDir)
  ? readdirSync(vendorDir).filter((name) =>
      /^fusion-sim-\d+\.\d+\.\d+\.html$/.test(name),
    )
  : [];
if (vendorFiles.length === 0) {
  fail(
    "vendor/",
    "没有形如 fusion-sim-<版本号>.html 的复制件（见 vendor/README.md 的下载与升级说明）",
  );
}
if (vendorFiles.length > 1) {
  fail(
    "vendor/",
    "同时存在两份模拟器复制件：" +
      vendorFiles.join("、") +
      "，升级时应删掉旧的",
  );
}
if (vendorFiles.length === 1) {
  const pinned = vendorFiles[0];
  const version = pinned.match(/\d+\.\d+\.\d+/)[0];
  const sim = readFileSync(join(vendorDir, pinned), "utf8");
  if (!sim.includes("fusion:load-scenario")) {
    fail(
      "vendor/" + pinned,
      "这份复制件里没有注入端点的消息类型，说明它来自还不含该端点的旧版本",
    );
  }
  for (const external of ['src="http', "src='http", "url(http", 'url("http']) {
    if (sim.includes(external))
      fail("vendor/" + pinned, "自包含文件里出现了外部资源引用：" + external);
  }
  const vendorReadme = join(vendorDir, "README.md");
  if (!existsSync(vendorReadme)) {
    fail(
      "vendor/README.md",
      "缺这份说明：来历、版本、大小、校验和、升级步骤都要写在这里",
    );
  } else {
    const text = readFileSync(vendorReadme, "utf8");
    if (!text.includes(pinned))
      fail("vendor/README.md", "没提到当前这份文件的名称 " + pinned);
    // 下载地址里的 tag 可以带 v 前缀，也可以不带；两种写法都算对。
    if (
      !new RegExp("releases/download/v?" + version.replace(/\./g, "\\.")).test(
        text,
      )
    )
      fail(
        "vendor/README.md",
        "下载来源里没写版本号 " + version + "，无法核对这份文件是从哪来的",
      );
  }
  const chapterPage = join(root, "site", "chapter.html");
  if (!existsSync(chapterPage)) {
    fail(
      "site/chapter.html",
      "缺这个页面，vendor 里的模拟器就没有地方被嵌起来",
    );
  } else {
    const page = readFileSync(chapterPage, "utf8");
    for (const other of page.match(/fusion-sim-\d+\.\d+\.\d+\.html/g) || []) {
      if (other !== pinned)
        fail(
          "site/chapter.html",
          "页面引用的是 " +
            other +
            "，而 vendor 里那份是 " +
            pinned +
            "，升级时漏改了一处",
        );
    }
    if (!page.includes(pinned))
      fail(
        "site/chapter.html",
        "页面里没有引用 " + pinned + "，iframe 指向了别处",
      );
  }
}

if (problems.length) {
  console.error("检查未通过，共 " + problems.length + " 条：\n");
  for (const problem of problems) console.error("  FAIL " + problem);
  process.exit(1);
}

console.log(
  "检查通过：" +
    chapters.length +
    " 章，" +
    mdFiles.length +
    " 个 Markdown 文件，" +
    "剧本字段、记录文件、相对链接、验证记录、身份掩码都查过了。",
);
console.log(
  "提醒：剧本格式的权威校验是 fusion 的发版产物 scenario-check.mjs，本脚本只是结构自检。",
);
