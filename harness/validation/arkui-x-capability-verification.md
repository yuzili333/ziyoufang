# ArkUI-X 三端能力验证记录

> 历史状态：`superseded-frozen`。微信小程序已经替代 ArkUI-X 作为 MVP 客户端方向；本记录只作为旧方案证据，不再控制当前研发或发布门禁。

## 基本信息

- 关联决策：`ADR-001`
- 验证日期：2026-08-07；最近更新：2026-08-11（ArkUI 声明式转换与 ABC 编译门禁通过）
- 目标版本：ArkUI-X `6.0.0 Release`
- 当前状态：`in_progress`
- 通过条件：本文全部关键项在 HarmonyOS、Android、iOS 上获得可复现证据，且不存在未处理的阻塞问题

## 当前环境预检

| 工具 | 当前结果 | 判定 |
| --- | --- | --- |
| ArkUI-X SDK | 官方 `6.0.0.103 Release` 包已下载，SHA-256 为 `6226666c8fc80e0cbd0ce6f15137e95ce89293a9c0dbe9a4663977cbb08edfe5`；已按 `Sdk/20/arkui-x/` 目录安装 | SDK 就绪，许可待确认 |
| OpenHarmony 公共 SDK | 官方 `6.0.0.47`/API 20 M1 包已安装到 `~/Library/OpenHarmony/Sdk/20`；SHA-256 与发布说明一致，五组件清单及 arm64 工具链核验通过 | SDK 本体就绪；ACE 所需许可记录、ohpm、hvigor 仍未就绪，不替代 HarmonyOS 商业 SDK |
| ACE Tools | 官方 6.0 分支 CLI 已稳定安装为 `ace 1.0.0`；上游运行依赖清单缺失的 `json5` 已在本机工具安装中补齐 | 就绪；SDK 配置仍受 ArkUI-X 许可阻塞 |
| DevEco CLI | 官方 npm 包 `1.2.0-stable` 已安装；实测构建仍要求底层 DevEco Studio/Command Line Tools | CLI 就绪，不替代底层工具链 |
| Node.js | 当前执行环境 `24.12.0`（工程要求 `>=18`） | 就绪 |
| Java | Homebrew OpenJDK `17.0.20`，使用显式 `JAVA_HOME` | 就绪 |
| iOS 设备工具 | `libimobiledevice 1.4.0`、`ios-deploy 1.12.2` | 就绪 |
| Xcode | 当前仅有 Apple Command Line Tools，未安装完整 `/Applications/Xcode.app` | 未就绪 |
| Android 命令行工具 | 已安装 API 33、Build Tools 30.0.3；官方 CLI 许可已确认 | 就绪 |
| Android ADB | `platform-tools` 已安装；最近验证时 API 33 AVD 连接为 `emulator-5554` | 就绪；模拟器运行证据已形成，物理拍摄设备仍待连接 |
| Android 模拟器 | Emulator 37.1.11，已建立 Android 8/API 26 与 Android 13/API 33 arm64 AVD | 两档原生宿主运行验证通过；物理相机仍待真机 |
| DevEco Studio | 未发现应用安装 | 未就绪 |
| HarmonyOS SDK | 未发现商业 HarmonyOS API 20 SDK | 未就绪；不得用 OpenHarmony 公共 SDK 替代此项 |
| ohpm | 未发现 | 未就绪 |
| hvigor | 未发现 | 未就绪 |
| 三端设备 | 最近验证时 `adb devices` 已发现 API 33 AVD；`hdc list targets`、`idevice_id -l` 未发现可用设备 | Android 模拟器证据已形成；HarmonyOS、iOS 及 Android 物理拍摄设备未就绪 |

结论：正式工程、跨端契约、三端拍摄宿主和静态检查已经完成；OpenHarmony 官方 Ark 编译器已为 20 个非 UI ArkTS 核心文件生成 ABC，官方 `ets-loader` 已校验并转换 5 个声明式页面/组件，转换结果已由 `es2abc` 生成 ABC，`etsStandaloneChecker` 已覆盖 25 个主源码文件且语义错误、项目级 ArkTS linter 错误和警告均为 0；iOS 的 5 个 Objective-C 宿主文件已使用 Command Line Tools Mac Catalyst 兼容头与 ArkUI-X Bridge 头生成 arm64 Mach-O 对象文件；Android 原生宿主已在 API 26/API 33 模拟器完成打包、安装、启动和 CameraX 页面仪器测试。API 33 AVD 运行时预检为 `16/25 READY`，无运行设备的静态工具链基线为 `15/25 READY`。独立 ArkUI 转换门禁不包含 hvigor 工程模型、集成模块解析、生产资源编译和应用链接，因此尚不能声称完整 ArkUI-X 应用、iPhoneOS 编译、三端安装启动或物理相机能力通过；仍需补齐 SDK 许可记录、DevEco Studio/Command Line Tools、HarmonyOS 商业 SDK、ohpm/hvigor、完整 Xcode 及 HarmonyOS/iOS/Android 真机。官方 Command Line Tools 下载页需要华为账号登录，恢复步骤已记录于 `toolchain-recovery.md`。

## 验证约束

- 验证以已获授权创建的正式 `client/` 工程为载体；仅实现架构骨架与关键交互，不扩展未确认的完整业务模块。
- 使用合成练字图片，不使用真实学生身份或未经授权的书写数据。
- 每项记录工具版本、设备/模拟器版本、执行步骤、结果和证据位置。
- 任何平台的关键项失败，整体状态不得标记为 `approved`。

## 工具链与启动

| 编号 | 验证项 | HarmonyOS | Android | iOS |
| --- | --- | --- | --- | --- |
| TOOL-01 | 安装并锁定 ArkUI-X 6.0.0 Release | SDK 本体就绪，许可待确认 | SDK 本体就绪，许可待确认 | SDK 本体就绪，许可待确认 |
| TOOL-02 | 创建最小 ArkTS 页面并编译 | 20 个非 UI 核心文件及 5 个 ArkUI 页面/组件已限域生成 ABC；完整应用待验证 | 20 个非 UI 核心文件及 5 个 ArkUI 页面/组件已限域生成 ABC；完整应用待验证 | 20 个非 UI 核心文件及 5 个 ArkUI 页面/组件已限域生成 ABC；完整应用待验证 |
| TOOL-03 | 在最低系统版本启动 | 待验证 | 原生宿主在 Android 8/API 26 通过；完整客户端待验证 | 待验证 |
| TOOL-04 | 在一个当前主流版本启动 | 待验证 | 原生宿主在 Android 13/API 33 通过；完整客户端待验证 | 待验证 |

## 已完成的可复现验证

| 层级 | 命令 | 结果 | 覆盖范围 |
| --- | --- | --- | --- |
| L1 契约测试 | `cd client && npm test` | 通过：11 项动态契约/夹具测试、96 项静态工程检查 | 三端基线、服务接口、任务状态机、幂等与重试语义、响应式断点、导航、范围排除、平台权限、三端拍摄宿主、拍摄确认与重拍、16 字可滑动结果、四类结果、待确认无伪评分、合成夹具完整性、官方跨端适配器、平台证据完整性、Android 双 AVD 矩阵、ArkUI 转换门禁、图标资源、敏感日志字段 |
| L1 harness 门禁 | `./harness/bin/validate` | 通过 | 原型评审、ADR、能力验证记录、正式工程边界、11 项动态测试和 96 项客户端静态检查 |
| L1 配置语法 | `plutil -lint` 校验 iOS 工程与 Info.plist，`xmllint` 校验 AndroidManifest，JSON/YAML/脚本解析 | 通过 | Xcode 工程引用、iOS 隐私配置与图标清单、Android 组件清单、harness manifest、验证脚本 |
| L1 适配器语法 | TypeScript 5.9 `transpileModule` 校验 15 个 `adapters/*.ets`、`services/*.ets` 文件 | 通过：0 条语法诊断 | ArkTS 公共适配器的 TypeScript 语法；不替代 ArkTS 类型检查 |
| L1 ArkTS 核心编译 | `cd client && npm run validate:arkts-core` | 通过：OpenHarmony API 20 `es2abc` 为 20/20 个非 UI ArkTS 文件生成 ABC 及哈希 | 领域模型、服务、适配器、EntryAbility、主题令牌；明确不覆盖 ArkUI 声明式页面/组件、hvigor 工程模型或完整打包 |
| L1 ArkUI 语法校验 | `cd client && npm run validate:arkui-syntax` | 通过：OpenHarmony API 20 官方 `ets-loader` 为 5/5 个声明式页面/组件完成预处理、UI 语法、装饰器和入口规则校验 | 明确不覆盖转换代码生成、ArkTS 语义类型检查、hvigor 工程模型、完整打包或设备运行 |
| L1 ArkUI 转换与 ABC 编译 | `cd client && npm run validate:arkui-transform` | 通过：官方完整 ArkUI 编译配置和 `processUISyntax` 转换 5/5 个声明式页面/组件，`es2abc` 为 5/5 个转换结果生成 ABC；转换代码、ABC 和输出哈希写入本地证据 | 使用固定验证资源 ID；明确不覆盖 hvigor 工程模型与集成模块解析、生产资源编译与 ID 分配、完整应用链接打包或设备运行 |
| L1 ArkTS 独立语义/linter | `cd client && npm run validate:arkts-semantic` | 通过：官方 `etsStandaloneChecker` 覆盖 25 个主源码文件，0 个语义错误、0 个项目级 ArkTS linter 错误、0 个警告；诊断和输出哈希写入本地证据 | 使用 API 20 与 ArkUI-X Bridge 声明；明确不覆盖 hvigor 工程模型、完整打包或设备运行 |
| L1 Android 宿主编译 | `cd client && npm run validate:android-host` | 通过：主代码、JUnit 与仪器测试源码编译，原生宿主及测试 APK 生成，`BUILD SUCCESSFUL`；产物和输出哈希写入本地 `harness/results/` | Android Manifest、资源、CameraX 1.2.3、权限、拍摄 Activity、ArkUI-X Bridge Java 层、官方引擎动态库及 AndroidX 测试基线；明确不覆盖公共 ArkTS 或完整 ArkUI-X APK |
| L1 iOS 宿主对象编译 | `cd client && npm run validate:ios-host-source` | 通过：`plutil` 校验工程/Info.plist，Clang 以 ARC 和 API 类型检查将 5/5 个 Objective-C 文件编译为 arm64 Mach-O 对象；对象大小、对象哈希和输出哈希写入本地证据 | 使用 Command Line Tools Mac Catalyst 兼容头和 ArkUI-X Bridge 头；明确不覆盖 iPhoneOS/iPhoneSimulator SDK、iOS 13 可用性、链接、打包或运行 |
| L0 Android 双版本运行 | `npm run validate:android-avd-matrix` | 自动构建宿主并依次验证 Android 8/API 26 与 Android 13/API 33：两档均安装成功、入口 Activity `Status: ok`、进程/前台状态存在、2 项仪器测试通过，矩阵 `2/2 PASS`；脚本启动的模拟器均已正常关闭 | 生成单档及汇总哈希证据；证明原生宿主和 CameraX 页面在最低/主流模拟系统可启动，不证明 ArkTS 产品流、物理相机拍照或 Android 真机兼容性 |
| L0 工具链预检 | `cd client && npm run preflight:toolchain` | API 33 AVD 运行时 `16/25 READY`、`9/25 PENDING`；无运行设备时基线为 `15/25 READY` | ACE、DevEco CLI、ArkUI-X SDK、OpenHarmony 公共 SDK 6.0.0.47/API 20、Node、JDK、Android SDK/Emulator/API 26 与 API 33 AVD、libimobiledevice、ios-deploy 就绪；许可、ohpm、hvigor、商业 SDK、IDE 和其余设备独立判定 |
| L0 平台证据执行器 | `cd client && npm run validate:platforms -- --phase <check|build|run>` | 已实现；运行态待工具链 | 使用官方 `ace build/run`，强制显式平台与设备选择，生成脱敏、带哈希的 JSON 证据 |
| L0 三端真实构建尝试 | `npm run validate:platforms -- --phase build --platform all` | 三端均阻塞，证据已写入本地 `harness/results/` | HarmonyOS 在 `DevEcoDir/hvigor` 前置阶段失败；Android/iOS 在公共 ArkTS 编译前置阶段因 DevEco SDK 路径未定义失败，尚未进入原生编译器；ACE 对 HarmonyOS 错误返回 0 的问题已由执行器按 `Compile failed` 语义纠正为失败 |

L1 证明各项限域源码、契约或编译门禁通过，不替代 hvigor 完整应用构建、设备运行或真机能力验证。

## 合成验证夹具

| 夹具 | 用途 | 证据边界 |
| --- | --- | --- |
| `multi-grid-clear-v1.png` | 4×4、16 字多字列表、边界框、错字/不美观/正常/待确认结果及主视图切换 | 只验证客户端流程和结果呈现，不证明模型准确率 |
| `multi-grid-blurred-v1.png` | 模糊图片拒绝、失败原因和重新拍摄提示 | 期望错误 `IMAGE_BLUR` |
| `multi-grid-cropped-v1.png` | 方格不完整、裁切失败和重新拍摄提示 | 期望错误 `GRID_INCOMPLETE` |

夹具由 `harness/fixtures/generate-grid-fixtures.swift` 生成，不包含真实学生数据；文件哈希、尺寸、16 个归一化边界框和四类结果覆盖由动态测试持续校验。

## 平台能力

| 编号 | 验证项 | 通过标准 | 当前工程证据 | 运行结论 |
| --- | --- | --- | --- | --- |
| CAP-01 | 应用内拍照 | 可显示方格辅助层，完成权限申请、拍摄、取消、重拍、旋转处理和图片回传 | 已实现并接通 `CaptureServiceFactory`：HarmonyOS Camera Kit `cameraPicker`；Android CameraX 私有 `Activity`、方格辅助层及 JSON Bridge；iOS AVFoundation 全屏控制器、方格辅助层及 JSON Bridge；公共确认页支持预览、重新拍摄和使用照片；均返回 URI、尺寸、方向和可区分错误 | Android API 26/API 33 模拟器已证明相机页在授予权限后启动；公共 ArkTS、实际拍照回传、HarmonyOS/iOS 编译及三端真机待验证 |
| CAP-02 | 相册选择 | 可通过系统选择器选择图片；拒绝权限或取消时返回可区分结果 | `ArkUiXCaptureService` 使用跨端 `PhotoViewPicker` 并读取图片尺寸 | 待上机 |
| CAP-03 | 文件存储 | 可在应用沙箱保存、读取、删除原图和压缩图，能够识别空间不足 | `ArkUiXLocalMediaStore` 使用 `file.fs` 与 `file.statvfs` | 待上机 |
| CAP-04 | 关系型数据 | 可创建、迁移、写入并在应用重启后读取练习、任务和单字结果 | `RdbPracticeRepository` 已建立任务表、幂等唯一键与结果 JSON 持久化 | 待上机/重启 |
| CAP-05 | 偏好设置 | 可保存并读取轻量配置，重启后保持一致 | `ArkUiXSettingsStore` 使用 `preferences` 并显式 `flush` | 待上机/重启 |
| CAP-06 | HTTP 上传 | 可上传图片和元数据，展示进度，并支持取消、超时、失败重试 | `NetHttpAssessmentClient` 使用 `net.http` multipart、进度事件、取消、超时和最多三次重试 | 待联调 |
| CAP-07 | 断网恢复 | 离线任务保留为 `local_pending`；联网后使用同一幂等标识继续且不重复提交 | 本地状态、幂等唯一键、`Idempotency-Key` 与待提交查询已实现 | 待断网测试 |
| CAP-08 | 差异绘制 | 可流畅绘制多字边界框、标准字叠加、差异区域和问题标记 | 多字列表、对比视图、问题清单及边界框数据契约已实现 | 待绘制性能测试 |
| CAP-09 | 响应式布局 | `<600vp`、`600–839vp`、`>=840vp` 三档无溢出、遮挡或关键操作丢失 | 三档断点、4/8/12 栏网格和手机底部导航已实现 | 待三档渲染 |
| CAP-10 | 生命周期恢复 | 上传或分析期间终止并重启应用后，可恢复真实任务状态且不重复写入结果 | RDB 任务状态、结果和 `listPendingTasks` 恢复入口已实现 | 待进程终止测试 |

每一项必须分别记录 HarmonyOS、Android、iOS 的通过/失败及证据；不得以某一平台结果替代其他平台。

## 异常场景

- 相机或相册权限拒绝、永久拒绝和系统设置后恢复。
- 图片损坏、格式不支持、过大、过暗、模糊和磁盘空间不足。
- 网络断开、超时、服务端 4xx/5xx、响应格式错误和部分单字处理失败。
- 上传期间取消、应用切后台、进程终止和设备旋转。
- 同一任务连续重试，确认服务端和本地均未产生重复问题字记录。
- 系统字体放大、横竖屏、分屏和安全区变化。

## 相机降级判定

任一平台出现以下情况且在限定验证周期内无法通过官方 ArkUI-X 能力稳定解决时，启用独立原生拍摄页：

- 取景画面无法稳定嵌入或旋转方向错误。
- 无法叠加方格辅助层或无法可靠获取拍摄结果。
- 权限、前后台切换或重拍导致崩溃、黑屏或结果丢失。
- 最低系统版本无法满足可接受的拍摄体验。

降级后仍必须通过统一 `CaptureService` 返回图片引用、尺寸、方向和来源，不允许业务页面感知平台差异。Android 与 iOS 已直接采用该独立原生拍摄页结构；HarmonyOS 使用 Camera Kit 系统拍摄面板。是否保留此结构以三端真机结果为准。

## 最终结论

- 状态：`in_progress`
- 完成审计：`completion-audit-2026-08-08.md`，总体结论为 `blocked`
- 验证负责人：待安排
- HarmonyOS 证据：待补充
- Android 证据：待补充
- iOS 证据：待补充
- 阻塞问题：缺少 ArkUI-X/OpenHarmony SDK 许可记录、DevEco Studio/Command Line Tools、HarmonyOS 6/API 20 商业 SDK、ohpm、hvigor、完整 Xcode、HarmonyOS/iOS 设备和 Android 物理拍摄设备。OpenHarmony 公共 SDK、Android 双版本模拟器及原生宿主运行已通过，但三端实际 `ace build` 仍会在公共 ArkTS 生成前读取许可与 DevEco 构建工具，因此尚未形成完整平台构建结论。官方 Command Line Tools 下载需要账号持有人登录，不能由无人值守验证脚本完成。
- 结论日期：待补充
