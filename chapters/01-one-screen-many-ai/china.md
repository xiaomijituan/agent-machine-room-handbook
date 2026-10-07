# 国内网络差异 · 第 1 章

这一节只写两类东西：**我们自己撞过的**，和**标清楚"还没验"的**。不写"听说可以"。

## 一、Windows 上根本装不了 tmux（这条是实测）

**命令**：

```bash
command -v tmux          # 我们在这台 Windows 上跑，结果是空
wsl.exe -l -v            # 返回「未安装适用于 Linux 的 Windows 子系统」
```

**结论**：Windows 上装 tmux 有两条路，我们这台机器两条都不通。

- **走 Linux 子系统（WSL）**：要 `wsl.exe --install`，要开虚拟化，**要重启一次电脑**。装完你就有一个真的 Ubuntu，`apt install tmux` 直接能用。
- **用云端主机**：不用动自己的电脑，我们这一章的证据就是这么来的。

**坑（很重要）**：装了 Git Bash **不等于**有 tmux。Git Bash 只是给了你一个 bash 命令行，tmux 需要的是它背后那个"终端设备"，Git Bash 里没有。别在 Git Bash 里找 `tmux`，找不到不是装错了，是本来就没有。

**还有一条我们没验**：有人用 Cygwin 在 Windows 上跑 tmux。**这本书不推荐，因为没实测。** 你试出来了欢迎来告诉我们。

## 二、Ubuntu 上装 tmux（这条是实测，但是境外源）

**我们实测到的**：那台云端 Ubuntu 22.04 上 **tmux 是预装好的**，版本 3.2a。所以这章的证据里，`apt-get install -y tmux` 那句返回的是：

```
tmux is already the newest version (3.2a-4ubuntu0.2).
0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.
```

**没实测到、要你去验的**：在国内一台干净的 Ubuntu 上，默认的 `archive.ubuntu.com` 能不能连上、慢到什么程度。**换国内镜像（清华、阿里）通常能解决，但我们没有亲手验过这一条，所以不写成结论。**

要验的话，三条命令就够，把输出发回来我们补进这一节：

```bash
cat /etc/os-release                     # 先看你是 22.04 还是 24.04，配置文件格式不一样
curl -sI https://archive.ubuntu.com -o /dev/null -w '%{http_code} %{time_total}s\n'
apt-get install -y tmux && tmux -V
```

## 三、这台机器上 npm 和 GitHub 直连不通（这条是实测）

不是 tmux 的问题，但你装 tmux 前后一定会撞上，因为手册后面几章要你克隆仓库、装依赖。

**实测到的现象**：

- `github.com` 直连经常被掐。
- `npm` 官方源直连不通。

**我们用的办法**：

```bash
# 走本机代理推 GitHub（代理端口是你自己科学上网工具的端口）
git -c http.version=HTTP/1.1 -c http.proxy=http://127.0.0.1:7897 push

# 装 npm 包走国内镜像
npm install --registry=https://registry.npmmirror.com
```

**坑（两个都踩过）**：

1. **推 GitHub 要加 `http.version=HTTP/1.1`。** 只设代理不加这个，HTTP/2 协商会失败，报一堆看不懂的错。加上就通了。
2. **走镜像装包，镜像地址会写进 `package-lock.json`。** 队友从国外拉这个 lockfile 会连不上国内镜像。要么统一约定，要么提交前把 lockfile 用官方源重新生成一次。

## 这张卡片的规矩

- **只有真跑过的才能写成结论。** 跑过但要别人复现的，写清楚是哪台机器、什么版本。
- **没跑过的，标"没实测"，并把要跑的命令列出来**，让读到的人帮我们验。
- 每条都要有"命令 → 我们看到的 → 坑"三段。
