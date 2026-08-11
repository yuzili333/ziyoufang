# assessmentBff 云函数

单一 BFF 入口按 `action` 分派授权、上传任务、评测、字本和成长查询。主体身份只从 `wx-server-sdk.getWXContext()` 获取并经 HMAC 派生，绝不信任客户端传入的 `openid`。

正式环境必须配置 `SUBJECT_ID_HMAC_SECRET`、`BFF_HMAC_SECRET`、`ASSESSMENT_SERVICE_BASE_URL` 和经合规批准的 `CONSENT_VERSION`。代码会拒绝在生产环境使用带 `draft` 标识的授权版本；`fixture` 网关只能用于非生产的合成数据验证。
