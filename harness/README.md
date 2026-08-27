# 字有方 Harness

`harness/` 是产品、原型、架构与验收的来源，不承载正式小程序、云函数或智能评测服务源码。当前仓库已进入 `implementation-validation`，正式源码位于根目录对应工程，Harness 继续控制 POC、真实数据和发布门禁。

## 目录

```text
harness/
├── manifest.yaml
├── briefs/
│   ├── product.md
│   └── scope.md
├── requirements/
│   ├── mvp.md
│   └── miniprogram-mvp-backlog.md
├── scenarios/
│   └── core-flows.yaml
├── prototypes/
│   ├── mobile-v2.md
│   ├── mobile-v2-state-matrix.md
│   ├── mobile-v2-traceability.md
│   └── pad-v2.md
├── reviews/
│   ├── prototype-review-mobile-v2.md
│   ├── mobile-v2-joint-review-packet.md
│   └── privacy-and-data-compliance.md
├── decisions/
│   ├── technology-selection.md
│   └── assessment-pipeline.md
├── contracts/
│   ├── assessment-api.md
│   ├── assessment-task-state-machine.json
│   ├── assessment-result.schema.json
│   ├── cloud-data-model.json
│   ├── character-growth.schema.json
│   ├── model-advice.schema.json
│   ├── poc-evaluation-plan.schema.json
│   ├── prototype-review-decision.schema.json
│   └── responsive-layout-v2.json
├── fixtures/
├── results/
├── validation/
│   ├── assessment-poc-plan.md
│   ├── poc-evaluation-plan.json
│   └── wechat-development-readiness-2026-08-11.md
└── bin/validate
```

`mobile-v1`、旧原型评审和 ArkUI-X 能力验证记录作为历史证据保留，不再代表当前采用的客户端方向。

## 当前决策

- 客户端：微信原生小程序 TypeScript，最低基础库暂定 `2.32.3`。
- 云端：阿里云 ECS 承担微信身份换取、BFF、可靠 Worker 与评测容器；现有 MySQL 和私有 OSS 分别承担结构化数据与媒体存储。
- 智能评测：OCR + 确定性图像算法 + 多模态模型解释；腾讯云为首期默认但必须可替换。
- 成长监测：单次提供笔画规范、间架结构、字形比例和位置布局；三次可比练习后形成稳定性、成长曲线和重点字库状态。
- 社交：仅监护人再次确认后的脱敏结果卡，不分享原图，不提供排行、积分或挑战。
- 范围排除：教师复核、人工审核和所有周期报告。

## 实现门禁

页面规格、状态矩阵、可点击手机原型、PAD 信息架构和六方联合评审已经完成，研发就绪机器检查通过。正式微信小程序、云函数/BFF、评测服务和共享契约工程已经创建。

Vertical Slice A 已迁移契约和合成 fixture，并形成创建任务、提交、服务端评测与多字结果查询闭环。真实 Provider 仍等待 POC 输入门禁。

评测任务的离线、上传、分析、部分完成、取消和重试统一使用 `contracts/assessment-task-state-machine.json`；总校验会阻止状态枚举、进度阶段和幂等语义漂移。

云数据库与私有对象存储统一使用 `contracts/cloud-data-model.json`；其中索引、租户隔离、删除覆盖和禁止敏感字段已经自动测试，具体留存天数仍等待隐私合规批准。

当前允许：

- 开发和验证微信小程序、云函数/BFF、独立评测服务及合成数据纵向切片。
- 维护 `packages/contracts/` 和 `harness/fixtures/` 中已迁移的通用契约/fixture。
- 在 POC 门禁通过前只使用 fixture Provider，不接入真实 OCR 或模型。
- 在隐私合规通过前不使用真实学生数据；不重新引入已删除的 ArkUI-X `client/`。

## 使用方式

```bash
./harness/bin/validate
node harness/bin/check-development-readiness.mjs
node harness/bin/check-poc-inputs.mjs
```

总校验会检查实现阶段、正式工程、契约迁移、合成纵向切片及仍有效的 POC/隐私/发布门禁。第二条现在必须通过；第三条在验证集和指标未批准前仍应返回 `PENDING`。
