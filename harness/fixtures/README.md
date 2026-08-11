# Fixture 约定

当前保留首个不含真实学生数据的合成测试集 `multi-grid-v1`，用于已批准的 `mobile-v2` 原型和微信小程序/评测服务的拍照、多字结果、图片质量失败、像素切格和问题清单验证。它只用于研发冒烟与契约回归，不是生产评测集。

## 目录

- `inputs/`：练字图片或其他被确认的输入形式。
- `expected/`：经人工复核的识别、分类、问题说明与评分期望。
- `metadata/`：样例来源、授权、脱敏状态、适用场景和版本信息。

- `inputs/multi-grid-clear-v1.png`：4×4 方格、16 个合成手写风格字；目标“山”故意渲染为“出”。
- `inputs/multi-grid-blurred-v1.png`：高斯模糊负例。
- `inputs/multi-grid-cropped-v1.png`：右侧方格裁切负例。
- `expected/multi-grid-clear-v1.assessment.json`：覆盖正常、错字、不美观、待确认四类的预期展示数据。
- `expected/assessment-result-v2.contract.json`：覆盖正常、错字、待纠偏、不确定、失败五类的 V2 接口草案样例。
- `expected/character-growth-v1.contract.json`：覆盖五维评分、四次成长曲线和重点字库入库状态的契约样例。
- `expected/image-quality-v1.json`：三张图片的质量处理期望。
- `metadata/multi-grid-v1.json`：来源、字体用途、尺寸和 SHA-256。

遗留图片生成脚本仍位于冻结的 `client/` 验证链中；重新生成后必须运行以下命令校验哈希、尺寸、V1 迁移来源和 V2 契约草案：

```bash
cd client
npm run fixtures:generate
npm test
cd ..
./harness/bin/validate
```

## 数据治理

- 默认使用经过授权的合成或脱敏样例。
- 不记录学生姓名、学校、班级、账号、地理位置等直接身份信息。
- 原始图片与人工标注必须具有可追溯的来源和授权记录。
- 标准字体、字形和笔顺数据需记录许可证与版本。
- 训练数据、演示数据和验收数据必须隔离，避免评估污染。
- 不用单一“正确答案”掩盖书写评价中的合理主观差异；争议样例应保留复核记录。

`multi-grid-v1` 由仓库脚本在本机生成，不包含姓名、账号或真实书写轨迹。脚本仅将 macOS 系统自带 `HanziPenSC-W3` 栅格化为内部非发布测试图片，不复制或分发字体文件；该夹具不能作为模型准确率或教育评价基线。
