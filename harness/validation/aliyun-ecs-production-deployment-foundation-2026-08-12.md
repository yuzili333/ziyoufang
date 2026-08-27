# 阿里云 ECS 一体化生产部署基础

- 日期：2026-08-12
- 状态：`blocked-external-console`
- 结论：仓库内迁移基础已建立并通过静态及本地测试；API/OSS域名、MySQL内部地址和责任人已登记，真实 ECS、MySQL恢复演练、微信后台绑定和SSH受限来源尚未完成，不得视为生产就绪。

## 已落地

- 小程序已删除 `wx.cloud` 调用，改为`wx.login → HTTPS BFF → code2Session`；两小时会话仅保存随机令牌哈希，OpenID只用于即时派生主体键。
- 私有图片通过15分钟、单对象、15MB上限的OSS V4表单授权直传；客户端只持有`mediaId`和 ETag，OSS对象引用不进入公共任务响应。
- `ecs-service`已提供Express API、MySQL 8迁移、配额事务、五分钟任务租约、30秒续租、幂等清理与OSS生命周期适配。
- 评测服务增加Worker专用同步HMAC入口，生产任务不再依赖响应后的`queueMicrotask`或内存任务队列。
- `deployment/aliyun/compose.host-nginx.yaml`停用容器edge并将API仅绑定到`127.0.0.1:18080`；现有主机Nginx只代理`lilicoconut.me/api/v1/*`，网站根路径保持不变。容器edge仅作独立域名回退。
- GitHub `main`推送只运行测试和构建候选镜像；生产部署由受保护`production`环境手动批准。
- MySQL每日一致性备份脚本、7份本地日备保留和OSS备份上传入口已建立；4份周备由OSS生命周期规则在控制台配置。
- Compose已补充固定版本MySQL 8.4容器、持久卷、内部DNS别名、资源上限和健康依赖；私有CA脚本生成包含`ziyoufang-mysql` SAN的服务证书，服务端强制TLS，API执行`VERIFY_IDENTITY`。真实ECS安装和恢复演练仍须留证。

## 明确保留的门禁

1. 已登记`https://lilicoconut.me`和成都OSS公网域名；仍须验证DNS、完整证书链、现有网站无回归及微信后台三类合法域名实际生效。
2. 已登记Docker内部地址`ziyoufang-mysql:3306`和库名`ziyoufang`；仍须验证MySQL 8/InnoDB/UTC/严格模式、TLS CA和最小权限账号，并执行真实迁移与恢复演练。
3. 已登记成都私有OSS Bucket `lilicoconut`；仍须绑定最小权限实例RAM角色，验证内网Endpoint、V4直传和公网签名访问，并配置30天媒体和备份生命周期。
4. 配置微信后台`request`、`uploadFile`和`downloadFile`合法域名并完成三端真机验证。
5. 平台主责和后端备份责任人均已实名登记为`yuzili`。当前Wi-Fi和热点没有稳定公网出口，SSH固定来源明确暂缓且不得登记动态地址；获得固定出口、VPN或堡垒机来源后再限制22端口并关闭本门禁。
6. 吊销对话中公开的微信云托管CLI密钥，检查调用记录；新方案不需要该密钥。
7. 将`/opt/ziyoufang/secrets/prod.env`设为部署用户专属只读，并注入独立的小程序AppSecret和各用途32字节以上密钥。
8. 真实OCR、混元、授权样本、隐私、成本与评分专家门禁通过前，`ASSESSMENT_PROVIDER_MODE`保持`font-smoke`。

执行`npm run check:production-deployment`只验证仓库结构；执行`npm run check:production-deployment -- --require-ready`还要求上述外部登记全部完成。
