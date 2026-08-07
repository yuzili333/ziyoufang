# 字有方（ZiYouFang）

> 汉字有形，习字有方。

本仓库目前处于产品定义阶段。产品愿景与原始需求以 [`hanzi.md`](./hanzi.md) 为起点，已批准的 MVP 与技术决策记录后续范围调整。客户端已确定采用 ArkUI-X 6.0.0 Release + ArkTS；原型评审和三端能力验证通过前，仓库仍只维护 `harness`，不创建正式研发工程。

## 当前仓库内容

- `hanzi.md`：原始产品说明与唯一需求源。
- `harness/`：范围约束、验收场景、技术决策、能力验证、评审模板和阶段校验工具。

## 使用方式

```bash
./harness/bin/validate
```

校验用于确认 harness 文件完整，并阻止在当前阶段提前引入研发目录或技术栈配置。

## 阶段推进

1. 完成产品原型，明确页面、交互、角色和异常流程。
2. 使用 `harness/reviews/prototype-review.template.md` 完成原型评审。
3. 已通过 `harness/decisions/technology-selection.md` 批准 ArkUI-X 多端客户端方案。
4. 使用 `harness/validation/arkui-x-capability-verification.md` 完成 HarmonyOS、Android、iOS 关键能力验证。
5. 原型评审、技术选型和能力验证三项门禁均通过后，再按已确认架构创建研发工程目录。
