// Airpoint playground — mouse* handlers stay the interaction API for hands.js

const BG = "#08131a";
const TEXT = "#d7ece4";
const MUTED = "#8fb3a8";
const GREEN = "#2ec4b6";
const CITRUS = "#e4f35b";
const CORAL = "#ff6b4a";

let screen = "home"; // "home" | "selected"
let audioStarted = false;
let touches = 0;
let selected = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

const orbs = [];
const sparks = [];
const ripples = [];
const floaters = [];

const PALETTE = ["#2ec4b6", "#e4f35b", "#ff6b4a", "#7bdff2", "#f4a261"];

function setup() {
  const cnv = createCanvas(windowWidth, windowHeight);
  cnv.parent("stage");
  textFont("IBM Plex Sans");
  seedWorld();
  initHands();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  // Keep home anchors proportional after resize
  for (let i = 0; i < orbs.length; i++) {
    orbs[i].homeX = width * (0.2 + i * 0.15);
    orbs[i].homeY = height * (0.4 + (i % 2) * 0.14);
  }
  if (typeof placeHandBtn === "function") placeHandBtn();
}

function seedWorld() {
  orbs.length = 0;
  floaters.length = 0;

  const specs = [
    { id: "Orbit", behavior: "orbit", color: PALETTE[0], r: 46 },
    { id: "Spring", behavior: "spring", color: PALETTE[1], r: 44 },
    { id: "Pulse", behavior: "pulse", color: PALETTE[2], r: 48 },
    { id: "Drift", behavior: "drift", color: PALETTE[3], r: 42 },
    { id: "Snap", behavior: "snap", color: PALETTE[4], r: 44 }
  ];
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    orbs.push({
      id: s.id,
      behavior: s.behavior,
      x: width * (0.2 + i * 0.15),
      y: height * (0.4 + (i % 2) * 0.14),
      homeX: width * (0.2 + i * 0.15),
      homeY: height * (0.4 + (i % 2) * 0.14),
      r: s.r,
      baseR: s.r,
      color: s.color,
      vx: random(-0.25, 0.25),
      vy: random(-0.25, 0.25),
      spin: random(TWO_PI),
      wobble: random(0.01, 0.03),
      mass: 1
    });
  }

  for (let i = 0; i < 28; i++) {
    floaters.push({
      x: random(width),
      y: random(height),
      r: random(1.2, 3.4),
      a: random(40, 120),
      s: random(0.15, 0.55),
      ph: random(TWO_PI)
    });
  }
}

function onHandsReady() {
  const el = document.getElementById("hint");
  if (el) el.textContent = "Show your hand · pinch an orb to drag · release to fling";
}

function startAudio() {
  if (audioStarted) return;
  audioStarted = true;
}

function draw() {
  drawAtmosphere();
  updateFloaters();
  updateOrbs();
  drawWell();
  drawOrbs();
  updateSparks();
  updateRipples();
  drawAimGuide();

  // MUST be last — gesture overlay
  handFrame();
}

function drawAtmosphere() {
  background(8, 19, 26);

  noStroke();
  fill(46, 196, 182, 28);
  circle(width * 0.18, height * 0.2, 420 + sin(frameCount * 0.01) * 20);
  fill(255, 107, 74, 18);
  circle(width * 0.82, height * 0.75, 380 + cos(frameCount * 0.008) * 24);
  fill(228, 243, 91, 10);
  circle(width * 0.55, height * 0.15, 260);

  // Horizon rule
  stroke(215, 236, 228, 28);
  strokeWeight(1);
  line(40, height * 0.78, width - 40, height * 0.78);
}

function drawWell() {
  const cx = width * 0.5;
  const cy = height * 0.78;
  noFill();
  stroke(46, 196, 182, 50);
  strokeWeight(2);
  ellipse(cx, cy, 160, 36);
  stroke(228, 243, 91, 35);
  ellipse(cx, cy, 100, 22);

  noStroke();
  fill(143, 179, 168, 160);
  textAlign(CENTER, CENTER);
  textSize(11);
  text("DROP WELL", cx, cy + 28);
}

function updateFloaters() {
  const hx = handsOn && hand.visible ? hand.sx : width * 0.5;
  const hy = handsOn && hand.visible ? hand.sy : height * 0.4;

  for (const f of floaters) {
    f.ph += f.s * 0.02;
    f.x += Math.sin(f.ph) * 0.25;
    f.y += Math.cos(f.ph * 0.7) * 0.2;

    // Gentle attraction toward the hand tip / cursor
    const d = dist(f.x, f.y, hx, hy);
    if (d < 180) {
      f.x += (hx - f.x) * 0.004;
      f.y += (hy - f.y) * 0.004;
    }

    if (f.x < -10) f.x = width + 10;
    if (f.x > width + 10) f.x = -10;
    if (f.y < -10) f.y = height + 10;
    if (f.y > height + 10) f.y = -10;

    noStroke();
    fill(215, 236, 228, f.a);
    circle(f.x, f.y, f.r * 2);
  }
}

function updateOrbs() {
  const wx = width * 0.5;
  const wy = height * 0.78;

  for (const o of orbs) {
    o.spin += o.wobble;

    // Pulse grows/shrinks even while held
    if (o.behavior === "pulse") {
      o.r = o.baseR + Math.sin(frameCount * 0.08 + o.spin) * 7;
    } else {
      o.r = o.baseR;
    }

    if (selected && selected.id === o.id) continue;

    if (o.behavior === "orbit") {
      const ang = frameCount * 0.012 + o.spin;
      const rad = 70;
      o.homeX = lerp(o.homeX, wx, 0.002);
      o.homeY = lerp(o.homeY, height * 0.48, 0.002);
      o.x = lerp(o.x, o.homeX + Math.cos(ang) * rad, 0.08);
      o.y = lerp(o.y, o.homeY + Math.sin(ang) * rad * 0.55, 0.08);
      o.vx *= 0.9;
      o.vy *= 0.9;
    } else if (o.behavior === "spring") {
      o.vx += (o.homeX - o.x) * 0.02;
      o.vy += (o.homeY - o.y) * 0.02;
      o.vx *= 0.92;
      o.vy *= 0.92;
      o.x += o.vx;
      o.y += o.vy;
    } else if (o.behavior === "snap") {
      o.x += o.vx;
      o.y += o.vy;
      o.vx *= 0.98;
      o.vy *= 0.98;
      if (dist(o.x, o.y, o.homeX, o.homeY) > 160 && abs(o.vx) + abs(o.vy) < 1.2) {
        o.vx += (o.homeX - o.x) * 0.08;
        o.vy += (o.homeY - o.y) * 0.08;
      }
    } else if (o.behavior === "drift") {
      o.vx += random(-0.05, 0.05);
      o.vy += random(-0.04, 0.04);
      o.vx = constrain(o.vx, -1.2, 1.2);
      o.vy = constrain(o.vy, -1.2, 1.2);
      o.x += o.vx;
      o.y += o.vy;
    } else {
      // pulse free motion
      o.x += o.vx;
      o.y += o.vy;
      o.vx *= 0.995;
      o.vy *= 0.995;
      o.vy += Math.sin(frameCount * 0.02 + o.spin) * 0.02;
    }

    // Soft bounce
    const m = o.r + 8;
    if (o.x < m) { o.x = m; o.vx *= -0.85; }
    if (o.x > width - m) { o.x = width - m; o.vx *= -0.85; }
    if (o.y < m + 110) { o.y = m + 110; o.vy *= -0.85; }
    if (o.y > height - m - 40) { o.y = height - m - 40; o.vy *= -0.85; }

    // Mild well gravity (not for orbit/spring homes)
    if (o.behavior === "drift" || o.behavior === "pulse") {
      const d = dist(o.x, o.y, wx, wy);
      if (d < 220) {
        o.vx += (wx - o.x) * 0.0003;
        o.vy += (wy - o.y) * 0.0003;
      }
    }
  }

  // Light orb–orb separation
  for (let i = 0; i < orbs.length; i++) {
    for (let j = i + 1; j < orbs.length; j++) {
      const a = orbs[i];
      const b = orbs[j];
      const d = dist(a.x, a.y, b.x, b.y);
      const minD = a.r + b.r + 8;
      if (d > 0 && d < minD) {
        const push = (minD - d) * 0.02;
        const nx = (a.x - b.x) / d;
        const ny = (a.y - b.y) / d;
        if (!(selected && selected.id === a.id)) {
          a.x += nx * push;
          a.y += ny * push;
        }
        if (!(selected && selected.id === b.id)) {
          b.x -= nx * push;
          b.y -= ny * push;
        }
      }
    }
  }
}

function drawOrbs() {
  for (const o of orbs) {
    const isSel = selected && selected.id === o.id;

    // Shadow
    noStroke();
    fill(0, 0, 0, 50);
    ellipse(o.x + 3, o.y + o.r * 0.85, o.r * 1.5, o.r * 0.35);

    // Glow
    fill(red(color(o.color)), green(color(o.color)), blue(color(o.color)), isSel ? 55 : 28);
    circle(o.x, o.y, o.r * 2.6);

    // Body
    fill(o.color);
    circle(o.x, o.y, o.r * 2);

    // Specular
    fill(255, 255, 255, 55);
    circle(o.x - o.r * 0.28, o.y - o.r * 0.3, o.r * 0.55);

    // Orbit ring when selected
    if (isSel) {
      noFill();
      stroke(CITRUS);
      strokeWeight(3);
      circle(o.x, o.y, o.r * 2 + 18 + sin(frameCount * 0.2) * 3);
    }

    // Label
    fill(8, 19, 26, 210);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(13);
    textStyle(BOLD);
    text(o.id, o.x, o.y);
    textStyle(NORMAL);
  }
}

function drawAimGuide() {
  if (!(handsOn && hand.visible) || hand.pinched) return;
  const target = hitOrb(hand.sx, hand.sy);
  if (!target) return;
  noFill();
  stroke(255, 107, 74, 140);
  strokeWeight(2);
  line(hand.sx, hand.sy, target.x, target.y);
}

function spawnRipple(x, y, col) {
  ripples.push({ x, y, r: 8, life: 1, color: col || CITRUS });
}

function spawnSparks(x, y, col) {
  for (let i = 0; i < 14; i++) {
    const a = random(TWO_PI);
    const sp = random(1.5, 5);
    sparks.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 1,
      color: col || CORAL
    });
  }
}

function updateRipples() {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.r += 4.5;
    r.life -= 0.03;
    noFill();
    stroke(red(color(r.color)), green(color(r.color)), blue(color(r.color)), 200 * r.life);
    strokeWeight(2);
    circle(r.x, r.y, r.r * 2);
    if (r.life <= 0) ripples.splice(i, 1);
  }
}

function updateSparks() {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.x += s.vx;
    s.y += s.vy;
    s.vy += 0.08;
    s.life -= 0.03;
    noStroke();
    fill(red(color(s.color)), green(color(s.color)), blue(color(s.color)), 255 * s.life);
    circle(s.x, s.y, 4 * s.life);
    if (s.life <= 0) sparks.splice(i, 1);
  }
}

function bumpTouches() {
  touches += 1;
  const el = document.getElementById("touch-count");
  if (el) el.textContent = String(touches);
}

function hitOrb(x, y) {
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    if (dist(x, y, o.x, o.y) <= o.r + 6) return o;
  }
  return null;
}

function mousePressed() {
  const x = mouseX;
  const y = mouseY;
  const o = hitOrb(x, y);

  bumpTouches();
  spawnRipple(x, y, o ? o.color : CITRUS);
  spawnSparks(x, y, o ? o.color : CORAL);

  if (o) {
    selected = o;
    screen = "selected";
    dragOffsetX = o.x - x;
    dragOffsetY = o.y - y;
    o.vx = 0;
    o.vy = 0;
    return;
  }

  selected = null;
  screen = "home";
}

function mouseDragged() {
  if (!selected || screen !== "selected") return;
  const nx = constrain(mouseX + dragOffsetX, selected.r, width - selected.r);
  const ny = constrain(mouseY + dragOffsetY, selected.r + 100, height - selected.r - 30);
  selected.vx = (nx - selected.x) * 0.55;
  selected.vy = (ny - selected.y) * 0.55;
  selected.x = nx;
  selected.y = ny;

  // Trail while dragging
  if (frameCount % 2 === 0) {
    sparks.push({
      x: selected.x + random(-8, 8),
      y: selected.y + random(-8, 8),
      vx: random(-0.5, 0.5),
      vy: random(-0.5, 0.5),
      life: 0.7,
      color: selected.color
    });
  }
}

function mouseReleased() {
  if (selected) {
    selected.vx = constrain(selected.vx, -18, 18);
    selected.vy = constrain(selected.vy, -18, 18);
    if (selected.behavior === "snap") {
      selected.vx += (selected.homeX - selected.x) * 0.15;
      selected.vy += (selected.homeY - selected.y) * 0.15;
    }
    if (selected.behavior === "spring") {
      // spring returns home via update loop
    }
    spawnRipple(selected.x, selected.y, selected.color);
  }
}
