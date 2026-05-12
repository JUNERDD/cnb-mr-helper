# CNB MR Helper

开源的 CNB 合并请求辅助 CLI。它提供 `mrm`、`mrt`、`mrp` 三个短命令，用于从目标分支准备 MR 分支、创建 CNB 合并请求，并在本地处理冲突。

## 一键安装

```sh
curl -fsSL https://raw.githubusercontent.com/JUNERDD/code/main/install.sh | bash
```

安装后可用：

```sh
mrm # 创建到 master 的合并请求
mrt # 创建到 test 的合并请求
mrp # 创建到 prerelease 的合并请求
```

也可以直接指定目标分支：

```sh
cnb-mr prerelease
```

## 行为

- 当前分支已经合入目标分支：直接退出，不创建 PR。
- 远程 MR 分支已包含当前分支且未合入目标分支：只创建 PR。
- 远程 MR 分支已经合入目标分支：从目标分支刷新 MR 分支，再合入当前分支。
- 远程 MR 分支不存在：先推送当前分支创建 PR 入口，再准备本地冲突处理分支。
- 合并冲突：停在本地 MR 分支，解决后 `git commit && git push`。

## 依赖

- Node.js 20+
- Git
- `git cnb`

## 安装路径

默认安装到：

```text
~/.local/share/cnb-mr-helper
```

命令链接到：

```text
~/.local/bin
```

可以通过环境变量覆盖：

```sh
CNB_MR_INSTALL_DIR="$HOME/.cnb-mr-helper" \
CNB_MR_BIN_DIR="$HOME/bin" \
curl -fsSL https://raw.githubusercontent.com/JUNERDD/code/main/install.sh | bash
```

## License

MIT
