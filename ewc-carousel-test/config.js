// Everything you'd want to edit lives here: the project list + all tunables.
// All of it can also be tweaked live via the lil-gui panel (see gui.js).

// Images shown in the carousel. src is relative to /public. Leave aspect as
// null to auto-measure from the image; panels are all PANEL_H tall and get
// their width from the aspect ratio, so nothing is cropped or stretched.
export const PROJECTS = [
  ["@jeremy.delobel_18072026_130034.webp", 1000, 667],
  ["@jeremy.delobel_19072026_120030.webp", 867, 1300],
  ["@jeremy.delobel_18072026_150701.webp", 1000, 667],
  ["@jeremy.delobel_19072026_120040.webp", 1000, 667],
  ["@jeremy.delobel_19072026_150701.webp", 1000, 667],
  ["@jeremy.delobel_18072026_130018.webp", 867, 1300],
  ["@jeremy.delobel_18072026_153854.webp", 1000, 667],
  ["@jeremy.delobel_19072026_175809.webp", 1000, 667],
  ["@jeremy.delobel_19072026_180039.webp", 867, 1300],
  ["@jeremy.delobel_19072026_175733.webp", 1000, 667],
  ["@jeremy.delobel_19072026_180202.webp", 1000, 667],
  ["@jeremy.delobel_19072026_151044.webp", 867, 1300],
  ["@jeremy.delobel_17072026_165923.webp", 1000, 667],
  ["@jeremy.delobel_17072026_170008.webp", 1000, 667],
  ["@jeremy.delobel_09072026_211521.webp", 1000, 667],
  ["@jeremy.delobel_09072026_211410.webp", 867, 1300],
  ["@jeremy.delobel_09072026_212053.webp", 1000, 667],
  ["@jeremy.delobel_09072026_211848-2.webp", 1000, 667],
  ["@jeremy.delobel_12072026_193753.webp", 1000, 667],
  ["@jeremy.delobel_12072026_193853.webp", 867, 1300],
  ["@jeremy.delobel_12072026_195114.webp", 1000, 667],
  ["@jeremy.delobel_12072026_193932.webp", 1000, 667],
  ["@jeremy.delobel_12072026_195442.webp", 867, 1300],
  ["@jeremy.delobel_12072026_193500.webp", 1000, 667],
  ["@jeremy.delobel_09072026_200824.webp", 1000, 667],
  ["@jeremy.delobel_09072026_212116.webp", 867, 1300],
  ["@jeremy.delobel_10072026_142157.webp", 867, 1300],
  ["@jeremy.delobel_09072026_212124.webp", 1000, 563],
  ["@jeremy.delobel_10072026_141040.webp", 867, 1300],
  ["@jeremy.delobel_09072026_211942.webp", 1000, 667],
  ["@jeremy.delobel_09072026_173349.webp", 1000, 667],
  ["@jeremy.delobel_09072026_165849.webp", 1000, 563],
].map(([file, width, height]) => ({
  src: `/rsrc/photos/esports-world-cup-2026/${file}`,
  aspect: width / height,
  brand: "Esports World Cup 2026",
  desc: "For EsportNews",
}));

// Layout + scroll feel. A physical wheel notch advances exactly one panel.
// Smooth trackpad bursts are grouped into one gesture, then the row glides
// directly to the chosen panel center without a late magnetic correction.
export const CONFIG = {
  PANEL_H: 450, // px height — same for every panel
  GAP: 12, // px gap between panels
  EASE: 0.06, // lerp toward the next panel (lower = softer / more glide)
  WHEEL_NOTCH_PX: 40, // deltas above this are discrete mouse-wheel notches
  TRACKPAD_STEP_PX: 24, // accumulated smooth-wheel movement before one step
  WHEEL_GESTURE_GAP: 140, // ms of silence that starts a new smooth gesture
  SHRINK_MAX: 60, // scroll speed (px/frame) that = full 25% shrink
  SHRINK_ATTACK: 0.25, // how fast panels shrink when speeding up
  SHRINK_DECAY: 0.06, // how fast they grow back when settling
};

// The liquid-glass lens (fullscreen post-process). Ported from a hero
// explosion shader, hence some of the exotic knob names.
export const LENS = {
  shape: "circle", // 'circle' (ellipse) | 'square' (rectangle)
  squareRound: 0, // corner rounding for rectangle (0 sharp .. 1 very round)
  rotation: 65, // static rotation in degrees
  spin: 0, // auto-spin speed (deg/sec, 0 = off)
  sizeX: 0.565, // half-width (fraction of viewport height)
  sizeY: 1, // half-height (fraction of viewport height)
  posX: 0.5, // center x in screen-UV (0 left .. 1 right)
  posY: 0.5, // center y in screen-UV (0 bottom .. 1 top)
  zoom: 0, // inward pull strength
  dispersion: 11, // chromatic dispersion
  blur: 0.0, // blur amount (px)
  glow: 4.2, // overall glow multiplier
  whiteGlow: 0, // keep the undistorted lens interior color-neutral
  novaSize: 12, // nova size
  blueRing: 6, // blue ring intensity
  ringRadius: 0.49, // ring radius (0..0.5)
  ringWidth: 0.014, // ring width
  shimmer: true, // animated ring shimmer
  shimmerFreq: 12, // shimmer wave count around the ring
  shimmerSpeed: 3.5, // shimmer animation speed
  shimmerDepth: 0.12, // shimmer intensity (0 = none .. 0.5 = strong)
  rimStart: 0.578, // where the rim fluid wave begins
  rimTangential: 0.6, // tangential fluid-wave displacement
  rimInward: 0, // extra inward pull at the rim
  rimFreq1: 2, // fluid wave frequency 1
  rimFreq2: 1, // fluid wave frequency 2
  blueColor: "#009dff", // the soul: blue tint / ring color
  rimLine: 1.4, // bright white border line intensity (0 = off)
  rimLinePos: 0.488, // where the white border sits (0..0.5)
  rimLineWidth: 0.003, // sharpness of the white border
  vignette: 0, // overall screen vignette strength (0 = off)
  vignetteSize: 0.3, // how far in the vignette reaches
  samples: 16, // dispersion samples
};

// Focus mode: click an image -> it centers and enlarges, everything else
// sweeps down out of view, the lens distortion fades away.
export const FOCUS = {
  cardDuration: 0.7, // seconds for the OTHER cards to drop
  focusDuration: 0.9, // seconds for the MAIN card to scale into focus
  cardEase: "power4.out",
  focusEase: "power3.out",
  stagger: 0.06, // seconds between successive panels leaving (center-out)
  dropDist: 1.4, // how far panels drop, as a fraction of viewport height
  centerScale: 1.18, // how much the focused image grows when alone
  lensFade: 0.85, // seconds for the lens props to ramp to invisible
};

// Entry animation (auto on load): panels rise from below at a small size,
// hold, then grow to full size while the lens blooms back in.
export const ENTRY = {
  enabled: true,
  delay: 0.5, // seconds before the entry begins
  startH: 80, // px height each panel starts at
  riseDuration: 1.0, // seconds for a panel to rise into place
  stagger: 0.07, // seconds between panels rising
  riseEase: "power3.out",
  fromBelow: 0.9, // start offset below screen, as a fraction of viewport H
  growDelay: 0.25, // seconds to wait after the rise before growing
  growDuration: 2.15, // seconds for each panel to grow to full size
  growEase: "expo.inOut",
  growStagger: 0.085, // seconds between successive panels growing
  growDir: "inward", // "outward" = center grows first, "inward" = edges first
  lensBloom: 1.4, // seconds for the lens effect to fade back in
  lensBloomEase: "power2.inOut",
};

// Overlay text transitions (heading + counter), animated in the React layer.
export const UI_ANIM = {
  duration: 0.4, // seconds (focus transitions)
  ease: "power3.out",
  topShiftVh: -5, // how far the top text moves (vh) when focused
  revealDuration: 1.6, // fade-in once the entry settles
  revealEase: "power2.out",
  revealStagger: 0.18, // counter follows the top text by this delay
};
