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

**架构：纯静态。学生端全程不接触 GitHub；审核结果由教练发布为 `assets/data/results.json`。**

```
学生（04 页，登录门禁）
  └─ 登录：GitHub 用户名 + 真实姓名 + 四条战线方向（存本机浏览器）
  └─ 登录后才显示：题目/提交、排行榜、说明（审核台仅教练账号可见）
  └─ 题目严格按注册方向发放（batches.json 按战线 key + 题号区间，EASY→HARD，含截止倒计时）
  └─ 提交：页面内写 Writeup → 生成 <姓名>-<题号>.md 下载 → 发教练邮箱 / QQ 群
教练（本地审核，学生看不到过程）
  └─ 收到 md 文件 → 可粘贴给 AI 辅助评审拿分数建议 → 自己定夺
  └─ 04 页「审核台」逐题录入 通过(分数)/打回(理由) → 复制 results.json
  └─ GitHub 网页端把内容覆盖到 assets/data/results.json 并提交 → 学生端自动更新
网页（04 页）
  └─ 拉取 results.json → 题目卡显示 通过/打回/理由，排行榜按人聚合
```

### 题库（可无限扩充）

- `tools/gen_bank.py`：参数化模板 × 随机变体生成器。5 类别 × 3 难度（easy→medium→hard 递进），默认 287 题
- 扩充：`python tools/gen_bank.py --scale 2`（题量翻倍），改模板/词表可无限出新题
- 题目支持 `link` 字段挂外部题库平台（CTF2 等）题源链接；外部平台题目需构建时导入打包（浏览器 CORS 限制，运行时不能直接跨站拉题）
- 题库经四层管线加密（zlib 压缩 → SHA256 异或流 → 置换 Base64 字母表 → 分片反转）输出 `assets/data/bank.enc.js`，flag 藏在密文里，页面运行时经 `assets/js/bank.js` 解密（含纯 JS SHA-256 回退，非安全上下文也可用）
- 明文答案在 `tools/bank_plaintext.json`（**已被 .gitignore 排除，教练本地留档，勿提交**）

### 教练操作

1. 收到学生的 `<姓名>-<题号>.md`（邮箱 / QQ 群）
2. 可把内容粘贴给 AI 辅助审查拿分值建议 → 自己定夺
3. 用 ZeroTh12 账号登录 04 页 → 审核台逐题录入：通过（分数）/ 打回（理由）
4. 「复制 results.json」→ GitHub 网页端覆盖 `assets/data/results.json` → Commit，学生端即生效
5. 发批次：编辑 `assets/data/batches.json`（战线 key：websec/rpwn/forensics/defense，批号、deadline、ranges 题号区间），保存即生效，倒计时自动跳动

### 队员流程

登录（GitHub 用户名 + **真实姓名** + **四条战线方向**，本机保存）→ 登录后才出现
只看自己方向的题目批次 → 解题 + flag 校验 → 页面内提交（生成 **`<姓名>-<题号>.md`** 下载，
发给教练邮箱 / QQ 群，全程不跳转 GitHub）→ 教练发布结果后看到 通过计分上榜 / 打回理由重做。

## 本地运行

```bash
npm install
npm run dev
```

浏览器访问终端显示的地址（默认 `http://127.0.0.1:5173/`）。

## 部署

纯静态，GitHub Pages 从仓库根目录发布（已含 `.nojekyll`），无需构建。

## 安全模型（如实说明）

- 题库多层加密可防直接读出明文与 flag，但解密逻辑在前端 JS，属高门槛混淆而非绝对防护
- 审核结果的真实门禁在 GitHub 仓库写权限：只有教练能提交 `results.json` 与 `batches.json`
- 纯静态架构下不存在服务器密钥泄露面；`wp-config.js` 里只有仓库名与教练账号名等公开信息
