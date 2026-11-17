/* ==========================================================================
   ZEROTHSEC — Writeup 提交审核系统 v4（assets/js/writeup.js）
   纯静态 · 无后端 · 学生端不接触 GitHub。

   流程：
     - 登录/注册：GitHub 用户名 + 真实姓名 + 四条战线方向（存本机浏览器）
     - 登录后才显示：题目/提交、排行榜、说明（教练账号另有审核台）
     - 题目：严格按注册方向发题（TRACKS → 题库类别池），批次与倒计时来自
       assets/data/batches.json（教练在 GitHub 网页端编辑即生效）
     - 提交：页面生成规范命名 <姓名>-<题号>.md 文件供下载，
       学生把文件发教练邮箱 / QQ 群 —— 不跳转 GitHub
     - 审核：教练在「审核台」录入每题 通过/分数 或 打回/理由，
       导出 results.json 内容 → 粘贴到 GitHub 网页端提交 → 学生端自动看到
       结果与排行榜（看不到审核过程）
   ========================================================================== */
(function () {
  "use strict";

  var CFG = window.WP_CONFIG || { repo: "", coach: "" };
  /* 题库原始类别（gen_bank / CTF2 导入维度） */
  var CAT_LABEL = { web: "Web", crypto: "Crypto", misc: "Misc", reverse: "Reverse", pwn: "Pwn" };
  /* 工作室四条战线 → 题库类别池 */
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
  var SUBMIT_KEY = "zs-wp-submitted";
  var CTF_SOLVED_KEY = "zs-ctf-solved";
  var RESULTS_URL = "assets/data/results.json";

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
    if (isNaN(d)) return String(t);
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
  var profile = ls(PROFILE_KEY, { github: "", name: "", direction: "" });
  if (profile.direction && !TRACKS[profile.direction]) {
    profile.direction = CAT2TRACK[profile.direction] || "";
    lsSave(PROFILE_KEY, profile);
  }
  var bank = null;        // { challenges: [...] }
  var batches = null;     // { websec:[...], ... }
  var results = { entries: [] }; // 教练发布的审核结果
  var resultsReady = false;
  var view = "tasks";
  var countdownTimer = null;

  function isLoggedIn() { return !!(profile.github && profile.name && profile.direction); }
  function isCoach() {
    return !!(CFG.coach && profile.github &&
      profile.github.toLowerCase() === String(CFG.coach).toLowerCase());
  }
  function chById(id) {
    if (!bank) return null;
    return (bank.challenges || []).find(function (c) { return c.id === id; }) || null;
  }

  /* 教练结果 → 我的状态表 { "WEB-01": {status, score, reason} } */
  function myStatusMap() {
    var map = {};
    if (!results || !profile.github) return map;
    (results.entries || []).forEach(function (e) {
      if (e.github && e.github.toLowerCase() === profile.github.toLowerCase()) {
        map[e.id] = { status: e.status, score: e.score || 0, reason: e.reason || "", at: e.at || "" };
      }
    });
    return map;
  }

  /* 本机提交记录（下载过提交文件即视为已提交，等待教练结果） */
  function mySubmittedMap() { return ls(SUBMIT_KEY, {}); }

  /* ==========================================================================
     数据加载
     ========================================================================== */
  async function loadAll() {
    bank = await window.ZSBank.loadBank();
    try {
      var r = await fetch("assets/data/batches.json?ts=" + Date.now(), { cache: "no-store" });
      batches = r.ok ? await r.json() : {};
    } catch (e) { batches = {}; }
    try {
      var r2 = await fetch(RESULTS_URL + "?ts=" + Date.now(), { cache: "no-store" });
      results = r2.ok ? await r2.json() : { entries: [] };
    } catch (e) { results = { entries: [] }; }
    resultsReady = true;
  }

  /* ==========================================================================
     提交 Writeup：生成规范命名 md 文件下载，不跳转 GitHub
     ========================================================================== */
  function writeupTemplate(ch) {
    return [
      "# " + profile.name + "-" + ch.id + ".md",
      "",
      "<!--ZSWP",
      "id: " + ch.id,
      "name: " + profile.name,
      "github: " + profile.github,
      "direction: " + profile.direction,
      "title: " + ch.title,
      "-->",
      "",
      "## flag",
      "",
      "（把你拿到的 flag 原样粘贴在这里）",
      "",
      "## 解题思路 / 步骤",
      "",
      "（写清楚：怎么发现切入点 → 每一步做了什么 → 拿到 flag。截图可另附，文字必须自述过程。）",
      "",
      "## 复盘",
      "",
      "（卡在哪里、学到了什么、下次怎么更快。）",
      "",
    ].join("\n");
  }

  function downloadMd(ch, content) {
    var filename = profile.name + "-" + ch.id + ".md";
    var blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    var a = el("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    var s = ls(SUBMIT_KEY, {});
    s[ch.id] = { at: new Date().toISOString(), name: profile.name };
    lsSave(SUBMIT_KEY, s);
  }

  /* 提交面板：题卡内展开 */
  function openSubmitPanel(card, ch, refresh) {
    var old = $(".wp-submit-panel", card);
    if (old) { old.remove(); refresh && refresh(); return; }

    var panel = el("div", "wp-submit-panel");
    panel.appendChild(el("p", "wp-hint",
      "写 Writeup → 生成 <" + profile.name + "-" + ch.id + ".md> 下载 → 把文件发到教练邮箱 19170040127@189.cn 或答疑 QQ 群（群二维码见 02 招新页）。" +
      "教练审核后会发布结果，你回到本页即可看到 通过/打回。"));

    var ta = el("textarea", "wp-writeup-area");
    ta.placeholder = "在这里写你的 Writeup（flag / 思路步骤 / 复盘）。也可以先点「下载空模板」在本地编辑器写好再粘贴回来。";
    ta.rows = 8;
    panel.appendChild(ta);

    var row = el("div", "wp-row");
    row.style.marginTop = "10px";

    var tplBtn = el("button", "wp-btn is-mini", "下载空模板");
    tplBtn.type = "button";
    tplBtn.addEventListener("click", function () { downloadMd(ch, writeupTemplate(ch)); });
    row.appendChild(tplBtn);

    var sendBtn = el("button", "wp-btn is-mini is-primary", "生成并下载我的 Writeup 文件");
    sendBtn.type = "button";
    sendBtn.addEventListener("click", function () {
      var body = ta.value.trim();
      var meta = writeupTemplate(ch).split("## flag")[0];
      var content = body ? meta + "## flag\n\n" + body + "\n" : writeupTemplate(ch);
      downloadMd(ch, content);
      sendBtn.textContent = "已生成 ✓ 记得把文件发给教练";
      sendBtn.disabled = true;
    });
    row.appendChild(sendBtn);

    panel.appendChild(row);
    card.appendChild(panel);
  }

  /* ==========================================================================
     视图：题目 & 提交（严格按注册方向）
     ========================================================================== */
  function trackCats() { return (TRACKS[profile.direction] && TRACKS[profile.direction].cats) || []; }

  function trackBatchGroups() {
    return ((batches && batches[profile.direction]) || [])
      .map(function (b) {
        return { batch: b.batch, deadline: b.deadline || "", note: b.note || "", ranges: b.ranges || {} };
      })
      .sort(function (a, b) { return (a.batch || 0) - (b.batch || 0); });
  }

  function statusBadge(status, score) {
    var map = { accepted: "已通过", rejected: "已打回", submitted: "已提交·待审" };
    var cls = { accepted: "b-solved", rejected: "b-cat", submitted: "b-pending" };
    var t = map[status] || status;
    if (status === "accepted" && score) t += " · " + score + "分";
    return el("span", "wp-badge " + (cls[status] || "b-cat"), t);
  }

  function challengeCard(ch, status, solvedLocal, submitted) {
    var card = el("div", "wp-task" + (status ? " is-" + status.status : ""));
    var main = el("div", "wp-task-main");
    var head = el("div", "wp-task-head");
    head.appendChild(el("h3", "wp-task-title", "【" + ch.id + "】" + ch.title));
    head.appendChild(el("span", "wp-badge b-cat", (CAT_LABEL[ch.dir] || ch.dir) + " · " + DIFF_LABEL[ch.diff] + " · " + ch.score + "分"));
    if (status && status.status !== "submitted") head.appendChild(statusBadge(status.status, status.score));
    else if (submitted) head.appendChild(statusBadge("submitted"));
    else if (solvedLocal) head.appendChild(el("span", "wp-badge b-pending", "flag 正确"));
    main.appendChild(head);

    var brief = el("p", "wp-task-brief", ch.desc.length > 140 ? ch.desc.slice(0, 140) + "…" : ch.desc);
    brief.style.cursor = "pointer";
    brief.title = "点击展开完整题面";
    brief.addEventListener("click", function () {
      if (brief.textContent.length > 160) brief.textContent = ch.desc.slice(0, 140) + "…";
      else brief.textContent = ch.desc + "\n\n提示：" + ch.hint;
    });
    main.appendChild(brief);

    if (ch.link) {
      var src = el("a", "wp-muted", "题源 / 平台入口 ↗");
      src.href = ch.link;
      src.target = "_blank";
      src.rel = "noopener";
      src.style.display = "inline-block";
      src.style.marginTop = "6px";
      main.appendChild(src);
    }

    if (status && status.status === "rejected" && status.reason) {
      main.appendChild(el("p", "wp-msg bad", "教练打回理由：" + status.reason + " —— 修改后重新提交。"));
    }
    card.appendChild(main);

    var side = el("div", "wp-task-side");
    var score = el("div", "wp-task-score");
    score.appendChild(document.createTextNode(String(status && status.status === "accepted" ? status.score : ch.score)));
    score.appendChild(el("small", null, " PTS"));
    side.appendChild(score);

    var acts = el("div", "wp-task-actions");

    /* flag 校验 */
    if (!status || status.status !== "accepted") {
      var fin = el("input", "wp-flag-input");
      fin.type = "text";
      fin.placeholder = "粘贴 flag 校验";
      fin.style.maxWidth = "150px";
      var chk = el("button", "wp-btn is-mini", "校验");
      chk.type = "button";
      chk.addEventListener("click", function () {
        var v = (fin.value || "").trim();
        if (!v) return;
        if (v === ch.flag) {
          var s = ls(SOLVED_KEY, {}); s[ch.id] = true; lsSave(SOLVED_KEY, s);
          chk.textContent = "✓ 正确"; chk.classList.add("is-primary"); fin.disabled = true;
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

    /* 提交按钮：展开本地提交面板（不跳 GitHub） */
    if (!status || status.status !== "accepted") {
      var submitBtn = el("button", "wp-btn is-primary is-mini", submitted ? "重新提交 Writeup" : "提交 Writeup");
      submitBtn.type = "button";
      submitBtn.addEventListener("click", function () {
        openSubmitPanel(card, ch, function () {});
      });
      acts.appendChild(submitBtn);
    }

    side.appendChild(acts);
    card.appendChild(side);
    return card;
  }

  async function renderTasksView() {
    var host = $("#wp-view-tasks .wp-section-body");
    if (!host) return;
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    host.innerHTML = "";
    host.appendChild(el("p", "wp-muted", "LOADING // 解密题库与批次…"));

    if (!bank) {
      try { await loadAll(); } catch (e) {
        host.innerHTML = "";
        host.appendChild(el("p", "wp-msg bad", "题库解密失败：" + e.message));
        return;
      }
    }
    host.innerHTML = "";

    var cats = trackCats();
    var chs = bank.challenges.filter(function (c) { return cats.indexOf(c.dir) >= 0; });

    /* 方向横幅 */
    var banner = el("div", "wp-row");
    banner.style.marginBottom = "14px";
    banner.appendChild(el("p", "wp-kicker", "// 你的方向：" + TRACKS[profile.direction].label + " —— 只发放本方向题库（EASY → HARD 按批次递进）"));
    host.appendChild(banner);

    var solvedMap = ls(SOLVED_KEY, {});
    var statusMap = myStatusMap();
    var submittedMap = mySubmittedMap();

    /* 批次分组 */
    var groups = [];
    var usedIds = {};
    trackBatchGroups().forEach(function (b) {
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
    var myPending = Object.keys(statusMap).filter(function (k) { return statusMap[k].status === "rejected"; }).length +
      Object.keys(submittedMap).filter(function (k) { return !statusMap[k]; }).length;
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
        var st = statusMap[ch.id] || (submittedMap[ch.id] ? { status: "submitted" } : null);
        wrap.appendChild(challengeCard(ch, st, !!solvedMap[ch.id], !!submittedMap[ch.id]));
      });
      sec.appendChild(wrap);
      host.appendChild(sec);
    });

    countdownTimer = setInterval(function () {
      $$("[data-deadline]", host).forEach(function (n) {
        n.textContent = "⏳ 截止倒计时 " + countdownText(Number(n.getAttribute("data-deadline")));
      });
    }, 1000);
  }

  /* ==========================================================================
     视图：排行榜（由教练发布的 results.json 聚合）
     ========================================================================== */
  function renderRankView() {
    var host = $("#wp-view-rank .wp-section-body");
    if (!host) return;
    host.innerHTML = "";
    var entries = (results && results.entries) || [];
    if (!entries.length) {
      host.appendChild(el("p", "wp-muted", "暂无排行数据。流程：你提交 Writeup 文件给教练 → 教练审核并发布 results → 本页自动更新。"));
      return;
    }
    var byGh = {};
    entries.forEach(function (e) {
      var k = (e.github || "unknown").toLowerCase();
      if (!byGh[k]) byGh[k] = { github: e.github, name: e.name || e.github, dir: "", accepted: 0, rejected: 0, total: 0 };
      if (e.status === "accepted") { byGh[k].accepted++; byGh[k].total += (e.score || 0); }
      if (e.status === "rejected") byGh[k].rejected++;
      if (!byGh[k].dir && e.direction) byGh[k].dir = e.direction;
    });
    var rows = Object.keys(byGh).map(function (k) { return byGh[k]; })
      .sort(function (a, b) { return b.total - a.total || b.accepted - a.accepted; });

    var table = el("table", "wp-rank");
    var trh = el("tr");
    ["NO", "队员", "GitHub", "方向", "通过", "打回", "得分"].forEach(function (h) { trh.appendChild(el("th", null, h)); });
    var thead = el("thead"); thead.appendChild(trh); table.appendChild(thead);
    var tbody = el("tbody");
    rows.forEach(function (r, i) {
      var tr = el("tr");
      if (profile.github && r.github && r.github.toLowerCase() === profile.github.toLowerCase()) tr.className = "is-me";
      tr.appendChild(el("td", "rank-no", String(i + 1).padStart(2, "0")));
      tr.appendChild(el("td", null, r.name));
      tr.appendChild(el("td", "rank-muted", "@" + r.github));
      tr.appendChild(el("td", "rank-muted", (TRACKS[r.dir] && TRACKS[r.dir].label) || CAT_LABEL[r.dir] || r.dir || "—"));
      tr.appendChild(el("td", null, String(r.accepted)));
      tr.appendChild(el("td", "rank-muted", String(r.rejected)));
      tr.appendChild(el("td", "rank-score", String(r.total)));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    host.appendChild(table);
    host.appendChild(el("p", "wp-muted", "得分只统计教练发布为「通过」的 Writeup。"));
  }

  /* ==========================================================================
     视图：审核台（仅教练账号；本地录入 → 导出 results.json 发布）
     ========================================================================== */
  function renderReviewView() {
    var host = $("#wp-view-review .wp-section-body");
    if (!host) return;
    host.innerHTML = "";

    if (!isCoach()) {
      host.appendChild(el("p", "wp-msg bad", "无权限：审核台仅对教练账号（@" + (CFG.coach || "?") + "）开放。"));
      return;
    }

    /* 内存工作副本 */
    var list = ((results && results.entries) || []).map(function (e) { return Object.assign({}, e); });

    var box = el("div", "wp-auth");
    box.appendChild(el("h3", "wp-task-title", "录入审核结果"));
    box.appendChild(el("p", "wp-muted",
      "收到队员发来的 <姓名>-<题号>.md 后（邮箱 / QQ 群），在此逐题登记结论。可把 Writeup 内容粘贴给我（AI）辅助评审打分，你再定夺。"));

    var form = el("div", "wp-row");
    form.style.flexWrap = "wrap";

    function field(label, node) {
      var f = el("div", "wp-field");
      f.appendChild(el("label", null, label));
      f.appendChild(node);
      return f;
    }
    var inId = el("input"); inId.placeholder = "题号 如 WEB-01"; inId.style.maxWidth = "130px";
    var inGh = el("input"); inGh.placeholder = "GitHub 用户名"; inGh.style.maxWidth = "150px";
    var inName = el("input"); inName.placeholder = "姓名"; inName.style.maxWidth = "110px";
    var selSt = el("select");
    [["accepted", "通过"], ["rejected", "打回"]].forEach(function (o) {
      var op = el("option", null, o[1]); op.value = o[0]; selSt.appendChild(op);
    });
    var inScore = el("input"); inScore.type = "number"; inScore.placeholder = "分数(通过时)"; inScore.style.maxWidth = "110px";
    var inReason = el("input"); inReason.placeholder = "打回理由(打回时必填)"; inReason.style.maxWidth = "220px";
    form.appendChild(field("题号", inId));
    form.appendChild(field("GitHub", inGh));
    form.appendChild(field("姓名", inName));
    form.appendChild(field("结论", selSt));
    form.appendChild(field("分数", inScore));
    form.appendChild(field("理由", inReason));
    box.appendChild(form);

    var msg = el("p", "wp-msg");
    box.appendChild(msg);
    var addBtn = el("button", "wp-btn is-primary", "加入结果列表");
    addBtn.type = "button";
    addBtn.addEventListener("click", function () {
      var id = inId.value.trim().toUpperCase();
      var gh = inGh.value.trim().replace(/^@/, "");
      if (!id || !gh) return setMsg(msg, "题号与 GitHub 用户名必填", "bad");
      if (selSt.value === "rejected" && !inReason.value.trim()) return setMsg(msg, "打回必须写理由", "bad");
      var ch = chById(id);
      var entry = {
        id: id, github: gh, name: inName.value.trim() || gh,
        direction: ch ? (TRACKS[CAT2TRACK[ch.dir]] ? CAT2TRACK[ch.dir] : ch.dir) : "",
        status: selSt.value,
        score: selSt.value === "accepted" ? (parseInt(inScore.value, 10) || (ch ? ch.score : 0)) : 0,
        reason: inReason.value.trim(),
        at: new Date().toISOString(),
      };
      list = list.filter(function (x) { return !(x.id === id && (x.github || "").toLowerCase() === gh.toLowerCase()); });
      list.push(entry);
      setMsg(msg, "已加入（共 " + list.length + " 条）。记得最后一步：导出并发布。", "ok");
      inId.value = inGh.value = inName.value = inScore.value = inReason.value = "";
      renderTable();
    });
    box.appendChild(addBtn);
    host.appendChild(box);

    /* 现有结果表 */
    var tableBox = el("div", "wp-auth");
    tableBox.appendChild(el("h3", "wp-task-title", "当前结果（含线上已发布 + 本次新增）"));
    var tbodyHost = el("div");
    tableBox.appendChild(tbodyHost);
    host.appendChild(tableBox);

    function renderTable() {
      tbodyHost.innerHTML = "";
      if (!list.length) { tbodyHost.appendChild(el("p", "wp-muted", "（空）")); exportOut.value = exportJson(list); return; }
      var t = el("table", "wp-rank");
      var hr = el("tr");
      ["题号", "队员", "GitHub", "结论", "分", "理由", ""].forEach(function (h) { hr.appendChild(el("th", null, h)); });
      var th = el("thead"); th.appendChild(hr); t.appendChild(th);
      var tb = el("tbody");
      list.slice().sort(function (a, b) { return (b.at || "").localeCompare(a.at || ""); }).forEach(function (e) {
        var tr = el("tr");
        tr.appendChild(el("td", null, e.id));
        tr.appendChild(el("td", null, e.name || ""));
        tr.appendChild(el("td", "rank-muted", "@" + e.github));
        tr.appendChild(el("td", null, e.status === "accepted" ? "通过" : "打回"));
        tr.appendChild(el("td", null, String(e.score || "")));
        tr.appendChild(el("td", "rank-muted", e.reason || ""));
        var delTd = el("td");
        var del = el("button", "wp-btn is-mini", "删");
        del.type = "button";
        del.addEventListener("click", function () {
          list = list.filter(function (x) { return x !== e; });
          renderTable();
        });
        delTd.appendChild(del);
        tr.appendChild(delTd);
        tb.appendChild(tr);
      });
      t.appendChild(tb);
      tbodyHost.appendChild(t);
      exportOut.value = exportJson(list);
    }

    function exportJson(entries) {
      return JSON.stringify({
        updated: new Date().toISOString(),
        note: "ZEROTHSEC 审核结果（教练审核台导出，勿手动改格式）",
        entries: entries,
      }, null, 2);
    }

    /* 导出与发布指引 */
    var outBox = el("div", "wp-auth");
    outBox.appendChild(el("h3", "wp-task-title", "导出并发布"));
    outBox.appendChild(el("p", "wp-muted",
      "发布：GitHub 仓库 → assets/data/results.json → 编辑 → 把下面内容整体粘贴覆盖 → Commit。" +
      "学生端刷新即看到 通过/打回 与排行榜（他们看不到审核过程）。"));
    var exportOut = el("textarea", "wp-writeup-area");
    exportOut.rows = 10;
    exportOut.readOnly = true;
    outBox.appendChild(exportOut);
    var copyBtn = el("button", "wp-btn is-mini is-primary", "复制 results.json");
    copyBtn.type = "button";
    copyBtn.addEventListener("click", function () {
      if (navigator.clipboard) navigator.clipboard.writeText(exportOut.value).then(function () {
        copyBtn.textContent = "已复制 ✓"; setTimeout(function () { copyBtn.textContent = "复制 results.json"; }, 1500);
      });
      else window.prompt("手动复制：", exportOut.value);
    });
    outBox.appendChild(copyBtn);
    host.appendChild(outBox);

    renderTable();
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
      "1. 登录（本页顶部）：GitHub 用户名 + 真实姓名 + 四条战线方向，保存在你自己的浏览器\n" +
      "2. 登录后进入「题目/提交」：只看到你注册方向的题，按批次发放（EASY → HARD），每批有截止倒计时\n" +
      "3. 解题 → 粘贴 flag 校验\n" +
      "4. 点「提交 Writeup」→ 在面板里写（或下载空模板本地写好粘贴回来）→ 生成 <姓名>-<题号>.md 下载\n" +
      "5. 把该文件发到教练邮箱 19170040127@189.cn 或答疑 QQ 群 —— 全程不需要 GitHub\n" +
      "6. 回本页看结果：通过计分上榜；打回会显示理由，修改后点「重新提交」"));
    host.appendChild(box);

    var box2 = el("div", "wp-auth");
    box2.appendChild(el("h3", "wp-task-title", "教练 · 审核流程（仅 @" + (CFG.coach || "?") + " 可见审核台）"));
    box2.appendChild(el("p", "wp-muted",
      "1. 收到 md 文件 → 可把内容粘贴给 AI 辅助评审拿分数建议 → 自己定夺\n" +
      "2. 审核台逐题录入：通过（分数）或 打回（理由）\n" +
      "3. 点「复制 results.json」→ GitHub 网页端覆盖 assets/data/results.json → Commit\n" +
      "4. 学生端自动看到结果与排行榜\n" +
      "5. 发批次：GitHub 网页端编辑 assets/data/batches.json（战线 key / 批号 / deadline / ranges 题号区间）\n" +
      "6. 加题：python tools/gen_bank.py，或从 CTF2 平台导入（tools/import_ctf2.py）"));
    host.appendChild(box2);

    var box3 = el("div", "wp-auth");
    box3.appendChild(el("h3", "wp-task-title", "安全模型（如实说明）"));
    box3.appendChild(el("p", "wp-muted",
      "纯静态架构：身份与提交记录存本机浏览器；题目与答案经多层加密存放（bank.enc.js），运行时解密，属高门槛混淆。" +
      "审核结果的真实门禁在 GitHub 仓库写权限：只有教练能提交 results.json。"));
    host.appendChild(box3);
  }

  /* ==========================================================================
     登录门禁：未登录只显示登录卡；登录后才显示题目/排行榜/审核台
     ========================================================================== */
  function renderGate() {
    var gate = $("#wp-gate");
    var app = $("#wp-app");
    var logged = isLoggedIn();
    if (gate) gate.hidden = logged;
    if (app) app.hidden = !logged;
    var reviewTab = $$(".wp-tab").filter(function (t) { return t.getAttribute("data-view") === "review"; })[0];
    if (reviewTab) reviewTab.hidden = !isCoach();
    if (!isCoach() && view === "review") view = "tasks";
    var who = $("#wp-whoami");
    if (who) {
      who.textContent = logged
        ? "@" + profile.github + " · " + profile.name + " · " + TRACKS[profile.direction].label + "方向"
        : "未登录";
    }
    var loginBtn = $("#wp-login-btn");
    if (loginBtn) {
      loginBtn.innerHTML = logged
        ? profile.name + " <span class=\"btn-arrow\">↗</span>"
        : "登录 / 注册<span class=\"btn-arrow\">↗</span>";
    }
  }

  /* ---------- 身份表单 ---------- */
  function bindProfileForm() {
    var f = $("#wp-profile-form");
    if (!f) return;
    f.github.value = profile.github || "";
    f.name.value = profile.name || "";
    f.direction.value = profile.direction || "";
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var gh = f.github.value.trim().replace(/^@/, "");
      var nm = f.name.value.trim();
      var dir = f.direction.value;
      var msg = $("#wp-profile-msg");
      if (!gh) return setMsg(msg, "GitHub 用户名必填（审核结果按它核对）", "bad");
      if (!nm) return setMsg(msg, "真实姓名必填（提交规范命名 <姓名>-<题号>.md）", "bad");
      if (!dir) return setMsg(msg, "选择研究方向（决定你看到的题目）", "bad");
      profile = { github: gh, name: nm, direction: dir };
      lsSave(PROFILE_KEY, profile);
      setMsg(msg, "LOGIN OK // 已进入，下方是你的题目面板", "ok");
      renderGate();
      renderCurrent();
    });
    var clearBtn = $("#wp-profile-clear");
    if (clearBtn) clearBtn.addEventListener("click", function () {
      profile = { github: "", name: "", direction: "" };
      lsSave(PROFILE_KEY, profile);
      renderGate();
    });
    var logoutBtn = $("#wp-logout-btn");
    if (logoutBtn) logoutBtn.addEventListener("click", function () {
      if (!window.confirm("退出登录（清除本机身份）？")) return;
      profile = { github: "", name: "", direction: "" };
      lsSave(PROFILE_KEY, profile);
      view = "tasks";
      location.hash = "";
      renderGate();
    });
  }

  /* ==========================================================================
     路由 & 初始化
     ========================================================================== */
  function renderCurrent() {
    if (!isLoggedIn()) { renderGate(); return; }
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
    if (!$("#wp-profile-form")) {
      /* 集成模式（ctf.html）：只提供解题记录接口 */
      window.ZerothSecWriteup = {
        recordSolve: function (challengeId) {
          var q = ls(CTF_SOLVED_KEY, []);
          if (q.indexOf(challengeId) < 0) { q.push(challengeId); lsSave(CTF_SOLVED_KEY, q); }
          return Promise.resolve({ recorded: true });
        },
        isLoggedIn: function () { return isLoggedIn(); },
        nickname: function () { return profile.name || null; },
        gotoSubmit: function () { location.href = "writeup.html#/tasks"; },
      };
      return;
    }

    bindProfileForm();
    renderGate();

    $$(".wp-tab").forEach(function (t) {
      t.addEventListener("click", function () {
        location.hash = "#/" + t.getAttribute("data-view");
      });
    });

    initRouter();

    /* 预热解密 */
    window.ZSBank.loadBank().then(function () {
      if (isLoggedIn() && view === "tasks") renderTasksView();
    }).catch(function (e) { console.warn("[zs] 题库预热失败", e); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
