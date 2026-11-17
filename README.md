# ZEROTHSEC · 网络安全工作室招新站

江工职院网络安全工作室（ZEROTHSEC）2026 秋季招新网站。**纯静态，无后端，无数据库**——
提交审核数据全部存放在 GitHub（Issues + Actions 自动聚合），题库与排行榜多层加密存储。

## 页面结构

| 页面 | 文件 | 内容 |
| --- | --- | --- |
| 00 首页 | `index.html` | 工作室介绍、四条战线方向、靶场入口 |
| 01 专业 | `major.html` | 网络空间安全专业档案：课程路线、能力画像、就业方向、证书 |
| 02 招新 | `recruit.html` | 招新时间线、方向要求、工作室铁律、FAQ、报名邮件生成器 |
| 03 CTF | `ctf.html` | 动态新手靶场：22 道题库随机抽 4 题、每人独立 flag、像素小游戏 |
| 04 提交 | `writeup.html` | Writeup 提交审核系统：身份登记、加密题库、批次倒计时、排行榜、审核台 |

## 04 提交审核系统（Writeup）

**架构：纯静态 + GitHub 全家桶（Issues 当提交队列，Actions 当计算引擎）**

```
队员（GitHub 账号）
  └─ 04 页登记身份（本地保存）→ 选方向 → 看批次倒计时 → flag 校验
  └─ 「提交 Writeup」→ 自动打开 GitHub Issue 表单（标题 <姓名>-<题号>.md，正文带 ZSWP 元数据）
教练（仓库写权限 = 审核权限）
  └─ 审核台看队列（公开 API 只读拉取，无需凭据）→「复制全部待审」给 AI 辅助
  └─ 在 Issue 上打标签：accepted + score/80（通过计分）/ rejected + 评论（打回）
GitHub Actions（.github/workflows/leaderboard.yml）
  └─ 监听标签变动 → tools/aggregate.py 聚合全部 Issue → 多层加密生成 leaderboard.enc.js → 自动提交回仓库
网页（04 页）
  └─ 前端解密排行榜 → 排行 / 我的进度 / 打回理由 / 完成度实时更新
```

### 题库（可无限扩充）

- `tools/gen_bank.py`：参数化模板 × 随机变体生成器。5 方向 × 3 难度（easy→medium→hard 递进），默认 287 题
- 扩充：`python tools/gen_bank.py --scale 2`（题量翻倍），改模板/词表可无限出新题
- 题库经四层管线加密（zlib 压缩 → SHA256 异或流 → 置换 Base64 字母表 → 分片反转）输出 `assets/data/bank.enc.js`，flag 藏在密文里，页面运行时经 `assets/js/bank.js` 解密
- 明文答案在 `tools/bank_plaintext.json`（**已被 .gitignore 排除，教练本地留档，勿提交**）

### 教练操作

1. 队员开始提交后，打开 04 页「审核台」（或 GitHub Issues 按 `writeup` 标签筛选）
2. 「复制全部待审」→ 粘贴给 AI 辅助审查拿分值建议 → 自己定夺
3. 在 Issue 打标签：`accepted` + `score/80`（分数自定）；打回则 `rejected` 并评论写理由
4. 打标签需要仓库写权限——这就是教练权限的门禁，无需任何密码
5. 发批次：编辑 `assets/data/batches.json`（战线 key：websec/rpwn/forensics/defense，批号、deadline、ranges 题号区间），保存即生效，倒计时自动跳动

### 队员流程

身份登记（GitHub 用户名 + **真实姓名** + **四条战线方向**，本地保存）→ 只看自己方向的题目批次 →
解题 + flag 校验 → 提交 Writeup（自动生成 GitHub Issue，标题即规范命名 **`<姓名>-<题号>.md`**）→
通过计分上榜；打回看评语重做。审核台仅教练账号（`wp-config.js` 的 `coach`）可见。

## 本地运行

```bash
npm install
npm run dev
```

浏览器访问终端显示的地址（默认 `http://127.0.0.1:5173/`）。

## 部署

纯静态，GitHub Pages 从仓库根目录发布（已含 `.nojekyll`），无需构建。
首次部署确认：Settings → Actions → General → Workflow permissions 勾选 **Read and write permissions**（排行榜自动提交需要）。

## 安全模型（如实说明）

- 题库/排行榜多层加密可防直接读出明文与 flag，但解密逻辑在前端 JS，属高门槛混淆而非绝对防护
- 提交与计分的真实门禁在 GitHub 权限体系：只有仓库写权限能打标签、改批次文件
- 纯静态架构下不存在服务器密钥泄露面；`wp-config.js` 里只有仓库名等公开信息
