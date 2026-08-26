// ---------------------------------------------------------------------------
// room.js — builds the flat out of boxes, and nothing else.
//
// Every piece of furniture is one line of data at the bottom of this file.
// Want a new object? Add a line. That is the whole system, and it is the
// same system that will hold levels later on.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { CONFIG } from './config.js';

const C = CONFIG.colors;
const W = CONFIG.room.width;
const D = CONFIG.room.depth;
const H = CONFIG.room.height;

// Furniture list.
//   pos  = [x, z]  where it sits on the floor (centre of the box)
//   size = [width, height, depth] in metres
//   lift = optional, how far off the floor to raise it (for things on tables)
const FURNITURE = [
  // --- living end (negative Z) ---
  { name: 'rug',        pos: [-1.6, -1.4], size: [3.4, 0.02, 3.4], color: C.rug,  solid: false, surface: 'rug' },
  { name: 'sofa base',  pos: [-3.3, -1.4], size: [1.0, 0.42, 2.6], color: C.sofa },
  { name: 'sofa back',  pos: [-3.75, -1.4], size: [0.3, 0.85, 2.6], color: C.sofa },
  { name: 'coffee tbl', pos: [-1.5, -1.4], size: [0.85, 0.40, 1.5], color: C.wood },
  { name: 'mug',        pos: [-1.5, -1.9], size: [0.11, 0.13, 0.11], color: C.ceramic, lift: 0.40, solid: false },
  { name: 'tv unit',    pos: [ 3.4, -1.4], size: [0.55, 0.48, 2.0], color: C.dark },
  { name: 'tv',         pos: [ 3.5, -1.4], size: [0.09, 0.66, 1.15], color: C.dark, lift: 0.48, solid: false },
  { name: 'floor lamp', pos: [-3.4, -3.9], size: [0.12, 1.55, 0.12], color: C.metal },
  { name: 'lampshade',  pos: [-3.4, -3.9], size: [0.42, 0.30, 0.42], color: C.ceramic, lift: 1.55, solid: false },

  // --- the shelf of someone else's ceramics (foreshadowing) ---
  { name: 'shelf',      pos: [-0.2, -4.75], size: [2.4, 0.07, 0.34], color: C.wood, lift: 1.55, solid: false },
  { name: 'vase a',     pos: [-1.0, -4.75], size: [0.20, 0.34, 0.20], color: C.ceramic, lift: 1.62, solid: false },
  { name: 'vase b',     pos: [-0.3, -4.75], size: [0.15, 0.24, 0.15], color: C.ceramic, lift: 1.62, solid: false },
  { name: 'vase c',     pos: [ 0.45, -4.75], size: [0.24, 0.19, 0.24], color: C.ceramic, lift: 1.62, solid: false },

  // --- bookshelf ---
  { name: 'bookshelf',  pos: [ 2.4, -4.7], size: [1.9, 1.85, 0.38], color: C.wood },

  // --- kitchen end (positive Z) ---
  { name: 'counter',    pos: [ 2.6,  4.5], size: [2.6, 0.92, 0.68], color: C.metal },
  { name: 'fridge',     pos: [ 3.5,  2.9], size: [0.72, 1.75, 0.70], color: C.metal },
  { name: 'dining tbl', pos: [-1.4,  3.2], size: [1.5, 0.74, 0.95], color: C.wood },
  { name: 'chair 1',    pos: [-1.4,  2.3], size: [0.42, 0.88, 0.42], color: C.wood },
  { name: 'chair 2',    pos: [-1.4,  4.1], size: [0.42, 0.88, 0.42], color: C.wood },
  { name: 'plant pot',  pos: [-3.5,  4.4], size: [0.42, 0.45, 0.42], color: C.wood },
  { name: 'plant',      pos: [-3.5,  4.4], size: [0.75, 1.05, 0.75], color: C.plant, lift: 0.45, solid: false },
  { name: 'cardboard',  pos: [ 0.9,  4.6], size: [0.55, 0.48, 0.55], color: C.wood },
];

/**
 * Builds the whole room into the scene.
 *
 * Returns two lists:
 *   colliders — boxes the robot cannot drive through
 *   surfaces  — flat areas that change what driving over them sounds like
 *   ledges    — flat tops a thrown treat can come to rest on
 */
export function buildRoom(scene) {
  const colliders = [];
  const surfaces = [];
  const ledges = [];

  // --- shell: floor, ceiling, four walls -----------------------------------
  addPlane(scene, W, D, C.floor, [0, 0, 0], [-Math.PI / 2, 0, 0]);
  addPlane(scene, W, D, C.ceiling, [0, H, 0], [Math.PI / 2, 0, 0]);

  addPlane(scene, W, H, C.wall, [0, H / 2, -D / 2], [0, 0, 0]);            // back
  addPlane(scene, W, H, C.wall, [0, H / 2,  D / 2], [0, Math.PI, 0]);      // front
  addPlane(scene, D, H, C.wall, [-W / 2, H / 2, 0], [0, Math.PI / 2, 0]);  // left
  addPlane(scene, D, H, C.wall, [ W / 2, H / 2, 0], [0, -Math.PI / 2, 0]); // right

  // Walls as colliders. Thick boxes just outside the room, so the robot
  // stops before it reaches the surface rather than clipping through it.
  const t = 1;
  colliders.push(box2d(0, -D / 2 - t / 2, W + 4, t, H));
  colliders.push(box2d(0,  D / 2 + t / 2, W + 4, t, H));
  colliders.push(box2d(-W / 2 - t / 2, 0, t, D + 4, H));
  colliders.push(box2d( W / 2 + t / 2, 0, t, D + 4, H));

  // --- the window ----------------------------------------------------------
  // A bright emissive panel on the right wall. This is the single biggest
  // reason the room reads at low resolution: it throws real directional
  // shadow across everything and blows out one side of the image.
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.4),
    new THREE.MeshBasicMaterial({ color: C.window })
  );
  glass.position.set(W / 2 - 0.02, 1.5, -0.2);
  glass.rotation.y = -Math.PI / 2;
  scene.add(glass);

  addFrame(scene, W / 2 - 0.04, 1.5, -0.2, 2.75, 1.55);

  // --- doorway on the back wall -------------------------------------------
  const doorway = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 2.05),
    new THREE.MeshBasicMaterial({ color: 0x1c1a18 })
  );
  doorway.position.set(3.0, 1.025, -D / 2 + 0.01);
  scene.add(doorway);

  // --- furniture -----------------------------------------------------------
  for (const item of FURNITURE) {
    const [w, h, d] = item.size;
    const [x, z] = item.pos;
    const y = (item.lift || 0) + h / 2;

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: item.color })
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Things you can drive into. Rugs and objects on tables are not solid —
    // the robot is 34cm tall, it goes under and around, not through.
    const top = (item.lift || 0) + h;
    if (item.solid !== false) colliders.push(box2d(x, z, w, d, top));

    // Things you can drive over, which sound different underneath.
    if (item.surface) surfaces.push({ ...box2d(x, z, w, d, top), type: item.surface });

    // Things a treat can land on top of. Anything with a flat top counts,
    // including the shelf and the counter — that is how treats get up high.
    ledges.push(box2d(x, z, w, d, top));
  }

  // --- the cat -------------------------------------------------------------
  // A prop. It does not do anything yet. It is here so the demo has a subject.
  scene.add(makeCat(0.6, -3.5));
  colliders.push(box2d(0.6, -3.5, 0.7, 0.5, 0.36));

  return { colliders, surfaces, ledges };
}

// --- helpers ---------------------------------------------------------------

function addPlane(scene, w, h, color, pos, rot) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshLambertMaterial({ color })
  );
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addFrame(scene, x, y, z, w, h) {
  const mat = new THREE.MeshLambertMaterial({ color: C.dark });
  const bar = 0.09;

  // top and bottom bars, running along Z
  for (const oy of [h / 2, -h / 2]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, bar, w), mat);
    m.position.set(x, y + oy, z);
    scene.add(m);
  }
  for (const oz of [-w / 2, 0, w / 2]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, bar), mat);
    m.position.set(x, y, z + oz);
    scene.add(m);
  }
}

/** A sleeping cat loaf: body, head, two ears, a curled tail. */
function makeCat(x, z) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: C.cat });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), mat);
  body.scale.set(1.5, 0.78, 0.95);
  body.position.y = 0.17;
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 10), mat);
  head.position.set(0.28, 0.20, 0.02);
  g.add(head);

  for (const dz of [-0.07, 0.07]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.09, 6), mat);
    ear.position.set(0.29, 0.31, dz);
    g.add(ear);
  }

  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.035, 6, 14, Math.PI * 1.2), mat);
  tail.position.set(-0.28, 0.11, 0.14);
  tail.rotation.set(Math.PI / 2, 0, 0.5);
  g.add(tail);

  // A cat bed under it, so it reads as "asleep somewhere" not "floating".
  const bed = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.42, 0.11, 14),
    new THREE.MeshLambertMaterial({ color: C.rug })
  );
  bed.position.y = 0.055;
  g.add(bed);

  g.position.set(x, 0, z);
  g.rotation.y = -0.7;
  return g;
}

/**
 * A box footprint on the floor plane, plus how tall it is.
 *
 * The robot only ever needs the footprint (it drives around things). The
 * treat launcher needs `top` as well, so a thrown treat can land on the
 * counter instead of falling through it.
 */
function box2d(cx, cz, w, d, top = 0) {
  return {
    minX: cx - w / 2, maxX: cx + w / 2,
    minZ: cz - d / 2, maxZ: cz + d / 2,
    top,
  };
}
