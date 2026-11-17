/* ZEROTHSEC 提交系统配置 —— 改成你自己的仓库后 push 即生效 */
window.WP_CONFIG = {
  /* 提交/审核所在的 GitHub 仓库（writeup 文件直接存进仓库 submissions/ 目录） */
  repo: "ZeroTh12/zerothsec-recruit",
  /* 教练 GitHub 用户名 */
  coach: "ZeroTh12",
  /* writeup 存放目录 */
  subDir: "submissions",
  /* ⚠ 不要把 PAT 写在这里：公开仓库里的令牌会被 GitHub 自动吊销（push 也会被拦截）。
     教练管理页 zs-coach-k7x2.html 支持运行时粘贴令牌（仅存本浏览器会话）用于增删改查。
     学生"上传即入库"需要服务端中转（如 Cloudflare Worker，见 README），
     未配置中转时学生上传 = 本机存档 + 发 QQ 群、由教练代入库。 */
  token: "",
  /* 学生直连入库中转地址（Cloudflare Worker，见 README 与 tools/submit-worker.js）。
     留空 = 学生上传仅本机存档 + QQ 群兜底。填了之后学生一键入库，令牌不进公开页面。 */
  relay: "",
};
