/* AT-style particle network background — 站点全局暗色粒子层
   固定于内容之下（z-index:-1），不影响任何交互与动效。 */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var canvas = document.createElement("canvas");
  canvas.id = "at-bg";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;opacity:.55";
  document.documentElement.appendChild(canvas);

  var ctx = canvas.getContext("2d");
  var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  var W = 0, H = 0;
  var nodes = [];
  var LINK = 150;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seed() {
    var count = Math.min(90, Math.floor((W * H) / 26000));
    nodes = [];
    for (var i = 0; i < count; i++) {
      nodes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.3 + 0.4,
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    for (var i = 0; i < nodes.length; i++) {
      var a = nodes[i];
      for (var j = i + 1; j < nodes.length; j++) {
        var b = nodes[j];
        var dx = a.x - b.x;
        var dy = a.y - b.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < LINK * LINK) {
          var alpha = (1 - Math.sqrt(d2) / LINK) * 0.16;
          ctx.strokeStyle = "rgba(198,255,61," + alpha.toFixed(3) + ")";
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    for (var k = 0; k < nodes.length; k++) {
      var n = nodes[k];
      ctx.fillStyle = "rgba(198,255,61,0.35)";
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function step() {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < -20) n.x = W + 20;
      else if (n.x > W + 20) n.x = -20;
      if (n.y < -20) n.y = H + 20;
      else if (n.y > H + 20) n.y = -20;
    }
    draw();
    requestAnimationFrame(step);
  }

  resize();
  seed();

  if (reduce) {
    draw();
  } else {
    requestAnimationFrame(step);
  }

  window.addEventListener("resize", function () {
    resize();
    seed();
    if (reduce) draw();
  });
})();
