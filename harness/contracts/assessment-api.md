# 微信小程序与智能评测接口草案 V2

本契约是小程序、云函数/BFF 与独立评测服务的实现基线。合成数据范围内的授权、上传、异步任务、像素质量检查、固定 4×4 切格、结果、字本和成长接口已经实现；真实 OCR、通用图像算法和模型 Provider 仍受 POC 门禁阻塞。小程序只调用云函数/BFF。

## 通用规则

- 所有任务使用客户端生成的 `localTaskId` 和稳定 `idempotencyKey`。
- 云函数从微信运行环境获取主体身份，禁止信任客户端自报 `openid`。
- 文件必须属于当前主体且处于私有存储；客户端不得向评测服务传长期公开 URL。
- 时间使用 ISO 8601 UTC；坐标使用相对原图的 `0–1` 比例。
- 取消、反馈、删除和分享撤回必须幂等。
- 任务状态和合法迁移以 [`assessment-task-state-machine.json`](./assessment-task-state-machine.json) 为唯一契约；当前名称固定为 `pending_local`，不得沿用遗留 ArkUI-X 的 `local_pending`。

## 任务状态与检查点

- `pending_local` 仅由小程序持有；网络恢复后以原 `localTaskId` 和 `idempotencyKey` 进入 `uploading`。
- BFF 完成文件归属、哈希和幂等绑定后，`uploading` 进入 `analyzing` 并固定服务端 `taskId`。
- `analyzing` 只允许结束为 `completed`、`partially_completed`、`failed` 或在结果持久化提交前变为 `cancelled`。
- 上传前失败从 `failed` 重试到 `uploading`；服务端已接单后的可重试失败回到 `analyzing`。两者均复用原幂等键，不创建新的逻辑任务。
- `completed`、`partially_completed` 和 `cancelled` 为终态；`failed` 仅在 `retryable=true` 时允许按检查点重试。
- `progressStage` 只在 `analyzing` 中推进；无问题字或策略关闭模型时可从 `comparing` 跳过 `generating_advice`，模型失败则使用模板建议继续到 `persisting_result`。
- 结果、单字和字本写入分别使用契约中的唯一键提交一次；学生反馈重新评测属于关联的新任务，不属于原任务重试。

## 小程序调用云函数

### `createUploadTask`

输入：`localTaskId`、`idempotencyKey`、`expectedText`、`consentVersion`。

输出：`taskId`、`privateUploadPath`、`uploadPolicy.allowedExtensions/maxBytes/expiresAt`。

行为：验证授权状态，重复调用返回同一逻辑任务；不接收客户端传入的微信主体标识。

### `submitAssessment`

输入：`taskId`、`cloudFileId`、`imageSha256`；目标文字和客户端创建时间沿用已绑定任务，不能在提交阶段替换。

输出：任务粗粒度状态和 `progressStage`。

行为：校验有效授权、上传票据期限、文件路径归属和哈希后异步提交评测；BFF 不在一次云函数调用内长轮询。远端结果在 `getAssessment` 时同步并幂等持久化。

### `retryAssessment`

输入：`taskId`。

输出：复用原任务的 `analyzing` 状态和当前检查点。

行为：仅允许 `failed && retryable=true` 且已保存云文件/摘要的任务重试；复用原 `taskId`、幂等键和上传检查点，并递增重试次数。授权已撤回时拒绝重试。

### `getAssessment`

输入：`taskId`、可选 `resultVersion`。

输出：符合 [`assessment-result.schema.json`](./assessment-result.schema.json) 的任务结果。

行为：本地任务仍在分析时向评测服务读取一次当前状态；终态结果只提交一次，非终态只更新 `progressStage`。

### `getConsentStatus` / `recordConsent` / `withdrawConsent`

- 状态查询只返回当前主体、当前用途和当前授权版本的有效状态。
- 记录授权要求“已阅读”和“监护人确认”两个独立事实；微信身份不自动等同于监护人法律身份。
- 撤回采用追加记录并立即阻止新建、提交和重试图片处理；既有数据删除由独立删除作业处理。
- 生产环境必须配置经合规批准的授权版本，禁止使用带 `draft` 标识的研发版本。

### `getWordbook`

输入：`all`、`wrong`、`correction` 或 `monitoring` 筛选。

输出：当前主体的问题字聚合、最近分数、练习次数、稳定性、重点原因和成长样本缺口。

### `getCharacterGrowth`

输入：目标字、可选评分版本分段。

输出：符合 [`character-growth.schema.json`](./character-growth.schema.json) 的可比练习次数、五维成长曲线、最近三次均分、稳定性和重点字库状态；不足三次时只返回样本积累进度。

### `cancelAssessment`

输入：`taskId`。

输出：最终取消状态；已完成任务不回退状态。

### `submitStudentFeedback`

输入：`taskId`、`characterIndex`、原因代码、可选补充文本。

输出：`feedbackId`、原任务/结果版本和 `reassessmentTaskId`；不得覆盖原结果。

行为：按主体和 `feedbackIdempotencyKey` 提交一次；只允许引用当前主体已完成/部分完成的单字结果。新任务复用原私有图片、摘要、目标文字和授权用途，记录 `reassessmentOfTaskId` 与原因，再按异步进度链路执行。`getFeedbackRecords` 返回原结果与新结果的可追溯关系。

### `deletePractice`

输入：练习 ID、删除确认版本。

输出：持久化删除作业及图片、任务、单字结果、字本/成长、反馈和分享卡各自的 `objectResults`。

行为：要求版本化删除影响确认，按主体和 `requestId` 幂等。先处理私有云文件；失败时保留业务记录并将作业标记为失败。成功后删除原任务及关联重新评测，移除相关反馈和分享卡，并按剩余有效练习重建字本、成长分段和重点状态。删除作业和最小审计事件按待批准策略隔离保留。

### `createShareCard` / `revokeShareCard`

创建输入：练习 ID、监护人再次确认记录、分享内容版本。

创建输出：脱敏预览和受控分享标识；不得返回私有图片路径。

撤回输入：分享标识；输出不可访问状态。

行为：分享确认使用独立 `shareConsentVersion`，不得复用首次图片处理确认。存储只包含令牌哈希和目标字、分类、分数、单条建议等脱敏载荷；原始令牌由服务端密钥确定性派生，仅在受控分享路径中使用。`getSharedCard` 只凭令牌哈希读取有效载荷，撤销、过期或练习删除后统一返回不可用。

### 重点字库更新

评测结果持久化时由 BFF 幂等更新，不由客户端直接写入。达到三次可比练习后，最近三次均分或稳定性低于 POC 入库阈值 `70` 时进入；满足 POC 退出阈值 `80` 的连续达标规则时退出。阈值与公式通过版本化服务端配置提供。

## BFF 调用评测服务

### `POST /v1/assessments`

请求头：

- `Idempotency-Key`
- `X-Task-Id`
- `X-Request-Timestamp`
- `X-Request-Nonce`
- `X-Signature`

请求体只传最小任务字段和短期媒体访问授权。BFF 在每次开始或重试前换取最长 10 分钟的 HTTPS 授权；`cloudFileId`、私有上传路径、微信授权版本和上传票据不得跨入评测服务。评测服务校验授权剩余时间与主机白名单，只在当前处理进程内持有 URL，并在完成、失败或取消后清除。

成功返回 `202`：`taskId`、`status=analyzing`、`progressStage=quality_checking`。

### `GET /v1/assessments/{taskId}`

返回任务状态、当前阶段、进度摘要、可用的部分结果、重试属性和错误代码。

### `POST /v1/assessments/{taskId}/cancel`

幂等取消尚未进入不可取消提交点的任务；已经完成时返回当前完成状态。

### `POST /v1/assessments/{taskId}/feedback`

接收服务端校验后的单字反馈，生成关联的新评测版本，不修改旧结果。

## 错误与重试

| 错误类别 | 是否重试 | 客户端/原型表现 |
| --- | --- | --- |
| 授权失效、文件越权、无效参数 | 否 | 返回对应页面修正或重新授权 |
| 网络超时、`429`、`5xx` | 有界重试 | 保留原任务和幂等键 |
| OCR 不可用 | 是 | 任务失败且可重试，不生成字本结论 |
| OCR 单格响应数量或身份错位 | 是 | 拒绝本批结果，保留原任务检查点重试 |
| 模型不可用/非法 JSON | 降级 | 保留识别、差异和评分，使用模板建议 |
| 单格处理失败 | 不重试整页 | 返回 `partially_completed` 和单格 `failed` |
| 图片不可评测 | 否 | 返回质量原因和重拍建议 |
| 单字坐标越界、裁剪为空或视觉证据超限 | 否 | 不调用 OCR/模型，返回重新拍摄或受控错误 |

## 安全边界

- 服务间签名覆盖方法、路径、时间戳、随机数和请求体哈希，并拒绝超时与重放。
- 私有媒体下载要求 HTTPS 精确主机白名单、禁止重定向、有界超时/字节流和 SHA-256 复核；临时 URL 不写任务仓库、不返回客户端、不进入日志或遥测。
- OCR/模型密钥只能在评测服务端密钥管理中读取。
- 模型提示中不包含真实姓名、微信标识或不必要的整页图片。
- OCR 只接收当前单格 PNG；建议层只接收问题字的裁剪图、经许可的标准字、至多三个 OCR 候选和有限确定性特征。临时 Base64 不持久化。
- 页级 OCR 字符只按多边形中心点唯一落格；页级缺失、同格冲突、低置信或疑似错字才调用单格复识。错字必须至少两份高置信一致证据，单份非目标结果只能标记不确定。
- 四项静态评分必须由版本化字形特征 Provider 生成。标准字版本必须与已批准 `GlyphProvider` 一致；掩码、骨架、投影、象限和重心等底层特征只允许在评测与建议调用期间存在，不进入对外结果。
- `stability` 只能由同一目标字、评分版本和标准字版本的至少三次可比练习形成，单次评测必须返回 `null`，不得由图片特征 Provider 代填。
- 接口日志只记录任务、阶段、错误类别、供应商请求 ID 和脱敏性能指标。

## 持久化边界

- 云数据库集合、主体隔离、唯一索引、媒体 TTL、删除覆盖和禁止字段以 [`cloud-data-model.json`](./cloud-data-model.json) 为唯一模型。
- 小程序不直写云数据库；所有读写由从微信运行环境确定 `subjectId` 的 BFF 执行，不接受客户端自报 `openid`。
- `assessment_tasks` 以主体和幂等键唯一，`character_results` 以任务/结果版本/字序唯一，`wordbook_entries` 以主体/目标字唯一，成长曲线按评分与标准字版本分段。
- 结果终态只能在单字结果和派生字本/成长写入按唯一键提交后持久化；不确定和失败单字不进入字本或成长点。
- 原图、裁剪图和差异图只保存私有对象引用与哈希，默认原型 TTL 为 30 天但仍受合规批准；分享卡只保存脱敏载荷和令牌哈希。
- 删除作业必须覆盖媒体、任务、单字结果、字本、成长、重点监测事件、反馈和分享卡，并记录逐对象处理结果。
