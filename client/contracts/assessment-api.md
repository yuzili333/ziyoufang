# 评测服务最小接口契约

该契约只定义客户端与业务评测服务的稳定边界，不指定后端框架、模型供应商或模型部署方式。正式环境的 HTTPS `baseUrl` 必须通过运行配置注入，不提交密钥。

## 提交评测

- `POST /v1/assessments`
- 请求头：`Idempotency-Key`、`X-Local-Task-Id`、`Accept: application/json`
- multipart 字段：
  - `metadata`：JSON，包含 `localTaskId`、`studentId`、`expectedText`、`createdAt`。
  - `image`：JPEG 文件。
- 成功响应：`{"taskId":"remote-task-id"}`。
- 同一 `Idempotency-Key` 重试必须返回同一逻辑任务，不得重复写入练习或问题字记录。

## 获取结果

- `GET /v1/assessments/{taskId}/results`
- 成功响应：`{"results":[CharacterResult...]}`。
- `CharacterResult` 结构以 `assessment-result.schema.json` 为准。

## 取消与反馈

- `POST /v1/assessments/{taskId}/cancel`：服务端幂等取消。
- `POST /v1/assessments/{taskId}/feedback`：JSON 字段 `characterIndex`、`reason`；成功返回新评测 `taskId`。
- 反馈触发重新评测，不覆盖原始结果。

## 错误与重试

- `408`、`429` 和 `5xx` 可在同一幂等标识下有界重试。
- 其他 `4xx` 不自动重试。
- 客户端超时或进程终止后，从本地 `AssessmentTask` 恢复，不创建新的本地任务 ID。
- 响应不得包含模型密钥、供应商凭据或内部提示词。
