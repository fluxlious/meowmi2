// ---------------------------------------------------------------------------
// treats.js — the launcher and the treats it throws.
//
// The launcher is bolted to the camera, so aiming and looking are the same
// act. It fires at a FIXED angle and you control distance by how long you
// hold the button. Direction with the nub, distance with the charge.
//
// The landing marker is not a separate calculation. It runs the exact same
// physics as a real treat, just faster and invisibly. That way the preview
// can never disagree with what actually happens — which is a general trick
// worth remembering: predict by running the real simulation.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { CONFIG } from './config.js';

const T = CONFIG.treat;

export function createTreats(scene, ledges) {
  const live = [];

  // A flat disc, like a real cat biscuit, not a ball.
  const geo = new THREE.CylinderGeometry(T.radius, T.radius, T.radius * T.thickness, 10);
  const mat = new THREE.MeshLambertMaterial({ color: CONFIG.colors.kibble });

  // The landing marker: a flat ring on whatever surface the treat will hit.
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(T.radius * 2.2, T.radius * 3.1, 20),
    new THREE.MeshBasicMaterial({
      color: CONFIG.colors.marker,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthTest: false,
    })
  );
  marker.rotation.x = -Math.PI / 2;
  marker.renderOrder = 10;
  marker.visible = false;
  scene.add(marker);

  /**
   * Where does a treat come out, and how fast?
   * Both the real shot and the preview ask this, so they cannot drift apart.
   */
  function muzzle(camera, charge) {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();

    const pos = camera.position.clone()
      .addScaledVector(forward, T.muzzleForward);
    pos.y = T.muzzleHeight;

    // The launcher points a fixed amount ABOVE wherever the lens is looking,
    // so tilting the camera up lobs the treat higher. Clamped so a weird
    // angle can never produce a weird throw.
    const pitchDeg = (camera.rotation.x * 180) / Math.PI;
    const deg = Math.max(T.launchMin, Math.min(T.launchMax, pitchDeg + T.launchOffset));
    const rad = (deg * Math.PI) / 180;
    const speed = T.minSpeed + (T.maxSpeed - T.minSpeed) * charge;

    const vel = forward.clone().multiplyScalar(Math.cos(rad) * speed);
    vel.y = Math.sin(rad) * speed;

    return { pos, vel };
  }

  /** How high is the ground at (x, z)? The floor, unless something is there. */
  function groundAt(x, z) {
    let h = 0;
    for (const b of ledges) {
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
        if (b.top > h) h = b.top;
      }
    }
    return h;
  }

  /**
   * Advance one treat by dt. Used by real treats at frame rate and by the
   * preview in a tight loop.
   */
  function step(t, dt) {
    if (t.resting) return;

    t.vel.y -= T.gravity * dt;
    t.pos.addScaledVector(t.vel, dt);

    // --- walls: the room is axis-aligned, so this is just four clamps ------
    const halfW = CONFIG.room.width / 2 - T.radius;
    const halfD = CONFIG.room.depth / 2 - T.radius;
    if (t.pos.x < -halfW) { t.pos.x = -halfW; t.vel.x *= -T.bounce; }
    if (t.pos.x >  halfW) { t.pos.x =  halfW; t.vel.x *= -T.bounce; }
    if (t.pos.z < -halfD) { t.pos.z = -halfD; t.vel.z *= -T.bounce; }
    if (t.pos.z >  halfD) { t.pos.z =  halfD; t.vel.z *= -T.bounce; }

    // --- furniture: every box is treated as a flat top ---------------------
    // A descending treat over a box's footprint lands on it. Anything more
    // accurate than this is a lot of code for a difference nobody sees.
    const ground = groundAt(t.pos.x, t.pos.z) + T.radius;

    if (t.pos.y <= ground) {
      t.pos.y = ground;

      if (Math.abs(t.vel.y) > T.restSpeed) {
        t.vel.y *= -T.bounce;   // bounce
        t.bounced = true;
      } else {
        t.vel.y = 0;            // settled vertically, now roll
      }

      // Rolling friction, applied to the horizontal speed only.
      const drag = Math.max(0, 1 - T.friction * dt);
      t.vel.x *= drag;
      t.vel.z *= drag;

      const flat = Math.hypot(t.vel.x, t.vel.z);
      if (flat < T.restSpeed && t.vel.y === 0) {
        t.vel.set(0, 0, 0);
        t.resting = true;
      }
    }
  }

  return {
    /** Fire one treat. Charge is 0..1. */
    fire(camera, charge) {
      const { pos, vel } = muzzle(camera, charge);

      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.position.copy(pos);
      scene.add(mesh);

      const treat = {
        pos: pos.clone(), vel, mesh,
        resting: false, bounced: false,
        spin: (Math.random() - 0.5) * T.spin,
      };
      live.push(treat);

      // Retire the oldest rather than letting the floor fill up forever.
      if (live.length > T.maxInWorld) {
        const old = live.shift();
        scene.remove(old.mesh);
      }
      return treat;
    },

    /**
     * Run the real physics on a throwaway copy until it settles, and put the
     * marker where it stops. Returns nothing — it just moves the ring.
     */
    preview(camera, charge) {
      const { pos, vel } = muzzle(camera, charge);
      const ghost = { pos, vel, resting: false };

      // Fixed small steps, capped so a bad shot can never hang the frame.
      for (let i = 0; i < 600 && !ghost.resting; i++) step(ghost, 1 / 120);

      marker.position.set(ghost.pos.x, ghost.pos.y - T.radius + 0.004, ghost.pos.z);
      marker.visible = true;
    },

    hideMarker() {
      marker.visible = false;
    },

    /** Called every frame. Returns true if anything landed this frame. */
    update(dt) {
      let landed = false;
      for (const t of live) {
        if (t.resting) continue;
        const wasResting = t.resting;
        step(t, dt);
        t.mesh.position.copy(t.pos);

        // Tumble in the air, then settle flat once it stops.
        if (!t.resting) {
          t.mesh.rotation.x += t.spin * dt;
          t.mesh.rotation.z += t.spin * 0.6 * dt;
        } else {
          t.mesh.rotation.set(0, t.mesh.rotation.y, 0);
        }
        if (!wasResting && t.resting) landed = true;
        if (t.bounced) { landed = true; t.bounced = false; }
      }
      return landed;
    },
  };
}
