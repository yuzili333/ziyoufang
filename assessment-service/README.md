# 智能评测服务

独立服务边界已经建立，纵向切片支持 `fixture` 和 `synthetic-pipeline` 两种非生产模式。后者校验批准夹具哈希，通过文件签名有界解码 RGBA PNG/JPEG、处理 JPEG EXIF 方向，再从像素执行质量检查和固定 4×4 红格切分，并以受控双次 OCR 证据验证纠错、纠偏、建议、部分完成和版本字段。真实 OCR、通用图像算法及多模态模型 Provider 在 POC 输入门禁通过前不会启用。

统一图片入口限制 15MB 和 2000 万像素，只接受 PNG/JPEG；空文件、损坏内容、未知格式和超限图片均返回不可重试的稳定输入错误。JPEG 当前使用锁定的纯 JavaScript 解码依赖，真实负载后仍需评估工作线程或独立图像处理服务。

真实媒体边界使用 BFF 每次新换取的短时 HTTPS 授权。编排器不会持久化 URL、微信云文件 ID 或上传路径；`PrivateHttpMediaLoader` 要求生产配置精确主机白名单，禁止重定向，并在有界流式下载后复核 SHA-256。当前该链路只经过模拟云接口/HTTP 测试，真实微信云环境仍受部署门禁约束。

切格后会生成临时的真实单字 PNG：默认去除 2% 网格边缘，最长边限制为 1024px，OCR 每批不超过 32 格。问题字的裁剪图、OCR 候选和确定性特征按最多 8 字交给建议层；视觉模型还必须取得版本一致、许可证已批准的标准字引用。视觉证据不会写入结果或遥测，缺少标准字时组合 Provider 使用规则模板降级。

`PageFirstOcrEvidenceProvider` 将页级字符坐标映射到方格。高置信目标字不重复调用；缺失、冲突、低于 0.90 或疑似错字的方格使用单字 PNG 复识。疑似错字只有两份高置信结果一致时才可判错；响应数量或 `cellId` 错位会整批拒绝。正式四维分数仍必须来自独立特征 Provider，OCR 适配器不会生成虚假评分。

`PixelGlyphFeatureProvider` 已实现四项静态评分的本地工程基础：标准字与手写字经过二值化和包围盒归一化后，使用掩码交并比、骨架 F1、墨迹比例、象限/投影分布、连通部件、宽高占格和重心偏移形成笔画规范、间架结构、字形比例、位置布局。它强制依赖外部版本化 `GlyphProvider`，仓库不内置未授权字体；当前仅通过合成几何字形回归，参数未经授权样本与专家标定。稳定性仍由成长服务在至少三次同版本可比练习后计算。

```bash
ASSESSMENT_PROVIDER_MODE=fixture BFF_HMAC_SECRET=local-only-secret npm start
```

执行像素级合成流水线可将模式改为 `synthetic-pipeline`。两种模式在 `NODE_ENV=production` 下都会被拒绝。

服务端不得接收微信 `openid`、真实姓名或长期公开图片 URL。

已提供但默认禁用的 Provider 基础：

- `TencentCloudHandwritingOcrProvider`：TC3-HMAC-SHA256、`GeneralHandwritingOCR@2018-11-19`、整页/单格入口、相对坐标与置信度归一化、最多三次 HTTP/API 限流重试。
- `HunyuanVisionCorrectionProvider`：OpenAI 兼容视觉请求、每批最多 8 字、问题代码不可改写、严格 JSON 和一次总重试预算。
- `FallbackVisionCorrectionProvider`：模型不可用或非法输出时返回版本化规则模板，不覆盖确定性识别、分类和评分。

这些适配器目前只经过模拟 HTTP 测试，服务入口继续拒绝非 fixture 模式。腾讯云官方已将 `GeneralHandwritingOCR` 标为旧版服务，真实 POC 必须同时完成供应商复选；不得仅因适配代码存在就视为投产选型确认。

本地基础实现会把任务标识 HMAC 后写入白名单遥测，并通过同一套 HMAC 与 Nonce 防重放校验开放 `GET /internal/metrics`。快照包含状态/错误计数、Provider 调用 P50/P95、错误率、缓存命中率和微单位成本拆分；fixture 的零成本不代表生产估算。生产部署还需要持久指标后端、告警目标和 `TELEMETRY_HASH_SECRET`。
