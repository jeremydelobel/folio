"use strict";

(() => {
  const curtain = document.querySelector(".page-transition");
  const surface = curtain.querySelector(".page-transition__surface");
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const easing = "cubic-bezier(0.76, 0, 0.24, 1)";
  const siteRoot = new URL("../../", document.currentScript.src);
  const landingUrl = new URL(siteRoot.protocol === "file:" ? "index.html" : "./", siteRoot);
  const landingReturnKey = "landing-return-navigation";
  const lockedElements = new Map();
  let phase = "covered";
  let navigating = false;
  let generation = 0;
  let animations = [];
  let revealTimer = 0;
  let currentMove = Promise.resolve(true);

  const syncTransitionViewport = () => {
    const scrollbarWidth = Math.max(
      window.innerWidth - document.documentElement.clientWidth,
      0
    );
    document.documentElement.style.setProperty(
      "--page-transition-scrollbar-width",
      `${scrollbarWidth}px`
    );
  };

  syncTransitionViewport();
  window.addEventListener("resize", syncTransitionViewport);

  const isLandingUrl = (url) => url.origin === siteRoot.origin && (
    url.pathname === siteRoot.pathname || url.pathname === `${siteRoot.pathname}index.html`
  );

  const consumeCategoryReturn = () => {
    let pendingReturn = null;
    try {
      pendingReturn = JSON.parse(sessionStorage.getItem(landingReturnKey));
      sessionStorage.removeItem(landingReturnKey);
    } catch {}
    const navigationType = performance.getEntriesByType("navigation")[0]?.type;
    if (navigationType === "reload") return false;
    if (navigationType === "back_forward") return true;
    if (pendingReturn?.href === window.location.href && Date.now() - pendingReturn.time < 30000) {
      return true;
    }
    if (!document.referrer) return false;
    const referrer = new URL(document.referrer);
    if (referrer.origin !== siteRoot.origin) return false;
    return ["motion-design.html", "video-editing.html", "photography.html"].some(
      (page) => referrer.pathname === `${siteRoot.pathname}${page}`
    ) || referrer.pathname.startsWith(`${siteRoot.pathname}photography/`);
  };

  const lock = () => {
    document.documentElement.classList.add("is-page-transitioning");
    for (const element of document.body.children) {
      if (element === curtain || /^(SCRIPT|STYLE|LINK|NOSCRIPT)$/.test(element.tagName)) {
        continue;
      }
      if (!lockedElements.has(element)) {
        lockedElements.set(element, element.inert);
        element.inert = true;
      }
    }
  };

  const unlock = () => {
    document.getElementById("page-transition-critical")?.remove();
    document.documentElement.classList.remove(
      "is-page-transitioning",
      "is-page-transition-revealing"
    );
    lockedElements.forEach((wasInert, element) => {
      element.inert = wasInert;
    });
    lockedElements.clear();
  };

  const position = (offset) => {
    curtain.style.transform = `translate3d(0, ${offset}%, 0)`;
    surface.style.transform = `translate3d(0, ${-offset}%, 0)`;
  };

  const cancelMove = () => {
    generation += 1;
    window.clearTimeout(revealTimer);
    animations.forEach((animation) => animation.cancel());
    animations = [];
    curtain.classList.remove("is-moving");
  };

  const move = async (from, to, duration, onReveal) => {
    cancelMove();
    const moveGeneration = generation;
    let revealStarted = false;
    const startReveal = () => {
      if (revealStarted || moveGeneration !== generation) return;
      revealStarted = true;
      onReveal?.();
    };
    curtain.classList.remove("is-open");
    // The curtain is still fully covering the page here, so release the
    // critical black background before the reveal animation begins. This
    // keeps the destination background visible through the entire movement.
    if (to < from) {
      document.documentElement.classList.add("is-page-transition-revealing");
      document.getElementById("page-transition-critical")?.remove();
    }
    position(to);

    if (motionPreference.matches) {
      startReveal();
      return true;
    }

    curtain.classList.add("is-moving");
    const timing = { duration, easing };
    animations = [
      curtain.animate(
        { transform: [`translate3d(0, ${from}%, 0)`, `translate3d(0, ${to}%, 0)`] },
        timing
      ),
      surface.animate(
        { transform: [`translate3d(0, ${-from}%, 0)`, `translate3d(0, ${-to}%, 0)`] },
        timing
      ),
    ];
    // Both transforms must share a clock to keep the surface motionless.
    const startTime = document.timeline.currentTime;
    animations.forEach((animation) => { animation.startTime = startTime; });
    if (onReveal) {
      revealTimer = window.setTimeout(startReveal, duration * 0.48);
    }

    await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
    if (moveGeneration !== generation) return false;
    window.clearTimeout(revealTimer);
    startReveal();
    curtain.classList.remove("is-moving");
    animations = [];
    return true;
  };

  const cover = ({ immediate = false } = {}) => {
    lock();
    if (immediate) {
      cancelMove();
      position(0);
      curtain.classList.remove("is-open");
      phase = "covered";
      currentMove = Promise.resolve(true);
    } else if (phase === "open") {
      phase = "covering";
      currentMove = move(100, 0, 700).then((completed) => {
        if (completed) phase = "covered";
        return completed;
      });
    }
    return currentMove;
  };

  const reveal = ({ onReveal } = {}) => {
    if (phase === "revealing" || phase === "open") return currentMove;
    phase = "revealing";
    currentMove = move(0, -100, 950, onReveal).then((completed) => {
      if (completed) {
        phase = "open";
        curtain.classList.add("is-open");
        curtain.setAttribute("aria-hidden", "true");
        unlock();
        document.dispatchEvent(new Event("page-transition:revealed"));
      }
      return completed;
    });
    return currentMove;
  };

  const navigate = async (href, { beforeNavigate } = {}) => {
    if (!href || navigating || phase !== "open") return;
    navigating = true;
    beforeNavigate?.();
    document.dispatchEvent(new Event("page-transition:leaving"));
    const loader = curtain.querySelector(".landing-loader");
    if (loader) loader.hidden = true;
    if (await cover()) {
      const destination = new URL(href, window.location.href);
      const isCategoryPage = document.body.matches(".video-page, .photography-page");
      if (isCategoryPage && isLandingUrl(destination)) {
        // A one-use marker also identifies Menu returns when file URLs omit the referrer.
        try {
          sessionStorage.setItem(landingReturnKey, JSON.stringify({
            href: destination.href,
            time: Date.now(),
          }));
        } catch {}
      }
      window.location.assign(destination.href);
    }
  };

  window.PageTransition = Object.freeze({
    cover,
    reveal,
    navigate,
    consumeCategoryReturn,
    landingHref: landingUrl.href,
    get busy() { return phase !== "open" || navigating; },
  });

  motionPreference.addEventListener("change", () => {
    if (motionPreference.matches) animations.forEach((animation) => animation.finish());
  });

  window.addEventListener("pagehide", () => {
    const loader = curtain.querySelector(".landing-loader");
    if (loader) loader.hidden = true;
    curtain.setAttribute("aria-hidden", "true");
    void cover({ immediate: true });
  });

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    navigating = false;
    void cover({ immediate: true });
  });

  lock();
})();
