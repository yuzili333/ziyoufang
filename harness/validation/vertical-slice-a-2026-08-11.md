# Vertical Slice A 验证记录

## 结论

- 日期：2026-08-11
- 状态：`verified-with-synthetic-fixtures`
- 范围：微信原生 TypeScript 小程序、ECS BFF/Worker、独立评测服务与共享契约的首个纵向切片；记录中的早期云函数验证已由 ECS 迁移验证接替。
- 结论：正式工程骨架已创建，创建上传任务—私有路径上传—幂等提交—HMAC 服务调用—合成评测—多字结果查询链路通过自动化验证。

本记录只证明本地代码、契约和合成 fixture 闭环，不证明微信云环境部署、真实 OCR/大模型效果、未成年人真实数据合规或生产发布就绪。

## 已实现证据

| 能力 | 证据 |
| --- | --- |
| 微信小程序壳与三入口导航 | `miniprogram/app.json`、`components/app-tab-bar/` |
| 拍照/相册、上传确认、离线保存与恢复 | `miniprogram/pages/practice/`、`pages/upload-confirm/`、`services/local-task-store.ts` |
| 异步进度、取消和检查点重试 | `miniprogram/pages/progress/`、BFF `retryAssessment` |
| 多字列表、主视图、问题和五维展示 | `miniprogram/pages/results/` |
| “我的—字本”二级入口 | `miniprogram/pages/mine/`、`pages/wordbook/` |
| 微信身份派生、租户隔离和任务幂等 | `cloudfunctions/assessmentBff/core/` |
| HMAC 评测服务边界 | `cloudfunctions/assessmentBff/core/remote-gateway.js`、`assessment-service/src/security.mjs` |
| 合成评测编排及部分完成 | `assessment-service/src/orchestrator.mjs`、fixture provider |
| Harness 契约单向迁移 | `scripts/sync-contracts.mjs`、`packages/contracts/generated/` |
| 端到端纵向切片 | `tests/vertical-slice.test.mjs` |

## 验证命令

```bash
npm test
npm run validate:implementation
./harness/bin/validate
```

验证覆盖小程序 TypeScript 静态检查、主流程静态契约、迁移契约哈希、BFF 身份/幂等/越权/取消/失败重试、非阻塞远端提交、评测编排、HMAC 时效与签名，以及包含正常、错字、待纠偏、不确定和失败单字的合成端到端结果。

## 保留门禁

- `assessment_poc`：继续阻塞；真实 OCR、切格算法和多模态模型 Provider 尚未实现。
- `privacy_and_data_compliance`：继续待批准；不得使用真实学生照片或身份数据。
- `release_readiness`：继续阻塞；尚未完成微信开发者工具、云环境、三端真机、小程序审核和灰度证据。
- 当前评测服务使用内存仓库与 fixture provider；真实异步队列、持久化和供应商限流策略待 POC 后实现。
- 三次成长与重点监测基础已在后续切片实现；微信云环境事务行为、真实连续练习和校准阈值仍需单独验证。
- 项目配置使用测试 AppID 占位，尚未绑定生产小程序和云环境。
