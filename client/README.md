# 字有方客户端

字有方正式客户端工程，采用 ArkUI-X 6.0.0 Release + ArkTS，以一套公共 ArkTS 业务和页面代码覆盖 HarmonyOS、Android、iOS。

## 工程基线

- HarmonyOS 6 / API 20
- Android 8 / API 26
- iOS 13
- Bundle ID：`com.ziyoufang.client`
- MVP：手机端交付，首版保留 `<600vp`、`600–839vp`、`>=840vp` 三档响应式结构

工程从 ArkUI-X 官方 `samples` 仓库 `ArkUI-X-6.0-Release` 分支的 `BasicFeature/HelloWorld` 模板建立，模板提交为 `d099631864782df6ec7bed485eb3a687afac4d94`。

## 目录

```text
client/
├── AppScope/                 # HarmonyOS 应用级配置与资源
├── entry/                    # 公共 ArkTS 页面、领域模型、服务契约和测试
├── .arkui-x/android/         # Android 宿主工程
├── .arkui-x/ios/             # iOS 宿主工程
├── contracts/                # 可执行的跨端能力与状态契约
├── scripts/                  # 静态、契约、工具链及平台验证工具
└── design/                   # 首版品牌图标源文件
```

业务层只能依赖 `entry/src/main/ets/services` 中的接口。相机、相册、文件、数据库和网络的具体实现通过适配器注入，页面不得直接访问平台 API。

当前公共适配器已实现：

- `PhotoAccessHelper` 单图选择与图片尺寸读取；
- `file.fs` 沙箱图片复制、读取、删除和缓存清理；
- `file.statvfs` 可用空间检查；
- `relationalStore` 练习任务、幂等标识、状态与多字结果持久化；
- `preferences` 轻量设置读写；
- `net.http` multipart 图片上传、进度、取消、超时、重试及幂等请求头。

相机继续通过 `PlatformCameraBridge` 隔离，源码实现已落地：HarmonyOS 使用 Camera Kit `cameraPicker` 系统拍照面板；Android 使用私有 CameraX `Activity`；iOS 使用全屏 AVFoundation `UIViewController`。Android/iOS 通过同名 ArkUI-X JSON Bridge 回传图片引用、尺寸、方向和错误状态。三端实现仍须经过各端编译和设备验证后才可登记为通过。

## 本地验证

无需厂商 SDK 的结构与契约检查：

```bash
npm test
```

该命令同时核验 `harness/fixtures/multi-grid-v1` 合成夹具的文件哈希、图片尺寸、16 字边界框以及四类结果覆盖。夹具可通过 `npm run fixtures:generate` 确定性重建。

使用 OpenHarmony API 20 SDK 内的官方 Ark 编译器，为非 UI 的领域模型、服务、适配器和 EntryAbility 生成 ABC 字节码：

```bash
npm run validate:arkts-core
```

该门禁当前覆盖 20 个非 UI ArkTS 文件（包括主题令牌）；ArkUI 声明式页面和组件由下一项独立转换门禁覆盖，完整应用仍必须通过 hvigor 集成构建验证。

使用 OpenHarmony API 20 SDK 自带的官方 `ets-loader` 预处理器校验 ArkUI 声明式源码、组件装饰器和入口页约束：

```bash
npm run validate:arkui-syntax
```

该门禁当前覆盖 5 个声明式页面/组件，只证明 `ets-loader` UI 语法预处理和规则校验通过；不生成转换后代码，不替代 ArkTS 语义类型检查、hvigor 工程模型、完整打包或设备运行。

使用官方 `ets-loader` 完整编译配置和 `processUISyntax` 将 5 个声明式页面/组件转换为增量更新 JavaScript，再由官方 `es2abc` 生成 Ark 字节码：

```bash
npm run validate:arkui-transform
```

该门禁逐文件隔离执行，要求转换结果包含 `ViewPU` 与 `observeComponentCreation2`，并记录转换代码和 ABC 的 SHA-256。它使用固定的验证资源 ID，只证明声明式 UI 转换和字节码生成；不覆盖 hvigor 工程模型及集成模块解析、生产资源编译与 ID 分配、应用链接打包或设备运行。

使用 SDK 自带 `etsStandaloneChecker` 和 ArkUI-X Bridge 声明，对全部主源码执行独立语法、语义和 ArkTS 限制规则检查：

```bash
npm run validate:arkts-semantic
```

当前覆盖 25 个 `.ets` 文件，源码语义错误、项目级 ArkTS linter 错误和警告均为 0。检查器仍会把后续出现的 API 异常处理、权限提示和弃用 API 等警告完整写入证据；警告本身不作为发布通过结论。该门禁不替代独立 ArkUI 转换门禁、hvigor 工程模型、完整打包或设备运行。

检查本机三端工具链（缺少组件时会以非零状态退出）：

```bash
npm run preflight:toolchain
```

预检同时检查 HarmonyOS、Android、iOS 设备是否实际连接。公开发布的 DevEco CLI 可固定安装为 `@deveco/deveco-cli@1.2.0-stable`，但它不包含底层 DevEco Studio/Command Line Tools，不能代替 HarmonyOS SDK、ohpm 或许可。完整恢复步骤见 `harness/validation/toolchain-recovery.md`。

编译 Android 原生宿主的 Java/CameraX/Bridge 层，运行本地单测，并生成原生宿主 Debug APK 与仪器测试 APK：

```bash
npm run validate:android-host
```

该门禁从本机 ArkUI-X SDK 引用官方 Android adapter JAR 与原生引擎，在 Gradle 构建目录中组装验证产物，不向仓库源码目录复制厂商二进制。它仍不等同于完整公共 ArkTS 编译或完整 ArkUI-X APK；证据写入被 Git 忽略的 `harness/results/`。

在明确指定的 Android 设备或模拟器上安装原生宿主与仪器测试 APK，验证入口 Activity、进程存活和 CameraX 原生拍摄页启动：

```bash
npm run validate:android-runtime -- --device <device-id>
```

本机已准备 `ziyoufang_api26_arm64` 与 `ziyoufang_api33_arm64` 两档 AVD。运行证据只覆盖 Android 原生宿主，不覆盖 ArkTS 产品页面或物理相机拍摄。

在没有其他在线 Android 模拟器时，可用一条命令自动构建宿主、依次启动两档 AVD、执行上述运行验证并正常关闭由脚本启动的模拟器：

```bash
npm run validate:android-avd-matrix
```

矩阵门禁要求 API 26 和 API 33 均通过，生成两份单档证据及一份脱敏汇总证据。为避免影响开发者已有会话，检测到预先在线的模拟器时会直接拒绝运行；它不会关闭不是由自身启动的模拟器。

使用 Apple Command Line Tools 的 Mac Catalyst 兼容头和 ArkUI-X iOS Bridge 头，对 iOS 工程配置以及全部 Objective-C 宿主源码执行 ARC/API 类型检查并生成 arm64 Mach-O 对象文件：

```bash
npm run validate:ios-host-source
```

该门禁当前覆盖 5 个 `.m` 文件，逐文件编译对象并记录大小与 SHA-256，同时使用 `plutil` 校验 Xcode 工程与 `Info.plist`。它不使用 iPhoneOS/iPhoneSimulator SDK，不验证 iOS 13 API 可用性、链接、打包、安装或设备运行；完整 iOS 结论仍必须由完整 Xcode 和 iOS 设备形成。

生成可复现的平台构建/运行证据（输出写入被 Git 忽略的 `harness/results/`）：

```bash
# 环境证据
npm run validate:platforms -- --phase check

# 三端 Debug 构建；也可用 --platform android 等只构建一端
npm run validate:platforms -- --phase build --platform all

# 指定真机完成构建、安装和启动
npm run validate:platforms -- --phase run --platform android --device <device-id>
```

iOS 无签名模拟器构建可追加 `--platform ios --simulator`；相机验收必须使用具备相机能力的真机。执行器不会接受许可、修改签名设置或自动选择设备。

完整三端构建需要 ArkUI-X 6.0.0 SDK、DevEco Studio/HarmonyOS SDK、Android SDK/JDK 17 和完整 Xcode。安装完成后按仓库根目录 `harness/validation/arkui-x-capability-verification.md` 执行真机构建与运行验证。

ArkUI-X SDK 固定使用官方 `6.0.0.103 Release` 包，安装形态为 `${ARKUIX_SDK_HOME}/20/arkui-x/`。SDK、Android、HarmonyOS 与 Apple 的许可由开发者本人通过官方工具确认，不纳入仓库，也不由脚本自动接受。

## 隐私边界

- 客户端不保存模型供应商密钥。
- 离线允许拍摄和本地保存，联网后再向业务评测服务提交。
- MVP 不包含教师复核、人工审核和任何周期报告。
- 测试只能使用合成或已授权、脱敏的练字图片。
