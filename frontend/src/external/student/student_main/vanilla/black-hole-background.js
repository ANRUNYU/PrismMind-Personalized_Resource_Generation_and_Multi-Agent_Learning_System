const BLACK_HOLE_LAYOUT = {
  centerXRatio: 0.30,
  centerYRatio: 1.05,
};

const MAX_DPR = 3;
const TWO_PI = Math.PI * 2;
const TOTAL_DISCS = 150;
const TOTAL_DOTS = 20000;
const WARM_DOT_COLORS = ["#facc15", "#f97316", "#fdba74", "#fff7cc"];

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutExpo(t) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function easeInExpo(t) {
  return t === 0 ? 0 : Math.pow(2, 10 * t - 10);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function mix(start, end, t) {
  return start + (end - start) * t;
}

export function createBlackHoleBackground(container) {
  const canvas = container?.querySelector(".js-canvas");
  const ctx = canvas?.getContext("2d", { alpha: false });

  if (!container || !canvas || !ctx) {
    return () => {};
  }

  const render = {
    width: 1,
    height: 1,
    dpr: 1,
  };

  let startDisc = null;
  let discs = [];
  let dots = [];
  let frameId = 0;
  let dprWatchFrameId = 0;
  let resizeTimer = 0;
  let disposed = false;
  let lastTime = performance.now();
  let lastDpr = window.devicePixelRatio || 1;

  function tweenDisc(disc) {
    disc.sx = 1 - easeOutCubic(disc.p);
    disc.sy = 1 - easeOutExpo(disc.p);
    disc.w = startDisc.w * disc.sx;
    disc.h = startDisc.h * disc.sy;
    disc.x = startDisc.x;
    disc.y = startDisc.y + disc.p * startDisc.h;

    const depth = disc.sx * disc.sy;
    if (depth < 0.01) {
      disc.a = Math.pow(clamp(depth / 0.01, 0, 1), 2);
    } else if (depth > 0.22) {
      disc.a = 1 - clamp((depth - 0.22) / 0.78, 0, 1);
    } else {
      disc.a = 1;
    }

    return disc;
  }

  function setDiscs() {
    discs = [];

    const cx = render.width * BLACK_HOLE_LAYOUT.centerXRatio;
    const cy = render.height * BLACK_HOLE_LAYOUT.centerYRatio;

    startDisc = {
      x: cx,
      y: cy - render.height * 0.55,
      w: render.width * 0.85,
      h: render.height * 0.55,
    };

    for (let i = 0; i < TOTAL_DISCS; i += 1) {
      discs.push(
        tweenDisc({
          p: i / TOTAL_DISCS,
          sx: 1,
          sy: 1,
          w: startDisc.w,
          h: startDisc.h,
          x: startDisc.x,
          y: startDisc.y,
          a: 0,
        }),
      );
    }
  }

  function setDots() {
    dots = [];

    for (let i = 0; i < TOTAL_DOTS; i += 1) {
      dots.push({
        disc: discs[Math.floor(Math.random() * discs.length)],
        p: Math.random(),
        s: 0.35 + Math.random() * 1.15,
        a: 0.25 + Math.random() * 0.75,
        c: WARM_DOT_COLORS[Math.floor(Math.random() * WARM_DOT_COLORS.length)],
      });
    }
  }

  function resizeBlackHole() {
    const rect = container.getBoundingClientRect();
    render.width = Math.max(1, rect.width);
    render.height = Math.max(1, rect.height);
    render.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

    canvas.width = Math.round(render.width * render.dpr);
    canvas.height = Math.round(render.height * render.dpr);
    canvas.style.width = `${render.width}px`;
    canvas.style.height = `${render.height}px`;

    setDiscs();
    setDots();
  }

  function moveDiscs(deltaScale) {
    const speed = 0.00024 * deltaScale;

    for (const disc of discs) {
      disc.p = (disc.p + speed) % 1;
      tweenDisc(disc);
    }
  }

  function moveDots(deltaScale) {
    for (const dot of dots) {
      const depth = dot.disc.sx * dot.disc.sy;
      const speed = mix(0.00012, 0.00035, easeInExpo(1 - depth));
      dot.p = (dot.p + speed * deltaScale) % 1;
    }
  }

  function drawDiscs() {
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(249, 115, 22, 0.35)";

    for (const disc of discs) {
      ctx.globalAlpha = disc.a * 0.42;
      ctx.beginPath();
      ctx.ellipse(disc.x, disc.y + disc.h, disc.w, disc.h, 0, 0, TWO_PI);
      ctx.stroke();
    }
  }

  function drawDots() {
    ctx.globalCompositeOperation = "lighter";

    for (const dot of dots) {
      const disc = dot.disc;
      const angle = dot.p * TWO_PI;
      const depth = disc.sx * disc.sy;
      const centerFade = clamp(depth / 0.014, 0, 1);
      const outerFade = 1 - clamp((depth - 0.3) / 0.7, 0, 1);
      const alpha = disc.a * dot.a * centerFade * outerFade * 0.55;

      if (alpha <= 0.01) continue;

      const x = disc.x + Math.cos(angle) * disc.w;
      const y = disc.y + Math.sin(angle) * disc.h + disc.h;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = dot.c;
      ctx.beginPath();
      ctx.arc(x, y, dot.s, 0, TWO_PI);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
  }

  function tick(now = performance.now()) {
    if (disposed) return;

    const delta = Math.min(now - lastTime, 50);
    const deltaScale = delta / 16.67;
    lastTime = now;

    ctx.setTransform(render.dpr, 0, 0, render.dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, render.width, render.height);

    moveDiscs(deltaScale);
    moveDots(deltaScale);
    drawDiscs();
    drawDots();

    frameId = requestAnimationFrame(tick);
  }

  function onResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resizeBlackHole, 120);
  }

  function watchDprChange() {
    if (disposed) return;

    const currentDpr = window.devicePixelRatio || 1;
    if (currentDpr !== lastDpr) {
      lastDpr = currentDpr;
      resizeBlackHole();
    }

    dprWatchFrameId = requestAnimationFrame(watchDprChange);
  }

  resizeBlackHole();
  window.addEventListener("resize", onResize);
  frameId = requestAnimationFrame(tick);
  dprWatchFrameId = requestAnimationFrame(watchDprChange);

  return function destroyBlackHoleBackground() {
    disposed = true;
    window.clearTimeout(resizeTimer);
    window.removeEventListener("resize", onResize);
    cancelAnimationFrame(frameId);
    cancelAnimationFrame(dprWatchFrameId);
  };
}
