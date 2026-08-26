// ---------------------------------------------------------------------------
// main.js — sets up the 3D feed, reads your input, and runs the loop.
//
// The loop is the heart of every game ever made:
//     1. work out how much time passed since the last frame  (delta time)
//     2. move everything by that much
//     3. draw
//     4. do it again
//
// Step 1 is the one beginners skip. If you move the robot a fixed amount each
// frame instead, it goes twice as fast on a 120Hz screen. Always multiply by dt.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { buildRoom } from './room.js';
import { createTreats } from './treats.js';
import { createPost } from './post.js';
import { createAudio } from './audio.js';

const canvas = document.getElementById('lcd');

// --- renderer ---------------------------------------------------------------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
} catch (err) {
  document.getElementById('noWebgl').hidden = false;
  throw err;
}
renderer.setPixelRatio(1);
renderer.setSize(CONFIG.lcd.width, CONFIG.lcd.height, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Tone mapping and colour encoding are deliberately OFF here. Three only
// applies them when drawing to the canvas, never when drawing into a render
// target — and everything now goes through a render target. The lens shader
// does both instead. See post.js, and CONFIG.lens.exposure.
renderer.toneMapping = THREE.NoToneMapping;

// The scene is no longer drawn straight to the canvas. It goes through the
// lens first — see post.js.
const post = createPost(renderer, CONFIG.lcd.width, CONFIG.lcd.height);

// --- scene ------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14100c);
scene.fog = new THREE.Fog(0xc9bda6, 9, 26);

const camera = new THREE.PerspectiveCamera(
  CONFIG.robot.fov,
  CONFIG.lcd.width / CONFIG.lcd.height,
  0.05,
  40
);
camera.rotation.order = 'YXZ';
scene.add(camera);

// --- light ------------------------------------------------------------------
scene.add(new THREE.AmbientLight(0xb4c2c8, CONFIG.light.ambient));

const sun = new THREE.DirectionalLight(0xfff2dc, CONFIG.light.windowIntensity);
sun.position.set(8, 3.4, -0.4);
sun.target.position.set(-2, 0.4, 0.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006;
sun.shadow.camera.left = -7;
sun.shadow.camera.right = 7;
sun.shadow.camera.top = 7;
sun.shadow.camera.bottom = -7;
sun.shadow.camera.far = 26;
scene.add(sun);
scene.add(sun.target);

camera.add(new THREE.PointLight(0xc8d8e8, CONFIG.light.cameraLamp, 5));

// --- the room ---------------------------------------------------------------
const { colliders, surfaces, ledges } = buildRoom(scene);
const treats = createTreats(scene, ledges);

// --- the robot --------------------------------------------------------------
const robot = {
  x: CONFIG.robot.startPos[0],
  z: CONFIG.robot.startPos[1],
  angle: CONFIG.robot.startAngle,  // yaw, shared by the chassis and the lens
  pitch: 0,                        // lens tilt, clamped. See CONFIG.aim
  vel: 0,
  angVel: 0,
  yawRate: 0,                      // how fast the head is panning right now
  pitchRate: 0,
};

// You never see the robot — you are looking out of it — but it should still
// throw a shadow, or it reads as a floating camera. Two parts:
//
//   the puck   a real shadow-caster, kept low enough to sit under the lens
//              and out of frame, so the sun casts a proper moving shadow
//   the blob   a soft dark patch directly underneath, so the robot stays
//              grounded even where the sun does not reach
const puck = new THREE.Mesh(
  new THREE.CylinderGeometry(0.24, 0.22, 0.12, 14),
  new THREE.MeshLambertMaterial({ color: 0x2a2622 })
);
puck.castShadow = true;
puck.position.y = 0.06;
scene.add(puck);

const blob = new THREE.Mesh(
  new THREE.PlaneGeometry(0.8, 0.8),
  new THREE.MeshBasicMaterial({
    map: makeBlobTexture(),
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  })
);
blob.rotation.x = -Math.PI / 2;
blob.position.y = 0.012;
scene.add(blob);

/** A soft round gradient, drawn once into a canvas and used as a texture. */
function makeBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// --- sound ------------------------------------------------------------------
const audio = createAudio();
let audioStarted = false;

function wakeAudio() {
  if (audioStarted) return;
  audioStarted = true;
  audio.start();
}
addEventListener('keydown', wakeAudio, { once: true });
addEventListener('pointerdown', wakeAudio, { once: true });

const muteBtn = document.getElementById('mute');
muteBtn.addEventListener('click', () => {
  wakeAudio();
  muteBtn.classList.toggle('is-muted', audio.toggleMute());
});

// --- input: keyboard and d-pad ----------------------------------------------
// Several ways in, all writing to the same few values. Everything downstream
// reads those values and has no idea which device you used.
const held = { fwd: false, back: false, left: false, right: false };
let precise = false;

const KEYS = {
  KeyW: 'fwd',   ArrowUp: 'fwd',
  KeyS: 'back',  ArrowDown: 'back',
  KeyA: 'left',  ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

addEventListener('keydown', (e) => {
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') precise = true;
  if (e.code === 'Space') { e.preventDefault(); startCharge(); return; }
  const dir = KEYS[e.code];
  if (!dir) return;
  e.preventDefault();
  held[dir] = true;
});

addEventListener('keyup', (e) => {
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') precise = false;
  if (e.code === 'Space') { e.preventDefault(); releaseCharge(); return; }
  const dir = KEYS[e.code];
  if (!dir) return;
  e.preventDefault();
  held[dir] = false;
});

addEventListener('blur', () => {
  for (const k in held) held[k] = false;
  precise = false;
  nub.x = 0;
  nub.y = 0;
  look.x = 0;
  look.y = 0;
  cancelCharge();
});

const padButtons = document.querySelectorAll('[data-dir]');
for (const btn of padButtons) {
  const dir = btn.dataset.dir;
  const press = (e) => { e.preventDefault(); held[dir] = true; btn.setPointerCapture?.(e.pointerId); };
  const release = () => { held[dir] = false; };
  btn.addEventListener('pointerdown', press);
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('pointerleave', release);
}

// --- input: the analog nub --------------------------------------------------
// The nub AIMS. The d-pad and WASD DRIVE. One control per job.
//
// Push it in any direction and you get a blend of pan and tilt, which is what
// makes it feel like a stick rather than four more buttons.
const nub = { x: 0, y: 0 };
const nubEl = document.getElementById('nub');
const nubCap = nubEl.querySelector('.nub-cap');
let nubPointer = null;

// How far the cap slides, in SVG user units. The chassis is an SVG, and
// transforms on SVG elements work in USER units, not screen pixels — so the
// cap has to be moved by the normalised -1..1 vector times a constant, never
// by a pixel measurement, or it drifts as the window resizes.
const NUB_TRAVEL = 13;

function setNub(e) {
  const r = nubEl.getBoundingClientRect();
  const reach = r.width * 0.34;             // screen px for a full push
  let dx = (e.clientX - (r.left + r.width / 2)) / reach;
  let dy = (e.clientY - (r.top + r.height / 2)) / reach;

  // Clamp to a circle, not a square, so diagonals are not faster.
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }

  nub.x = dx;
  nub.y = dy;
  nubCap.setAttribute('transform', `translate(${dx * NUB_TRAVEL} ${dy * NUB_TRAVEL})`);
}

function resetNub() {
  nubPointer = null;
  nub.x = 0;
  nub.y = 0;
  nubCap.removeAttribute('transform');
}

nubEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  nubPointer = e.pointerId;
  nubEl.setPointerCapture?.(e.pointerId);
  setNub(e);
});
nubEl.addEventListener('pointermove', (e) => {
  if (nubPointer === e.pointerId) setNub(e);
});
nubEl.addEventListener('pointerup', resetNub);
nubEl.addEventListener('pointercancel', resetNub);

// --- input: hovering the picture itself -------------------------------------
// This is how the web UI of a real pan/tilt camera works: the further from
// the middle of the frame your cursor sits, the faster the head swings that
// way. Leave the picture and it stops. No clicking, no pointer lock.
const look = { x: 0, y: 0 };
const lcdEl = document.querySelector('.lcd');

lcdEl.addEventListener('pointermove', (e) => {
  const r = lcdEl.getBoundingClientRect();
  look.x = ((e.clientX - r.left) / r.width - 0.5) * 2;   // -1 .. 1
  look.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
});
lcdEl.addEventListener('pointerleave', () => { look.x = 0; look.y = 0; });

/**
 * Deadzone plus a curve. The deadzone throws away tiny wobbles near centre;
 * the curve makes small pushes gentler than large ones, which is what makes
 * an analog stick feel good rather than twitchy.
 */
function shape(v, dz = CONFIG.aim.deadzone) {
  const a = Math.abs(v);
  if (a < dz) return 0;
  const scaled = (a - dz) / (1 - dz);
  return Math.sign(v) * Math.pow(scaled, CONFIG.aim.curve);
}

/** Nub and cursor both aim. Take whichever is pushed harder so they never
 *  fight each other or stack into double speed. */
function aimAxis(nubV, lookV) {
  const a = shape(nubV);
  const b = shape(lookV, CONFIG.aim.mouseDeadzone);
  return Math.abs(a) >= Math.abs(b) ? a : b;
}

// --- input: the treat launcher ----------------------------------------------
const T = CONFIG.treat;
let ammo = T.ammo;
let charge = 0;
let charging = false;
let cooldown = 0;

const treatBtn = document.getElementById('treatBtn');
const chargeEl = document.getElementById('charge');
const chargeFill = chargeEl.querySelector('i');
const ammoEl = document.getElementById('ammo');
const treatLed = document.getElementById('treatLed');

function startCharge() {
  if (charging) return;
  if (cooldown > 0) return;
  if (ammo <= 0) { audio.empty(); return; }
  charging = true;
  charge = 0;
  chargeEl.classList.add('is-on');
  treatBtn.classList.add('is-on');
}

function releaseCharge() {
  if (!charging) return;
  charging = false;
  chargeEl.classList.remove('is-on');
  treatBtn.classList.remove('is-on');
  treats.hideMarker();

  treats.fire(camera, charge);
  audio.fire(charge);
  ammo--;
  cooldown = T.cooldown;
  drawAmmo();
}

function cancelCharge() {
  charging = false;
  chargeEl.classList.remove('is-on');
  treatBtn.classList.remove('is-on');
  treats.hideMarker();
}

treatBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  treatBtn.setPointerCapture?.(e.pointerId);
  startCharge();
});
treatBtn.addEventListener('pointerup', releaseCharge);
treatBtn.addEventListener('pointercancel', cancelCharge);

function drawAmmo() {
  // The ready light on the device dies with the last treat.
  treatLed.classList.toggle('is-off', ammo <= 0);

  ammoEl.innerHTML = '';
  for (let i = 0; i < T.ammo; i++) {
    const pip = document.createElement('i');
    if (i >= ammo) pip.className = 'spent';
    ammoEl.append(pip);
  }
}
drawAmmo();

// --- collision --------------------------------------------------------------
/**
 * Is a robot-sized circle at (nx, nz) overlapping any furniture?
 * Standard circle-vs-box test: find the closest point on the box to the
 * circle's centre, and see if it is within the radius.
 */
function blocked(nx, nz) {
  const r = CONFIG.robot.radius;
  for (const b of colliders) {
    const cx = Math.max(b.minX, Math.min(nx, b.maxX));
    const cz = Math.max(b.minZ, Math.min(nz, b.maxZ));
    const dx = nx - cx;
    const dz = nz - cz;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

/** What is the robot driving on right now? Decides how the wheels sound. */
function surfaceAt(x, z) {
  for (const s of surfaces) {
    if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return s.type;
  }
  return 'floor';
}

// --- update -----------------------------------------------------------------
let clock = 0;

function update(dt) {
  const R = CONFIG.robot;
  const A = CONFIG.aim;
  const scale = precise ? R.precise : 1;

  // --- DRIVE: d-pad and WASD only ------------------------------------------
  const wantVel = (held.fwd ? 1 : 0) - (held.back ? 1 : 0);
  const wantAng = (held.left ? 1 : 0) - (held.right ? 1 : 0);

  // Ease towards the speed you asked for instead of snapping to it. This one
  // line is most of what makes the robot feel like a heavy object with wheels
  // rather than a cursor.
  const ease = Math.min(1, R.accel * dt);
  robot.vel += (wantVel * R.moveSpeed * scale - robot.vel) * ease;
  robot.angVel += (wantAng * R.turnSpeed * scale - robot.angVel) * ease;

  robot.angle += robot.angVel * dt;

  // --- AIM: the nub, or the cursor over the picture -------------------------
  // Rate-based: how far you push sets how FAST it pans, not where it points.
  //
  // And the rate itself is eased rather than applied directly. That lag is
  // the whole reason it feels like a geared motor winding up and coasting
  // down instead of a mouse — it is the slowness, and it is deliberate.
  const wantYaw = aimAxis(nub.x, look.x) * A.yawSpeed * scale;
  const wantPitch = aimAxis(nub.y, look.y) * A.pitchSpeed * scale;

  const aimEase = Math.min(1, A.accel * dt);
  robot.yawRate += (wantYaw - robot.yawRate) * aimEase;
  robot.pitchRate += (wantPitch - robot.pitchRate) * aimEase;

  robot.angle -= robot.yawRate * dt;
  robot.pitch -= robot.pitchRate * dt;

  // Hard clamp. The chassis can crane the lens up a little and that is all —
  // anything more just produces angles that make no sense on a floor robot.
  const lo = (A.pitchMin * Math.PI) / 180;
  const hi = (A.pitchMax * Math.PI) / 180;
  robot.pitch = clamp(robot.pitch, lo, hi);

  // A camera with rotation.y = angle looks down its own -Z, so "forward"
  // is (-sin, -cos). Move each axis separately so that hitting a wall
  // head-on still lets you slide along it instead of sticking.
  const dx = -Math.sin(robot.angle) * robot.vel * dt;
  const dz = -Math.cos(robot.angle) * robot.vel * dt;
  if (!blocked(robot.x + dx, robot.z)) robot.x += dx;
  if (!blocked(robot.x, robot.z + dz)) robot.z += dz;

  // Cheap chassis wobble. Tiny — you should feel it, not see it.
  const bob = Math.sin(clock * 13) * 0.005 * Math.abs(robot.vel);
  const roll = -robot.angVel * 0.012;

  // rotation.order is YXZ, so yaw is applied before tilt and the horizon
  // stays level however far the lens is craned up.
  camera.position.set(robot.x, R.eyeHeight + bob, robot.z);
  camera.rotation.y = robot.angle;
  camera.rotation.x = robot.pitch;
  camera.rotation.z = roll;

  puck.position.set(robot.x, 0.06, robot.z);
  blob.position.set(robot.x, 0.012, robot.z);

  // --- the launcher --------------------------------------------------------
  if (cooldown > 0) cooldown -= dt;

  if (charging) {
    charge = Math.min(1, charge + dt / T.chargeTime);
    chargeFill.style.width = `${charge * 100}%`;
    treats.preview(camera, charge);
  }

  if (treats.update(dt)) audio.land();

  // How hard the pan/tilt head is working, 0..1, for the servo whirr.
  const aimEffort = Math.min(1,
    Math.abs(robot.yawRate) / A.yawSpeed + Math.abs(robot.pitchRate) / A.pitchSpeed);

  audio.update(robot.vel, robot.angVel, surfaceAt(robot.x, robot.z), aimEffort);

  // Light up whichever d-pad button is active, however you triggered it.
  for (const btn of padButtons) {
    btn.classList.toggle('is-on', held[btn.dataset.dir]);
  }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// --- the status strip -------------------------------------------------------
// The version string lives in config.js and lands in the HTML here, so a
// release bump is one edit in the one file that holds every other number.
document.getElementById('osdVer').textContent = `FW ${CONFIG.version}`;

const clockEl = document.getElementById('osdClock');
let seconds = 14 * 3600 + 7 * 60 + 41; // 14:07:41, deep in the afternoon

function tickClock() {
  seconds = (seconds + 1) % 86400;
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  clockEl.textContent = `${h}:${m}:${s}`;
}
tickClock();
setInterval(tickClock, 1000);

// The battery is deliberately a variable rather than fixed text, so switching
// on the drain later (see CONFIG.battery) is a small change, not a redesign.
let battery = 38;
const battFill = document.getElementById('battFill');
const battText = document.getElementById('battText');

function drawBattery() {
  battFill.style.width = `${Math.max(0, Math.min(100, battery))}%`;
  battText.textContent = `${Math.round(battery)}%`;
}
drawBattery();

// Room temperature. It wanders instead of sitting still, because a real sensor
// never reports the same number twice — and because 28 degrees behind closed
// shutters is the whole reason she is not at home.
const tempEl = document.getElementById('osdTemp');
let tempPhase = 0;

function tickTemp() {
  tempPhase += 0.13;
  const t = 28.4 + Math.sin(tempPhase) * 0.5 + (Math.random() - 0.5) * 0.15;
  tempEl.textContent = `${t.toFixed(1)}°C`;
}
tickTemp();
setInterval(tickTemp, 4000);

// --- the loop ---------------------------------------------------------------
let last = performance.now();

function frame(now) {
  // Clamp dt so that alt-tabbing away for a minute does not teleport the
  // robot across the room on the frame you come back.
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  clock += dt;

  update(dt);
  post.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
