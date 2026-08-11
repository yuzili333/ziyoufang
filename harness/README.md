# 字有方 Harness

此目录是产品与实现的验证基线，不承载产品源码。它将 `hanzi.md` 中的目标和后续已确认决策整理成稳定、可追踪的范围、场景、评审与验证记录，并校验正式 `client/` 工程没有偏离这些约束。

## 目录

```text
harness/
├── manifest.yaml                     # 阶段、来源和准入门槛
├── briefs/
│   ├── product.md                    # 从原始文档提炼的产品摘要
│   └── scope.md                      # 当前范围与明确延后项
├── scenarios/
│   └── core-flows.yaml               # 技术无关的核心验收场景
├── requirements/
│   └── mvp.md                        # MVP 业务需求说明书
├── fixtures/
│   └── README.md                     # 未来测试样例的治理约定
├── reviews/
│   ├── prototype-review.template.md  # 原型评审记录模板
│   ├── prototype-review-2026-08-07.md # 已批准的 mobile-v1 评审
│   └── privacy-and-data-compliance.md # 未成年人数据与图片合规门禁
├── prototypes/
│   └── mobile-v1.md                  # 已确认移动端页面与交互基线
├── decisions/
│   ├── technology-selection.template.md # 技术选型记录模板
│   └── technology-selection.md          # 已接受的多端客户端技术决策
├── validation/
│   └── arkui-x-capability-verification.md # 三端工具链与关键能力验证记录
├── results/
│   └── README.md                     # 未来验证结果约定
└── bin/
    └── validate                      # 当前阶段结构校验
```

## 设计原则

- `hanzi.md` 是原始需求源；已批准的 MVP、原型和技术决策用于记录后续范围变更与实施约束。
- 场景描述业务结果，不绑定框架、模型供应商、数据库或部署平台。
- 原型评审已经批准、技术决策已经接受；页面或架构变更必须回写对应评审/决策记录。
- 正式 `client/` 工程已获用户明确授权；服务端、模型等其他研发目录仍需对应选型和门禁。
- fixture 不包含真实学生身份信息；后续数据必须脱敏并记录授权来源。
- 评分阈值、算法精度和性能指标尚无依据时标为待定，不虚构目标值。

## 当前可执行项

运行：

```bash
./harness/bin/validate
```

当前原型评审已批准、技术决策已接受，正式客户端工程已建立，三端完整构建与真机能力验证仍在进行。校验会同时检查 harness 门禁和客户端三端静态契约。
