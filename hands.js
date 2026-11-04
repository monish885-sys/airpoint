// ============================================================
// HAND CONTROL ADD-ON  (ml5 handPose + webcam)
//  - Cursor = point between your thumb tip and index fingertip
//  - Quick pinch      = tap / click
//  - Pinch and hold   = grab and drag
//  - Open fingers     = let go
//  - Hold hand still ~1s over something = tap (backup gesture)
// It drives your existing mousePressed / mouseDragged /
// mouseReleased code, so the rest of the sketch is unchanged.
// ============================================================

let handModel = null;
let handVideo = null;
let handList = [];
let handsOn = false;
let handBtn = null;

const hand = {
  sx: 0,
  sy: 0,
  visible: false,
  pinched: false,
  dwellStart: 0,
  dwellX: 0,
  dwellY: 0,
  lastClickX: -999,
  lastClickY: -999,
  gap: 1,
  pinchFrames: 0,
  openFrames: 0,
  confidence: 0
};

// Relative to palm size (wrist → middle knuckle). Hysteresis avoids flicker.
const PINCH_ON = 0.30;
const PINCH_OFF = 0.48;
const PINCH_CONFIRM = 2;   // frames required to lock pinch on/off
const DWELL_MS = 900;
const DWELL_MOVE = 28;
const CLICK_COOLDOWN_DIST = 80;

function placeHandBtn() {
  // Button lives in the HTML HUD — no absolute repositioning needed
}

function wireHandButton(el) {
  if (!el || el.dataset.wired === "1") return;
  el.dataset.wired = "1";
  el.addEventListener("click", () => {
    startAudio();
    el.textContent = "Starting camera…";
    el.disabled = true;

    handVideo = createCapture(VIDEO, { flipped: true }, () => {
      handModel = ml5.handPose({ maxHands: 1, flipped: true }, () => {
        handModel.detectStart(handVideo, (results) => {
          handList = Array.isArray(results) ? results : [];
        });
        handsOn = true;
        el.style.display = "none";
        const hint = document.getElementById("hint");
        if (hint) {
          hint.textContent =
            "Cursor tracks thumb–index midpoint · pinch to grab · hold still to tap";
        }
        if (typeof onHandsReady === "function") onHandsReady();
      });
    });

    handVideo.size(640, 480);
    handVideo.hide();
  });
}

function initHands() {
  // Always use the HUD button — never create a second p5 button
  const existing = document.getElementById("hand-btn");
  if (!existing) {
    console.error("Airpoint: #hand-btn missing from the page");
    return;
  }
  // Remove any leftover duplicate buttons from older builds
  document.querySelectorAll("button#hand-btn").forEach((btn, i) => {
    if (i > 0) btn.remove();
  });
  handBtn = {
    elt: existing,
    hide() {
      existing.style.display = "none";
    }
  };
  wireHandButton(existing);
}

function handFrame() {
  if (!handsOn) return;
  updateHands();
  drawHandLayer();
}

function kp(handObj, index, named) {
  if (named && handObj[named]) return handObj[named];
  if (handObj.keypoints && handObj.keypoints[index]) return handObj.keypoints[index];
  return null;
}

function videoSize() {
  const el = handVideo && handVideo.elt;
  const w = (el && el.videoWidth) || (handVideo && handVideo.width) || 640;
  const h = (el && el.videoHeight) || (handVideo && handVideo.height) || 480;
  return { w, h };
}

function updateHands() {
  const h = handList[0];

  if (!h) {
    hand.visible = false;
    hand.confidence = 0;
    hand.pinchFrames = 0;
    hand.openFrames = 0;
    if (hand.pinched) endPinch();
    return;
  }

  const thumb = kp(h, 4, "thumb_tip");
  const index = kp(h, 8, "index_finger_tip");
  const wrist = kp(h, 0, "wrist");
  const knuckle = kp(h, 9, "middle_finger_mcp");

  if (!thumb || !index || !wrist || !knuckle) {
    hand.visible = false;
    return;
  }

  // Drop shaky / low-confidence detections when scores exist
  const scores = [thumb, index, wrist, knuckle]
    .map((p) => (typeof p.confidence === "number" ? p.confidence : 1));
  hand.confidence = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (hand.confidence < 0.35) {
    hand.visible = false;
    return;
  }

  const handSize = Math.max(28, dist(wrist.x, wrist.y, knuckle.x, knuckle.y));
  const gap = dist(thumb.x, thumb.y, index.x, index.y) / handSize;
  hand.gap = gap;

  const { w: vw, h: vh } = videoSize();
  const mx = (thumb.x + index.x) * 0.5;
  const my = (thumb.y + index.y) * 0.5;

  // Map from a padded camera region so edges are reachable without over-reaching
  const tx = constrain(map(mx, vw * 0.12, vw * 0.88, 0, width), 0, width);
  const ty = constrain(map(my, vh * 0.10, vh * 0.82, 0, height), 0, height);

  if (!hand.visible) {
    hand.sx = tx;
    hand.sy = ty;
    hand.dwellX = tx;
    hand.dwellY = ty;
    hand.dwellStart = millis();
  } else {
    // Adaptive smoothing: snappy when moving, steadier when dwelling
    const jump = dist(hand.sx, hand.sy, tx, ty);
    const alpha = jump > 40 ? 0.55 : jump > 12 ? 0.38 : 0.22;
    hand.sx = lerp(hand.sx, tx, alpha);
    hand.sy = lerp(hand.sy, ty, alpha);
  }

  hand.visible = true;

  // Pinch with confirmation frames + hysteresis
  if (!hand.pinched) {
    if (gap < PINCH_ON) hand.pinchFrames++;
    else hand.pinchFrames = 0;
    hand.openFrames = 0;
    if (hand.pinchFrames >= PINCH_CONFIRM) startPinch();
  } else {
    if (gap > PINCH_OFF) hand.openFrames++;
    else hand.openFrames = 0;
    hand.pinchFrames = 0;
    if (hand.openFrames >= PINCH_CONFIRM) endPinch();
  }

  if (hand.pinched && screen === "selected") {
    setPointer();
    mouseDragged();
  }

  // Hold-still tap (backup)
  if (!hand.pinched) {
    if (dist(hand.sx, hand.sy, hand.dwellX, hand.dwellY) > DWELL_MOVE) {
      hand.dwellX = hand.sx;
      hand.dwellY = hand.sy;
      hand.dwellStart = millis();
    }

    const farFromLastClick =
      dist(hand.sx, hand.sy, hand.lastClickX, hand.lastClickY) > CLICK_COOLDOWN_DIST;

    if (millis() - hand.dwellStart > DWELL_MS && farFromLastClick) {
      setPointer();
      mousePressed();
      mouseReleased();
      hand.lastClickX = hand.sx;
      hand.lastClickY = hand.sy;
      hand.dwellStart = millis();
    }
  }
}

function setPointer() {
  let inst = null;
  if (typeof p5 !== "undefined" && p5.instances && p5.instances.length) {
    inst = p5.instances[p5.instances.length - 1];
  } else if (typeof window !== "undefined" && window._p5Instance) {
    inst = window._p5Instance;
  }

  if (inst) {
    inst.mouseX = hand.sx;
    inst.mouseY = hand.sy;
    inst.winMouseX = hand.sx;
    inst.winMouseY = hand.sy;
  }
  mouseX = hand.sx;
  mouseY = hand.sy;
}

function startPinch() {
  hand.pinched = true;
  hand.pinchFrames = 0;
  hand.openFrames = 0;
  setPointer();
  mousePressed();
}

function endPinch() {
  hand.pinched = false;
  hand.pinchFrames = 0;
  hand.openFrames = 0;
  setPointer();
  mouseReleased();
  hand.lastClickX = hand.sx;
  hand.lastClickY = hand.sy;
  hand.dwellStart = millis();
}

function drawHandLayer() {
  push();
  rectMode(CORNER);
  textAlign(LEFT, CENTER);

  // Camera preview frame
  const pw = 168;
  const ph = 126;
  const px = width - pw - 24;
  const py = height - ph - 24;

  noStroke();
  fill(8, 19, 26, 180);
  rect(px - 6, py - 6, pw + 12, ph + 12, 14);

  if (handVideo) {
    tint(255, 200);
    image(handVideo, px, py, pw, ph);
    noTint();
  }

  noFill();
  stroke(215, 236, 228, 70);
  strokeWeight(1.5);
  rect(px, py, pw, ph, 10);

  // Live pinch meter inside preview
  if (hand.visible) {
    const meter = constrain(map(hand.gap, PINCH_ON, PINCH_OFF + 0.2, 1, 0), 0, 1);
    noStroke();
    fill(228, 243, 91, 200);
    rect(px + 10, py + ph - 14, (pw - 20) * meter, 4, 2);
  }

  if (hand.visible) {
    // Dwell progress
    if (!hand.pinched) {
      const p = constrain((millis() - hand.dwellStart) / DWELL_MS, 0, 1);
      const idle = dist(hand.sx, hand.sy, hand.dwellX, hand.dwellY) < DWELL_MOVE;
      if (p > 0.12 && idle) {
        noFill();
        stroke(46, 196, 182);
        strokeWeight(3.5);
        arc(hand.sx, hand.sy, 54, 54, -HALF_PI, -HALF_PI + TWO_PI * p);
      }
    }

    // Cursor
    if (hand.pinched) {
      noStroke();
      fill(228, 243, 91);
      circle(hand.sx, hand.sy, 22);
      fill(8, 19, 26, 180);
      circle(hand.sx, hand.sy, 8);
    } else {
      noFill();
      stroke(215, 236, 228, 220);
      strokeWeight(2);
      circle(hand.sx, hand.sy, 36);
      noStroke();
      fill(255, 107, 74);
      circle(hand.sx, hand.sy, 7);
    }

    // Soft aim light
    noStroke();
    fill(46, 196, 182, hand.pinched ? 28 : 16);
    circle(hand.sx, hand.sy, hand.pinched ? 120 : 90);
  }

  pop();
}
