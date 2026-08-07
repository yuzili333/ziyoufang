# ADR-001：多端客户端技术选型

## 决策信息

- 记录编号：`ADR-001`
- 日期：2026-08-07
- 状态：`approved`
- 决策范围：MVP 学生端客户端框架、平台基线、客户端依赖和平台能力边界
- 决策确认：产品方已在本次技术选型任务中确认
- 关联原型：移动端设计方案一；原型文件尚未归档，原型评审门禁保持 `pending`

## 决策摘要

字有方客户端采用 **ArkUI-X 6.0.0 Release + ArkTS**。公共业务、页面、导航、状态、网络、本地数据和结果展示以一套 ArkTS 代码实现；相机、相册、权限和必要的图片编码通过统一平台能力接口接入 HarmonyOS、Android 和 iOS 原生实现。

MVP 按手机端交付，首版即使用响应式结构，为后续 PAD 端双栏布局和侧边导航预留能力。三端同步发布，不设置 HarmonyOS 滞后版本。

本记录只批准技术方向，不等同于三端能力验证通过，也不解除研发工程目录门禁。

## 已确认约束

- 目标用户与设备：以小学生手机端使用为主，覆盖 HarmonyOS、Android、iOS，后续扩展 PAD。
- 网络与离线：图片、练习记录和评测结果保存在应用本地；断网可拍摄和保存，联网后提交评测。
- 拍摄形态：应用内引导拍摄，支持方格对齐、拍摄质量提示、重拍及相册导入。
- 图片处理：一张图片可包含多个方格汉字；服务端完成切分、识别、评分、差异计算和建议生成。
- 本地职责：图片压缩、任务状态、失败恢复、结果缓存、单字浏览、对比标注和问题清单展示。
- 隐私与安全：客户端不得包含模型密钥；未成年人图片和学习评价的授权、留存、删除与第三方处理边界仍需合规评审。
- 范围排除：MVP 不包含教师复核、人工审核、周报、月报、季度报、年报和跨设备云同步。
- 团队技术方向：TypeScript / ArkTS。

## 方案比较

| 方案 | 三端覆盖 | 优势 | 主要风险 | 结论 |
| --- | --- | --- | --- | --- |
| ArkUI-X 6.0.0 | 官方覆盖 HarmonyOS、Android、iOS | ArkTS 与团队方向一致；三端共享主业务代码；官方跨端文件、数据、网络和绘图能力覆盖 MVP 基础需求 | 第三方生态小于 Flutter；相机等能力需要原生适配和真机验证 | 采用 |
| Flutter | 官方主线覆盖 Android、iOS；HarmonyOS 依赖社区适配 | UI、移动端和大屏生态成熟 | HarmonyOS 分支与 Flutter 主线版本同步、插件兼容和维护责任存在风险 | 不采用 |
| React Native | Android、iOS 生态成熟；HarmonyOS 依赖 OpenHarmony SIG 适配 | TypeScript/React 人才和包生态较多 | HarmonyOS 适配层、原生模块和主线版本需逐项验证 | 不采用 |

参考资料：

- [ArkUI-X 官方项目](https://gitcode.com/arkui-x)
- [ArkUI-X 6.0.0 Release 发布说明](https://gitcode.com/arkui-x/docs/blob/master/zh-cn/release-notes/ArkUI-X-v6.0.0-release.md)
- [Flutter 官方支持平台](https://docs.flutter.dev/reference/supported-platforms)
- [React Native OpenHarmony 项目](https://gitee.com/openharmony-sig/ohos_react_native/blob/master/README.md)

## 平台与工具链基线

| 平台 | 最低版本 | 原生拍摄与相册能力 | 构建与依赖 |
| --- | --- | --- | --- |
| HarmonyOS | HarmonyOS 6 / API 20 | Camera Kit、PhotoAccessHelper | DevEco Studio、hvigor、ohpm |
| Android | Android 8 / API 26 | CameraX、Android Photo Picker | Android Studio、Gradle |
| iOS | iOS 13 | AVFoundation、PhotosUI | Xcode、系统框架，新增原生包时优先 Swift Package Manager |

- ArkUI-X SDK 固定为 `6.0.0 Release`；升级必须通过三端回归后才能合入。
- 原生依赖仅用于相机、相册、权限和必要图片编码，其他能力优先使用 ArkUI-X 官方 API。
- 所有可锁定依赖必须提交锁定版本；不得使用浮动版本范围作为发布构建依据。

## 客户端架构决策

### 公共能力

- UI 与导航：ArkUI 组件、`Navigation` 和 `NavPathStack`。
- 状态管理：ArkUI 原生状态管理；不引入第三方全局状态框架。
- HTTP：ArkUI-X `net.http`，由公共适配器统一处理超时、取消、重试、上传进度和网络恢复。
- 本地数据：`relationalStore` 保存练习、任务、单字结果和纠错历史；`preferences` 保存轻量设置。
- 文件：`file.fs` 管理应用沙箱内的原图、压缩图、单字裁剪图和缓存。
- 绘图：ArkUI Canvas / ArkUI-X 绘图能力展示边界框、标准字叠加、差异区域和问题标记。
- 图像算法：MVP 客户端不引入 OpenCV、端侧 OCR 或端侧大模型。

### 平台能力边界

业务模块只能依赖以下公共接口，不得直接引用平台 API：

- `CaptureService`：检查/申请权限、开始拍照、相册选择、取消、重拍。
- `LocalMediaStore`：保存、读取、删除图片，检查剩余空间和清理缓存。
- `AssessmentClient`：提交评测、查询进度、取消、重试和提交“结果有误”反馈。
- `PracticeRepository`：持久化练习、任务、单字结果、问题字本和纠错历史。

当某端无法稳定承载 ArkUI-X 相机视图时，该端改用独立原生拍摄页面；拍摄结果仍通过 `CaptureService` 返回公共 ArkTS 流程，不改变上层接口。

### 核心数据契约

- `AssessmentTask`：包含本地任务 ID、幂等标识、练习主体、图片引用、创建时间、重试信息和任务状态。
- 任务状态固定为：`local_pending`、`uploading`、`analyzing`、`completed`、`failed`、`cancelled`。
- `CharacterResult`：包含字序、目标字、识别字、原图边界框、裁剪图引用、标准字版本、评分、分类、置信信息、差异标注、问题清单和建议。
- 可重试提交使用稳定的本地任务 ID 与幂等标识；网络重试不得重复写入问题字本或纠错进度。
- 服务端契约只定义提交、状态查询、结果获取、取消和反馈等能力；具体后端框架、模型供应商及部署方式另行决策。

## PAD 适配规则

- 使用窗口宽度而非设备型号判断布局：紧凑型 `<600vp`、中型 `600–839vp`、扩展型 `>=840vp`。
- 紧凑型保留“练习—中间拍照—我的”底部导航。
- 中型和扩展型预留侧边导航；识别结果预留“单字列表＋对比详情”主从双栏结构。
- 页面使用 `vp/fp`、安全区和可伸缩容器，并允许横竖屏、分屏和系统字体缩放。
- MVP 不交付手写笔、键鼠快捷键、PAD 专属页面或折叠屏专属交互。

## 仓库结构与门禁

- 当前只在 `harness` 中维护决策、原型评审、能力验证和验收场景，不创建正式客户端源码目录。
- 原型批准且三端能力验证通过后，计划创建 `client/` 作为 ArkUI-X 工程根目录；公共 ArkTS 代码和 Android、iOS 平台宿主按 ArkUI-X 生成结构组织。
- `harness` 保持产品规则和验收场景的来源；客户端实现不得反向改写业务规则。
- 解除研发工程门禁必须同时满足：原型评审 `approved`、技术选型 `approved`、客户端能力验证 `approved`。

## 风险与退出策略

- 相机桥接风险：优先验证三端应用内取景、权限、旋转、回传与重拍；失败时使用独立原生拍摄页降级。
- 生态风险：优先官方 API 和系统框架；新增第三方包必须记录维护状态、许可证、平台覆盖和移除成本。
- SDK 升级风险：ArkUI-X 或系统 SDK 升级前保留当前锁定版本，完成三端最小版本与主流版本回归后再升级。
- 绘图性能风险：客户端只渲染服务端返回的结构化差异；复杂图像计算留在服务端。
- 若能力验证发现 ArkUI-X 无法稳定满足三端关键路径，应将本 ADR 改为 `superseded`，重新比较 Flutter HarmonyOS 适配或各端原生方案，不在业务层堆叠临时分支。

## 后续动作

1. 按 `../validation/arkui-x-capability-verification.md` 完成三端工具链和关键能力验证。
2. 归档产品原型并完成原型评审记录。
3. 完成未成年人数据、标准字形许可证和评测服务数据边界评审。
4. 三项门禁全部通过后，更新阶段并创建正式 `client/` 工程。
