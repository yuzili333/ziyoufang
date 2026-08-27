# 思源宋体许可证与阿里云 ECS 私有容器基础验证

## 结论

- 状态：`verified-local-licensed-glyph`
- 字体：Adobe 思源宋体简体中文 Regular `2.003R`
- 许可证：SIL Open Font License 1.1（`OFL-1.1`）
- 部署范围：私有代码仓库、CI 测试制品、阿里云 ECS 私有 Express 智能评测服务容器
- 字体修改：无；未裁剪、未转换格式、未修改字形
- 产品口径：思源宋体参考字形/标准参考字形，不宣称等同于国家规范字或规范笔顺数据

## 固定证据

| 资源 | SHA-256 |
| --- | --- |
| 官方发行包 `09_SourceHanSerifSC.zip` | `8f633642eedf9bf23ab3336faa3d03ce1b56c14d654cd25752bc829c05f79f0d` |
| `SourceHanSerifSC-Regular.otf` | `78aa7a328fd974df2d688c8a9fd74a33d8334dfa84ab24d9d11efb2ffc464117` |
| 官方 `LICENSE.txt` | `9ff5bb567e1b92c801fc1069e5fbf992ff8efccacb9db94e5959a5b3ba9bb903` |

官方来源：<https://github.com/adobe-fonts/source-han-serif/releases/tag/2.003R>。机器可读台账与完整许可证位于 `assessment-service/assets/fonts/source-han-serif-sc-2.003R/`，第三方声明位于 `assessment-service/THIRD_PARTY_NOTICES.md`。

## 工程边界

1. `SourceHanSerifGlyphProvider` 在启动时校验字体和许可证哈希，使用 `@napi-rs/canvas` 显式注册未修改 OTF，并输出黑字白底 PNG。
2. 字形版本包含上游发行版、完整字体哈希和渲染器版本；任一变化必须形成新的成长曲线分段。
3. 渲染缓存以“字＋尺寸”为键，并发相同请求复用同一结果；尺寸限制为 `16–1024px`。
4. 小程序、公开 CDN、公共字体下载接口、OCR 和多模态模型均不得接收字体二进制；模型只能接收业务必需的渲染 PNG。
5. Express 服务保留现有 HMAC REST 契约，新增无签名 `GET /health`，绑定 `0.0.0.0:${PORT:-8080}`。
6. 当前 `font-smoke` ECS 模式只验证字体就绪并拒绝评测任务，不绕过真实 Provider、授权样本、隐私或发布门禁。

## 已验证场景

- 字体、许可证缺失或哈希漂移时关闭失败。
- 非 MVP 汉字、无效尺寸拒绝渲染。
- 固定汉字“永、月、木”在固定尺寸输出固定 PNG 哈希。
- 多尺寸、并发与缓存行为一致，输出包含字形版本且不包含字体路径。
- 健康检查无需业务签名，指标与评测接口仍受签名保护。
- 字体资产不进入小程序目录或公开资源目录。

## 剩余门禁

- 生产发布前由合规责任人在资源许可证台账签署；范围扩大或字体修改必须重新评审。
- 微信云环境需完成容器构建、启动、健康检查、横向扩容和固定字形像素回归。
- 真实 OCR、授权练字样本、专家评分校准和多模态模型 POC 仍独立阻塞。
