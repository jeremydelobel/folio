import { createVerticalLensGallery } from "./engine.js";
import { GRID } from "./config.js";

const canvasMount = document.querySelector("[data-gallery-canvas]");
const scrollSpacer = document.querySelector("[data-scroll-spacer]");
const webglError = document.querySelector("[data-webgl-error]");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let engine = null;
let lenis = null;
let nativeScrollAttached = false;
let resizeFrame = 0;
let bootVersion = 0;
let pageDestroyed = false;

function setSpacerHeight(height) {
  const safeHeight = Math.max(window.innerHeight, Math.ceil(height));
  scrollSpacer.style.height = `${safeHeight}px`;
}

function syncNativeScroll() {
  engine?.setScroll(window.scrollY);
}

function stopScrollController() {
  if (lenis) {
    lenis.destroy();
    lenis = null;
  }

  if (nativeScrollAttached) {
    window.removeEventListener("scroll", syncNativeScroll);
    nativeScrollAttached = false;
  }
}

function startScrollController() {
  stopScrollController();

  if (!reducedMotion.matches && window.Lenis) {
    lenis = new window.Lenis({
      autoRaf: true,
      lerp: 0.09,
      wheelMultiplier: 1,
      smoothWheel: true,
    });

    lenis.on("scroll", ({ scroll }) => {
      engine?.setScroll(scroll);
    });
    return;
  }

  window.addEventListener("scroll", syncNativeScroll, { passive: true });
  nativeScrollAttached = true;
}

async function startGallery() {
  if (
    pageDestroyed ||
    engine ||
    window.innerWidth < GRID.MIN_VIEWPORT_WIDTH
  ) {
    return;
  }

  const version = ++bootVersion;
  webglError.hidden = true;

  try {
    const nextEngine = await createVerticalLensGallery(canvasMount, {
      onHeightChange: setSpacerHeight,
    });

    if (
      pageDestroyed ||
      version !== bootVersion ||
      window.innerWidth < GRID.MIN_VIEWPORT_WIDTH
    ) {
      nextEngine.destroy();
      return;
    }

    engine = nextEngine;
    startScrollController();
    engine.setScroll(window.scrollY);
  } catch (error) {
    console.error(error);
    webglError.hidden = false;
  }
}

function stopGallery() {
  bootVersion += 1;
  stopScrollController();
  engine?.destroy();
  engine = null;
  scrollSpacer.style.height = "";
}

function handleViewportChange() {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    if (window.innerWidth < GRID.MIN_VIEWPORT_WIDTH) {
      stopGallery();
      return;
    }

    if (!engine) {
      startGallery();
      return;
    }

    engine.resize();
    engine.setScroll(window.scrollY);
  });
}

function handleReducedMotionChange() {
  if (!engine) return;
  startScrollController();
  engine.setScroll(window.scrollY);
}

function destroyPage() {
  pageDestroyed = true;
  cancelAnimationFrame(resizeFrame);
  window.removeEventListener("resize", handleViewportChange);
  reducedMotion.removeEventListener("change", handleReducedMotionChange);
  stopGallery();
}

window.addEventListener("resize", handleViewportChange, { passive: true });
window.addEventListener("pagehide", destroyPage, { once: true });
reducedMotion.addEventListener("change", handleReducedMotionChange);

startGallery();
