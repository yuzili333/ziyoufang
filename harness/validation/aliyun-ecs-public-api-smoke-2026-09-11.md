# 阿里云 ECS 公网 API 冒烟验证

- 日期：2026-09-11
- API：`https://lilicoconut.me`
- 状态：`partially-passed`
- 范围：公网路由、基础鉴权语义、端口暴露；不包含真实微信会话、OSS写入或真实评测。

## 已通过

- `GET /api/v1/health`通过HTTPS返回`200`及`{"status":"ok","database":"ready"}`。
- 响应不包含`X-Powered-By`，健康响应不暴露数据库地址、版本或凭据。
- 公网访问`18080`和`3306`均在五秒连接窗口内超时，未发现API回环端口或MySQL端口直接暴露。
- 无效微信登录请求返回有界的`400 WECHAT_LOGIN_CODE_INVALID`，未返回堆栈或服务端密钥。

## 代码已修复、待重新部署复验

- 未携带Bearer令牌的`/api/v1/actions`和`/api/v1/media/upload-ticket`现网错误返回`400`；API状态映射已修复为`401 SESSION_INVALID_OR_EXPIRED`，以支持小程序自动重新登录。
- 未定义API路径现网返回Express HTML 404；已改为稳定JSON `404 API_ROUTE_NOT_FOUND`。
- 无效分享令牌现网返回`503 SHARE_CARD_UNAVAILABLE`；已改为不泄露存在性的`404 SHARE_CARD_UNAVAILABLE`。
- HTTP访问`/api/v1/health`现网直接返回`200`；已增加仅针对`/api/v1`命名空间的`308` HTTPS跳转配置，待安装到主机Nginx的HTTP服务块。
- 小程序授权、分享授权和删除确认版本已分别与生产登记值`compliance-approved-v1`、`share-approved-v1`和`deletion-approved-v1`对齐，待重新编译后真机验证。

## 仍阻塞

- 尚未取得真实`wx.login`一次性code，未验证`code2Session`、两小时会话、401自动重登和主体隔离。
- 尚未验证ECS实例RAM角色取证、OSS V4上传票据、JPG/PNG直传、ETag复核、内网HeadObject和越权拒绝。
- `font-smoke`模式下只允许验证任务最终受控失败，不代表OCR、评分或混元已投产。
- HTTPS根路径在本轮外部检查中返回`404`；需由网站责任人对照发布前基线确认是否属于预期状态。

## 下一步

1. 部署本轮API状态码及健康检查修复，并在HTTP服务块包含`host-nginx-api-http-redirect.conf`。
2. 复验HTTPS 200、HTTP 308、未授权401、无效分享404及未知路由JSON 404。
3. 使用微信开发者工具重新编译小程序并清除旧授权缓存。
4. 真机依次验证登录、授权、建任务、OSS直传、提交、轮询及`font-smoke`受控失败。
