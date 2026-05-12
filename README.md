# CNB MR Helper

一个用于创建 CNB 合并请求的 Node CLI。它提供 `mr` 交互式选择入口，保留 `mrm`、`mrt`、`mrp` 三个短命令，并把分支判断、冲突处理、合并请求创建重试、中文 ASCII UI、dry-run、verbose 诊断和无颜色/无动画模式放到可维护的 Node 脚本里。

## 命令

```sh
cnb-mr master
cnb-mr test
cnb-mr prerelease

mr  # 交互式选择 master / test / prerelease
mrm # master
mrt # test
mrp # prerelease
```

常用 DX 开关：

```sh
cnb-mr test --dry-run       # 只看计划，不修改本地或远程状态
cnb-mr test --verbose       # 输出实际执行的 git 命令和完整输出
cnb-mr test --quiet         # 只输出错误
cnb-mr test --no-color      # 禁用颜色，适合日志和无障碍场景
cnb-mr test --no-spinner    # 禁用 ASCII 动画
```

## 本机启用

一键安装：

```sh
curl -fsSL https://raw.githubusercontent.com/JUNERDD/cnb-mr-helper/main/install.sh | bash
```

卸载：

```sh
curl -fsSL https://raw.githubusercontent.com/JUNERDD/cnb-mr-helper/main/uninstall.sh | bash
```

已安装后也可以直接执行：

```sh
cnb-mr-uninstall
```

本地开发时，也可以在当前目录执行：

```sh
npm install
npm run build
npm link
```

`npm link` 使用的是 `dist/index.js`，也就是 TypeScript 源码经构建工具转换并压缩后的版本。
之后新终端可直接使用 `mrm`、`mrt`、`mrp`。
也可以执行 `mr`，用上下键或数字键选择 `master`、`test`、`prerelease`。

## 行为

- 当前分支已经合入目标分支：直接退出，不创建 PR。
- 远程 MR 分支已包含当前分支且未合入目标分支：只创建 PR。
- 远程 MR 分支已经合入目标分支：从目标分支刷新 MR 分支，再合入当前分支。
- 远程 MR 分支不存在：先推送当前分支创建 PR 入口，再准备本地冲突处理分支。
- 合并冲突：停在本地 MR 分支，解决后 `git add <files> && git commit && git push`。
- 默认要求 tracked 工作区干净，避免切换分支时带入未提交改动。
- 进度、诊断和错误写到 stderr，命令输出不会污染管道中的 stdout。

## UI / DX

- `--help` 直接展示示例、短命令、环境变量和反馈地址。
- `mr` 会进入键盘交互选择，支持上下键、数字键 `1-3`、回车确认和 `Ctrl-C` 取消。
- `--version` 输出当前版本。
- `--dry-run` 展示可能执行的 git / CNB 命令，不修改本地分支、远程分支或创建合并请求。
- 默认输出只保留关键步骤；`--verbose` 才展示完整命令和完整输出。
- 错误会给出可执行的下一步，例如缺少依赖、目标分支不存在、工作区不干净或合并冲突。
- 颜色遵循 `NO_COLOR`、`FORCE_COLOR`、`TERM=dumb` 和 `--no-color` / `--color`。
- 非 TTY 或 CI 环境自动禁用动画，避免日志被 spinner 刷屏。

运行耗时命令时，交互式终端会显示纯 ASCII 正方形旋转 dots motion：

```text
[. ][  ] -> [ .][  ] -> [  ][ .] -> [  ][. ]
```

## 工程结构

源码使用 TypeScript，按职责拆分到目录，并通过测试约束每个 `src/**/*.ts` 不超过 300 行。发布入口是 `src/index.ts`，构建产物是压缩后的 `dist/index.js`：

- `src/index.ts`：构建入口和兜底错误输出。
- `src/cli/`：Commander 参数、帮助和版本信息。
- `src/workflow/`：CNB MR 主流程编排。
- `src/git/` / `src/runtime/`：Git/CNB 命令执行、退出码和诊断。
- `src/ui/`：终端输出、颜色、动画策略和 `mr` 键盘交互选择。
- `src/core/`：dry-run、目标分支、格式化、错误等可测试纯逻辑。
- `build.mjs`：esbuild 构建脚本，输出 bundled + minified 的 `dist/index.js`。

## 依赖

需要本机可用：

- Node.js 20.12+
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
curl -fsSL https://raw.githubusercontent.com/JUNERDD/cnb-mr-helper/main/install.sh | bash
```

## License

MIT
