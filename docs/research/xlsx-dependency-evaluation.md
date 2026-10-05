# M9-4 在位看板 Excel 导出：三方依赖审查与选型

> 审查日期：2026-07-10（Asia/Taipei）
>
> 审查版本：`exceljs@4.4.0`、`xlsx@0.18.5`、`write-excel-file@4.1.1`、`xlsx-populate@1.21.0`。
> 版本与包元数据取自 npm registry；报告没有安装候选依赖，也没有修改 `package.json` 或锁文件。

## 结论先行

**唯一推荐：`write-excel-file@4.1.1`。** 它是 MIT、纯 JavaScript、运行时直接依赖只有 `fflate`，支持 Node 18+、Buffer/文件输出和基础样式，且当前发布与维护节奏最适合本项目的“后端同步、几百到 1 万行、无宏/图表/透视”的窄场景。

**次选：`exceljs@4.4.0`。** 它是功能和 TypeScript 体验更完整的 MIT 方案，支持流式 XLSX writer；代价是包体和依赖链显著更大，且 npm 最新稳定版自 2023-10-19 后没有正式稳定版更新，需接受维护风险和更严格的锁定/审计。

`xlsx@0.18.5` 不通过：虽为 Apache-2.0 且生态大，但当前 npm 版本命中 `CVE-2023-30533`（Prototype Pollution）和 `CVE-2024-22363`（ReDoS），官方修复版本走独立 CDN tarball 而不是 npm 常规版本，违反本项目优先使用可离线镜像/锁文件复现的要求。`xlsx-populate@1.21.0` 不通过：MIT 和样式能力不错，但已停止维护多年，且公开 issue 记录了大批量样式/内存风险。

**与 RFC §5.4 的 exceljs 预设的偏差声明：** 本报告唯一推荐改为 `write-excel-file`，属于 RFC 所称“exceljs 或等价 MIT/Apache 许可库”中的等价替代。偏差理由是：M9-4 只需要后端同步写出基础表格，`write-excel-file` 的 MIT 许可、单一运行时依赖和近期维护节奏显著更贴合内网离线供应链；ExcelJS 保留为流式/丰富样式 fallback。该偏差仅是本次选型建议，最终落地前仍需在 M9-4 任务包中记录并由评审确认。

## 对比矩阵

| 候选 | 许可证 | 维护状态（截至审查日） | 供应链规模 / 原生依赖 | 安全结论 | 能力匹配 | 包体参考 | 结论 |
|---|---|---|---|---|---|---:|---|
| `write-excel-file@4.1.1` | SPDX `MIT` | npm 2026-06-08 发布；2026 年持续发版；单一 npm maintainer；无弃维护信号 | 1 个直接依赖 `fflate`；声明包无 native binding / node-gyp；生命周期脚本未发现 | GitHub Advisory/OSV：当前版本无命中；Snyk：无直接漏洞 | Node 18+；Buffer/文件输出；基础字体、宽度、格式；内置 TS 类型；流式输出不是主 API | npm unpacked 约 1.81 MB；加 `fflate` 的 Docker 增量未实测 | **推荐** |
| `exceljs@4.4.0` | SPDX `MIT` | npm 2023-10-19 稳定版；2024-12-20 有 prerelease；GitHub 约 652 issues/135 PR；Snyk 标为 inactive；2 位 maintainer | 9 个直接依赖；含 `archiver`、`jszip`、`unzipper`、`readable-stream` 等；声明包无 native binding / node-gyp | 近三年无当前版本直接命中；历史 `CVE-2018-16459` 已在 1.6.0 修复；依赖链仍需锁定后审计 | 流式 XLSX writer、Buffer、丰富样式、内置 TS 类型；Node 22 应可运行但官方引擎仅声明 `>=8.3.0`，需 CI 实测 | npm unpacked 约 21.83 MB；依赖闭包和 Docker 增量未实测 | **次选** |
| `xlsx@0.18.5`（SheetJS CE） | npm 元数据 SPDX `Apache-2.0`；官方 CE 仍 Apache-2.0 | npm 2022-03-24 后无新版本；1 个 maintainer；GitHub 源仓库已迁移，npm 包维护/分发链不一致 | 7 个直接依赖；纯 JS 声明，无 native binding；但修复版通过 CDN tarball 分发，离线镜像需额外治理 | 当前版本直接命中 `GHSA-4r6h-8v6p-xvw6/CVE-2023-30533`、`GHSA-5pgg-2g8v-p4x9/CVE-2024-22363`；Snyk 标为高/中问题 | Buffer 写出和基础表格可用；样式能力弱/不适合要求基础样式的长期扩展；无官方流式 writer；TS 类型随包；Node 22 兼容性未核实 | npm unpacked 约 7.50 MB；CDN 修复包和 Docker 增量未实测 | **不推荐** |
| `xlsx-populate@1.21.0` | SPDX `MIT` | npm 2020-03-01 最后发版；1 位 maintainer；Snyk 标 inactive；GitHub 约 125 issues/32 PR | 4 个直接依赖：`cfb`、`sax`、`jszip`、`lodash`；声明包无 native binding / node-gyp；完整 pnpm 闭包未核实 | 近三年 GitHub Advisory/OSV 与 Snyk 未发现直接漏洞；不等于依赖无漏洞 | 样式/模板保留能力强；主要是内存模型，输出以完整 workbook 为主；无流式 writer；无内置 TS 类型声明证据；Node 22 未核实 | npm unpacked 约 15.11 MB；依赖闭包和 Docker 增量未实测 | **不推荐** |

### 体积和依赖口径

上述“npm unpacked”是 registry 包元数据中的 `dist.unpackedSize`，不是安装后的 pnpm store、硬链接后的 `node_modules` 或最终 Docker layer 大小。由于候选包尚未加入本仓库，本次没有执行 `pnpm install` / `pnpm audit`，因此“完整 resolved pnpm tree 数量”和 Docker 增量均标为未实测；实施前必须在隔离临时目录生成锁文件并用实际生产镜像构建测量。

## 候选详评

### 1. write-excel-file@4.1.1（推荐）

**许可证。** npm registry 的 `license` 字段为 SPDX `MIT`，上游 GitLab 也提供 MIT License。MIT 是宽松许可证，满足 RFC §5.4 的许可门槛。

**维护。** registry 显示 105 个版本，`4.0.5` 至 `4.1.1` 在 2026-05-02 至 2026-06-08 连续发布；GitLab 项目近期仍有提交（包括 `4.1.1` 对应源码更新）。当前风险不是弃维护，而是单一主要维护者带来的 bus factor；发布签名、双人复核、维护者接管历史本次未核实。

**供应链。** 包声明只有一个直接运行时依赖 `fflate`，没有 `optionalDependencies`，没有 `install` / `postinstall` 生命周期脚本，也没有 node-gyp 或预编译二进制声明。npm registry tarball 的 integrity 可在锁文件中固定。npm 包仓库字段指向 `gitlab.com/catamphetamine/write-excel-file`，与上游一致。完整递归 pnpm tree、包内文件与源仓库逐文件一致性本次未核实。

**安全。** 近三年在 GitHub Advisory/OSV 查询中没有当前版本命中；Snyk 当前页也显示无直接漏洞。`fflate` 的间接漏洞不能由本项结论覆盖，必须在锁定版本后跑 `pnpm audit --prod`，并用内部镜像/离线 SBOM 复核。

**能力。** Node 入口支持生成后 `.toBuffer()` / `.toFile()` 等输出方式，能满足 NestJS controller 返回 Buffer；包 README 明确支持 Node.js、样式、列宽、表头和多 sheet，并支持 TypeScript 类型。它的核心是一次性构造 XML/ZIP，不把真正的 row-by-row streaming writer 作为主要 API；1 万行、约 6 列的场景应做内网基准测试并设响应体/超时上限。Node 22 兼容性没有官方矩阵证据，只有 Node `>=18` 引擎声明，故仍需 CI 实测。

### 2. exceljs@4.4.0（次选）

**许可证。** npm registry 与上游仓库均标识 SPDX `MIT`。上游 README 明确贡献内容纳入 MIT 许可。

**维护。** 4.4.0 于 2023-10-19 发布；registry 还记录 `4.4.1-prerelease.0` 于 2024-12-20，但未形成新的稳定版。Snyk 把当前包标为 inactive；GitHub 页面约 652 个 open issues、135 个 PR，约 2 个 npm maintainer。它仍有大量使用者和贡献者，但正式发布节奏是主要风险。

**供应链。** 9 个直接运行时依赖：`tmp`、`uuid`、`dayjs`、`jszip`、`saxes`、`archiver`、`fast-csv`、`unzipper`、`readable-stream`。这比推荐方案更宽，`archiver -> archiver-utils -> glob` 等链路曾引起 `inflight` 依赖告警讨论；该告警与是否可利用需以最终锁版本判断，不能只看顶层包。registry 包含大量测试/构建脚本，但没有 npm `install` / `postinstall` 生命周期脚本，也未发现 native binding 声明。上游仓库字段与 GitHub 源仓库一致；tarball integrity 可锁定。

**安全。** OSV/GitHub Advisory 查询当前 `4.4.0` 无直接漏洞。历史 `GHSA-2j2j-8rrv-264g` / `CVE-2018-16459` 影响 `<1.6.0`，已修复。真正需要关注的是间接依赖和输入文件解析：ExcelJS issue #2609 记录了 `inflight` 传递链告警，故引入时不能只接受“顶层无漏洞”。

**能力。** 这是候选中最完整的 Node/TypeScript 方案：文档提供 `workbook.xlsx.writeBuffer()` 和 streaming XLSX writer，支持表头字体、列宽、日期/数字格式、合并、冻结等。对 1 万行同步导出，流式 writer 可降低峰值内存，但仍需用本项目列集合和真实中文数据做 benchmark；不能把社区口碑当作内存保证。Node 22 未在 4.4.0 的官方支持矩阵中明确承诺，需在 CI 运行。

### 3. xlsx@0.18.5（SheetJS Community Edition）

**许可证与分发历史。** npm `xlsx@0.18.5` 的包元数据为 SPDX `Apache-2.0`；SheetJS 官方文档也称 CE 为 Apache 2.0，并要求保留归属声明。这里需要区分两件事：本次没有核实到 CE 从 Apache-2.0 改成了另一种许可证；核实到的是分发方式变化——npm 上最后稳定版本是 0.18.5，而官方仓库/文档指向新的 git.sheetjs.com 源仓库和 `cdn.sheetjs.com` tarball。官方说明 `0.19.3`、`0.20.2/0.20.3` 可从 CDN 获取，不能假设 npm 的 0.18.5 已包含这些修复。SheetJS Pro 是商业产品，不能把 Pro 功能/许可与 CE 混用。

**维护与供应链。** npm 1 个 maintainer、2022-03-24 最后发版；GitHub 镜像说明源仓库已迁移，页面约 119 issues/13 PR，npm 包与当前上游发布链存在可见分离。运行时直接依赖 7 个：`cfb`、`ssf`、`wmf`、`word`、`crc-32`、`adler-32`、`codepage`。未发现 native binding 或 install script；但若直接使用 CDN tarball，内部 npm 离线缓存、来源白名单、checksum 和许可证扫描都要额外接入。

**安全与能力。** 当前 npm 版受 `CVE-2023-30533`（高危 Prototype Pollution，修复在 0.19.3）和 `CVE-2024-22363`（高危 ReDoS，修复在 0.20.2）影响；Snyk 对 0.18.5 同样显示 1 个 high 和 1 个 medium。若只做“写出”且永远不解析不可信工作簿，Prototype Pollution 的利用面会下降，但依赖审查不能以业务假设替代修复。SheetJS 适合通用数据读写，Buffer 输出明确；但 CE 的样式能力有限，官方把更丰富的模板/样式/图表/PivotTable 能力列为 Pro，且没有 ExcelJS 风格的 streaming writer 证据。TypeScript 类型可用；Node 22 兼容性和 CDN 包与 npm 包完全一致性均未核实。

### 4. xlsx-populate@1.21.0

**许可证与维护。** SPDX `MIT`。npm 最后发版 2020-03-01，1 位 maintainer；Snyk 将其标为 inactive，GitHub 约 125 issues/32 PR。没有看到“已废弃” npm deprecation 标记，但多年无 release 本身是弃维护信号。

**供应链。** 4 个直接运行时依赖：`cfb`、`sax`、`jszip`、`lodash`；声明包未发现 native binding 或 install script。npm repository 字段指向 `github.com/dtjohnson/xlsx-populate`，与上游一致。无公开证据证明包被接管或投毒；维护者接管/发布账号保护本次未核实。

**安全与能力。** 近三年 GitHub Advisory/OSV 与 Snyk 未报告该包的直接漏洞，但不能覆盖其旧依赖。能力上支持模板、样式、Buffer/文件异步输出，内置 API 以 workbook 全量对象模型为主，没有流式 writer 和内置 TypeScript 声明的明确证据。上游 issue #32 和 #188 记录了大规模样式导致内存/文件膨胀或 Excel 修复提示的历史问题；这与 1 万行的评估上限不匹配，因此不作为 fallback。

## 风险与缓解

1. **推荐库维护者集中。** `write-excel-file` 当前只有一个主要 npm maintainer。缓解：锁定精确版本与 tarball integrity；在内部镜像保存 tarball、LICENSE、SBOM 和 provenance；维护一个最小 adapter，未来可以替换 ExcelJS；每次升级做维护者/发布历史和包内容 diff。
2. **同步生成的峰值内存/请求阻塞。** 推荐库不是主打 row streaming。缓解：M9-4 先限制单次 10,000 行和列集合；用 Node 22、生产 Docker、中文/长备注数据做 1k/5k/10k 基准，记录 RSS、生成耗时和 XLSX 可打开性；超过阈值转异步任务或切 ExcelJS streaming writer，不能在 controller 中无限放大同步请求。
3. **间接依赖与离线供应链。** registry direct dependency 数不等于 pnpm resolved tree；`exceljs` 特别需要审查 archiver 相关传递链。缓解：实施阶段在隔离目录只做一次 `pnpm add --lockfile-only`/实际安装验证，提交锁定版本后运行 `pnpm audit --prod`、许可证扫描、SBOM 和 Docker 构建；禁止 install script，使用 `pnpm install --frozen-lockfile --offline` 验证内网包缓存。
4. **输入/输出数据安全。** 姓名、工号、部门、备注均为敏感人员数据；Excel 还存在公式注入风险。缓解：导出端点沿用 `presence:board:view` 和数据范围；对以 `=`, `+`, `-`, `@` 开头的文本按项目安全基线转义或显式文本化；不要支持宏/外部链接；对文件名、Content-Disposition、响应大小和审计日志做约束。
5. **RFC 预设与实施结果可能分歧。** 本报告已经明确记录了从 ExcelJS 预设到 `write-excel-file` 的偏差。M9-4 任务包必须保留该理由、能力差异和 ExcelJS 回退路径，并由 RFC 责任人复核；若 benchmark 证明需要真正的 row streaming，则切换次选 ExcelJS。

## 附录：数据来源

### 官方包与源仓库

- [exceljs npm 元数据与 README](https://www.npmjs.com/package/exceljs)
- [ExcelJS releases / v4.4.0](https://github.com/exceljs/exceljs/releases)
- [write-excel-file npm](https://www.npmjs.com/package/write-excel-file)
- [write-excel-file GitLab 源仓库与 MIT License](https://gitlab.com/catamphetamine/write-excel-file)
- [xlsx npm@0.18.5](https://www.npmjs.com/package/xlsx/v/0.18.5)
- [SheetJS CE 官方许可证](https://docs.sheetjs.com/docs/miscellany/license/)
- [SheetJS 源仓库迁移与 CE / Pro 说明](https://github.com/SheetJS/sheetjs)
- [SheetJS 0.19.3 版本与 npm 分发问题](https://git.sheetjs.com/sheetjs/sheetjs/issues/2961)
- [SheetJS CDN tarball 安装说明](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/)
- [xlsx-populate npm](https://www.npmjs.com/package/xlsx-populate)
- [xlsx-populate 源仓库](https://github.com/dtjohnson/xlsx-populate)

### 维护、依赖与安全

- [Snyk：exceljs](https://security.snyk.io/package/npm/exceljs)
- [Snyk：write-excel-file](https://security.snyk.io/package/npm/write-excel-file)
- [Snyk：xlsx](https://security.snyk.io/package/npm/xlsx)
- [Snyk：xlsx-populate](https://security.snyk.io/package/npm/xlsx-populate)
- [ExcelJS 传递依赖告警 issue #2609](https://github.com/exceljs/exceljs/issues/2609)
- [GitHub Advisory：exceljs XSS（CVE-2018-16459）](https://github.com/advisories/GHSA-2j2j-8rrv-264g)
- [GitHub Advisory：SheetJS Prototype Pollution（CVE-2023-30533）](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)
- [GitHub Advisory：SheetJS ReDoS（CVE-2024-22363）](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)
- [xlsx-populate 大批量样式/内存 issue #32](https://github.com/dtjohnson/xlsx-populate/issues/32)
- [xlsx-populate 样式文件膨胀 issue #188](https://github.com/dtjohnson/xlsx-populate/issues/188)

### 本地审查边界

- 已核对仓库 `docs/rfc/m9-presence-v2.md` 的导出约束、`AGENTS.md` 的三方依赖审查规则和 `package.json` 的 pnpm/Node 工程约束。
- 未安装候选依赖；未执行 `pnpm add`、`pnpm install`、`pnpm audit`、Docker build 或 1 万行 benchmark。
- “无投毒/接管历史”“Node 22 完全兼容”“完整 pnpm 解析树与 Docker 增量”均未被本次静态审查完全证明，实施前必须复核。
