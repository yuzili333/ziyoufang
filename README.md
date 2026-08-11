# 字有方（ZiYouFang）

> 汉字有形，习字有方。

本仓库目前处于实现验证阶段。产品愿景与原始需求以 [`hanzi.md`](./hanzi.md) 为起点，已批准的 MVP 与移动端原型、已接受的技术决策记录后续范围调整。正式 `client/` 工程已按 ArkUI-X 6.0.0 Release + ArkTS 建立，三端能力验证正在进行。

## 当前仓库内容

- `hanzi.md`：原始产品说明与唯一需求源。
- `harness/`：范围约束、验收场景、技术决策、能力验证、评审模板和阶段校验工具。
- `client/`：HarmonyOS、Android、iOS 共用的 ArkUI-X 正式客户端工程。

## 使用方式

```bash
./harness/bin/validate
```

校验用于确认 harness、正式原型评审、客户端跨端配置和公共契约保持一致。

## 阶段推进

1. `harness/prototypes/mobile-v1.md` 与正式评审记录已经批准。
2. `harness/decisions/technology-selection.md` 已接受 ArkUI-X 多端客户端方案。
3. `client/` 正式工程已创建，并提供不依赖厂商 SDK 的跨端静态验证。
4. 按 `harness/validation/arkui-x-capability-verification.md` 完成 HarmonyOS、Android、iOS 构建与真机能力验证。
5. 三端能力和隐私合规门禁通过后进入发布研发阶段。
