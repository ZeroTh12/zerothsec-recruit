/* ZEROTHSEC 提交系统配置 —— 改成你自己的仓库后 push 即生效 */
window.WP_CONFIG = {
  /* 提交/审核所在的 GitHub 仓库（writeup 文件直接存进仓库 submissions/ 目录） */
  repo: "ZeroTh12/zerothsec-recruit",
  /* 教练 GitHub 用户名 */
  coach: "ZeroTh12",
  /* writeup 存放目录 */
  subDir: "submissions",
  /* Fine-grained PAT（仅本仓库 Contents: read & write）。
     生成后粘贴到这里并 push，学生上传的 writeup 就会自动存入仓库；
     留空则退回"本机存档 + 发 QQ 群"模式。
     ⚠️ 本文件公开可见：务必用单仓库、仅 Contents 读写权限的细粒度令牌，可随时吊销轮换。 */
  token: "",
};
