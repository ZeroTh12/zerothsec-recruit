/* ==========================================================================
   ZEROTHSEC — Writeup 提交系统 v5（assets/js/writeup.js）
   纯静态 · 学生端不接触 GitHub · 星期制自动批次。

   流程：
     - 登录门禁：GitHub 用户名 + 真实姓名 + 四条战线方向（存本机浏览器），
       登录后才显示题目/提交、排行榜、说明
     - 题目：CTF² 平台 BUUCTF 真题；每日发题（batches.json：start + daily），
       每天 0 点解锁，一周一个周期（daily×7 题），周日 23:59:59 截止，下周自动换新题
     - 提交：题卡内「上传 .md 文件」控件（规范命名 <姓名>-<题号>.md）→ 直接经中转服务
       写入仓库 submissions/（服务端持令牌，学生与教练都不接触 GitHub、也不用手动转发）
     - 结果：教练在隐藏审核页点 通过/打回 → 结论即刻写入 assets/data/results.json →
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
  var QQ_HINT = "上传即可，无需手动转发；若上传失败请稍后重试或联系教练";

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
  var lastSubmitOnline = false;
  var lastSubmitErr = "";

  function isLoggedIn() { return !!(profile.github && profile.name && profile.direction); }
  function chById(id) {
    if (!bank) return null;
    return (bank.challenges || []).find(function (c) { return c.id === id; }) || null;
  }

  /* 教练发布结果 → 我的状态表（按 GitHub 用户名或姓名匹配） */
  function myStatusMap() {
    var map = {};
    if (!results || !profile.github) return map;
    (results.entries || []).forEach(function (e) {
      var ghOk = e.github && e.github.toLowerCase() === profile.github.toLowerCase();
      var nmOk = e.name && profile.name && e.name === profile.name;
      if (ghOk || nmOk) {
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
     每日发题制：每天 0 点解锁 daily 道新题；一周为一个周期（weekly=daily*7），
     全题池按 难度→类别→题号 顺序切片，任何一天、任何一周的题互不重复。
     兼容旧 weekly 配置（无 daily 时按周整批发放）。
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

  function planNow() {
    var cfg = (batches && batches[profile.direction]) || {};
    var startMs = cfg.start ? new Date(cfg.start).getTime() : NaN;
    var daily = cfg.daily ? Math.max(1, parseInt(cfg.daily, 10)) : 0;
    var weekly = daily ? daily * 7 : Math.max(1, parseInt(cfg.weekly, 10) || 5);
    var DAY = 86400000;
    var now = Date.now();
    var p = { daily: daily, weekly: weekly, gday: 1, week: 1, dayInWeek: 1,
              dayEnd: now + DAY, weekDeadline: now + 7 * DAY, notStarted: false };
    if (isNaN(startMs)) return p;
    if (now < startMs) { p.notStarted = true; return p; }
    var gday = Math.floor((now - startMs) / DAY) + 1;
    p.gday = gday;
    p.week = Math.floor((gday - 1) / 7) + 1;
    p.dayInWeek = ((gday - 1) % 7) + 1;
    p.dayEnd = startMs + gday * DAY - 1000;
    p.weekDeadline = startMs + p.week * 7 * DAY - 1000;
    return p;
  }

  /* ==========================================================================
     提交落库：经中转服务写入仓库 submissions/
     （令牌只在服务端，学生端与页面里都不出现令牌）
     ========================================================================== */
  var serverNames = null; // submissions/ 目录文件名缓存
  function subDir() { return CFG.subDir || "submissions"; }
  // 服务器地址取自 wp-config.js 的 relay（必须配置，学生上传靠它落库）
  function relayUrl() { return (CFG.relay || "").replace(/\/+$/, ""); }
  function canServerSubmit() { return !!relayUrl(); }
  async function serverSubmit(fname, content) {
    if (!canServerSubmit()) { throw new Error("提交服务未配置（relay 为空），请按 Ctrl+F5 强制刷新页面后重试"); }
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 25000) : null;
    var r;
    try {
      r = await fetch(relayUrl() + "/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fname, content: content }),
        signal: ctrl ? ctrl.signal : undefined
      });
    } catch (e) {
      throw new Error(e && e.name === "AbortError" ? "提交超时（网络不通），请重试" : "网络错误：" + (e && e.message ? e.message : "无法连接提交服务"));
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!r.ok) {
      var d = await r.json().catch(function () { return {}; });
      throw new Error(d.error || ("HTTP " + r.status));
    }
    return true;
  }
  async function serverSubNames(force) {
    if (serverNames && !force) return serverNames;
    try {
      var r = await fetch(relayUrl() + "/api/list?t=" + Date.now());
      if (!r.ok) return (serverNames = []);
      return (serverNames = (await r.json()).map(function (f) { return f.name; }));
    } catch (e) { return (serverNames = []); }
  }
  function expectedFname(ch) { return profile.name + "-" + ch.id + ".md"; }

  /* ==========================================================================
     提交：上传 .md 控件 → 本机档案 + 自动写入仓库 submissions/
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

  /* 卡片内的提交区：上传控件 + 模板下载 + 服务器/本机状态 */
  function submitZone(card, ch, sub, serverHas, refresh) {
    var zone = el("div", "wp-submit-zone");

    var expectName = expectedFname(ch);
    zone.appendChild(el("p", "wp-hint", "规范命名：" + expectName + "。点「上传 .md 提交」后直接进入本站提交库，教练在审核台即可看到并批阅，无需再转发给任何人。"));

    var row = el("div", "wp-row");
    row.style.flexWrap = "wrap";

    var fileIn = el("input");
    fileIn.type = "file";
    fileIn.accept = ".md,.markdown,.txt";
    fileIn.className = "wp-file-input";
    var upBtn = el("button", "wp-btn is-mini is-primary", (sub || serverHas) ? "重新上传 .md" : "上传 .md 提交");
    upBtn.type = "button";
    fileIn.addEventListener("change", function () {
      var f = fileIn.files && fileIn.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = async function () {
        var text = String(reader.result || "");
        saveSubmission(ch, f.name, text);
        upBtn.disabled = true;
        upBtn.textContent = "提交中…";
        var online = false, errMsg = "";
        try {
          await serverSubmit(expectedFname(ch), text);
          serverNames = null;
          await serverSubNames(true);
          online = true;
        } catch (err) {
          errMsg = err && err.message ? err.message : "网络异常";
        }
        upBtn.disabled = false;
        lastSubmitOnline = online;
        lastSubmitErr = online ? "" : errMsg;
        upBtn.textContent = online ? "已入库 ✓" : "重试上传";
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
      var viewBtn = el("button", "wp-btn is-mini", "查看本机存档");
      viewBtn.type = "button";
      var pre = el("pre", "wp-sub-view");
      pre.hidden = true;
      viewBtn.addEventListener("click", function () {
        pre.textContent = sub.content;
        pre.hidden = !pre.hidden;
      });
      row.appendChild(viewBtn);

      var delBtn = el("button", "wp-btn is-mini", "撤回本机存档");
      delBtn.type = "button";
      delBtn.addEventListener("click", function () {
        if (window.confirm("撤回本机存档？（仓库里的提交不受影响，如需删除请让教练在管理页操作）")) {
          removeSubmission(ch.id);
          refresh();
        }
      });
      row.appendChild(delBtn);
      zone.appendChild(row);
      zone.appendChild(pre);
    } else {
      zone.appendChild(row);
    }

    var stLine;
    if (serverHas) {
      stLine = el("p", "wp-msg ok", "✓ 已入库（submissions/" + expectName + "），等待教练审核。重新上传会覆盖旧版。");
    } else if (sub) {
      stLine = el("p", lastSubmitErr ? "wp-msg bad" : "wp-msg", (lastSubmitErr ? "上传失败：" + lastSubmitErr + "。" : "尚未上传成功。") + "可点「重试上传」重新提交；多次失败请把这句错误截图发给教练。");
    } else {
      stLine = el("p", "wp-muted", "尚未提交。");
    }
    zone.appendChild(stLine);
    card.appendChild(zone);
  }

  /* ==========================================================================
     视图：题目 / 提交（星期制）
     ========================================================================== */
  function statusBadge(status) {
    var map = { accepted: "已通过", rejected: "已打回", submitted: "已提交·待审" };
    var cls = { accepted: "b-solved", rejected: "b-cat", submitted: "b-pending" };
    var t = map[status.status] || status.status;
    if (status.status === "accepted" && status.score) t += " · " + status.score + "分";
    return el("span", "wp-badge " + (cls[status.status] || "b-cat"), t);
  }

  function challengeCard(ch, status, sub, serverHas) {
    var card = el("div", "wp-task" + (status ? " is-" + status.status : ""));
    var main = el("div", "wp-task-main");
    var head = el("div", "wp-task-head");
    head.appendChild(el("h3", "wp-task-title", "【" + ch.id + "】" + ch.title));
    head.appendChild(el("span", "wp-badge b-cat", (CAT_LABEL[ch.dir] || ch.dir) + " · " + DIFF_LABEL[ch.diff] + " · " + ch.score + "分"));
    if (status) head.appendChild(statusBadge(status));
    else if (serverHas || sub) head.appendChild(statusBadge({ status: "submitted" }));
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
      submitZone(card, ch, sub, serverHas, function () { renderTasksView(); });
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
    var plan = planNow();
    var statusMap = myStatusMap();
    var subs = mySubmissions();
    var myNames = {};
    (await serverSubNames(true)).forEach(function (n) { myNames[n] = true; });

    function cardList(list) {
      var wrap = el("div", "wp-list");
      list.forEach(function (ch) {
        wrap.appendChild(challengeCard(ch, statusMap[ch.id] || null, subs[ch.id] || null, !!myNames[expectedFname(ch)]));
      });
      return wrap;
    }

    if (plan.notStarted) {
      host.appendChild(el("p", "wp-msg", "发题将于 " + new Date((batches[profile.direction] || {}).start).toLocaleString("zh-CN") + " 开始，敬请期待。"));
      return;
    }

    /* 顶部横幅：今天/本周 + 倒计时 */
    var banner = el("div", "wp-auth");
    var head1 = plan.daily
      ? "// 方向：" + TRACKS[profile.direction].label + " · 每日发题制 · 每天 0 点解锁 " + plan.daily + " 道新题 · 本周共 " + plan.weekly + " 题（易→难，绝不重复）"
      : "// 方向：" + TRACKS[profile.direction].label + " · 星期制批次 · 每周 " + plan.weekly + " 题（易→难自动递进）";
    banner.appendChild(el("p", "wp-kicker", head1));
    var cdLine = el("p", "wp-msg",
      "第 " + plan.week + " 周 · 第 " + plan.dayInWeek + "/7 天 · 周期截止倒计时：");
    var cdNum = el("b", null, countdownText(plan.weekDeadline));
    cdNum.setAttribute("data-deadline", String(plan.weekDeadline));
    cdLine.appendChild(cdNum);
    banner.appendChild(cdLine);
    var weekSliceList = pool.slice((plan.week - 1) * plan.weekly, plan.week * plan.weekly);
    var done = weekSliceList.filter(function (c) { return statusMap[c.id] && statusMap[c.id].status === "accepted"; }).length;
    banner.appendChild(el("p", "wp-muted", "本周完成 " + done + " / " + weekSliceList.length + " 题 · 累计通过 " +
      Object.keys(statusMap).filter(function (k) { return statusMap[k].status === "accepted"; }).length + " 题"));
    host.appendChild(banner);

    if (plan.daily) {
      /* 每日模式：今天的新题 */
      var today = pool.slice((plan.gday - 1) * plan.daily, plan.gday * plan.daily);
      host.appendChild(el("p", "wp-kicker", "// 今天解锁 · " + today.length + " 题"));
      if (today.length) host.appendChild(cardList(today));
      else host.appendChild(el("p", "wp-muted", "题库已刷完，联系教练从 CTF² 拉新题。"));

      /* 本周早些时候（已解锁，折叠） */
      var earlier = pool.slice((plan.week - 1) * plan.weekly, (plan.gday - 1) * plan.daily);
      if (earlier.length) {
        var det = el("details", "wp-week");
        det.appendChild(el("summary", null, "本周早些时候已解锁 · " + earlier.length + " 题：" +
          earlier.map(function (c) {
            var s = statusMap[c.id];
            return c.id + (s ? (s.status === "accepted" ? "✓" : "✗") : "·");
          }).join("、")));
        det.appendChild(cardList(earlier));
        host.appendChild(det);
      }

      /* 本周剩余天数（锁定预告） */
      var remainDays = 7 - plan.dayInWeek;
      var remainCount = Math.min(remainDays * plan.daily,
        Math.max(0, plan.week * plan.weekly - plan.gday * plan.daily));
      if (remainCount > 0) {
        host.appendChild(el("p", "wp-muted", "🔒 明天 0 点解锁 " + plan.daily + " 道新题；本周还剩 " + remainCount + " 题待发。"));
      } else if (plan.gday * plan.daily < plan.week * plan.weekly) {
        host.appendChild(el("p", "wp-muted", "🔒 本周题目已全部解锁，周日 23:59 截止；下周一自动换新题。"));
      }
    } else {
      /* 兼容周模式：本周整批 */
      host.appendChild(el("p", "wp-kicker", "// 第 " + plan.week + " 周 · 本周任务 · " + weekSliceList.length + " 题"));
      if (weekSliceList.length) host.appendChild(cardList(weekSliceList));
      else host.appendChild(el("p", "wp-muted", "题库已刷完，联系教练从 CTF² 拉新题。"));
    }

    /* 下周预告（折叠） */
    var next = pool.slice(plan.week * plan.weekly, plan.week * plan.weekly + plan.weekly);
    if (next.length) {
      var nx = el("details", "wp-week");
      nx.appendChild(el("summary", null, "下周预告 · " + next.length + " 题：" + next.map(function (c) { return c.id; }).join("、")));
      host.appendChild(nx);
    }

    /* 历史周（折叠，最近在前，最多 6 周） */
    var hist = [];
    for (var w = plan.week - 1; w >= 1 && hist.length < 6; w--) hist.push(w);
    hist.forEach(function (w) {
      var list = pool.slice((w - 1) * plan.weekly, w * plan.weekly);
      if (!list.length) return;
      var det2 = el("details", "wp-week");
      det2.appendChild(el("summary", null, "第 " + w + " 周（已截止）· " + list.length + " 题：" +
        list.map(function (c) {
          var s = statusMap[c.id];
          return c.id + (s ? (s.status === "accepted" ? "✓" : "✗") : "·");
        }).join("、")));
      det2.appendChild(cardList(list));
      host.appendChild(det2);
    });

    countdownTimer = setInterval(function () {
      $$("[data-deadline]", host).forEach(function (n) {
        n.textContent = countdownText(Number(n.getAttribute("data-deadline")));
      });
    }, 1000);
  }

  /* ==========================================================================
     视图：我的提交（仓库 submissions/ 里属于你的入库记录 + 本机档案）
     ========================================================================== */
  async function renderMineView() {
    var host = $("#wp-view-mine .wp-section-body");
    if (!host) return;
    host.innerHTML = "";
    host.appendChild(el("p", "wp-muted", "LOADING // 读取仓库提交记录…"));
    var names = await serverSubNames(true);
    var subs = mySubmissions();
    var statusMap = myStatusMap();
    host.innerHTML = "";

    var mine = names.filter(function (n) {
      return n.indexOf(profile.name + "-") === 0;
    });
    host.appendChild(el("p", "wp-kicker", "// 已入库 " + mine.length + " 篇（仓库 submissions/ 目录，教练直接审核）"));
    if (!mine.length) {
      host.appendChild(el("p", "wp-muted", "还没有入库的提交。去「题目 / 提交」页的题卡里上传 .md 文件。"));
    }
    mine.forEach(function (n) {
      var idm = n.match(/((?:WEB|CRYPTO|MISC|REVERSE|PWN)-\d+)\.md$/i);
      var id = idm ? idm[1].toUpperCase() : "";
      var box = el("div", "wp-auth");
      box.style.marginBottom = "12px";
      var h = el("div", "wp-row");
      h.appendChild(el("h3", "wp-task-title", n));
      var st = statusMap[id];
      h.appendChild(el("span", "wp-badge " + (st ? (st.status === "accepted" ? "b-solved" : "b-cat") : "b-pending"),
        st ? (st.status === "accepted" ? "已通过 " + st.score + "分" : "打回：" + (st.reason || "")) : "待审核"));
      box.appendChild(h);
      host.appendChild(box);
    });

    var localOnly = Object.keys(subs).filter(function (id) { return mine.indexOf(expectedFname({ id: id })) < 0; });
    if (localOnly.length) {
      host.appendChild(el("p", "wp-kicker", "// 本机存档未入库 " + localOnly.length + " 篇（重新上传即可入库）"));
      localOnly.forEach(function (id) {
        host.appendChild(el("p", "wp-muted", id + " · " + subs[id].filename + " · " + new Date(subs[id].at).toLocaleString("zh-CN")));
      });
    }
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
      host.appendChild(el("p", "wp-muted", "暂无排行数据。流程：你在题卡上传 Writeup 入库 → 教练审核发布 results → 本页自动更新。"));
      return;
    }
    var byGh = {};
    entries.forEach(function (e) {
      var k = ((e.github && e.github !== "unknown" ? e.github : e.name) || "unknown").toLowerCase();
      if (!byGh[k]) byGh[k] = { github: e.github || "", name: e.name || e.github || "?", dir: "", accepted: 0, rejected: 0, total: 0 };
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
      "1. 登录（GitHub 用户名 + 真实姓名 + 方向）——方向决定题目池，互不重复\n" +
      "2. 每日发题制：**每天 0 点解锁 3 道新题**，一周为一个周期（共 21 题），周日 23:59 截止，下周自动换新题；题目按 易→难 排列，绝不重题\n" +
      "3. 点题目卡「去平台做题 ↗」在 CTF² 平台解题拿 flag（需注册 CTF²/MYDAS 账号）\n" +
      "4. 写 Writeup：点「下载空模板」→ 按模板写 → 保存为 <姓名>-<题号>.md\n" +
      "5. 题卡内点「上传 .md 提交」→ 文件直接进入本站提交库，教练当场能看到\n" +
      "6. 回本页看结果：通过计分上榜；打回看理由，改完重新上传\n" +
      "7. 「我的提交」标签查看你已入库的全部 Writeup 与审核状态"));
    host.appendChild(box);

    var box3 = el("div", "wp-auth");
    box3.appendChild(el("h3", "wp-task-title", "提交存在哪里"));
    box3.appendChild(el("p", "wp-muted",
      "Writeup 上传后由本站服务直接存进审核库（仓库 submissions/ 目录），只有教练看得到，其他同学看不到。" +
      "教练在审核台浏览全文、批注、打分，通过或打回后，你回到本页刷新即可看到结果与排行榜名次。"));
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
