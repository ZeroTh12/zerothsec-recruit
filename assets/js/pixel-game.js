/* ==========================================================================
   ZEROTHSEC — PIXEL BREACH
   像素闯关游戏。由 ctf.js 在抽到像素题时初始化，flag 每轮由浏览器本地生成。
   ========================================================================== */
(function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  const section = $("#range");
  const canvas = $("#game");
  if (!section || !canvas) return;

  const ctx = canvas.getContext("2d");
  const TILE = 32;
  const COLS = 17;
  const ROWS = 11;
  const START = { x: 8, y: 9 };
  const EXIT = { x: 8, y: 1 };

  const BLOCKS = [
    { x: 3, y: 2, w: 3, h: 1 },
    { x: 11, y: 2, w: 3, h: 1 },
    { x: 7, y: 4, w: 2, h: 3 },
    { x: 2, y: 6, w: 3, h: 1 },
    { x: 12, y: 6, w: 3, h: 1 },
    { x: 5, y: 8, w: 2, h: 1 },
  ];

  const FRAGMENTS = [
    { x: 1, y: 1, collected: false },
    { x: 15, y: 1, collected: false },
    { x: 15, y: 9, collected: false },
    { x: 1, y: 9, collected: false },
  ];

  const DRONES = [
    { axis: "x", fixed: 3, start: 2.5, min: 2.5, max: 14.5, dir: 1, speed: 0.95 },
    { axis: "y", fixed: 10, start: 2.5, min: 2.5, max: 8.5, dir: 1, speed: 0.82 },
    { axis: "x", fixed: 8, start: 7.5, min: 7.5, max: 15.5, dir: -1, speed: 0.78 },
  ];

  const player = { x: START.x, y: START.y, rx: START.x, ry: START.y };

  const game = {
    running: false,
    won: false,
    time: 0,
    traces: 0,
    frags: 0,
    invuln: 0,
    hitFlash: 0,
    moveCd: 0,
    hudAcc: 0,
  };

  const overlay = $("#game-overlay");
  const overlayTitle = $("#overlay-title");
  const overlayBody = $("#overlay-body");
  const startBtn = $("#game-start");
  const resetBtn = $("#game-reset");
  const vaultBtn = $("#game-vault");
  const fragEl = $("#frag-count");
  const timerEl = $("#game-timer");
  const traceEl = $("#trace-count");
  const statusEl = $("#game-status");

  let WIN_FLAG = "";
  let onFill = null;
  let inited = false;

  function blocked(x, y) {
    if (x < 1 || x >= COLS - 1 || y < 1 || y >= ROWS - 1) return true;
    for (let i = 0; i < BLOCKS.length; i++) {
      const b = BLOCKS[i];
      if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return true;
    }
    return false;
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  function dronePos(d) {
    return d.axis === "x" ? { x: d.pos, y: d.fixed } : { x: d.fixed, y: d.pos };
  }

  function updateHud() {
    if (fragEl) fragEl.textContent = String(game.frags);
    if (traceEl) traceEl.textContent = String(game.traces);
    if (timerEl) timerEl.textContent = formatTime(game.time);
  }

  function resetPlayer() {
    player.x = START.x;
    player.y = START.y;
    player.rx = START.x;
    player.ry = START.y;
  }

  function resetGame() {
    game.running = false;
    game.won = false;
    game.time = 0;
    game.traces = 0;
    game.frags = 0;
    game.invuln = 0;
    game.hitFlash = 0;
    game.moveCd = 0;
    game.hudAcc = 0;
    FRAGMENTS.forEach((f) => (f.collected = false));
    DRONES.forEach((d) => {
      d.pos = d.start;
      d.dir = d.axis === "x" && d.fixed === 8 ? -1 : 1;
    });
    resetPlayer();
    updateHud();
    if (statusEl) statusEl.textContent = "IDLE";
  }

  function showStartUI() {
    resetGame();
    if (!overlay) return;
    overlay.classList.remove("is-hidden", "is-win");
    if (overlayTitle) overlayTitle.innerHTML = "收集 4 个数据包<br>抵达出口端口";
    if (overlayBody) overlayBody.textContent = "方向键 / WASD 移动。红色哨兵会按固定路线巡逻。";
    if (startBtn) startBtn.hidden = false;
    if (resetBtn) {
      resetBtn.hidden = false;
      resetBtn.textContent = "重置";
    }
    if (vaultBtn) vaultBtn.hidden = true;
  }

  function startGame() {
    resetGame();
    game.running = true;
    if (overlay) overlay.classList.add("is-hidden");
    if (statusEl) statusEl.textContent = "RUNNING";
    if (startBtn) startBtn.blur();
  }

  function tracePlayer() {
    game.traces += 1;
    resetPlayer();
    game.invuln = 1.1;
    game.hitFlash = 0.28;
    if (statusEl) statusEl.textContent = "TRACED";
    updateHud();
    window.setTimeout(() => {
      if (game.running && statusEl) statusEl.textContent = "RUNNING";
    }, 850);
  }

  function collectAt(x, y) {
    const frag = FRAGMENTS.find((f) => !f.collected && f.x === x && f.y === y);
    if (!frag) return;
    frag.collected = true;
    game.frags += 1;
    updateHud();
  }

  function move(dx, dy) {
    if (!game.running || game.won) return;
    const nx = player.x + dx;
    const ny = player.y + dy;
    if (blocked(nx, ny)) return;
    player.x = nx;
    player.y = ny;
    collectAt(nx, ny);
    checkDrones();
    if (!game.running) return;
    if (nx === EXIT.x && ny === EXIT.y && game.frags === FRAGMENTS.length) {
      winGame();
    }
  }

  function checkDrones() {
    if (game.invuln > 0) return;
    for (let i = 0; i < DRONES.length; i++) {
      const p = dronePos(DRONES[i]);
      if (Math.abs(player.x - p.x) < 0.72 && Math.abs(player.y - p.y) < 0.72) {
        tracePlayer();
        return;
      }
    }
  }

  function winGame() {
    game.running = false;
    game.won = true;
    if (statusEl) statusEl.textContent = "CLEARED";
    if (overlayTitle) overlayTitle.innerHTML = "出口已解锁。";
    if (overlayBody) {
      overlayBody.innerHTML =
        `数据包回收完成。用时 ${formatTime(game.time)}，触发 ${game.traces} 次追踪。<br>` +
        `FLAG: <code>${WIN_FLAG}</code>`;
    }
    if (overlay) {
      overlay.classList.remove("is-hidden");
      overlay.classList.add("is-win");
    }
    if (startBtn) startBtn.hidden = true;
    if (resetBtn) {
      resetBtn.hidden = false;
      resetBtn.textContent = "再玩一次";
    }
    if (vaultBtn) vaultBtn.hidden = false;
  }

  function update(dt) {
    if (game.time >= 0) game.time += dt;
    game.hudAcc += dt;
    if (game.hudAcc > 0.25) {
      game.hudAcc = 0;
      if (timerEl) timerEl.textContent = formatTime(game.time);
    }
    if (game.invuln > 0) game.invuln -= dt;
    if (game.hitFlash > 0) game.hitFlash -= dt;

    DRONES.forEach((d) => {
      d.pos += d.dir * d.speed * dt;
      if (d.pos <= d.min) {
        d.pos = d.min;
        d.dir = 1;
      } else if (d.pos >= d.max) {
        d.pos = d.max;
        d.dir = -1;
      }
    });

    checkDrones();
  }

  function drawWall(x, y, border) {
    const px = x * TILE;
    const py = y * TILE;
    ctx.fillStyle = border ? "#090e09" : "#0b130b";
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = border ? "#101810" : "#131d13";
    ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
    ctx.strokeStyle = "rgba(233,239,230,0.11)";
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 2.5, py + 2.5, TILE - 5, TILE - 5);

    if (border) {
      if ((x + y) % 3 === 0) {
        ctx.fillStyle = "rgba(198,255,61,0.12)";
        ctx.fillRect(px + 13, py + 4, 2, TILE - 8);
        ctx.fillRect(px + 4, py + 13, TILE - 8, 2);
      }
    } else {
      ctx.fillStyle = "rgba(99,230,226,0.28)";
      ctx.fillRect(px + 5, py + 5, 5, 1);
      ctx.fillRect(px + TILE - 10, py + TILE - 6, 5, 1);
      if ((x + y) % 2 === 0) {
        ctx.fillStyle = "rgba(198,255,61,0.22)";
        ctx.fillRect(px + TILE - 8, py + 6, 2, 2);
      }
    }
  }

  function drawFloor(x, y) {
    const px = x * TILE;
    const py = y * TILE;
    ctx.fillStyle = (x + y) % 2 === 0 ? "#070d07" : "#081008";
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = "rgba(198,255,61,0.14)";
    ctx.fillRect(px + 15, py + 15, 1, 1);
    ctx.strokeStyle = "rgba(198,255,61,0.075)";
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
  }

  function drawExit(ts) {
    const px = EXIT.x * TILE;
    const py = EXIT.y * TILE;
    const open = game.frags === FRAGMENTS.length;
    const pulse = 0.5 + 0.5 * Math.sin(ts / 380);

    ctx.fillStyle = open ? "rgba(255,176,58,0.18)" : "rgba(255,176,58,0.05)";
    ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);

    ctx.strokeStyle = open ? `rgba(255,176,58,${0.6 + pulse * 0.4})` : "rgba(255,176,58,0.28)";
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 4.5, py + 4.5, TILE - 9, TILE - 9);

    if (open) {
      ctx.fillStyle = `rgba(255,176,58,${0.5 + pulse * 0.5})`;
      ctx.fillRect(px + 11, py + 7, 10, 18);
      ctx.fillStyle = "#040604";
      ctx.fillRect(px + 14, py + 10, 4, 12);
    } else {
      ctx.strokeStyle = "rgba(255,176,58,0.5)";
      ctx.strokeRect(px + 11, py + 12, 10, 9);
      ctx.beginPath();
      ctx.arc(px + 16, py + 12, 4, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,176,58,0.6)";
      ctx.fillRect(px + 15, py + 15, 2, 3);
    }

    ctx.fillStyle = "rgba(255,176,58,0.6)";
    ctx.font = "7px 'Cascadia Mono', Consolas, monospace";
    ctx.fillText("EXIT", px + 9, py + 30);
  }

  function drawFragments(ts) {
    FRAGMENTS.forEach((f, i) => {
      if (f.collected) return;
      const cx = f.x * TILE + 16;
      const cy = f.y * TILE + 16;
      const lift = Math.sin(ts / 260 + i * 1.4) * 2;
      const size = 6 + Math.sin(ts / 300 + i) * 1.2;

      ctx.save();
      ctx.translate(cx, cy + lift);
      ctx.rotate(Math.PI / 4);
      ctx.shadowColor = "rgba(99,230,226,0.7)";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#63e6e2";
      ctx.fillRect(-size, -size, size * 2, size * 2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#d8fffd";
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    });
  }

  function drawDrone(d, ts) {
    const p = dronePos(d);
    const cx = p.x * TILE + 16;
    const cy = p.y * TILE + 16;
    const tx = d.axis === "x" ? -d.dir * 12 : 0;
    const ty = d.axis === "y" ? -d.dir * 12 : 0;

    ctx.fillStyle = "rgba(255,92,92,0.16)";
    ctx.fillRect(cx - 9 + tx, cy - 9 + ty, 18, 18);

    ctx.save();
    ctx.shadowColor = "rgba(255,92,92,0.55)";
    ctx.shadowBlur = 10 + Math.sin(ts / 240 + d.fixed) * 4;
    ctx.fillStyle = "#ff5c5c";
    ctx.fillRect(cx - 10, cy - 10, 20, 20);
    ctx.restore();

    ctx.fillStyle = "#1a0606";
    ctx.fillRect(cx - 7, cy - 7, 14, 14);
    ctx.fillStyle = "#ff9a9a";
    ctx.fillRect(cx - 5, cy - 4, 3, 3);
    ctx.fillRect(cx + 2, cy - 4, 3, 3);
    ctx.fillStyle = "rgba(255,92,92,0.7)";
    ctx.fillRect(cx - 2, cy + 3, 4, 1);
  }

  function drawPlayer() {
    player.rx += (player.x - player.rx) * 0.22;
    player.ry += (player.y - player.ry) * 0.22;
    const cx = player.rx * TILE + 16;
    const cy = player.ry * TILE + 16;

    ctx.fillStyle = "rgba(198,255,61,0.12)";
    ctx.fillRect(cx - 12, cy - 12, 24, 24);

    ctx.save();
    ctx.shadowColor = "rgba(198,255,61,0.6)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#c6ff3d";
    ctx.fillRect(cx - 10, cy - 10, 20, 20);
    ctx.restore();

    ctx.fillStyle = "#071007";
    ctx.fillRect(cx - 6, cy - 5, 4, 4);
    ctx.fillRect(cx + 2, cy - 5, 4, 4);
    ctx.fillStyle = "#c6ff3d";
    ctx.fillRect(cx - 1, cy - 16, 2, 6);
    ctx.fillStyle = "rgba(198,255,61,0.55)";
    ctx.fillRect(cx - 3, cy + 7, 6, 1);
  }

  function drawScene(ts) {
    ctx.fillStyle = "#050805";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const border = x === 0 || x === COLS - 1 || y === 0 || y === ROWS - 1;
        let isBlock = border;
        if (!isBlock) {
          for (let i = 0; i < BLOCKS.length; i++) {
            const b = BLOCKS[i];
            if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
              isBlock = true;
              break;
            }
          }
        }
        if (isBlock) drawWall(x, y, border);
        else drawFloor(x, y);
      }
    }

    drawExit(ts);
    drawFragments(ts);
    DRONES.forEach((d) => drawDrone(d, ts));
    drawPlayer();

    if (game.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,92,92,${game.hitFlash * 0.6})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  let lastTs = 0;
  function loop(ts) {
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (section.hidden) {
      requestAnimationFrame(loop);
      return;
    }
    if (game.running) update(dt);
    drawScene(ts);
    requestAnimationFrame(loop);
  }

  const keyMap = {
    arrowup: [0, -1],
    arrowdown: [0, 1],
    arrowleft: [-1, 0],
    arrowright: [1, 0],
    w: [0, -1],
    s: [0, 1],
    a: [-1, 0],
    d: [1, 0],
  };

  document.addEventListener("keydown", (e) => {
    if (!game.running || section.hidden) return;
    const tag = document.activeElement ? document.activeElement.tagName : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const dir = keyMap[e.key.toLowerCase()];
    if (!dir) return;
    e.preventDefault();
    const now = performance.now();
    if (now - game.moveCd < 85) return;
    game.moveCd = now;
    move(dir[0], dir[1]);
  });

  $$(".dpad button", section).forEach((btn) => {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const map = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      const dir = map[btn.getAttribute("data-dir")];
      if (dir) move(dir[0], dir[1]);
    });
  });

  if (startBtn) startBtn.addEventListener("click", startGame);

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (game.won) startGame();
      else showStartUI();
    });
  }

  const restartBtn = $("#game-restart");
  if (restartBtn) restartBtn.addEventListener("click", showStartUI);

  if (vaultBtn) {
    vaultBtn.addEventListener("click", () => {
      if (typeof onFill === "function") onFill(WIN_FLAG);
    });
  }

  document.addEventListener("visibilitychange", () => {
    lastTs = 0;
  });

  resetGame();
  requestAnimationFrame(loop);

  window.ZEROTHSEC_PIXEL = {
    init(flag, fillHandler) {
      WIN_FLAG = flag || "";
      onFill = fillHandler || null;
      section.hidden = false;
      inited = true;
      lastTs = 0;
      showStartUI();
    },
    hide() {
      section.hidden = true;
      game.running = false;
    },
    isInited() {
      return inited;
    },
  };
})();
