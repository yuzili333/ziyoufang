# 客户端架构

## 依赖方向

```text
pages/components -> services + domain <- adapters/platform hosts
```

- `domain`：跨端稳定数据类型、任务状态和响应式常量。
- `services`：相机、本地媒体、评测 API、练习仓库的公共接口。
- `adapters`：ArkUI-X 官方跨端 API 或原生 Bridge 的实现位置。
- `pages/components`：只组合领域数据和服务，不直接引用 Android、iOS API。

## 主流程

1. `CaptureService` 返回应用沙箱内图片引用。
2. `LocalMediaStore` 保存原图/压缩图；`PracticeRepository` 创建 `local_pending` 任务。
3. 网络可用时 `AssessmentClient` 以本地任务 ID 和幂等标识提交。
4. 客户端恢复任务状态，持久化多字 `CharacterResult`。
5. 结果页以单字列表驱动主视图、差异标记和问题清单。
6. 学生提交“结果有误”只创建反馈和重新评测，不修改历史结果。

## 平台边界

- HarmonyOS：`HarmonyCameraBridge` 使用 Camera Kit `cameraPicker`；相册使用 PhotoAccessHelper。
- Android：`CameraCaptureActivity` 使用 CameraX；`ZiYouFangCameraBridge` 处理权限和结果回传。
- iOS：`ZiYouFangCameraViewController` 使用 AVFoundation；`ZiYouFangCameraBridge` 处理权限和结果回传。
- `CaptureServiceFactory` 按运行平台选择宿主，页面只调用同一 `CaptureService`。
- Android/iOS 已采用独立原生拍摄页这一预定降级结构，避免业务层依赖嵌入式原生取景视图。

## 已实现的公共适配器

- `ArkUiXCaptureService`：公共相册选择与图片元数据读取，相机委托给 `PlatformCameraBridge`。
- `ArkUiXLocalMediaStore`：永久图片目录、临时缓存和容量检查。
- `RdbPracticeRepository`：任务、状态、幂等标识和多字结果的本地持久化。
- `ArkUiXSettingsStore`：轻量设置持久化。
- `NetHttpAssessmentClient`：multipart 上传、进度、超时、取消与有界重试。

评测服务的最小线协议记录在 `contracts/assessment-api.md`。仓库不保存服务地址或模型密钥；运行环境必须注入 HTTPS `baseUrl`。

## 响应式规则

- compact：`<600vp`，底部导航，中间拍照，单栏结果。
- medium：`600–839vp`，预留侧边导航，结果可切换主从布局。
- expanded：`>=840vp`，单字列表与对比详情双栏。
