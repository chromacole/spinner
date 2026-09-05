(() => {
  "use strict";

  const DISC_SIZE = 640; // internal canvas resolution (matches width/height attrs)
  const DISC_RADIUS = DISC_SIZE / 2 - 6;
  const FRICTION_PER_FRAME_60FPS = 0.985; // same viscous decay feel as the wheel
  const VELOCITY_FLOOR = 0.01;
  const MAX_ANGULAR_VELOCITY = 60; // clamp so repeated spin-clicks can't run away
  const SPIN_KICK_MIN = 6; // angularVelocity added at slider value 1
  const SPIN_KICK_MAX = 42; // angularVelocity added at slider value 10
  const POUR_INTERVAL_MS = 35; // throttle new paint clusters while holding down
  const PARTICLE_FRICTION_60FPS = 0.9; // how fast a flung streak decelerates
  const PARTICLE_SPEED_FLOOR = 4; // px/s below which a streak is considered "dry"

  // ---------- State ----------
  let discAngle = 0;
  let angularVelocity = 0;
  let isPouring = false;
  let lastTime = 0;
  let lastPourTime = 0;
  let pourScreenX = 0;
  let pourScreenY = 0;
  let currentColor = "#ef476f";
  let currentBrush = 6;
  let particles = [];
  let rafHandle = null;

  // ---------- DOM ----------
  const canvas = document.getElementById("disc");
  const ctx = canvas.getContext("2d");
  const clearBtn = document.getElementById("clear-btn");
  const saveBtn = document.getElementById("save-btn");
  const spinBtn = document.getElementById("spin-btn");
  const speedSlider = document.getElementById("speed-slider");
  const swatches = Array.from(document.querySelectorAll(".swatch[data-color]"));
  const customColorInput = document.getElementById("custom-color");
  const brushBtns = Array.from(document.querySelectorAll(".brush-btn"));

  // Offscreen "paint layer" — the permanent record of the artwork, in the
  // disc's own rotating reference frame. The visible canvas just rotates
  // and redraws this each frame.
  const paintLayer = document.createElement("canvas");
  paintLayer.width = DISC_SIZE;
  paintLayer.height = DISC_SIZE;
  const paintCtx = paintLayer.getContext("2d");

  function paintBaseDisc() {
    paintCtx.clearRect(0, 0, DISC_SIZE, DISC_SIZE);
    paintCtx.save();
    paintCtx.beginPath();
    paintCtx.arc(DISC_SIZE / 2, DISC_SIZE / 2, DISC_RADIUS, 0, Math.PI * 2);
    paintCtx.fillStyle = "#f5f2e8";
    paintCtx.fill();
    paintCtx.restore();
  }

  // ---------- Particles (flung paint streaks) ----------
  // Each particle lives in the disc's own local polar coordinates, so it
  // naturally spins with the disc once stamped — only its radius grows
  // (simulating centrifugal force) until the "paint" runs out of momentum.
  function spawnPourCluster() {
    const dx = pourScreenX - DISC_SIZE / 2;
    const dy = pourScreenY - DISC_SIZE / 2;
    const dropRadius = Math.min(Math.hypot(dx, dy), DISC_RADIUS);
    const dropScreenAngle = Math.atan2(dy, dx);
    const dropLocalAngle = dropScreenAngle - discAngle;

    const spinKick = Math.abs(angularVelocity) * 55; // faster spin -> longer streaks
    const count = 3 + Math.floor(Math.random() * 3);

    for (let i = 0; i < count; i++) {
      const jitterAngle = (Math.random() - 0.5) * 0.12;
      const jitterSpeed = 30 + Math.random() * 40;
      particles.push({
        angle: dropLocalAngle + jitterAngle,
        radius: dropRadius,
        prevRadius: dropRadius,
        speed: jitterSpeed + spinKick,
        width: currentBrush * (0.7 + Math.random() * 0.6),
        color: currentColor,
      });
    }
  }

  function updateAndStampParticles(dt) {
    if (particles.length === 0) return;
    paintCtx.lineCap = "round";

    const next = [];
    for (const p of particles) {
      p.prevRadius = p.radius;
      p.radius += p.speed * dt;
      p.speed *= Math.pow(PARTICLE_FRICTION_60FPS, dt * 60);

      const clampedRadius = Math.min(p.radius, DISC_RADIUS);
      const x0 = DISC_SIZE / 2 + p.prevRadius * Math.cos(p.angle);
      const y0 = DISC_SIZE / 2 + p.prevRadius * Math.sin(p.angle);
      const x1 = DISC_SIZE / 2 + clampedRadius * Math.cos(p.angle);
      const y1 = DISC_SIZE / 2 + clampedRadius * Math.sin(p.angle);

      paintCtx.beginPath();
      paintCtx.moveTo(x0, y0);
      paintCtx.lineTo(x1, y1);
      paintCtx.strokeStyle = p.color;
      paintCtx.lineWidth = p.width;
      paintCtx.stroke();

      if (p.speed > PARTICLE_SPEED_FLOOR && p.radius < DISC_RADIUS) {
        next.push(p);
      }
    }
    particles = next;
  }

  // ---------- Rendering ----------
  function render() {
    ctx.clearRect(0, 0, DISC_SIZE, DISC_SIZE);
    ctx.save();
    ctx.translate(DISC_SIZE / 2, DISC_SIZE / 2);
    ctx.rotate(discAngle);
    ctx.drawImage(paintLayer, -DISC_SIZE / 2, -DISC_SIZE / 2);
    ctx.restore();

    // Rim, drawn in screen space so it always looks crisp regardless of spin.
    ctx.save();
    ctx.beginPath();
    ctx.arc(DISC_SIZE / 2, DISC_SIZE / 2, DISC_RADIUS, 0, Math.PI * 2);
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#241a44";
    ctx.stroke();
    ctx.restore();
  }

  // ---------- Main loop (always running) ----------
  function tick(timestamp) {
    if (lastTime === 0) lastTime = timestamp;
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    // The disc's rotation is driven entirely by the Spin button/slider (and
    // friction decay) — pouring paint never touches discAngle or
    // angularVelocity, so you can drip while it's spinning without stopping it.
    discAngle += angularVelocity * dt;
    const decay = Math.pow(FRICTION_PER_FRAME_60FPS, dt * 60);
    angularVelocity *= decay;
    if (Math.abs(angularVelocity) < VELOCITY_FLOOR) angularVelocity = 0;

    if (isPouring) {
      const now = performance.now();
      if (now - lastPourTime >= POUR_INTERVAL_MS) {
        spawnPourCluster();
        lastPourTime = now;
      }
    }

    updateAndStampParticles(dt);
    render();

    rafHandle = requestAnimationFrame(tick);
  }

  // ---------- Spin control (button + speed slider) ----------
  // Clicking Spin gives the disc a burst of rotational speed — set by the
  // slider — which then decays naturally via friction, same physics as a
  // flick. Click again (or hold Space) to keep it going.
  function spinKick() {
    const sliderValue = Number(speedSlider.value); // 1–10
    const t = (sliderValue - 1) / 9; // normalize to 0–1
    const strength = SPIN_KICK_MIN + t * (SPIN_KICK_MAX - SPIN_KICK_MIN);
    const direction = angularVelocity === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(angularVelocity) || 1;
    angularVelocity += direction * strength;
    if (angularVelocity > MAX_ANGULAR_VELOCITY) angularVelocity = MAX_ANGULAR_VELOCITY;
    if (angularVelocity < -MAX_ANGULAR_VELOCITY) angularVelocity = -MAX_ANGULAR_VELOCITY;
  }

  spinBtn.addEventListener("click", spinKick);

  // ---------- Pointer (mouse + touch): pour only, never affects the spin ----------
  function canvasLocalFromEvent(evt, rect) {
    const scaleX = DISC_SIZE / rect.width;
    const scaleY = DISC_SIZE / rect.height;
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY,
    };
  }

  function onPointerDown(evt) {
    const rect = canvas.getBoundingClientRect();
    const local = canvasLocalFromEvent(evt, rect);
    const distFromCenter = Math.hypot(local.x - DISC_SIZE / 2, local.y - DISC_SIZE / 2);
    if (distFromCenter > DISC_RADIUS) return;

    isPouring = true;
    pourScreenX = local.x;
    pourScreenY = local.y;
    lastPourTime = 0; // pour immediately

    canvas.setPointerCapture(evt.pointerId);
    canvas.focus();
  }

  function onPointerMove(evt) {
    if (!isPouring) return;
    const rect = canvas.getBoundingClientRect();
    const local = canvasLocalFromEvent(evt, rect);
    pourScreenX = local.x;
    pourScreenY = local.y;
  }

  function onPointerUp(evt) {
    isPouring = false;
    try {
      canvas.releasePointerCapture(evt.pointerId);
    } catch (e) {
      /* ignore */
    }
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  canvas.addEventListener("keydown", (evt) => {
    if (evt.code === "Space") {
      evt.preventDefault();
      spinKick();
    }
  });

  // ---------- Controls ----------
  function selectSwatch(el) {
    swatches.forEach((s) => s.classList.remove("is-selected"));
    el.classList.add("is-selected");
    currentColor = el.dataset.color;
  }

  swatches.forEach((el) => {
    el.addEventListener("click", () => selectSwatch(el));
  });

  customColorInput.addEventListener("input", () => {
    swatches.forEach((s) => s.classList.remove("is-selected"));
    currentColor = customColorInput.value;
  });

  brushBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      brushBtns.forEach((b) => b.classList.remove("is-selected"));
      btn.classList.add("is-selected");
      currentBrush = Number(btn.dataset.size);
    });
  });

  clearBtn.addEventListener("click", () => {
    particles = [];
    paintBaseDisc();
  });

  saveBtn.addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = "spin-art.png";
    link.href = paintLayer.toDataURL("image/png");
    link.click();
  });

  // ---------- Init ----------
  paintBaseDisc();
  rafHandle = requestAnimationFrame(tick);
})();
