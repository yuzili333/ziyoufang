# E04 OCR 与模型 Provider 适配基础验证

## 结论

- 日期：2026-08-11
- 状态：`verified-local-mocked`
- 网络调用：未发生；全部使用本地模拟 HTTP 响应。
- 结论：OCR 与模型供应商边界已经可测试、可替换且默认关闭，但真实 POC、准确率、成本和投产供应商选择均未完成。

## 官方契约复核

| 能力 | 2026-08 官方契约 | 处理决定 |
| --- | --- | --- |
| 手写 OCR | [`GeneralHandwritingOCR`](https://cloud.tencent.com/document/product/866/36212)，Action 固定、API `2018-11-19`、支持 `only_hw` 与单字四点坐标 | 按 TC3 签名实现；官方已标记旧版，仅作为 POC 候选 |
| 混元视觉 | [OpenAI 兼容接口](https://cloud.tencent.com/document/product/1729/111007)，Bearer API Key、`/v1/chat/completions`、视觉模型支持 Base64 Data URL | 端点/模型/价格配置化；关注 TokenHub 迁移公告 |

## 已验证行为

| 行为 | 证据 |
| --- | --- |
| 默认关闭，不意外联网 | disabled Provider 测试确认 fetch 未调用；服务入口仍拒绝非 fixture |
| OCR 请求正确签名 | TC3 Credential Scope、Payload 绑定、Action、Version、Region 与临时 Token 测试 |
| OCR 业务归一化 | 行/字置信度、像素到 `0–1` 坐标、角度和 RequestId HMAC 测试 |
| OCR 有界重试 | 供应商限流错误最多重试两次；成本/请求次数按尝试计数 |
| 模型输入最小化 | 每批最多 8 字，只含两张单字图、目标字、前三 OCR 候选、问题代码和数值特征 |
| 模型不得改结论 | 输出字序一一对应、问题代码集合必须完全一致、禁止额外字段 |
| 输出安全 | JSON、数组数、文本长度、置信度、重复字序和 32KB 总大小均有边界 |
| 失败降级 | 非法 JSON 只重试一次；可重试不可用错误转规则模板，非法输入/配置不被掩盖 |
| 通用网络边界 | 5xx 重试、4xx 不重试、Abort 转安全超时码，响应详情不进入异常消息 |

## 未完成与门禁

- `poc-evaluation-plan.json` 尚未批准，真实网络调用继续禁止。
- 未使用授权验证集，不能报告切格召回率、OCR 准确率、错字精确率/召回率或建议可执行性。
- 尚未接入图片质量、切格、字符对齐、确定性五维评分和标准字渲染的端到端 Pipeline Provider。
- OCR 单字坐标与文本顺序映射、行置信度继承到单字等假设必须在真实 POC 中验证并标注置信度来源。
- 手写 OCR 已为官方旧版候选，必须以同一评测集验证替代方案；混元端点迁移也需重新回归。
- 凭据、真实定价和 Provider trace 哈希密钥尚未注入；仓库中不得保存任何真实值。
