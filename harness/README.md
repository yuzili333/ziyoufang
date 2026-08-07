# 字有方 Harness

此目录是项目进入研发前的验证框架，不是产品实现。它将 `hanzi.md` 中的目标和后续已确认决策整理成稳定、可追踪的范围、场景、评审与验证记录。

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
│   └── prototype-review.template.md  # 原型评审记录模板
├── decisions/
│   ├── technology-selection.template.md # 技术选型记录模板
│   └── technology-selection.md          # 已批准的多端客户端技术决策
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
- 没有原型评审结论时，不固化页面结构和交互细节。
- 原型评审和客户端能力验证未通过前，不创建 `client/`、`src/`、`apps/`、`services/` 等研发目录。
- fixture 不包含真实学生身份信息；后续数据必须脱敏并记录授权来源。
- 评分阈值、算法精度和性能指标尚无依据时标为待定，不虚构目标值。

## 当前可执行项

运行：

```bash
./harness/bin/validate
```

当前技术选型已批准，三端能力验证与原型评审仍为待办。校验会确认正式决策记录存在，并继续阻止研发工程目录提前创建。
