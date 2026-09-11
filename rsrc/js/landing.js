"use strict";

const photographySources = Object.freeze([
  "./rsrc/photos-fullres/esports-world-cup-2026/@jeremy.delobel_09072026_165849.jpg",
  "./rsrc/photos-fullres/esports-world-cup-2026/@jeremy.delobel_09072026_173349.jpg",
  "./rsrc/photos-fullres/esports-world-cup-2026/@jeremy.delobel_09072026_200824.jpg",
  "./rsrc/photos-fullres/esports-world-cup-2026/@jeremy.delobel_09072026_211521.jpg",
  "./rsrc/photos-fullres/esports-world-cup-2026/@jeremy.delobel_09072026_211848-2.jpg",
  "./rsrc/photos-fullres/esports-world-cup-2026/@jeremy.delobel_09072026_211942.jpg",
  "./rsrc/photos-fullres/esports-world-cup-2026/@jeremy.delobel_09072026_212053.jpg",
  "./rsrc/photos-fullres/esports-world-cup-2026/@jeremy.delobel_09072026_212124.jpg",
  "./rsrc/photos-fullres/esports-world-cup-2026/@jeremy.delobel_12072026_193500.jpg",
  "./rsrc/photos-fullres/esports-world-cup-2026/@jeremy.delobel_12072026_193753.jpg",
  "./rsrc/photos-fullres/esports-world-cup-2026/@jeremy.delobel_12072026_193932.jpg",
  "./rsrc/photos-fullres/esports-world-cup-2026/@jeremy.delobel_12072026_195114.jpg",
  "./rsrc/photos-fullres/rlcs-paris-major-2026/@jeremy.delobel_24052026_175741.jpg",
  "./rsrc/photos-fullres/rlcs-paris-major-2026/@jeremy.delobel_24052026_181701.jpg",
  "./rsrc/photos-fullres/rlcs-paris-major-2026/@jeremy.delobel_24052026_211504.jpg",
  "./rsrc/photos-fullres/rlcs-paris-major-2026/@jeremy.delobel_24052026_211618.jpg",
  "./rsrc/photos-fullres/rlcs-paris-major-2026/@jeremy.delobel_24052026_212602.jpg",
  "./rsrc/photos-fullres/rlcs-paris-major-2026/@jeremy.delobel_24052026_212643.jpg",
  "./rsrc/photos-fullres/rlcs-paris-major-2026/@jeremy.delobel_24052026_212927.jpg",
  "./rsrc/photos-fullres/editing-con-paris-2026/@jeremy.delobel_15022026_133629.jpg",
  "./rsrc/photos-fullres/editing-con-paris-2026/@jeremy.delobel_15022026_160914.jpg",
  "./rsrc/photos-fullres/editing-con-paris-2026/@jeremy.delobel_15022026_171313.jpg",
  "./rsrc/photos-fullres/editing-con-paris-2026/@jeremy.delobel_15022026_185303.jpg",
  "./rsrc/photos-fullres/paris-games-week-2025/A7404435_JérémyDelobel_2025.jpg",
  "./rsrc/photos-fullres/paris-games-week-2025/A7404644_JérémyDelobel_2025.jpg",
  "./rsrc/photos-fullres/paris-games-week-2025/A7404964_JérémyDelobel_2025.jpg",
  "./rsrc/photos-fullres/paris-games-week-2025/A7404967_JérémyDelobel_2025.jpg",
  "./rsrc/photos-fullres/paris-games-week-2025/A7405910_JérémyDelobel_2025.jpg",
  "./rsrc/photos-fullres/paris-games-week-2025/A7406101_JérémyDelobel_2025.jpg",
  "./rsrc/photos-fullres/paris-games-week-2025/A7407151_JérémyDelobel_2025.jpg",
]);

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const pointerCanHover = window.matchMedia("(hover: hover) and (pointer: fine)");
const landing = document.querySelector(".landing-v2");
const panels = Array.from(document.querySelectorAll(".landing-v2-panel"));
const videos = Array.from(document.querySelectorAll(".landing-v2-video"));
const slideshow = document.querySelector("[data-photography-slideshow]");
const slideshowImages = slideshow
  ? Array.from(slideshow.querySelectorAll(".landing-v2-photo"))
  : [];

let slideshowQueue = [];
let slideshowActiveIndex = 0;
let slideshowCurrentSource = photographySources[0] || "";
let slideshowTimer = 0;
let slideshowIsChanging = false;
let slideshowPreloadedSource = "";
let slideshowPreloader = null;
let magneticAnimationFrame = 0;

const magneticPanels = panels.map((panel) => ({
  element: panel,
  currentX: 0,
  targetX: 0,
  currentInfluence: 0,
  targetInfluence: 0,
}));

const clamp = (value, minimum, maximum) =>
  Math.min(Math.max(value, minimum), maximum);

const animateMagneticPanels = () => {
  let shouldContinue = false;

  magneticPanels.forEach((panel) => {
    panel.currentInfluence +=
      (panel.targetInfluence - panel.currentInfluence) * 0.055;

    if (
      Math.abs(panel.targetInfluence - panel.currentInfluence) <= 0.001
    ) {
      panel.currentInfluence = panel.targetInfluence;
    }

    const softenedTargetX = panel.targetX * panel.currentInfluence;
    panel.currentX += (softenedTargetX - panel.currentX) * 0.065;

    if (Math.abs(softenedTargetX - panel.currentX) <= 0.02) {
      panel.currentX = softenedTargetX;
    }

    if (
      Math.abs(panel.targetInfluence - panel.currentInfluence) > 0.001 ||
      Math.abs(softenedTargetX - panel.currentX) > 0.02
    ) {
      shouldContinue = true;
    }

    panel.element.style.setProperty(
      "--landing-v2-magnet-x",
      `${panel.currentX.toFixed(2)}px`
    );
  });

  magneticAnimationFrame = shouldContinue
    ? window.requestAnimationFrame(animateMagneticPanels)
    : 0;
};

const requestMagneticAnimation = () => {
  if (!magneticAnimationFrame) {
    magneticAnimationFrame = window.requestAnimationFrame(
      animateMagneticPanels
    );
  }
};

const resetMagneticPanel = (panel, immediate = false) => {
  panel.targetInfluence = 0;

  if (immediate) {
    panel.targetX = 0;
    panel.currentX = 0;
    panel.currentInfluence = 0;
    panel.element.style.setProperty("--landing-v2-magnet-x", "0px");
    return;
  }

  requestMagneticAnimation();
};

const resetMagneticOffsets = (immediate = false) => {
  if (immediate && magneticAnimationFrame) {
    window.cancelAnimationFrame(magneticAnimationFrame);
    magneticAnimationFrame = 0;
  }

  magneticPanels.forEach((panel) => resetMagneticPanel(panel, immediate));
};

const updateMagneticTarget = (panel, clientX) => {
  const rect = panel.element.getBoundingClientRect();

  if (rect.width <= 0) {
    return;
  }

  const normalizedX = clamp(
    (clientX - (rect.left + rect.width / 2)) / (rect.width / 2),
    -1,
    1
  );

  panel.targetX = normalizedX * Math.min(36, rect.width * 0.1);
};

const updateMagneticTargetsFromMouse = (clientX, clientY) => {
  if (!pointerCanHover.matches || reducedMotion.matches) {
    resetMagneticOffsets(true);
    return;
  }

  let hoveredPanel = null;

  magneticPanels.forEach((panel) => {
    const rect = panel.element.getBoundingClientRect();
    const containsPointer =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;

    if (containsPointer) {
      hoveredPanel = panel;
    }
  });

  magneticPanels.forEach((panel) => {
    if (panel === hoveredPanel) {
      panel.targetInfluence = 1;
      updateMagneticTarget(panel, clientX);
    } else {
      panel.targetInfluence = 0;
    }
  });

  requestMagneticAnimation();
};

const shuffle = (items) => {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }

  return items;
};

const refillSlideshowQueue = () => {
  slideshowQueue = shuffle(photographySources.slice());

  if (
    slideshowQueue.length > 1 &&
    slideshowQueue[0] === slideshowCurrentSource
  ) {
    [slideshowQueue[0], slideshowQueue[1]] = [
      slideshowQueue[1],
      slideshowQueue[0],
    ];
  }
};

const takeNextSlideshowSource = () => {
  if (!slideshowQueue.length) {
    refillSlideshowQueue();
  }

  return slideshowQueue.shift() || "";
};

const prepareNextSlideshowImage = () => {
  if (slideshowPreloadedSource || photographySources.length < 2) {
    return;
  }

  slideshowPreloadedSource = takeNextSlideshowSource();
  slideshowPreloader = new Image();
  slideshowPreloader.decoding = "async";
  slideshowPreloader.src = slideshowPreloadedSource;
};

const clearSlideshowTimer = () => {
  window.clearTimeout(slideshowTimer);
  slideshowTimer = 0;
};

const scheduleNextSlideshowImage = (delay = 2000) => {
  clearSlideshowTimer();

  if (
    document.hidden ||
    reducedMotion.matches ||
    slideshowImages.length < 2 ||
    photographySources.length < 2
  ) {
    return;
  }

  slideshowTimer = window.setTimeout(() => {
    void showNextSlideshowImage();
  }, delay);
};

const showNextSlideshowImage = async () => {
  if (
    slideshowIsChanging ||
    document.hidden ||
    reducedMotion.matches ||
    slideshowImages.length < 2
  ) {
    return;
  }

  slideshowIsChanging = true;
  const source = slideshowPreloadedSource || takeNextSlideshowSource();
  slideshowPreloadedSource = "";
  slideshowPreloader = null;

  const nextIndex = slideshowActiveIndex === 0 ? 1 : 0;
  const nextImage = slideshowImages[nextIndex];
  const previousImage = slideshowImages[slideshowActiveIndex];

  nextImage.classList.remove("is-active");
  nextImage.src = source;

  try {
    await nextImage.decode();
  } catch {
    if (!nextImage.complete || nextImage.naturalWidth === 0) {
      nextImage.removeAttribute("src");
      slideshowIsChanging = false;
      prepareNextSlideshowImage();
      scheduleNextSlideshowImage(250);
      return;
    }
  }

  window.requestAnimationFrame(() => {
    if (document.hidden || reducedMotion.matches) {
      slideshowIsChanging = false;

      if (reducedMotion.matches) {
        resetSlideshowToFirstImage();
      }

      return;
    }

    nextImage.classList.add("is-active");
    previousImage.classList.remove("is-active");
    slideshowActiveIndex = nextIndex;
    slideshowCurrentSource = source;
    slideshowIsChanging = false;
    prepareNextSlideshowImage();
    scheduleNextSlideshowImage();
  });
};

const playVideos = () => {
  if (document.hidden || reducedMotion.matches) {
    return;
  }

  videos.forEach((video) => {
    const playPromise = video.play();

    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  });
};

const pauseVideos = () => {
  videos.forEach((video) => {
    video.pause();
  });
};

const resetSlideshowToFirstImage = () => {
  if (!slideshowImages.length || !photographySources.length) {
    return;
  }

  slideshowImages[0].src = photographySources[0];
  slideshowImages.forEach((image, index) => {
    image.classList.toggle("is-active", index === 0);
  });
  slideshowActiveIndex = 0;
  slideshowCurrentSource = photographySources[0];
  slideshowIsChanging = false;
  slideshowQueue = [];
  slideshowPreloadedSource = "";
  slideshowPreloader = null;
};

const syncMotionPreference = () => {
  document.documentElement.classList.toggle(
    "is-reduced-motion",
    reducedMotion.matches
  );

  if (reducedMotion.matches) {
    clearSlideshowTimer();
    pauseVideos();
    resetSlideshowToFirstImage();
    resetMagneticOffsets(true);
    return;
  }

  prepareNextSlideshowImage();
  scheduleNextSlideshowImage();
  playVideos();
};

magneticPanels.forEach((panel) => {
  panel.element.addEventListener("focus", () => {
    resetMagneticPanel(panel);
  });
});

window.addEventListener(
  "mousemove",
  (event) => {
    updateMagneticTargetsFromMouse(event.clientX, event.clientY);
  },
  { passive: true }
);

window.addEventListener("mouseout", (event) => {
  if (!event.relatedTarget) {
    resetMagneticOffsets();
  }
});

window.addEventListener("pointercancel", () => resetMagneticOffsets());
window.addEventListener("blur", () => resetMagneticOffsets());
pointerCanHover.addEventListener("change", () => resetMagneticOffsets(true));

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearSlideshowTimer();
    pauseVideos();
    return;
  }

  syncMotionPreference();
});

reducedMotion.addEventListener("change", syncMotionPreference);
syncMotionPreference();
