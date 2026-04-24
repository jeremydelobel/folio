const pageTransition = document.querySelector(".page-transition");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const backButton = document.querySelector(".back-button");
const showreelButton = document.querySelector(".showreel-button");
const showreelOverlay = document.querySelector(".showreel-overlay");
const showreelIframe = document.querySelector(".showreel-iframe");
const photoGrid = document.querySelector(".photo-grid");
const videoTimeline = document.querySelector(".video-timeline");
const timelineScrollArea = document.querySelector(".timeline-scroll-area");
const videoScrollbar = document.querySelector(".video-scrollbar");
const videoScrollbarTrack = document.querySelector(".video-scrollbar-track");
const videoScrollbarThumb = document.querySelector(".video-scrollbar-thumb");
const navigationEntry = performance.getEntriesByType("navigation")[0];
const isBackForwardLoad = navigationEntry?.type === "back_forward";
const isPhotographyPage = document.body.classList.contains("photography-page");
const isVideoPage = document.body.classList.contains("video-page");
const isFolioPage = isPhotographyPage || isVideoPage;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const videoProjectLinksCache = new Map();
const videoLinkPriority = ["youtube", "tiktok", "instagram"];
const videoRoleMap = {
  m: "Montage",
  md: "Motion Design",
  fx: "FX",
  cg: "Étalonnage",
  sd: "Sound Design",
  dr: "Derush",
};
let showreelCloseTimer = 0;
let vimeoPlayerApiPromise = null;
let showreelPlayer = null;
let showreelPlayerInitPromise = null;

const parseVideoProjectFolderName = (folderName = "") => {
  const folderParts = folderName.split("_");
  const rawDate = folderParts[0] || "";
  const title = (folderParts[1] || "").trim();
  const [year = "", month = "", day = ""] = rawDate.split(".");
  const hasValidDate =
    year.length === 4 &&
    month.length === 2 &&
    day.length === 2 &&
    [year, month, day].every((part) => /^\d+$/.test(part));
  const displayDate = hasValidDate ? `${day}.${month}.${year}` : rawDate;
  const sortKey = hasValidDate ? Number(`${year}${month}${day}`) : 0;
  const roleTokens = folderParts
    .slice(2)
    .join("_")
    .split(" - ")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  const roleLabel = roleTokens
    .map((token) => videoRoleMap[token])
    .filter(Boolean)
    .join(" · ");

  return {
    displayDate,
    sortKey,
    title,
    titleLabel: title ? title.toLocaleUpperCase("fr-FR") : "",
    roleLabel,
  };
};

const getVideoVisualFolderName = (visual) => {
  if (!visual) {
    return "";
  }

  if (visual.dataset.projectFolder) {
    return visual.dataset.projectFolder;
  }

  const mediaSource =
    visual.querySelector(".video-card-hover-video source")?.getAttribute("src") ||
    visual.querySelector(".video-card-hover-video source")?.dataset.src ||
    visual.querySelector(".video-card-thumb")?.getAttribute("src") ||
    visual.querySelector(".video-card-thumb")?.dataset.src ||
    "";

  if (!mediaSource) {
    return "";
  }

  const normalizedPath = mediaSource.replace(/\\/g, "/");
  const segments = normalizedPath.split("/").filter(Boolean);

  return decodeURIComponent(segments.at(-2) || "");
};

const getInlineVideoProjectLink = (card) => {
  if (!card) {
    return "";
  }

  const directHref =
    typeof card.dataset.projectUrl === "string"
      ? card.dataset.projectUrl.trim()
      : "";

  if (directHref) {
    return directHref;
  }

  const visualHref =
    card
      .querySelector(".video-card-visual")
      ?.dataset.projectUrl?.trim() || "";

  return visualHref;
};

const buildVideoProjectFileUrl = (folderName, fileName) => {
  if (!folderName || !fileName) {
    return null;
  }

  const encodedFolder = folderName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return new URL(`./rsrc/montage-video/${encodedFolder}/${fileName}`, window.location.href);
};

const getVideoVisualThumb = (visual) =>
  visual?.querySelector(".video-card-thumb") || null;

const getVideoVisualHoverVideo = (visual) =>
  visual?.querySelector(".video-card-hover-video") || null;

const getVideoVisualSource = (visual) =>
  getVideoVisualHoverVideo(visual)?.querySelector("source") || null;

const setVideoVisualThumbReadyState = (visual, isReady) => {
  const card = visual?.closest(".video-timeline-card");

  if (!card) {
    return;
  }

  card.classList.toggle("is-thumb-ready", Boolean(isReady));
};

const bindVideoVisualThumbLoad = (visual, thumb) => {
  if (!visual || !thumb || thumb.dataset.loadBound === "true") {
    return;
  }

  thumb.addEventListener("load", () => {
    thumb.dataset.loaded = "true";
    setVideoVisualThumbReadyState(visual, true);
  });

  thumb.dataset.loadBound = "true";
};

const primeVideoVisualMedia = (visual) => {
  if (!visual || visual.dataset.mediaPrimed === "true") {
    return;
  }

  const thumb = getVideoVisualThumb(visual);
  const video = getVideoVisualHoverVideo(visual);
  const source = getVideoVisualSource(visual);

  if (thumb) {
    const thumbSrc =
      (typeof thumb.dataset.src === "string" && thumb.dataset.src.trim()) ||
      thumb.getAttribute("src") ||
      "";

    if (thumbSrc) {
      thumb.dataset.src = thumbSrc;
    }

    bindVideoVisualThumbLoad(visual, thumb);

    if (thumb.complete && thumb.naturalWidth > 0) {
      thumb.dataset.loaded = "true";
      setVideoVisualThumbReadyState(visual, true);
    } else {
      thumb.dataset.loaded = "false";
      setVideoVisualThumbReadyState(visual, false);
    }
  }

  if (source) {
    const videoSrc =
      (typeof source.dataset.src === "string" && source.dataset.src.trim()) ||
      source.getAttribute("src") ||
      "";

    if (videoSrc) {
      source.dataset.src = videoSrc;
    }

    source.removeAttribute("src");
  }

  if (video) {
    video.preload = "none";

    try {
      video.load();
    } catch {}
  }

  visual.dataset.mediaPrimed = "true";
};

const ensureVideoVisualThumbLoaded = (
  visual,
  { priority = "auto", loading = null } = {}
) => {
  const thumb = getVideoVisualThumb(visual);

  if (!thumb) {
    return false;
  }

  const thumbSrc =
    (typeof thumb.dataset.src === "string" && thumb.dataset.src.trim()) ||
    thumb.getAttribute("src") ||
    "";

  if (!thumbSrc) {
    return false;
  }

  thumb.fetchPriority = priority;

  if (loading) {
    thumb.loading = loading;
  }

  bindVideoVisualThumbLoad(visual, thumb);

  if (thumb.getAttribute("src") !== thumbSrc) {
    thumb.setAttribute("src", thumbSrc);
  }

  if (thumb.complete && thumb.naturalWidth > 0) {
    thumb.dataset.loaded = "true";
    setVideoVisualThumbReadyState(visual, true);
  }

  return true;
};

const ensureVideoVisualHoverVideoLoaded = (
  visual,
  { preload = "metadata" } = {}
) => {
  const video = getVideoVisualHoverVideo(visual);
  const source = getVideoVisualSource(visual);

  if (!video || !source) {
    return false;
  }

  const videoSrc =
    (typeof source.dataset.src === "string" && source.dataset.src.trim()) ||
    source.getAttribute("src") ||
    "";

  if (!videoSrc) {
    return false;
  }

  video.preload = preload;

  if (source.getAttribute("src") !== videoSrc) {
    source.setAttribute("src", videoSrc);

    try {
      video.load();
    } catch {}
  }

  return true;
};

const releaseVideoVisualHoverVideo = (visual) => {
  const video = getVideoVisualHoverVideo(visual);
  const source = getVideoVisualSource(visual);

  if (!video || !source || !source.getAttribute("src")) {
    return;
  }

  visual.classList.remove("is-hover-media-active");
  video.pause();

  try {
    video.currentTime = 0;
  } catch {}

  video.preload = "none";
  source.removeAttribute("src");

  try {
    video.load();
  } catch {}
};

const normalizeVideoProjectLinks = (payload) => {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const directUrl =
    typeof payload.url === "string" ? payload.url.trim() : "";

  if (directUrl) {
    return directUrl;
  }

  const namedLinks = Object.fromEntries(
    videoLinkPriority
      .map((platform) => [platform, payload[platform]])
      .filter(([, value]) => typeof value === "string" && value.trim())
      .map(([platform, value]) => [platform, value.trim()])
  );

  if (!Object.keys(namedLinks).length) {
    return "";
  }

  const defaultPlatform =
    typeof payload.default === "string" ? payload.default.trim().toLowerCase() : "";

  if (defaultPlatform && namedLinks[defaultPlatform]) {
    return namedLinks[defaultPlatform];
  }

  return (
    videoLinkPriority.map((platform) => namedLinks[platform]).find(Boolean) ||
    Object.values(namedLinks)[0] ||
    ""
  );
};

const loadVideoProjectLink = async (folderName) => {
  if (!folderName) {
    return "";
  }

  if (videoProjectLinksCache.has(folderName)) {
    return videoProjectLinksCache.get(folderName);
  }

  const candidateFiles = ["link.json", "links.json"];

  for (const fileName of candidateFiles) {
    const linksUrl = buildVideoProjectFileUrl(folderName, fileName);

    if (!linksUrl) {
      continue;
    }

    try {
      const response = await fetch(linksUrl);

      if (!response.ok) {
        continue;
      }

      const payload = await response.json();
      const resolvedLink = normalizeVideoProjectLinks(payload);

      videoProjectLinksCache.set(folderName, resolvedLink);
      return resolvedLink;
    } catch {
      continue;
    }
  }

  videoProjectLinksCache.set(folderName, "");
  return "";
};

const openExternalProjectLink = (href) => {
  if (!href) {
    return;
  }

  const link = document.createElement("a");
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const openPendingProjectWindow = () => {
  const pendingWindow = window.open("", "_blank");

  if (pendingWindow) {
    try {
      pendingWindow.opener = null;
    } catch {}
  }

  return pendingWindow;
};

const loadVimeoPlayerApi = () => {
  if (window.Vimeo?.Player) {
    return Promise.resolve(window.Vimeo.Player);
  }

  if (vimeoPlayerApiPromise) {
    return vimeoPlayerApiPromise;
  }

  vimeoPlayerApiPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector("script[data-vimeo-player-api]");

    const handleLoad = () => {
      if (window.Vimeo?.Player) {
        resolve(window.Vimeo.Player);
        return;
      }

      vimeoPlayerApiPromise = null;
      reject(new Error("Vimeo player API unavailable"));
    };

    const handleError = () => {
      vimeoPlayerApiPromise = null;
      reject(new Error("Failed to load Vimeo player API"));
    };

    if (existingScript) {
      existingScript.addEventListener("load", handleLoad, { once: true });
      existingScript.addEventListener("error", handleError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://player.vimeo.com/api/player.js";
    script.async = true;
    script.dataset.vimeoPlayerApi = "true";
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    document.head.appendChild(script);
  });

  return vimeoPlayerApiPromise;
};

const ensureShowreelPlayer = () => {
  if (!showreelIframe?.getAttribute("src")) {
    return Promise.resolve(null);
  }

  if (showreelPlayer) {
    return Promise.resolve(showreelPlayer);
  }

  if (showreelPlayerInitPromise) {
    return showreelPlayerInitPromise;
  }

  showreelPlayerInitPromise = loadVimeoPlayerApi()
    .then((Player) => {
      if (!showreelIframe?.getAttribute("src")) {
        return null;
      }

      const player = new Player(showreelIframe);
      showreelPlayer = player;

      return player;
    })
    .catch(() => null)
    .finally(() => {
      showreelPlayerInitPromise = null;
    });

  return showreelPlayerInitPromise;
};

const setShowreelState = (isOpen) => {
  const normalizedState = Boolean(isOpen);

  document.documentElement.classList.toggle("is-showreel-open", normalizedState);
  document.body.classList.toggle("is-showreel-open", normalizedState);

  if (showreelButton) {
    showreelButton.setAttribute("aria-expanded", String(normalizedState));
  }

  if (showreelOverlay) {
    showreelOverlay.setAttribute("aria-hidden", String(!normalizedState));
  }
};

const openShowreelOverlay = () => {
  const embedSrc =
    typeof showreelIframe?.dataset.src === "string"
      ? showreelIframe.dataset.src.trim()
      : "";

  if (!showreelOverlay || !showreelIframe || !embedSrc) {
    return false;
  }

  window.clearTimeout(showreelCloseTimer);

  if (showreelIframe.getAttribute("src") !== embedSrc) {
    showreelIframe.setAttribute("src", embedSrc);
  }

  showreelOverlay.classList.add("is-visible");
  setShowreelState(true);
  void ensureShowreelPlayer().then((player) => {
    if (!player) {
      return;
    }

    void player.play().catch(() => {});
  });

  return true;
};

const closeShowreelOverlay = ({ restoreFocus = true } = {}) => {
  if (!showreelOverlay || !showreelIframe) {
    return;
  }

  showreelOverlay.classList.remove("is-visible");
  setShowreelState(false);

  if (showreelPlayer) {
    void showreelPlayer.pause().catch(() => {});
  }

  window.clearTimeout(showreelCloseTimer);
  showreelCloseTimer = window.setTimeout(() => {
    const player = showreelPlayer;

    showreelPlayer = null;

    if (player) {
      void player.unload().catch(() => {});
    }

    showreelIframe.removeAttribute("src");
  }, 260);

  if (restoreFocus && showreelButton) {
    showreelButton.focus();
  }
};

const initVideoHoverMedia = () => {
  const hoverMediaVisuals = Array.from(
    document.querySelectorAll(".video-card-visual.has-hover-media")
  );

  hoverMediaVisuals.forEach((visual) => {
    if (visual.dataset.hoverBound === "true") {
      return;
    }

    primeVideoVisualMedia(visual);

    const video = visual.querySelector(".video-card-hover-video");
    const folderName = getVideoVisualFolderName(visual);
    const roleLabel = parseVideoProjectFolderName(folderName).roleLabel;

    if (roleLabel && !visual.querySelector(".video-card-role-list")) {
      const roleElement = document.createElement("p");
      roleElement.className = "video-card-role-list";
      roleElement.textContent = roleLabel;
      visual.appendChild(roleElement);
    }

    if (!video) {
      return;
    }

    const activate = () => {
      ensureVideoVisualThumbLoaded(visual, { priority: "high" });
      ensureVideoVisualHoverVideoLoaded(visual, { preload: "auto" });
      visual.classList.add("is-hover-media-active");

      const playPromise = video.play();

      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    };

    const deactivate = () => {
      visual.classList.remove("is-hover-media-active");
      video.pause();
      video.currentTime = 0;
    };

    visual.addEventListener("mouseenter", activate);
    visual.addEventListener("mouseleave", deactivate);
    visual.dataset.hoverBound = "true";
  });
};

const initVideoProjectLinks = () => {
  const videoCards = Array.from(
    document.querySelectorAll(".video-timeline-card")
  );

  videoCards.forEach((card) => {
    if (card.dataset.projectLinkBound === "true") {
      return;
    }

    const inlineHref = getInlineVideoProjectLink(card);
    const folderName = getVideoVisualFolderName(
      card.querySelector(".video-card-visual")
    );

    if (!folderName && !inlineHref) {
      return;
    }

    if (folderName) {
      void loadVideoProjectLink(folderName);
    } else if (inlineHref) {
      videoProjectLinksCache.set(inlineHref, inlineHref);
    }

    const openCardLink = () => {
      const cachedHref = folderName
        ? videoProjectLinksCache.get(folderName)
        : videoProjectLinksCache.get(inlineHref);

      if (cachedHref) {
        openExternalProjectLink(cachedHref);
        return;
      }

      if (!folderName && inlineHref) {
        openExternalProjectLink(inlineHref);
        return;
      }

      if (!folderName) {
        return;
      }

      const pendingWindow = openPendingProjectWindow();

      void loadVideoProjectLink(folderName).then((href) => {
        const resolvedHref = href || inlineHref;

        if (!resolvedHref) {
          if (pendingWindow && !pendingWindow.closed) {
            pendingWindow.close();
          }
          return;
        }

        if (pendingWindow && !pendingWindow.closed) {
          pendingWindow.location.href = resolvedHref;
          return;
        }

        openExternalProjectLink(resolvedHref);
      });
    };

    card.tabIndex = 0;
    card.setAttribute("role", "link");

    card.addEventListener("click", () => {
      void openCardLink();
    });

    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      void openCardLink();
    });

    card.dataset.projectLinkBound = "true";
  });
};

const startIntroAnimation = () => {
  requestAnimationFrame(() => {
    document.body.classList.add("is-ready");
  });
};

const resetIntroAnimation = () => {
  document.body.classList.remove("is-ready");
  void document.body.offsetWidth;
};

const playPageEntry = ({ withWhiteFade = false } = {}) => {
  const reveal = () => {
    if (pageTransition) {
      if (withWhiteFade && !prefersReducedMotion.matches) {
        pageTransition.classList.add("is-visible");
      } else {
        pageTransition.classList.remove("is-visible");
      }
    }

    resetIntroAnimation();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (pageTransition && !prefersReducedMotion.matches) {
          pageTransition.classList.remove("is-visible");
        }

        startIntroAnimation();
      });
    });
  };

  if (prefersReducedMotion.matches) {
    if (pageTransition) {
      pageTransition.classList.remove("is-visible");
    }
    resetIntroAnimation();
    startIntroAnimation();
    return;
  }

  if (withWhiteFade) {
    reveal();
    return;
  }

  if (pageTransition) {
    window.setTimeout(reveal, 90);
    return;
  }

  reveal();
};

const navigateWithFade = (href) => {
  if (!href) {
    return;
  }

  if (prefersReducedMotion.matches || !pageTransition) {
    window.location.href = href;
    return;
  }

  pageTransition.classList.add("is-visible");

  window.setTimeout(() => {
    window.location.href = href;
  }, 460);
};

document.querySelectorAll("[data-route]").forEach((element) => {
  element.addEventListener("click", () => {
    navigateWithFade(element.dataset.route);
  });
});

if (backButton) {
  backButton.addEventListener("click", () => {
    navigateWithFade("./index.html");
  });
}

if (showreelButton) {
  showreelButton.addEventListener("click", () => {
    if (openShowreelOverlay()) {
      return;
    }

    const href =
      typeof showreelButton.dataset.showreelUrl === "string"
        ? showreelButton.dataset.showreelUrl.trim()
        : "";

    if (!href) {
      return;
    }

    openExternalProjectLink(href);
  });
}

if (showreelOverlay) {
  showreelOverlay.querySelectorAll("[data-showreel-close]").forEach((element) => {
    element.addEventListener("click", () => {
      closeShowreelOverlay();
    });
  });

  showreelOverlay.addEventListener("click", (event) => {
    if (event.target === showreelOverlay) {
      closeShowreelOverlay();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !showreelOverlay.classList.contains("is-visible")) {
      return;
    }

    event.preventDefault();
    closeShowreelOverlay();
  });
}

if (photoGrid) {
  let currentPhotoColumns = 0;
  let randomizedPhotoModels = [];
  let tileRevealObserver;
  let imageLoadObserver;

  const shuffleArray = (items) => {
    const shuffled = [...items];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));

      [shuffled[index], shuffled[randomIndex]] = [
        shuffled[randomIndex],
        shuffled[index],
      ];
    }

    return shuffled;
  };

  const buildPhotoModels = () =>
    Array.from(photoGrid.querySelectorAll(".photo-tile")).map((tile) => {
      const image = tile.querySelector(".photo-image");
      const width =
        Number(image?.getAttribute("width")) || image?.naturalWidth || 1;
      const height =
        Number(image?.getAttribute("height")) || image?.naturalHeight || 1;
      const ratio = width / height;
      const kind =
        ratio < 0.9 ? "portrait" : ratio > 1.65 ? "wide" : "landscape";

      tile.style.setProperty("--tile-ratio", `${width} / ${height}`);

      return {
        tile,
        image,
        kind,
        formatGroup: kind === "portrait" ? "portrait" : "horizontal",
        balanceUnits: kind === "portrait" ? 2 : 1,
      };
    });

  const refreshRandomizedPhotoModels = () => {
    randomizedPhotoModels = shuffleArray(buildPhotoModels());
  };

  const buildColumnCandidate = (columnCount) => {
    const portraitModels = shuffleArray(
      randomizedPhotoModels.filter((model) => model.formatGroup === "portrait")
    );
    const horizontalModels = shuffleArray(
      randomizedPhotoModels.filter((model) => model.formatGroup === "horizontal")
    );
    const columns = Array.from({ length: columnCount }, (_, index) => ({
      index,
      portraitCount: 0,
      horizontalCount: 0,
      balanceUnits: 0,
      items: [],
    }));
    let remainingPortraitCount = portraitModels.length;
    let remainingHorizontalCount = horizontalModels.length;
    const startOffset = Math.random() < 0.5 ? 0 : 1;

    const addGroupToColumn = (column, group) => {
      if (group === "portrait") {
        if (remainingPortraitCount <= 0) {
          return false;
        }

        column.portraitCount += 1;
        column.balanceUnits += 2;
        remainingPortraitCount -= 1;
        return true;
      }

      if (remainingHorizontalCount <= 0) {
        return false;
      }

      column.horizontalCount += 1;
      column.balanceUnits += 1;
      remainingHorizontalCount -= 1;
      return true;
    };

    const getColumnItemCount = (column) =>
      column.portraitCount + column.horizontalCount;

    const buildGroupSequence = (portraitCount, horizontalCount, startGroup) => {
      const cache = new Map();

      const solve = (
        remainingPortrait,
        remainingHorizontal,
        lastGroup,
        streakLength,
        isFirstStep
      ) => {
        const cacheKey = [
          remainingPortrait,
          remainingHorizontal,
          lastGroup || "none",
          streakLength,
          isFirstStep ? 1 : 0,
        ].join("|");

        if (cache.has(cacheKey)) {
          return cache.get(cacheKey);
        }

        if (remainingPortrait === 0 && remainingHorizontal === 0) {
          cache.set(cacheKey, []);
          return [];
        }

        const candidateGroups = isFirstStep
          ? [startGroup]
          : shuffleArray(["portrait", "horizontal"]).sort((groupA, groupB) => {
              const remainingCountA =
                groupA === "portrait" ? remainingPortrait : remainingHorizontal;
              const remainingCountB =
                groupB === "portrait" ? remainingPortrait : remainingHorizontal;

              return remainingCountB - remainingCountA;
            });

        for (const group of candidateGroups) {
          if (group === "portrait" && remainingPortrait <= 0) {
            continue;
          }

          if (group === "horizontal" && remainingHorizontal <= 0) {
            continue;
          }

          if (!isFirstStep && lastGroup === group && streakLength >= 2) {
            continue;
          }

          const nextPortrait =
            remainingPortrait - (group === "portrait" ? 1 : 0);
          const nextHorizontal =
            remainingHorizontal - (group === "horizontal" ? 1 : 0);
          const nextStreak = lastGroup === group ? streakLength + 1 : 1;
          const tail = solve(
            nextPortrait,
            nextHorizontal,
            group,
            nextStreak,
            false
          );

          if (tail) {
            const result = [group, ...tail];
            cache.set(cacheKey, result);
            return result;
          }
        }

        cache.set(cacheKey, null);
        return null;
      };

      return solve(portraitCount, horizontalCount, "", 0, true);
    };

    for (const [index, column] of columns.entries()) {
      const startGroup =
        (index + startOffset) % 2 === 0 ? "portrait" : "horizontal";
      let placedStartGroup = startGroup;

      if (!addGroupToColumn(column, startGroup)) {
        const fallbackGroup =
          startGroup === "portrait" ? "horizontal" : "portrait";

        if (!addGroupToColumn(column, fallbackGroup)) {
          return null;
        }

        placedStartGroup = fallbackGroup;
      }

      column.startGroup = placedStartGroup;
    }

    while (remainingPortraitCount > 0) {
      const rankedColumns = shuffleArray([...columns]).sort((columnA, columnB) => {
        if (columnA.balanceUnits !== columnB.balanceUnits) {
          return columnA.balanceUnits - columnB.balanceUnits;
        }

        return getColumnItemCount(columnA) - getColumnItemCount(columnB);
      });

      addGroupToColumn(rankedColumns[0], "portrait");
    }

    while (remainingHorizontalCount > 0) {
      const rankedColumns = shuffleArray([...columns]).sort((columnA, columnB) => {
        if (columnA.balanceUnits !== columnB.balanceUnits) {
          return columnA.balanceUnits - columnB.balanceUnits;
        }

        return getColumnItemCount(columnA) - getColumnItemCount(columnB);
      });

      addGroupToColumn(rankedColumns[0], "horizontal");
    }

    const sequences = columns.map((column) =>
      buildGroupSequence(
        column.portraitCount,
        column.horizontalCount,
        column.startGroup
      )
    );

    if (sequences.some((sequence) => !sequence)) {
      return null;
    }

    const portraitPool = [...portraitModels];
    const horizontalPool = [...horizontalModels];

    columns.forEach((column, index) => {
      column.items = sequences[index].map((group) => {
        const model =
          group === "portrait"
            ? portraitPool.shift()
            : horizontalPool.shift();

        return model;
      });
    });

    if (portraitPool.length || horizontalPool.length) {
      return null;
    }

    return columns;
  };

  const scoreColumnCandidate = (columns) => {
    const balances = columns.map((column) => column.balanceUnits);
    const highestBalance = Math.max(...balances);
    const lowestBalance = Math.min(...balances);
    const averageBalance =
      balances.reduce((total, balance) => total + balance, 0) / balances.length;
    const balanceVariance = balances.reduce(
      (total, balance) => total + Math.abs(balance - averageBalance),
      0
    );
    const counts = columns.map((column) => column.items.length);
    const highestCount = Math.max(...counts);
    const lowestCount = Math.min(...counts);
    const averageCount =
      counts.reduce((total, count) => total + count, 0) / counts.length;
    const countVariance = counts.reduce(
      (total, count) => total + Math.abs(count - averageCount),
      0
    );
    const startPenalty = columns.reduce((total, column, index) => {
      if (index === 0) {
        return total;
      }

      const previousStart = columns[index - 1].items[0]?.formatGroup;
      const currentStart = column.items[0]?.formatGroup;

      return total + (previousStart === currentStart ? 8 : 0);
    }, 0);
    const streakPenalty = columns.reduce((total, column) => {
      let penalty = 0;
      let currentStreak = 1;

      for (let index = 1; index < column.items.length; index += 1) {
        const currentGroup = column.items[index]?.formatGroup;
        const previousGroup = column.items[index - 1]?.formatGroup;

        if (currentGroup === previousGroup) {
          currentStreak += 1;
        } else {
          currentStreak = 1;
        }

        if (currentStreak > 2) {
          penalty += 50;
        }
      }

      return total + penalty;
    }, 0);

    return (
      (highestBalance - lowestBalance) * 42 +
      balanceVariance * 22 +
      (highestCount - lowestCount) * 4 +
      countVariance * 0.6 +
      startPenalty +
      streakPenalty
    );
  };

  const getBestColumnCandidate = (columnCount) => {
    const attemptCount = columnCount === 2 ? 80 : 160;
    let bestCandidate = null;
    let bestScore = Infinity;

    for (let attempt = 0; attempt < attemptCount; attempt += 1) {
      const candidate = buildColumnCandidate(columnCount);

      if (!candidate) {
        continue;
      }

      const candidateScore = scoreColumnCandidate(candidate);

      if (candidateScore < bestScore) {
        bestCandidate = candidate;
        bestScore = candidateScore;
      }
    }

    return bestCandidate || buildColumnCandidate(columnCount);
  };

  const loadPhotoImage = (image) => {
    if (!image || image.dataset.loaded === "true") {
      return;
    }

    const tile = image.closest(".photo-tile");
    const source = image.dataset.src;

    if (!source) {
      tile?.classList.add("is-loaded");
      image.dataset.loaded = "true";
      return;
    }

    const handleLoad = () => {
      tile?.classList.add("is-loaded");
      image.dataset.loaded = "true";
      image.removeEventListener("load", handleLoad);
    };

    image.addEventListener("load", handleLoad, { once: true });
    image.src = source;

    if (image.complete) {
      handleLoad();
    }
  };

  const observePhotoTiles = () => {
    if (tileRevealObserver) {
      tileRevealObserver.disconnect();
    }

    if (imageLoadObserver) {
      imageLoadObserver.disconnect();
    }

    const tiles = Array.from(photoGrid.querySelectorAll(".photo-tile"));
    const images = tiles
      .map((tile) => tile.querySelector(".photo-image"))
      .filter(Boolean);

    if (prefersReducedMotion.matches || !("IntersectionObserver" in window)) {
      tiles.forEach((tile) => tile.classList.add("is-visible"));
      images.forEach((image) => loadPhotoImage(image));
      return;
    }

    tileRevealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add("is-visible");
          tileRevealObserver.unobserve(entry.target);
        });
      },
      {
        threshold: 0.02,
        rootMargin: "0px 0px 14% 0px",
      }
    );

    imageLoadObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          loadPhotoImage(entry.target);
          imageLoadObserver.unobserve(entry.target);
        });
      },
      {
        threshold: 0.01,
        rootMargin: "500px 0px 500px 0px",
      }
    );

    tiles.forEach((tile) => tileRevealObserver.observe(tile));
    images.forEach((image) => imageLoadObserver.observe(image));
  };

  const rebuildPhotoColumns = () => {
    const nextColumns = window.innerWidth <= 980 ? 2 : 4;

    if (nextColumns === currentPhotoColumns) {
      return;
    }

    currentPhotoColumns = nextColumns;
    photoGrid.innerHTML = "";
    const bestCandidate = getBestColumnCandidate(nextColumns);

    if (!bestCandidate) {
      return;
    }

    bestCandidate.forEach((column) => {
      const element = document.createElement("div");
      element.className = "photo-column";
      photoGrid.appendChild(element);

      column.items.forEach((model) => {
        element.appendChild(model.tile);
      });
    });

    observePhotoTiles();
  };

  refreshRandomizedPhotoModels();
  rebuildPhotoColumns();
  window.addEventListener("resize", rebuildPhotoColumns);
}

const initVideoTimelineScene = () => {
  if (!videoTimeline || !timelineScrollArea) {
    return;
  }

  const timelineCards = Array.from(
    videoTimeline.querySelectorAll(".video-timeline-card")
  );

  if (!timelineCards.length) {
    return;
  }

  const videoCanHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const videoIsMobileLayout = window.matchMedia("(max-width: 640px)");
  const videoPointer = { x: 0, y: 0, active: false };
  const pastelPalette = [
    "#e2b8b0",
    "#c8d8f2",
    "#d8ccb8",
    "#bedfcf",
    "#f1d8a8",
    "#dbc6e9",
    "#f2c9c3",
    "#bfd7d9",
  ];
  const lanePattern = [0.08, 0.52, 0.18, 0.62, 0.14, 0.46, 0.24, 0.68];
  const scalePattern = [0.84, 1.14, 0.94, 1.2, 0.8, 1.08, 0.9, 1.18];
  const gapPattern = [0.11, 0.14, 0.1, 0.15, 0.12, 0.13, 0.11];
  const videoWheelSensitivity = 1.35;
  const videoCards = timelineCards.map((card, index) => ({
    element: card,
    visual: card.querySelector(".video-card-visual"),
    currentX: 0,
    currentY: 0,
    strength: 13 + (index % 3) * 1.6,
  }));
  let currentTrackOffset = 0;
  let targetTrackOffset = 0;
  let maxTrackOffset = 0;
  let scrollbarThumbRatio = 0.18;
  let isVideoScrollbarActive = false;
  let isVideoScrollbarDragging = false;
  let videoSceneFrame = 0;
  let lastVideoMediaRefresh = -Infinity;
  let forceVideoMediaRefresh = true;

  const refreshVisibleVideoMedia = () => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const horizontalBuffer = videoIsMobileLayout.matches
      ? viewportWidth * 0.16
      : viewportWidth * 0.8;
    const verticalBuffer = videoIsMobileLayout.matches
      ? viewportHeight * 0.42
      : viewportHeight * 0.24;
    const priorityCardCount = videoIsMobileLayout.matches ? 3 : 4;

    videoCards.forEach((card, index) => {
      const { element, visual } = card;

      if (!visual) {
        return;
      }

      const rect = element.getBoundingClientRect();
      const isInViewport =
        rect.right >= 0 &&
        rect.left <= viewportWidth &&
        rect.bottom >= 0 &&
        rect.top <= viewportHeight;
      const isWithinMediaRange =
        rect.right >= -horizontalBuffer &&
        rect.left <= viewportWidth + horizontalBuffer &&
        rect.bottom >= -verticalBuffer &&
        rect.top <= viewportHeight + verticalBuffer;
      const shouldLoadThumb = isWithinMediaRange || index < priorityCardCount;

      if (shouldLoadThumb) {
        const thumbPriority = isInViewport || index < priorityCardCount
          ? "high"
          : isWithinMediaRange
            ? "auto"
            : "low";

        ensureVideoVisualThumbLoaded(visual, {
          priority: thumbPriority,
        });
      }

      if (isWithinMediaRange) {
        ensureVideoVisualHoverVideoLoaded(visual, { preload: "metadata" });
      } else {
        releaseVideoVisualHoverVideo(visual);
      }

      element.classList.toggle("is-near-viewport", isWithinMediaRange);
    });
  };

  const applyVideoTrackOffset = (offset) => {
    videoTimeline.style.setProperty("--track-offset", `${offset.toFixed(2)}px`);
  };

  const syncVideoScrollbarState = () => {
    if (!videoScrollbar) {
      return;
    }

    videoScrollbar.classList.toggle("is-active", isVideoScrollbarActive);
    videoScrollbar.classList.toggle("is-dragging", isVideoScrollbarDragging);
  };

  const updateVideoScrollbar = (offset = currentTrackOffset) => {
    if (!videoScrollbar || !videoScrollbarThumb) {
      return;
    }

    if (videoIsMobileLayout.matches || maxTrackOffset <= 0) {
      videoScrollbar.hidden = true;
      isVideoScrollbarActive = false;
      isVideoScrollbarDragging = false;
      syncVideoScrollbarState();
      return;
    }

    videoScrollbar.hidden = false;

    const progress = clamp(offset / maxTrackOffset, 0, 1);
    videoScrollbarThumb.style.setProperty(
      "--scrollbar-progress",
      progress.toFixed(4)
    );
    videoScrollbarThumb.style.setProperty(
      "--scrollbar-size",
      scrollbarThumbRatio.toFixed(4)
    );
  };

  const setVideoScrollbarActivityFromPointer = (clientY) => {
    if (!videoScrollbar || videoIsMobileLayout.matches || maxTrackOffset <= 0) {
      return;
    }

    const rect = videoScrollbar.getBoundingClientRect();
    const nearBottomZone = window.innerHeight - 96;
    const isNearBottom = clientY >= nearBottomZone;
    const isOverScrollbar = clientY >= rect.top - 10 && clientY <= rect.bottom + 10;

    isVideoScrollbarActive = isVideoScrollbarDragging || isNearBottom || isOverScrollbar;
    syncVideoScrollbarState();
  };

  const syncTimelineOffsetFromProgress = (progress, { immediate = false } = {}) => {
    const normalizedProgress = clamp(progress, 0, 1);
    targetTrackOffset = normalizedProgress * maxTrackOffset;

    if (immediate || prefersReducedMotion.matches) {
      currentTrackOffset = targetTrackOffset;
      applyVideoTrackOffset(currentTrackOffset);
      updateVideoScrollbar(currentTrackOffset);
    }
  };

  const syncTimelineOffsetFromPointerX = (clientX, { immediate = false } = {}) => {
    if (!videoScrollbarTrack || maxTrackOffset <= 0) {
      return;
    }

    const rect = videoScrollbarTrack.getBoundingClientRect();
    const usableWidth = Math.max(rect.width, 1);
    const nextProgress = (clientX - rect.left) / usableWidth;

    syncTimelineOffsetFromProgress(nextProgress, { immediate });
  };

  const getFittedVideoCardTitleMetrics = ({
    card,
    baseWidth,
    maxWidth,
  }) => {
    const labelMask = card.querySelector(".video-card-label-mask");
    const labelRow = card.querySelector(".video-card-label-row");
    const labelValue = card.querySelector(".video-card-label-value");

    if (!labelMask || !labelRow || !labelValue) {
      return {
        cardWidth: baseWidth,
        titleScale: 1,
      };
    }

    card.style.setProperty("--card-width", `${baseWidth.toFixed(2)}px`);
    card.style.setProperty("--card-title-scale", "1");

    const maskWidth = labelMask.clientWidth || baseWidth;
    const titleWidth = labelValue.getBoundingClientRect().width;
    const captionSize =
      Number.parseFloat(window.getComputedStyle(labelRow).fontSize) || 14;
    const hoverReserve = Math.max(captionSize * 0.92, 12);
    const availableWidth = Math.max(maskWidth - hoverReserve, 48);

    if (!titleWidth || titleWidth <= availableWidth) {
      return {
        cardWidth: baseWidth,
        titleScale: 1,
      };
    }

    const fittedScale = availableWidth / titleWidth;

    if (fittedScale >= 0.9) {
      return {
        cardWidth: baseWidth,
        titleScale: clamp(fittedScale, 0.9, 1),
      };
    }

    const minimumScale = 0.9;
    const requiredWidth = titleWidth * minimumScale + hoverReserve;
    const adjustedWidth = clamp(
      Math.max(baseWidth, requiredWidth),
      baseWidth,
      maxWidth
    );
    const adjustedAvailableWidth = Math.max(adjustedWidth - hoverReserve, 48);

    return {
      cardWidth: adjustedWidth,
      titleScale: clamp(adjustedAvailableWidth / titleWidth, minimumScale, 1),
    };
  };

  const syncVideoPageOverflow = () => {
    if (document.body.classList.contains("is-showreel-open")) {
      document.documentElement.style.setProperty("overflow-y", "hidden");
      document.body.style.setProperty("overflow-y", "hidden");
      return;
    }

    if (videoIsMobileLayout.matches) {
      document.documentElement.style.removeProperty("overflow-y");
      document.body.style.removeProperty("overflow-y");
      return;
    }

    document.documentElement.style.setProperty("overflow-y", "hidden");
    document.body.style.setProperty("overflow-y", "hidden");
    window.scrollTo({
      top: 0,
      behavior: "auto",
    });
  };

  const syncVideoTimelineScroll = ({ snap = false } = {}) => {
    if (videoIsMobileLayout.matches) {
      targetTrackOffset = 0;

      if (snap || prefersReducedMotion.matches) {
        currentTrackOffset = 0;
      }

      applyVideoTrackOffset(0);
      updateVideoScrollbar(0);
      return;
    }

    targetTrackOffset = clamp(targetTrackOffset, 0, maxTrackOffset);
    currentTrackOffset = clamp(currentTrackOffset, 0, maxTrackOffset);

    if (snap || prefersReducedMotion.matches) {
      currentTrackOffset = targetTrackOffset;
      applyVideoTrackOffset(currentTrackOffset);
      updateVideoScrollbar(currentTrackOffset);
    }
  };

  const animateVideoScene = (timestamp = performance.now()) => {
    const motionDisabled = prefersReducedMotion.matches || videoIsMobileLayout.matches;
    const timelineEase =
      prefersReducedMotion.matches ? 1 : isVideoScrollbarDragging ? 0.18 : 0.1;

    currentTrackOffset += (targetTrackOffset - currentTrackOffset) * timelineEase;

    if (Math.abs(targetTrackOffset - currentTrackOffset) < 0.1) {
      currentTrackOffset = targetTrackOffset;
    }

    applyVideoTrackOffset(currentTrackOffset);
    updateVideoScrollbar(currentTrackOffset);

    if (forceVideoMediaRefresh || timestamp - lastVideoMediaRefresh >= 120) {
      refreshVisibleVideoMedia();
      lastVideoMediaRefresh = timestamp;
      forceVideoMediaRefresh = false;
    }

    videoCards.forEach((card) => {
      let pointerX = 0;
      let pointerY = 0;

      if (!motionDisabled && videoCanHover && videoPointer.active) {
        const rect = card.element.getBoundingClientRect();
        const cardCenterX = rect.left + rect.width / 2;
        const cardCenterY = rect.top + rect.height / 2;
        const dx = videoPointer.x - cardCenterX;
        const dy = videoPointer.y - cardCenterY;
        const distance = Math.hypot(dx, dy);
        const influenceRadius = Math.max(rect.width, rect.height) * 1.9;
        const influence = clamp(1 - distance / influenceRadius, 0, 1);
        const easedInfluence = influence * influence;

        if (easedInfluence > 0) {
          const normalizedX = dx / influenceRadius;
          const normalizedY = dy / influenceRadius;

          pointerX = clamp(
            normalizedX * card.strength * 4.2 * easedInfluence,
            -30,
            30
          );
          pointerY = clamp(
            normalizedY * card.strength * 4.9 * easedInfluence,
            -22,
            22
          );
        }
      }

      const targetX = pointerX;
      const targetY = pointerY;
      const ease = motionDisabled ? 0.2 : 0.085;

      card.currentX += (targetX - card.currentX) * ease;
      card.currentY += (targetY - card.currentY) * ease;

      if (Math.abs(card.currentX) < 0.02) {
        card.currentX = 0;
      }

      if (Math.abs(card.currentY) < 0.02) {
        card.currentY = 0;
      }

      card.element.style.setProperty("--card-fx", `${card.currentX.toFixed(2)}px`);
      card.element.style.setProperty("--card-fy", `${card.currentY.toFixed(2)}px`);
    });

    videoSceneFrame = window.requestAnimationFrame(animateVideoScene);
  };

  const startVideoScene = () => {
    if (videoSceneFrame) {
      return;
    }

    videoSceneFrame = window.requestAnimationFrame(animateVideoScene);
  };

  const handleVideoWheel = (event) => {
    if (videoIsMobileLayout.matches) {
      return;
    }

    event.preventDefault();

    const deltaScale =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? window.innerHeight
          : 1;
    const scrollDelta =
      (event.deltaY + event.deltaX) * deltaScale * videoWheelSensitivity;

    if (Math.abs(scrollDelta) < 0.1) {
      return;
    }

    targetTrackOffset = clamp(targetTrackOffset + scrollDelta, 0, maxTrackOffset);

    if (prefersReducedMotion.matches) {
      currentTrackOffset = targetTrackOffset;
      applyVideoTrackOffset(currentTrackOffset);
    }
  };

  const layoutVideoTimeline = () => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    syncVideoPageOverflow();

    if (videoIsMobileLayout.matches) {
      const mobileSidePadding = clamp(viewportWidth * 0.12, 32, 56);
      const mobileBaseWidth = clamp(viewportWidth * 0.56, 176, 248);
      const mobileShiftLimit = clamp(viewportWidth * 0.155, 24, 52);
      const mobileShiftPattern = [0, -0.9, 0.68, -0.42, 0.88, -0.28, 0.54, -0.74];

      videoTimeline.style.setProperty("--card-caption-size", "14px");
      videoTimeline.style.setProperty(
        "--mobile-side-padding",
        `${mobileSidePadding.toFixed(2)}px`
      );
      document.body.style.setProperty("--showreel-caption-size", "14px");
      videoTimeline.style.width = "100%";
      videoTimeline.style.height = "auto";
      timelineScrollArea.style.minHeight = "auto";
      scrollbarThumbRatio = 1;
      maxTrackOffset = 0;
      currentTrackOffset = 0;
      targetTrackOffset = 0;
      applyVideoTrackOffset(0);
      updateVideoScrollbar(0);

      const mobileMetrics = timelineCards.map((card, index) => {
        const isVertical = card.dataset.format === "vertical";
        const scaleFactor = scalePattern[index % scalePattern.length];
        const formatWidthFactor = isVertical ? 0.78 : 1;
        const baseWidth = mobileBaseWidth * scaleFactor * formatWidthFactor;
        const rawShift =
          mobileShiftPattern[index % mobileShiftPattern.length] * mobileShiftLimit;
        const maxWidth = Math.max(
          viewportWidth - mobileSidePadding * 2,
          baseWidth
        );
        const { cardWidth, titleScale } = getFittedVideoCardTitleMetrics({
          card,
          baseWidth,
          maxWidth,
        });

        return {
          card,
          index,
          cardWidth,
          titleScale,
          rawShift,
        };
      });

      const mobileBounds = mobileMetrics.reduce(
        (bounds, metric) => ({
          minLeft: Math.min(bounds.minLeft, -metric.cardWidth / 2 + metric.rawShift),
          maxRight: Math.max(bounds.maxRight, metric.cardWidth / 2 + metric.rawShift),
        }),
        {
          minLeft: Number.POSITIVE_INFINITY,
          maxRight: Number.NEGATIVE_INFINITY,
        }
      );
      const mobileBalanceShift =
        Number.isFinite(mobileBounds.minLeft) && Number.isFinite(mobileBounds.maxRight)
          ? -((mobileBounds.minLeft + mobileBounds.maxRight) * 0.5)
          : 0;

      mobileMetrics.forEach((metric) => {
        const centeredShift = metric.rawShift + mobileBalanceShift;

        metric.card.style.setProperty("--card-width", `${metric.cardWidth.toFixed(2)}px`);
        metric.card.style.setProperty(
          "--card-title-scale",
          metric.titleScale.toFixed(3)
        );
        metric.card.style.setProperty(
          "--mobile-shift",
          `${centeredShift.toFixed(2)}px`
        );
        metric.card.style.setProperty(
          "--entry-delay",
          `${(0.08 + metric.index * 0.08).toFixed(2)}s`
        );
        metric.card.style.setProperty(
          "--card-color",
          pastelPalette[metric.index % pastelPalette.length]
        );
        metric.card.style.removeProperty("--card-x");
        metric.card.style.removeProperty("--card-y");
      });

      return;
    }

    const captionScale =
      viewportWidth <= 640
        ? 1
        : clamp(Math.min(viewportWidth / 1440, viewportHeight / 980), 0.9, 1.28);
    const paddingRatio = Number.parseFloat(videoTimeline.dataset.trackPadding) || 0.14;
    const sidePadding = viewportWidth * paddingRatio;
    const trailingPadding = viewportWidth <= 640 ? 88 : sidePadding;
    const baseCardWidth =
      viewportWidth <= 640
        ? clamp(viewportWidth * 0.72, 220, 310)
        : clamp(viewportWidth * 0.31, 280, 460);
    const safeTop = viewportWidth <= 640 ? 112 : 160;
    const safeBottom = viewportWidth <= 640 ? 120 : 92;
    videoTimeline.style.setProperty(
      "--card-caption-size",
      `${(14 * captionScale).toFixed(2)}px`
    );
    document.body.style.setProperty(
      "--showreel-caption-size",
      `${(14 * captionScale).toFixed(2)}px`
    );
    videoTimeline.style.height = "100vh";

    const cardMetrics = timelineCards.map((card, index) => {
      const isVertical = card.dataset.format === "vertical";
      const scaleFactor = scalePattern[index % scalePattern.length];
      const formatWidthFactor = isVertical ? 0.74 : 1;
      const baseWidth = baseCardWidth * scaleFactor * formatWidthFactor;
      const aspectRatio = isVertical ? 2 / 3 : 3 / 2;
      const maxWidth = Math.max(
        baseWidth,
        viewportWidth * (isVertical ? 0.44 : 0.62)
      );
      const { cardWidth, titleScale } = getFittedVideoCardTitleMetrics({
        card,
        baseWidth,
        maxWidth,
      });
      const cardHeight = cardWidth / aspectRatio;

      return {
        card,
        index,
        isVertical,
        cardWidth,
        cardHeight,
        titleScale,
      };
    });
    const maxCardHeight = Math.max(
      ...cardMetrics.map((metric) => metric.cardHeight),
      0
    );
    const availableHeight = Math.max(
      viewportHeight - safeTop - safeBottom - maxCardHeight,
      120
    );
    let cursor = sidePadding;
    let lastCardWidth = cardMetrics[0]?.cardWidth || baseCardWidth;

    cardMetrics.forEach((metric) => {
      const { card, index, cardWidth, cardHeight, titleScale } = metric;
      const gapRatio = gapPattern[(index - 1 + gapPattern.length) % gapPattern.length];
      const gap = viewportWidth * gapRatio;

      if (index > 0) {
        cursor += lastCardWidth + gap;
      }

      const lane = lanePattern[index % lanePattern.length];
      const y =
        safeTop + availableHeight * lane + (maxCardHeight - cardHeight) * 0.5;

      card.style.setProperty("--card-width", `${cardWidth.toFixed(2)}px`);
      card.style.setProperty("--card-title-scale", titleScale.toFixed(3));
      card.style.setProperty("--mobile-shift", "0px");
      card.style.setProperty("--card-x", `${cursor.toFixed(2)}px`);
      card.style.setProperty("--card-y", `${y.toFixed(2)}px`);
      card.style.setProperty("--entry-delay", `${(0.1 + index * 0.09).toFixed(2)}s`);
      card.style.setProperty("--card-color", pastelPalette[index % pastelPalette.length]);

      lastCardWidth = cardWidth;
    });

    const lastCardX =
      Number.parseFloat(
        timelineCards[timelineCards.length - 1]?.style.getPropertyValue("--card-x")
      ) || 0;
    const lastWidth =
      Number.parseFloat(
        timelineCards[timelineCards.length - 1]?.style.getPropertyValue("--card-width")
      ) || baseCardWidth;
    const trackWidth = lastCardX + lastWidth + trailingPadding;

    maxTrackOffset = Math.max(trackWidth - viewportWidth, 0);
    scrollbarThumbRatio = clamp(viewportWidth / Math.max(trackWidth, viewportWidth), 0.12, 0.42);
    videoTimeline.style.width = `${trackWidth.toFixed(2)}px`;
    timelineScrollArea.style.minHeight = `${viewportHeight.toFixed(2)}px`;

    syncVideoTimelineScroll({ snap: true });
    forceVideoMediaRefresh = true;
    refreshVisibleVideoMedia();
  };

  if (videoCanHover) {
    window.addEventListener("pointermove", (event) => {
      videoPointer.x = event.clientX;
      videoPointer.y = event.clientY;
      videoPointer.active = true;
      setVideoScrollbarActivityFromPointer(event.clientY);

      if (isVideoScrollbarDragging) {
        syncTimelineOffsetFromPointerX(event.clientX);
      }
    });

    window.addEventListener("pointerleave", () => {
      videoPointer.active = false;

      if (!isVideoScrollbarDragging) {
        isVideoScrollbarActive = false;
        syncVideoScrollbarState();
      }
    });

    window.addEventListener("pointerup", () => {
      if (!isVideoScrollbarDragging) {
        return;
      }

      isVideoScrollbarDragging = false;
      if (videoPointer.active) {
        setVideoScrollbarActivityFromPointer(videoPointer.y);
        return;
      }

      syncVideoScrollbarState();
    });

    window.addEventListener("pointercancel", () => {
      if (!isVideoScrollbarDragging) {
        return;
      }

      isVideoScrollbarDragging = false;
      if (videoPointer.active) {
        setVideoScrollbarActivityFromPointer(videoPointer.y);
        return;
      }

      syncVideoScrollbarState();
    });
  }

  if (videoScrollbarTrack) {
    videoScrollbarTrack.addEventListener("pointerdown", (event) => {
      if (videoIsMobileLayout.matches || maxTrackOffset <= 0) {
        return;
      }

      event.preventDefault();
      isVideoScrollbarDragging = true;
      isVideoScrollbarActive = true;
      syncVideoScrollbarState();
      syncTimelineOffsetFromPointerX(event.clientX);
    });
  }

  layoutVideoTimeline();
  window.addEventListener("resize", layoutVideoTimeline);
  timelineScrollArea.addEventListener("wheel", handleVideoWheel, { passive: false });
  startVideoScene();
};

const initVideoPage = () => {
  if (!videoTimeline || !timelineScrollArea) {
    return;
  }

  initVideoHoverMedia();
  initVideoProjectLinks();
  initVideoTimelineScene();
};

initVideoPage();

const categorySection = document.querySelector(".categories");
const categoryCards = document.querySelectorAll(".category-card");
const canHover =
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const isMobileLayout = window.matchMedia("(max-width: 640px)");
const landing = document.querySelector(".landing");
const intro = document.querySelector(".intro");
const locationBlock = document.querySelector(".location");
const shopButton = document.querySelector(".shop-button");

if (categorySection && categoryCards.length) {
  const pointer = { x: 0, y: 0, active: false };
  const cards = Array.from(categoryCards).map((card, index) => ({
    element: card,
    currentX: 0,
    currentY: 0,
    targetX: 0,
    targetY: 0,
    strength: index === 0 ? 18 : 16,
  }));

  const updateMobileLandingLayout = () => {
    if (!landing || !isMobileLayout.matches) {
      if (landing) {
        landing.style.removeProperty("--mobile-card-width");
        landing.style.removeProperty("--mobile-card-gap");
        landing.style.removeProperty("--mobile-side-padding");
      }
      return;
    }

    const sidePadding = Math.max(window.innerWidth * 0.15, 20);
    const introHeight = intro ? intro.offsetHeight : 0;
    const shopHeight = shopButton ? shopButton.offsetHeight : 0;
    const footerHeight = locationBlock ? locationBlock.offsetHeight : 0;

    const topZone = Math.max(introHeight, shopHeight) + 36;
    const bottomZone = footerHeight + 36;
    const availableHeight = window.innerHeight - topZone - bottomZone - 28;
    const mobileGap = clamp(availableHeight * 0.055, 12, 22);
    const labelAllowance = 28;
    const widthFromHeight = Math.max(
      (availableHeight - labelAllowance * 3 - mobileGap * 2) / 2,
      190
    );
    const widthFromViewport = window.innerWidth - sidePadding * 2;
    const mobileWidth = clamp(
      Math.min(widthFromHeight, widthFromViewport),
      190,
      widthFromViewport
    );

    landing.style.setProperty("--mobile-side-padding", `${sidePadding.toFixed(1)}px`);
    landing.style.setProperty("--mobile-card-gap", `${mobileGap.toFixed(1)}px`);
    landing.style.setProperty("--mobile-card-width", `${mobileWidth.toFixed(1)}px`);
  };

  const updateGroupScale = () => {
    if (isMobileLayout.matches) {
      categorySection.style.setProperty("--group-scale", "1");
      return;
    }

    const widthScale = window.innerWidth / 1440;
    const heightScale = window.innerHeight / 980;
    const scale = clamp(Math.min(widthScale, heightScale), 0.9, 1.28);

    categorySection.style.setProperty("--group-scale", scale.toFixed(3));
  };

  const centerGroup = () => {
    if (isMobileLayout.matches) {
      categorySection.style.setProperty("--gx", "0px");
      categorySection.style.setProperty("--gy", "0px");
      return;
    }

    let minLeft = Infinity;
    let minTop = Infinity;
    let maxRight = -Infinity;
    let maxBottom = -Infinity;

    cards.forEach((card) => {
      const { element } = card;
      const left = element.offsetLeft;
      const top = element.offsetTop;
      const right = left + element.offsetWidth;
      const bottom = top + element.offsetHeight;

      minLeft = Math.min(minLeft, left);
      minTop = Math.min(minTop, top);
      maxRight = Math.max(maxRight, right);
      maxBottom = Math.max(maxBottom, bottom);
    });

    const groupCenterX = (minLeft + maxRight) / 2;
    const groupCenterY = (minTop + maxBottom) / 2;
    const offsetX = categorySection.clientWidth / 2 - groupCenterX;
    const offsetY = categorySection.clientHeight / 2 - groupCenterY;

    categorySection.style.setProperty("--gx", `${offsetX.toFixed(2)}px`);
    categorySection.style.setProperty("--gy", `${offsetY.toFixed(2)}px`);
  };

  const updateTargets = () => {
    if (!canHover || isMobileLayout.matches) {
      cards.forEach((card) => {
        card.targetX = 0;
        card.targetY = 0;
      });
      return;
    }

    cards.forEach((card) => {
      if (!pointer.active) {
        card.targetX = 0;
        card.targetY = 0;
        return;
      }

      const rect = card.element.getBoundingClientRect();
      const cardCenterX = rect.left + rect.width / 2;
      const cardCenterY = rect.top + rect.height / 2;
      const dx = pointer.x - cardCenterX;
      const dy = pointer.y - cardCenterY;
      const distance = Math.hypot(dx, dy);
      const influenceRadius = Math.max(rect.width, rect.height) * 1.85;
      const influence = clamp(1 - distance / influenceRadius, 0, 1);
      const easedInfluence = influence * influence;

      if (easedInfluence === 0) {
        card.targetX = 0;
        card.targetY = 0;
        return;
      }

      const normalizedX = dx / influenceRadius;
      const normalizedY = dy / influenceRadius;

      card.targetX = clamp(
        normalizedX * card.strength * 4.4 * easedInfluence,
        -32,
        32
      );
      card.targetY = clamp(
        normalizedY * card.strength * 5.2 * easedInfluence,
        -24,
        24
      );
    });
  };

  const syncLayout = () => {
    updateMobileLandingLayout();
    updateGroupScale();
    centerGroup();
    updateTargets();
  };

  const animate = () => {
    cards.forEach((card) => {
      card.currentX += (card.targetX - card.currentX) * 0.08;
      card.currentY += (card.targetY - card.currentY) * 0.08;

      card.element.style.setProperty("--mx", `${card.currentX.toFixed(2)}px`);
      card.element.style.setProperty("--my", `${card.currentY.toFixed(2)}px`);
    });

    requestAnimationFrame(animate);
  };

  if (canHover) {
    window.addEventListener("pointermove", (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
      updateTargets();
    });

    window.addEventListener("pointerleave", () => {
      pointer.active = false;
      updateTargets();
    });

    animate();
  }

  window.addEventListener("resize", syncLayout);
  window.addEventListener("load", syncLayout);

  if (document.fonts) {
    document.fonts.ready.then(() => {
      syncLayout();
      if (!isFolioPage) {
        if (isBackForwardLoad) {
          playPageEntry({ withWhiteFade: true });
        } else {
          startIntroAnimation();
        }
      }
    });
  } else if (!isFolioPage) {
    if (isBackForwardLoad) {
      playPageEntry({ withWhiteFade: true });
    } else {
      startIntroAnimation();
    }
  }

  syncLayout();
} else if (isFolioPage) {
  playPageEntry();
} else if (isBackForwardLoad) {
  playPageEntry({ withWhiteFade: true });
} else {
  startIntroAnimation();
}

window.addEventListener("pageshow", (event) => {
  if (!event.persisted) {
    return;
  }

  if (isFolioPage) {
    playPageEntry();
    return;
  }

  playPageEntry({ withWhiteFade: true });
});
