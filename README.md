# 字有方（ZiYouFang）

> 汉字有形，习字有方。

项目当前处于 **微信小程序实现与验证阶段**。`mobile-v2` 六方原型评审已经批准，正式工程采用“微信原生小程序 TypeScript + 阿里云 ECS BFF/Worker + MySQL + 私有 OSS + 独立智能评测容器”。当前纵向切片只使用批准的合成 fixture，不调用真实 OCR、模型或学生数据；授权页面也明确使用不可投产的草案版本。

## 当前仓库内容

- [`hanzi.md`](./hanzi.md)：原始产品说明和当前技术方向。
- [`harness/`](./harness/)：MVP、场景、技术决策、评测流水线、原型规格、状态矩阵、追踪表和门禁校验。
- [`prototype/mobile-v2/`](./prototype/mobile-v2/)：已完成浏览器交互与视觉 QA 的可点击手机原型，以及后续 PAD 主从布局设计板；仅使用固定模拟数据。
- [`miniprogram/`](./miniprogram/)：微信原生 TypeScript 客户端，包含授权、拍照确认、离线、异步进度、结果、反馈、字本、成长、删除和受控分享页面。
- [`cloudfunctions/assessmentBff/`](./cloudfunctions/assessmentBff/)：微信身份边界、授权记录、私有任务、幂等、评测调用、字本与成长聚合。
- [`ecs-service/`](./ecs-service/)：生产 ECS API、微信登录会话、MySQL仓储/任务租约、OSS媒体与清理 Worker；旧云函数目录只作为14天回滚实现保留。
- [`deployment/aliyun/`](./deployment/aliyun/)：主机 Nginx 路径共存、API/Worker/评测容器、迁移、备份和人工批准发布入口；容器 edge 仅作独立域名回退。
- [`assessment-service/`](./assessment-service/)：独立评测服务；当前开放预制 fixture 和真实读取批准 PNG 的 `synthetic-pipeline` 两种非生产模式。
- [`packages/contracts/`](./packages/contracts/)：从 Harness 机械同步的正式工程共享契约和测试样例。

## 当前门禁

1. 微信小程序与智能评测流水线技术决策已经接受。
2. `mobile-v2` 功能规格、状态矩阵和追踪表已建立。
3. 第二套“单字叠映主视图”已选定，并补充五维评价、成长曲线和重点字库视觉稿。
4. P-00 至 P-11 的核心成功、异常、离线、反馈、删除、分享和重点监测路径已经形成可点击原型，结果页视觉 QA 已通过。
5. 六方联合评审已批准，机器检查返回 `ready_for_implementation_transition`，正式研发工程和合成纵向切片已创建。
6. 少于三次不生成稳定性；三次起按评分/标准字版本形成成长曲线，并按版本化 `70/80` POC 规则进入或退出重点监测。
7. 服务端强制检查监护人确认记录；撤回后阻止新上传，生产环境拒绝使用草案授权版本。
8. 学生可针对单字提交结果反馈；原结果不可变，新评测任务和版本关系可追溯。
9. 删除作业覆盖关联版本、反馈、分享和成长重算；分享卡使用独立监护人确认、脱敏载荷、哈希令牌和即时撤销。
10. 服务端已建立白名单遥测、任务标识哈希、签名防重放指标、按主体配额和 Provider 成本/P95 快照；当前仅是本地合成基础，不代表真实投产指标。
11. 已实现默认禁用的腾讯云手写 OCR、混元视觉模型和规则模板适配基础；只使用模拟响应验证签名、映射、严格 JSON 与降级，不产生真实供应商调用。
12. 正式小程序代码已落实 600/840px 断点；扩展窗口使用侧边导航、竖向单字列表以及“对比工作区＋五维/成长/建议”洞察双栏。
13. 合成纵向切片现已真实解码批准 PNG，从像素完成质量检查和 4×4 切格，再生成 16 字五类结果；模糊、裁切、部分失败、取消竞争及“重试/重拍”分流均有回归。
14. 正式结果页已将任务与小程序沙箱照片绑定，使用服务端单字 `polygon` 裁剪真实手写区域，并提供朱红标准字叠加和手写/标准并排视图；重新评测、30 天到期和删除清理保持同一媒体生命周期。
15. 手机图片入口不再强制伪装为 `.jpg`：客户端保留 JPG/PNG 类型，服务端按文件签名有界解码 PNG/JPEG、应用 EXIF 方向，并对空文件、损坏文件、未知格式、15MB 和 2000 万像素上限提供不可重试指导。
16. BFF 已为独立评测服务建立短时私有媒体授权：云文件 ID 和上传路径不跨服务，临时 URL 不持久化；下载端采用 HTTPS 主机白名单、禁止重定向、有界流和摘要复核。
17. 切格坐标已形成真实单字 PNG：OCR 最多 32 格一批，建议最多 8 个问题字一批；裁剪图、标准字引用、OCR 候选和确定性特征只在 Provider 调用期间存在，不进入结果或遥测。
18. 页级 OCR 结果已能按坐标唯一落格；缺失、冲突、低置信和疑似错字按需单格复识，单份非目标结果不会被判为错字。
19. 已建立依赖外部版本化标准字的四维像素特征引擎，用二值掩码、骨架、轮廓、分布、占格和重心形成笔画规范、间架结构、字形比例、位置布局的合成工程证据；稳定性仍只由至少三次同版本练习生成。
20. 合成纵向切片已实际串联“页级 OCR 坐标—单格复识—版本化合成字形引用—像素四维评分—BFF 聚合”，不再用预填四维分数掩盖装配缺口；该切片仅用于非发布回归。
21. 思源宋体 2.003R/OFL-1.1 字形资产、哈希校验、ECS 私有 Express 容器和真实 `GlyphProvider` 已建立；真实 OCR/模型 POC、真实学生数据、生产合规台账、评分专家校准、ECS/MySQL/OSS真实环境、开发者工具视觉验收、持久指标、三端真机和发布仍由独立门禁阻塞。
22. 备案根域 `https://lilicoconut.me` 已登记为小程序 API 基址，主机 Nginx 只接管 `/api/v1/*`；成都私有 OSS 的公网直传/访问域名也已登记，真实 DNS、证书、微信后台和 ECS 发布验证仍保持外部门禁。

联合评审可直接使用 [`mobile-v2-joint-review-packet.md`](./harness/reviews/mobile-v2-joint-review-packet.md)。评审通过后的执行顺序已固化在 [`miniprogram-mvp-backlog.md`](./harness/requirements/miniprogram-mvp-backlog.md) 和 [`assessment-poc-plan.md`](./harness/validation/assessment-poc-plan.md)，当前研发就绪度见 [`wechat-development-readiness-2026-08-11.md`](./harness/validation/wechat-development-readiness-2026-08-11.md)。

六方结论记录在 [`mobile-v2-review-decision.json`](./harness/reviews/mobile-v2-review-decision.json)，可运行 `node harness/bin/check-development-readiness.mjs --require-ready` 复核。

POC 输入记录在 [`poc-evaluation-plan.json`](./harness/validation/poc-evaluation-plan.json)，`node harness/bin/check-poc-inputs.mjs` 会校验 fixture 哈希、验证集类型、九项指标目标和产品/算法/测试批准状态。

小程序本地队列与服务端异步任务共用 [`assessment-task-state-machine.json`](./harness/contracts/assessment-task-state-machine.json)，明确离线回退、取消检查点、部分完成和幂等重试。

云数据持久化基线见 [`cloud-data-model.json`](./harness/contracts/cloud-data-model.json)，覆盖主体隔离、任务/单字/字本/成长唯一索引、媒体 TTL、分享脱敏和删除范围。

## 校验

```bash
npm install
npm run validate
```

校验包含小程序 TypeScript、契约迁移、ECS BFF/Worker、MySQL/OSS适配、评测服务、HMAC、任务租约、幂等、端到端合成纵向切片和 Harness 门禁。ArkUI-X 遗留工程已在迁移验证后删除。
