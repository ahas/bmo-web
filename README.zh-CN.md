[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | **简体中文**

# web

Web 控制台 `bmo-web`。它由两部分组成：服务器，即基于 sumida、带有语言包的账户服务；客户端，即供用户登录的 Nuxt
控制台。控制台的各个界面调用各单元的 HTTP API。账户模型、授权以及以固定话术告知房间的内容归本仓库所有，并通过 HTTP
提供给其他单元。本仓库是唯一持有语言包的仓库：其他所有单元都以英文消息和代码作答，再由这些语言包渲染成用户可读的文字。

## 目录结构

| 文件夹 | 内容 |
|---|---|
| `server/` | 服务器：基于 sumida 的账户服务(`src/`，包括部署的规则文件、路由、检查、授权、数据迁移、手机密钥、receiver 端口、设置、固定话术渲染器、文档措辞文件、`src/migration/` 下的数据库迁移以及 `src/lang/` 下的语言包组件)，`src/bin/` 下的可执行文件，`client/` 下服务自身的契约和客户端 crate，`lang/` 下每种语言一个文件夹的语言包文件，服务器和 sumida 的设置，以及 `tests/` 下的测试和 `tests/fixtures/` 下的测试夹具 |
| `client/` | 控制台，一个带有自己锁文件的独立 Bun 工作区：`apps/web/` 下的 Nuxt 应用，`packages/server-client/` 下由服务器 OpenAPI 文档生成的 TypeScript 包，`tests/` 下的控制台测试及 `tests/support/` 下的辅助代码，`vendor/` 下的 bmo-ui 发行文件、打包的 bmo-text 和控制台所调用单元的打包客户端，以及安装时应用的 `patches/` 下的补丁 |
| `tests/` | 覆盖整个仓库的检查：依赖、韩语、目录结构、名称和个人数据模式(`docs/checks.md`)，由服务器 crate 作为其测试 harness 的 `repository` 模块运行 |
| `deploy/` | 部署时链接的用户单元：服务器的 `bmo-web-server.service` 和控制台的 `bmo-web.service` |
| `.cargo/` | 本检出目录的 Cargo 配置：通过 git 程序拉取 git 依赖 sumida |
| `docs/` | 描述控制台及其服务器行为的规范文档，以及本仓库从其拆分出来的单一仓库中所接收内容的清单 |

根目录下有成员为 `server/` 和 `server/client/` 的 Cargo 工作区清单及其锁文件；
`testbed.toml`(测试台对本仓库如何测试、检查、构建和部署的声明)；`install.toml`(说明在新机器上安装时需要什么，由测试台的 install 动词读取)；`rustfmt.toml`；`LICENSE`(MIT)；
`PERSONAL-DATA.md`(任何文件都不得包含的个人数据)；`WORDING.md`(控制台所显示韩语的指南)；`CLAUDE.md`；以及
`korean-ledger.json`(代码文件中保留的韩语台账，测试台的韩语扫描以它核对每个文件；本仓库的代码文件中没有任何韩语)。

## 文档

| 文档 | 内容 |
|---|---|
| `PERSONAL-DATA.md` | 任何文件都不得包含的个人数据：属于谁、哪些算在内、这些值应放在何处，以及保证这一点的检查 |
| `WORDING.md` | 控制台所显示韩语的指南：句子遵循的原则，以及控制台每个概念对应的唯一韩语词 |
| `docs/boundary.md` | 边界：服务器提供的每条路由、其 OpenAPI 契约和生成的客户端、服务器和控制台对其他单元的每次调用、指定这些单元的设置，以及语言包所渲染的代码 |
| `docs/accounts.md` | 账户服务：它保存什么、在哪里响应、模型何时生效、路由、命令和数据表 |
| `docs/language-pack.md` | 语言包：服务器的和控制台的语言包、各自的读取方式，以及其他单元从中读取的内容 |
| `docs/web.md` | 控制台：布局、动效、访问、措辞、每个界面、通知、与各单元的通信、设置和运行方式 |
| `docs/documents-viewer.md` | 文档查看器：根目录、名称和版本、路径边界、片段、目录，以及针对某段内容提问 |
| `docs/skeleton-loading.md` | 控制台如何为仍在获取的内容占住位置 |
| `docs/checks.md` | 测试套件如何运行测试(包括浏览器测试)；覆盖整个仓库的检查：包和代码可以依赖什么、代码和测试中禁止韩语、目录结构、任何受跟踪文件都不得匹配的个人数据模式，以及任何受跟踪文件都不得包含的名称 |
| `docs/inventory.md` | 本仓库从其拆分出来的单一仓库的每个成员：它在这里的位置、搬运它的任务，以及未迁移成员的所属单元 |

## 版本

- **版本是整个套件的版本。** 它在构建时从 git 标签读取：测试台以 `BMO_VERSION` 把它交给构建，服务器的健康检查答出它。
  清单中的版本字段是从不变动的占位值。
- **版本只在所有者宣布的发行时变动**，如 bmo-chat 的 `docs/conventions.md` 「Versions」所述；提交、部署、修复或
  契约变更都不会改变版本，部署以其提交来区分。

## 检查

`bmo-testbed check quick` 在运行任何东西之前先对目录树进行扫描：代码中的韩语、README 的文件夹表、清单列出的依赖、
Cargo profile 以及共享版本。来自其他仓库的依赖只有基础库 `bmo-chat`、`bmo-chat-client`、`bmo-ui` 和 `bmo-text`，
以及控制台所调用单元发布的客户端 `@agency/client`、`bmo-job-client` 和 `@bmo/receiver-client`，均在
`testbed.toml` 中声明；控制台从 `client/vendor/` 下的文件安装这些依赖，其中 bmo-ui 即发行命令写出的原样。
`shared-versions` 扫描确保该文件与 bmo-chat 共享版本所锁定的发行版一致。服务自身的客户端 crate
`bmo-web-client` 及由其生成的包 `@web/server-client` 属于本仓库，不是任何单元的包。在 `client/` 中运行
`bun run typecheck` 会检查控制台应用、生成的 TypeScript 包和控制台测试。
