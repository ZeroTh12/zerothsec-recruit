/* ==========================================================================
   ZEROTHSEC — Writeup 提交审核系统 v3（assets/js/writeup.js）
   纯静态 · 无后端 · 数据存 GitHub。

   架构：
     - 题库：assets/data/bank.enc.js（多层加密，前端解密，flag 藏在密文里）
     - 批次：assets/data/batches.json（教练在 GitHub 网页端编辑即生效）
     - 提交：队员用 GitHub 账号通过 Issue 模板提交（数据存 GitHub Issues）
     - 审核：教练在 Issue 上打标签 accepted + score/N（或 rejected + 评语评论）
     - 排行：GitHub Actions 监听标签变动，聚合生成加密 leaderboard.enc.js
   身份：本地登记 GitHub 用户名 + 真实姓名 + 方向（提交时自动带入 Issue）。
   ========================================================================== */
(function () {
  "use strict";

  var CFG = window.WP_CONFIG || { repo: "", coach: "" };
  /* 题库原始类别（gen_bank 维度） */
  var CAT_LABEL = { web: "Web", crypto: "Crypto", misc: "Misc", reverse: "Reverse", pwn: "Pwn" };
  /* 工作室四条战线 → 题库类别映射（教练发题只发本方向池子里的题） */
  var TRACKS = {
    websec:    { label: "Web 安全",   cats: ["web", "crypto"] },
    rpwn:      { label: "逆向与 Pwn", cats: ["reverse", "pwn"] },
    forensics: { label: "数字取证",   cats: ["misc"] },
    defense:   { label: "防守与运营", cats: ["misc", "web"] }
  };
  var CAT2TRACK = { web: "websec", crypto: "websec", reverse: "rpwn", pwn: "rpwn", misc: "forensics" };
  var DIFF_LABEL = { easy: "EASY", medium: "MEDIUM", hard: "HARD" };
  var PROFILE_KEY = "zs-wp-profile";
  var SOLVED_KEY = "zs-flag-ok";
  var CTF_SOLVED_KEY = "zs-ctf-solved";

  /* ---------- 小工具 ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function setMsg(node, text, kind) {
    if (!node) return;
    node.textContent = text;
    node.className = "wp-msg" + (kind ? " " + kind : "");
  }
  function fmtTime(t) {
    if (!t) return "—";
    var d = new Date(t);
    function p(x) { return String(x).padStart(2, "0"); }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function countdownText(deadline) {
    var diff = new Date(deadline).getTime() - Date.now();
    if (diff <= 0) return "已截止";
    var d = Math.floor(diff / 86400000);
    var h = Math.floor((diff % 86400000) / 3600000);
    var m = Math.floor((diff % 60000) / 60000);
    var s = Math.floor((diff % 60000) / 1000);
    return (d > 0 ? d + " 天 " : "") + String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }
  function ls(key, fallback) {
    try { return JSON.parse(window.localStorage.getItem(key) || "null") || fallback; }
    catch (e) { return fallback; }
  }
  function lsSave(key, val) {
    try { window.localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  }

  /* ---------- 全局状态 ---------- */
  var profile = ls(PROFILE_KEY, { github: "", name: "", direction: "" });  // 本地身份登记
  /* 旧版按题库类别登记的方向，自动归入对应战线 */
  if (profile.direction && !TRACKS[profile.direction]) {
    profile.direction = CAT2TRACK[profile.direction] || "";
    lsSave(PROFILE_KEY, profile);
  }
  var bank = null;        // { challenges: [...] }
  var batches = null;     // { web:[...], ... }（按题库类别编 key，教练维护）
  var lb = null;          // 排行榜（解密后）
  var lbReady = false;
  var selectedDir = profile.direction || "";
  var view = "tasks";
  var countdownTimer = null;
  var authBox, tabsBox, viewsBox;

  function isCoach() {
    return !!(CFG.coach && profile.github &&
      profile.github.toLowerCase() === String(CFG.coach).toLowerCase());
  }

  function myStatusMap() {
    // { "WEB-01": {status:"accepted", score:80, comment:"", issue:12} }
    var map = {};
    if (!lb || !profile.github) return map;
    var meRow = (lb.members || []).find(function (m) {
      return m.github && m.github.toLowerCase() === profile.github.toLowerCase();
    });
    if (!meRow) return map;
    (meRow.accepted || []).forEach(function (a) { map[a.id] = { status: "accepted", score: a.score, comment: a.comment || "", issue: a.issue }; });
    (meRow.rejected || []).forEach(function (r) { map[r.id] = { status: "rejected", score: 0, comment: r.comment || "", issue: r.issue }; });
    (meRow.pending || []).forEach(function (p) { map[p.id] = { status: "pending", score: 0, comment: "", issue: p.issue }; });
    return map;
  }

  /* ==========================================================================
     数据加载
     ========================================================================== */
  async function loadAll(msgNode) {
    bank = await window.ZSBank.loadBank();
    try {
      var r = await fetch("assets/data/batches.json?ts=" + Date.now(), { cache: "no-store" });
      batches = r.ok ? await r.json() : {};
    } catch (e) { batches = {}; }
    lb = await window.ZSBank.loadLeaderboard();
    lbReady = true;
    /* 排行榜加载完成后刷新身份卡（已通过题数） */
    if (isLoggedIn() && !$("#wp-auth-me").hidden) renderMeCard();
    if (msgNode) setMsg(msgNode, "", "");
  }

  function chById(id) {
    return (bank.challenges || []).find(function (c) { return c.id === id; }) || null;
  }

  /* ---------- GitHub Issue 提交链接 ---------- */
  function buildIssueUrl(ch) {
    var body = [
      "<!--ZSWP",
      "id: " + ch.id,
      "name: " + profile.name,
      "github: " + profile.github,
      "direction: " + ch.dir,
      "-->",
      "",
      "## flag",
      "",
      "（在此粘贴你拿到的 flag）",
      "",
      "## 解题思路 / 步骤",
      "",
      "（截图直接拖进编辑器即可）",
      "",
      "## 复盘",
      "",
      "",
    ].join("\n");
    var title = profile.name + "-" + ch.id + ".md";
    return "https://github.com/" + CFG.repo + "/issues/new"
      + "?template=writeup.md"
      + "&title=" + encodeURIComponent(title)
      + "&body=" + encodeURIComponent(body);
  }

  function buildCopyText(ch) {
    var filename = profile.name + "-" + ch.id + ".md";
    return [
      "/* 规范文件名：" + filename + "（如需上传 md 附件，按此命名） */",
      "提交方式：GitHub " + CFG.repo + " → Issues → New issue → Writeup 模板",
      "标题：" + profile.name + "-" + ch.id + ".md",
      "",
      "--------------- 以下粘贴到 Issue 正文 ---------------",
      "",
      "<!--ZSWP",
      "id: " + ch.id,
      "name: " + profile.name,
      "github: " + profile.github,
      "direction: " + ch.dir,
      "-->",
      "",
      "## flag",
      "",
      "## 解题思路 / 步骤",
      "",
      "## 复盘",
      "",
    ].join("\n");
  }

  /* ==========================================================================
     视图：题目 & 提交
     ========================================================================== */
  function dirPills(host) {
    var pills = el("div", "wp-row");
    pills.style.marginBottom = "18px";
    var note = el("span", "wp-muted", "研究方向：");
    pills.appendChild(note);
    Object.keys(TRACKS).forEach(function (k) {
      var b = el("button", "wp-btn is-mini" + (selectedDir === k ? " is-primary" : ""), TRACKS[k].label);
      b.type = "button";
      b.addEventListener("click", function () {
        selectedDir = k;
        profile.direction = k;
        lsSave(PROFILE_KEY, profile);
        renderTasksView();
      });
      pills.appendChild(b);
    });
    host.appendChild(pills);
  }

  /* 该战线涉及的题库类别 */
  function trackCats(trackKey) {
    return (TRACKS[trackKey] && TRACKS[trackKey].cats) || [];
  }

  /* 该战线的批次列表（batches.json 按战线 key 组织，ranges 按题库类别限定） */
  function trackBatchGroups(trackKey) {
    return ((batches && batches[trackKey]) || [])
      .map(function (b) {
        return { batch: b.batch, deadline: b.deadline || "", note: b.note || "", ranges: b.ranges || {} };
      })
      .sort(function (a, b) { return (a.batch || 0) - (b.batch || 0); });
  }

  function statusBadge(status, score) {
    var map = { pending: "待审", accepted: "已通过", rejected: "已打回", solved: "flag 正确", none: "未提交" };
    var cls = { pending: "b-pending", accepted: "b-solved", rejected: "b-cat", solved: "b-pending", none: "b-cat" };
    var t = map[status] || status;
    if (status === "accepted" && score) t += " · " + score + "分";
    return el("span", "wp-badge " + (cls[status] || "b-cat"), t);
  }

  function challengeCard(ch, status, solvedLocal) {
    var card = el("div", "wp-task" + (status ? " is-" + status.status : ""));
    var main = el("div", "wp-task-main");
    var head = el("div", "wp-task-head");
    head.appendChild(el("h3", "wp-task-title", "【" + ch.id + "】" + ch.title));
    head.appendChild(el("span", "wp-badge b-cat", (CAT_LABEL[ch.dir] || ch.dir) + " · " + DIFF_LABEL[ch.diff] + " · " + ch.score + "分"));
    if (status) head.appendChild(statusBadge(status.status, status.score));
    else if (solvedLocal) head.appendChild(statusBadge("solved"));
    main.appendChild(head);

    var brief = el("p", "wp-task-brief", ch.desc.length > 140 ? ch.desc.slice(0, 140) + "…" : ch.desc);
    brief.title = "点击展开完整题面";
    brief.style.cursor = "pointer";
    brief.addEventListener("click", function () {
      if (brief.textContent.length > 160) { brief.textContent = ch.desc.slice(0, 140) + "…"; }
      else { brief.textContent = ch.desc + "\n\n提示：" + ch.hint; }
    });
    main.appendChild(brief);

    /* 题源外链（若题目挂接外部题库平台，如 CTF2） */
    if (ch.link) {
      var src = el("a", "wp-muted", "题源 / 平台入口 ↗");
      src.href = ch.link;
      src.target = "_blank";
      src.rel = "noopener";
      src.style.display = "inline-block";
      src.style.marginTop = "6px";
      main.appendChild(src);
    }
    card.appendChild(main);

    /* 状态行：打回理由 / 提交时间 */
    if (status && status.status === "rejected" && status.comment) {
      main.appendChild(el("p", "wp-msg bad", "教练打回理由：" + status.comment));
    }

    var side = el("div", "wp-task-side");
    var score = el("div", "wp-task-score");
    score.appendChild(document.createTextNode(String(status && status.status === "accepted" ? status.score : ch.score)));
    score.appendChild(el("small", null, " PTS"));
    side.appendChild(score);

    var acts = el("div", "wp-task-actions");

    /* flag 校验（本地比对解密后的答案） */
    if (!status || status.status !== "accepted") {
      var fin = el("input");
      fin.type = "text";
      fin.placeholder = "粘贴 flag 校验";
      fin.className = "wp-flag-input";
      fin.style.maxWidth = "150px";
      var chk = el("button", "wp-btn is-mini", "校验");
      chk.type = "button";
      chk.addEventListener("click", function () {
        var v = (fin.value || "").trim();
        if (!v) return;
        if (v === ch.flag) {
          var s = ls(SOLVED_KEY, {}); s[ch.id] = true; lsSave(SOLVED_KEY, s);
          chk.textContent = "✓ 正确"; chk.classList.add("is-primary");
          fin.disabled = true;
          renderTasksView();
        } else {
          chk.textContent = "✗ 再想想";
          setTimeout(function () { chk.textContent = "校验"; }, 1200);
        }
      });
      if (solvedLocal) { fin.value = ch.flag; fin.disabled = true; chk.textContent = "✓ 正确"; chk.classList.add("is-primary"); }
      acts.appendChild(fin);
      acts.appendChild(chk);
    }

    /* 提交按钮 */
    var canSubmit = (solvedLocal || (status && status.status !== "accepted"));
    var submitBtn = el("button", "wp-btn is-primary is-mini", status && status.status === "pending" ? "查看/重交 Issue ↗" : "提交 Writeup ↗");
    submitBtn.type = "button";
    submitBtn.title = solvedLocal || status ? "" : "建议先校验 flag（也可直接提交）";
    submitBtn.addEventListener("click", function () {
      if (!profile.github || !profile.name) {
        var box = $("#wp-profile-box");
        if (box) { box.scrollIntoView({ behavior: "smooth", block: "center" }); }
        alert("先在上方「身份登记」填写 GitHub 用户名和真实姓名，再提交。");
        return;
      }
      if (status && status.issue) {
        window.open("https://github.com/" + CFG.repo + "/issues/" + status.issue, "_blank", "noopener");
        return;
      }
      window.open(buildIssueUrl(ch), "_blank", "noopener");
    });
    acts.appendChild(submitBtn);

    var copyBtn = el("button", "wp-btn is-mini", "复制模板");
    copyBtn.type = "button";
    copyBtn.addEventListener("click", function () {
      var text = buildCopyText(ch);
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () {
        copyBtn.textContent = "已复制 ✓";
        setTimeout(function () { copyBtn.textContent = "复制模板"; }, 1200);
      });
      else window.prompt("手动复制：", text);
    });
    acts.appendChild(copyBtn);

    side.appendChild(acts);
    card.appendChild(side);
    return card;
  }

  async function renderTasksView() {
    var host = $("#wp-view-tasks .wp-section-body");
    if (!host) return;
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    host.innerHTML = "";
    host.appendChild(el("p", "wp-muted", "LOADING // 解密题库与排行榜…"));

    if (!bank) {
      try { await loadAll(); } catch (e) {
        host.innerHTML = "";
        host.appendChild(el("p", "wp-msg bad", "题库解密失败：" + e.message));
        return;
      }
    }
    host.innerHTML = "";

    /* 身份未登记提示 */
    if (!profile.github || !profile.name) {
      var tip = el("p", "wp-msg", "⚠ 先在页面顶部「身份登记」填写 GitHub 用户名与真实姓名，才能提交 Writeup。");
      tip.style.marginBottom = "12px";
      host.appendChild(tip);
    }

    dirPills(host);
    if (!selectedDir) {
      host.appendChild(el("p", "wp-muted", "↑ 选择你的研究方向，只显示该方向的题目批次。"));
      return;
    }

    var solvedMap = ls(SOLVED_KEY, {});
    var statusMap = myStatusMap();
    var cats = trackCats(selectedDir);
    var chs = bank.challenges.filter(function (c) { return cats.indexOf(c.dir) >= 0; });

    /* 按批次分组（跨类别合并）；不在任何批次内的归入"未入批" */
    var groups = [];
    var usedIds = {};
    trackBatchGroups(selectedDir).forEach(function (b) {
      var list = chs.filter(function (c) {
        var rg = b.ranges[c.dir];
        if (!rg) return false;
        var n = parseInt(c.id.split("-")[1], 10);
        var inRange = n >= rg[0] && n <= rg[1];
        if (inRange) usedIds[c.id] = true;
        return inRange;
      });
      if (list.length) groups.push({ batch: b, list: list });
    });
    var rest = chs.filter(function (c) { return !usedIds[c.id]; });
    if (rest.length) groups.push({ batch: null, list: rest });

    /* 统计卡 */
    var myAccepted = Object.keys(statusMap).filter(function (k) { return statusMap[k].status === "accepted"; }).length;
    var myPending = Object.keys(statusMap).filter(function (k) { return statusMap[k].status === "pending"; }).length;
    var myScore = Object.keys(statusMap).reduce(function (a, k) { return a + (statusMap[k].status === "accepted" ? statusMap[k].score : 0); }, 0);
    var stats = el("div", "wp-stats");
    [
      [chs.length, "本方向题库 BANK"],
      [myAccepted, "已通过 ACCEPTED"],
      [myPending, "待审 / 打回 REVIEW"],
      [myScore + " 分", "累计得分 SCORE"],
    ].forEach(function (p) {
      var c = el("div", "wp-stat");
      c.appendChild(el("b", null, String(p[0])));
      c.appendChild(el("span", null, p[1]));
      stats.appendChild(c);
    });
    host.appendChild(stats);

    groups.forEach(function (g) {
      var sec = el("div");
      var head = el("div", "wp-row");
      head.style.margin = "26px 0 12px";
      var label = g.batch ? "// 第 " + g.batch.batch + " 批 · " + (g.batch.note || "") + " · " + g.list.length + " 题"
                          : "// 未入批（预告，等教练发批次）· " + g.list.length + " 题";
      head.appendChild(el("p", "wp-kicker", label));
      if (g.batch && g.batch.deadline) {
        var cd = el("span", "wp-badge b-pending", "");
        cd.setAttribute("data-deadline", String(new Date(g.batch.deadline).getTime()));
        cd.textContent = "⏳ 截止倒计时 " + countdownText(g.batch.deadline);
        head.appendChild(cd);
      }
      sec.appendChild(head);

      var wrap = el("div", "wp-list");
      g.list.forEach(function (ch) {
        wrap.appendChild(challengeCard(ch, statusMap[ch.id] || null, !!solvedMap[ch.id]));
      });
      sec.appendChild(wrap);
      host.appendChild(sec);
    });

    if (!lbReady || !lb) {
      host.appendChild(el("p", "wp-muted", "排行榜还没生成（教练审核打标签后 Actions 会自动算）。提交状态将以 GitHub Issue 为准。"));
    }

    countdownTimer = setInterval(function () {
      $$("[data-deadline]", host).forEach(function (n) {
        n.textContent = "⏳ 截止倒计时 " + countdownText(Number(n.getAttribute("data-deadline")));
      });
    }, 1000);
  }

  /* ==========================================================================
     视图：排行榜
     ========================================================================== */
  async function renderRankView() {
    var host = $("#wp-view-rank .wp-section-body");
    if (!host) return;
    host.innerHTML = "";
    host.appendChild(el("p", "wp-muted", "LOADING // 统计中…"));

    if (!lbReady) { try { await loadAll(); } catch (e) { /* ignore */ } }
    host.innerHTML = "";
    var rows = lb && lb.members ? lb.members.slice() : [];

    if (!rows.length) {
      host.appendChild(el("p", "wp-muted",
        "暂无排行数据。流程：队员提交 Issue → 教练打标签 accepted + score/N → Actions 自动重算排行榜。"));
      return;
    }
    rows.sort(function (a, b) { return (b.total || 0) - (a.total || 0) || (b.accepted || []).length - (a.accepted || []).length; });

    var table = el("table", "wp-rank");
    var thead = el("thead");
    var trh = el("tr");
    ["NO", "队员", "GitHub", "方向", "通过", "打回", "待审", "得分"].forEach(function (h) { trh.appendChild(el("th", null, h)); });
    thead.appendChild(trh);
    table.appendChild(thead);
    var tbody = el("tbody");
    rows.forEach(function (r, i) {
      var tr = el("tr");
      if (profile.github && r.github && r.github.toLowerCase() === profile.github.toLowerCase()) tr.className = "is-me";
      tr.appendChild(el("td", "rank-no", String(i + 1).padStart(2, "0")));
      tr.appendChild(el("td", null, r.name || "—"));
      tr.appendChild(el("td", "rank-muted", "@" + (r.github || "—")));
      tr.appendChild(el("td", "rank-muted", CAT_LABEL[r.direction] || r.direction || "—"));
      tr.appendChild(el("td", null, String((r.accepted || []).length)));
      tr.appendChild(el("td", "rank-muted", String((r.rejected || []).length)));
      tr.appendChild(el("td", "rank-muted", String((r.pending || []).length)));
      tr.appendChild(el("td", "rank-score", String(r.total || 0)));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    host.appendChild(table);
    host.appendChild(el("p", "wp-muted", "得分只统计教练打上 accepted 标签的提交；score/N 标签决定分值。数据由 GitHub Actions 自动聚合加密生成。"));
  }

  /* ==========================================================================
     视图：审核台（GitHub Issues 只读拉取，公开 API，无需凭据）
     ========================================================================== */
  async function fetchWriteupIssues() {
    var url = "https://api.github.com/repos/" + CFG.repo + "/issues?labels=writeup&state=all&per_page=100";
    var r = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) throw new Error("GitHub API " + r.status + "（公开接口限流 60 次/小时，稍后再试）");
    return await r.json();
  }

  function parseIssueMeta(issue) {
    var body = issue.body || "";
    var meta = { id: "", name: "", github: "", direction: "" };
    var m = body.match(/<!--ZSWP([\s\S]*?)-->/);
    if (m) {
      ["id", "name", "github", "direction"].forEach(function (k) {
        var mm = m[1].match(new RegExp("^\\s*" + k + "\\s*:\\s*(.+)$", "m"));
        if (mm) meta[k] = mm[1].trim();
      });
    }
    if (!meta.id) {
      var tm = (issue.title || "").match(/\[([A-Z]+-\d+)\]/);
      if (tm) meta.id = tm[1];
    }
    var labels = (issue.labels || []).map(function (l) { return typeof l === "string" ? l : l.name; });
    return { meta: meta, labels: labels };
  }

  async function renderReviewView() {
    var host = $("#wp-view-review .wp-section-body");
    if (!host) return;
    host.innerHTML = "";

    /* 审核台仅教练账号可见（GitHub 用户名 = wp-config.js 的 coach） */
    if (!isCoach()) {
      host.appendChild(el("p", "wp-msg bad", "无权限：审核台仅对教练账号（@" + (CFG.coach || "?") + "）开放。请先在身份登记使用该 GitHub 账号。"));
      host.appendChild(el("p", "wp-muted", "真正的审核门禁在 GitHub 权限体系：只有仓库写权限才能给 Issue 打标签。"));
      return;
    }

    host.appendChild(el("p", "wp-muted", "LOADING // 拉取 GitHub Issues…"));

    var issues;
    try { issues = await fetchWriteupIssues(); }
    catch (e) {
      host.innerHTML = "";
      host.appendChild(el("p", "wp-msg bad", e.message));
      host.appendChild(el("p", "wp-muted", "也可以直接在 GitHub 仓库的 Issues 页按 writeup 标签筛选审核。"));
      return;
    }
    host.innerHTML = "";

    var pending = [], done = [];
    issues.forEach(function (iss) {
      if (iss.pull_request) return;
      var p = parseIssueMeta(iss);
      if (p.labels.indexOf("accepted") >= 0 || p.labels.indexOf("rejected") >= 0) done.push({ iss: iss, p: p });
      else pending.push({ iss: iss, p: p });
    });

    /* 教练操作指引 */
    var guide = el("div", "wp-auth");
    guide.style.marginBottom = "18px";
    guide.appendChild(el("h3", "wp-task-title", "审核操作（在 GitHub 上完成）"));
    guide.appendChild(el("p", "wp-muted",
      "打开某个 Issue → 右侧 Labels → 打上标签 → Actions 自动重算排行榜：" +
      " ① 通过：accepted + score/分数（如 score/80）→ ② 打回：rejected，并在评论区写清要补什么（队员能在题目页看到）。" +
      " 打标签需要仓库写权限——这正是教练权限，天然只有你能操作。"));
    var openAll = el("a", "wp-btn is-mini", "在 GitHub 打开待审列表 ↗");
    openAll.href = "https://github.com/" + CFG.repo + "/issues?q=is%3Aissue+label%3Awriteup";
    openAll.target = "_blank"; openAll.rel = "noopener";
    openAll.style.display = "inline-block";
    guide.appendChild(openAll);
    host.appendChild(guide);

    var aiRow = el("div", "wp-row");
    aiRow.style.marginBottom = "18px";
    aiRow.appendChild(el("p", "wp-kicker", "待审 " + pending.length + " 条 · 已处理 " + done.length + " 条"));
    var copyBtn = el("button", "wp-btn is-mini", "📋 复制全部待审 → 交给 AI 辅助审查");
    copyBtn.type = "button";
    copyBtn.addEventListener("click", function () {
      if (!pending.length) { alert("没有待审的提交"); return; }
      var lines = ["# 待审 Writeup × " + pending.length, ""];
      pending.forEach(function (x, i) {
        var ch = x.p.meta.id ? chById(x.p.meta.id) : null;
        lines.push("## " + (i + 1) + ". " + (x.p.meta.name || "未署名") + "（@" + (x.p.meta.github || "?") + "）— " + (x.p.meta.id || "?") + " " + (ch ? "（" + ch.title + "，满分 " + ch.score + "）" : ""));
        lines.push("Issue: " + x.iss.html_url);
        lines.push("");
        lines.push((x.iss.body || "").replace(/<!--ZSWP[\s\S]*?-->/, "").trim());
        lines.push("\n---\n");
      });
      var text = lines.join("\n");
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { copyBtn.textContent = "已复制 ✓"; setTimeout(function(){copyBtn.textContent="📋 复制全部待审 → 交给 AI 辅助审查";},1500); });
      else window.prompt("手动复制：", text);
    });
    aiRow.appendChild(copyBtn);
    host.appendChild(aiRow);

    function renderOne(x) {
      var ch = x.p.meta.id ? chById(x.p.meta.id) : null;
      var box = el("div", "wp-review");
      var head = el("div", "wp-review-head");
      head.appendChild(el("h3", "wp-task-title", (x.p.meta.name || "未署名") + "（@" + (x.p.meta.github || "?") + "）"));
      if (x.p.meta.id) head.appendChild(el("span", "wp-badge b-cat", x.p.meta.id + (ch ? " · " + ch.title : "") + (ch ? " · 满分 " + ch.score : "")));
      head.appendChild(el("span", "wp-task-meta", fmtTime(x.iss.created_at)));
      box.appendChild(head);

      var bodyText = (x.iss.body || "").replace(/<!--ZSWP[\s\S]*?-->/, "").trim();
      var body = el("div", "wp-review-body", bodyText.length > 400 ? bodyText.slice(0, 400) + "…" : bodyText || "（空）");
      box.appendChild(body);

      var acts = el("div", "wp-review-actions");
      var open = el("a", "wp-btn is-primary is-mini", "在 GitHub 打开并打标签 ↗");
      open.href = x.iss.html_url; open.target = "_blank"; open.rel = "noopener";
      acts.appendChild(open);
      var copy1 = el("button", "wp-btn is-mini", "复制本篇");
      copy1.type = "button";
      copy1.addEventListener("click", function () {
        if (navigator.clipboard) navigator.clipboard.writeText(bodyText);
      });
      acts.appendChild(copy1);
      box.appendChild(acts);
      return box;
    }

    if (pending.length) {
      host.appendChild(el("p", "wp-kicker", "// 待审核队列"));
      pending.forEach(function (x) { host.appendChild(renderOne(x)); });
    } else {
      host.appendChild(el("p", "wp-muted", "队列已清空。"));
    }
    if (done.length) {
      var h2 = el("p", "wp-kicker", "// 已处理（最近在前）");
      h2.style.marginTop = "30px";
      host.appendChild(h2);
      done.slice(0, 20).forEach(function (x) { host.appendChild(renderOne(x)); });
    }
  }

  /* ==========================================================================
     视图：使用说明
     ========================================================================== */
  function renderGuideView() {
    var host = $("#wp-view-guide .wp-section-body");
    if (!host) return;
    host.innerHTML = "";
    var box = el("div", "wp-auth");
    box.appendChild(el("h3", "wp-task-title", "队员 · 提交流程"));
    box.appendChild(el("p", "wp-muted",
      "1. 身份登记（本页顶部）：GitHub 用户名 + 真实姓名 + 四条战线方向（Web 安全 / 逆向与 Pwn / 数字取证 / 防守与运营）\n" +
      "2. 选方向 → 只看自己方向的批次与倒计时，从 EASY 到 HARD 递进\n" +
      "3. 解题（03 靶场 / 题面自包含的题可直接做）→ flag 校验\n" +
      "4. 点「提交 Writeup」→ 自动打开 GitHub Issue 表单（标题即规范命名 <姓名>-<题号>.md，正文带模板）\n" +
      "5. 等审核：accepted 计分上榜；rejected 看评语，重新提交同一 Issue 或新开一个"));
    host.appendChild(box);

    var box2 = el("div", "wp-auth");
    box2.appendChild(el("h3", "wp-task-title", "教练 · 审核流程"));
    box2.appendChild(el("p", "wp-muted",
      "1. 审核台看待审队列（或 GitHub Issues 按 writeup 标签筛选）\n" +
      "2. 「复制全部待审」→ 粘贴给 AI 辅助审查拿分值建议 → 自己定夺\n" +
      "3. 在 Issue 上打标签：accepted + score/80（分数），打回则 rejected + 评论写理由\n" +
      "4. 标签变动触发 Actions → 自动重算加密排行榜 → 网页排行/进度实时更新\n" +
      "5. 发批次：编辑 assets/data/batches.json（战线 key / 批号 / deadline / ranges 题号区间），保存即生效\n" +
      "6. 加题：本地跑 python tools/gen_bank.py --scale N 再提交，或直接编辑明文库后重新生成"));
    host.appendChild(box2);

    var box3 = el("div", "wp-auth");
    box3.appendChild(el("h3", "wp-task-title", "安全模型（如实说明）"));
    box3.appendChild(el("p", "wp-muted",
      "题库与排行榜经四层管线加密（压缩 → SHA256 异或流 → 置换字母表 → 分片反转），密文入库，页面运行时解密。" +
      "纯静态架构下解密逻辑必须在前端，这是高门槛混淆而非绝对防护；提交审核与计分的真实门禁在 GitHub 权限体系（只有仓库写权限能打标签）。"));
    host.appendChild(box3);
  }

  /* ==========================================================================
     身份登记（登录 / 注册）
     - 注册：填写 GitHub 用户名 + 真实姓名 + 方向，存浏览器本地
     - 登录：同一浏览器再次访问自动恢复身份（「我的身份」选项卡显示身份卡）
     ========================================================================== */
  function isLoggedIn() {
    return !!(profile.github && profile.name && profile.direction);
  }

  function switchAuthTab(which) {
    var tabReg = $("#wp-tab-register"), tabMe = $("#wp-tab-me");
    var panReg = $("#wp-auth-register"), panMe = $("#wp-auth-me");
    if (!tabReg || !tabMe) return;
    var me = which === "me";
    tabReg.classList.toggle("is-on", !me);
    tabMe.classList.toggle("is-on", me);
    tabReg.setAttribute("aria-selected", me ? "false" : "true");
    tabMe.setAttribute("aria-selected", me ? "true" : "false");
    if (panReg) panReg.hidden = me;
    if (panMe) panMe.hidden = !me;
    if (me) renderMeCard();
  }

  function renderMeCard() {
    var host = $("#wp-auth-me");
    if (!host) return;
    host.innerHTML = "";
    if (!isLoggedIn()) {
      host.appendChild(el("p", "wp-muted",
        "尚未登录。本系统身份保存在这台浏览器里——换电脑或清除浏览器数据后需要重新登记一次（「注册 / 登记身份」选项卡）。"));
      var goReg = el("button", "wp-btn is-primary", "去登记身份 →");
      goReg.type = "button";
      goReg.addEventListener("click", function () { switchAuthTab("register"); });
      host.appendChild(goReg);
      return;
    }
    var card = el("div", "wp-me-card");
    function row(label, value, accent) {
      var r = el("div", "wp-me-row");
      r.appendChild(el("span", "wp-me-label", label));
      var v = el("span", "wp-me-value" + (accent ? " is-accent" : ""), value);
      r.appendChild(v);
      return r;
    }
    card.appendChild(row("GITHUB", "@" + profile.github, true));
    card.appendChild(row("姓名", profile.name));
    card.appendChild(row("研究方向", (TRACKS[profile.direction] && TRACKS[profile.direction].label || profile.direction) + "（按此方向发题）"));
    var solved = Object.keys(myStatusMap()).filter(function (k) { return myStatusMap()[k].status === "accepted"; }).length;
    card.appendChild(row("已通过审核", lb ? solved + " 题" : "加载排行榜后显示"));
    var note = el("p", "wp-hint",
      "提交 Writeup 时会以「" + (profile.name || "-") + "-" + "题号.md」命名，并自动署名 @" + profile.github +
      "。教练通过仓库写权限识别，无需密码。");
    card.appendChild(note);
    var btns = el("div", "wp-row");
    var editBtn = el("button", "wp-btn", "修改资料");
    editBtn.type = "button";
    editBtn.addEventListener("click", function () { switchAuthTab("register"); });
    var outBtn = el("button", "wp-btn is-danger", "退出登录（清除本机身份）");
    outBtn.type = "button";
    outBtn.addEventListener("click", function () {
      if (!window.confirm("退出登录将清除这台浏览器上保存的身份（GitHub 用户名 / 姓名 / 方向），重新登记即可恢复。确定清除？")) return;
      profile = { github: "", name: "", direction: "" };
      lsSave(PROFILE_KEY, profile);
      selectedDir = "";
      renderProfile();
      renderTasksView();
      switchAuthTab("register");
      var msg = $("#wp-profile-msg");
      setMsg(msg, "已退出登录。", "ok");
    });
    btns.appendChild(editBtn);
    btns.appendChild(outBtn);
    card.appendChild(btns);
    host.appendChild(card);
  }

  /* 审核台标签仅教练账号可见 */
  function syncCoachTab() {
    var reviewTab = $$(".wp-tab").filter(function (t) { return t.getAttribute("data-view") === "review"; })[0];
    if (reviewTab) reviewTab.hidden = !isCoach();
    if (!isCoach() && view === "review") location.hash = "#/tasks";
  }

  function renderProfile() {
    var gh = $("#pf-github"), nm = $("#pf-name"), dir = $("#pf-dir");
    if (!gh) return;
    gh.value = profile.github || "";
    nm.value = profile.name || "";
    dir.value = profile.direction || "";
    var who = $("#wp-whoami");
    if (who) {
      who.textContent = profile.github
        ? "@" + profile.github + " · " + (profile.name || "未署名") + (profile.direction ? " · " + (TRACKS[profile.direction] ? TRACKS[profile.direction].label : profile.direction) + "方向" : "")
        : "未登记身份";
    }
    syncCoachTab();
    /* 顶栏按钮：登录后显示身份，未登录显示「登录 / 注册」 */
    var loginBtn = $("#wp-login-btn");
    if (loginBtn) {
      loginBtn.innerHTML = isLoggedIn()
        ? "@" + profile.github + " · " + (profile.name || "") + "<span class=\"btn-arrow\">↗</span>"
        : "登录 / 注册<span class=\"btn-arrow\">↗</span>";
    }
    /* 默认选项卡：已登录 → 我的身份；未登录 → 注册 */
    switchAuthTab(isLoggedIn() ? "me" : "register");
    selectedDir = profile.direction || selectedDir;
  }

  function bindProfileForm() {
    var f = $("#wp-profile-form");
    if (!f) return;
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var gh = f.github.value.trim().replace(/^@/, "");
      var nm = f.name.value.trim();
      var dir = f.direction.value;
      var msg = $("#wp-profile-msg");
      if (!gh) return setMsg(msg, "GitHub 用户名必填（提交与排行榜都靠它）", "bad");
      if (!nm) return setMsg(msg, "真实姓名必填（规范命名 <姓名>-<题号>.md）", "bad");
      if (!dir) return setMsg(msg, "选择研究方向（按方向发题）", "bad");
      profile = { github: gh, name: nm, direction: dir };
      lsSave(PROFILE_KEY, profile);
      selectedDir = dir;
      setMsg(msg, "SAVED // 身份已登记（仅保存在你的浏览器本地，提交时自动写入 Issue）", "ok");
      renderProfile();
      renderTasksView();
    });
    var clearBtn = $("#wp-profile-clear");
    if (clearBtn) clearBtn.addEventListener("click", function () {
      profile = { github: "", name: "", direction: "" };
      lsSave(PROFILE_KEY, profile);
      renderProfile();
    });
    /* 选项卡切换 */
    var tabReg = $("#wp-tab-register"), tabMe = $("#wp-tab-me");
    if (tabReg) tabReg.addEventListener("click", function () { switchAuthTab("register"); });
    if (tabMe) tabMe.addEventListener("click", function () { switchAuthTab("me"); });
  }

  /* ==========================================================================
     路由 & 初始化
     ========================================================================== */
  function renderCurrent() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    if (view === "tasks") renderTasksView();
    else if (view === "rank") renderRankView();
    else if (view === "review") renderReviewView();
    else if (view === "guide") renderGuideView();
    else renderTasksView();
  }

  function initRouter() {
    function readHash() {
      var h = (location.hash || "").replace(/^#\//, "");
      view = ["tasks", "rank", "review", "guide"].indexOf(h) >= 0 ? h : "tasks";
      if (view === "review" && !isCoach()) view = "tasks";
      $$(".wp-tab").forEach(function (t) {
        t.classList.toggle("is-on", t.getAttribute("data-view") === view);
      });
      $$("#wp-views .wp-view").forEach(function (v) {
        v.hidden = v.id !== "wp-view-" + view;
      });
      renderCurrent();
    }
    window.addEventListener("hashchange", readHash);
    readHash();
  }

  function init() {
    authBox = $("#wp-profile-box");
    tabsBox = $("#wp-tabs");
    viewsBox = $("#wp-views");

    if (!authBox || !$("#wp-profile-form")) {
      /* 集成模式（ctf.html）：只提供解题记录接口 */
      window.ZerothSecWriteup = {
        recordSolve: function (challengeId) {
          var q = ls(CTF_SOLVED_KEY, []);
          if (q.indexOf(challengeId) < 0) { q.push(challengeId); lsSave(CTF_SOLVED_KEY, q); }
          return Promise.resolve({ recorded: true });
        },
        isLoggedIn: function () { return !!(profile.github && profile.name); },
        nickname: function () { return profile.name || null; },
        gotoSubmit: function () { location.href = "writeup.html#/tasks"; },
      };
      return;
    }

    bindProfileForm();
    renderProfile();

    /* 视图标签点击 → 切换 hash 路由 */
    $$(".wp-tab").forEach(function (t) {
      t.addEventListener("click", function () {
        location.hash = "#/" + t.getAttribute("data-view");
      });
    });

    initRouter();

    /* 预热：后台解密题库 */
    window.ZSBank.loadBank().then(function () {
      if (view === "tasks") renderTasksView();
    }).catch(function (e) {
      console.warn("[zs] 题库预热失败", e);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
