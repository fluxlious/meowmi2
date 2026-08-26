// ---------------------------------------------------------------------------
// config.js — every tunable number in the game lives here.
//
// The rule: if you ever want to *feel* something different (slower robot,
// longer throw, dirtier image), you change it here and nowhere else.
// Logic files should never contain a magic number.
// ---------------------------------------------------------------------------

export const CONFIG = {

  // The feed's real resolution: 20:9, matching the widescreen recess in the
  // chassis. Wider than a phone stream really is, but the game is played on
  // this picture, so the screen gets the real estate.
  // 480x270 was a leftover from the retro-LCD look, which is long gone. The
  // lens shader resamples the picture a second time, so a soft source got
  // softer — this renders sharp enough to survive that and still stay a
  // little mushy, like a real stream.
  lcd: {
    width: 1200,
    height: 540,
  },

  // The lens. A cheap wide-angle camera module, modelled honestly: it bends
  // straight lines, it fringes colour at the edges, and it darkens the corners.
  lens: {
    // The corner-fitting in the shader pins the centre AND the corners, so
    // only the difference in between is visible. That means barrel has to be
    // pushed a long way past what looks like a sensible number before the
    // bend actually shows. 0.42 gives roughly a 30% differential.
    barrel: 0.50,        // fisheye strength. 0 = perfectly rectilinear
    barrel2: 0.15,       // second-order term, bends the corners harder
    chroma: 0.013,       // colour fringing. Zero in the middle by construction
    vignette: 0.42,      // how dark the corners go
    vignetteSoft: 0.55,  // where the falloff starts, 0..1 from centre
    exposure: 1.15,      // tone mapping now happens in the shader, so it lives here
  },

  // The robot you drive. A floor robot: low, slow, no arms.
  robot: {
    eyeHeight: 0.34,
    radius: 0.26,
    moveSpeed: 1.7,    // metres per second
    turnSpeed: 2.0,    // radians per second
    accel: 7,

    // Tied to CONFIG.lens.barrel. The lens zooms in to keep the corners
    // filled, so raising barrel eats field of view and this has to give it
    // back. Tune the barrel first, then this by eye.
    fov: 93,

    precise: 0.4,      // hold Shift: everything slows to this fraction
    startPos: [0, 1.8],
    startAngle: Math.PI,
  },

  // The analog nub AIMS. The d-pad and WASD DRIVE. Keeping those two jobs on
  // separate controls is the whole point — one stick doing both was the mess.
  //
  // Push it in any direction: X pans, Y tilts. Pitch is clamped hard, because
  // a pet cam on a chassis can crane up a little and that is all. Letting it
  // look at the ceiling would only ever produce nonsense.
  aim: {
    deadzone: 0.14,    // ignore tiny wobbles near the centre
    curve: 1.7,        // >1 makes small pushes gentler. The "feel" knob
    yawSpeed: 1.9,     // radians per second at full deflection
    pitchSpeed: 1.0,
    accel: 5,          // how fast the servo spins up. LOW is what makes the
                       // camera feel motorised instead of mouse-driven
    mouseDeadzone: 0.18, // bigger than the nub's: resting the cursor near the
                       // middle of the picture should hold perfectly still
    pitchMin: -9,      // degrees. Slightly down, to see the floor near the wheels
    pitchMax: 30,      // degrees. Enough to see a counter top, not the ceiling
  },

  // The treat launcher. Fixed angle, variable power: you set direction with
  // the nub and distance by how long you hold the button.
  treat: {
    radius: 0.032,       // a small disc, the size of a real cat biscuit
    thickness: 0.42,     // as a fraction of the radius
    gravity: 9.2,

    // The launcher points slightly above wherever the lens is pointing, so
    // tilting the camera up genuinely lobs the treat higher. That is what
    // gets a treat onto a counter, and it makes the tilt part of the throw
    // rather than decoration.
    launchOffset: 17,    // degrees above the lens
    launchMin: 7,
    launchMax: 46,

    minSpeed: 2.5,
    maxSpeed: 7.4,
    chargeTime: 1.1,     // seconds of holding to reach full power
    muzzleForward: 0.24, // the launcher sits slightly ahead of the lens
    muzzleHeight: 0.30,
    spin: 9,             // tumble while airborne, radians per second
    bounce: 0.34,        // how much speed survives a bounce
    friction: 3.4,       // how fast it stops rolling
    restSpeed: 0.25,     // below this it is considered settled
    ammo: 5,
    cooldown: 0.5,       // spin-up between shots
    maxInWorld: 8,       // oldest treat is retired past this
  },

  // NOT WIRED YET — the socket for the level timer, so switching it on later
  // is a small change rather than a redesign. Drains faster while driving, so
  // standing still becomes a real strategy; firing is the biggest single hit.
  battery: {
    start: 5,            // percent, because the notification always comes late
    idleDrain: 0.05,     // percent per second
    driveDrain: 0.11,
    perTreat: 0.35,
  },

  // The flat, in metres. Boxes only — no modelling.
  room: {
    width: 8,
    depth: 10,
    height: 2.6,
  },

  // A flat somewhere hot: lime-plaster walls, oak floor, terracotta, sage.
  colors: {
    floor:     0xa9835c,
    wall:      0xe7e0d1,
    ceiling:   0xf1ece2,
    rug:       0xb4644a,
    sofa:      0x6f7c78,
    wood:      0x8a6a45,
    dark:      0x3b3833,
    metal:     0xc2bfb6,
    plant:     0x4f6c43,
    cat:       0xc9a87c,
    window:    0xfff9ee,
    ceramic:   0xe9e3d7,
    kibble:    0xe0b877,
    marker:    0xff3b30,   // the landing ring. Everything you control is red
  },

  // Hard afternoon sun through one window, cool bounce everywhere else.
  light: {
    ambient: 0.62,
    windowIntensity: 1.5,
    cameraLamp: 0.18,
  },
};
