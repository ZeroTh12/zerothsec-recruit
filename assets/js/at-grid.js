/* AT-GRID — 为 .track 媒体网格瓷砖生成各自的动态视觉画布
   四种变体：代码雨 / 内存扫描 / 报文波形 / 雷达扫掠。
   低帧率（24fps）、离屏暂停、尊重 prefers-reduced-motion。 */
(function () {
  "use strict";

  var tiles = document.querySelectorAll(".track");
  if (!tiles.length) return;

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var FPS = 24;
  var FRAME = 1000 / FPS;

  function makeCanvas(tile) {
    var c = document.createElement("canvas");
    c.setAttribute("aria-hidden", "true");
    tile.insertBefore(c, tile.firstChild);
    return c;
  }

  /* ---- 变体 1：代码雨（Web 安全） ---- */
  function codeRain(ctx, w, h, t, state) {
    if (!state.cols) {
      var fs = 14;
      state.fs = fs;
      state.cols = Math.ceil(w / fs);
      state.pos = [];
      for (var i = 0; i < state.cols; i++) state.pos.push(Math.random() * -h);
    }
    ctx.fillStyle = "rgba(10,10,10,0.18)";
    ctx.fillRect(0, 0, w, h);
    ctx.font = state.fs + "px monospace";
    for (var i = 0; i < state.cols; i++) {
      var ch = String.fromCharCode(33 + Math.floor(Math.random() * 94));
      var y = state.pos[i];
      ctx.fillStyle = Math.random() > 0.975 ? "rgba(198,255,61,0.85)" : "rgba(242,242,242,0.28)";
      ctx.fillText(ch, i * state.fs, y);
      state.pos[i] = y > h + 40 || Math.random() > 0.995 ? 0 : y + state.fs;
    }
  }

  /* ---- 变体 2：内存扫描（逆向与 Pwn） ---- */
  function memScan(ctx, w, h, t, state) {
    var fs = 11;
    var cols = Math.ceil(w / (fs * 2.1));
    var rows = Math.ceil(h / (fs * 1.8));
    if (rows !== state.rows || cols !== state.cols) {
      state.rows = rows;
      state.cols = cols;
      state.grid = [];
      for (var i = 0; i < rows * cols; i++) {
        state.grid.push((Math.floor(Math.random() * 256)).toString(16).toUpperCase().padStart(2, "0"));
      }
      state.refresh = [];
      for (var i = 0; i < rows * cols; i++) state.refresh.push(Math.random());
    }
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);
    ctx.font = fs + "px monospace";
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var idx = r * cols + c;
        if (Math.random() > 0.997) state.grid[idx] = (Math.floor(Math.random() * 256)).toString(16).toUpperCase().padStart(2, "0");
        ctx.fillStyle = state.refresh[idx] > 0.94 ? "rgba(242,242,242,0.4)" : "rgba(242,242,242,0.13)";
        ctx.fillText(state.grid[idx], c * fs * 2.1, r * fs * 1.8 + fs);
      }
    }
    var scanY = (t * 0.06) % h;
    var g = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30);
    g.addColorStop(0, "rgba(198,255,61,0)");
    g.addColorStop(0.5, "rgba(198,255,61,0.16)");
    g.addColorStop(1, "rgba(198,255,61,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, scanY - 30, w, 60);
  }

  /* ---- 变体 3：报文波形（数字取证） ---- */
  function packetWave(ctx, w, h, t) {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(242,242,242,0.08)";
    ctx.lineWidth = 1;
    for (var x = 0; x < w; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (var lane = 0; lane < 3; lane++) {
      var base = h * (0.28 + lane * 0.22);
      ctx.beginPath();
      for (var x = 0; x <= w; x += 3) {
        var n = Math.sin((x + t * (0.04 + lane * 0.015)) * 0.02 + lane * 2) * 10;
        var spike = Math.random() > 0.985 ? (Math.random() - 0.5) * 46 : 0;
        ctx.lineTo(x, base + n + spike);
      }
      ctx.strokeStyle = lane === 1 ? "rgba(198,255,61,0.5)" : "rgba(242,242,242,0.3)";
      ctx.lineWidth = lane === 1 ? 1.4 : 1;
      ctx.stroke();
    }
  }

  /* ---- 变体 4：雷达扫掠（防守与运营） ---- */
  function radar(ctx, w, h, t) {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);
    var cx = w / 2, cy = h / 2;
    var R = Math.min(w, h) * 0.42;
    ctx.strokeStyle = "rgba(242,242,242,0.12)";
    ctx.lineWidth = 1;
    for (var i = 1; i <= 4; i++) {
      ctx.beginPath(); ctx.arc(cx, cy, (R * i) / 4, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();

    var ang = (t * 0.0012) % (Math.PI * 2);
    var g = ctx.createConicGradient ? ctx.createConicGradient(ang, cx, cy) : null;
    if (g) {
      g.addColorStop(0, "rgba(198,255,61,0.28)");
      g.addColorStop(0.12, "rgba(198,255,61,0)");
      g.addColorStop(1, "rgba(198,255,61,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = "rgba(198,255,61,0.6)";
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
    ctx.stroke();

    var blips = [[0.3, 0.8], [-0.55, -0.3], [0.7, -0.45], [-0.2, 0.62]];
    for (var b = 0; b < blips.length; b++) {
      var bx = cx + blips[b][0] * R, by = cy + blips[b][1] * R;
      var ba = Math.atan2(by - cy, bx - cx);
      var diff = ((ang - ba) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      var fade = Math.max(0, 1 - diff / 1.6);
      if (fade > 0.02) {
        ctx.fillStyle = "rgba(198,255,61," + (0.75 * fade).toFixed(2) + ")";
        ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  var variants = [codeRain, memScan, packetWave, radar];

  var runners = [];
  Array.prototype.forEach.call(tiles, function (tile, i) {
    var canvas = makeCanvas(tile);
    var ctx = canvas.getContext("2d");
    var state = {};
    var draw = variants[i % variants.length];
    var visible = true;

    function size() {
      canvas.width = tile.clientWidth || 480;
      canvas.height = tile.clientHeight || 360;
      state = {};
    }
    size();

    if (window.ResizeObserver) {
      new ResizeObserver(function () { size(); if (reduce) frame(0); }).observe(tile);
    } else {
      window.addEventListener("resize", size);
    }

    function frame(t) {
      draw(ctx, canvas.width, canvas.height, t, state);
    }

    if (reduce) {
      frame(1200 + i * 900);
      return;
    }

    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
      }, { threshold: 0.05 }).observe(tile);
    }

    runners.push({ fn: frame, visible: function () { return visible; } });
  });

  if (reduce || !runners.length) return;

  var last = 0;
  var clock = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (now - last < FRAME) return;
    last = now;
    clock += FRAME;
    for (var i = 0; i < runners.length; i++) {
      if (runners[i].visible()) runners[i].fn(clock);
    }
  }
  requestAnimationFrame(loop);
})();
