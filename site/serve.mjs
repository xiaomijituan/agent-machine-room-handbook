// 本地起章节试玩页面用的静态服务器：node site/serve.mjs [端口]
// 只服务这个仓库里的文件，没有依赖，也不监听 0.0.0.0。
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.argv[2] || process.env.PORT || 5280);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  let path = decodeURIComponent(url.pathname);
  if (path.endsWith("/")) path += "index.html";
  const target = join(root, path);

  // Anything outside the repository is refused, however the path is spelled.
  if (target !== root && !target.startsWith(root + sep)) {
    response.writeHead(403).end("403 越界了：这个服务器只服务本仓库的文件\n");
    return;
  }

  let stats;
  try {
    stats = statSync(target);
  } catch {
    response
      .writeHead(404, { "content-type": "text/plain; charset=utf-8" })
      .end("404 找不到 " + path + "\n");
    return;
  }
  if (stats.isDirectory()) {
    response
      .writeHead(302, {
        location: path + (path.endsWith("/") ? "" : "/") + "index.html",
      })
      .end();
    return;
  }

  response.writeHead(200, {
    "content-type":
      TYPES[extname(target).toLowerCase()] || "application/octet-stream",
    "content-length": stats.size,
    "cache-control": "no-store",
  });
  createReadStream(target).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`章节试玩：http://127.0.0.1:${port}/site/`);
  console.log(
    `第 1 章：http://127.0.0.1:${port}/site/chapter.html?chapter=01-one-screen-many-ai`,
  );
  console.log("Ctrl+C 停。这个服务器只监听 127.0.0.1，不对外。");
});
