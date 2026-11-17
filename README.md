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
| 04 提交 | `writeup.html` | Writeup 提交系统：登录门禁、CTF² 真题、星期制批次倒计时、上传提交档案、排行榜 |

## 04 提交审核系统（Writeup）

**架构：纯静态。学生端全程不接触 GitHub；星期制自动发题；审核在隐藏教练页完成。**

```
学生（04 页，登录门禁）
  └─ 登录：GitHub 用户名 + 真实姓名 + 四条战线方向（存本机浏览器），登录后才见题目/排行榜
  └─ 星期制批次：batches.json 配 start(周一) + weekly(每周题量)；
     第 N 周题目 = 方向题库按 难度→类别→题号 排序切片，周日 23:59:59 截止，下周自动换新题
  └─ 提交：题卡内「上传 .md 文件」控件 → 校验规范命名 <姓名>-<题号>.md → 存入本机提交档案；
     文件本体发 QQ 群给教练（纯静态无服务器，文件无法自动上传后台——README 如实说明）
教练（隐藏审核页 zs-coach-k7x2.html，站内无链接、地址仅教练知晓、noindex）
  └─ QQ 群收文件 → 整批拖入审核页 → 逐题看全文 → 通过(分数)/打回(理由)
  └─ 复制导出的 results.json → GitHub 网页端覆盖 assets/data/results.json 提交
网页（04 页）
  └─ 拉取 results.json → 题卡显示 通过/打回/理由，排行榜按人聚合
```

### 题库（CTF² 平台真题）

- **题目来源：`tools/import_ctf2.py` 从 CTF² 平台（ctf2.dasctf.com，BUUCTF 练习场）拉取真实赛题**，
  按类别（WEB/CRYPTO/MISC/REVERSE/PWN）× 难度（Easy/Medium/Hard）各取前 N，按解题人数降序（越多人解出越新手友好），
  站内连续编号 WEB-01…，每题带「去平台做题」直达链接
- 重新拉题：`python tools/import_ctf2.py --per-diff 20`（token 放 `tools/.ctf2_token`，已 gitignore）
- 平台真题的 flag 在 CTF² 站内提交验证，本站不做离线 flag 校验；学生拿 flag 后按 `<姓名>-<题号>.md` 交 Writeup，教练审核计分
- `tools/gen_bank.py` 保留为备用自造题生成器（当前未使用）
- 题库经四层管线加密（zlib 压缩 → SHA256 异或流 → 置换 Base64 字母表 → 分片反转）输出 `assets/data/bank.enc.js`，页面运行时经 `assets/js/bank.js` 解密（含纯 JS SHA-256 回退，非安全上下文也可用）
- 明文留档在 `tools/bank_plaintext.json`（**已被 .gitignore 排除，教练本地留档，勿提交**）

### 教练操作

1. 在 QQ 群收齐本周 `<姓名>-<题号>.md` 文件
2. 打开隐藏审核页 `zs-coach-k7x2.html`（地址勿外发；页面不存数据，可放心）→ 文件整批拖入
3. 可把 Writeup 内容粘贴给 AI 辅助评审拿分数建议 → 自己定夺
4. 逐题点 通过（分数）/ 打回（理由）→ 复制导出的 results.json → GitHub 网页端覆盖 `assets/data/results.json` → Commit，学生端即生效
5. 每周题量/起始周：编辑 `assets/data/batches.json` 的 `weekly` 与 `start`（星期制自动滚动，无需逐周发批）

### 队员流程

登录（GitHub 用户名 + **真实姓名** + **四条战线方向**，本机保存）→ 登录后才出现
本方向题库 → **每周自动一批**（周一起始、周日 23:59 截止、下周换新题，易→难递进）→
点「去平台做题」在 CTF² 解题拿 flag → 下载模板写 `<姓名>-<题号>.md` →
题卡内「上传 .md 提交」存档 + 把文件发 QQ 群 → 教练审核后看到 通过计分上榜 / 打回理由重做。

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
