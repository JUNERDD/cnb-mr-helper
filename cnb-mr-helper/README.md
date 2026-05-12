# CNB MR Helper

一个用于创建 CNB 合并请求的 Node CLI。它保留 `mrm`、`mrt`、`mrp` 三个短命令，并把分支判断、冲突处理、PR 创建重试、中文 ASCII UI 和正方形旋转 dots motion 放到可维护的 Node 脚本里。

## 命令

```sh
cnb-mr master
cnb-mr test
cnb-mr prerelease

mrm # master
mrt # test
mrp # prerelease
```

## 本机启用

一键安装：

```sh
curl -fsSL https://raw.githubusercontent.com/JUNERDD/code/main/install.sh | bash
```

本地开发时，也可以在当前目录执行：

```sh
npm install
npm link
```

之后新终端可直接使用 `mrm`、`mrt`、`mrp`。

## 行为

- 当前分支已经合入目标分支：直接退出，不创建 PR。
- 远程 MR 分支已包含当前分支且未合入目标分支：只创建 PR。
- 远程 MR 分支已经合入目标分支：从目标分支刷新 MR 分支，再合入当前分支。
- 远程 MR 分支不存在：先推送当前分支创建 PR 入口，再准备本地冲突处理分支。
- 合并冲突：停在本地 MR 分支，解决后 `git commit && git push`。

## ASCII motion

运行耗时命令时会显示纯 ASCII 正方形旋转 dots motion：

```text
[. ][  ] -> [ .][  ] -> [  ][ .] -> [  ][. ]
```

## 依赖

需要本机可用：

- Node.js 20+
- Git
- `git cnb`
