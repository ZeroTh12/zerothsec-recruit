/* ==========================================================================
   ZEROTHSEC — 共享交互
   ========================================================================== */
(function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  /* ---------- 1. 页头滚动态 + 当前年份 ---------- */
  const header = $(".site-header");
  if (header) {
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  $$("[data-year]").forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });

  /* ---------- 2. 移动端导航 ---------- */
  const navToggle = $(".nav-toggle");
  if (navToggle) {
    const mobileNav = $(".mobile-nav");
    const closeNav = () => {
      document.body.classList.remove("nav-open");
      navToggle.setAttribute("aria-expanded", "false");
      if (mobileNav) mobileNav.setAttribute("aria-hidden", "true");
    };
    navToggle.addEventListener("click", () => {
      const open = !document.body.classList.contains("nav-open");
      document.body.classList.toggle("nav-open", open);
      navToggle.setAttribute("aria-expanded", String(open));
      if (mobileNav) mobileNav.setAttribute("aria-hidden", String(!open));
    });
    $$(".mobile-nav a").forEach((link) => link.addEventListener("click", closeNav));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeNav();
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth > 980) closeNav();
    });
  }

  /* ---------- 3. 滚动显现（等开场动画结束后启动） ---------- */
  const revealEls = $$("[data-reveal]");
  const initReveal = () => {
    if ("IntersectionObserver" in window && revealEls.length) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
      );
      revealEls.forEach((el) => io.observe(el));
    } else {
      revealEls.forEach((el) => el.classList.add("is-visible"));
    }
  };

  if (document.documentElement.classList.contains("is-entered")) {
    initReveal();
  } else {
    window.addEventListener("zerothsec:entered", initReveal, { once: true });
  }

  /* ---------- 4. 自定义光标 ---------- */
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (canHover && window.innerWidth > 900) {
    const dot = $(".cursor-dot");
    if (dot) {
      let x = window.innerWidth / 2;
      let y = window.innerHeight / 2;
      let cx = x;
      let cy = y;
      let targetAng = 0; // 鼠标移动方向角（弧度）
      let curAng = 0;    // 平滑后的当前角
      let raf = 0;
      let started = false;

      const render = () => {
        cx += (x - cx) * 0.18;
        cy += (y - cy) * 0.18;
        // 角度沿最短路径插值，跟随鼠标移动方向旋转
        let da = ((targetAng - curAng + Math.PI) % (Math.PI * 2)) - Math.PI;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        curAng += da * 0.22;
        const rot = (curAng * 180) / Math.PI;
        dot.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%) rotate(${rot}deg)`;
        raf = requestAnimationFrame(render);
      };

      window.addEventListener(
        "pointermove",
        (e) => {
          x = e.clientX;
          y = e.clientY;
          if (e.movementX || e.movementY) {
            targetAng = Math.atan2(e.movementY, e.movementX);
          }
          if (!started) {
            started = true;
            cx = x;
            cy = y;
            document.body.classList.add("has-cursor");
          }
        },
        { passive: true }
      );

      $$("a, button, summary, .track").forEach((el) => {
        el.addEventListener("pointerenter", () => dot.classList.add("is-active"));
        el.addEventListener("pointerleave", () => dot.classList.remove("is-active"));
      });

      render();
      window.addEventListener("beforeunload", () => cancelAnimationFrame(raf));
    }
  }

  /* ---------- 5. 复制 ---------- */
  $$("[data-copy]").forEach((btn) => {
    const original = btn.textContent;
    btn.addEventListener("click", async () => {
      const targetSel = btn.getAttribute("data-copy");
      let text = targetSel;
      if (targetSel && targetSel.charAt(0) === "#") {
        const target = $(targetSel);
        if (target) text = "value" in target ? target.value : target.textContent;
      }
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text.trim());
      } catch (err) {
        const ta = document.createElement("textarea");
        ta.value = text.trim();
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      btn.textContent = "COPIED";
      btn.classList.add("is-copied");
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove("is-copied");
      }, 1800);
    });
  });

  /* ---------- 6. 招新倒计时 ---------- */
  $$("[data-countdown]").forEach((root) => {
    const deadline = root.getAttribute("data-deadline") || "2026-11-13T23:59:00+08:00";
    const end = new Date(deadline).getTime();
    const note = $("[data-countdown-note]");
    let interval = 0;

    const pad = (n) => String(n).padStart(2, "0");

    const tick = () => {
      const diff = end - Date.now();
      if (diff <= 0) {
        $$("[data-unit]", root).forEach((el) => (el.textContent = "00"));
        root.classList.add("is-closed");
        if (note) note.textContent = "报名通道已关闭 / APPLICATIONS CLOSED";
        if (interval) clearInterval(interval);
        return;
      }
      const total = Math.floor(diff / 1000);
      const units = {
        days: Math.floor(total / 86400),
        hours: Math.floor((total % 86400) / 3600),
        mins: Math.floor((total % 3600) / 60),
        secs: total % 60,
      };
      $$("[data-unit]", root).forEach((el) => {
        el.textContent = pad(units[el.getAttribute("data-unit")] || 0);
      });
    };

    tick();
    interval = setInterval(tick, 1000);
  });

  /* ---------- 7. 报名邮件草稿 ---------- */
  const CONTACT_EMAIL = "19170040127@189.cn";
  const applyForm = $("#apply-form");
  if (applyForm) {
    const preview = $("#apply-preview");
    const mailLink = $("#apply-mail");
    const output = $("#apply-output");
    const statusEl = $("#apply-status");

    const setStatus = (message, type) => {
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.className = "apply-status" + (type ? " is-" + type : "");
    };

    const build = () => {
      const name = $("#apply-name").value.trim();
      const major = $("#apply-major").value.trim();
      const email = $("#apply-email").value.trim();
      const direction = $("#apply-direction").value;
      const note = $("#apply-note").value.trim() || "（未填写）";
      if (!name || !major || !email || !direction) return null;
      const body =
        `姓名：${name}\n` +
        `邮箱：${email}\n` +
        `年级 / 专业：${major}\n` +
        `意向方向：${direction}\n` +
        `一句话介绍：${note}\n\n` +
        `—— 由 ZEROTHSEC 招新页生成 ——\n`;
      const subject = `[ZEROTHSEC 2026 招新] ${name} - ${direction}`;
      return { name, major, email, direction, note, body, subject };
    };

    const render = () => {
      const data = build();
      if (!data) {
        if (output) output.hidden = true;
        return;
      }
      if (preview) preview.textContent = `收件人：${CONTACT_EMAIL}\n主题：${data.subject}\n\n${data.body}`;
      if (mailLink) {
        mailLink.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(data.subject)}&body=${encodeURIComponent(data.body)}`;
      }
      if (output) output.hidden = false;
    };

    applyForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = build();
      if (!data) {
        applyForm.reportValidity();
        return;
      }
      render();
      setStatus("DRAFT READY / 邮件草稿已生成，可复制内容或打开邮件客户端发送。", "ok");
    });

    ["apply-name", "apply-major", "apply-email", "apply-direction", "apply-note"].forEach((id) => {
      const el = $("#" + id);
      if (el) {
        el.addEventListener("input", () => {
          setStatus("");
          if (output && !output.hidden) render();
        });
      }
    });
  }

  /* ---------- 7.5 时间线当前节点 ---------- */
  const timelineItems = $$(".recruit-timeline li[data-date]");
  if (timelineItems.length) {
    const now = new Date();
    let active = null;
    timelineItems.forEach((item) => {
      item.classList.remove("is-active");
      const date = new Date(item.getAttribute("data-date") + "T00:00:00+08:00");
      if (date <= now) active = item;
    });
    if (active) active.classList.add("is-active");
  }

  /* ---------- 8. 首屏信号面板 ---------- */
  const canvas = $("#signal");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const cols = Math.floor(W / 30);
    const drops = new Array(cols).fill(0).map(() => Math.random() * H);
    const speeds = new Array(cols).fill(0).map(() => 0.8 + Math.random() * 1.8);
    const glyphs = "010110100101101001011010";

    const lock = [
      "001111000000",
      "010000100000",
      "010000100000",
      "010000100000",
      "111111111110",
      "111111111110",
      "111111111110",
      "111111111110",
      "111111111110",
      "111111111110",
      "111111111110",
      "111111111110",
    ];
    const px = 22;
    const lockW = lock[0].length * px;
    const lockH = lock.length * px;
    const lockX = (W - lockW) / 2;
    const lockY = (H - lockH) / 2 - 16;
    const pad = 40;

    // 锁形图案只绘制一次，缓存成离屏画布，避免每帧重复计算光晕。
    const lockLayer = document.createElement("canvas");
    lockLayer.width = lockW + pad * 2;
    lockLayer.height = lockH + pad * 2;
    const lctx = lockLayer.getContext("2d");
    lctx.save();
    lctx.shadowColor = "rgba(198, 255, 61, 0.55)";
    lctx.shadowBlur = 22;
    lctx.fillStyle = "#c6ff3d";
    for (let r = 0; r < lock.length; r++) {
      for (let c = 0; c < lock[r].length; c++) {
        if (lock[r][c] === "1") {
          lctx.fillRect(pad + c * px, pad + r * px, px - 1, px - 1);
        }
      }
    }
    lctx.shadowBlur = 0;
    lctx.fillStyle = "#040604";
    lctx.fillRect(pad + px * 4, pad + px * 6, px * 4, px * 3);
    lctx.fillStyle = "#c6ff3d";
    lctx.fillRect(pad + px * 5, pad + px * 7, px * 2, px);
    lctx.fillRect(pad + px * 5, pad + px * 8, px, px);
    lctx.restore();

    let scan = 0;

    const frame = (time) => {
      ctx.fillStyle = "#040604";
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.font = "18px 'Cascadia Mono', Consolas, monospace";
      for (let i = 0; i < cols; i++) {
        const x = i * 30 + 6;
        const y = drops[i];
        for (let k = 0; k < 14; k++) {
          const py = y - k * 26;
          if (py < 0) continue;
          const ch = glyphs[(Math.floor(py / 26) + i) % glyphs.length];
          ctx.globalAlpha = k === 0 ? 0.95 : 0.55 - k * 0.035;
          ctx.fillStyle = k < 2 ? "#c6ff3d" : k < 5 ? "#63e6e2" : "#4d5a4d";
          ctx.fillText(ch, x, py);
        }
        drops[i] += speeds[i];
        if (drops[i] > H + 300 && Math.random() > 0.94) drops[i] = -20;
      }
      ctx.restore();

      // 中心基准线
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = "rgba(198, 255, 61, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, H);
      ctx.stroke();
      ctx.restore();

      ctx.drawImage(lockLayer, Math.round(lockX - pad), Math.round(lockY - pad));

      // 扫描线
      scan = (scan + 2.2) % H;
      const grad = ctx.createLinearGradient(0, scan - 30, 0, scan + 30);
      grad.addColorStop(0, "rgba(198, 255, 61, 0)");
      grad.addColorStop(0.5, "rgba(198, 255, 61, 0.12)");
      grad.addColorStop(1, "rgba(198, 255, 61, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, scan - 30, W, 60);

      if (!reduce) requestAnimationFrame(frame);
    };

    if (reduce) {
      frame(0);
    } else {
      requestAnimationFrame(frame);
    }
  }
})();
