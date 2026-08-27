# assessmentBff 云函数

单一 BFF 入口按 `action` 分派授权、上传任务、评测、字本和成长查询。主体身份只从 `wx-server-sdk.getWXContext()` 获取并经 HMAC 派生，绝不信任客户端传入的 `openid`。入口会幂等写入 `subject_accounts`，只保存域隔离的 HMAC 主体键和活跃时间，不保存原始微信标识；练习删除不删除账户记录。

正式环境必须配置 `SUBJECT_ID_HMAC_SECRET`、`BFF_HMAC_SECRET`、`ASSESSMENT_SERVICE_BASE_URL` 和经合规批准的 `CONSENT_VERSION`，并设置 `QUOTA_BACKEND=distributed`。该模式使用云数据库事务保存短期 `quota_events`；同一幂等键不重复消耗额度。代码会拒绝在生产环境使用带 `draft` 标识的授权版本；`fixture` 网关只能用于非生产的合成数据验证。

评测媒体在换取临时 HTTPS 地址前会读取 `media_objects`，同时校验文件引用、`active` 状态和 `expiresAt`。到期或已进入清理状态的媒体即使物理文件尚未被定时任务删除，也不能继续提交或重试评测。
