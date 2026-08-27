# databaseMaintenance 云函数

每小时最多处理 100 条过期记录，按 `quota_events`、`share_cards`、`media_objects` 顺序清理。

- 分享卡删除前写入确定 ID 的最小审计事件，重复执行不会产生重复审计记录。
- 媒体记录先删除私有云文件，再标记 `storage_deleted` 并删除元数据；任一步失败均保留记录供下轮重试。
- 返回值与日志只包含集合级计数和错误码，不包含主体、文件 ID、路径或业务内容。
- `expiresAt` 必须写入 UTC ISO-8601 字符串；业务接口仍负责逻辑过期阻断，定时任务只完成物理清理。
