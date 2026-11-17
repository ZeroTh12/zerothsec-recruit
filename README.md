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

**架构：纯静态零基建。学生与你都不需要访问 GitHub，也不需要 Cloudflare/令牌。**

```
学生（04 页，登录门禁）
  └─ 登录：GitHub 用户名 + 真实姓名 + 四条战线方向（存本机浏览器），登录后才见题目/排行榜
  └─ 每日发题制：batches.json 配 start(周一) + daily(每天新题量，一周=daily×7 为一个周期)；
     每天 0 点解锁 daily 道新题，周日 23:59:59 周期截止，下周自动换下一段题；
     全题池按 难度→类别→题号 顺序切片，任何一天/任何一周绝不重题
  └─ 提交：题卡内「上传 .md 文件」→ 存入本机提交箱（可回看、显示审核状态）
     + 把同一个文件发到招新答疑 QQ 群（这就是"统一上交"通道）
教练（隐藏管理页 zs-coach-k7x2.html，站内无链接、地址仅教练知晓、noindex）
  └─ 收件箱：QQ 群文件整批拖入/粘贴 → 查看全文/编辑/删除
  └─ AI 接口：「复制待审 AI 包」→ 任意 AI 评审 →「导入 AI 结论」批量填入
  └─ 逐题 通过(分数)/打回(理由)（缓存在教练浏览器，关页不丢）→「复制发布包」
发布：把发布包内容交给助手说「发布结果」，或本地 git 覆盖 assets/data/results.json 推送
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
5. 每天题量/起始周：编辑 `assets/data/batches.json` 的 `daily` 与 `start`（每日自动解锁、每周自动换段，无需逐周发批）

### 队员流程

登录（GitHub 用户名 + **真实姓名** + **四条战线方向**，本机保存）→ 登录后才出现
本方向题库 → **每天 0 点解锁 3 道新题**，一周 21 题一个周期（周日 23:59 截止，下周自动换下一段，绝不重题）→
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
- **PAT 不能写进 `wp-config.js`**：公开仓库里的 GitHub 令牌会被 push protection 拦截、被 secret scanning 自动吊销。
  教练管理页支持**运行时粘贴令牌**（仅存本浏览器会话），即可对 `submissions/` 做增删改查与代入库
- 学生"上传即入库"的全自动方案需要一层免费服务端中转（Cloudflare Worker，见下），**当前采用零基建模式**：上传=本机提交箱 + QQ 群上交，教练管理页收件箱审核
- 审核结果的真实门禁在 GitHub 仓库写权限：只有教练能提交 `results.json` 与 `batches.json`
- 管理页 `zs-coach-k7x2.html` 站内零链接 + noindex，但公开仓库文件列表可见其存在——页面本身不含数据，无实质风险

## （可选升级，当前未启用）学生直连入库：Cloudflare Worker 中转

1. dash.cloudflare.com → Workers & Pages → Create Worker → 命名 `zs-submit` → 粘贴 `tools/submit-worker.js` 全文 → Deploy
2. Worker Settings → Variables and Secrets → 添加两个 Secret：
   - `GH_TOKEN` = 细粒度 PAT（仅 zerothsec-recruit 仓库 Contents 读写）
   - `COACH_KEY` = 自定教练口令（管理页发布/删除时输入一次）
3. 把 `https://zs-submit.<用户名>.workers.dev` 填入 `assets/js/wp-config.js` 的 `relay` 并推送

之后：学生上传 .md → 经 Worker 写入仓库 `submissions/`（学生不碰 GitHub）；
教练管理页拖入审核、录入结论 → 点「⚡ 一键发布」经 Worker 写回 `results.json`（教练也不碰 GitHub）。

### AI 辅助审查接口（管理页）

- 「🤖 复制待审 AI 包」：把所有未审 writeup（含题目标题、满分、正文）打包成评审提示词复制给任意 AI
- 「📥 导入 AI 结论」：AI 按约定每行输出 `{"name","id","status","score","reason"}` JSON，粘贴回即可批量填审核结论，人工核对后一键发布
