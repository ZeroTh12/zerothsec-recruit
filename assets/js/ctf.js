/* ==========================================================================
   ZEROTHSEC — 纯静态 CTF 题目管理器
   - 从 assets/data/challenges.json 拉取题库
   - 浏览器本地生成每人独立的 flag
   - 本地校验、按题换类型、复习进度保存在 localStorage
   - 可直接部署到 GitHub Pages
   ========================================================================== */
(function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  const stack = $("#challenge-stack");
  const STATE_KEY = "zerothsec.range.static.v1";
  const UID_KEY = "zerothsec.range.uid.v1";
  const REMOTE_BANK_URL = ""; // 可选：填一个允许 CORS 的公网 JSON 地址
  const CATEGORY_CYCLE = ["source", "path", "decode", "interactive"];
  const state = { slots: [], solved: 0, total: 0, uid: "", replacements: 0 };

  /* ======================================================================
     基础 DOM 工具
     ====================================================================== */
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function setText(sel, text) {
    const node = $(sel);
    if (node) node.textContent = text;
  }

  function setMsg(node, text, kind) {
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("is-ok", kind === "ok");
    node.classList.toggle("is-bad", kind === "bad");
  }

  function shake(card) {
    const body = card ? $(".quest-body", card) : null;
    if (!body) return;
    body.classList.remove("is-shake");
    void body.offsetWidth;
    body.classList.add("is-shake");
    window.setTimeout(() => body.classList.remove("is-shake"), 480);
  }

  /* ======================================================================
     解题成功弹层
     ====================================================================== */
  let solveLayer = null;
  let solveTimer = 0;
  let confettiFrame = 0;

  function burstConfetti(canvas) {
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const colors = ["#c6ff3d", "#63e6e2", "#ffffff", "#ffb03a", "#ff5c5c", "#8cbf27", "#e9efe6"];
    const parts = [];
    const cx = W / 2;
    const cy = H / 2 - 30;

    for (let i = 0; i < 240; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 7 + Math.random() * 25;
      parts.push({
        x: cx + (Math.random() - 0.5) * 110,
        y: cy + (Math.random() - 0.5) * 80,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 9,
        w: 3 + Math.random() * 7,
        h: 3 + Math.random() * 9,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        circle: Math.random() < 0.3,
        delay: Math.random() * 0.16,
        flip: Math.random() * Math.PI * 2,
        flipSpeed: 4 + Math.random() * 8,
      });
    }

    const start = performance.now();

    function frame(now) {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, W, H);

      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (t < p.delay) continue;

        p.vy += 0.32;
        p.vx *= 0.988;
        p.vy *= 0.993;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.flip += p.flipSpeed * 0.06;

        const life = Math.max(0, 1 - Math.max(0, t - 2.9) / 1.2);
        if (life <= 0) continue;

        ctx.save();
        ctx.globalAlpha = Math.min(1, life * 1.8);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.circle) {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const h = p.h * Math.abs(Math.cos(p.flip));
          ctx.fillRect(-p.w / 2, -h / 2, p.w, h);
        }
        ctx.restore();
      }

      if (t < 4.4) {
        confettiFrame = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, W, H);
      }
    }

    confettiFrame = requestAnimationFrame(frame);
  }

  function closeSolve() {
    const layer = solveLayer;
    if (!layer) return;
    solveLayer = null;
    window.clearTimeout(solveTimer);
    window.cancelAnimationFrame(confettiFrame);
    document.removeEventListener("keydown", onSolveKey);
    layer.classList.remove("is-on");
    layer.classList.add("is-off");
    window.setTimeout(() => {
      if (layer.parentNode) layer.parentNode.removeChild(layer);
    }, 420);
  }

  function onSolveKey(e) {
    if (e.key === "Escape") closeSolve();
  }

  function showSolve(title) {
    closeSolve();

    const layer = el("div", "solve-layer");
    layer.setAttribute("role", "dialog");
    layer.setAttribute("aria-modal", "true");
    layer.setAttribute("aria-label", "解题成功");

    const backdrop = el("div", "solve-backdrop");

    const toast = el("div", "solve-toast");
    toast.appendChild(el("i"));
    const toastText = el("span");
    toastText.appendChild(document.createTextNode("恭喜！"));
    const toastName = el("b", null, title);
    toastText.appendChild(toastName);
    toastText.appendChild(document.createTextNode(" 解题成功，获得 "));
    const toastPoint = el("b", null, "1 分");
    toastText.appendChild(toastPoint);
    toast.appendChild(toastText);

    const card = el("div", "solve-card");
    card.appendChild(el("span", "solve-ring"));

    const avatar = el("div", "solve-avatar");
    const img = el("img");
    img.src = "assets/img/success-avatar.png";
    img.alt = "";
    avatar.appendChild(img);

    const name = el("div", "solve-name", "RANGE / " + title);

    card.appendChild(avatar);
    card.appendChild(el("div", "solve-title", "解题成功！"));
    card.appendChild(el("div", "solve-points", "+1 分"));
    card.appendChild(name);

    const canvas = el("canvas", "solve-canvas");

    layer.appendChild(backdrop);
    layer.appendChild(toast);
    layer.appendChild(card);
    layer.appendChild(canvas);

    document.body.appendChild(layer);
    solveLayer = layer;

    requestAnimationFrame(() => {
      layer.classList.add("is-on");
      burstConfetti(canvas);
    });

    layer.addEventListener("click", closeSolve);
    document.addEventListener("keydown", onSolveKey);
    solveTimer = window.setTimeout(closeSolve, 3600);
  }

  /* ======================================================================
     进度 / 系统栏
     ====================================================================== */
  function updateProgress() {
    const total = state.slots.length || 4;
    setText("#assign-count", `${state.solved} / ${total} SOLVED`);
    setText("#assign-total", `TOTAL ${state.total}`);
    const fill = $("#assign-fill");
    if (fill) fill.style.width = `${Math.round((state.solved / total) * 100)}%`;
  }

  /* ======================================================================
     题目工件渲染
     ====================================================================== */
  const ART_LABELS = {
    comment: "SOURCE / COMMENT",
    attr: "SOURCE / DATA ATTRIBUTE",
    meta: "SOURCE / META TAG",
    path: "PATH / GET CONSOLE",
    decode: "CRYPTO / PAYLOAD",
    code: "REVERSE / STATIC CODE",
    cookie: "WEB / COOKIE JAR",
    storage: "WEB / LOCAL STORAGE",
    memory: "MISC / MEMORY",
    reflex: "MISC / REFLEX",
    pixel: "MISC / PIXEL",
    overflow: "PWN / BUFFER",
    image: "MISC / IMAGE METADATA",
    log: "MISC / LOG AUDIT",
  };

  function artifactShell(kind) {
    const wrap = el("div", "q-artifact");
    const head = el("div", "artifact-head");
    head.appendChild(el("span", null, ART_LABELS[kind] || "ARTIFACT"));
    head.appendChild(el("b", null, "READY"));
    const body = el("div", "artifact-body");
    wrap.appendChild(head);
    wrap.appendChild(body);
    return { wrap, body, head };
  }

  function mountComment(body, art) {
    const pre = el("pre", "artifact-code");
    pre.appendChild(document.createTextNode('<section id="range-proof">\n  '));
    pre.appendChild(document.createComment(" RANGE PROOF / " + art.value + " "));
    pre.appendChild(document.createTextNode('\n  <p>nothing to see here.</p>\n</section>'));
    body.appendChild(pre);
    body.appendChild(
      el("p", "artifact-note", "注释节点不会渲染。F12 → Elements 中搜索 flag{ 即可看到它。")
    );
  }

  function mountAttr(body, art, card) {
    card.setAttribute(art.name, art.value);
    const pre = el("pre", "artifact-code");
    pre.textContent =
      '<article class="quest"\n  ' + art.name + '="••••••••-••••-••••-••••-••••••••••••">\n  ...\n</article>';
    body.appendChild(pre);
    body.appendChild(
      el("p", "artifact-note", "本关卡片的 " + art.name + " 属性里写着本轮 flag。Elements 中选中卡片后查看属性列表。")
    );
  }

  function mountMeta(body, art) {
    const meta = document.createElement("meta");
    meta.name = art.name;
    meta.content = art.value;
    meta.dataset.rangeRound = "1";
    document.head.appendChild(meta);
    const pre = el("pre", "artifact-code");
    pre.textContent = '<head>\n  ...\n  <meta name="' + art.name + '" content="••••••••">\n</head>';
    body.appendChild(pre);
    body.appendChild(
      el("p", "artifact-note", "标签已写入 <head>。Elements 顶部展开 head，搜索 meta 即可读到 content。")
    );
  }

  function mountPath(body, art) {
    const consoleBox = el("div", "path-console");
    const bar = el("div", "path-bar");
    bar.appendChild(el("span", null, "GET"));
    const input = el("input");
    input.type = "text";
    input.placeholder = art.start || "/";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "请求路径");
    const btn = el("button", null, "发送");
    btn.type = "button";
    bar.appendChild(input);
    bar.appendChild(btn);

    const out = el("pre", "path-out", "range.local / ready\n等待请求…");
    const tip = el("p", "path-tip", "目标主机 range.local · 只支持 GET · 路径区分大小写");

    function send() {
      const path = input.value.trim();
      if (!path) return;
      const route = (art.routes || []).find((r) => r.path === path);
      if (route) {
        out.textContent = "GET " + path + "\n\n" + route.body;
        out.classList.remove("is-bad");
      } else {
        out.textContent = "GET " + path + "\n\nHTTP/1.1 404 Not Found\n{\n  \"error\": \"path not found\"\n}";
        out.classList.add("is-bad");
      }
    }

    btn.addEventListener("click", send);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        send();
      }
    });

    consoleBox.appendChild(bar);
    consoleBox.appendChild(out);
    consoleBox.appendChild(tip);
    body.appendChild(consoleBox);
  }

  function mountDecode(body, art) {
    const method = (art.method || "base64").toUpperCase();
    const pre = el("pre", "artifact-code decode-payload", art.payload || "");
    body.appendChild(pre);
    const note = el("p", "artifact-note");
    note.textContent =
      "METHOD: " + method + " · " + (String(art.payload || "").length) + " chars · 复制后在 Console 解码";
    body.appendChild(note);
  }

  function mountCode(body, art) {
    body.appendChild(el("pre", "artifact-code", art.code || ""));
    body.appendChild(
      el("p", "artifact-note", "这是静态代码。按顺序拼接常量即可，不需要运行，也不需要破解任何程序。")
    );
  }

  function mountCookie(body, art) {
    const name = art.name || "range_proof";
    document.cookie = name + "=" + art.value + "; path=/; SameSite=Lax";
    const pre = el(
      "pre",
      "artifact-code",
      "HTTP/1.1 200 OK\nSet-Cookie: " + name + "=••••••••; Path=/\n\n// 浏览器已保存这条 cookie"
    );
    body.appendChild(pre);
    body.appendChild(
      el("p", "artifact-note", "F12 → Application → Cookies，找到 " + name + "。也可以在 Console 输入 document.cookie。")
    );
  }

  function mountStorage(body, art) {
    const key = art.key || "range_proof";
    try {
      window.localStorage.setItem(key, art.value);
    } catch (err) {
      /* 隐私模式下可能不可用 */
    }
    const pre = el(
      "pre",
      "artifact-code",
      "Application → Local Storage\n" + key + " = ••••••••\n\n// 已写入当前浏览器"
    );
    body.appendChild(pre);
    body.appendChild(
      el("p", "artifact-note", "F12 → Application → Local Storage，找到 " + key + "。也可以在 Console 输入 localStorage.getItem(\"" + key + "\")。")
    );
  }

  function mountOverflow(body, art, card) {
    const limit = Math.max(4, Number(art.limit) || 24);
    const wrap = el("div", "overflow-widget");

    const bar = el("div", "path-bar");
    const input = el("input");
    input.type = "text";
    input.placeholder = "输入一段很长的字符，比如 30 个 A…";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "溢出输入");
    const btn = el("button", null, "SUBMIT");
    btn.type = "button";
    bar.appendChild(input);
    bar.appendChild(btn);

    const out = el("pre", "path-out", "char buffer[16] = { 0 };\nstatus: intact");

    function send() {
      const value = input.value;
      if (value.length >= limit) {
        out.textContent =
          "input length: " + value.length + "\n" +
          "buffer overflow detected\n\n" +
          "PROOF: " + art.reveal;
        out.classList.remove("is-bad");
        revealFlag(card, art.reveal, wrap);
      } else {
        out.textContent =
          "input length: " + value.length + "\n" +
          "buffer intact — 输入 " + limit + " 个字符以上试试";
        out.classList.add("is-bad");
      }
    }

    btn.addEventListener("click", send);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        send();
      }
    });

    wrap.appendChild(bar);
    wrap.appendChild(out);
    body.appendChild(wrap);
  }

  const CRC_TABLE = (function () {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function writeU32(buf, offset, value) {
    buf[offset] = value >>> 24;
    buf[offset + 1] = (value >>> 16) & 0xff;
    buf[offset + 2] = (value >>> 8) & 0xff;
    buf[offset + 3] = value & 0xff;
  }

  async function buildPngBlob(flag) {
    const width = 480;
    const height = 270;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, "#050705");
    grad.addColorStop(0.55, "#0a140a");
    grad.addColorStop(1, "#102010");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#c6ff3d";
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, width - 20, height - 20);

    ctx.fillStyle = "#c6ff3d";
    ctx.font = "600 18px 'Cascadia Mono', Consolas, monospace";
    ctx.fillText("ZEROTHSEC / RANGE BADGE", 34, 54);

    ctx.fillStyle = "#8d978d";
    ctx.font = "12px 'Cascadia Mono', Consolas, monospace";
    ctx.fillText("PNG tEXt / Comment", 34, 78);
    ctx.fillText("metadata carries the proof", 34, 100);

    ctx.fillStyle = "rgba(99, 230, 226, 0.7)";
    ctx.font = "10px 'Cascadia Mono', Consolas, monospace";
    ctx.fillText("generated locally / no server", 34, height - 34);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas toBlob failed"))), "image/png");
    });

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const type = new TextEncoder().encode("tEXt");
    const keyword = new TextEncoder().encode("Comment");
    const text = new TextEncoder().encode("RANGE PROOF / " + flag);
    const data = new Uint8Array(keyword.length + 1 + text.length);
    data.set(keyword, 0);
    data[keyword.length] = 0;
    data.set(text, keyword.length + 1);

    const crcInput = new Uint8Array(4 + data.length);
    crcInput.set(type, 0);
    crcInput.set(data, 4);
    const crc = crc32(crcInput);

    const chunk = new Uint8Array(4 + 4 + data.length + 4);
    writeU32(chunk, 0, data.length);
    chunk.set(type, 4);
    chunk.set(data, 8);
    writeU32(chunk, 8 + data.length, crc);

    // PNG signature (8) + IHDR chunk (25) => 33
    const insertAt = 33;
    const out = new Uint8Array(bytes.length + chunk.length);
    out.set(bytes.subarray(0, insertAt), 0);
    out.set(chunk, insertAt);
    out.set(bytes.subarray(insertAt), insertAt + chunk.length);
    return new Blob([out], { type: "image/png" });
  }

  async function mountImage(body, art) {
    const figure = el("figure", "misc-image");
    const img = el("img");
    img.alt = "range badge";
    figure.appendChild(img);

    const foot = el("figcaption", "misc-image-foot");
    const link = el("a", "btn btn-small", "下载图片");
    link.download = art.filename || "range-badge.png";
    foot.appendChild(link);
    foot.appendChild(el("span", "artifact-note", "flag 在 PNG 的 Comment 文本块里，不在像素里"));
    figure.appendChild(foot);

    const status = el("p", "artifact-note", "正在生成本轮图片…");
    body.appendChild(figure);
    body.appendChild(status);
    body.appendChild(
      el("p", "artifact-note", "用记事本打开图片搜索 flag{，或用 exiftool 查看 Comment 字段。")
    );

    try {
      const blob = await buildPngBlob(art.value);
      const url = URL.createObjectURL(blob);
      img.src = url;
      link.href = url;
      status.parentNode && status.parentNode.removeChild(status);
    } catch (err) {
      status.textContent = "图片生成失败：" + err.message;
    }
  }

  function mountLog(body, art) {
    body.appendChild(el("pre", "artifact-log", art.text || ""));
    body.appendChild(el("p", "artifact-note", "Ctrl+F 搜索 flag{ 或 proof=。"));
  }

  function mountMemory(body, art, card) {
    const rounds = Math.max(1, Number(art.rounds) || 3);
    const len = Math.max(2, Number(art.length) || 3);
    const labels = ["A", "B", "C", "D"];

    const wrap = el("div", "memory-widget");
    const grid = el("div", "memory-grid");
    const pads = [];
    for (let i = 0; i < 4; i++) {
      const pad = el("button", "memory-pad", "PAD " + labels[i]);
      pad.type = "button";
      pad.disabled = true;
      pad.setAttribute("data-pad", String(i));
      grid.appendChild(pad);
      pads.push(pad);
    }
    const bar = el("div", "widget-bar");
    const status = el("span", "widget-status", "READY / 点击开始");
    const start = el("button", "btn btn-small", "开始序列");
    start.type = "button";
    bar.appendChild(status);
    bar.appendChild(start);
    wrap.appendChild(grid);
    wrap.appendChild(bar);
    body.appendChild(wrap);

    let round = 0;
    let seq = [];
    let cursor = 0;
    let locked = true;
    let timers = [];

    function clearTimers() {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
    }

    function flash(i, ok) {
      pads[i].classList.add("is-lit");
      timers.push(
        window.setTimeout(() => {
          pads[i].classList.remove("is-lit");
          if (ok) ok();
        }, 420)
      );
    }

    function runRound() {
      clearTimers();
      locked = true;
      pads.forEach((p) => (p.disabled = true));
      status.className = "widget-status";
      status.textContent = `ROUND ${round + 1} / ${rounds} · 观察序列…`;
      seq = [];
      for (let i = 0; i < len; i++) seq.push(Math.floor(Math.random() * 4));
      let t = 0;
      seq.forEach((idx) => {
        timers.push(
          window.setTimeout(() => {
            pads[idx].classList.add("is-lit");
            timers.push(
              window.setTimeout(() => pads[idx].classList.remove("is-lit"), 380)
            );
          }, t)
        );
        t += 620;
      });
      timers.push(
        window.setTimeout(() => {
          cursor = 0;
          locked = false;
          pads.forEach((p) => (p.disabled = false));
          status.textContent = `ROUND ${round + 1} / ${rounds} · 请重复`;
        }, t + 120)
      );
    }

    function success() {
      locked = true;
      pads.forEach((p) => (p.disabled = true));
      status.className = "widget-status";
      status.textContent = "CLEARED / 序列通过";
      start.disabled = true;
      revealFlag(card, art.reveal, wrap);
    }

    function fail() {
      locked = true;
      pads.forEach((p) => (p.disabled = true));
      status.className = "widget-status is-bad";
      status.textContent = "SEQUENCE LOST / 本轮重新开始";
      window.setTimeout(runRound, 900);
    }

    pads.forEach((pad, i) => {
      pad.addEventListener("click", () => {
        if (locked) return;
        if (seq[cursor] !== i) {
          fail();
          return;
        }
        cursor += 1;
        pads[i].classList.add("is-lit");
        window.setTimeout(() => pads[i].classList.remove("is-lit"), 180);
        if (cursor >= seq.length) {
          round += 1;
          locked = true;
          pads.forEach((p) => (p.disabled = true));
          if (round >= rounds) {
            success();
          } else {
            status.textContent = `ROUND ${round} / ${rounds} · 通过`;
            window.setTimeout(runRound, 800);
          }
        }
      });
    });

    start.addEventListener("click", () => {
      if (start.disabled) return;
      round = 0;
      runRound();
    });
  }

  function mountReflex(body, art, card) {
    const rounds = Math.max(1, Number(art.rounds) || 3);
    const windowMs = Math.max(500, Number(art.window) || 1200);

    const wrap = el("div", "reflex-widget");
    const button = el("button", "reflex-btn is-wait", "等待信号 / STANDBY");
    button.type = "button";
    const bar = el("div", "widget-bar");
    const status = el("span", "widget-status", "READY / 点击开始");
    const start = el("button", "btn btn-small", "开始测试");
    start.type = "button";
    bar.appendChild(status);
    bar.appendChild(start);
    wrap.appendChild(button);
    wrap.appendChild(bar);
    body.appendChild(wrap);

    let round = 0;
    let armed = false;
    let go = false;
    let goAt = 0;
    let armTimer = 0;
    let failTimer = 0;

    function clearTimers() {
      window.clearTimeout(armTimer);
      window.clearTimeout(failTimer);
    }

    function reset(msg, bad) {
      clearTimers();
      armed = false;
      go = false;
      button.className = "reflex-btn is-wait";
      button.textContent = "等待信号 / STANDBY";
      status.className = "widget-status" + (bad ? " is-bad" : "");
      status.textContent = msg;
      round = 0;
    }

    function arm() {
      clearTimers();
      armed = true;
      go = false;
      button.className = "reflex-btn is-wait";
      button.textContent = "等待信号 / STANDBY";
      status.className = "widget-status";
      status.textContent = `ROUND ${round + 1} / ${rounds} · 等待变绿…`;
      const delay = 1500 + Math.random() * 1800;
      armTimer = window.setTimeout(() => {
        go = true;
        goAt = performance.now();
        button.className = "reflex-btn is-go";
        button.textContent = "点击！CLICK NOW";
        failTimer = window.setTimeout(() => {
          reset("TOO SLOW / 超过反应窗口，重新开始", true);
        }, windowMs);
      }, delay);
    }

    button.addEventListener("click", () => {
      if (!armed) return;
      if (!go) {
        reset("EARLY CLICK / 抢跑了，重新开始", true);
        return;
      }
      const elapsed = performance.now() - goAt;
      if (elapsed > windowMs) {
        reset("TOO SLOW / 超过反应窗口，重新开始", true);
        return;
      }
      clearTimers();
      go = false;
      armed = false;
      round += 1;
      if (round >= rounds) {
        button.className = "reflex-btn is-wait";
        button.textContent = "CLEARED";
        status.className = "widget-status";
        status.textContent = "CLEARED / 反应窗口全部通过";
        start.disabled = true;
        revealFlag(card, art.reveal, wrap);
      } else {
        status.textContent = `ROUND ${round} / ${rounds} · 通过（${Math.round(elapsed)} ms）`;
        window.setTimeout(arm, 700);
      }
    });

    start.addEventListener("click", () => {
      if (start.disabled) return;
      round = 0;
      arm();
    });
  }

  function mountPixel(body, art, card) {
    const teaser = el("div", "pixel-teaser");
    const copy = el("div");
    copy.appendChild(el("b", null, "MINI GAME / PIXEL BREACH"));
    copy.appendChild(
      el("p", null, "游戏区已在本页顶部开启。完成关卡后，结算面板会给出本轮 flag。")
    );
    const btn = el("button", "btn", "前往游戏区");
    btn.type = "button";
    btn.appendChild(el("span", "btn-arrow", "↗"));
    btn.addEventListener("click", () => {
      const section = $("#range");
      if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    teaser.appendChild(copy);
    teaser.appendChild(btn);
    body.appendChild(teaser);
  }

  function revealFlag(card, flag, host) {
    if (!flag) return;
    if (host.querySelector(".widget-reveal")) return;
    const note = el("p", "widget-reveal");
    note.appendChild(document.createTextNode("FLAG: "));
    note.appendChild(el("code", null, flag));
    host.appendChild(note);
    const input = $(".q-form input", card);
    if (input) input.value = flag;
  }

  /* ======================================================================
     题目卡片
     ====================================================================== */
  function renderArtifact(slot, card) {
    const art = slot.challenge.artifact || {};
    const kind = art.type;
    const shell = artifactShell(kind);

    if (kind === "comment") mountComment(shell.body, art);
    else if (kind === "attr") mountAttr(shell.body, art, card);
    else if (kind === "meta") mountMeta(shell.body, art);
    else if (kind === "path") mountPath(shell.body, art);
    else if (kind === "decode") mountDecode(shell.body, art);
    else if (kind === "code") mountCode(shell.body, art);
    else if (kind === "cookie") mountCookie(shell.body, art);
    else if (kind === "storage") mountStorage(shell.body, art);
    else if (kind === "memory") mountMemory(shell.body, art, card);
    else if (kind === "reflex") mountReflex(shell.body, art, card);
    else if (kind === "pixel") mountPixel(shell.body, art, card);
    else if (kind === "overflow") mountOverflow(shell.body, art, card);
    else if (kind === "image") mountImage(shell.body, art);
    else if (kind === "log") mountLog(shell.body, art);
    else shell.body.appendChild(el("p", "artifact-note", "未知工件类型：" + kind));

    return shell.wrap;
  }

  function renderTutorial(challenge) {
    const details = el("details", "walkthrough");
    const summary = el("summary");
    summary.appendChild(el("span", null, "展开解题教程"));
    summary.appendChild(el("em", null, "WALKTHROUGH / " + String(challenge.id).toUpperCase()));
    const body = el("div", "walkthrough-body");
    const steps = el("div", "steps");

    (challenge.tutorial || []).forEach((step, index) => {
      const row = el("div", "step");
      row.appendChild(el("span", null, String(index + 1).padStart(2, "0")));
      const content = el("div");
      content.appendChild(el("p", null, step.text || ""));
      if (step.code) {
        const pre = el("pre", "code-block");
        pre.appendChild(el("code", null, step.code));
        content.appendChild(pre);
      }
      row.appendChild(content);
      steps.appendChild(row);
    });

    body.appendChild(steps);
    details.appendChild(summary);
    details.appendChild(body);
    return details;
  }

  function renderQuest(slot, index) {
    const ch = slot.challenge;
    const direction = String(ch.direction || "MISC").toUpperCase();
    const card = el("article", "quest");
    card.setAttribute("data-slot", String(slot.slot));
    card.setAttribute("data-challenge", ch.id);
    card.setAttribute("data-category", slot.category);
    card.setAttribute("data-direction", direction.toLowerCase());
    card.style.animationDelay = `${index * 0.06}s`;

    const head = el("div", "quest-head");
    head.appendChild(el("span", "q-slot", "SLOT " + String(index + 1).padStart(2, "0")));
    const dirBadge = el("span", "q-dir", direction);
    dirBadge.setAttribute("data-dir", direction.toLowerCase());
    head.appendChild(dirBadge);
    head.appendChild(el("span", "q-diff", ch.difficulty || "EASY"));

    const body = el("div", "quest-body");
    const titleRow = el("div", "q-title-row");
    titleRow.appendChild(el("h3", "q-title", ch.title));
    if (ch.subtitle) titleRow.appendChild(el("span", "q-sub", ch.subtitle));

    body.appendChild(titleRow);
    body.appendChild(el("p", "q-brief", ch.brief));

    if (ch.hint) {
      const hint = el("div", "q-hint");
      hint.appendChild(el("span", null, "HINT"));
      hint.appendChild(el("p", null, ch.hint));
      body.appendChild(hint);
    }

    body.appendChild(renderArtifact(slot, card));

    const form = el("form", "q-form");
    const input = el("input");
    input.type = "text";
    input.placeholder = "flag{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "输入本轮 flag");
    const submit = el("button", "btn btn-primary");
    submit.type = "submit";
    submit.innerHTML = '验证 flag<span class="btn-arrow">→</span>';
    form.appendChild(input);
    form.appendChild(submit);

    const msg = el("p", "q-msg", "输入本轮 flag 后提交 · 本浏览器校验");
    msg.setAttribute("role", "status");
    msg.setAttribute("aria-live", "polite");

    const solvedNote = el("div", "quest-solved-note");
    solvedNote.appendChild(el("b", null, "CAPTURED / 本轮已解出"));
    solvedNote.appendChild(
      document.createTextNode("这道题会在你下次打开本页时换成另一种类型的新题，并重置为未解。")
    );

    body.appendChild(form);
    body.appendChild(msg);
    body.appendChild(solvedNote);
    body.appendChild(renderTutorial(ch));

    card.appendChild(head);
    card.appendChild(body);

    if (slot.solved) card.classList.add("is-solved");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      submitFlag(slot, card, input, msg);
    });

    return card;
  }

  /* ======================================================================
     提交（纯前端校验）
     ====================================================================== */
  function submitFlag(slot, card, input, msg) {
    const internal = state.slots[slot.slot];
    if (!internal) {
      setMsg(msg, "STATE LOST // 本地状态丢失，请刷新页面", "bad");
      return;
    }
    if (internal.solved) {
      setMsg(msg, "ALREADY CAPTURED // 本轮这题已经解出过了", "");
      return;
    }

    const value = input.value.trim();
    if (!value) {
      setMsg(msg, "EMPTY INPUT // 先输入一个 flag", "bad");
      return;
    }

    if (value.toLowerCase() === String(internal.flag).toLowerCase()) {
      internal.solved = true;
      state.solved = state.slots.filter((s) => s.solved).length;
      state.total += 1;
      saveState();
      card.classList.add("is-solved");
      setMsg(msg, "ACCEPTED // 已记录，下次打开将换题", "ok");
      updateProgress();
      showSolve(slot.challenge.title);
    } else {
      setMsg(msg, "ACCESS DENIED // 这个 flag 不属于你的本轮题目", "bad");
      shake(card);
    }
  }

  /* ======================================================================
     本地状态 / 题库 / 渲染
     ====================================================================== */
  function clearRoundArtifacts() {
    $$('meta[name="range-proof"]').forEach((m) => m.remove());
    document.cookie = "range_proof=; Max-Age=0; path=/";
    try {
      window.localStorage.removeItem("range_proof");
    } catch (err) {
      /* ignore */
    }
  }

  function fillPixel(card, flag) {
    if (!card || !flag) return;
    const input = $(".q-form input", card);
    if (input) input.value = flag;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function uuid4() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.prototype.map.call(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return (
      hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" +
      hex.slice(16, 20) + "-" + hex.slice(20)
    );
  }

  function makeFlag() {
    return "flag{" + uuid4() + "}";
  }

  function ensureUid() {
    let uid = "";
    try {
      uid = window.localStorage.getItem(UID_KEY) || "";
      if (!uid) {
        uid = uuid4();
        window.localStorage.setItem(UID_KEY, uid);
      }
    } catch (err) {
      uid = uuid4();
    }
    return uid;
  }

  function loadSavedState() {
    try {
      const raw = JSON.parse(window.localStorage.getItem(STATE_KEY) || "null");
      if (raw && Array.isArray(raw.slots) && raw.slots.length) return raw;
    } catch (err) {
      /* ignore */
    }
    return null;
  }

  function saveState() {
    try {
      window.localStorage.setItem(
        STATE_KEY,
        JSON.stringify({
          uid: state.uid,
          slots: state.slots,
          totalSolved: state.total,
          replacements: state.replacements,
        })
      );
    } catch (err) {
      /* 隐私模式可能不可写 */
    }
  }

  function categoryList(bank) {
    const names = CATEGORY_CYCLE.filter(
      (c) =>
        bank.categories[c] ||
        bank.challenges.some((ch) => ch.category === c)
    );
    if (names.length) return names;
    const unique = [];
    bank.challenges.forEach((ch) => {
      if (unique.indexOf(ch.category) < 0) unique.push(ch.category);
    });
    return unique;
  }

  function challengesIn(bank, category) {
    return bank.challenges.filter((ch) => ch.category === category);
  }

  function findChallenge(bank, category, id) {
    return bank.challenges.find((ch) => ch.id === id && ch.category === category) || null;
  }

  function pickChallenge(bank, category, excludeIds) {
    const exclude = excludeIds || [];
    let pool = challengesIn(bank, category).filter((ch) => exclude.indexOf(ch.id) < 0);
    if (!pool.length) pool = challengesIn(bank, category);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  function shuffled(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function createSlots(bank) {
    const names = shuffled(categoryList(bank));
    const usedIds = [];
    const slots = [];
    for (let i = 0; i < 4; i++) {
      const cat = names[i % names.length];
      const ch = pickChallenge(bank, cat, usedIds);
      if (!ch) continue;
      usedIds.push(ch.id);
      slots.push({
        category: cat,
        challengeId: ch.id,
        flag: makeFlag(),
        solved: false,
      });
    }
    return slots;
  }

  function reassignSlot(session, slot, bank) {
    const names = categoryList(bank);
    const usedCats = session.slots
      .filter((s) => s !== slot)
      .map((s) => s.category);
    const usedIds = session.slots.filter((s) => s !== slot).map((s) => s.challengeId);

    let options = names.filter((n) => n !== slot.category && usedCats.indexOf(n) < 0);
    if (!options.length) options = names.filter((n) => n !== slot.category);
    if (!options.length) options = names.slice();
    const cat = options[Math.floor(Math.random() * options.length)];

    let pool = challengesIn(bank, cat).filter(
      (ch) => ch.id !== slot.challengeId && usedIds.indexOf(ch.id) < 0
    );
    if (!pool.length) pool = challengesIn(bank, cat).filter((ch) => ch.id !== slot.challengeId);
    if (!pool.length) pool = challengesIn(bank, cat);
    if (!pool.length) return false;

    const ch = pool[Math.floor(Math.random() * pool.length)];
    slot.category = cat;
    slot.challengeId = ch.id;
    slot.flag = makeFlag();
    slot.solved = false;
    return true;
  }

  function syncSlot(slot, bank) {
    if (findChallenge(bank, slot.category, slot.challengeId)) return true;
    const names = categoryList(bank);
    const cat = names.indexOf(slot.category) >= 0 ? slot.category : names[0];
    const ch = pickChallenge(bank, cat, []);
    if (!ch) return false;
    slot.category = cat;
    slot.challengeId = ch.id;
    slot.flag = slot.flag || makeFlag();
    slot.solved = false;
    return true;
  }

  function initState(bank) {
    const uid = ensureUid();
    let saved = loadSavedState();

    if (!saved) {
      saved = {
        uid: uid,
        slots: createSlots(bank),
        totalSolved: 0,
        replacements: 0,
      };
    } else {
      saved.uid = saved.uid || uid;
      let changed = false;
      saved.slots.forEach((slot) => {
        if (slot.solved) {
          if (reassignSlot(saved, slot, bank)) changed = true;
          slot.solved = false;
          saved.replacements = (saved.replacements || 0) + 1;
        }
      });
      saved.slots.forEach((slot) => {
        if (!syncSlot(slot, bank)) changed = true;
      });
    }

    state.uid = saved.uid;
    state.slots = saved.slots;
    state.solved = state.slots.filter((s) => s.solved).length;
    state.total = saved.totalSolved || 0;
    state.replacements = saved.replacements || 0;
    saveState();
  }

  function shiftLetters(text, shift) {
    return Array.prototype.map
      .call(text, (ch) => {
        const n = ch.charCodeAt(0);
        if (n >= 65 && n <= 90) return String.fromCharCode(((n - 65 + shift) % 26 + 26) % 26 + 65);
        if (n >= 97 && n <= 122) return String.fromCharCode(((n - 97 + shift) % 26 + 26) % 26 + 97);
        return ch;
      })
      .join("");
  }

  function encodePayload(flag, method) {
    if (method === "base64") return window.btoa(flag);
    if (method === "hex") {
      return Array.prototype.map
        .call(flag, (c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("");
    }
    if (method === "rot13") return shiftLetters(flag, 13);
    if (method === "caesar") return shiftLetters(flag, 3);
    if (method === "atbash") {
      return Array.prototype.map.call(flag, (ch) => {
        const n = ch.charCodeAt(0);
        if (n >= 65 && n <= 90) return String.fromCharCode(90 - (n - 65));
        if (n >= 97 && n <= 122) return String.fromCharCode(122 - (n - 97));
        return ch;
      }).join("");
    }
    if (method === "binary") {
      return Array.prototype.map
        .call(flag, (c) => c.charCodeAt(0).toString(2).padStart(8, "0"))
        .join(" ");
    }
    if (method === "reverse") return Array.prototype.slice.call(flag).reverse().join("");
    return flag;
  }

  function makeLog(flag) {
    const lines = [];
    for (let i = 1; i <= 40; i++) {
      lines.push(
        "2026-11-03 20:" + String(i % 60).padStart(2, "0") + ":" +
        String((i * 7) % 60).padStart(2, "0") +
        " INFO session=node-" + (i % 7) +
        " path=/range/asset/" + i + ".js status=200 dur=" + (12 + i * 3) + "ms"
      );
    }
    lines.splice(
      8 + Math.floor(Math.random() * 22),
      0,
      "2026-11-03 20:41:07 WARN audit=range proof=" + flag
    );
    return lines.join("\n");
  }

  function prepareChallenge(ch, flag, slotIndex) {
    const item = JSON.parse(JSON.stringify(ch));
    const art = item.artifact || {};
    const kind = art.type;

    if (kind === "comment" || kind === "attr" || kind === "meta" || kind === "cookie" || kind === "storage") {
      art.value = flag;
    } else if (kind === "path") {
      (art.routes || []).forEach((route) => {
        route.body = String(route.body || "").split("{{FLAG}}").join(flag);
      });
    } else if (kind === "decode") {
      art.payload = encodePayload(flag, art.method || "base64");
    } else if (kind === "code") {
      art.code = String(art.code || "").split("{{FLAG}}").join(flag).split("{{UUID}}").join(flag.slice(5, -1));
    } else if (kind === "memory" || kind === "reflex" || kind === "pixel" || kind === "overflow") {
      art.reveal = flag;
    } else if (kind === "image") {
      art.value = flag;
      art.filename = art.filename || "range-badge.png";
    } else if (kind === "log") {
      art.text = makeLog(flag);
    }

    item.artifact = art;
    return item;
  }

  function buildView(bank) {
    const view = [];
    state.slots.forEach((slot, index) => {
      const ch = findChallenge(bank, slot.category, slot.challengeId);
      if (!ch) return;
      const prepared = prepareChallenge(ch, slot.flag, index);
      const cats = bank.categories[slot.category] || {};
      view.push({
        slot: index,
        category: slot.category,
        categoryTag: cats.tag || slot.category.toUpperCase(),
        categoryLabel: cats.label || slot.category,
        challenge: prepared,
        solved: slot.solved,
      });
    });
    return view;
  }

  function renderState(bank, source) {
    setText("#sys-uid", String(state.uid || "—").slice(0, 6).toUpperCase());
    setText("#sys-round", String(state.replacements + 1).padStart(2, "0"));
    const bankLabel = source === "REMOTE" ? "REMOTE" : REMOTE_BANK_URL ? "LOCAL FALLBACK" : "LOCAL";
    setText("#sys-bank", bankLabel);
    const bankNode = $("#sys-bank");
    if (bankNode) bankNode.title = "题库版本 " + (bank.version || "?") + " / " + (bank.updated || "");

    clearRoundArtifacts();
    stack.innerHTML = "";

    const view = buildView(bank);
    if (!view.length) {
      renderError("本轮没有可用题目。");
      return;
    }

    const pixelRef = { card: null };
    view.forEach((slot, index) => {
      const card = renderQuest(slot, index);
      stack.appendChild(card);
      if (slot.challenge.artifact.type === "pixel") pixelRef.card = card;
    });

    const range = $("#range");
    if (pixelRef.card && window.ZEROTHSEC_PIXEL) {
      const pixelSlot = view.find((s) => s.challenge.artifact.type === "pixel");
      window.ZEROTHSEC_PIXEL.init(pixelSlot.challenge.artifact.reveal, (flag) =>
        fillPixel(pixelRef.card, flag)
      );
    } else {
      if (window.ZEROTHSEC_PIXEL) window.ZEROTHSEC_PIXEL.hide();
      if (range) range.hidden = true;
    }

    updateProgress();
  }

  function validateBank(bank) {
    if (!bank || !Array.isArray(bank.challenges) || !bank.challenges.length) {
      throw new Error("题库格式无效");
    }
    const allowed = {
      comment: 1, attr: 1, meta: 1, path: 1, decode: 1, code: 1,
      cookie: 1, storage: 1, memory: 1, reflex: 1, pixel: 1, overflow: 1,
      image: 1, log: 1,
    };
    const methods = ["base64", "hex", "rot13", "caesar", "atbash", "binary", "reverse"];
    bank.challenges.forEach((ch) => {
      if (!ch.id || !ch.category || !ch.title || !ch.artifact || !ch.tutorial) {
        throw new Error("题目字段缺失：" + (ch.id || "unknown"));
      }
      if (!allowed[ch.artifact.type]) throw new Error("未知工件类型：" + ch.artifact.type);
      if (ch.artifact.type === "decode" && methods.indexOf(ch.artifact.method) < 0) {
        throw new Error("未知解码方式：" + ch.artifact.method);
      }
    });
    if (!bank.categories) {
      bank.categories = {};
      bank.challenges.forEach((ch) => {
        if (!bank.categories[ch.category]) {
          bank.categories[ch.category] = { label: ch.category, tag: ch.category.toUpperCase() };
        }
      });
    }
    return bank;
  }

  async function loadBankAndRender() {
    stack.innerHTML =
      '<div class="assign-loading"><span class="loading-dot"></span>正在拉取题库并生成本轮 flag…</div>';

    let bank = null;
    let source = "LOCAL";

    if (REMOTE_BANK_URL) {
      try {
        const sep = REMOTE_BANK_URL.indexOf("?") >= 0 ? "&" : "?";
        const res = await fetch(REMOTE_BANK_URL + sep + "ts=" + Date.now(), { cache: "no-store" });
        if (res.ok) {
          bank = validateBank(await res.json());
          source = "REMOTE";
        }
      } catch (err) {
        /* 远程失败时回退到站内题库 */
      }
    }

    if (!bank) {
      try {
        const res = await fetch("assets/data/challenges.json?ts=" + Date.now(), { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        bank = validateBank(await res.json());
        source = "LOCAL";
      } catch (err) {
        renderError("无法拉取题库（" + err.message + "）。");
        return;
      }
    }

    initState(bank);
    renderState(bank, source);
  }

  function renderError(message) {
    stack.innerHTML = "";
    const box = el("div", "assign-error");
    box.appendChild(el("b", null, "BANK UNAVAILABLE"));
    box.appendChild(
      document.createTextNode(
        message +
          " 请检查 assets/data/challenges.json 是否可访问，并通过 HTTP 访问页面；直接双击 HTML 时浏览器会阻止 fetch。"
      )
    );
    const retry = el("button", "btn btn-small", "重新加载");
    retry.type = "button";
    retry.style.marginTop = "14px";
    retry.addEventListener("click", loadBankAndRender);
    box.appendChild(retry);
    stack.appendChild(box);
  }

  loadBankAndRender();
})();
