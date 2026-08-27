# ArkUI-X 遗留客户端移除记录

## 结论

- 日期：2026-08-12
- 状态：`removed-after-migration-verification`
- 范围：已被微信原生小程序技术决策替代的 `client/` ArkUI-X 工程。

## 移除前提与证据

1. `mobile-v2` 原型评审已批准，正式工程已建立于 `miniprogram/`、`cloudfunctions/assessmentBff/`、`assessment-service/` 和 `packages/contracts/`。
2. Schema、任务状态机、云数据模型和合成 fixture 均以 `harness/contracts/` 为唯一批准源，并由 `npm run sync:contracts` 与 `tests/contracts-migration.test.mjs` 校验复制一致性。
3. 合成图片、标准字引用与其生成脚本均位于 `harness/fixtures/`；`npm run fixtures:generate` 负责重建，`./harness/bin/validate` 验证哈希和契约。
4. 当前正式校验不再执行 ArkUI-X 脚本，且禁止重新创建 `client/` 目录作为运行时或验证依赖。

历史 ArkUI-X 审计和原型记录只保留为已替代方案的文本证据；它们不再引用可执行工程，也不作为微信小程序的发布门禁。
