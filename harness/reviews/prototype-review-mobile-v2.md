# 原型评审记录：mobile-v2

## 基本信息

- 原型版本：`mobile-v2-option-2-growth-v2`
- 功能规格：[`../prototypes/mobile-v2.md`](../prototypes/mobile-v2.md)
- 状态矩阵：[`../prototypes/mobile-v2-state-matrix.md`](../prototypes/mobile-v2-state-matrix.md)
- 追踪表：[`../prototypes/mobile-v2-traceability.md`](../prototypes/mobile-v2-traceability.md)
- 联合评审包：[`mobile-v2-joint-review-packet.md`](./mobile-v2-joint-review-packet.md)
- 六方决策记录：[`mobile-v2-review-decision.json`](./mobile-v2-review-decision.json)，六个角色均为 `approve`，机器门禁结果为 `ready_for_implementation_transition`
- PAD 信息架构：[`../prototypes/pad-v2.md`](../prototypes/pad-v2.md)
- PAD 响应式契约：[`../contracts/responsive-layout-v2.json`](../contracts/responsive-layout-v2.json)
- PAD 设计板 QA：[`../../prototype/mobile-v2/pad-design-qa.md`](../../prototype/mobile-v2/pad-design-qa.md)
- 可点击原型：[`../../prototype/mobile-v2/`](../../prototype/mobile-v2/)
- 视觉与交互 QA：[`../../prototype/mobile-v2/design-qa.md`](../../prototype/mobile-v2/design-qa.md)，结果 `passed`
- 选定视觉源：[`../prototypes/assets/mobile-v2-option-2-selected.png`](../prototypes/assets/mobile-v2-option-2-selected.png)
- 五维与成长修订稿：[`../prototypes/assets/mobile-v2-option-2-growth-v2.png`](../prototypes/assets/mobile-v2-option-2-growth-v2.png)
- 评审日期：2026-08-11
- 记录人：yuzili

## 当前结论

- 评审状态：`approved`
- 当前进展：第二套视觉方案、五维评分、成长曲线和重点字库已落实为可点击手机原型；手机视觉/交互与 PAD 信息架构均完成验证。六类责任角色已通过机器决策记录完成批准，阻塞问题为零。
- 门禁影响：允许进入 `implementation-validation` 并创建微信小程序、ECS BFF/Worker 与智能评测服务正式工程。隐私合规、授权验证集、生产阈值、供应商、真机和发布门禁仍独立有效；ArkUI-X `client/` 已在契约迁移验证后删除。

## 联合评审清单

| 角色 | 必须确认 | 结论 | 审批人/日期 |
| --- | --- | --- | --- |
| 产品 | 功能范围、主流程、分类和文案无歧义 | 通过 | yuzili / 2026-08-11 |
| 交互视觉 | 第二套单字叠映视觉、拍照入口、白/朱红/黑主题、五维评分和成长曲线层级 | 通过 | yuzili / 2026-08-11 |
| 客户端 | 页面状态均可由微信 API、BFF 契约或降级支撑 | 通过 | yuzili / 2026-08-11 |
| 后端/算法 | 原型没有承诺未验证准确率、评分或完成时间 | 通过 | yuzili / 2026-08-11 |
| 测试 | 成功、异常、离线、恢复、删除和分享均可形成用例 | 通过 | yuzili / 2026-08-11 |
| 隐私合规 | 原型流程可进入工程细化；真实数据和发布仍受独立合规门禁约束 | 通过 | yuzili / 2026-08-11 |

## 场景覆盖

| 场景 | 规格覆盖 | 可点击验证 | 未决问题 |
| --- | --- | --- | --- |
| SCN-000 首次授权 | P-00、P-01、P-07 | 手机原型已验证 | 合规文案与身份确认方式 |
| SCN-001 多字提交 | P-02、P-03、P-04 | 手机原型已验证 | 图片体积和本地容量实测 |
| SCN-002 识别 | P-05、P-06 | 手机原型已验证 | OCR/切格样本基线 |
| SCN-003 纠错纠偏 | P-06 | 手机原型已验证，含错字快捷状态 | 生产阈值与专家口径 |
| SCN-004 字形对比 | P-06 | 叠加/并排已验证 | 思源宋体 2.003R/OFL-1.1 已确认；生产合规台账签署转发布门禁 |
| SCN-005 字本 | P-07、P-08 | 手机原型已验证 | 无 |
| SCN-006 历次矫正 | P-08 | 成长记录与再练入口已验证 | 完成阈值、版本断点呈现 |
| SCN-007 结果反馈 | P-09 | 原因、补充说明和重新评测已验证 | 反馈文本限制 |
| SCN-008 受控分享 | P-10 | 监护人确认和脱敏卡已验证 | 分享有效期和撤销规则 |
| SCN-009 删除 | P-07、P-10 | 范围说明、二次确认和完成态已验证 | 删除 SLA 与审计期限 |
| SCN-010 成长与重点监测 | P-06、P-08、P-11 | 样本积累、4次曲线和重点字库已验证 | 五维权重和生产阈值 |

## 技术验证证据

- 可点击工程通过移动运行时完整性检查和生产构建。
- iPhone 与 Pixel 10 设备框均完成浏览器检查，底部中央拍照入口、结果主视图和安全区未发生横向溢出。
- 首次授权、拍摄上传、分阶段分析、结果切换、错字/不确定/失败、离线、模糊、部分完成、建议降级、反馈、分享、删除和重点字库均有可操作或快捷深链状态。
- 结果页视觉源与实现完成全视图和重点区域合并对照，最终无 P0/P1/P2 问题。
- PAD 设计板在 `1280 × 800` 参考画布下验证四区宽度为约 `78 / 222 / 620 / 360px`；单字切换与叠加/并排状态切换生效。受当前 Codex 浏览器面板尺寸限制，评审截图为等比缩放证据，不替代 PAD 真机 1:1 视觉验收。

## 批准条件

1. 可点击原型和锁定视觉源齐备。
2. 全部核心流程能够从起点走到明确终态。
3. 手机端字体、安全区和长文本通过视觉检查；PAD 信息架构通过，PAD 真机、字体和分屏检查转入后续适配门禁。
4. 状态矩阵和追踪表不存在缺页或行为冲突。
5. 所有角色完成确认，阻塞问题为零。

上述原型门禁条件已经满足。本批准只解锁研发工程和合成数据纵向切片，不代表隐私合规、POC 指标或生产发布已批准。
