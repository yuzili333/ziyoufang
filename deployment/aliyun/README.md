# lilicoconut.me ECS 共存部署

现有网站继续由主机 Nginx 承载。本项目只代理`/api/v1/*`，API容器仅监听`127.0.0.1:18080`，不得把18080或内部评测端口加入公网安全组。

## 主机准备

1. 将`host-nginx-api-limits.conf`包含到 Nginx `http`上下文。
2. 将`host-nginx-api-locations.conf`包含到`lilicoconut.me`现有 HTTPS `server`块。
3. 保留网站原有根路径、证书和HSTS配置；修改前备份主机Nginx配置。
4. 执行`nginx -t`，只有成功后才允许`nginx -s reload`。

生产环境文件固定为`/opt/ziyoufang/secrets/prod.env`，权限仅允许部署用户读取。MySQL CA固定挂载到`/opt/ziyoufang/secrets/mysql-ca.pem`。域名配置使用：

```text
PUBLIC_API_BASE_URL=https://lilicoconut.me
OSS_REGION=cn-chengdu
OSS_ENDPOINT=https://oss-cn-chengdu-internal.aliyuncs.com
OSS_PUBLIC_UPLOAD_HOST=https://lilicoconut.oss-cn-chengdu.aliyuncs.com
OSS_PUBLIC_ACCESS_HOST=https://lilicoconut.oss-cn-chengdu.aliyuncs.com
OSS_BUCKET=lilicoconut
ASSESSMENT_PROVIDER_MODE=font-smoke
```

## MySQL安装与内部地址

生产部署契约登记的数据库地址为`ziyoufang-mysql:3306`，数据库名为`ziyoufang`。该地址是Docker网络`ziyoufang_private`中的稳定DNS别名，不是公网IP或可能变化的容器IP。

仓库使用固定镜像`mysql:8.4.11-oraclelinux9`在同一Compose中创建MySQL，加入`ziyoufang_private`并设置网络别名`ziyoufang-mysql`。数据库只使用`expose: 3306`，不得把3306发布到主机公网；数据保存在命名卷`ziyoufang_mysql_data`。

首次安装前执行：

```sh
sudo deployment/aliyun/prepare-mysql-tls.sh
sudo test -e /opt/ziyoufang/secrets/prod.env || sudo install -o root -g root -m 600 deployment/aliyun/prod.env.example /opt/ziyoufang/secrets/prod.env
sudoedit /opt/ziyoufang/secrets/prod.env
```

必须把所有`replace-with-*`替换为实际密钥，且数据库应用密码与root密码不得相同。生产环境文件应配置：

```text
MYSQL_ADDRESS=ziyoufang-mysql
MYSQL_PORT=3306
MYSQL_DATABASE=ziyoufang
MYSQL_USERNAME=ziyoufang_app
MYSQL_USER=ziyoufang_app
MYSQL_PASSWORD=<独立应用账号密码>
MYSQL_ROOT_PASSWORD=<独立root密码>
MYSQL_SSL_MODE=VERIFY_IDENTITY
MYSQL_SSL_CA_FILE=/run/secrets/mysql-ca.pem
```

`prepare-mysql-tls.sh`生成私有CA和SAN包含`ziyoufang-mysql`的服务端证书；MySQL强制安全传输，API使用`VERIFY_IDENTITY`校验服务身份。CA私钥不得挂载到任何应用容器。

MySQL官方镜像只在空数据卷首次初始化时读取`MYSQL_DATABASE`、`MYSQL_USER`、`MYSQL_PASSWORD`和`MYSQL_ROOT_PASSWORD`。初始化后不得只修改环境变量来轮换数据库密码，应使用`ALTER USER`完成轮换并同步更新环境文件。

## 发布顺序

1. 首次安装时记录“无既有MySQL数据”，备份现有Nginx配置，并记录当前网站首页响应与证书信息。
2. 在仓库根目录完成测试和镜像构建，只发布已通过CI的`main`提交。
3. 执行`deployment/aliyun/deploy.sh`；脚本使用主机Nginx覆盖文件运行迁移并启动API、Worker和评测容器，不启动容器edge。
4. 先验证`curl --fail http://127.0.0.1:18080/health`，再安装Nginx include并平滑重载。
5. 验证网站首页未变化，且`https://lilicoconut.me/api/v1/health`返回`200`。
6. 微信后台登记：request为`https://lilicoconut.me`，uploadFile/downloadFile均为`https://lilicoconut.oss-cn-chengdu.aliyuncs.com`，socket留空。

`font-smoke`只证明基础设施和许可字体可用。真实OCR和混元门禁通过前，评测不可对用户宣称成功。

## 回滚

API或网站验证失败时，立即恢复Nginx备份并平滑重载，随后停止本次容器版本并恢复上一提交。数据库迁移必须保持向后兼容，不执行破坏性降级；恢复后再次验证网站首页和原有服务。
