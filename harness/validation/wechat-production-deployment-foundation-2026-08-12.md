# 微信云托管生产环境与数据库门禁基础（已被替代）

## 结论

- 日期：2026-08-12
- 状态：`blocked-external-console`
- 状态：`superseded-by-aliyun-ecs`
- 说明：本记录保留为迁移审计。现行生产门禁见[`aliyun-ecs-production-deployment-foundation-2026-08-12.md`](./aliyun-ecs-production-deployment-foundation-2026-08-12.md)，不得继续据此创建CloudBase或微信云托管生产资源。

- 历史已落地：真实 AppID、云托管构建入口、版本化非密钥部署契约、文档数据库过期索引契约、逻辑过期保护、每小时清理云函数、发布前机器检查。
- 未完成：微信云环境 ID、云托管服务名/HTTPS 地址、主备责任人实名、已公开 CLI 密钥吊销证据、`wx-server-sdk` 传递依赖风险处置批准，以及真实云环境运行证据。因此不得把该门禁标记为通过。

## 已固定配置

| 项目 | 值 |
| --- | --- |
| 小程序 AppID | `wxc7e8d08156f44970` |
| 服务根目录 | `assessment-service` |
| Dockerfile | `assessment-service/Dockerfile`（服务根内填写 `Dockerfile`） |
| 构建目录 | `assessment-service` |
| 容器端口 | `8080` |
| 健康检查 | `GET /health` |
| 流水线 | 微信云托管原生流水线，GitHub `main` 推送触发 |
| 发布 | 构建后人工批准，灰度验证后全量 |
| 数据库 | CloudBase 文档型数据库；不使用 MySQL |

`assessment-service/container.config.json` 不保存任何运行时值。云托管服务变量绑定具体版本，并通过控制台注入。现有 `VX_APP_ID`、拼写错误的 `VX_CLOUD_SCRECT` 和三个 `MYSQL_*` 均不是当前运行时代码所需变量，应从生产服务版本配置中移除。

## 数据库与过期清理

- 权威契约包含 13 个集合；所有集合只允许管理端访问，小程序只能通过 BFF。
- `media_objects(expiresAt,lifecycleStatus)`、`share_cards(expiresAt,status)`、`quota_events(expiresAt)` 是物理清理查询索引。
- `databaseMaintenance` 使用七段 Cron `0 0 * * * * *` 每小时执行，单轮总扫描量不超过 100，并在三类集合间分配容量，避免单一集合长期饿死其他清理任务。
- 分享卡物理删除前写最小审计事件；媒体先删除私有云文件，再删除元数据；失败记录留待下轮重试。
- 分享卡读取和评测媒体换取临时地址前均执行逻辑过期判断，清理延迟不会延长访问权限。

## 控制台待办

1. 立即吊销对话中公开的 CLI 密钥，生成新密钥；新密钥只可用于受保护的应急流水线 Secret，不进入云托管运行时。
2. 检查旧密钥调用记录、构建日志和版本配置；登记吊销时间和检查结论。
3. 在部署契约中登记云环境 ID、云托管服务名、最终 HTTPS 地址及主备责任人实名；同步替换小程序云环境占位符。
4. 在云托管原生流水线授权 GitHub 仓库，选择 `main`、服务根目录 `assessment-service`，启用推送触发但关闭自动生产切流。
5. 按 `cloud-data-model.json` 创建 13 个集合、唯一/查询索引，并将权限设置为仅管理端读写；部署 BFF 和 `databaseMaintenance`。
6. 使用短期测试记录验证事务并发、分享逻辑过期、配额过期、私有文件删除、失败重试、每轮上限和未过期数据不误删。
7. `npm audit --omit=dev` 对锁定的 `wx-server-sdk@4.0.2` 报告 5 个高危、1 个中危传递依赖公告，且无非破坏性自动修复；安全责任人须复核实际调用面、供应商升级路线和补偿控制，形成书面处置结论。不得用 `npm audit fix --force` 未经回归地降级 SDK。

## 检查命令

```bash
npm run check:production-deployment
node harness/bin/check-production-deployment.mjs --require-ready
```

第一条用于验证仓库结构并列出外部阻塞项；第二条只有在所有外部值和证据登记完成后才允许成功。
