# 正式客户端、原型评审与三端能力验证完成审计

## 审计结论

- 审计日期：2026-08-08；最近更新：2026-08-11（ArkUI 声明式转换与 ABC 编译门禁通过）
- 审计目标：根据已接受的 ArkUI-X 技术方案，创建正式研发工程目录，完成原型评审并完成 HarmonyOS、Android、iOS 能力验证。
- 总体结论：`blocked`
- 已完成：正式 `client/` 工程、技术决策、原型评审、三端宿主源码、公共适配器、PAD 响应式基础、可执行契约、合成验收夹具和证据执行器。
- 未完成：hvigor 集成类型检查与完整三端产物编译、安装、最低/主流系统启动、真机相机/相册/存储/数据库/上传/恢复/绘制、响应式和生命周期验证。20 个非 UI ArkTS 核心文件已由官方 Ark 编译器生成 ABC，5 个声明式页面/组件已通过官方 `ets-loader` UI 语法校验、声明式转换及转换结果 ABC 编译，25 个主源码文件已完成独立语法/语义与项目级 linter 检查且错误和警告均为 0；iOS 的 5 个 Objective-C 宿主文件已生成限域 arm64 Mach-O 对象；Android 原生宿主已完成双版本模拟器运行验证。独立 ArkUI 转换门禁不包含 hvigor 工程模型、集成模块解析、生产资源编译或应用链接。
- 判定原则：静态检查与源码存在只能证明实现意图和仓库一致性，不作为设备运行通过证据。

## 证据等级

| 等级 | 含义 |
| --- | --- |
| `proven` | 当前仓库或命令输出直接证明要求完成 |
| `source_only` | 源码、契约或静态检查存在，但缺少编译/运行证据 |
| `blocked` | 已实际执行，确定被外部许可、SDK、IDE 或设备条件阻塞 |
| `pending` | 前置条件恢复后仍需执行并记录结果 |

## 逐项审计

| 原计划要求 | 当前判定 | 权威证据 | 完成所缺证据 |
| --- | --- | --- | --- |
| ArkUI-X 6.0 + ArkTS 技术决策标记 Accepted | `proven` | `decisions/technology-selection.md` 状态为 `accepted` | 无 |
| 产品原型评审批准后创建正式工程 | `proven` | `reviews/prototype-review-2026-08-07.md` 为 `approved`；`manifest.yaml` 授权正式工程 | 无 |
| 正式 `client/` 研发目录 | `proven` | `client/README.md`、ArkUI-X 配置、HarmonyOS/Android/iOS 宿主工程均存在 | 无 |
| HarmonyOS 6/API 20、Android API 26、iOS 13 基线 | `source_only` | 构建配置及 96 项静态检查通过；Android API 26 原生宿主运行通过；iOS 宿主源码通过 Mac Catalyst 兼容头对象编译 | HarmonyOS/iOS 最低系统以及完整 ArkTS 客户端三端证据 |
| 公共 ArkTS 业务和平台适配边界 | `proven` | `ARCHITECTURE.md`、`services/`、`adapters/`，页面无 Android/iOS API 泄漏 | 无架构层缺项；运行正确性另行验证 |
| 相机：HarmonyOS Camera Kit | `source_only` | `HarmonyCameraBridge.ets` 使用 `cameraPicker` | HarmonyOS 真机权限、拍摄、取消、返回结果证据 |
| 相机：Android CameraX | `source_only` | 私有 `CameraCaptureActivity`、方格层、Bridge 与错误区分；原生宿主/测试 APK 已生成，并在 Android 8/API 26 与 Android 13/API 33 模拟器启动相机页 | 完整 ArkUI-X APK、实际拍摄回传以及最低/主流版本真机证据 |
| 相机：iOS AVFoundation | `source_only` | 全屏原生控制器、Bridge、Xcode Sources 与 Framework 引用；5 个 Objective-C 文件通过 ARC/API 类型检查并生成 arm64 Mach-O 对象 | iPhoneOS SDK 编译、iOS 13 与主流版本真机拍摄证据 |
| 相册、文件、容量、RDB、Preferences | `source_only` | 官方跨端 API 适配器及静态检查通过 | 三端读写、权限、空间不足和重启恢复证据 |
| HTTP 上传、取消、超时、重试、幂等 | `source_only` | `NetHttpAssessmentClient` 与动态契约测试 | 三端网络联调、断网恢复、无重复任务证据 |
| 多字结果、差异、问题清单 | `source_only` | 16 字可滑动结果；四类结果；`multi-grid-v1` 夹具 | 三端实际渲染、点选、绘制性能和部分失败证据 |
| 待确认结果不形成伪确定评分 | `proven` | 契约允许 `score: null`；界面显示“待确认”；动态测试覆盖 | 运行渲染仍随三端 UI 验证确认 |
| PAD 三档断点及手机底部导航 | `source_only` | `<600vp`、`600–839vp`、`>=840vp` 常量及静态检查 | 三档窗口、横竖屏、分屏、字体放大和安全区截图 |
| 不含教师复核与周期报告 | `proven` | MVP、原型及应用源码范围排除检查通过 | 无 |
| 无模型密钥及敏感媒体日志 | `proven`（静态） | 密钥模式与 ArkTS/Android/iOS 日志规则检查通过 | 三端运行日志抽查 |
| 三端编译、安装和启动 | `blocked` | Android 原生宿主已在 API 26/API 33 模拟器完成 APK 安装、入口启动及仪器测试；完整 `ace build` 仍停止在 DevEco/SDK 前置阶段 | 补齐许可和工具链后完成公共 ArkTS 与三端构建 |
| 最低版本与主流版本验收 | `pending` | 验证矩阵已定义，尚无设备结果 | 每端至少两个系统版本和设备/模拟器信息 |
| CAP-01～CAP-10 全部批准 | `pending` | `arkui-x-capability-verification.md` 仍为 `in_progress` | 每项、每端均需运行证据，不得跨端替代 |

## 当前可重复结果

| 命令 | 当前结果 |
| --- | --- |
| `cd client && npm test` | 11 项动态契约/夹具测试、96 项静态检查通过 |
| `cd client && npm run validate:arkts-core` | OpenHarmony API 20 官方 Ark 编译器为 20/20 个非 UI ArkTS 文件生成 ABC；明确排除 ArkUI 声明式页面/组件、hvigor 工程模型与完整打包 |
| `cd client && npm run validate:arkui-syntax` | OpenHarmony API 20 官方 `ets-loader` 为 5/5 个声明式页面/组件完成 UI 语法、装饰器与入口规则校验；明确排除转换代码生成、语义类型检查、完整打包和运行 |
| `cd client && npm run validate:arkui-transform` | OpenHarmony API 20 官方完整 ArkUI 编译配置和 `processUISyntax` 转换 5/5 个声明式页面/组件，`es2abc` 为 5/5 个转换结果生成 ABC 并记录哈希；明确排除 hvigor 工程模型与集成模块解析、生产资源编译与 ID 分配、完整打包和运行 |
| `cd client && npm run validate:arkts-semantic` | OpenHarmony API 20 官方 `etsStandaloneChecker` 覆盖 25 个主源码文件：0 个语义错误、0 个项目级 ArkTS linter 错误、0 个警告；后续诊断仍完整保留，明确不替代 hvigor 模型、完整打包或运行 |
| `./harness/bin/validate` | 原型、ADR、正式工程边界、动态测试和静态检查通过 |
| `cd client && npm run preflight:toolchain` | API 33 AVD 运行时 `16/25 READY`、`9/25 PENDING`，无运行设备时基线为 `15/25 READY`；OpenHarmony 公共 SDK、Android SDK、双版本 Android AVD、DevEco CLI 已就绪，许可/完整构建工具链及 HarmonyOS/iOS 设备尚未就绪 |
| `cd client && npm run validate:android-host` | Android Java/CameraX/Bridge、JUnit、仪器测试源码及原生宿主/测试 APK 打包通过；产物哈希写入本地 `harness/results/` |
| `cd client && npm run validate:android-avd-matrix` | 自动构建 Android 原生宿主，依次启动 Android 8/API 26 与 Android 13/API 33 arm64 AVD，完成安装、入口 Activity 冷启动、进程/前台状态确认及每档 2 项仪器测试；矩阵 `2/2 PASS`，两档模拟器均已关闭并生成脱敏汇总证据 |
| `cd client && npm run validate:ios-host-source` | Xcode 工程与 Info.plist 语法通过；5/5 个 Objective-C 宿主文件通过 Command Line Tools Mac Catalyst 兼容头和 ArkUI-X Bridge 头的 ARC/API 类型检查并生成 arm64 Mach-O 对象；明确不替代 iPhoneOS SDK 编译、链接或运行 |
| `cd client && npm run validate:platforms -- --phase build --platform android` | 完整 Android 构建仍在公共 ArkTS 生成前因 DevEco SDK 路径未定义失败；脱敏 JSON 证据写入本地 `harness/results/` |

## 阻塞条件

当前缺少或未确认：

1. ArkUI-X 与 OpenHarmony SDK 官方许可记录；ACE 因许可缺失拒绝配置现有 SDK。
2. DevEco Studio 或 Command Line Tools、HarmonyOS 6/API 20 SDK、ohpm/hvigor；官方下载需要账号持有人登录。OpenHarmony 公共 SDK 6.0.0.47/API 20 已独立安装并核验，但不替代这些商业 SDK 与构建工具。
3. 完整 Xcode 与可用 iOS SDK；当前只有 Apple Command Line Tools。
4. HarmonyOS、iOS 可运行设备和 Android 物理拍摄设备。Android 8/API 26 与 Android 13/API 33 模拟器基线已建立并通过原生宿主运行门禁。

ArkUI-X 许可及华为账号登录仍须通过官方流程确认；仓库验证脚本不会自动接受许可或保存账号凭据。详细恢复步骤见 `toolchain-recovery.md`。

## 恢复执行顺序

```bash
cd client
npm run preflight:toolchain
npm run validate:platforms -- --phase build --platform all
npm run validate:platforms -- --phase run --platform harmonyos --device <device-id>
npm run validate:platforms -- --phase run --platform android --device <device-id>
npm run validate:platforms -- --phase run --platform ios --device <device-id>
```

随后按 `arkui-x-capability-verification.md` 对 CAP-01～CAP-10 逐端登记设备、系统版本、步骤、结果与证据。只有三端全部通过，才能将 `client_capability_validation` 从 `in_progress` 更新为 `approved`。
