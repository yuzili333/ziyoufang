# 学生反馈与重新评测基础验证记录

## 结论

- 日期：2026-08-11
- 状态：`verified-local-synthetic-foundation`
- 范围：单字结果反馈、幂等记录、关联重新评测、结果版本历史和字本/成长后续重算。
- 结论：E07 的本地合成数据基础已经形成，原结果不可变、新任务可追溯和主体隔离均有自动化证据。

## 已实现行为

- 反馈只接受当前主体已完成或部分完成任务中的真实单字序号。
- 原因限定为识别、分类、评分或其他问题，补充说明最多 200 字。
- 同一 `feedbackIdempotencyKey` 只生成一条反馈和一个重新评测任务。
- 新任务复用原图片引用、摘要和目标文字，记录 `reassessmentOfTaskId`，不修改原任务/单字结果。
- 重新评测继续使用统一异步进度、取消、失败重试和终态持久化路径。
- 新的有效结果进入现有字本和成长聚合；旧结果继续可从反馈历史查看。
- 反馈列表按服务端主体隔离，不接受客户端微信身份字段。

## 证据

- BFF：`cloudfunctions/assessmentBff/core/bff-core.js`
- 反馈持久化：`memory-repository.js`、`cloud-repository.js`
- 结果页入口与提交：`miniprogram/pages/results/`、`pages/feedback/`
- 版本历史：`miniprogram/pages/feedback-history/`
- 单元与合成端到端：`cloudfunctions/assessmentBff/test/bff-core.test.mjs`、`tests/vertical-slice.test.mjs`

## 尚未证明

- 真实 Provider 是否会依据反馈原因采用不同复核策略，需在 POC 后设计。
- 微信云数据库唯一索引、并发反馈和事务行为尚未在真实云环境验证。
- 反馈处理 SLA、用户更正权和争议处理文案仍需隐私/业务规则批准。
