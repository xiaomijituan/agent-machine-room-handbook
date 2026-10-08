# vendor/ —— 第三方复制件

这个目录里放**从别的仓库复制进来的文件**。它们不是本手册写的东西，所以单独放一处，并在这里写清来历。

## 当前复制了什么

| 文件                    | 来自                                                                          | 版本     | 大小         | MD5                                | 下载日期   |
| ----------------------- | ----------------------------------------------------------------------------- | -------- | ------------ | ---------------------------------- | ---------- |
| `fusion-sim-0.1.2.html` | [xiaomijituan/fusion](https://github.com/xiaomijituan/fusion) 的 Release 页面 | `v0.1.2` | 404,823 字节 | `d13741a38eaa14ba2573ea555c0eb2d3` | 2026-10-09 |

下载地址（下载时得到的字节数与上表一致，MD5 也与本地文件一致）：
<https://github.com/xiaomijituan/fusion/releases/download/v0.1.2/fusion-sim-0.1.2.html>

这个文件是聚变模拟器的**自包含 HTML**：所有 JavaScript 和样式都写在文件内部，双击就能运行，不需要网络，也不需要安装任何东西。

**这份 HTML 里没有说明出身的注释**——文件第 1 到 3 行就是 `<!doctype html>`、`<html lang="zh">`、`<head>`。fusion 只在两个命令行产物（`scenario-check.mjs`、`review-cli.mjs`）的头两行写明出身（`// fusion v<ver> … built <时间> from <提交>`），模拟器这份没有。本文件以前写过"第 1 到 3 行写着出身"，那句是错的，锅在这份文档，不在 fusion（fusion 的 ADR-0008 在 `0.1.2` 里也把这条改正了）。

能核对这份文件的有三个办法，前两个不用联网：

1. 下载地址里的 tag 名和文件名里的版本号要一致（`…/releases/download/v0.1.2/fusion-sim-0.1.2.html`）。
2. 文件内部的版本号只出现一次，是打包进 JavaScript 的那个常量：
   `grep -o '0\.1\.2' vendor/fusion-sim-0.1.2.html | wc -l` 得到 1，命中在 `` var Lo=`0.1.2` `` 这一处
   （压缩后的变量名每版都会变，所以这一条只看命中次数和上下文，不看变量名）。
   这一局导出的事件流头部里的 `appVersion` 字段也是同一个值。
3. 字节数和 MD5 要和上表一致；这一条防的是"下载中途被改动或截断"，前两条防的是"拿错版本"。

## 为什么复制一份，而不是链接过去的站点

fusion 的 ADR-0001 规定项目三只能依赖发布产物，ADR-0008 进一步规定嵌入用的必须是**我们自己仓库里的副本**。理由很直接：如果每一章都去嵌 fusion 部署在互联网上的那个地址，那个站点哪天挂掉或者改了接口，整本书里能动手操作的部分会同时失效，而我们没有办法单独回滚其中一章。

## 怎么换成新版本

1. 到 fusion 的 Release 页面选一个更新的版本，记下它的版本号。
2. 用 `curl -L -o vendor/fusion-sim-<新版本>.html https://github.com/xiaomijituan/fusion/releases/download/<新版本>/fusion-sim-<新版本>.html` 下载。
3. 核对上面"能核对这份文件的有三个办法"那三条：文件名与 tag 名一致、文件内版本号只出现一次、
   字节数与 MD5 对得上。**不要按"看文件头几行"来核对**，那份 HTML 里没有版本注释。
4. 把 `site/chapter.html` 里 `iframe` 的 `src` 改成新文件名。
5. 把 `.github/workflows/ci.yml` 里那个写死的 `FUSION_TAG` 改成新的 tag 名。CI 用它下载
   `scenario-check.mjs` 与 `review-cli.mjs` 逐章校验，和这里的复制件应当是同一个版本。
6. 上面第 4、5 两步漏改任何一处都会被 `scripts/check.mjs` 的第七条挡下来：它核对复制件文件名、
   页面引用、`FUSION_TAG` 三处是同一个版本，还会核对这张表里写了这份文件的名称和下载来源。
   这条规则本身用"把 `FUSION_TAG` 改成和复制件不一样的版本号"验过会红（退出码 1）。
7. 删掉旧文件，更新上面这张表，把 `docs/` 里对应的版本说法一并改掉。

fusion 在 `0.1.0` 之后重发过两次。`0.1.1` 改的是四条：事件流头部的严格程度、两个命令行的退出码契约、注入回执新增的 `warnings` 字段、没有路径的报错不再挂前导冒号。`0.1.2` 改的是剧本校验器的两句报错文本：被拒绝的多余字段会在报错里写出自己的名字（以前是空括号）；一台主机或一个任务因为自己带了多余字段而被拒时，引用这台主机或这个任务的面板不再被追加一句自相矛盾的"找不到"。两处的判定和退出码都没变。理由都写在 fusion 的 ADR-0008 里。依赖哪个版本以 fusion 的 README 和 ADR-0008 为准。本仓库里写版本号的地方只有两处：上面这张表，和 `.github/workflows/ci.yml` 里那个 `FUSION_TAG`（CI 用它下载 `scenario-check.mjs` 与 `review-cli.mjs`）；升级时两处一起改，别在别的脚本里再抄一份。

## 这份复制件被谁用

`site/chapter.html` 把本页面的 iframe 指向它，再用 `postMessage` 把本章的 `chapters/<章节目录>/scenario.json` 交给模拟器。页面本身怎么用、怎么验证，写在 `site/README.md`。
