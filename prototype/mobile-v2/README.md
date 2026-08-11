# 字有方 mobile-v2 可点击原型

这是原型门禁阶段的交互成品，不是正式微信小程序工程。它使用固定合成图片与模拟评测数据，不调用微信登录、云开发、OCR、图像算法或大模型服务。

## 本地预览

```bash
npm ci --prefer-offline --no-audit --no-fund
npm run dev -- --host 0.0.0.0 --port 4173 --strictPort
```

默认从首次使用流程开始。结果页可直接打开：

```text
http://127.0.0.1:4173/?screen=results
```

PAD 信息架构设计板可直接打开：

```text
http://127.0.0.1:4173/pad-preview.html
```

该设计板用于验证后续 PAD 的主从布局和折叠规则，不代表 PAD 已纳入微信小程序 MVP 首期交付。

## 联合评审快捷状态

| 状态 | 查询参数 |
| --- | --- |
| 标准多字结果 | `?screen=results` |
| 错字判定 | `?screen=results&state=wrong` |
| 稳定性样本积累中 | `?screen=results&samples=2` |
| 第 2 次练习成长页 | `?screen=growth&samples=2` |
| 建议服务降级 | `?screen=results&resultMode=degraded` |
| 部分完成 | `?screen=results&resultMode=partial` |
| 离线保存 | `?screen=quality&mode=offline` |
| 图片模糊 | `?screen=quality&mode=blurred` |
| 部分方格可处理 | `?screen=quality&mode=partial` |
| 重点字库 | `?screen=wordbook` |
| 脱敏分享与删除 | `?screen=share` |

## 验证

```bash
npm run check:runtime
npm run build
```

手机视觉对照与交互证据见 [`design-qa.md`](./design-qa.md)，PAD 信息架构证据见 [`pad-design-qa.md`](./pad-design-qa.md)。联合评审通过前，不得据此创建或解锁正式 `miniprogram/`、云函数、BFF 或智能评测服务目录。
