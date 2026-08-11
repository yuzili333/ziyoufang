# @ziyoufang/contracts

正式工程共享契约包。`npm run sync:contracts` 从已批准的 Harness 复制 JSON Schema、状态机、云数据模型和无个人信息的合成 fixture；生成文件不得手工修改。

冻结的 ArkUI-X `client/` 不是运行时依赖。新工程测试确认迁移内容稳定后，再单独执行旧工程删除评审。
