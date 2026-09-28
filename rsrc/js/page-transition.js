"use strict";

(() => {
  const curtain = document.querySelector(".page-transition");
  const surface = curtain.querySelector(".page-transition__surface");
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const easing = "cubic-bezier(0.76, 0, 0.24, 1)";
  const siteRoot = new URL("../../", document.currentScript.src);
  const landingUrl = new URL(siteRoot.protocol === "file:" ? "index.html" : "./", siteRoot);
  const landingReturnKey = "page-transition-navigation";
  const coverDuration = 950 * 0.7;
  const fadeDuration = 550;
  const lockedElements = new Map();
  let phase = "covered";
  let navigating = false;
  let generation = 0;
  let animations = [];
  let revealTimer = 0;
  let currentMove = Promise.resolve(true);
  let readyDeadline = 0;

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
    return ["video", "photography"].some(
      (page) => referrer.pathname === `${siteRoot.pathname}${page}`
    ) || referrer.pathname.startsWith(`${siteRoot.pathname}photography/`) || referrer.pathname.startsWith(`${siteRoot.pathname}video/`);
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
    curtain.style.opacity = "1";
    curtain.style.transform = `translate3d(0, ${offset}%, 0)`;
    surface.style.transform = `translate3d(0, ${-offset}%, 0)`;
  };

  const cancelMove = () => {
    generation += 1;
    window.clearTimeout(revealTimer);
    animations.forEach((animation) => animation.cancel());
    animations = [];
    curtain.classList.remove("is-moving", "is-fading");
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
      currentMove = move(100, 0, coverDuration).then((completed) => {
        if (completed) phase = "covered";
        return completed;
      });
    }
    return currentMove;
  };

  const fade = async (onReveal) => {
    cancelMove();
    const moveGeneration = generation;
    position(0);
    curtain.classList.remove("is-open");
    document.getElementById("page-transition-critical")?.remove();
    onReveal?.();
    if (!motionPreference.matches) {
      curtain.classList.add("is-fading");
      const animation = curtain.animate({ opacity: [1, 0] }, {
        duration: fadeDuration,
        easing: "cubic-bezier(0.4, 0, 0.2, 1)",
        fill: "forwards",
      });
      animations = [animation];
      await animation.finished.catch(() => {});
    }
    if (moveGeneration !== generation) return false;
    curtain.style.opacity = "0";
    animations.forEach((animation) => animation.cancel());
    animations = [];
    curtain.classList.remove("is-fading");
    return true;
  };

  const reveal = ({ onReveal, style = "fade" } = {}) => {
    if (phase === "revealing" || phase === "open") return currentMove;
    window.clearTimeout(readyDeadline);
    phase = "revealing";
    currentMove = (style === "wipe" ? move(0, -100, 950, onReveal) : fade(onReveal)).then((completed) => {
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
      if (destination.origin === window.location.origin) {
        // A one-use marker distinguishes internal navigation from a fresh visit.
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

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
        event.shiftKey || event.altKey || link.hasAttribute("download") ||
        (link.target && link.target !== "_self")) return;
    const destination = new URL(link.href);
    if (!["http:", "https:", "file:"].includes(destination.protocol) ||
        destination.origin !== location.origin ||
        (destination.pathname === location.pathname && destination.search === location.search)) return;
    event.preventDefault();
    void navigate(destination.href);
  });

  // Keep the existing scrollbar and layout width while preventing scroll input.
  const preventScroll = (event) => {
    if (phase !== "open" && !event.ctrlKey && !event.metaKey) event.preventDefault();
  };
  window.addEventListener("wheel", preventScroll, { passive: false });
  window.addEventListener("touchmove", preventScroll, { passive: false });
  document.addEventListener("keydown", (event) => {
    if (phase !== "open" && [" ", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) {
      event.preventDefault();
    }
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
    if (document.body.hasAttribute("data-page-transition")) void reveal();
  });

  lock();
  if (document.body.hasAttribute("data-page-transition")) {
    // Reveal the page's loading/error UI if its data or module fails to finish.
    readyDeadline = window.setTimeout(() => { void reveal(); }, 12000);
  }
})();
