(() => {
  "use strict";

  // ---------- Config ----------
  const STORAGE_KEY = "spinner-app-segments-v1";
  const MIN_SEGMENTS = 2;
  const MAX_SEGMENTS = 16;
  const FRICTION_PER_FRAME_60FPS = 0.985; // viscous decay, tuned for 60fps steps
  const STOP_THRESHOLD = 0.02; // rad/s
  const BUTTON_SPIN_MIN = 14; // rad/s
  const BUTTON_SPIN_MAX = 22; // rad/s

  const DEFAULT_SEGMENTS = [
    { label: "1", color: "#ef476f", note: "" },
    { label: "2", color: "#f78c6b", note: "" },
    { label: "3", color: "#ffd166", note: "" },
    { label: "4", color: "#83d483", note: "" },
    { label: "5", color: "#06d6a0", note: "" },
    { label: "6", color: "#118ab2", note: "" },
    { label: "7", color: "#5c6bc0", note: "" },
    { label: "8", color: "#c06fd6", note: "" },
  ];

  // ---------- State ----------
  let segments = loadSegments();
  let rotation = 0; // radians, current wheel rotation
  let angularVelocity = 0; // rad/s
  let isDragging = false;
  let isSpinning = false;
  let dragCenter = { x: 0, y: 0 };
  let lastAngle = 0;
  let lastTime = 0;
  let lastSegmentIndex = -1;
  let animationHandle = null;
  let audioCtx = null;

  // ---------- DOM ----------
  const canvas = document.getElementById("wheel");
  const ctx = canvas.getContext("2d");
  const hubBtn = document.getElementById("hub-spin");
  const resultBanner = document.getElementById("result-banner");
  const resultText = document.getElementById("result-text");
  const resultDismiss = document.getElementById("result-dismiss");
  const customizeToggle = document.getElementById("customize-toggle");
  const customizeClose = document.getElementById("customize-close");
  const customizePanel = document.getElementById("customize-panel");
  const segmentList = document.getElementById("segment-list");
  const addSegmentBtn = document.getElementById("add-segment");
  const resetSegmentsBtn = document.getElementById("reset-segments");

  // ---------- Persistence (best-effort; falls back to in-memory) ----------
  function loadSegments() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length >= MIN_SEGMENTS) return parsed;
      }
    } catch (e) {
      /* storage unavailable (e.g. sandboxed preview) — use defaults */
    }
    return DEFAULT_SEGMENTS.map((s) => ({ ...s }));
  }

  function saveSegments() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(segments));
    } catch (e) {
      /* ignore — in-memory state still works for this session */
    }
  }

  // ---------- Geometry helpers ----------
  function normalizeAngle(a) {
    const twoPi = Math.PI * 2;
    a = a % twoPi;
    if (a < 0) a += twoPi;
    return a;
  }

  function shortestDelta(from, to) {
    let d = normalizeAngle(to) - normalizeAngle(from);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function getSegmentAt(rot) {
    const n = segments.length;
    const segAngle = (Math.PI * 2) / n;
    // Pointer is fixed at the top of the wheel (screen angle -PI/2).
    // A slice drawn at local angle theta appears on screen at theta + rot.
    // Solve theta + rot = -PI/2 (mod 2PI) for theta, then find its slice.
    let theta = normalizeAngle(-Math.PI / 2 - rot);
    let idx = Math.floor(theta / segAngle) % n;
    if (idx < 0) idx += n;
    return idx;
  }

  function relativeLuminance(hex) {
    const c = hex.replace("#", "");
    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;
    const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  function textColorFor(bgHex) {
    try {
      return relativeLuminance(bgHex) > 0.55 ? "#1a1035" : "#ffffff";
    } catch (e) {
      return "#ffffff";
    }
  }

  // ---------- Drawing ----------
  function draw() {
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) / 2 - 4;
    const n = segments.length;
    const segAngle = (Math.PI * 2) / n;

    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);

    for (let i = 0; i < n; i++) {
      const start = i * segAngle;
      const end = start + segAngle;
      const seg = segments[i];

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.stroke();

      const mid = start + segAngle / 2;
      ctx.save();
      ctx.rotate(mid);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = textColorFor(seg.color);
      const fontSize = n > 10 ? 18 : 26;
      ctx.font = `bold ${fontSize}px -apple-system, sans-serif`;
      ctx.fillText(seg.label || "", radius - 18, 0);
      ctx.restore();
    }

    ctx.restore();
  }

  // ---------- Audio (tick) ----------
  function ensureAudio() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        audioCtx = null;
      }
    } else if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  }

  function playTick() {
    if (!audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "square";
      osc.frequency.value = 720;
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.06);
    } catch (e) {
      /* ignore audio errors */
    }
  }

  function checkSegmentCrossing() {
    const idx = getSegmentAt(rotation);
    if (idx !== lastSegmentIndex) {
      if (lastSegmentIndex !== -1) playTick();
      lastSegmentIndex = idx;
    }
  }

  // ---------- Result ----------
  function announceResult() {
    const idx = getSegmentAt(rotation);
    const seg = segments[idx];
    resultText.textContent = seg.note && seg.note.trim() ? seg.note : `Landed on ${seg.label}!`;
    resultBanner.hidden = false;

    // Extension hook: listen for this event to trigger custom behavior per result.
    window.dispatchEvent(
      new CustomEvent("spinnerResult", { detail: { index: idx, segment: seg } })
    );
  }

  // ---------- Animation loop ----------
  function stepSpin(timestamp) {
    if (lastTime === 0) lastTime = timestamp;
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // clamp for tab-switch jumps
    lastTime = timestamp;

    rotation += angularVelocity * dt;
    const decay = Math.pow(FRICTION_PER_FRAME_60FPS, dt * 60);
    angularVelocity *= decay;

    checkSegmentCrossing();
    draw();

    if (Math.abs(angularVelocity) > STOP_THRESHOLD) {
      animationHandle = requestAnimationFrame(stepSpin);
    } else {
      angularVelocity = 0;
      isSpinning = false;
      animationHandle = null;
      announceResult();
    }
  }

  function startSpin(initialVelocity) {
    if (isDragging) return;
    resultBanner.hidden = true;
    isSpinning = true;
    angularVelocity = initialVelocity;
    lastTime = 0;
    if (animationHandle) cancelAnimationFrame(animationHandle);
    animationHandle = requestAnimationFrame(stepSpin);
  }

  function buttonSpin() {
    ensureAudio();
    if (isDragging) return;
    const magnitude = BUTTON_SPIN_MIN + Math.random() * (BUTTON_SPIN_MAX - BUTTON_SPIN_MIN);
    const direction = Math.random() < 0.5 ? -1 : 1;
    startSpin(magnitude * direction);
  }

  // ---------- Pointer (mouse + touch) drag-to-spin ----------
  function angleFromEvent(evt) {
    const dx = evt.clientX - dragCenter.x;
    const dy = evt.clientY - dragCenter.y;
    return Math.atan2(dy, dx);
  }

  function onPointerDown(evt) {
    if (animationHandle) {
      cancelAnimationFrame(animationHandle);
      animationHandle = null;
    }
    isSpinning = false;
    isDragging = true;
    resultBanner.hidden = true;
    ensureAudio();

    const rect = canvas.getBoundingClientRect();
    dragCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    lastAngle = angleFromEvent(evt);
    lastTime = performance.now();
    angularVelocity = 0;
    canvas.setPointerCapture(evt.pointerId);
    canvas.focus();
  }

  function onPointerMove(evt) {
    if (!isDragging) return;
    const now = performance.now();
    const currentAngle = angleFromEvent(evt);
    const delta = shortestDelta(lastAngle, currentAngle);
    const dt = Math.max(now - lastTime, 1) / 1000;

    rotation += delta;
    const instVelocity = delta / dt;
    angularVelocity = angularVelocity * 0.75 + instVelocity * 0.25;

    lastAngle = currentAngle;
    lastTime = now;

    checkSegmentCrossing();
    draw();
  }

  function onPointerUp(evt) {
    if (!isDragging) return;
    isDragging = false;
    try {
      canvas.releasePointerCapture(evt.pointerId);
    } catch (e) {
      /* ignore */
    }

    if (Math.abs(angularVelocity) > STOP_THRESHOLD) {
      startSpin(angularVelocity);
    } else {
      angularVelocity = 0;
      announceResult();
    }
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  canvas.addEventListener("keydown", (evt) => {
    if (evt.code === "Space" || evt.code === "Enter") {
      evt.preventDefault();
      buttonSpin();
    }
  });

  hubBtn.addEventListener("click", buttonSpin);
  resultDismiss.addEventListener("click", () => {
    resultBanner.hidden = true;
  });

  // ---------- Customize panel ----------
  function randomColor() {
    const hue = Math.floor(Math.random() * 360);
    return hslToHex(hue, 65, 55);
  }

  function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = (x) => Math.round(255 * x).toString(16).padStart(2, "0");
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  }

  function renderSegmentList() {
    segmentList.innerHTML = "";
    segments.forEach((seg, i) => {
      const row = document.createElement("div");
      row.className = "segment-row";

      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.value = seg.color;
      colorInput.setAttribute("aria-label", `Color for segment ${i + 1}`);
      colorInput.addEventListener("input", () => {
        segments[i].color = colorInput.value;
        saveSegments();
        draw();
      });

      const labelInput = document.createElement("input");
      labelInput.type = "text";
      labelInput.value = seg.label;
      labelInput.placeholder = "Label";
      labelInput.maxLength = 12;
      labelInput.addEventListener("input", () => {
        segments[i].label = labelInput.value;
        saveSegments();
        draw();
      });

      const noteInput = document.createElement("input");
      noteInput.type = "text";
      noteInput.value = seg.note || "";
      noteInput.placeholder = "Result message (optional)";
      noteInput.maxLength = 60;
      noteInput.addEventListener("input", () => {
        segments[i].note = noteInput.value;
        saveSegments();
      });

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.innerHTML = "&times;";
      removeBtn.setAttribute("aria-label", `Remove segment ${i + 1}`);
      removeBtn.disabled = segments.length <= MIN_SEGMENTS;
      removeBtn.addEventListener("click", () => {
        if (segments.length <= MIN_SEGMENTS) return;
        segments.splice(i, 1);
        saveSegments();
        renderSegmentList();
        draw();
      });

      row.appendChild(colorInput);
      row.appendChild(labelInput);
      row.appendChild(noteInput);
      row.appendChild(removeBtn);
      segmentList.appendChild(row);
    });
  }

  addSegmentBtn.addEventListener("click", () => {
    if (segments.length >= MAX_SEGMENTS) return;
    segments.push({ label: String(segments.length + 1), color: randomColor(), note: "" });
    saveSegments();
    renderSegmentList();
    draw();
  });

  resetSegmentsBtn.addEventListener("click", () => {
    segments = DEFAULT_SEGMENTS.map((s) => ({ ...s }));
    saveSegments();
    renderSegmentList();
    draw();
  });

  function openCustomize() {
    renderSegmentList();
    customizePanel.hidden = false;
    customizeToggle.setAttribute("aria-expanded", "true");
  }

  function closeCustomize() {
    customizePanel.hidden = true;
    customizeToggle.setAttribute("aria-expanded", "false");
  }

  customizeToggle.addEventListener("click", openCustomize);
  customizeClose.addEventListener("click", closeCustomize);
  customizePanel.addEventListener("click", (evt) => {
    if (evt.target === customizePanel) closeCustomize();
  });

  // ---------- Init ----------
  draw();
})();
