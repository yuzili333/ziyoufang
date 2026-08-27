# 微信小程序研发就绪度审计

## 审计结论

- 审计日期：2026-08-11
- 目标：依据最新 MVP、微信小程序技术决策和 mobile-v2 原型，判断是否具备创建正式研发工程的证据。
- 当前结论：`operational-foundation-verified`
- 直接原因：原型、正式工程、学习闭环、隐私操作以及可观测/安全/成本工程基础均已通过合成数据测试，同时生产合规与发布门禁仍保持关闭。
- 已完成：跑通授权—练习—像素级合成评测—反馈—成长—脱敏分享/撤销—幂等删除基础闭环，验证按主体配额、白名单遥测、标识哈希、签名防重放指标和可重复成本/时延快照，以模拟响应固定 OCR/混元 Provider 边界，并将 PAD 信息架构落实为正式 WXSS/WXML 响应式代码。
- 可继续工作：推进隐私交互、真实 Provider POC 输入审批、微信云环境配置和三端真机验证。
- 当前禁止：重新引入已完成迁移验证并删除的 ArkUI-X `client/`，使用未经批准的真实学生数据，或绕过 POC/隐私/发布门禁上线。

## 证据分级

| 状态 | 含义 |
| --- | --- |
| proven | 当前文件、命令或浏览器证据直接证明完成 |
| ready | 输入已准备，但需门禁触发后执行 |
| pending-approval | 需要有权责任人明确批准，不能由仓库自动推断 |
| not-run | 已定义执行方法，但尚无运行结果 |
| blocked-by-gate | 前置门禁未通过，当前不得执行 |

## 逐项审计

| 研发要求 | 状态 | 权威证据 | 仍缺证据 |
| --- | --- | --- | --- |
| MVP 范围与业务规则 | proven | `requirements/mvp.md` | 量化生产指标仍待 POC |
| 微信小程序技术选型 | proven | ADR-001=`accepted` | 无决策缺口 |
| OCR/算法/模型责任边界 | proven | ADR-002=`accepted` | Provider 运行结果未产生 |
| OCR/混元 Provider 适配基础 | ready | 默认禁用适配器、TC3/映射/严格 JSON/模板降级模拟测试 | POC 输入批准后才允许真实网络调用；手写 OCR 旧版风险需复选 |
| 合成像素评测流水线 | proven | 批准 PNG 哈希校验、RGBA 解码、像素质量、4×4 切格、双次证据、五类结果、取消竞争和 BFF→HTTP 纵向测试 | 只证明合成夹具行为；真实图片、供应商、通用切格与专家评分仍未验证 |
| 手机可点击高保真原型 | proven | `prototype/mobile-v2/design-qa.md`=`passed`、六方决策记录 | 无原型审批缺口 |
| PAD 信息架构预留 | proven | `pad-design-qa.md`、响应式契约 | PAD 真机属于后续适配门禁 |
| 状态矩阵与需求追踪 | proven | mobile-v2 状态矩阵、追踪表 | 无原型结构缺口 |
| 接口、结果 Schema 与任务状态机 | proven | API、assessment/growth/advice Schema、状态机机器契约及迁移测试 | 真实 Provider 联调 |
| 云数据库持久化模型 | ready | 13 个集合、租户隔离、幂等/过期查询索引、逻辑过期、每小时有界物理清理、删除覆盖和禁止字段测试 | 云环境集合/索引创建、管理端权限、定时触发和私有文件删除运行证据 |
| 合成多格 fixture | proven | clear/blurred/cropped 与 V2 expected 结果 | 授权真实样本基线 |
| 六方联合原型评审 | proven | 六个角色均批准、证据路径齐备、阻塞问题为零，机器检查通过 | 无原型审批缺口 |
| 隐私与数据合规 | pending-approval | 合规约束与待确认表 | 法域、身份、留存、第三方和删除 SLA 决定 |
| 思源宋体参考字形许可 | complete | 思源宋体简体中文 Regular 2.003R、OFL-1.1 | 字体/许可证哈希、未修改状态及阿里云 ECS 私有容器部署范围记录 |
| 智能评测 POC | blocked-by-gate | 执行计划与机器输入检查器已完成；合成 smoke fixture 哈希无漂移 | 非合成验证集、指标目标三方批准和实际报告 |
| 微信小程序正式工程 | proven | `miniprogram/`、`cloudfunctions/assessmentBff/`、`assessment-service/`、`packages/contracts/`、Vertical Slice A 验证记录 | 微信开发者工具编译、云环境部署和真机证据 |
| 可观测、安全与成本基础 | proven | 白名单遥测、任务 HMAC 标识、签名/防重放指标、按主体配额和合成 Provider 快照测试 | 持久指标、分布式配额、告警阈值、真实 Provider 成本和负载证据 |
| 响应式正式代码基础 | ready | 600/840px 断点、侧边导航、主从单字列表和对比/洞察双栏静态契约测试 | 开发者工具、系统字体、横竖屏/分屏及 PAD/三端真机视觉证据 |
| 微信开发者工具与三端真机 | not-run | 已检查本机，未发现开发者工具应用、CLI 或 miniprogram-ci | 正式 AppID、工具安装、iOS/Android/HarmonyOS 微信真机、审核和灰度证据 |

## 门禁转换条件

从 `prototype-confirmation` 转入 `implementation-validation` 必须同时满足：

1. 联合评审六方结论允许批准。
2. 所有 P0/P1/P2 原型问题关闭并有证据。
3. `node harness/bin/check-development-readiness.mjs --require-ready` 返回成功。
4. `prototype-review-mobile-v2.md` 和 `manifest.yaml` 同步为 `approved`。
5. 变更后再次运行 `./harness/bin/validate`，确认范围排除和正式目录状态一致。

转换后允许先创建 E00 工程和使用合成 fixture 的 Vertical Slice A；真实学生数据、生产发布和供应商正式启用仍分别受隐私、POC 和发布门禁约束。

## 后续执行顺序

1. 已完成契约、Schema、fixture 和测试迁移，未迁移 ArkUI-X 页面/适配器。
2. 已建立微信原生 TypeScript 最小壳、ECS BFF/Worker 和评测服务 fixture Provider；旧云函数只作为限时回滚实现保留。
3. 已以 fixture provider 跑通合成数据成功、部分完成和异常边界闭环。
4. 待输入批准后按 P0～P5 执行智能评测 POC，所有报告标注数据和版本。
5. POC 决策后实现真实 OCR/模型 Provider、字本/成长事务、隐私闭环和真机验证。
6. 迁移完整性验证后旧 `client/` 已删除；历史 ArkUI-X 审计文件仅作不可执行证据保留。
