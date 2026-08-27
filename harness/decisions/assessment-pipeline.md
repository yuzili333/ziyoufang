# ADR-002：智能书写评测流水线与供应商适配

## 决策信息

- 记录编号：`ADR-002`
- 日期：2026-08-11
- 状态：`accepted`
- 决策：采用“OCR + 确定性图像算法 + 多模态大模型解释”的组合
- 默认供应商：腾讯云 OCR 与腾讯混元；均须通过适配层调用并允许替换
- 标准参考字形：Adobe 思源宋体简体中文 Regular `2.003R`，`OFL-1.1`，仅部署于阿里云 ECS 私有评测容器
- 实施门禁：`mobile-v2` 原型评审批准后才创建服务源码

## 责任边界

| 能力 | 决策责任 | 禁止行为 |
| --- | --- | --- |
| 识别 | 图像质量、方格切分、OCR、目标文本对齐 | 不以大模型自由文本作为唯一识别结果 |
| 纠错 | 两次 OCR 一致性、目标字比对和结构证据 | 不在证据不足时强行判错 |
| 纠偏 | 标准字版本、确定性差异特征、版本化评分 | 不以单一像素相似度评价书写优劣 |
| 建议 | 大模型解释已有证据并生成低龄学生可执行步骤 | 不允许模型覆盖识别字、分类、分数或原始证据 |

## 处理流水线

1. **接收任务**：验证主体、授权、文件归属、幂等键和取消状态。
2. **质量检查**：处理 EXIF、旋转、模糊、过暗、过曝、反光、裁切和透视；不可处理时返回重拍原因。
3. **方格切分**：定位练字本、校正透视、按阅读顺序生成单字区域；无法可靠切分的区域标记不确定。
4. **整页 OCR**：默认调用腾讯云 `GeneralHandwritingOCR`，`Scene=only_hw`、`EnableWordPolygon=true`；业务只接收归一化结果。
5. **二次识别**：将字符中心点唯一对齐到方格；对页级缺失、同格冲突、置信度低于 `0.90` 或疑似非目标字的单格再次 OCR，最多 32 格一批；整页高置信目标字不重复调用。疑似错字仍须两份高置信一致证据。
6. **目标对齐**：使用目标练习文本按字符序列对齐，识别缺字、多字、顺序冲突和无法确认。
7. **纠错判定**：两次 OCR 均为同一非目标字且归一化置信度均不低于 POC 高阈值 `0.90` 时，才形成稳定错字；低于 `0.60` 或两次冲突时为不确定。生产阈值由授权样本校准后配置。
8. **纠偏计算**：渲染版本固定且许可明确的思源宋体参考字形，统一二值化、去噪、居中、缩放和骨架，计算重心、占格、象限墨迹、部件间距、轮廓及骨架差异。
9. **版本化评分**：输出总分、笔画规范、间架结构、字形比例、位置布局、问题代码、差异标注和评分版本；静态照片不推断未经证实的实际笔顺。
10. **建议生成**：只将问题字和不确定字分批提交给多模态模型，每批最多 8 字；输入为裁剪图、标准字、目标字、OCR 候选、特征和问题代码。
11. **结果校验**：模型输出必须通过 JSON Schema、目标字一致性和问题代码白名单校验；失败只重试一次，仍失败则使用规则模板。
12. **成长计算**：同一主体、目标字、评分版本和标准字版本积累三次可比结果后，计算稳定性、成长曲线和重点字库状态。
13. **幂等保存**：结果、问题字本、成长曲线和重点字库在同一任务幂等边界内更新，支持部分完成并保留版本信息。

## 稳定接口

```ts
interface OcrProvider {
  recognizePage(input: OcrPageInput): Promise<OcrPageResult>
  recognizeCells(input: OcrCellBatchInput): Promise<OcrCellResult[]>
}

interface OcrCellInput {
  cellId: string
  index: number
  imageBase64: string
  imageWidth: number
  imageHeight: number
  polygon: Point[]
}

interface OcrEvidenceProvider {
  recognizePageWithCells(input: {
    page: OcrPageInput
    cells: OcrCellInput[]
    expectedCharacters: string[]
  }): Promise<OcrCellEvidence[]>
}

interface VisionCorrectionProvider {
  analyzeBatch(input: CorrectionBatchInput): Promise<CorrectionBatchResult>
}

interface GlyphProvider {
  render(character: string, size: { width: number; height: number }): Promise<GlyphReference>
}

interface AssessmentOrchestrator {
  assess(taskId: string): Promise<void>
}

interface CharacterGrowthService {
  update(result: CharacterResult): Promise<CharacterGrowthSummary>
  get(studentId: string, character: string): Promise<CharacterGrowthSummary>
}
```

任务粗粒度状态固定为：`pending_local`、`uploading`、`analyzing`、`completed`、`partially_completed`、`failed`、`cancelled`。

分析阶段固定为：`quality_checking`、`segmenting`、`recognizing`、`comparing`、`generating_advice`、`persisting_result`。

单字分类固定为：`normal`、`wrong`、`needs_correction`、`uncertain`、`failed`。

单次字形评分固定为：`strokeStandard`（笔画规范）、`frameStructure`（间架结构）、`glyphProportion`（字形比例）、`positionLayout`（位置布局）；`stability`（稳定性）由跨练习服务生成。

当前像素特征实现使用标准字与手写字的二值掩码、归一化轮廓、骨架 F1、象限分布、横纵投影、连通部件数量、占格宽高和重心偏移形成四项静态分数。权重与阈值属于合成字形工程基线，必须随 `scoreVersion` 保存；未完成授权样本和专家标注校准前不得作为投产教育评价标准。标准字只能由版本固定且许可证范围获批的 `GlyphProvider` 提供，仓库不得捆绑来源不明字体。

投产候选 `SourceHanSerifGlyphProvider` 使用未修改的 `SourceHanSerifSC-Regular.otf`，字体 SHA-256 为 `78aa7a328fd974df2d688c8a9fd74a33d8334dfa84ab24d9d11efb2ffc464117`，许可证 SHA-256 为 `9ff5bb567e1b92c801fc1069e5fbf992ff8efccacb9db94e5959a5b3ba9bb903`。字形版本固定为 `source-han-serif-sc-regular@2.003R+<font-sha256>+renderer-v1`；服务启动先校验字体与许可证哈希，缺失、漂移或注册失败时拒绝就绪。字体文件仅进入私有仓库、CI 制品和阿里云 ECS 私有评测容器，对外只提供渲染 PNG，不提供字体下载、路径或二进制。

ECS 私有评测容器运行基线为 Node.js 20、Express `5.2.1`、`@napi-rs/canvas` `1.0.2` 与 `node:20-bookworm-slim`。`GET /health` 无需业务签名且只返回就绪状态，其余评测与指标接口继续使用 HMAC/Nonce 契约。`font-smoke` 仅用于在生产规格容器中验证许可证资产和字体加载，明确拒绝创建评测任务，不代表真实 OCR、评分或模型门禁已经解锁。

## 稳定性、成长曲线与重点字库

- 可比样本必须具有有效总分、相同目标字、相同评分版本和相同标准字版本；不确定、失败和取消结果排除。
- 少于三次可比样本时 `stability=null`，只返回 `requiredPracticeCount`，不输出趋势判断。
- POC 取最近三次可比总分：`stability = round(clamp(100 - 2 × sampleStdDev - 6.5 × max(0, 第一次分数 - 第三次分数), 0, 100))`；波动和持续下降会降低稳定性，绝对低分由最近三次均分独立监测。
- 最近三次均分或稳定性低于 `monitorEnterThreshold` 时进入重点字库，POC 默认 `70`。
- 最新连续三次总分、近三次均分和稳定性均不低于 `monitorExitThreshold` 时退出重点状态，POC 默认 `80`。
- 阈值、公式、评分和字形版本必须随监测决定保存；生产参数由授权样本校准，禁止把 POC 默认值直接当作教育评价标准。
- 评分或字形版本变化时建立新的曲线分段，旧点只展示、不参与新分段计算。

## 模型输出约束

大模型返回对象只允许包含：

- `characterIndex`
- `issueCodes`
- `observations`
- `correctionSteps`（最多 3 条）
- `confidence`
- `needsRetry`

提示词要求模型只解释所给证据、禁止猜测未提供笔画信息、禁止输出学习能力或人格评价，并使用学生可理解的短句。模型、提示词、评分、标准字和供应商版本随结果保存。

## 可靠性与成本默认值

- OCR 超时 10 秒；只对超时、`429` 和 `5xx` 最多重试 2 次。
- 大模型超时 30 秒；只重试 1 次；单任务并发最多 2 批。
- 模型只处理问题/不确定单格，正常单格不调用。
- 缓存键包含图片哈希、目标文本、OCR/评分/字形/提示词/模型版本。
- OCR 不可用时任务可重试；模型不可用时返回确定性结果和模板建议；单格失败时允许 `partially_completed`。
- 不在日志记录原图、完整私有地址、完整提示内容或未成年人敏感评价。
- Worker只向评测服务发送最小任务字段和每次认领后新换取的短时OSS HTTPS媒体授权；OSS对象引用与私有上传路径不跨服务。评测服务以一次性内存能力交给下载器，完成、失败或取消后清除，并在解码前执行主机白名单、禁止重定向、大小上限和SHA-256校验。

## E09 度量与防滥用基线

- 评测服务只接受固定事件类型与字段白名单；字段名疑似包含图片、路径、提示词、密钥、令牌、微信身份或完整评测内容时直接拒绝记录。
- 任务标识使用独立服务端密钥进行 HMAC-SHA256 后才进入遥测事件；指标快照不返回逐任务事件。
- 指标快照包含事件/状态/安全错误计数、Provider 调用 P50/P95 与错误率、缓存命中率，以及按 Provider 拆分的微单位成本；合成 Provider 的零成本仅为测试值，不代表投产成本。
- `/internal/metrics` 与评测接口共用请求签名、时间窗和 Nonce 防重放校验，不作为公开小程序接口。
- BFF 在幂等查询之后执行按主体、策略版本和滑动窗口计数的任务配额；重复幂等请求不重复占用额度，生产环境禁止使用草案配额版本。
- 当前内存事件与配额实现仅用于本地基础验证；生产模式明确拒绝内存配额。部署前必须接入可横向扩展的持久指标/分布式配额存储，批准告警阈值，并通过真实 Provider 与负载测试。

## POC 与生产门禁

- 只使用合成、脱敏或取得有效授权的样本。
- 评测方格切分召回率、单字 OCR 准确率、错字精确率/召回率、纠偏人工一致性、建议可执行性、P95 时延和单次成本。
- 阈值必须由业务、算法和测试基于样本共同批准；不得把 POC 初始阈值直接视为生产标准。
- 供应商、模型、提示词、字形或评分算法升级均须执行固定样本回归并灰度发布。

## 2026-08 Provider 契约复核

- 腾讯云当前官方文档仍提供 `GeneralHandwritingOCR`（API `2018-11-19`）、`only_hw` 和 `EnableWordPolygon`，但已明确将其标为旧版本服务。因此它只保留为 POC 候选，不得未经同一授权评测集比较就固化为生产唯一方案。
- 混元 OpenAI 兼容接口当前地址为 `https://api.hunyuan.cloud.tencent.com/v1/chat/completions`，使用 Bearer API Key 并支持视觉模型的图片链接或 Base64 Data URL；官方同时提示能力逐步迁往 TokenHub，端点与模型都必须配置化并执行迁移回归。
- 本地实现仅用模拟 HTTP 响应验证供应商契约，两个网络 Provider 默认 `enabled=false`；服务入口只允许 `fixture` 与 `synthetic-pipeline` 两个合成模式，不代表 POC 已解锁或真实供应商已经验收。
- 本地 `synthetic-pipeline` 模式会真实解码批准的 RGBA PNG，从像素计算拉普拉斯方差、宽高完整性和红色方格投影，再使用受控的合成双次 OCR 证据继续纠错、纠偏和建议；它不读取预制结果 JSON。
- 切格后会从页图生成有界单字 PNG：最长边 1024px、单格 2MB、任务临时总量 24MB；OCR 每批最多 32 格，模型建议每批最多 8 字。裁剪图只在 Provider 调用期间存在，不进入结果或遥测。
- 合成像素算法只证明编排、证据流和失败边界可执行。红格颜色、正方形纸张、4×4 行列和阈值都是夹具配置，不得外推为通用练字本算法或生产准确率。
- OCR 请求只发送图片 Base64，不使用长期公开 URL；供应商 `RequestId` 只以独立密钥 HMAC 后返回。混元输入最多 8 字，只包含裁剪图、标准字、OCR 候选、确定性数值特征和问题代码。
- 模型返回必须与输入字序一一对应，问题代码集合完全一致，且通过数量、文本长度、置信度、额外字段和 JSON 结构校验；非法输出最多重试一次，再降级为版本化规则模板。
