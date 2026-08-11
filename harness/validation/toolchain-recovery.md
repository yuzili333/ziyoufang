# 三端工具链恢复手册

> 历史状态：`superseded-frozen`。仅在需要复核旧 ArkUI-X 证据时使用，不再是当前微信小程序研发前置步骤。

## 当前结论

- 最近核验：2026-08-11
- 自动预检：API 33 AVD 运行时 `16/25 READY`、`9/25 PENDING`；无运行设备时静态基线为 `15/25 READY`、`10/25 PENDING`
- 已就绪：ArkUI-X SDK 6.0.0.103、OpenHarmony 公共 SDK 6.0.0.47/API 20（Apple Silicon）、ACE Tools 1.0.0、DevEco CLI 1.2.0-stable、Node.js、JDK 17、Android Platform Tools/API 33/Build Tools 30.0.3、Android Emulator、API 26/API 33 arm64 系统镜像与两档 AVD、libimobiledevice、ios-deploy。
- 待补齐：ArkUI-X 与 OpenHarmony SDK 许可记录、DevEco Studio 或 Command Line Tools、商业 HarmonyOS API 20 SDK、ohpm、hvigor、完整 Xcode、HarmonyOS/iOS 测试设备及 Android 物理拍摄设备。

DevEco CLI 只是统一入口，不包含底层 Studio/Command Line Tools。实测在当前机器运行构建会明确返回缺少 DevEco Studio，因此不得把 CLI 安装等同于 HarmonyOS 工具链完成。

## 官方获取入口

- [DevEco Studio 官方下载](https://developer.huawei.com/consumer/cn/deveco-studio/)
- [HarmonyOS Command Line Tools 官方下载](https://developer.huawei.com/consumer/cn/download/command-line-tools-for-hmos)
- [DevEco CLI 官方 npm 包](https://www.npmjs.com/package/@deveco/deveco-cli)
- [ArkUI-X ACE Tools](https://gitcode.com/arkui-x/cli)
- [ArkUI-X 环境配置说明](https://gitcode.com/arkui-x/docs/blob/master/zh-cn/application-dev/quick-start/start-with-dev-environment.md)
- [OpenHarmony 6.0 Release 发布说明及公共 SDK](https://github.com/openharmony/docs/blob/master/en/release-notes/OpenHarmony-v6.0-release.md)

Command Line Tools 下载页会跳转华为账号登录。账号登录、许可确认和验证码必须由账号持有人完成；仓库不保存账号、Cookie、令牌或许可文本。

## 推荐安装位置

```text
/Applications/DevEco-Studio.app
~/Library/Huawei/Sdk
~/Library/OpenHarmony/Sdk
~/Library/ArkUI-X/Sdk
~/Library/Android/sdk
/Applications/Xcode.app
```

OpenHarmony 公共 SDK 已安装在 `~/Library/OpenHarmony/Sdk/20`，五个组件清单均为 `6.0.0.47`、API 20，arm64 可执行文件架构核验通过；M1 发行包 SHA-256 为 `d4b0c942cbc8dfc7f28f49c0f33648f332d43c3a51399f2463655c2ef1f2c659`。该 SDK 可作为公共 ArkTS 编译前置，但不能替代 HarmonyOS 商业 SDK、DevEco、`ohpm`、`hvigor`、官方许可记录或真机验收。

DevEco Studio 安装完成后，在 SDK Manager 安装 HarmonyOS 6 / API 20，并确认其内置 `ohpm` 与 `hvigor` 可执行。若使用独立 Command Line Tools，通过 `DEVECO_CLI_CLT_PATH` 指向工具根目录。

## 恢复命令

```bash
cd client

# 1. 重新核验工具链与三端设备
npm run preflight:toolchain

# 2. 将官方工具路径登记到 ACE；按实际安装位置调整
ace config --deveco-studio-path /Applications/DevEco-Studio.app
ace config --harmonyos-sdk "$HOME/Library/Huawei/Sdk"
ace config --openharmony-sdk "$HOME/Library/OpenHarmony/Sdk"
ace config --ohpm-dir /Applications/DevEco-Studio.app/Contents/tools/ohpm
ace config --arkui-x-sdk "$HOME/Library/ArkUI-X/Sdk"
ace config --android-sdk "$HOME/Library/Android/sdk"

# 3. 构建三端 Debug 产物并生成脱敏证据
npm run validate:platforms -- --phase build --platform all

# 4. 逐端指定真实设备运行；不得自动选择设备
npm run validate:platforms -- --phase run --platform harmonyos --device <device-id>
npm run validate:platforms -- --phase run --platform android --device <device-id>
npm run validate:platforms -- --phase run --platform ios --device <device-id>

# 可独立复跑 Android 8/API 26 与 Android 13/API 33 原生宿主矩阵
# 运行前必须关闭其他在线 Android 模拟器
npm run validate:android-avd-matrix
```

若 DevEco Studio 实际安装在 `~/Applications` 或名称为 `DevEco Studio.app`，预检可以自动识别，但 ACE 配置命令仍应使用真实绝对路径。

## 通过边界

- `devecocli --version` 通过：只证明统一 CLI 可执行。
- OpenHarmony 公共 SDK 预检通过：只证明 API 20 组件、版本与宿主架构正确；许可、`ohpm`、`hvigor` 和 HarmonyOS 能力仍需独立通过。
- `npm run validate:arkts-core` 通过：证明非 UI ArkTS 核心可由官方 Ark 编译器生成 ABC；不证明 ArkUI 页面或完整应用构建。
- `npm run validate:arkui-syntax` 通过：证明声明式页面/组件可通过官方 `ets-loader` UI 语法、装饰器与入口规则校验；不证明转换代码生成、语义类型检查或完整应用构建。
- `npm run validate:arkui-transform` 通过：证明 5 个声明式页面/组件可由官方 `processUISyntax` 转换并由 `es2abc` 生成 ABC；使用固定验证资源 ID，不证明 hvigor 工程模型与集成模块解析、生产资源编译与 ID 分配、完整应用链接或设备运行。
- `npm run validate:arkts-semantic` 通过：证明全部主源码已通过独立语法/语义与项目级 ArkTS linter 检查，当前错误和警告均为 0；后续诊断仍保留在证据中，不证明 hvigor 集成或完整应用构建。
- `npm run validate:android-host` 通过：证明 Android Java/CameraX/Bridge、测试源码及原生宿主/测试 APK 可构建；不证明完整 ArkTS 或完整 ArkUI-X APK。
- `npm run validate:android-runtime -- --device <device-id>` 通过：证明原生宿主 APK 在该设备安装、启动并能打开 CameraX 页面；不证明 ArkTS 产品页面或物理相机拍摄。
- `npm run validate:android-avd-matrix` 通过：证明脚本可安全接管自身启动的 API 26/API 33 AVD，自动构建、安装、冷启动并完成两档原生宿主仪器测试；不证明完整 ArkUI-X 应用、物理相机拍摄或 Android 真机兼容性。
- `npm run validate:ios-host-source` 通过：证明 iOS 工程配置以及 Objective-C 宿主源码可通过 Command Line Tools Mac Catalyst 兼容头和 ArkUI-X Bridge 头的 ARC/API 类型检查并生成 arm64 Mach-O 对象；不证明 iPhoneOS/iPhoneSimulator SDK 编译、iOS 13 可用性、链接、安装或运行。
- `ace build` 通过：证明对应平台构建产物生成，不证明安装和运行。
- `ace run` 与能力矩阵通过：才可登记该平台设备能力完成。
- HarmonyOS、Android、iOS 均完成最低版本和主流版本验证后，才能批准 `client_capability_validation`。
