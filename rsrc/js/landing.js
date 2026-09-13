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
let landingIsReady = false;
let landingEntryController = null;
let activeLoader = null;

const loadingCommands = Object.freeze([
  "> PREMIERE PRO --ASSEMBLE TIMELINE",
  "> AFTER EFFECTS --CACHE KEYFRAMES",
  "> LIGHTROOM CLASSIC --DEVELOP RAW",
  "> PREMIERE PRO --SYNC AUDIO",
  "> AFTER EFFECTS --RENDER COMPOSITION",
  "> LIGHTROOM CLASSIC --EXPORT STILLS",
]);

const createLandingLoader = (visible) => {
  const element = document.querySelector(".landing-loader");
  const command = element.querySelector(".landing-loader__command");
  const track = element.querySelector(".landing-loader__track");
  const fill = element.querySelector(".landing-loader__progress");
  const timers = new Set();
  let commandQueue = [];
  let previousCommand = "";
  let progressFrame = 0;
  let target = 0;
  let displayed = 0;
  let previousTime = 0;
  let stopped = false;
  let finishResolve = null;

  element.hidden = !visible;
  element.closest(".page-transition").setAttribute("aria-hidden", String(!visible));
  command.replaceChildren();
  fill.style.transform = "scaleX(0)";
  track.setAttribute("aria-valuenow", "0");

  const later = (callback, delay) => {
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      callback();
    }, delay);
    timers.add(timer);
  };

  const stopCommands = () => {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers.clear();
    command.querySelectorAll(".landing-loader__character").forEach((character) => {
      character.style.opacity = window.getComputedStyle(character).opacity;
      character.getAnimations().forEach((animation) => animation.cancel());
    });
  };

  const takeNextCommand = () => {
    if (!commandQueue.length) {
      commandQueue = shuffle(loadingCommands.slice());
      if (commandQueue[0] === previousCommand) {
        [commandQueue[0], commandQueue[1]] = [commandQueue[1], commandQueue[0]];
      }
    }
    previousCommand = commandQueue.shift();
    return previousCommand;
  };

  const showCommand = () => {
    if (stopped || !visible) return;
    const line = document.createElement("span");
    line.className = "landing-loader__line";
    const characters = Array.from(takeNextCommand(), (letter) => {
      const character = document.createElement("span");
      character.className = "landing-loader__character";
      character.textContent = letter;
      line.appendChild(character);
      return character;
    });
    command.appendChild(line);
    characters.forEach((character, position) => {
      character.animate({ opacity: [0, 1] }, {
        duration: 40, delay: position * 12, fill: "forwards",
      });
    });
    const sweepDuration = (characters.length - 1) * 12 + 40;
    later(() => {
      characters.forEach((character, position) => {
        character.animate({ opacity: [1, 0] }, {
          duration: 40, delay: position * 12, fill: "forwards",
        });
      });
      later(showCommand, 80);
      later(() => {
        line.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
        line.remove();
      }, sweepDuration);
    }, sweepDuration + 300);
  };

  const syncCommands = () => {
    stopCommands();
    command.replaceChildren();
    if (stopped || !visible) return;
    if (reducedMotion.matches) {
      command.textContent = takeNextCommand();
    } else {
      showCommand();
    }
  };

  const paintProgress = (time) => {
    const elapsed = previousTime ? Math.min(time - previousTime, 64) : 16;
    previousTime = time;
    displayed = reducedMotion.matches
      ? target
      : displayed + (target - displayed) * (1 - Math.exp(-elapsed / 85));
    if (target - displayed < 0.001) displayed = target;
    fill.style.transform = `scaleX(${displayed})`;
    track.setAttribute("aria-valuenow", String(Math.round(displayed * 100)));
    progressFrame = displayed < target ? requestAnimationFrame(paintProgress) : 0;
    if (displayed === 1) {
      finishResolve?.();
      finishResolve = null;
    }
  };

  const progress = (value) => {
    target = Math.max(target, Math.min(value, 1));
    if (visible && !progressFrame) {
      previousTime = 0;
      progressFrame = requestAnimationFrame(paintProgress);
    }
  };

  reducedMotion.addEventListener("change", syncCommands);
  syncCommands();

  return {
    progress,
    finish() {
      stopped = true;
      stopCommands();
      if (!visible) return Promise.resolve();
      return new Promise((resolve) => {
        finishResolve = resolve;
        progress(1);
      });
    },
    dispose() {
      stopped = true;
      stopCommands();
      cancelAnimationFrame(progressFrame);
      reducedMotion.removeEventListener("change", syncCommands);
      finishResolve?.();
      finishResolve = null;
    },
  };
};

const waitForAsset = (promise, signal, timeout = 15000) => new Promise((resolve, reject) => {
  let timer;
  const finish = (error, value) => {
    window.clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    if (error) reject(error);
    else resolve(value);
  };
  const abort = () => finish(signal.reason);
  timer = window.setTimeout(() => finish(new Error("Media preparation timed out")), timeout);
  signal.addEventListener("abort", abort, { once: true });
  Promise.resolve(promise).then((value) => finish(null, value), (error) => finish(error));
  if (signal.aborted) abort();
});

const useVideoPoster = (video) => {
  video.pause();
  video.classList.add("is-media-fallback");
};

const prepareLandingImage = async (image, signal) => {
  try {
    await waitForAsset(image.decode(), signal);
    image.classList.remove("is-media-fallback");
  } catch (error) {
    if (signal.aborted) throw error;
    image.classList.add("is-media-fallback");
  }
};

const prepareVideoBuffer = (video, report, signal) => new Promise((resolve, reject) => {
  let lastProgress = performance.now();
  let previousBuffered = 0;
  let timer = 0;
  let finished = false;
  const cleanup = () => {
    window.clearInterval(timer);
    video.removeEventListener("error", fail, true);
    signal.removeEventListener("abort", abort);
  };
  const finish = (fallback = false) => {
    if (finished) return;
    finished = true;
    cleanup();
    if (fallback) useVideoPoster(video);
    report(1);
    resolve();
  };
  const fail = () => finish(true);
  const abort = () => {
    finished = true;
    cleanup();
    reject(signal.reason);
  };
  const inspect = () => {
    if (reducedMotion.matches || video.classList.contains("is-media-fallback")) {
      finish();
      return;
    }
    if (video.error || video.networkState === video.NETWORK_NO_SOURCE) {
      fail();
      return;
    }
    const duration = video.duration;
    const remaining = Number.isFinite(duration) ? duration - video.currentTime : 4;
    const target = Math.min(4, Math.max(remaining, 0.1));
    let bufferedAhead = 0;
    let totalBuffered = 0;
    for (let index = 0; index < video.buffered.length; index += 1) {
      const start = video.buffered.start(index);
      const end = video.buffered.end(index);
      totalBuffered += end - start;
      if (start <= video.currentTime + 0.05 && end > video.currentTime) {
        bufferedAhead = end - video.currentTime;
      }
    }
    if (totalBuffered > previousBuffered + 0.01 || document.hidden) {
      lastProgress = performance.now();
      previousBuffered = totalBuffered;
    }
    report(Math.min(bufferedAhead / target, 1));
    if (bufferedAhead >= target - 0.05 && video.readyState >= 3) {
      finish();
    } else if (performance.now() - lastProgress >= 15000) {
      fail();
    }
  };

  video.pause();
  video.preload = "auto";
  video.addEventListener("error", fail, true);
  signal.addEventListener("abort", abort, { once: true });
  timer = window.setInterval(inspect, 200);
  if (signal.aborted) abort();
  else inspect();
});

const waitForVisibleLanding = (signal) => new Promise((resolve, reject) => {
  const cleanup = () => {
    document.removeEventListener("visibilitychange", check);
    signal.removeEventListener("abort", abort);
  };
  const check = () => {
    if (document.hidden) return;
    cleanup();
    resolve();
  };
  const abort = () => { cleanup(); reject(signal.reason); };
  document.addEventListener("visibilitychange", check);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  else check();
});

const startPreparedVideo = async (video, signal) => {
  if (reducedMotion.matches || video.classList.contains("is-media-fallback")) return;
  let frameCallback = 0;
  let releaseFrame;
  const motionChanged = () => {
    if (reducedMotion.matches) { video.pause(); releaseFrame?.(); }
  };
  try {
    const firstFrame = new Promise((resolve) => {
      releaseFrame = resolve;
      frameCallback = video.requestVideoFrameCallback(resolve);
    });
    reducedMotion.addEventListener("change", motionChanged);
    await waitForAsset(Promise.all([firstFrame, video.play()]), signal);
  } catch (error) {
    if (signal.aborted) throw error;
    useVideoPoster(video);
  } finally {
    video.cancelVideoFrameCallback(frameCallback);
    reducedMotion.removeEventListener("change", motionChanged);
  }
};

const openLanding = async ({ restored = false } = {}) => {
  landingEntryController?.abort();
  activeLoader?.dispose();
  landingEntryController = new AbortController();
  const { signal } = landingEntryController;
  landingIsReady = false;
  const showLoader = !restored && !window.PageTransition.consumeCategoryReturn();
  const loader = createLandingLoader(showLoader);
  const loadingStartedAt = performance.now();
  const waitForMinimumLoading = async () => {
    const remaining = showLoader ? 500 - (performance.now() - loadingStartedAt) : 0;
    if (remaining > 0) {
      await waitForAsset(new Promise((resolve) => window.setTimeout(resolve, remaining)), signal);
    }
  };
  activeLoader = loader;
  void window.PageTransition.cover({ immediate: true });
  const stages = [0, 0, 0, 0];
  const report = (index, value) => {
    if (signal.aborted) return;
    stages[index] = Math.max(stages[index], value);
    loader.progress((stages[0] * 0.4 + stages[1] * 0.4 + stages[2] * 0.1 + stages[3] * 0.1) * 0.96);
  };

  try {
    const posters = videos.map((video) => {
      const poster = new Image();
      poster.src = video.poster;
      return prepareLandingImage(poster, signal);
    });
    const fonts = waitForAsset(Promise.all([
      document.fonts.load('400 12px "JetBrains Mono"'),
      document.fonts.load('300 27.6px "forma-djr-micro"'),
    ]), signal).catch((error) => { if (signal.aborted) throw error; });

    await Promise.all([
      ...videos.map((video, index) => prepareVideoBuffer(video, (value) => report(index, value), signal)),
      prepareLandingImage(slideshowImages[slideshowActiveIndex], signal).then(() => report(2, 1)),
      Promise.all([...posters, fonts]).then(() => report(3, 1)),
    ]);
    await waitForVisibleLanding(signal);
    await Promise.all(videos.map((video) => startPreparedVideo(video, signal)));
    loader.progress(1);
    await waitForMinimumLoading();
    await loader.finish();
    if (signal.aborted) return;
    await window.PageTransition.reveal();
    if (signal.aborted) return;
    landingIsReady = true;
    loader.dispose();
    syncMotionPreference();
  } catch (error) {
    if (signal.aborted) return;
    console.error("Unable to prepare landing media:", error);
    videos.forEach(useVideoPoster);
    await waitForMinimumLoading().catch(() => {});
    loader.dispose();
    if (signal.aborted) return;
    await window.PageTransition.reveal();
    if (!signal.aborted) {
      landingIsReady = true;
      syncMotionPreference();
    }
  }
};

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
  if (!landingIsReady || !pointerCanHover.matches || reducedMotion.matches) {
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
    !landingIsReady ||
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
    !landingIsReady ||
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
    if (!landingIsReady || document.hidden || reducedMotion.matches) {
      slideshowIsChanging = false;

      if (reducedMotion.matches) {
        resetSlideshowToFirstImage();
      }

      return;
    }

    nextImage.classList.remove("is-media-fallback");
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
  if (!landingIsReady || document.hidden || reducedMotion.matches) {
    return;
  }

  videos.forEach((video) => {
    if (video.classList.contains("is-media-fallback")) return;
    const playPromise = video.play();

    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => useVideoPoster(video));
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

  if (!landingIsReady) return;

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

panels.forEach((panel) => {
  panel.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
        event.shiftKey || event.altKey || panel.target === "_blank" || panel.hasAttribute("download")) return;
    event.preventDefault();
    void window.PageTransition.navigate(panel.href);
  });
});

document.addEventListener("page-transition:leaving", () => {
  landingIsReady = false;
  clearSlideshowTimer();
});

window.addEventListener("pagehide", () => {
  landingEntryController?.abort();
  activeLoader?.dispose();
  landingIsReady = false;
  clearSlideshowTimer();
  pauseVideos();
  resetMagneticOffsets(true);
});

window.addEventListener("pageshow", (event) => {
  if (event.persisted) void openLanding({ restored: true });
});

void openLanding();
