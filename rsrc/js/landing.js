"use strict";

import { beginMediaLoad } from "./media-loading.js";
import { loadContent } from "./cms.js";

let photographySources = [];

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const pointerCanHover = window.matchMedia("(hover: hover) and (pointer: fine)");
const stackedLayout = window.matchMedia("(max-aspect-ratio: 1 / 1)");
const landing = document.querySelector(".landing-v2");
const panels = Array.from(document.querySelectorAll(".landing-v2-panel"));
const videos = Array.from(document.querySelectorAll(".landing-v2-video"));
const slideshow = document.querySelector("[data-photography-slideshow]");
const slideshowImages = slideshow
  ? Array.from(slideshow.querySelectorAll(".landing-v2-photo"))
  : [];

const videoLoading = new Map();
let photoLoading;

const initialPhotoStorageKey = "landing-photography-initial-source";

const getCmsPhotographySources = (manifest, media) => {
  let selectedIds = manifest.home;
  if (!selectedIds.length) {
    const photosByImportOrder = manifest.photos.slice().reverse();
    selectedIds = manifest.projects.flatMap(project => photosByImportOrder
      .filter(id => media.get(id)?.projectId === project.id).slice(0, 3));
  }
  return [...new Set(selectedIds)].map(id => media.get(id)?.variants.large?.url).filter(Boolean);
};

const chooseInitialPhotographySource = () => {
  const fallbackSource = photographySources[0] || "";

  if (photographySources.length < 2) {
    return fallbackSource;
  }

  let previousSource = "";

  try {
    previousSource = window.localStorage.getItem(initialPhotoStorageKey) || "";
  } catch {}

  const availableSources = photographySources.filter(
    (source) => source !== previousSource
  );
  const source =
    availableSources[Math.floor(Math.random() * availableSources.length)] ||
    fallbackSource;

  try {
    window.localStorage.setItem(initialPhotoStorageKey, source);
  } catch {}

  return source;
};

let slideshowInitialSource = "";

let slideshowQueue = [];
let slideshowActiveIndex = 0;
let slideshowInitialIndex = 0;
let slideshowInitialIsReady = false;
let slideshowCurrentSource =
  slideshowImages[0]?.getAttribute("src") || "";
let slideshowTimer = 0;
let slideshowIsChanging = false;
let slideshowPreloadedSource = "";
let slideshowPreloader = null;
let splitAnimationFrame = 0;
let splitPreviousTime = 0;
let splitCurrentOffset = 0;
let splitTargetOffset = 0;
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

const useVideoFallback = (video) => {
  video.pause();
  // Keep an available frame on autoplay rejection or a later buffering failure.
  if (video.readyState >= 2) { videoLoading.get(video)?.ready(); return; }
  videoLoading.get(video)?.fail();
  video.classList.add("is-media-fallback");
};

const prepareLandingImage = async (image, signal) => {
  try {
    await waitForAsset(image.decode(), signal);
    image.classList.remove("is-media-fallback");
  } catch (error) {
    if (signal.aborted) throw error;
    image.classList.toggle(
      "is-media-fallback",
      !image.complete || image.naturalWidth === 0
    );
  }
};

const prepareInitialSlideshowImage = async (signal) => {
  const fallbackImage = slideshowImages[0];

  if (!fallbackImage) return;

  if (slideshowInitialIsReady) {
    await prepareLandingImage(slideshowImages[slideshowActiveIndex], signal);
    return;
  }

  await prepareLandingImage(fallbackImage, signal);

  if (
    !slideshowInitialSource ||
    slideshowInitialSource === fallbackImage.getAttribute("src") ||
    slideshowImages.length < 2
  ) {
    slideshowInitialIsReady = true;
    slideshowCurrentSource = fallbackImage.getAttribute("src") || "";
    return;
  }

  const initialImage = slideshowImages[1];
  initialImage.classList.remove("is-active", "is-media-fallback");
  initialImage.src = slideshowInitialSource;
  await prepareLandingImage(initialImage, signal);

  if (!initialImage.complete || initialImage.naturalWidth === 0) {
    initialImage.removeAttribute("src");
    slideshowInitialIsReady = true;
    slideshowCurrentSource = fallbackImage.getAttribute("src") || "";
    return;
  }

  initialImage.classList.add("is-active");
  fallbackImage.classList.remove("is-active");
  slideshowActiveIndex = 1;
  slideshowInitialIndex = 1;
  slideshowCurrentSource = slideshowInitialSource;
  slideshowInitialIsReady = true;
};

const prepareVideoBuffer = (video, report, signal) => new Promise((resolve, reject) => {
  let lastProgress = performance.now();
  let previousBuffered = 0;
  let timer = 0;
  let finished = false;
  const cleanup = () => {
    window.clearInterval(timer);
    video.removeEventListener("error", fail, true);
    video.removeEventListener("loadeddata", firstFrame);
    signal.removeEventListener("abort", abort);
  };
  const firstFrame = () => { if (video.readyState >= 2) videoLoading.get(video)?.ready(); };
  video.addEventListener("loadeddata", firstFrame);
  const finish = (fallback = false) => {
    if (finished) return;
    finished = true;
    cleanup();
    if (fallback) useVideoFallback(video);
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
    firstFrame();
    if ((reducedMotion.matches && video.readyState >= 2) || video.classList.contains("is-media-fallback")) {
      finish();
      return;
    }
    // A dynamically assigned source briefly reports NETWORK_NO_SOURCE while
    // load() queues resource selection. Only an actual media error is a failure.
    if (video.error) {
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
    useVideoFallback(video);
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
  const videoStageCount = videos.length;
  const photoStageIndex = videoStageCount;
  const assetsStageIndex = videoStageCount + 1;
  const stages = Array(videoStageCount + 2).fill(0);
  const report = (index, value) => {
    if (signal.aborted) return;
    stages[index] = Math.max(stages[index], value);
    const videoProgress = videoStageCount
      ? stages.slice(0, videoStageCount).reduce((sum, stage) => sum + stage, 0) /
        videoStageCount
      : 1;
    loader.progress(
      (videoProgress * 0.8 +
        stages[photoStageIndex] * 0.1 +
        stages[assetsStageIndex] * 0.1) *
        0.96
    );
  };

  try {
    const fonts = waitForAsset(Promise.all([
      document.fonts.load('400 12px "JetBrains Mono"'),
      document.fonts.load('600 34.5px "Special Gothic"'),
      document.fonts.load('400 16px "forma-djr-micro"'),
    ]), signal).catch((error) => { if (signal.aborted) throw error; });

    await Promise.all([
      ...videos.map((video, index) => prepareVideoBuffer(video, (value) => report(index, value), signal)),
      prepareInitialSlideshowImage(signal).then(() => {
        const visiblePhoto = slideshowImages.some(image =>
          image.classList.contains("is-active") && image.complete && image.naturalWidth);
        visiblePhoto ? photoLoading?.ready() : photoLoading?.fail();
        report(photoStageIndex, 1);
      }),
      fonts.then(() => report(assetsStageIndex, 1)),
    ]);
    await waitForVisibleLanding(signal);
    await Promise.all(videos.map((video) => startPreparedVideo(video, signal)));
    loader.progress(1);
    await waitForMinimumLoading();
    await loader.finish();
    if (signal.aborted) return;
    await window.PageTransition.reveal({ style: showLoader ? "wipe" : "fade" });
    if (signal.aborted) return;
    landingIsReady = true;
    loader.dispose();
    syncMotionPreference();
  } catch (error) {
    if (signal.aborted) return;
    photoLoading?.fail();
    console.error("Unable to prepare landing media:", error);
    videos.forEach(useVideoFallback);
    await waitForMinimumLoading().catch(() => {});
    loader.dispose();
    if (signal.aborted) return;
    await window.PageTransition.reveal({ style: showLoader ? "wipe" : "fade" });
    if (!signal.aborted) {
      landingIsReady = true;
      syncMotionPreference();
    }
  }
};

const clamp = (value, minimum, maximum) =>
  Math.min(Math.max(value, minimum), maximum);

const animateSplit = (time) => {
  const elapsed = splitPreviousTime ? Math.min(time - splitPreviousTime, 64) : 16;
  splitPreviousTime = time;
  splitCurrentOffset +=
    (splitTargetOffset - splitCurrentOffset) * (1 - Math.exp(-elapsed / 140));

  if (Math.abs(splitTargetOffset - splitCurrentOffset) <= 0.05) {
    splitCurrentOffset = splitTargetOffset;
  }

  landing.style.setProperty(
    "--landing-v2-split-offset",
    `${splitCurrentOffset.toFixed(2)}px`
  );
  splitAnimationFrame = splitCurrentOffset !== splitTargetOffset
    ? window.requestAnimationFrame(animateSplit)
    : 0;
};

const requestSplitAnimation = () => {
  if (!splitAnimationFrame && splitCurrentOffset !== splitTargetOffset) {
    splitPreviousTime = 0;
    splitAnimationFrame = window.requestAnimationFrame(animateSplit);
  }
};

const resetSplit = (immediate = false) => {
  splitTargetOffset = 0;

  if (immediate) {
    window.cancelAnimationFrame(splitAnimationFrame);
    splitAnimationFrame = 0;
    splitCurrentOffset = 0;
    splitPreviousTime = 0;
    landing.style.removeProperty("--landing-v2-split-offset");
    return;
  }

  requestSplitAnimation();
};

const updateSplitTarget = (clientX) => {
  if (!landingIsReady || !pointerCanHover.matches || reducedMotion.matches || stackedLayout.matches) {
    resetSplit(true);
    return;
  }

  if (landing.querySelector(".landing-v2-panel:focus-visible")) {
    resetSplit();
    return;
  }

  const rect = landing.getBoundingClientRect();
  if (rect.width <= 0) return;

  // Measure against the whole landing so the moving divider cannot shift the target.
  const normalizedX = clamp(
    (clientX - (rect.left + rect.width / 2)) / (rect.width / 2),
    -1,
    1
  );
  splitTargetOffset = -normalizedX * Math.min(96, rect.width * 0.06);
  requestSplitAnimation();
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
      playPromise.catch(() => useVideoFallback(video));
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

  slideshowImages.forEach((image, index) => {
    image.classList.toggle("is-active", index === slideshowInitialIndex);
  });
  slideshowActiveIndex = slideshowInitialIndex;
  slideshowCurrentSource =
    slideshowImages[slideshowInitialIndex]?.getAttribute("src") || "";
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
    resetSplit(true);
    return;
  }

  prepareNextSlideshowImage();
  scheduleNextSlideshowImage();
  playVideos();
};

landing.addEventListener("focusin", () => resetSplit());

landing.addEventListener(
  "pointermove",
  (event) => {
    if (event.pointerType !== "touch") updateSplitTarget(event.clientX);
  },
  { passive: true }
);

landing.addEventListener("pointerleave", () => resetSplit());
window.addEventListener("pointercancel", () => resetSplit());
window.addEventListener("blur", () => resetSplit());
window.addEventListener("resize", () => resetSplit(true), { passive: true });
pointerCanHover.addEventListener("change", () => resetSplit(true));
stackedLayout.addEventListener("change", () => resetSplit(true));

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearSlideshowTimer();
    pauseVideos();
    resetSplit(true);
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
  resetSplit(true);
});

window.addEventListener("pageshow", (event) => {
  if (event.persisted) void openLanding({ restored: true });
});

const initializeLanding = async () => {
  for (const video of videos) videoLoading.set(video, beginMediaLoad(video.parentElement));
  if (slideshow) photoLoading = beginMediaLoad(slideshow);
  try {
    const { manifest, media } = await loadContent(AbortSignal.timeout(8000));
    photographySources = getCmsPhotographySources(manifest, media);
    const showcase = media.get(manifest.videoShowcaseId)?.variants.video;
    for (const video of videos) {
      if (showcase) {
        video.src = showcase.url;
        video.load();
      } else useVideoFallback(video);
    }
  } catch {
    videos.forEach(useVideoFallback);
    photoLoading?.fail();
  }

  slideshowInitialSource = chooseInitialPhotographySource();
  await openLanding();
};

void initializeLanding();
