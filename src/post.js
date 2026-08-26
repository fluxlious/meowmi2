// ---------------------------------------------------------------------------
// post.js — the lens.
//
// Post-processing sounds complicated and is not. It is two steps:
//
//   1. render the scene into a TEXTURE instead of onto the screen
//   2. draw that texture onto one big rectangle, through a shader that is
//      allowed to move and recolour every pixel on the way past
//
//   scene --render--> WebGLRenderTarget --sample--> fullscreen quad --> canvas
//
// Built by hand rather than with EffectComposer. It is about forty lines, it
// adds no dependencies, and it means you can see exactly what is happening.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { CONFIG } from './config.js';

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  // The quad is a 2x2 plane centred on the origin, which is already exactly
  // the clip-space cube. So no camera or matrices are needed at all.
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;

uniform sampler2D tDiffuse;
uniform vec2  uSize;
uniform float uK1;
uniform float uK2;
uniform float uChroma;
uniform float uVignette;
uniform float uVigSoft;
uniform float uExposure;

varying vec2 vUv;

// Barrel distortion, the standard Brown-Conrady model with its first two terms.
//
// Note which way round this works: we are not moving pixels outward, we are
// deciding, for the pixel we are drawing, WHERE TO READ FROM. Reading from
// further out as you go from the centre means the middle of the picture ends
// up magnified relative to the edges — which is what a wide lens does.
vec2 distort(vec2 uv, float aspect, float scale) {
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);   // aspect-correct or it goes oval
  float r2 = dot(p, p);
  p *= (1.0 + uK1 * r2 + uK2 * r2 * r2) * scale;
  p /= vec2(aspect, 1.0);
  return p + 0.5;
}

// ACES filmic curve (Narkowicz's cheap fit). Rendering into a texture skips
// Three's own tone mapping, so the highlight rolloff has to happen here or the
// sunlit window clips to flat white.
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

// And the sRGB encode, skipped for the same reason. Without this the whole
// picture comes out noticeably dark — linear values sent straight to a display
// that expects sRGB.
vec3 encodeSRGB(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(0.4166667)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

void main() {
  float aspect = uSize.x / uSize.y;

  // Sampling outside the texture gives smeared or black edges. Instead of
  // clamping and hoping, work out how far the corner gets pushed and scale
  // everything back by exactly that much — so the corners land precisely on
  // the frame edge. Derived from uK1/uK2, so it stays correct when they change.
  vec2 corner = vec2(0.5 * aspect, 0.5);
  float rMax2 = dot(corner, corner);
  float scale = 1.0 / (1.0 + uK1 * rMax2 + uK2 * rMax2 * rMax2);

  // Chromatic aberration: read each colour channel at a slightly different
  // scale. Because the offset is multiplied by distance from centre, the
  // fringing is zero in the middle and grows toward the edges all by itself —
  // which is exactly how a real cheap wide lens fails.
  vec2 uvR = distort(vUv, aspect, scale * (1.0 + uChroma));
  vec2 uvG = distort(vUv, aspect, scale);
  vec2 uvB = distort(vUv, aspect, scale * (1.0 - uChroma));

  vec3 col;
  col.r = texture2D(tDiffuse, uvR).r;
  col.g = texture2D(tDiffuse, uvG).g;
  col.b = texture2D(tDiffuse, uvB).b;

  // Vignette, applied while the values are still linear — that is where light
  // actually falls off, and doing it after the curve crushes the corners.
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float r = length(p) / length(corner);
  col *= 1.0 - uVignette * smoothstep(uVigSoft, 1.06, r);

  col = aces(col * uExposure);
  col = encodeSRGB(col);

  gl_FragColor = vec4(col, 1.0);
}
`;

export function createPost(renderer, width, height) {
  const L = CONFIG.lens;

  // The texture the scene is drawn into, kept deliberately LINEAR.
  //
  // Three skips both tone mapping and sRGB encoding when rendering into a
  // render target — they only ever happen on the final pass to the canvas.
  // So this holds raw linear light, and the shader above does the tone curve
  // and the encode itself. Getting this wrong is what makes a post-processed
  // image come out mysteriously dark.
  const target = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
  });
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse:  { value: target.texture },
      uSize:     { value: new THREE.Vector2(width, height) },
      uK1:       { value: L.barrel },
      uK2:       { value: L.barrel2 },
      uChroma:   { value: L.chroma },
      uVignette: { value: L.vignette },
      uVigSoft:  { value: L.vignetteSoft },
      uExposure: { value: L.exposure },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
  });

  // One rectangle, built once, reused every frame.
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCamera = new THREE.Camera();

  return {
    /** Drop-in replacement for renderer.render(scene, camera). */
    render(scene, camera) {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);

      // Back to the canvas BEFORE the final draw, or the picture is written
      // into the texture again and the screen stays black.
      renderer.setRenderTarget(null);
      renderer.render(quadScene, quadCamera);
    },

    /** Exposed so values can be poked from the console while tuning. */
    uniforms: material.uniforms,
  };
}
