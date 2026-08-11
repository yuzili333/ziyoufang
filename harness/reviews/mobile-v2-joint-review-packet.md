# mobile-v2 联合原型评审包

## 评审目标

- 原型版本：`mobile-v2-option-2-growth-v2`
- 评审状态：`completed`
- 决策范围：确认微信小程序 MVP 的功能范围、主流程、状态、文案和数据/接口可支撑性。
- 不在本次会议批准：真实学生数据处理、生产算法阈值、供应商采购、发布上线或 PAD 专属功能。
- 通过结果：六类责任角色均签字、原型级阻塞项为零，并将 [`prototype-review-mobile-v2.md`](./prototype-review-mobile-v2.md) 更新为 `approved`。

本评审包在会前只组织证据、不预填批准结论；2026-08-11 六类责任角色已完成签署。算法、隐私或生产指标仍作为后续 POC/发布门禁，原型不得以确定文案承诺尚未验证的准确率、分数或处理时长。

## 会前证据

| 证据 | 位置 | 评审用途 |
| --- | --- | --- |
| MVP 业务规则 | [`../requirements/mvp.md`](../requirements/mvp.md) | 范围、用户、输入输出和业务不变量 |
| 原型规格 | [`../prototypes/mobile-v2.md`](../prototypes/mobile-v2.md) | P-00～P-11 页面、流程和文案 |
| 状态矩阵 | [`../prototypes/mobile-v2-state-matrix.md`](../prototypes/mobile-v2-state-matrix.md) | 空、加载、离线、部分完成、失败、取消和重试 |
| 需求追踪表 | [`../prototypes/mobile-v2-traceability.md`](../prototypes/mobile-v2-traceability.md) | CAP/SCN 到页面和验收项映射 |
| 手机原型 QA | [`../../prototype/mobile-v2/design-qa.md`](../../prototype/mobile-v2/design-qa.md) | 第二套视觉方向和交互证据 |
| PAD 信息架构 QA | [`../../prototype/mobile-v2/pad-design-qa.md`](../../prototype/mobile-v2/pad-design-qa.md) | 后续扩展型主从布局，不扩大 MVP |
| 技术决策 | [`../decisions/technology-selection.md`](../decisions/technology-selection.md) | 微信小程序、云开发/BFF、评测服务边界 |
| 评测流水线 | [`../decisions/assessment-pipeline.md`](../decisions/assessment-pipeline.md) | OCR、确定性算法和模型职责 |
| 接口草案 | [`../contracts/assessment-api.md`](../contracts/assessment-api.md) | 页面状态与数据来源 |
| 隐私评审 | [`privacy-and-data-compliance.md`](./privacy-and-data-compliance.md) | 原型确认与生产合规门禁的边界 |
| 六方决策记录 | [`mobile-v2-review-decision.json`](./mobile-v2-review-decision.json) | 机器校验每个角色的结论、证据和问题状态 |

本地评审入口：

```text
手机成功路径：http://127.0.0.1:4173/
多字结果：http://127.0.0.1:4173/?screen=results
错字状态：http://127.0.0.1:4173/?screen=results&state=wrong
稳定性积累：http://127.0.0.1:4173/?screen=results&samples=2
重点字库：http://127.0.0.1:4173/?screen=wordbook
脱敏分享/删除：http://127.0.0.1:4173/?screen=share
PAD 信息架构：http://127.0.0.1:4173/pad-preview.html
```

## 必须形成的决策

| ID | 决策项 | 已定义基线 | 责任角色 | 会前状态 |
| --- | --- | --- | --- | --- |
| REV-01 | MVP 导航与页面范围 | 练习—中央拍照—我的；字本为我的二级菜单 | 产品、交互视觉 | 已批准 |
| REV-02 | 多方格拍照和目标文字流程 | 拍照/相册→确认→上传→异步分析→多字结果 | 产品、客户端、测试 | 已批准 |
| REV-03 | 结果分类术语 | 正常、错字、待纠偏、不确定、失败 | 产品、算法、测试 | 已批准 |
| REV-04 | 五维评价呈现 | 笔画规范、间架结构、字形比例、位置布局、稳定性 | 产品、算法、交互视觉 | 已批准 |
| REV-05 | 稳定性与成长规则 | 少于3次为空；3次起成长曲线；低均分/低稳定性进入重点字库 | 产品、算法、测试 | 已批准 |
| REV-06 | 大模型职责与降级 | 只解释确定性证据；最多3条建议；失败使用规则模板 | 算法、客户端、测试 | 已批准 |
| REV-07 | 离线、取消和部分完成 | 同一幂等任务续传；单字失败不使整页失败 | 客户端、后端、测试 | 已批准 |
| REV-08 | 反馈与重新评测 | 原结果不可变，新评测建立版本关系 | 产品、后端、测试 | 已批准 |
| REV-09 | 删除、授权撤回和分享 | 删除影响提示；分享再次确认且不含原图/身份/内部标识 | 产品、隐私、测试 | 已批准 |
| REV-10 | PAD 预留范围 | 只确认响应式信息架构，不纳入 MVP 专属交互 | 产品、交互视觉、客户端 | 已批准 |
| REV-11 | 范围排除 | 无教师复核、周期报告、排行、积分、挑战、公开动态 | 全体 | 已批准 |
| REV-12 | 准确率承诺边界 | 原型不显示未校准准确率、处理时长或教育结论 | 产品、算法、隐私 | 已批准 |

## 六方签署表

| 角色 | 签署前必须完成 | 允许结论 | 结论/审批人/日期 |
| --- | --- | --- | --- |
| 产品 | 逐项确认 REV-01～12，所有页面文案无歧义 | `approve` | yuzili / 2026-08-11 |
| 交互视觉 | 手机成功路径、异常状态和 PAD 信息架构走查 | `approve` | yuzili / 2026-08-11 |
| 客户端 | 确认每个状态均有微信 API、本地能力或 BFF 数据来源 | `approve` | yuzili / 2026-08-11 |
| 后端/算法 | 确认分类、评分、版本和降级不作未经验证承诺 | `approve` | yuzili / 2026-08-11 |
| 测试 | 将 SCN-000～010 转成可执行验收用例，指出缺失状态 | `approve` | yuzili / 2026-08-11 |
| 隐私合规 | 确认原型告知、监护人确认、删除和分享流程可进入工程细化 | `approve` | yuzili / 2026-08-11 |

`approve-with-nonblocking-followups` 只允许携带不改变页面、主流程、结果结构或数据用途的后续项；任何影响这些内容的问题都必须选择 `revise`。

签署结论还必须同步写入 [`mobile-v2-review-decision.json`](./mobile-v2-review-decision.json)：

- `approve` 和 `approve_with_nonblocking_followups` 必须填写审批人、ISO 时间和至少一条证据路径。
- 带非阻塞跟进的角色必须拥有至少一个开放的 `P3` 问题，并填写负责人和目标日期。
- 开放的 `P0/P1/P2` 一律阻塞；关闭问题必须提供关闭证据。
- 记录完成后运行 `node harness/bin/check-development-readiness.mjs --require-ready`。检查器只读，不自动修改门禁状态。

## 问题登记与关闭

| 问题 ID | 级别 | 页面/规则 | 问题 | 责任人 | 目标日期 | 关闭证据 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| — | — | — | 本轮无开放问题 | — | — | 六方决策记录中 `issues=[]` | closed |

- `P0/P1/P2` 必须在评审批准前关闭。
- `P3` 可以作为非阻塞跟进，但必须有责任人和验收证据。
- 修改主流程、新增页面、改变分类/五维/成长结果结构或扩大数据用途时，受影响角色必须重新评审。

## 会后门禁更新

只有六方均为允许批准的结论且阻塞问题为零时，才能执行：

1. 将 [`prototype-review-mobile-v2.md`](./prototype-review-mobile-v2.md) 的状态改为 `approved`，填写审批人和日期。
2. 确认 `node harness/bin/check-development-readiness.mjs --require-ready` 成功。
3. 将 `manifest.yaml` 中 `prototype_review.status` 改为 `approved`，阶段切换为 `implementation-validation`。
4. 解锁合成/授权样本 POC；仍不得把 `privacy_and_data_compliance=pending` 解释为允许使用真实学生数据。
5. 按 [`../requirements/miniprogram-mvp-backlog.md`](../requirements/miniprogram-mvp-backlog.md) 创建正式工程，并先迁移契约与 fixtures。
