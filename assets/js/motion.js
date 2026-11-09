/* ==========================================================================
   ZEROTHSEC — 动效层 / BLACKWALL PROTOCOL
   冷启动：内核终端打字 → 字标逐字解密(RGB 分离) → 雷达光圈 → 百叶撕开
   站内跳转：点击冲击波 + 故障色条 → 水平百叶合拢封屏 → 黑洞读数 + 十六进制流
   新页抵达：数据雨 + 读数 → 百叶交错撕开 → 扫描线 / 色散闪光收敛
   ========================================================================== */
(function () {
  "use strict";

  var doc = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var SESSION_KEY = "zerothsec.motion.v4";

  var ROUTES = {
    "index.html": ["00", "首页 / HOME"],
    "major.html": ["01", "专业 / MAJOR"],
    "recruit.html": ["02", "招新 / RECRUIT"],
    "ctf.html": ["03", "CTF / 攻防演练"],
  };

  var pageNo = doc.getAttribute("data-page") || "00";
  var pageLabel = doc.getAttribute("data-label") || "首页 / HOME";

  var GLYPHS = "01<>/\\[]{}$#%&*+=~^";
  var HEXC = "0123456789ABCDEF";
  var RAINC = "01ｱｲｳｴｵｶｷｸｹｺｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ<>/#*+=ABCDEF";

  function rnd(n) {
    return Math.floor(Math.random() * n);
  }

  function glyph() {
    return GLYPHS.charAt(rnd(GLYPHS.length));
  }

  function hexLine(len) {
    var s = "";
    for (var i = 0; i < len; i++) s += HEXC.charAt(rnd(16));
    return s;
  }

  /* ---------- 入场节奏：为同组元素编号 ---------- */
  Array.prototype.forEach.call(document.querySelectorAll("[data-reveal]"), function (el) {
    var parent = el.parentElement;
    var group = parent
      ? Array.prototype.filter.call(parent.children, function (c) {
          return c.hasAttribute && c.hasAttribute("data-reveal");
        })
      : [el];
    var i = group.indexOf(el);
    el.style.setProperty("--i", String(Math.min(i < 0 ? 0 : i, 6)));
  });

  var entered = false;

  function markEntered() {
    if (entered) return;
    entered = true;
    doc.classList.add("is-entered");
    doc.classList.remove("motion-pending");
    window.dispatchEvent(new Event("zerothsec:entered"));
  }

  if (reduce) {
    markEntered();
    return;
  }

  /* ---------- 构建相位层 ---------- */
  function buildBlinds() {
    var n = window.innerWidth < 720 ? 8 : 12;
    var html = '<div class="m-blinds" style="--n:' + n + '">';
    for (var k = 0; k < n; k++) html += '<i style="--k:' + k + '"></i>';
    return html + "</div>";
  }

  function buildRain() {
    var cols = window.innerWidth < 720 ? 7 : 14;
    var html = '<div class="m-rain" aria-hidden="true">';
    for (var c = 0; c < cols; c++) {
      var text = "";
      for (var i = 0; i < 26; i++) text += RAINC.charAt(rnd(RAINC.length)) + "\n";
      var dur = (1.5 + Math.random() * 1.4).toFixed(2);
      var delay = (-Math.random() * 2).toFixed(2);
      var left = ((c + 0.5) * (100 / cols) + (Math.random() * 3 - 1.5)).toFixed(2);
      html +=
        '<span style="left:' + left + "%;animation-duration:" + dur + "s;animation-delay:" + delay + 's">' +
        text +
        "</span>";
    }
    return html + "</div>";
  }

  function buildBars() {
    var html = '<div class="m-bars" aria-hidden="true">';
    for (var i = 0; i < 7; i++) {
      var top = rnd(96);
      var h = 1 + rnd(5);
      var delay = (Math.random() * 0.34).toFixed(2);
      var kind = i % 3;
      html +=
        '<i class="k' + kind + '" style="top:' + top + "%;height:" + h + "px;animation-delay:" + delay + 's"></i>';
    }
    return html + "</div>";
  }

  function buildHexflow() {
    var html = '<div class="m-hexflow" aria-hidden="true">';
    for (var side = 0; side < 2; side++) {
      var lines = "";
      for (var i = 0; i < 34; i++) lines += "0x" + hexLine(4) + "  " + hexLine(8) + "\n";
      html += "<pre>" + lines + "</pre>";
    }
    return html + "</div>";
  }

  function buildLayer(opts) {
    var mode = opts.mode || "boot";
    var layer = document.createElement("div");
    layer.id = "motion-layer";
    layer.setAttribute("aria-hidden", "true");
    layer.classList.add("is-" + mode);

    if (mode === "boot") layer.classList.add("is-interactive");
    if (opts.covered) layer.classList.add("is-cover");
    if (opts.closing) layer.classList.add("is-closing");

    var no = opts.no || "00";
    var label = opts.label || "首页 / HOME";
    var shortLabel = label.split("/")[0].trim();

    var frame;
    if (mode === "boot") {
      frame = [
        "ZEROTHSEC // KERNEL 2.6",
        "NODE " + no + " / LOCAL",
        "PHASE / LOCK",
        "RECRUIT / 2026",
      ];
    } else if (mode === "arrival") {
      frame = ["PHASE LOCK", "NODE " + no + " / " + shortLabel, "ZEROTHSEC / RANGE", "SECURE CHANNEL"];
    } else {
      frame = ["ROUTE COLLAPSE", no + " / " + shortLabel, "ZEROTHSEC / RANGE", "SECURE CHANNEL"];
    }

    var inner = "";

    inner += '<div class="m-texture"></div>';
    inner += '<div class="m-vignette"></div>';
    inner += buildBlinds();
    inner += buildRain();
    if (mode !== "boot") inner += buildHexflow();
    inner += buildBars();

    if (mode === "transition") {
      inner += '<span class="m-shock s1"></span><span class="m-shock s2"></span>';
      inner += '<span class="m-clickflash"></span>';
      inner += '<div class="m-streaks"></div>';
    }

    if (mode === "boot") {
      inner +=
        '<div class="m-hud">' +
          '<span class="m-ghost" aria-hidden="true">' + no + "</span>" +
          '<div class="m-orbit">' +
            '<span class="m-orbit-ring"></span>' +
            '<span class="m-orbit-ring alt"></span>' +
            '<span class="m-orbit-ticks"></span>' +
            '<span class="m-orbit-sweep"></span>' +
            '<span class="m-orbit-cross"></span>' +
            '<span class="m-orbit-core"></span>' +
          "</div>" +
          '<div class="m-word" aria-hidden="true"></div>' +
          '<span class="m-hud-line"></span>' +
          '<span class="m-cn">网络空间安全工作室</span>' +
          '<div class="m-wave"><svg viewBox="0 0 640 40" preserveAspectRatio="none" aria-hidden="true">' +
            '<path d=""></path>' +
          "</svg></div>" +
          '<div class="m-phases">' +
            "<span><i></i>IGNITION</span>" +
            "<span><i></i>DECRYPT</span>" +
            "<span><i></i>RANGE READY</span>" +
          "</div>" +
        "</div>" +
        '<div class="m-term" aria-hidden="true">' +
          '<span class="m-term-line"></span>' +
          '<span class="m-term-line"></span>' +
          '<span class="m-term-line"></span>' +
          '<span class="m-term-line"></span>' +
          '<span class="m-caret"></span>' +
        "</div>";
    }

    if (mode !== "boot") {
      inner +=
        '<div class="m-readout">' +
          '<span class="m-readout-kicker">' + (mode === "arrival" ? "PHASE LOCK" : "ROUTE COLLAPSE") + "</span>" +
          '<span class="m-readout-no" data-text="' + no + '">' + no + "</span>" +
          '<span class="m-readout-label">' + label + "</span>" +
          '<span class="m-readout-rule"></span>' +
        "</div>";
    }

    inner += '<span class="m-crt"></span>';
    inner += '<div class="m-bloom"></div>';
    inner += '<div class="m-scan"></div>';
    inner += '<div class="m-flash"></div>';
    inner +=
      '<div class="m-frame">' +
        '<span class="m-frame-tl">' + frame[0] + "</span>" +
        '<span class="m-frame-tr">' + frame[1] + "</span>" +
        '<span class="m-frame-bl">' + frame[2] + "</span>" +
        '<span class="m-frame-br">' + frame[3] + "</span>" +
      "</div>";

    layer.innerHTML = inner;

    if (mode === "boot") {
      var word = layer.querySelector(".m-word");
      var chars = "ZEROTHSEC";
      var wh = "";
      for (var i = 0; i < chars.length; i++) {
        wh += '<span style="--c:' + i + '">' + glyph() + "</span>";
      }
      word.innerHTML = wh;
      fillWave(layer);
    }

    if (opts.ox !== undefined && opts.oy !== undefined) {
      layer.style.setProperty("--ox", opts.ox + "px");
      layer.style.setProperty("--oy", opts.oy + "px");
    }

    return layer;
  }

  function fillWave(layer) {
    var path = layer.querySelector(".m-wave path");
    if (!path) return;
    var pts = [];
    for (var x = 0; x <= 640; x += 16) {
      var y = 20 + Math.sin(x * 0.045) * 7 + (Math.random() * 9 - 4.5);
      pts.push(x + "," + y.toFixed(1));
    }
    path.setAttribute("d", "M" + pts.join(" L"));
  }

  /* 字标逐字解密：每个字符在自己的时刻锁定 */
  function scrambleWord(layer) {
    var spans = layer.querySelectorAll(".m-word span");
    if (!spans.length) return;
    var word = "ZEROTHSEC";
    var start = performance.now();

    function frame(now) {
      var done = true;
      for (var i = 0; i < spans.length; i++) {
        var settle = start + 320 + i * 74;
        if (now >= settle) {
          if (spans[i].textContent !== word.charAt(i)) spans[i].textContent = word.charAt(i);
        } else {
          done = false;
          spans[i].textContent = glyph();
        }
      }
      if (!done) requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  /* 内核终端：高速打字 */
  function typeTerm(layer) {
    var lines = layer.querySelectorAll(".m-term-line");
    var caret = layer.querySelector(".m-caret");
    if (!lines.length) return;
    var text = [
      "> zerothsec.kernel v2.6.11 … ok",
      "> mount /range.local … handshake ACCEPTED",
      "> decrypt wordmark[9] … phase lock",
      "> recruit/2026 … channel OPEN",
    ];
    var li = 0;
    var ci = 0;

    if (caret && lines[0]) lines[0].appendChild(caret);

    function tick() {
      if (li >= lines.length) {
        if (caret) caret.classList.add("is-done");
        return;
      }
      ci += 1;
      lines[li].textContent = text[li].slice(0, ci);
      if (caret) lines[li].appendChild(caret);
      if (ci >= text[li].length) {
        li += 1;
        ci = 0;
        timers.push(window.setTimeout(tick, 70));
      } else {
        timers.push(window.setTimeout(tick, 7 + rnd(10)));
      }
    }

    tick();
  }

  function removeLayer(target) {
    if (!target || !target.parentNode) return;
    target.parentNode.removeChild(target);
  }

  /* ---------- 启动 ---------- */
  var layer = null;
  var introDone = false;
  var timers = [];

  function clearTimers() {
    timers.forEach(function (id) {
      window.clearTimeout(id);
    });
    timers = [];
  }

  function openLayer(target) {
    if (!target) return;
    target.classList.add("is-open");
    doc.classList.remove("phase-arriving");
    markEntered();
  }

  function skipIntro() {
    if (!layer || introDone) return;
    introDone = true;
    clearTimers();
    openLayer(layer);
    window.removeEventListener("pointerdown", skipIntro, true);
    window.removeEventListener("keydown", onKey, true);
    window.setTimeout(function () {
      removeLayer(layer);
    }, 260);
  }

  function onKey(e) {
    if (e.key === "Escape" || e.key === " " || e.key === "Enter") skipIntro();
  }

  function runBoot() {
    layer = buildLayer({ mode: "boot", covered: true, no: pageNo, label: pageLabel });
    doc.classList.add("phase-arriving");
    document.body.appendChild(layer);

    requestAnimationFrame(function () {
      doc.classList.remove("motion-pending");
    });

    window.addEventListener("pointerdown", skipIntro, true);
    window.addEventListener("keydown", onKey, true);

    timers.push(
      window.setTimeout(function () {
        if (!introDone && layer) typeTerm(layer);
      }, 60)
    );

    timers.push(
      window.setTimeout(function () {
        if (!introDone && layer) scrambleWord(layer);
      }, 140)
    );

    timers.push(
      window.setTimeout(function () {
        if (!introDone && layer) openLayer(layer);
      }, 1560)
    );

    timers.push(
      window.setTimeout(function () {
        removeLayer(layer);
        introDone = true;
        window.removeEventListener("pointerdown", skipIntro, true);
        window.removeEventListener("keydown", onKey, true);
      }, 2450)
    );
  }

  function runArrival() {
    layer = buildLayer({ mode: "arrival", covered: true, no: pageNo, label: pageLabel });
    doc.classList.add("phase-arriving");
    document.body.appendChild(layer);

    requestAnimationFrame(function () {
      doc.classList.remove("motion-pending");
    });

    timers.push(
      window.setTimeout(function () {
        if (layer) openLayer(layer);
      }, 240)
    );

    timers.push(
      window.setTimeout(function () {
        removeLayer(layer);
        introDone = true;
      }, 1050)
    );
  }

  function runIntro() {
    var isReturn = false;
    try {
      isReturn = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch (err) {
      isReturn = false;
    }
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch (err) {
      /* ignore */
    }

    if (isReturn) runArrival();
    else runBoot();
  }

  /* ---------- 页面切换 ---------- */
  function routeFor(url) {
    var name = url.pathname.split("/").pop() || "index.html";
    return ROUTES[name] || null;
  }

  var leaving = false;

  function navigate(url, ox, oy) {
    if (leaving) return;
    leaving = true;

    if (reduce) {
      window.location.href = url.href;
      return;
    }

    var info = routeFor(url);
    if (!info) {
      window.location.href = url.href;
      return;
    }

    var mainEl = document.querySelector("main");
    if (mainEl) {
      var rect = mainEl.getBoundingClientRect();
      doc.style.setProperty("--mox", ox - rect.left + "px");
      doc.style.setProperty("--moy", oy - rect.top + "px");
    }

    doc.classList.add("phase-out");

    var out = buildLayer({
      mode: "transition",
      closing: true,
      covered: false,
      no: info[0],
      label: info[1],
      ox: ox,
      oy: oy,
    });
    document.body.appendChild(out);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        out.classList.add("is-cover");
      });
    });

    window.setTimeout(function () {
      window.location.href = url.href;
    }, 640);
  }

  document.addEventListener(
    "click",
    function (e) {
      if (e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest ? e.target.closest("a") : null;
      if (!a) return;
      var href = a.getAttribute("href");
      if (!href || a.target === "_blank" || a.hasAttribute("download")) return;
      if (/^(mailto:|tel:|javascript:)/i.test(href)) return;

      var url;
      try {
        url = new URL(href, window.location.href);
      } catch (err) {
        return;
      }
      if (url.origin !== window.location.origin) return;

      var samePath = url.pathname === window.location.pathname;
      if (href.charAt(0) === "#" || (samePath && url.hash)) return;
      if (samePath) return;

      e.preventDefault();
      var ox = e.clientX;
      var oy = e.clientY;
      if (!ox && !oy) {
        var rect = a.getBoundingClientRect();
        ox = rect.left + rect.width / 2;
        oy = rect.top + rect.height / 2;
      }
      navigate(url, ox, oy);
    },
    true
  );

  /* 从 bfcache 返回时清理残留，并恢复跳转能力 */
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    var stale = document.getElementById("motion-layer");
    if (stale) removeLayer(stale);
    doc.classList.remove("motion-pending", "phase-arriving", "phase-out");
    leaving = false;
    markEntered();
  });

  runIntro();
})();
