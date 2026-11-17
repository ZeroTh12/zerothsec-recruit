/* ==========================================================================
   ZEROTHSEC — Writeup 提交系统 v5（assets/js/writeup.js）
   纯静态 · 学生端不接触 GitHub · 星期制自动批次。

   流程：
     - 登录门禁：GitHub 用户名 + 真实姓名 + 四条战线方向（存本机浏览器），
       登录后才显示题目/提交、排行榜、说明
     - 题目：CTF² 平台 BUUCTF 真题；星期制批次（batches.json：start + weekly），
       第 N 周 = 题库按 难度→类别→题号 排序切片，周日 23:59:59 截止，下周自动换新题
     - 提交：题卡内「上传 .md 文件」控件（规范命名 <姓名>-<题号>.md），
       内容校验后存入本机提交档案（localStorage）；文件本体发 QQ 群给教练。
       纯静态站无服务器，文件无法自动上传到网站——审核在教练的隐藏审核页完成
     - 结果：教练在隐藏审核页录入 通过/打回 → 发布 assets/data/results.json →
       学生端题卡显示结果与排行榜（看不到审核过程与审核页）
   ========================================================================== */
(function () {
  "use strict";

  var CFG = window.WP_CONFIG || { repo: "", coach: "" };
  var CAT_LABEL = { web: "Web", crypto: "Crypto", misc: "Misc", reverse: "Reverse", pwn: "Pwn" };
  var TRACKS = {
    websec:    { label: "Web 安全",   cats: ["web", "crypto"] },
    rpwn:      { label: "逆向与 Pwn", cats: ["reverse", "pwn"] },
    forensics: { label: "数字取证",   cats: ["misc"] },
    defense:   { label: "防守与运营", cats: ["misc", "web"] }
  };
  var CAT2TRACK = { web: "websec", crypto: "websec", reverse: "rpwn", pwn: "rpwn", misc: "forensics" };
  var DIFF_LABEL = { easy: "EASY", medium: "MEDIUM", hard: "HARD" };
  var DIFF_RANK = { easy: 0, medium: 1, hard: 2 };

  var PROFILE_KEY = "zs-wp-profile";
  var SUBMIT_KEY = "zs-wp-submissions";
  var RESULTS_URL = "assets/data/results.json";
  var QQ_HINT = "把该 .md 文件发到招新答疑 QQ 群（群二维码见 02 招新页·联系我们），教练在群里收文件";

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
  function countdownText(deadlineMs) {
    var diff = deadlineMs - Date.now();
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
  function chNum(c) { return parseInt(c.id.split("-")[1], 10); }

  /* ---------- 全局状态 ---------- */
  var profile = ls(PROFILE_KEY, { github: "", name: "", direction: "" });
  if (profile.direction && !TRACKS[profile.direction]) {
    profile.direction = CAT2TRACK[profile.direction] || "";
    lsSave(PROFILE_KEY, profile);
  }
  var bank = null;
  var batches = null;   // { websec:{start,weekly}, ... }
  var results = { entries: [] };
  var view = "tasks";
  var countdownTimer = null;

  function isLoggedIn() { return !!(profile.github && profile.name && profile.direction); }
  function chById(id) {
    if (!bank) return null;
    return (bank.challenges || []).find(function (c) { return c.id === id; }) || null;
  }

  /* 教练发布结果 → 我的状态表 */
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

  /* 本机提交档案 */
  function mySubmissions() { return ls(SUBMIT_KEY, {}); }

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
  }

  /* ==========================================================================
     星期制批次：第 N 周 = 题库池按 难度→类别→题号 排序切片
     ========================================================================== */
  function trackPool() {
    var cats = (TRACKS[profile.direction] && TRACKS[profile.direction].cats) || [];
    return bank.challenges.filter(function (c) { return cats.indexOf(c.dir) >= 0; })
      .sort(function (a, b) {
        return (DIFF_RANK[a.diff] - DIFF_RANK[b.diff]) ||
               a.dir.localeCompare(b.dir) ||
               chNum(a) - chNum(b);
      });
  }

  function weekPlan() {
    var cfg = (batches && batches[profile.direction]) || {};
    var startMs = cfg.start ? new Date(cfg.start).getTime() : NaN;
    var weekly = Math.max(1, parseInt(cfg.weekly, 10) || 5);
    if (isNaN(startMs)) return { weekly: weekly, current: 1, startMs: Date.now() };
    var W = 7 * 86400000;
    var now = Date.now();
    var n = now < startMs ? 0 : Math.floor((now - startMs) / W) + 1;
    var deadline = startMs + n * W - 1000;
    return { weekly: weekly, current: n, startMs: startMs, deadline: deadline, W: W };
  }

  function weekSlice(pool, plan, w) {
    return pool.slice((w - 1) * plan.weekly, w * plan.weekly);
  }

  /* ==========================================================================
     提交：上传 .md 控件 + 本机档案（文件本体发 QQ 群）
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
      "（把你从 CTF² 平台拿到的 flag 原样粘贴在这里）",
      "",
      "## 解题思路 / 步骤",
      "",
      "（怎么发现切入点 → 每一步做了什么 → 拿到 flag。截图可另附发群，文字必须自述过程。）",
      "",
      "## 复盘",
      "",
      "（卡在哪里、学到了什么、下次怎么更快。）",
      "",
    ].join("\n");
  }

  function downloadTemplate(ch) {
    var blob = new Blob([writeupTemplate(ch)], { type: "text/markdown;charset=utf-8" });
    var a = el("a");
    a.href = URL.createObjectURL(blob);
    a.download = profile.name + "-" + ch.id + ".md";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  function saveSubmission(ch, filename, content) {
    var s = ls(SUBMIT_KEY, {});
    s[ch.id] = {
      filename: filename,
      content: content,
      at: new Date().toISOString(),
      name: profile.name,
      github: profile.github,
    };
    lsSave(SUBMIT_KEY, s);
  }

  function removeSubmission(chId) {
    var s = ls(SUBMIT_KEY, {});
    delete s[chId];
    lsSave(SUBMIT_KEY, s);
  }

  /* 卡片内的提交区：上传控件 + 模板下载 + 档案状态 */
  function submitZone(card, ch, sub, refresh) {
    var zone = el("div", "wp-submit-zone");

    var expectName = profile.name + "-" + ch.id + ".md";
    zone.appendChild(el("p", "wp-hint", "规范命名：" + expectName + "。写好后用下方控件提交存档，并把文件发到 QQ 群给教练。"));

    var row = el("div", "wp-row");
    row.style.flexWrap = "wrap";

    var fileIn = el("input");
    fileIn.type = "file";
    fileIn.accept = ".md,.markdown,.txt";
    fileIn.className = "wp-file-input";
    var upBtn = el("button", "wp-btn is-mini is-primary", sub ? "重新上传 .md" : "上传 .md 提交");
    upBtn.type = "button";
    fileIn.addEventListener("change", function () {
      var f = fileIn.files && fileIn.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var text = String(reader.result || "");
        var ok = /^<!--ZSWP[\s\S]*?-->/.test(text) || f.name === expectName;
        saveSubmission(ch, f.name, text);
        if (!ok) {
          window.alert("已存档，但注意：文件名不是「" + expectName + "」或缺少 ZSWP 头，教练核对可能受影响。建议用模板重写。");
        }
        refresh();
      };
      reader.readAsText(f, "utf-8");
    });
    upBtn.addEventListener("click", function () { fileIn.click(); });
    row.appendChild(upBtn);
    row.appendChild(fileIn);

    var tplBtn = el("button", "wp-btn is-mini", "下载空模板");
    tplBtn.type = "button";
    tplBtn.addEventListener("click", function () { downloadTemplate(ch); });
    row.appendChild(tplBtn);

    if (sub) {
      var viewBtn = el("button", "wp-btn is-mini", "查看存档内容");
      viewBtn.type = "button";
      var pre = el("pre", "wp-sub-view");
      pre.hidden = true;
      viewBtn.addEventListener("click", function () {
        pre.textContent = sub.content;
        pre.hidden = !pre.hidden;
      });
      row.appendChild(viewBtn);

      var delBtn = el("button", "wp-btn is-mini", "撤回存档");
      delBtn.type = "button";
      delBtn.addEventListener("click", function () {
        if (window.confirm("撤回本机提交档案？（QQ 群里已发的文件不受影响）")) {
          removeSubmission(ch.id);
          refresh();
        }
      });
      row.appendChild(delBtn);

      zone.appendChild(row);
      var info = el("p", "wp-msg ok",
        "已存档：" + sub.filename + "（" + new Date(sub.at).toLocaleString("zh-CN") + "）· " + QQ_HINT);
      zone.appendChild(info);
      zone.appendChild(pre);
    } else {
      zone.appendChild(row);
      zone.appendChild(el("p", "wp-muted", QQ_HINT));
    }

    card.appendChild(zone);
  }

  /* ==========================================================================
     视图：题目 / 提交（星期制）
     ========================================================================== */
  function statusBadge(status) {
    var map = { accepted: "已通过", rejected: "已打回", submitted: "已存档·待审" };
    var cls = { accepted: "b-solved", rejected: "b-cat", submitted: "b-pending" };
    var t = map[status.status] || status.status;
    if (status.status === "accepted" && status.score) t += " · " + status.score + "分";
    return el("span", "wp-badge " + (cls[status.status] || "b-cat"), t);
  }

  function challengeCard(ch, status, sub, extra) {
    var card = el("div", "wp-task" + (status ? " is-" + status.status : ""));
    var main = el("div", "wp-task-main");
    var head = el("div", "wp-task-head");
    head.appendChild(el("h3", "wp-task-title", "【" + ch.id + "】" + ch.title));
    head.appendChild(el("span", "wp-badge b-cat", (CAT_LABEL[ch.dir] || ch.dir) + " · " + DIFF_LABEL[ch.diff] + " · " + ch.score + "分"));
    if (status) head.appendChild(statusBadge(status));
    else if (sub) head.appendChild(statusBadge({ status: "submitted" }));
    if (extra) head.appendChild(extra);
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
      var src = el("a", "wp-btn is-mini", "去平台做题 ↗");
      src.href = ch.link;
      src.target = "_blank";
      src.rel = "noopener";
      src.style.display = "inline-block";
      src.style.marginTop = "6px";
      main.appendChild(src);
    }

    if (status && status.status === "rejected" && status.reason) {
      main.appendChild(el("p", "wp-msg bad", "教练打回理由：" + status.reason + " —— 修改后重新上传提交。"));
    }
    card.appendChild(main);

    var side = el("div", "wp-task-side");
    var score = el("div", "wp-task-score");
    score.appendChild(document.createTextNode(String(status && status.status === "accepted" ? status.score : ch.score)));
    score.appendChild(el("small", null, " PTS"));
    side.appendChild(score);
    card.appendChild(side);

    /* 提交区：已通过不再显示；打回/未交都可上传 */
    if (!status || status.status !== "accepted") {
      submitZone(card, ch, sub, function () { renderTasksView(); });
    }
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

    var pool = trackPool();
    var plan = weekPlan();
    var statusMap = myStatusMap();
    var subs = mySubmissions();

    /* 顶部横幅：方向 + 本周任务 + 倒计时 */
    var banner = el("div", "wp-auth");
    var bTitle = el("p", "wp-kicker", "// 方向：" + TRACKS[profile.direction].label +
      " · 星期制批次 · 每周 " + plan.weekly + " 题（易→难自动递进）");
    banner.appendChild(bTitle);
    if (plan.current >= 1) {
      var cd = el("p", "wp-msg", "");
      cd.innerHTML = "本周（第 " + plan.current + " 周）截止倒计时：<b data-deadline=\"" + plan.deadline + "\">" +
        countdownText(plan.deadline) + "</b>";
      banner.appendChild(cd);
    }
    var done = 0, total = 0;
    if (plan.current >= 1) {
      weekSlice(pool, plan, plan.current).forEach(function (c) {
        total++;
        if (statusMap[c.id] && statusMap[c.id].status === "accepted") done++;
      });
      banner.appendChild(el("p", "wp-muted", "本周完成 " + done + " / " + total + " 题 · 累计通过 " +
        Object.keys(statusMap).filter(function (k) { return statusMap[k].status === "accepted"; }).length + " 题"));
    }
    host.appendChild(banner);

    function cardList(list) {
      var wrap = el("div", "wp-list");
      list.forEach(function (ch) {
        wrap.appendChild(challengeCard(ch, statusMap[ch.id] || null, subs[ch.id] || null));
      });
      return wrap;
    }

    /* 本周任务 */
    if (plan.current >= 1) {
      var cur = weekSlice(pool, plan, plan.current);
      host.appendChild(el("p", "wp-kicker", "// 第 " + plan.current + " 周 · 本周任务 · " + cur.length + " 题"));
      if (cur.length) host.appendChild(cardList(cur));
      else host.appendChild(el("p", "wp-muted", "题库已刷完，联系教练从 CTF² 拉新题。"));

      /* 下周预告（折叠） */
      var next = weekSlice(pool, plan, plan.current + 1);
      if (next.length) {
        var nx = el("details", "wp-week");
        nx.appendChild(el("summary", null, "下周预告 · " + next.length + " 题：" + next.map(function (c) { return c.id; }).join("、")));
        nx.appendChild(cardList(next));
        host.appendChild(nx);
      }
    }

    /* 历史周（折叠，最近在前，最多 6 周） */
    var hist = [];
    for (var w = plan.current - 1; w >= 1 && hist.length < 6; w--) hist.push(w);
    hist.forEach(function (w) {
      var list = weekSlice(pool, plan, w);
      if (!list.length) return;
      var det = el("details", "wp-week");
      det.appendChild(el("summary", null, "第 " + w + " 周（已截止）· " + list.length + " 题：" +
        list.map(function (c) {
          var s = statusMap[c.id];
          return c.id + (s ? (s.status === "accepted" ? "✓" : "✗") : "·");
        }).join("、")));
      det.appendChild(cardList(list));
      host.appendChild(det);
    });

    countdownTimer = setInterval(function () {
      $$("[data-deadline]", host).forEach(function (n) {
        n.textContent = countdownText(Number(n.getAttribute("data-deadline")));
      });
    }, 1000);
  }

  /* ==========================================================================
     视图：我的提交（本机档案总览）
     ========================================================================== */
  function renderMineView() {
    var host = $("#wp-view-mine .wp-section-body");
    if (!host) return;
    host.innerHTML = "";
    var subs = mySubmissions();
    var keys = Object.keys(subs);
    host.appendChild(el("p", "wp-muted",
      "以下是你在这台浏览器里存档的 Writeup（共 " + keys.length + " 篇）。" +
      "纯静态网站没有服务器，存档只在本机——每篇提交后记得把同一个 .md 文件发到 QQ 群，教练以群里的文件为准进行审核。"));
    if (!keys.length) { host.appendChild(el("p", "wp-muted", "（还没有存档的提交）")); return; }
    var statusMap = myStatusMap();
    keys.sort().forEach(function (id) {
      var sub = subs[id];
      var box = el("div", "wp-auth");
      box.style.marginBottom = "14px";
      var h = el("div", "wp-row");
      h.appendChild(el("h3", "wp-task-title", sub.filename));
      var st = statusMap[id];
      h.appendChild(el("span", "wp-badge " + (st ? (st.status === "accepted" ? "b-solved" : "b-cat") : "b-pending"),
        st ? (st.status === "accepted" ? "已通过 " + st.score + "分" : "打回：" + (st.reason || "")) : "等待教练审核"));
      box.appendChild(h);
      box.appendChild(el("p", "wp-muted", "存档时间：" + new Date(sub.at).toLocaleString("zh-CN")));
      var pre = el("pre", "wp-sub-view");
      pre.textContent = (sub.content || "").slice(0, 1200) + ((sub.content || "").length > 1200 ? "\n…" : "");
      box.appendChild(pre);
      host.appendChild(box);
    });
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
      host.appendChild(el("p", "wp-muted", "暂无排行数据。流程：你上传存档 + 发 .md 文件到 QQ 群 → 教练审核发布 results → 本页自动更新。"));
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
     视图：使用说明
     ========================================================================== */
  function renderGuideView() {
    var host = $("#wp-view-guide .wp-section-body");
    if (!host) return;
    host.innerHTML = "";
    var box = el("div", "wp-auth");
    box.appendChild(el("h3", "wp-task-title", "队员 · 每周流程"));
    box.appendChild(el("p", "wp-muted",
      "1. 登录（GitHub 用户名 + 真实姓名 + 方向）——方向决定题目池，每周自动换一批\n" +
      "2. 看「本周任务」：每周 " + ((weekPlan().weekly) || 5) + " 题，周日 23:59 截止，倒计时在面板顶部\n" +
      "3. 点题目卡「去平台做题 ↗」在 CTF² 平台解题拿 flag（需注册 CTF²/MYDAS 账号）\n" +
      "4. 写 Writeup：点「下载空模板」→ 按模板写 → 保存为 <姓名>-<题号>.md\n" +
      "5. 题卡内点「上传 .md 提交」存档到本站 + 把同一个文件发到招新答疑 QQ 群（两步都要）\n" +
      "6. 教练审核后回本页看结果：通过计分上榜；打回看理由，改完重新上传\n" +
      "7. 「我的提交」标签可查看本机所有存档"));
    host.appendChild(box);

    var box2 = el("div", "wp-auth");
    box2.appendChild(el("h3", "wp-task-title", "教练 · 审核（隐藏页，地址不外发）"));
    box2.appendChild(el("p", "wp-muted",
      "1. 在 QQ 群收齐本周 <姓名>-<题号>.md 文件\n" +
      "2. 打开教练审核页（站内无链接，地址仅教练知晓），把文件整批拖入\n" +
      "3. 逐题看全文，可把内容粘贴给 AI 辅助评审拿分数建议 → 自己定夺\n" +
      "4. 录入 通过(分数)/打回(理由) → 复制导出的 results.json → GitHub 网页端覆盖 assets/data/results.json 提交\n" +
      "5. 学生端自动显示结果与排行榜；发题是星期制自动的，改 batches.json 的 weekly 即可调每周题量"));
    host.appendChild(box2);

    var box3 = el("div", "wp-auth");
    box3.appendChild(el("h3", "wp-task-title", "为什么提交要\"两步\"（如实说明）"));
    box3.appendChild(el("p", "wp-muted",
      "本站是纯静态网站（GitHub Pages 托管），没有服务器，浏览器里上传的文件无法自动传到任何后台。" +
      "所以题卡的「上传提交」把 Writeup 存进你本机的提交档案（防丢、可回看、教练结果对号入座），" +
      "文件本体仍需你发到 QQ 群交给教练——这是纯静态架构下最接近\"网站内提交\"的方式。" +
      "审核在教练的隐藏页完成，你看不到审核过程，只能看到最终结果。"));
    host.appendChild(box3);
  }

  /* ==========================================================================
     登录门禁
     ========================================================================== */
  function renderGate() {
    var gate = $("#wp-gate");
    var app = $("#wp-app");
    var logged = isLoggedIn();
    if (gate) gate.hidden = logged;
    if (app) app.hidden = !logged;
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
      if (!window.confirm("退出登录（清除本机身份，提交档案保留）？")) return;
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
  var VIEWS = ["tasks", "mine", "rank", "guide"];

  function renderCurrent() {
    if (!isLoggedIn()) { renderGate(); return; }
    if (view === "tasks") renderTasksView();
    else if (view === "mine") renderMineView();
    else if (view === "rank") renderRankView();
    else if (view === "guide") renderGuideView();
    else renderTasksView();
  }

  function initRouter() {
    function readHash() {
      var h = (location.hash || "").replace(/^#\//, "");
      view = VIEWS.indexOf(h) >= 0 ? h : "tasks";
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
          var q = ls("zs-ctf-solved", []);
          if (q.indexOf(challengeId) < 0) { q.push(challengeId); lsSave("zs-ctf-solved", q); }
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
