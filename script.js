const pageTransition = document.querySelector(".page-transition");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const backButton = document.querySelector(".back-button");
const showreelButton = document.querySelector(".showreel-button");
const showreelOverlay = document.querySelector(".showreel-overlay");
const showreelIframe = document.querySelector(".showreel-iframe");
const projectPlayerOverlay = document.querySelector(".project-player-overlay");
const projectPlayerDialog = document.querySelector(".project-player-dialog");
const projectPlayerEmbedShell = document.querySelector(".project-player-embed-shell");
const photoLightbox = document.querySelector(".photo-lightbox");
const photoLightboxStage = document.querySelector(".photo-lightbox-stage");
let photoLightboxCanvasShell = document.querySelector(".photo-lightbox-canvas-shell");
let photoLightboxLowResCanvas = document.querySelector(".photo-lightbox-canvas-lowres");
let photoLightboxHighResCanvas = document.querySelector(".photo-lightbox-canvas-highres");
let photoLightboxCaption = document.querySelector(".photo-lightbox-caption");
const photoGrid = document.querySelector(".photo-grid");
const photographyPageShell = document.querySelector(".photography-page-shell");
const photographyPatternBase = document.querySelector(".photography-pattern-base");
const photographyPatternFocus = document.querySelector(".photography-pattern-focus");
const videoTimeline = document.querySelector(".video-timeline");
const timelineScrollArea = document.querySelector(".timeline-scroll-area");
const videoScrollbar = document.querySelector(".video-scrollbar");
const videoScrollbarTrack = document.querySelector(".video-scrollbar-track");
const videoScrollbarThumb = document.querySelector(".video-scrollbar-thumb");
const folioTitle = document.querySelector(".folio-title");
const navigationEntry = performance.getEntriesByType("navigation")[0];
const isBackForwardLoad = navigationEntry?.type === "back_forward";
const isPhotographyPage = document.body.classList.contains("photography-page");
const isVideoPage = document.body.classList.contains("video-page");
const isMotionDesignPage = document.body.classList.contains("motion-design-page");
const isFolioPage = isPhotographyPage || isVideoPage;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const videoProjectLinksCache = new Map();
const videoLinkPriority = ["youtube", "tiktok", "instagram"];
const videoOverlayTransitionDuration = 360;
const photoLightboxTransitionDuration = 520;
const videoHoverResumeRetentionDuration = 2000;
const videoHoverResetTimers = new WeakMap();
const videoHoverResumeTimes = new WeakMap();
const photoEventLabelMap = Object.freeze({
  "telethon-gaming-2025": "Telethon Gaming 2025",
  "living-the-dream-2026": "Living The Dream 2026",
  "coupe-de-france-slash-2025": "Coupe de France Slash 2025",
  "editing-con-paris-2026": "Editing Con Paris 2026",
  "rlcs-paris-major-2026": "RLCS Paris Major 2026",
  "paris-games-week-2025": "Paris Games Week 2025",
});
const videoCardAspectRatios = {
  vertical: 2 / 3,
  wide: 1920 / 803,
  landscape: 3 / 2,
};
const motionDesignCardAspectRatios = {
  vertical: 4 / 5,
  wide: 1920 / 803,
  landscape: 5 / 4,
};
const videoRoleMap = {
  m: "Montage",
  md: "Motion Design",
  fx: "FX",
  cg: "Étalonnage",
  sd: "Sound Design",
  dr: "Derush",
};
const projectPlayerAspectRatios = {
  vertical: 9 / 16,
  wide: 1920 / 803,
  landscape: 16 / 9,
};
let vimeoPlayerApiPromise = null;
let showreelPlayer = null;
let showreelPlayerInitPromise = null;
let activeVideoOverlay = "none";
let isPhotoLightboxActive = false;
let isPhotoLightboxTransitioning = false;
let isPhotoLightboxLoading = false;
let activePhotoLightboxTile = null;
let activePhotoLightboxImage = null;
let activePhotoLightboxHighResDrawable = null;
let activePhotoLightboxCanvasRenderToken = 0;
let photoLightboxCleanupTimer = 0;
let photoLightboxCaptionTimer = 0;
let syncPhotographyScrollbar = null;

const isPhotoLightboxOpen = () => isPhotoLightboxActive;

const ensurePhotoLightboxCaptionDom = () => {
  if (!photoLightboxStage) {
    return false;
  }

  if (!photoLightboxCaption || !photoLightboxStage.contains(photoLightboxCaption)) {
    photoLightboxCaption = photoLightboxStage.querySelector(".photo-lightbox-caption");
  }

  if (!photoLightboxCaption) {
    photoLightboxCaption = document.createElement("p");
    photoLightboxCaption.className = "photo-lightbox-caption";
    photoLightboxCaption.hidden = true;
    photoLightboxStage.appendChild(photoLightboxCaption);
  }

  return Boolean(photoLightboxCaption);
};

const ensurePhotoLightboxCanvasDom = () => {
  if (!photoLightboxStage) {
    return false;
  }

  if (
    !photoLightboxCanvasShell ||
    !photoLightboxStage.contains(photoLightboxCanvasShell)
  ) {
    photoLightboxCanvasShell = photoLightboxStage.querySelector(
      ".photo-lightbox-canvas-shell"
    );
  }

  if (!photoLightboxCanvasShell) {
    photoLightboxCanvasShell = document.createElement("div");
    photoLightboxCanvasShell.className = "photo-lightbox-canvas-shell";
    photoLightboxCanvasShell.setAttribute("aria-hidden", "true");
    photoLightboxStage.appendChild(photoLightboxCanvasShell);
  }

  if (
    !photoLightboxLowResCanvas ||
    !photoLightboxCanvasShell.contains(photoLightboxLowResCanvas)
  ) {
    photoLightboxLowResCanvas = photoLightboxCanvasShell.querySelector(
      ".photo-lightbox-canvas-lowres"
    );
  }

  if (!photoLightboxLowResCanvas) {
    photoLightboxLowResCanvas = document.createElement("canvas");
    photoLightboxLowResCanvas.className =
      "photo-lightbox-canvas photo-lightbox-canvas-lowres";
    photoLightboxCanvasShell.appendChild(photoLightboxLowResCanvas);
  }

  if (
    !photoLightboxHighResCanvas ||
    !photoLightboxCanvasShell.contains(photoLightboxHighResCanvas)
  ) {
    photoLightboxHighResCanvas = photoLightboxCanvasShell.querySelector(
      ".photo-lightbox-canvas-highres"
    );
  }

  if (!photoLightboxHighResCanvas) {
    photoLightboxHighResCanvas = document.createElement("canvas");
    photoLightboxHighResCanvas.className =
      "photo-lightbox-canvas photo-lightbox-canvas-highres";
    photoLightboxCanvasShell.appendChild(photoLightboxHighResCanvas);
  }

  return Boolean(
    photoLightboxCanvasShell &&
      photoLightboxLowResCanvas &&
      photoLightboxHighResCanvas
  );
};

const syncSharedMediaOverlayState = () => {
  const isOpen = activeVideoOverlay !== "none" || isPhotoLightboxOpen();
  const scrollbarCompensation =
    isPhotographyPage && isOpen
      ? Math.max(window.innerWidth - document.documentElement.clientWidth, 0)
      : 0;

  document.documentElement.classList.toggle("is-media-overlay-open", isOpen);
  document.body.classList.toggle("is-media-overlay-open", isOpen);

  if (scrollbarCompensation > 0) {
    document.body.style.paddingRight = `${scrollbarCompensation}px`;
  } else {
    document.body.style.removeProperty("padding-right");
  }

  if (typeof syncPhotographyScrollbar === "function") {
    syncPhotographyScrollbar();
  }
};

const normalizeVisibleRoute = () => {
  if (window.location.protocol === "file:") {
    return;
  }

  if (window.location.pathname !== "/index.html") {
    return;
  }

  const normalizedUrl = `/${window.location.search}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", normalizedUrl);
};

normalizeVisibleRoute();
ensurePhotoLightboxCanvasDom();
ensurePhotoLightboxCaptionDom();

const getVideoVisualMediaSource = (visual) => {
  if (!visual) {
    return "";
  }

  const mediaSource =
    visual.querySelector(".video-card-hover-video source")?.getAttribute("src") ||
    visual.querySelector(".video-card-hover-video source")?.dataset.src ||
    visual.querySelector(".video-card-thumb")?.getAttribute("src") ||
    visual.querySelector(".video-card-thumb")?.dataset.src ||
    "";

  return mediaSource;
};

const getVideoVisualFolderName = (visual) => {
  if (!visual) {
    return "";
  }

  if (visual.dataset.projectFolder) {
    return visual.dataset.projectFolder;
  }

  const mediaSource = getVideoVisualMediaSource(visual);

  if (!mediaSource) {
    return "";
  }

  const normalizedPath = mediaSource.replace(/\\/g, "/");
  const segments = normalizedPath.split("/").filter(Boolean);

  return decodeURIComponent(segments.at(-2) || "");
};

const getVideoVisualProjectRoot = (visual) => {
  if (!visual) {
    return "./rsrc/montage-video";
  }

  if (visual.dataset.projectRoot) {
    return visual.dataset.projectRoot;
  }

  const mediaSource = getVideoVisualMediaSource(visual);

  if (!mediaSource) {
    return "./rsrc/montage-video";
  }

  try {
    const url = new URL(mediaSource, window.location.href);
    const segments = url.pathname.split("/").filter(Boolean);
    const rsrcIndex = segments.lastIndexOf("rsrc");

    if (rsrcIndex >= 0 && segments.length > rsrcIndex + 1) {
      const projectRoot = `./${segments.slice(rsrcIndex, rsrcIndex + 2).join("/")}`;
      visual.dataset.projectRoot = projectRoot;
      return projectRoot;
    }
  } catch {}

  return "./rsrc/montage-video";
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

const getVideoProjectLinkCacheKey = (projectRoot, folderName) => {
  if (!folderName) {
    return "";
  }

  return `${projectRoot || "./rsrc/montage-video"}::${folderName}`;
};

const getVideoVisualRoleLabel = (visual) => {
  if (!visual || isMotionDesignPage) {
    return "";
  }

  const folderName = getVideoVisualFolderName(visual);

  if (!folderName) {
    return "";
  }

  const folderParts = folderName.split("_");
  const roleTokens = folderParts
    .slice(2)
    .join("_")
    .split(" - ")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  return roleTokens
    .map((token) => videoRoleMap[token])
    .filter(Boolean)
    .join(" · ");
};

const buildVideoProjectFileUrl = (projectRoot, folderName, fileName) => {
  if (!projectRoot || !folderName || !fileName) {
    return null;
  }

  const encodedFolder = folderName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  const normalizedRoot = projectRoot.replace(/\/+$/, "");

  return new URL(`${normalizedRoot}/${encodedFolder}/${fileName}`, window.location.href);
};

const getVideoVisualThumb = (visual) =>
  visual?.querySelector(".video-card-thumb") || null;

const getVideoVisualHoverVideo = (visual) =>
  visual?.querySelector(".video-card-hover-video") || null;

const getVideoVisualSource = (visual) =>
  getVideoVisualHoverVideo(visual)?.querySelector("source") || null;

const clearVideoVisualHoverResetTimer = (visual) => {
  const timer = videoHoverResetTimers.get(visual);

  if (!timer) {
    return;
  }

  window.clearTimeout(timer);
  videoHoverResetTimers.delete(visual);
};

const getVideoVisualStoredHoverTime = (visual) => {
  const storedTime = videoHoverResumeTimes.get(visual);
  return Number.isFinite(storedTime) && storedTime > 0 ? storedTime : 0;
};

const setVideoVisualStoredHoverTime = (visual, time) => {
  if (!visual) {
    return;
  }

  if (!Number.isFinite(time) || time <= 0) {
    videoHoverResumeTimes.delete(visual);
    return;
  }

  videoHoverResumeTimes.set(visual, time);
};

const resetVideoVisualStoredHoverTime = (visual) => {
  if (!visual) {
    return;
  }

  videoHoverResumeTimes.delete(visual);
};

const getVideoTimelineCardFormat = (card) => {
  const rawFormat = card?.dataset.format?.trim().toLowerCase();

  if (
    rawFormat === "vertical" ||
    rawFormat === "wide" ||
    rawFormat === "landscape"
  ) {
    return rawFormat;
  }

  return "landscape";
};

const getVideoProjectPlayerFormat = (card) => {
  const cardFormat = getVideoTimelineCardFormat(card);

  if (isMotionDesignPage && cardFormat !== "vertical") {
    return "landscape";
  }

  return cardFormat === "vertical" || cardFormat === "wide"
    ? cardFormat
    : "landscape";
};

const getActiveVideoCardAspectRatios = () =>
  isMotionDesignPage ? motionDesignCardAspectRatios : videoCardAspectRatios;

const getVideoTimelineCardAspectRatio = (card) => {
  const detectedRatio = Number.parseFloat(card?.dataset.projectPlayerAspectRatio || "");

  if (isMotionDesignPage && Number.isFinite(detectedRatio) && detectedRatio > 0) {
    return detectedRatio;
  }

  const format = getVideoTimelineCardFormat(card);
  return getActiveVideoCardAspectRatios()[format] || videoCardAspectRatios.landscape;
};

const getVideoProjectPlayerAspectRatio = (card) => {
  if (isMotionDesignPage) {
    return null;
  }

  const format = getVideoProjectPlayerFormat(card);
  return projectPlayerAspectRatios[format] || projectPlayerAspectRatios.landscape;
};

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

  clearVideoVisualHoverResetTimer(visual);
  resetVideoVisualStoredHoverTime(visual);
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

const getVideoCardFormatFromRatio = (ratio) => {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return "landscape";
  }

  if (isMotionDesignPage) {
    return ratio < 0.95 ? "vertical" : ratio > 1.9 ? "wide" : "landscape";
  }

  return ratio < 0.9 ? "vertical" : ratio > 1.65 ? "wide" : "landscape";
};

let motionDesignRelayoutFrame = 0;

const requestMotionDesignTimelineRelayout = () => {
  if (!isMotionDesignPage || motionDesignRelayoutFrame) {
    return;
  }

  motionDesignRelayoutFrame = window.requestAnimationFrame(() => {
    motionDesignRelayoutFrame = 0;
    window.dispatchEvent(new Event("resize"));
  });
};

const applyMotionDesignCardFormat = (card, width, height) => {
  if (!card || !(width > 0) || !(height > 0)) {
    return false;
  }

  const ratio = width / height;
  const nextFormat = getVideoCardFormatFromRatio(ratio);
  const serializedRatio = ratio.toFixed(6);
  const previousRatio = card.dataset.projectPlayerAspectRatio || "";
  const previousFormat = card.dataset.format || "";

  card.dataset.projectPlayerAspectRatio = serializedRatio;
  card.style.setProperty("--card-media-aspect-ratio", `${width} / ${height}`);

  if (previousFormat === nextFormat && previousRatio === serializedRatio) {
    return true;
  }

  card.dataset.format = nextFormat;
  requestMotionDesignTimelineRelayout();
  return true;
};

const initMotionDesignAutoFormats = () => {
  if (!isMotionDesignPage || !videoTimeline) {
    return;
  }

  const timelineCards = Array.from(
    videoTimeline.querySelectorAll(".video-timeline-card")
  );

  timelineCards.forEach((card) => {
    const rawFormat = card.dataset.format?.trim().toLowerCase();

    if (
      rawFormat === "vertical" ||
      rawFormat === "wide" ||
      rawFormat === "landscape"
    ) {
      return;
    }

    if (card.dataset.autoFormatBound === "true") {
      return;
    }

    card.dataset.autoFormatBound = "true";

    const visual = card.querySelector(".video-card-visual");
    const thumb = getVideoVisualThumb(visual);
    const hoverSource = getVideoVisualSource(visual);

    const tryHoverFallback = () => {
      if (!hoverSource || card.dataset.autoFormatFallbackStarted === "true") {
        return;
      }

      const hoverSrc =
        (typeof hoverSource.dataset.src === "string" && hoverSource.dataset.src.trim()) ||
        hoverSource.getAttribute("src") ||
        "";

      if (!hoverSrc) {
        return;
      }

      card.dataset.autoFormatFallbackStarted = "true";

      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.muted = true;
      probe.playsInline = true;

      const cleanup = () => {
        probe.removeAttribute("src");

        try {
          probe.load();
        } catch {}
      };

      probe.addEventListener(
        "loadedmetadata",
        () => {
          applyMotionDesignCardFormat(card, probe.videoWidth, probe.videoHeight);
          cleanup();
        },
        { once: true }
      );

      probe.addEventListener("error", cleanup, { once: true });
      probe.src = hoverSrc;
    };

    if (!thumb) {
      tryHoverFallback();
      return;
    }

    if (thumb.complete && thumb.naturalWidth > 0 && thumb.naturalHeight > 0) {
      applyMotionDesignCardFormat(card, thumb.naturalWidth, thumb.naturalHeight);
      return;
    }

    thumb.addEventListener(
      "load",
      () => {
        if (
          !applyMotionDesignCardFormat(card, thumb.naturalWidth, thumb.naturalHeight)
        ) {
          tryHoverFallback();
        }
      },
      { once: true }
    );

    thumb.addEventListener("error", tryHoverFallback, { once: true });
  });
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

const loadVideoProjectLink = async (projectRoot, folderName) => {
  if (!projectRoot || !folderName) {
    return "";
  }

  const cacheKey = getVideoProjectLinkCacheKey(projectRoot, folderName);

  if (videoProjectLinksCache.has(cacheKey)) {
    return videoProjectLinksCache.get(cacheKey);
  }

  const candidateFiles = ["link.json", "links.json"];

  for (const fileName of candidateFiles) {
    const linksUrl = buildVideoProjectFileUrl(projectRoot, folderName, fileName);

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

      videoProjectLinksCache.set(cacheKey, resolvedLink);
      return resolvedLink;
    } catch {
      continue;
    }
  }

  videoProjectLinksCache.set(cacheKey, "");
  return "";
};

const getYouTubeVideoId = (href) => {
  if (!href) {
    return "";
  }

  try {
    const url = new URL(href, window.location.href);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const segments = url.pathname.split("/").filter(Boolean);

    if (host === "youtu.be") {
      return segments[0] || "";
    }

    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com"
    ) {
      if (segments[0] === "watch") {
        return url.searchParams.get("v") || "";
      }

      if (segments[0] === "shorts" || segments[0] === "embed") {
        return segments[1] || "";
      }

      return url.searchParams.get("v") || "";
    }
  } catch {}

  return "";
};

const resolveVideoProjectPlayerSource = (href) => {
  const videoId = getYouTubeVideoId(href);

  if (!videoId) {
    return {
      provider: "unsupported",
      embedUrl: "",
      href,
    };
  }

  const embedUrl = new URL(
    `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`
  );
  embedUrl.searchParams.set("autoplay", "1");
  embedUrl.searchParams.set("playsinline", "1");
  embedUrl.searchParams.set("rel", "0");
  embedUrl.searchParams.set("modestbranding", "1");

  return {
    provider: "youtube",
    embedUrl: embedUrl.toString(),
    href,
  };
};

const openExternalVideoProjectLink = (href) => {
  if (!href) {
    return false;
  }

  const link = document.createElement("a");
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "sr-only";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
};

const clearProjectPlayerEmbed = () => {
  projectPlayerEmbedShell?.replaceChildren();
};

const mountProjectPlayerEmbed = (embedUrl, title = "Lecture du projet") => {
  if (!projectPlayerEmbedShell || !embedUrl) {
    return false;
  }

  const iframe = document.createElement("iframe");
  iframe.src = embedUrl;
  iframe.allow =
    "autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.title = title;
  iframe.loading = "eager";
  iframe.allowFullscreen = true;
  iframe.setAttribute("frameborder", "0");

  projectPlayerEmbedShell.replaceChildren(iframe);
  return true;
};

const applyProjectPlayerDialogMetrics = (
  format = "landscape",
  customAspectRatio = null
) => {
  if (!projectPlayerDialog) {
    return;
  }

  const viewportGap = window.innerWidth <= 640 ? 40 : 48;
  const maxWidth = Math.max(window.innerWidth - viewportGap, 220);
  const maxHeight = Math.max(window.innerHeight - viewportGap, 220);
  const aspectRatio =
    Number.isFinite(customAspectRatio) && customAspectRatio > 0
      ? customAspectRatio
      : projectPlayerAspectRatios[format] || projectPlayerAspectRatios.landscape;
  let width = 0;
  let height = 0;

  if (aspectRatio < 1) {
    height = Math.min(window.innerHeight * 0.7, maxHeight);
    width = height * aspectRatio;

    if (width > maxWidth) {
      width = maxWidth;
      height = width / aspectRatio;
    }
  } else {
    width = Math.min(window.innerWidth * 0.7, maxWidth);
    height = width / aspectRatio;

    if (height > maxHeight) {
      height = maxHeight;
      width = height * aspectRatio;
    }
  }

  projectPlayerDialog.style.setProperty("--project-player-width", `${width.toFixed(2)}px`);
  projectPlayerDialog.style.setProperty(
    "--project-player-height",
    `${height.toFixed(2)}px`
  );
  projectPlayerDialog.dataset.format = format;
  projectPlayerDialog.dataset.aspectRatio = aspectRatio.toFixed(6);
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

const setActiveVideoOverlay = (overlayName) => {
  activeVideoOverlay = overlayName;
  syncSharedMediaOverlayState();

  if (showreelButton) {
    showreelButton.setAttribute("aria-expanded", String(overlayName !== "none"));
  }

  if (showreelOverlay) {
    showreelOverlay.setAttribute("aria-hidden", String(overlayName !== "showreel"));
  }

  if (projectPlayerOverlay) {
    projectPlayerOverlay.setAttribute("aria-hidden", String(overlayName !== "project"));
  }
};

const isShowreelOverlayOpen = () =>
  activeVideoOverlay === "showreel" &&
  Boolean(showreelOverlay?.classList.contains("is-visible"));

const isProjectPlayerOverlayOpen = () =>
  activeVideoOverlay === "project" &&
  Boolean(projectPlayerOverlay?.classList.contains("is-visible"));

const openShowreelOverlay = () => {
  const embedSrc =
    typeof showreelIframe?.dataset.src === "string"
      ? showreelIframe.dataset.src.trim()
      : "";

  if (
    !showreelOverlay ||
    !showreelIframe ||
    !embedSrc ||
    activeVideoOverlay !== "none"
  ) {
    return false;
  }

  if (showreelIframe.getAttribute("src") !== embedSrc) {
    showreelIframe.setAttribute("src", embedSrc);
  }

  showreelOverlay.classList.add("is-visible");
  setActiveVideoOverlay("showreel");
  void ensureShowreelPlayer().then((player) => {
    if (!player) {
      return;
    }

    void player.play().catch(() => {});
  });

  return true;
};

const closeShowreelOverlay = ({ restoreFocus = true } = {}) => {
  if (!showreelOverlay || !showreelIframe || !isShowreelOverlayOpen()) {
    return;
  }

  showreelOverlay.classList.remove("is-visible");
  setActiveVideoOverlay("none");

  if (showreelPlayer) {
    void showreelPlayer.pause().catch(() => {});
  }

  if (restoreFocus && showreelButton) {
    showreelButton.focus();
  }
};

const openProjectPlayerOverlay = ({
  embedUrl,
  format = "landscape",
  customAspectRatio = null,
  title = "Lecture du projet",
} = {}) => {
  if (!projectPlayerOverlay || !projectPlayerDialog || !embedUrl) {
    return false;
  }

  if (isShowreelOverlayOpen()) {
    closeShowreelOverlay({ restoreFocus: false });
  } else if (isProjectPlayerOverlayOpen()) {
    closeProjectPlayerOverlay({ restoreFocus: false });
  }

  applyProjectPlayerDialogMetrics(format, customAspectRatio);

  if (!mountProjectPlayerEmbed(embedUrl, title)) {
    return false;
  }

  projectPlayerOverlay.classList.add("is-visible");
  setActiveVideoOverlay("project");
  return true;
};

const closeProjectPlayerOverlay = ({ restoreFocus = true } = {}) => {
  if (!projectPlayerOverlay || !isProjectPlayerOverlayOpen()) {
    return;
  }

  projectPlayerOverlay.classList.remove("is-visible");
  setActiveVideoOverlay("none");

  window.setTimeout(() => {
    if (!isProjectPlayerOverlayOpen()) {
      clearProjectPlayerEmbed();
    }
  }, videoOverlayTransitionDuration);

  if (restoreFocus && showreelButton) {
    showreelButton.focus();
  }
};

const closeActiveVideoOverlay = ({ restoreFocus = true } = {}) => {
  if (isProjectPlayerOverlayOpen()) {
    closeProjectPlayerOverlay({ restoreFocus });
    return;
  }

  if (isShowreelOverlayOpen()) {
    closeShowreelOverlay({ restoreFocus });
  }
};

const clearPhotoLightboxCleanupTimer = () => {
  if (!photoLightboxCleanupTimer) {
    return;
  }

  window.clearTimeout(photoLightboxCleanupTimer);
  photoLightboxCleanupTimer = 0;
};

const clearPhotoLightboxCaptionTimer = () => {
  if (!photoLightboxCaptionTimer) {
    return;
  }

  window.clearTimeout(photoLightboxCaptionTimer);
  photoLightboxCaptionTimer = 0;
};

const setPhotoLightboxCaptionVisible = (isVisible) => {
  photoLightbox?.classList.toggle("is-caption-visible", Boolean(isVisible));
};

const setPhotoLightboxCaptionLabel = (label = "") => {
  if (!ensurePhotoLightboxCaptionDom()) {
    return;
  }

  const normalizedLabel =
    typeof label === "string" ? label.trim() : "";

  photoLightboxCaption.textContent = normalizedLabel;
  photoLightboxCaption.hidden = !normalizedLabel;

  if (!normalizedLabel) {
    setPhotoLightboxCaptionVisible(false);
  }
};

const getPhotoEventLabelFromSource = (source) => {
  if (!source) {
    return "";
  }

  const getLabelFromRelativePath = (relativePath) => {
    const trimmedPath =
      typeof relativePath === "string" ? relativePath.trim().replace(/^\/+/, "") : "";

    if (!trimmedPath) {
      return "";
    }

    const [folderSlug] = trimmedPath.split("/");

    if (!folderSlug || !trimmedPath.includes("/")) {
      return "";
    }

    return photoEventLabelMap[folderSlug] || "";
  };

  try {
    const url = new URL(source, window.location.href);
    const marker = "/rsrc/photos/";
    const markerIndex = url.pathname.indexOf(marker);

    if (markerIndex === -1) {
      return "";
    }

    const relativePath = decodeURIComponent(
      url.pathname.slice(markerIndex + marker.length)
    );

    return getLabelFromRelativePath(relativePath);
  } catch {
    const relativePath = source
      .replace(/^[./]+/, "")
      .replace(/^rsrc\/photos\//, "");

    return getLabelFromRelativePath(relativePath);
  }
};

const getPhotoLightboxEventLabel = (image) => {
  const source =
    image?.dataset.src?.trim() ||
    image?.currentSrc ||
    image?.getAttribute("src") ||
    "";

  return getPhotoEventLabelFromSource(source);
};

const getPhotoLightboxImageAspectRatio = (image) => {
  const width =
    Number(image?.getAttribute("width")) || image?.naturalWidth || image?.width || 1;
  const height =
    Number(image?.getAttribute("height")) || image?.naturalHeight || image?.height || 1;

  return width > 0 && height > 0 ? width / height : 1;
};

const getPhotoLightboxDrawableDimensions = (drawable) => {
  const width =
    Number(drawable?.naturalWidth) || Number(drawable?.videoWidth) || Number(drawable?.width) || 0;
  const height =
    Number(drawable?.naturalHeight) || Number(drawable?.videoHeight) || Number(drawable?.height) || 0;

  return { width, height };
};

const setPhotoLightboxHighResVisible = (isVisible) => {
  photoLightbox?.classList.toggle("is-highres-visible", Boolean(isVisible));
};

const clearPhotoLightboxCanvas = (canvas) => {
  const context = canvas?.getContext("2d");

  if (!context) {
    return;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
};

const resetPhotoLightboxCanvas = (canvas) => {
  if (!canvas) {
    return;
  }

  clearPhotoLightboxCanvas(canvas);
  canvas.width = 1;
  canvas.height = 1;
};

const drawPhotoLightboxCanvas = (canvas, drawable, rect) => {
  if (!canvas || !drawable || !rect) {
    return false;
  }

  const { width: sourceWidth, height: sourceHeight } =
    getPhotoLightboxDrawableDimensions(drawable);

  if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
    return false;
  }

  const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
  const pixelWidth = Math.max(Math.round(rect.width * dpr), 1);
  const pixelHeight = Math.max(Math.round(rect.height * dpr), 1);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const context = canvas.getContext("2d");

  if (!context) {
    return false;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, pixelWidth, pixelHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const scale = Math.min(pixelWidth / sourceWidth, pixelHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const drawX = (pixelWidth - drawWidth) / 2;
  const drawY = (pixelHeight - drawHeight) / 2;

  context.drawImage(drawable, drawX, drawY, drawWidth, drawHeight);
  return true;
};

const renderActivePhotoLightboxCanvases = ({ targetRect = null } = {}) => {
  if (!ensurePhotoLightboxCanvasDom()) {
    return false;
  }

  if (!activePhotoLightboxImage) {
    return false;
  }

  const rect = targetRect || getPhotoLightboxTargetRect(activePhotoLightboxImage);

  if (!rect) {
    return false;
  }

  const didRenderLowRes = drawPhotoLightboxCanvas(
    photoLightboxLowResCanvas,
    activePhotoLightboxImage,
    rect
  );

  if (activePhotoLightboxHighResDrawable) {
    drawPhotoLightboxCanvas(
      photoLightboxHighResCanvas,
      activePhotoLightboxHighResDrawable,
      rect
    );
  } else {
    clearPhotoLightboxCanvas(photoLightboxHighResCanvas);
  }

  return didRenderLowRes;
};

const applyPhotoLightboxRect = (rect) => {
  if (!photoLightboxStage || !rect) {
    return;
  }

  photoLightboxStage.style.top = `${rect.top.toFixed(2)}px`;
  photoLightboxStage.style.left = `${rect.left.toFixed(2)}px`;
  photoLightboxStage.style.width = `${Math.max(rect.width, 1).toFixed(2)}px`;
  photoLightboxStage.style.height = `${Math.max(rect.height, 1).toFixed(2)}px`;
};

const getPhotoLightboxTargetRect = (image) => {
  const aspectRatio = getPhotoLightboxImageAspectRatio(image);
  const maxWidth = Math.max(window.innerWidth * 0.85, 1);
  const maxHeight = Math.max(window.innerHeight * 0.85, 1);
  let width = maxWidth;
  let height = width / aspectRatio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  return {
    left: (window.innerWidth - width) / 2,
    top: (window.innerHeight - height) / 2,
    width,
    height,
  };
};

const finishPhotoLightboxClose = ({ restoreFocus = true } = {}) => {
  clearPhotoLightboxCleanupTimer();
  clearPhotoLightboxCaptionTimer();
  activePhotoLightboxCanvasRenderToken += 1;

  photoLightbox?.classList.remove(
    "is-visible",
    "is-closing",
    "is-opening",
    "is-highres-visible",
    "is-caption-visible"
  );
  photoLightbox?.setAttribute("aria-hidden", "true");
  photoLightboxStage?.removeAttribute("style");
  resetPhotoLightboxCanvas(photoLightboxLowResCanvas);
  resetPhotoLightboxCanvas(photoLightboxHighResCanvas);
  setPhotoLightboxCaptionLabel("");

  const tileToRefocus = activePhotoLightboxTile;
  const imageToRestore = activePhotoLightboxImage;

  if (imageToRestore) {
    imageToRestore.style.transition = "none";
  }

  activePhotoLightboxTile?.classList.remove("is-lightbox-origin");
  activePhotoLightboxTile = null;
  activePhotoLightboxImage = null;
  activePhotoLightboxHighResDrawable = null;
  isPhotoLightboxActive = false;
  isPhotoLightboxTransitioning = false;
  isPhotoLightboxLoading = false;
  syncSharedMediaOverlayState();

  if (imageToRestore) {
    void imageToRestore.offsetWidth;
    window.requestAnimationFrame(() => {
      imageToRestore.style.removeProperty("transition");
    });
  }

  if (restoreFocus && tileToRefocus?.isConnected) {
    tileToRefocus.focus({ preventScroll: true });
  }
};

const syncOpenPhotoLightboxLayout = () => {
  if (
    !isPhotoLightboxOpen() ||
    isPhotoLightboxTransitioning ||
    !activePhotoLightboxImage
  ) {
    return;
  }

  const targetRect = getPhotoLightboxTargetRect(activePhotoLightboxImage);
  renderActivePhotoLightboxCanvases({ targetRect });
  applyPhotoLightboxRect(targetRect);
};

const closePhotoLightbox = ({ restoreFocus = true } = {}) => {
  if (
    !photoLightbox ||
    !photoLightboxStage ||
    !isPhotoLightboxOpen() ||
    isPhotoLightboxTransitioning
  ) {
    return;
  }

  clearPhotoLightboxCaptionTimer();
  setPhotoLightboxCaptionVisible(false);

  const originRect = activePhotoLightboxImage?.getBoundingClientRect();

  if (
    prefersReducedMotion.matches ||
    !originRect ||
    !(originRect.width > 0) ||
    !(originRect.height > 0)
  ) {
    finishPhotoLightboxClose({ restoreFocus });
    return;
  }

  isPhotoLightboxTransitioning = true;
  photoLightbox.classList.add("is-closing");
  applyPhotoLightboxRect(originRect);
  clearPhotoLightboxCleanupTimer();
  photoLightboxCleanupTimer = window.setTimeout(() => {
    finishPhotoLightboxClose({ restoreFocus });
  }, photoLightboxTransitionDuration);
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
    const roleLabel = getVideoVisualRoleLabel(visual);

    const video = visual.querySelector(".video-card-hover-video");

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
      clearVideoVisualHoverResetTimer(visual);
      ensureVideoVisualThumbLoaded(visual, { priority: "high" });
      ensureVideoVisualHoverVideoLoaded(visual, { preload: "auto" });

      const storedTime = getVideoVisualStoredHoverTime(visual);

      if (storedTime > 0) {
        try {
          video.currentTime = storedTime;
        } catch {}
      }

      visual.classList.add("is-hover-media-active");

      const playPromise = video.play();

      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    };

    const deactivate = () => {
      visual.classList.remove("is-hover-media-active");
      clearVideoVisualHoverResetTimer(visual);

      let storedTime = 0;

      try {
        storedTime = video.currentTime;
      } catch {}

      setVideoVisualStoredHoverTime(visual, storedTime);
      video.pause();

      const timer = window.setTimeout(() => {
        if (visual.classList.contains("is-hover-media-active")) {
          return;
        }

        resetVideoVisualStoredHoverTime(visual);

        try {
          video.currentTime = 0;
        } catch {}

        videoHoverResetTimers.delete(visual);
      }, videoHoverResumeRetentionDuration);

      videoHoverResetTimers.set(visual, timer);
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
    const visual = card.querySelector(".video-card-visual");
    const folderName = getVideoVisualFolderName(visual);
    const projectRoot = getVideoVisualProjectRoot(visual);
    const cacheKey = folderName
      ? getVideoProjectLinkCacheKey(projectRoot, folderName)
      : inlineHref;

    if (!folderName && !inlineHref) {
      return;
    }

    if (folderName) {
      if (inlineHref && !videoProjectLinksCache.has(cacheKey)) {
        videoProjectLinksCache.set(cacheKey, inlineHref);
      }

      void loadVideoProjectLink(projectRoot, folderName);
    } else if (inlineHref) {
      videoProjectLinksCache.set(inlineHref, inlineHref);
    }

    const openCardLink = async () => {
      let resolvedHref = folderName
        ? videoProjectLinksCache.get(cacheKey)
        : videoProjectLinksCache.get(inlineHref);

      if (!resolvedHref && folderName) {
        resolvedHref = (await loadVideoProjectLink(projectRoot, folderName)) || inlineHref;
      }

      if (!resolvedHref && inlineHref) {
        resolvedHref = inlineHref;
      }

      const resolvedSource = resolveVideoProjectPlayerSource(resolvedHref || "");

      if (resolvedSource.provider !== "youtube" || !resolvedSource.embedUrl) {
        openExternalVideoProjectLink(resolvedHref || inlineHref);
        return;
      }

      const projectTitle =
        card.querySelector(".video-card-label-value")?.textContent?.trim() ||
        "Lecture du projet";

      openProjectPlayerOverlay({
        embedUrl: resolvedSource.embedUrl,
        format: getVideoProjectPlayerFormat(card),
        customAspectRatio: getVideoProjectPlayerAspectRatio(card),
        title: projectTitle,
      });
    };

    card.tabIndex = 0;
    card.setAttribute("role", "button");

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

const getProjectHeaderGlassThreshold = () =>
  clamp(window.innerHeight * 0.035, 14, 34);

const syncProjectHeaderState = (offset) => {
  if (!isFolioPage) {
    return;
  }

  const normalizedOffset = Math.max(offset, 0);
  document.body.classList.toggle(
    "is-project-header-glass-visible",
    normalizedOffset > getProjectHeaderGlassThreshold()
  );

  if (!folioTitle) {
    return;
  }

  folioTitle.style.setProperty("--folio-title-shift-y", "0px");
  folioTitle.style.setProperty("--folio-title-opacity", "1");
};

const updatePhotographyTitleVisibility = () => {
  if (!isPhotographyPage) {
    return;
  }

  syncProjectHeaderState(window.scrollY || window.pageYOffset || 0);
};

if (isFolioPage) {
  syncProjectHeaderState(0);
}

if (isPhotographyPage) {
  updatePhotographyTitleVisibility();
  window.addEventListener("scroll", updatePhotographyTitleVisibility, {
    passive: true,
  });
  window.addEventListener("resize", updatePhotographyTitleVisibility, {
    passive: true,
  });
  window.addEventListener("load", updatePhotographyTitleVisibility, {
    once: true,
  });
}

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
    navigateWithFade("/");
  });
}

if (showreelButton) {
  showreelButton.addEventListener("click", () => {
    if (activeVideoOverlay !== "none") {
      closeActiveVideoOverlay({ restoreFocus: false });
      return;
    }

    openShowreelOverlay();
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
}

if (projectPlayerOverlay) {
  projectPlayerOverlay
    .querySelectorAll("[data-project-player-close]")
    .forEach((element) => {
      element.addEventListener("click", () => {
        closeProjectPlayerOverlay();
      });
    });
}

if (photoLightbox) {
  photoLightbox.querySelectorAll("[data-photo-lightbox-close]").forEach((element) => {
    element.addEventListener("click", () => {
      closePhotoLightbox();
    });
  });

  photoLightbox.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  photoLightbox.addEventListener("dragstart", (event) => {
    event.preventDefault();
  });
}

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (isPhotoLightboxOpen()) {
    event.preventDefault();
    closePhotoLightbox();
    return;
  }

  if (activeVideoOverlay === "none") {
    return;
  }

  event.preventDefault();
  closeActiveVideoOverlay();
});

window.addEventListener("resize", () => {
  if (!isProjectPlayerOverlayOpen()) {
    syncOpenPhotoLightboxLayout();
  } else {
    const dialogFormat = projectPlayerDialog?.dataset.format;
    const format =
      dialogFormat === "vertical" || dialogFormat === "wide"
        ? dialogFormat
        : "landscape";
    const customAspectRatio = Number.parseFloat(
      projectPlayerDialog?.dataset.aspectRatio || ""
    );
    applyProjectPlayerDialogMetrics(
      format,
      Number.isFinite(customAspectRatio) && customAspectRatio > 0
        ? customAspectRatio
        : null
    );
  }
});

if (photoGrid) {
  let currentPhotoColumns = 0;
  let randomizedPhotoModels = [];
  let tileRevealObserver;
  let imageLoadObserver;
  let refreshPhotographyScrollbar = () => {};
  const photoFullResCache = new Map();
  const photoCanHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const photoPatternMobileLayout = window.matchMedia("(max-width: 640px)");
  const photoPatternPointer = { x: 0, y: 0, active: false };
  const desktopPhotoPatternLineRatios = [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6];
  const desktopPhotoPatternLineOffsets = [320, 720, 450, 200, 900];
  const mobilePhotoPatternLineRatios = [1 / 4, 2 / 4, 3 / 4];
  const mobilePhotoPatternLineOffsets = [160, 360, 225];
  const desktopPhotoPatternVerticalStep = 1080;
  const mobilePhotoPatternVerticalStep = 540;

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
      image.draggable = false;
      tile.tabIndex = 0;
      tile.setAttribute("role", "button");
      tile.setAttribute("aria-haspopup", "dialog");
      tile.setAttribute("aria-label", "Ouvrir la photo");

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

  const getPhotoFullResSource = (image) => {
    const lowResSource =
      image?.dataset.src?.trim() ||
      image?.currentSrc ||
      image?.getAttribute("src") ||
      "";

    if (!lowResSource) {
      return "";
    }

    try {
      const url = new URL(lowResSource, window.location.href);

      if (!url.pathname.includes("/rsrc/photos/")) {
        return url.toString();
      }

      url.pathname = url.pathname
        .replace("/rsrc/photos/", "/rsrc/photos-fullres/")
        .replace(/\.webp$/i, ".jpg");

      return url.toString();
    } catch {
      return lowResSource
        .replace("/rsrc/photos/", "/rsrc/photos-fullres/")
        .replace(/\.webp$/i, ".jpg");
    }
  };

  const preloadPhotoFullResSource = (source) => {
    if (!source) {
      return Promise.resolve(null);
    }

    if (photoFullResCache.has(source)) {
      return photoFullResCache.get(source);
    }

    const preloadPromise = new Promise((resolve) => {
      const preloader = new Image();
      preloader.decoding = "async";
      preloader.draggable = false;

      const finalize = async () => {
        try {
          await preloader.decode();
        } catch {}

        resolve(preloader);
      };

      preloader.addEventListener(
        "load",
        () => {
          void finalize();
        },
        { once: true }
      );

      preloader.addEventListener(
        "error",
        () => {
          resolve(null);
        },
        { once: true }
      );

      preloader.src = source;

      if (preloader.complete) {
        if (preloader.naturalWidth > 0 && preloader.naturalHeight > 0) {
          void finalize();
        } else {
          resolve(null);
        }
      }
    });

    photoFullResCache.set(source, preloadPromise);
    return preloadPromise;
  };

  const waitForPhotoImageReady = (image) =>
    new Promise((resolve) => {
      if (!image) {
        resolve(false);
        return;
      }

      const finish = (didLoad) => {
        image.removeEventListener("load", handleLoad);
        image.removeEventListener("error", handleError);
        resolve(didLoad);
      };

      const handleLoad = () => {
        finish(image.naturalWidth > 0 && image.naturalHeight > 0);
      };

      const handleError = () => {
        finish(false);
      };

      if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve(true);
        return;
      }

      image.addEventListener("load", handleLoad, { once: true });
      image.addEventListener("error", handleError, { once: true });
      loadPhotoImage(image);

      if (image.complete) {
        handleLoad();
      }
    });

  const openPhotoTileLightbox = async (tile, image) => {
    if (
      !tile ||
      !image ||
      !photoLightbox ||
      !photoLightboxStage ||
      isPhotoLightboxLoading ||
      isPhotoLightboxOpen() ||
      isPhotoLightboxTransitioning
    ) {
      return false;
    }

    if (!ensurePhotoLightboxCanvasDom()) {
      return false;
    }

    isPhotoLightboxLoading = true;
    const renderToken = activePhotoLightboxCanvasRenderToken + 1;
    activePhotoLightboxCanvasRenderToken = renderToken;

    const didLoad = await waitForPhotoImageReady(image);

    if (!didLoad) {
      isPhotoLightboxLoading = false;
      return false;
    }

    const originRect = image.getBoundingClientRect();
    const targetRect = getPhotoLightboxTargetRect(image);
    const fullResSource = getPhotoFullResSource(image);
    const fullResPromise = preloadPhotoFullResSource(fullResSource);
    const photoEventLabel = getPhotoLightboxEventLabel(image);

    if (
      !(originRect.width > 0) ||
      !(originRect.height > 0) ||
      !(targetRect.width > 0) ||
      !(targetRect.height > 0)
    ) {
      isPhotoLightboxLoading = false;
      return false;
    }

    clearPhotoLightboxCleanupTimer();
    clearPhotoLightboxCaptionTimer();

    activePhotoLightboxTile?.classList.remove("is-lightbox-origin");
    activePhotoLightboxTile = tile;
    activePhotoLightboxImage = image;
    activePhotoLightboxHighResDrawable = null;
    isPhotoLightboxActive = true;
    isPhotoLightboxTransitioning = !prefersReducedMotion.matches;
    setPhotoLightboxHighResVisible(false);
    setPhotoLightboxCaptionVisible(false);
    setPhotoLightboxCaptionLabel(photoEventLabel);
    renderActivePhotoLightboxCanvases({ targetRect });

    photoLightbox.classList.remove("is-closing");
    photoLightbox.classList.add("is-visible");
    photoLightbox.setAttribute("aria-hidden", "false");

    applyPhotoLightboxRect(originRect);
    syncSharedMediaOverlayState();

    if (prefersReducedMotion.matches) {
      tile.classList.add("is-lightbox-origin");
      applyPhotoLightboxRect(targetRect);
      if (photoEventLabel) {
        setPhotoLightboxCaptionVisible(true);
      }
      isPhotoLightboxTransitioning = false;
      isPhotoLightboxLoading = false;
    } else {
      void photoLightboxStage.offsetWidth;

      window.requestAnimationFrame(() => {
        if (!isPhotoLightboxOpen() || activePhotoLightboxTile !== tile) {
          return;
        }

        applyPhotoLightboxRect(targetRect);

        window.requestAnimationFrame(() => {
          if (!isPhotoLightboxOpen() || activePhotoLightboxTile !== tile) {
            return;
          }

          tile.classList.add("is-lightbox-origin");
        });
      });

      photoLightboxCleanupTimer = window.setTimeout(() => {
        photoLightboxCleanupTimer = 0;

        if (isPhotoLightboxOpen()) {
          isPhotoLightboxTransitioning = false;
        }
      }, photoLightboxTransitionDuration);

      if (photoEventLabel) {
        photoLightboxCaptionTimer = window.setTimeout(() => {
          photoLightboxCaptionTimer = 0;

          if (!isPhotoLightboxOpen() || activePhotoLightboxTile !== tile) {
            return;
          }

          setPhotoLightboxCaptionVisible(true);
        }, photoLightboxTransitionDuration);
      }
    }

    isPhotoLightboxLoading = false;

    void fullResPromise.then((fullResDrawable) => {
      if (
        !fullResDrawable ||
        renderToken !== activePhotoLightboxCanvasRenderToken ||
        !isPhotoLightboxOpen() ||
        activePhotoLightboxTile !== tile
      ) {
        return;
      }

      activePhotoLightboxHighResDrawable = fullResDrawable;
      renderActivePhotoLightboxCanvases({
        targetRect: getPhotoLightboxTargetRect(image),
      });

      window.requestAnimationFrame(() => {
        if (
          renderToken !== activePhotoLightboxCanvasRenderToken ||
          !isPhotoLightboxOpen() ||
          activePhotoLightboxTile !== tile
        ) {
          return;
        }

        setPhotoLightboxHighResVisible(true);
      });
    });

    return true;
  };

  const bindPhotoTileLightbox = (tile, image) => {
    if (!tile || !image || tile.dataset.photoLightboxBound === "true") {
      return;
    }

    const preloadFullRes = () => {
      void preloadPhotoFullResSource(getPhotoFullResSource(image));
    };

    const openBoundPhotoLightbox = () => {
      void openPhotoTileLightbox(tile, image);
    };

    tile.addEventListener("pointerenter", preloadFullRes);
    tile.addEventListener("focus", preloadFullRes);
    tile.addEventListener("pointerdown", preloadFullRes);
    tile.addEventListener("pointerup", (event) => {
      if (event.pointerType !== "touch" && event.button !== 0) {
        return;
      }

      openBoundPhotoLightbox();
    });

    tile.addEventListener("click", openBoundPhotoLightbox);

    tile.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      openBoundPhotoLightbox();
    });

    tile.dataset.photoLightboxBound = "true";
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
        bindPhotoTileLightbox(model.tile, model.image);
        element.appendChild(model.tile);
      });
    });

    observePhotoTiles();
  };

  refreshRandomizedPhotoModels();
  rebuildPhotoColumns();
  photoGrid.addEventListener("contextmenu", (event) => {
    if (event.target.closest(".photo-tile")) {
      event.preventDefault();
    }
  });
  photoGrid.addEventListener("dragstart", (event) => {
    if (event.target.closest(".photo-tile")) {
      event.preventDefault();
    }
  });
  window.addEventListener("resize", rebuildPhotoColumns);

  const initPhotographyPattern = () => {
    if (!photographyPageShell || !photographyPatternBase) {
      return;
    }

    const getPatternTrackHeight = () =>
      Math.max(
        photographyPageShell.scrollHeight,
        photographyPageShell.offsetHeight,
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        window.innerHeight
      );

    const syncPhotographyPatternFocus = () => {
      const isFocusActive =
        photoCanHover && photoPatternPointer.active && !photoPatternMobileLayout.matches;
      const focusOpacity = isFocusActive ? 1 : 0;

      photographyPageShell.style.setProperty(
        "--motif-focus-opacity",
        focusOpacity.toFixed(3)
      );

      if (!isFocusActive || !photographyPatternFocus) {
        return;
      }

      photographyPageShell.style.setProperty(
        "--motif-focus-x",
        `${photoPatternPointer.x.toFixed(2)}px`
      );
      photographyPageShell.style.setProperty(
        "--motif-focus-y",
        `${photoPatternPointer.y.toFixed(2)}px`
      );
      photographyPatternFocus.style.setProperty(
        "--pattern-focus-x",
        `${photoPatternPointer.x.toFixed(2)}px`
      );
      photographyPatternFocus.style.setProperty(
        "--pattern-focus-y",
        `${((window.scrollY || window.pageYOffset || 0) + photoPatternPointer.y).toFixed(2)}px`
      );
    };

    const syncPhotographyPatternOffset = () => {
      const patternShift = `${((window.scrollY || 0) * 0.5).toFixed(2)}px`;

      photographyPatternBase.style.setProperty(
        "--timeline-pattern-shift-y",
        patternShift
      );

      if (photographyPatternFocus) {
        photographyPatternFocus.style.setProperty(
          "--timeline-pattern-shift-y",
          patternShift
        );
      }

      syncPhotographyPatternFocus();
    };

    const syncPhotographyPatternLayer = (patternContainer, iconSrc, trackHeight) => {
      if (!patternContainer) {
        return;
      }

      const iconLimit = Math.max(
        photoPatternMobileLayout.matches ? trackHeight : trackHeight + 320,
        0
      );
      const fragment = document.createDocumentFragment();
      const patternVerticalStep = photoPatternMobileLayout.matches
        ? mobilePhotoPatternVerticalStep
        : desktopPhotoPatternVerticalStep;
      const lineRatios = photoPatternMobileLayout.matches
        ? mobilePhotoPatternLineRatios
        : desktopPhotoPatternLineRatios;
      const lineOffsets = photoPatternMobileLayout.matches
        ? mobilePhotoPatternLineOffsets
        : desktopPhotoPatternLineOffsets;

      lineRatios.forEach((lineRatio, lineIndex) => {
        const line = document.createElement("div");
        line.className = "video-timeline-pattern-line";
        line.style.setProperty("--pattern-x", `${(lineRatio * 100).toFixed(4)}%`);

        const firstOffset = lineOffsets[lineIndex] || 0;

        for (
          let iconY = firstOffset;
          iconY <= iconLimit;
          iconY += patternVerticalStep
        ) {
          const icon = document.createElement("img");
          icon.className = "video-timeline-pattern-icon";
          icon.src = iconSrc;
          icon.alt = "";
          icon.decoding = "async";
          icon.draggable = false;
          icon.setAttribute("aria-hidden", "true");
          icon.style.setProperty("--pattern-y", `${iconY}px`);
          line.appendChild(icon);
        }

        fragment.appendChild(line);
      });

      patternContainer.replaceChildren(fragment);
    };

    const rebuildPhotographyPattern = () => {
      const trackHeight = getPatternTrackHeight();

      syncPhotographyPatternLayer(
        photographyPatternBase,
        "./rsrc/Keyframe-Grise.svg",
        trackHeight
      );
      syncPhotographyPatternLayer(
        photographyPatternFocus,
        "./rsrc/Keyframe.svg",
        trackHeight
      );
      syncPhotographyPatternOffset();
    };

    if (photoCanHover) {
      window.addEventListener(
        "pointermove",
        (event) => {
          photoPatternPointer.x = event.clientX;
          photoPatternPointer.y = event.clientY;
          photoPatternPointer.active = true;
          syncPhotographyPatternFocus();
        },
        { passive: true }
      );

      window.addEventListener("pointerleave", () => {
        photoPatternPointer.active = false;
        syncPhotographyPatternFocus();
      });
    }

    window.addEventListener(
      "scroll",
      () => {
        syncPhotographyPatternOffset();
      },
      { passive: true }
    );
    window.addEventListener("resize", rebuildPhotographyPattern, { passive: true });
    photoGrid.addEventListener(
      "load",
      (event) => {
        if (!event.target.closest(".photo-image")) {
          return;
        }

        window.requestAnimationFrame(rebuildPhotographyPattern);
      },
      true
    );

    window.requestAnimationFrame(rebuildPhotographyPattern);
  };

  const initPhotographyScrollbar = () => {
    if (!videoScrollbar || !videoScrollbarTrack || !videoScrollbarThumb) {
      return;
    }

    const photoScrollbarMobileLayout = window.matchMedia("(max-width: 640px)");
    let scrollbarThumbRatio = 0.18;
    let isScrollbarActive = false;
    let isScrollbarDragging = false;
    let scrollbarDragGrabOffset = 0;
    let scrollbarScrollAnimationFrame = 0;

    const getPageScrollTop = () =>
      Math.max(
        window.scrollY ||
          window.pageYOffset ||
          document.documentElement.scrollTop ||
          document.body.scrollTop ||
          0,
        0
      );

    const getPageScrollHeight = () =>
      Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        photoGrid.scrollHeight,
        window.innerHeight
      );

    const getPageMaxScrollTop = () =>
      Math.max(getPageScrollHeight() - window.innerHeight, 0);

    const syncPageScrollMode = () => {
      const usesCustomNativeScrollbar = !photoScrollbarMobileLayout.matches;

      document.documentElement.classList.toggle(
        "is-photography-native-scroll",
        usesCustomNativeScrollbar
      );
      document.body.classList.toggle(
        "is-photography-native-scroll",
        usesCustomNativeScrollbar
      );
    };

    const syncScrollbarState = () => {
      videoScrollbar.classList.toggle("is-active", isScrollbarActive);
      videoScrollbar.classList.toggle("is-dragging", isScrollbarDragging);
    };

    const stopScrollbarScrollAnimation = () => {
      if (!scrollbarScrollAnimationFrame) {
        return;
      }

      cancelAnimationFrame(scrollbarScrollAnimationFrame);
      scrollbarScrollAnimationFrame = 0;
    };

    const updateScrollbar = () => {
      syncPageScrollMode();

      const pageMaxScrollTop = getPageMaxScrollTop();
      const isOverlayOpen = document.body.classList.contains("is-media-overlay-open");

      if (photoScrollbarMobileLayout.matches || pageMaxScrollTop <= 0 || isOverlayOpen) {
        stopScrollbarScrollAnimation();
        videoScrollbar.hidden = true;
        isScrollbarActive = false;
        isScrollbarDragging = false;
        scrollbarDragGrabOffset = 0;
        syncScrollbarState();
        return;
      }

      const pageScrollHeight = getPageScrollHeight();
      const scrollTop = clamp(getPageScrollTop(), 0, pageMaxScrollTop);

      scrollbarThumbRatio = clamp(
        window.innerHeight / Math.max(pageScrollHeight, window.innerHeight),
        0.08,
        0.42
      );
      videoScrollbar.hidden = false;

      const progress = clamp(scrollTop / pageMaxScrollTop, 0, 1);
      videoScrollbarThumb.style.setProperty(
        "--scrollbar-progress",
        progress.toFixed(4)
      );
      videoScrollbarThumb.style.setProperty(
        "--scrollbar-size",
        scrollbarThumbRatio.toFixed(4)
      );
    };

    const setScrollbarActivityFromPointer = (clientX, clientY) => {
      if (photoScrollbarMobileLayout.matches || getPageMaxScrollTop() <= 0) {
        return;
      }

      const rect = videoScrollbar.getBoundingClientRect();
      const nearRightZone = window.innerWidth - 96;
      const isNearAxis = clientX >= nearRightZone;
      const isOverScrollbar =
        clientX >= rect.left - 10 &&
        clientX <= rect.right + 10 &&
        clientY >= rect.top - 10 &&
        clientY <= rect.bottom + 10;

      isScrollbarActive = isScrollbarDragging || isNearAxis || isOverScrollbar;
      syncScrollbarState();
    };

    const scrollPageTo = (
      nextScrollTop,
      { immediate = false, animated = false } = {}
    ) => {
      const resolvedScrollTop = clamp(nextScrollTop, 0, getPageMaxScrollTop());

      if (immediate || !animated || prefersReducedMotion.matches) {
        stopScrollbarScrollAnimation();
        window.scrollTo({
          top: resolvedScrollTop,
          behavior: "auto",
        });
        updateScrollbar();
        return;
      }

      const startScrollTop = getPageScrollTop();
      const distance = Math.abs(resolvedScrollTop - startScrollTop);

      if (distance < 2) {
        return;
      }

      stopScrollbarScrollAnimation();

      const duration = clamp(150 + distance * 0.1, 180, 360);
      const animationStart = performance.now();
      const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);

      const animateScroll = (timestamp) => {
        const progress = clamp((timestamp - animationStart) / duration, 0, 1);
        const easedProgress = easeOutCubic(progress);
        const animatedScrollTop =
          startScrollTop + (resolvedScrollTop - startScrollTop) * easedProgress;

        window.scrollTo({
          top: animatedScrollTop,
          behavior: "auto",
        });
        updateScrollbar();

        if (progress < 1) {
          scrollbarScrollAnimationFrame = requestAnimationFrame(animateScroll);
          return;
        }

        scrollbarScrollAnimationFrame = 0;
        updateScrollbar();
      };

      scrollbarScrollAnimationFrame = requestAnimationFrame(animateScroll);
    };

    const getScrollbarMetrics = () => {
      const rect = videoScrollbarTrack.getBoundingClientRect();
      const trackSize = Math.max(rect.height, 1);
      const thumbSize = trackSize * scrollbarThumbRatio;
      const travelSize = Math.max(trackSize - thumbSize, 1);

      return {
        rect,
        thumbSize,
        travelSize,
      };
    };

    const getScrollbarProgressFromPointer = (
      clientY,
      { preserveGrabOffset = false, centerOnPointer = false } = {}
    ) => {
      const { rect, thumbSize, travelSize } = getScrollbarMetrics();
      const pointerOffset = preserveGrabOffset
        ? scrollbarDragGrabOffset
        : centerOnPointer
          ? thumbSize * 0.5
          : 0;

      return clamp(
        (clientY - rect.top - pointerOffset) / travelSize,
        0,
        1
      );
    };

    const syncScrollbarFromPointerPosition = (
      clientY,
      {
        immediate = false,
        animated = false,
        preserveGrabOffset = false,
        centerOnPointer = false,
      } = {}
    ) => {
      if (getPageMaxScrollTop() <= 0) {
        return;
      }

      const nextProgress = getScrollbarProgressFromPointer(clientY, {
        preserveGrabOffset,
        centerOnPointer,
      });

      scrollPageTo(nextProgress * getPageMaxScrollTop(), {
        immediate,
        animated,
      });
    };

    refreshPhotographyScrollbar = () => {
      updateScrollbar();
    };
    syncPhotographyScrollbar = refreshPhotographyScrollbar;

    window.addEventListener(
      "pointermove",
      (event) => {
        setScrollbarActivityFromPointer(event.clientX, event.clientY);

        if (isScrollbarDragging) {
          syncScrollbarFromPointerPosition(event.clientY, {
            immediate: true,
            preserveGrabOffset: true,
          });
        }
      },
      { passive: true }
    );

    window.addEventListener("pointerleave", () => {
      if (!isScrollbarDragging) {
        isScrollbarActive = false;
        syncScrollbarState();
      }
    });

    window.addEventListener("pointerup", () => {
      if (!isScrollbarDragging) {
        return;
      }

      isScrollbarDragging = false;
      scrollbarDragGrabOffset = 0;
      syncScrollbarState();
    });

    window.addEventListener("pointercancel", () => {
      if (!isScrollbarDragging) {
        return;
      }

      isScrollbarDragging = false;
      scrollbarDragGrabOffset = 0;
      syncScrollbarState();
    });

    videoScrollbarTrack.addEventListener("pointerdown", (event) => {
      if (photoScrollbarMobileLayout.matches || getPageMaxScrollTop() <= 0) {
        return;
      }

      event.preventDefault();
      isScrollbarActive = true;
      const startedOnThumb =
        event.target === videoScrollbarThumb ||
        videoScrollbarThumb.contains(event.target);

      if (startedOnThumb) {
        stopScrollbarScrollAnimation();
        isScrollbarDragging = true;
        const thumbRect = videoScrollbarThumb.getBoundingClientRect();
        scrollbarDragGrabOffset = event.clientY - thumbRect.top;
        syncScrollbarState();
        syncScrollbarFromPointerPosition(event.clientY, {
          immediate: true,
          preserveGrabOffset: true,
        });
        return;
      }

      isScrollbarDragging = false;
      scrollbarDragGrabOffset = 0;
      syncScrollbarState();
      syncScrollbarFromPointerPosition(event.clientY, {
        animated: true,
        centerOnPointer: true,
      });
    });

    window.addEventListener(
      "scroll",
      () => {
        updateScrollbar();
      },
      { passive: true }
    );
    window.addEventListener("resize", updateScrollbar, { passive: true });
    photoGrid.addEventListener(
      "load",
      (event) => {
        if (!event.target.closest(".photo-image")) {
          return;
        }

        window.requestAnimationFrame(updateScrollbar);
      },
      true
    );

    window.requestAnimationFrame(updateScrollbar);
  };

  initPhotographyPattern();
  initPhotographyScrollbar();
}

const initVideoTimelineScene = () => {
  if (!videoTimeline || !timelineScrollArea) {
    return;
  }

  const videoPageShell = document.querySelector(".video-page-shell");
  const timelineCards = Array.from(
    videoTimeline.querySelectorAll(".video-timeline-card")
  );
  const videoTimelinePatternBase =
    isVideoPage
      ? videoTimeline.querySelector(".video-timeline-pattern-base")
      : null;
  const videoTimelinePatternFocus =
    isVideoPage
      ? videoTimeline.querySelector(".video-timeline-pattern-focus")
      : null;

  if (!timelineCards.length) {
    return;
  }

  const videoCanHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const videoIsMobileLayout = window.matchMedia("(max-width: 640px)");
  const isVerticalDesktopTimeline = () =>
    isVideoPage && !videoIsMobileLayout.matches;
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
  const desktopHorizontalLanePattern = [0.04, 0.66, 0.14, 0.78, 0.08, 0.54, 0.24, 0.72];
  const desktopHorizontalShiftPattern = [0, -0.92, 0.68, -0.42, 0.88, -0.28, 0.54, -0.74];
  const scalePattern = [0.84, 1.14, 0.94, 1.2, 0.8, 1.08, 0.9, 1.18];
  const gapPattern = [0.11, 0.14, 0.1, 0.15, 0.12, 0.13, 0.11];
  const desktopTimelinePatternLineRatios = [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6];
  const desktopTimelinePatternLineOffsets = [320, 720, 450, 200, 900];
  const mobileTimelinePatternLineRatios = [1 / 4, 2 / 4, 3 / 4];
  const mobileTimelinePatternLineOffsets = [160, 360, 225];
  const desktopTimelinePatternVerticalStep = 1080;
  const mobileTimelinePatternVerticalStep = 540;
  const wideCardSizeBoost = 1.5;
  const videoCards = timelineCards.map((card, index) => ({
    element: card,
    visual: card.querySelector(".video-card-visual"),
    currentX: 0,
    currentY: 0,
    strength: 13 + (index % 3) * 1.6,
  }));
  let currentTrackOffset = 0;
  let maxTrackOffset = 0;
  let scrollbarThumbRatio = 0.18;
  let isVideoScrollbarActive = false;
  let isVideoScrollbarDragging = false;
  let videoScrollbarDragGrabOffset = 0;
  let videoScrollbarScrollAnimationFrame = 0;
  let videoSceneFrame = 0;
  let lastVideoMediaRefresh = -Infinity;
  let forceVideoMediaRefresh = true;

  const getVideoPageScrollTop = () =>
    Math.max(
      window.scrollY ||
        window.pageYOffset ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0,
      0
    );

  const getVideoPageScrollHeight = () =>
    Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      timelineScrollArea.scrollHeight,
      window.innerHeight
    );

  const getVideoPageMaxScrollTop = () =>
    Math.max(getVideoPageScrollHeight() - window.innerHeight, 0);

  const syncVideoPageScrollMode = () => {
    const usesCustomNativeScrollbar = !videoIsMobileLayout.matches;

    document.documentElement.classList.toggle(
      "is-video-native-scroll",
      usesCustomNativeScrollbar
    );
    document.body.classList.toggle(
      "is-video-native-scroll",
      usesCustomNativeScrollbar
    );
  };

  const syncMobileVideoTimelinePattern = () => {
    if (!videoTimelinePatternBase) {
      return;
    }

    if (!videoIsMobileLayout.matches) {
      videoTimelinePatternBase.style.removeProperty("--mobile-pattern-scroll-offset");
      return;
    }

    videoTimelinePatternBase.style.setProperty(
      "--mobile-pattern-scroll-offset",
      `${(window.scrollY || window.pageYOffset || 0).toFixed(2)}px`
    );
  };

  const syncVideoTimelinePatternFocus = () => {
    if (!videoPageShell || !isVideoPage) {
      return;
    }

    const isFocusActive = videoCanHover && videoPointer.active && !videoIsMobileLayout.matches;
    const focusOpacity = isFocusActive ? 1 : 0;

    videoPageShell.style.setProperty(
      "--motif-focus-opacity",
      focusOpacity.toFixed(3)
    );

    if (!isFocusActive || !videoTimelinePatternFocus) {
      return;
    }

    videoPageShell.style.setProperty("--motif-focus-x", `${videoPointer.x.toFixed(2)}px`);
    videoPageShell.style.setProperty("--motif-focus-y", `${videoPointer.y.toFixed(2)}px`);
    videoTimelinePatternFocus.style.setProperty(
      "--motif-focus-opacity",
      focusOpacity.toFixed(3)
    );
    videoTimelinePatternFocus.style.setProperty(
      "--pattern-focus-x",
      `${videoPointer.x.toFixed(2)}px`
    );
    videoTimelinePatternFocus.style.setProperty(
      "--pattern-focus-y",
      `${(currentTrackOffset + videoPointer.y).toFixed(2)}px`
    );
  };

  const syncVideoTimelinePatternLayer = (patternContainer, iconSrc, trackHeight) => {
    if (!patternContainer) {
      return;
    }

    const iconLimit = Math.max(
      videoIsMobileLayout.matches ? trackHeight : trackHeight + 320,
      0
    );
    const fragment = document.createDocumentFragment();
    const patternVerticalStep = videoIsMobileLayout.matches
      ? mobileTimelinePatternVerticalStep
      : desktopTimelinePatternVerticalStep;
    const lineRatios = videoIsMobileLayout.matches
      ? mobileTimelinePatternLineRatios
      : desktopTimelinePatternLineRatios;
    const lineOffsets = videoIsMobileLayout.matches
      ? mobileTimelinePatternLineOffsets
      : desktopTimelinePatternLineOffsets;

    lineRatios.forEach((lineRatio, lineIndex) => {
      const line = document.createElement("div");
      line.className = "video-timeline-pattern-line";
      line.style.setProperty("--pattern-x", `${(lineRatio * 100).toFixed(4)}%`);

      const firstOffset = lineOffsets[lineIndex] || 0;

      for (
        let iconY = firstOffset;
        iconY <= iconLimit;
        iconY += patternVerticalStep
      ) {
        const icon = document.createElement("img");
        icon.className = "video-timeline-pattern-icon";
        icon.src = iconSrc;
        icon.alt = "";
        icon.decoding = "async";
        icon.draggable = false;
        icon.setAttribute("aria-hidden", "true");
        icon.style.setProperty("--pattern-y", `${iconY}px`);
        line.appendChild(icon);
      }

      fragment.appendChild(line);
    });

    patternContainer.replaceChildren(fragment);
  };

  const syncVideoTimelinePattern = (trackHeight) => {
    syncVideoTimelinePatternLayer(
      videoTimelinePatternBase,
      "./rsrc/Keyframe-Grise.svg",
      trackHeight
    );
    syncVideoTimelinePatternLayer(
      videoTimelinePatternFocus,
      "./rsrc/Keyframe.svg",
      trackHeight
    );
    syncMobileVideoTimelinePattern();
    syncVideoTimelinePatternFocus();
  };

  const refreshVisibleVideoMedia = () => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const horizontalBuffer = videoIsMobileLayout.matches
      ? viewportWidth * 0.16
      : isVerticalDesktopTimeline()
        ? viewportWidth * 0.28
        : viewportWidth * 0.8;
    const verticalBuffer = videoIsMobileLayout.matches
      ? viewportHeight * 0.42
      : isVerticalDesktopTimeline()
        ? viewportHeight * 0.82
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
    videoTimeline.style.setProperty(
      "--timeline-pattern-shift-y",
      `${(offset * 0.5).toFixed(2)}px`
    );
    syncVideoTimelinePatternFocus();
  };

  const updateVideoTitleVisibility = (offset = currentTrackOffset) => {
    if (!isVideoPage) {
      return;
    }

    if (!isVerticalDesktopTimeline() && !videoIsMobileLayout.matches) {
      syncProjectHeaderState(0);
      return;
    }

    const titleOffset = videoIsMobileLayout.matches
      ? window.scrollY || window.pageYOffset || 0
      : offset;
    syncProjectHeaderState(titleOffset);
  };

  const syncVideoScrollbarState = () => {
    if (!videoScrollbar) {
      return;
    }

    videoScrollbar.classList.toggle("is-active", isVideoScrollbarActive);
    videoScrollbar.classList.toggle("is-dragging", isVideoScrollbarDragging);
  };

  const stopVideoScrollbarScrollAnimation = () => {
    if (!videoScrollbarScrollAnimationFrame) {
      return;
    }

    cancelAnimationFrame(videoScrollbarScrollAnimationFrame);
    videoScrollbarScrollAnimationFrame = 0;
  };

  const updateVideoScrollbar = () => {
    if (!videoScrollbar || !videoScrollbarThumb) {
      return;
    }

    const pageMaxScrollTop = getVideoPageMaxScrollTop();

    if (videoIsMobileLayout.matches || pageMaxScrollTop <= 0) {
      videoScrollbar.hidden = true;
      isVideoScrollbarActive = false;
      isVideoScrollbarDragging = false;
      syncVideoScrollbarState();
      return;
    }

    const pageScrollHeight = getVideoPageScrollHeight();
    const scrollTop = clamp(getVideoPageScrollTop(), 0, pageMaxScrollTop);

    scrollbarThumbRatio = clamp(
      window.innerHeight / Math.max(pageScrollHeight, window.innerHeight),
      0.08,
      0.42
    );
    videoScrollbar.hidden = false;

    const progress = clamp(scrollTop / pageMaxScrollTop, 0, 1);
    videoScrollbarThumb.style.setProperty(
      "--scrollbar-progress",
      progress.toFixed(4)
    );
    videoScrollbarThumb.style.setProperty(
      "--scrollbar-size",
      scrollbarThumbRatio.toFixed(4)
    );
  };

  const setVideoScrollbarActivityFromPointer = (clientX, clientY) => {
    if (
      !videoScrollbar ||
      videoIsMobileLayout.matches ||
      getVideoPageMaxScrollTop() <= 0
    ) {
      return;
    }

    const rect = videoScrollbar.getBoundingClientRect();
    const isVerticalScrollbar = isVerticalDesktopTimeline();
    const nearRightZone = window.innerWidth - 96;
    const nearBottomZone = window.innerHeight - 96;
    const isNearAxis = isVerticalScrollbar
      ? clientX >= nearRightZone
      : clientY >= nearBottomZone;
    const isOverScrollbar = isVerticalScrollbar
      ? clientX >= rect.left - 10 && clientX <= rect.right + 10
      : clientY >= rect.top - 10 && clientY <= rect.bottom + 10;

    isVideoScrollbarActive = isVideoScrollbarDragging || isNearAxis || isOverScrollbar;
    syncVideoScrollbarState();
  };

  const scrollVideoPageTo = (
    nextScrollTop,
    { immediate = false, animated = false } = {}
  ) => {
    const resolvedScrollTop = clamp(nextScrollTop, 0, getVideoPageMaxScrollTop());

    if (immediate || !animated || prefersReducedMotion.matches) {
      stopVideoScrollbarScrollAnimation();
      window.scrollTo({
        top: resolvedScrollTop,
        behavior: "auto",
      });
      forceVideoMediaRefresh = true;

      if (immediate || prefersReducedMotion.matches) {
        currentTrackOffset = resolvedScrollTop;
        applyVideoTrackOffset(currentTrackOffset);
        updateVideoScrollbar();
        updateVideoTitleVisibility(currentTrackOffset);
      }

      return;
    }

    const startScrollTop = getVideoPageScrollTop();
    const distance = Math.abs(resolvedScrollTop - startScrollTop);

    if (distance < 2) {
      return;
    }

    stopVideoScrollbarScrollAnimation();

    const duration = clamp(150 + distance * 0.1, 180, 360);
    const animationStart = performance.now();
    const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);

    const animateScroll = (timestamp) => {
      const progress = clamp((timestamp - animationStart) / duration, 0, 1);
      const easedProgress = easeOutCubic(progress);
      const animatedScrollTop =
        startScrollTop + (resolvedScrollTop - startScrollTop) * easedProgress;

      window.scrollTo({
        top: animatedScrollTop,
        behavior: "auto",
      });
      forceVideoMediaRefresh = true;

      if (progress < 1) {
        videoScrollbarScrollAnimationFrame = requestAnimationFrame(animateScroll);
        return;
      }

      videoScrollbarScrollAnimationFrame = 0;
      currentTrackOffset = resolvedScrollTop;
      applyVideoTrackOffset(currentTrackOffset);
      updateVideoScrollbar();
      updateVideoTitleVisibility(currentTrackOffset);
    };

    videoScrollbarScrollAnimationFrame = requestAnimationFrame(animateScroll);
  };

  const syncTimelineOffsetFromProgress = (
    progress,
    { immediate = false, animated = false } = {}
  ) => {
    const normalizedProgress = clamp(progress, 0, 1);
    const nextScrollTop = normalizedProgress * getVideoPageMaxScrollTop();

    scrollVideoPageTo(nextScrollTop, { immediate, animated });
  };

  const getVideoScrollbarMetrics = () => {
    if (!videoScrollbarTrack) {
      return null;
    }

    const rect = videoScrollbarTrack.getBoundingClientRect();
    const isVerticalScrollbar = isVerticalDesktopTimeline();
    const trackSize = Math.max(
      isVerticalScrollbar ? rect.height : rect.width,
      1
    );
    const thumbSize = trackSize * scrollbarThumbRatio;
    const travelSize = Math.max(trackSize - thumbSize, 1);

    return {
      rect,
      isVerticalScrollbar,
      thumbSize,
      travelSize,
    };
  };

  const getVideoScrollbarProgressFromPointer = (
    clientX,
    clientY,
    { preserveGrabOffset = false, centerOnPointer = false } = {}
  ) => {
    const metrics = getVideoScrollbarMetrics();

    if (!metrics) {
      return 0;
    }

    const pointerPosition = metrics.isVerticalScrollbar
      ? clientY - metrics.rect.top
      : clientX - metrics.rect.left;
    const pointerOffset = preserveGrabOffset
      ? videoScrollbarDragGrabOffset
      : centerOnPointer
        ? metrics.thumbSize * 0.5
        : 0;

    return clamp(
      (pointerPosition - pointerOffset) / metrics.travelSize,
      0,
      1
    );
  };

  const syncTimelineOffsetFromPointerPosition = (
    clientX,
    clientY,
    {
      immediate = false,
      animated = false,
      preserveGrabOffset = false,
      centerOnPointer = false,
    } = {}
  ) => {
    if (getVideoPageMaxScrollTop() <= 0) {
      return;
    }

    const nextProgress = getVideoScrollbarProgressFromPointer(clientX, clientY, {
      preserveGrabOffset,
      centerOnPointer,
    });

    syncTimelineOffsetFromProgress(nextProgress, { immediate, animated });
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

  const getVideoTimelineCardSizeMultiplier = (card) => {
    const rawMultiplier = Number.parseFloat(card?.dataset.sizeMultiplier || "");

    if (!Number.isFinite(rawMultiplier)) {
      return 1;
    }

    return clamp(rawMultiplier, 0.45, 1.8);
  };

  const getVideoTimelineCardLayoutOffset = (card) => {
    const offsetX = Number.parseFloat(card?.dataset.layoutOffsetX || "");
    const offsetY = Number.parseFloat(card?.dataset.layoutOffsetY || "");

    return {
      x: Number.isFinite(offsetX) ? offsetX : 0,
      y: Number.isFinite(offsetY) ? offsetY : 0,
    };
  };

  const syncVideoTimelineScroll = ({ snap = false } = {}) => {
    if (videoIsMobileLayout.matches) {
      currentTrackOffset = 0;
      applyVideoTrackOffset(0);
      updateVideoScrollbar();
      updateVideoTitleVisibility(0);
      return;
    }

    currentTrackOffset = getVideoPageScrollTop();

    if (!snap && !prefersReducedMotion.matches) {
      return;
    }

    applyVideoTrackOffset(currentTrackOffset);
    updateVideoScrollbar();
    updateVideoTitleVisibility(currentTrackOffset);
  };

  const animateVideoScene = (timestamp = performance.now()) => {
    const motionDisabled = prefersReducedMotion.matches || videoIsMobileLayout.matches;
    currentTrackOffset = videoIsMobileLayout.matches
      ? 0
      : getVideoPageScrollTop();

    applyVideoTrackOffset(currentTrackOffset);
    updateVideoScrollbar();
    updateVideoTitleVisibility(currentTrackOffset);

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

  const layoutVideoTimeline = () => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    syncVideoPageScrollMode();

    if (videoIsMobileLayout.matches) {
      const mobileSidePadding = 0;
      const mobileBaseWidth = viewportWidth * 0.65;

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
      applyVideoTrackOffset(0);
      updateVideoScrollbar();
      updateVideoTitleVisibility(0);

      const mobileMetrics = timelineCards.map((card, index) => {
        const baseWidth = mobileBaseWidth;
        const { cardWidth, titleScale } = getFittedVideoCardTitleMetrics({
          card,
          baseWidth,
          maxWidth: baseWidth,
        });

        return {
          card,
          index,
          cardWidth,
          titleScale,
        };
      });

      mobileMetrics.forEach((metric) => {
        metric.card.style.setProperty("--card-width", `${metric.cardWidth.toFixed(2)}px`);
        metric.card.style.setProperty(
          "--card-title-scale",
          metric.titleScale.toFixed(3)
        );
        metric.card.style.setProperty(
          "--mobile-shift",
          "0px"
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

      const timelineRect = videoTimeline.getBoundingClientRect();
      const mobileTrackHeight = Math.max(
        timelineCards.reduce((maxBottom, card) => {
          const cardRect = card.getBoundingClientRect();
          return Math.max(maxBottom, cardRect.bottom - timelineRect.top);
        }, 0) +
          (Number.parseFloat(window.getComputedStyle(videoTimeline).paddingBottom) || 0),
        viewportHeight
      );
      syncVideoTimelinePattern(mobileTrackHeight);

      return;
    }

    const captionScale =
      viewportWidth <= 640
        ? 1
        : clamp(Math.min(viewportWidth / 1440, viewportHeight / 980), 0.9, 1.28);
    const paddingRatio = Number.parseFloat(videoTimeline.dataset.trackPadding) || 0.14;
    const sidePadding = viewportWidth * paddingRatio;
    const trailingPadding = viewportWidth <= 640 ? 88 : sidePadding;
    const rawBaseCardWidth =
      viewportWidth <= 640
        ? clamp(viewportWidth * 0.72, 220, 310)
        : isVerticalDesktopTimeline()
          ? clamp(viewportWidth * 0.265, 260, 420)
          : clamp(viewportWidth * 0.31, 280, 460);
    const safeTop =
      viewportWidth <= 640
        ? 112
        : isVerticalDesktopTimeline()
          ? clamp(viewportHeight * 0.19, 154, 210)
          : clamp(viewportHeight * 0.145, 132, 160);
    const safeBottom =
      viewportWidth <= 640
        ? 120
        : isVerticalDesktopTimeline()
          ? clamp(viewportHeight * 0.12, 92, 132)
          : clamp(viewportHeight * 0.086, 72, 92);
    const captionSizePx = 14 * captionScale;
    videoTimeline.style.setProperty(
      "--card-caption-size",
      `${captionSizePx.toFixed(2)}px`
    );
    document.body.style.setProperty(
      "--showreel-caption-size",
      `${captionSizePx.toFixed(2)}px`
    );
    videoTimeline.style.height = "100vh";

    const buildDesktopCardMetrics = (baseCardWidth) =>
      timelineCards.map((card, index) => {
        const cardFormat = getVideoTimelineCardFormat(card);
        const scaleFactor = scalePattern[index % scalePattern.length];
        const formatWidthFactor =
          cardFormat === "vertical"
            ? 0.74
            : cardFormat === "wide"
              ? 1.28 * wideCardSizeBoost
              : 1;
        const sizeMultiplier = getVideoTimelineCardSizeMultiplier(card);
        const baseWidth =
          baseCardWidth * scaleFactor * formatWidthFactor * sizeMultiplier;
        const aspectRatio = getVideoTimelineCardAspectRatio(card);
        const maxWidth = Math.max(
          baseWidth,
          viewportWidth *
            (cardFormat === "vertical" ? 0.44 : cardFormat === "wide" ? 0.74 : 0.62)
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
          cardFormat,
          cardWidth,
          cardHeight,
          titleScale,
        };
      });

    const rawCardMetrics = buildDesktopCardMetrics(rawBaseCardWidth);
    const rawMaxCardHeight = Math.max(
      ...rawCardMetrics.map((metric) => metric.cardHeight),
      0
    );
    const heightBudget = Math.max(viewportHeight - safeTop - safeBottom, 260);
    const desiredVerticalTravel = clamp(heightBudget * 0.33, 210, 340);
    const heightResponsiveCardScale = clamp(
      Math.pow(viewportHeight / 1280, 0.72),
      0.82,
      1
    );
    const heightPreservingCardScale =
      rawMaxCardHeight > 0
        ? clamp(
            (heightBudget - desiredVerticalTravel) / rawMaxCardHeight,
            0.82,
            1
          )
        : 1;
    const desktopCardScale = Math.min(
      heightResponsiveCardScale,
      heightPreservingCardScale
    );
    const cardMetrics = buildDesktopCardMetrics(
      rawBaseCardWidth * desktopCardScale
    );
    const maxCardHeight = Math.max(
      ...cardMetrics.map((metric) => metric.cardHeight),
      0
    );
    if (isVerticalDesktopTimeline()) {
      const topPadding = clamp(
        Math.max(safeTop, viewportHeight * 0.22),
        170,
        250
      );
      const baseBottomPadding = clamp(
        Math.max(captionSizePx * 2.6 + 18, viewportHeight * 0.07),
        56,
        104
      );
      const bottomPadding = baseBottomPadding * 3;
      const desktopContentWidth = viewportWidth * 0.8;
      const desktopContentLeft = (viewportWidth - desktopContentWidth) * 0.5;
      const desktopAnchorCount =
        viewportWidth >= 1560 ? 6 : viewportWidth >= 1180 ? 5 : 4;
      const desktopAnchorRatios = Array.from(
        { length: desktopAnchorCount },
        (_, anchorIndex) =>
          desktopAnchorCount === 1
            ? 0.5
            : 0.08 + (anchorIndex / (desktopAnchorCount - 1)) * 0.84
      );
      const horizontalJitterLimit = clamp(viewportWidth * 0.012, 5, 14);
      const horizontalCollisionPadding = clamp(viewportWidth * 0.012, 14, 24);
      const verticalCollisionPadding = clamp(viewportHeight * 0.01, 6, 16);
      const verticalRetryStep = clamp(viewportHeight * 0.032, 24, 42);
      const overlapPattern = [0.78, 0.72, 0.84, 0.7, 0.8, 0.68, 0.82, 0.74];
      const desktopMetrics = cardMetrics.map((metric) => ({
        ...metric,
        preferredLaneIndex: clamp(
          Math.round(
            desktopHorizontalLanePattern[
              metric.index % desktopHorizontalLanePattern.length
            ] *
              (desktopAnchorCount - 1)
          ),
          0,
          desktopAnchorCount - 1
        ),
        preferredLaneDirection:
          desktopHorizontalShiftPattern[
            metric.index % desktopHorizontalShiftPattern.length
          ] >= 0
            ? 1
            : -1,
        laneJitter:
          desktopHorizontalShiftPattern[
            metric.index % desktopHorizontalShiftPattern.length
          ] * horizontalJitterLimit,
      }));
      const desktopPositions = [];
      let cursor = topPadding;
      let lastCardHeight = desktopMetrics[0]?.cardHeight || maxCardHeight;

      const getDesktopLaneOrder = (preferredLaneIndex, preferredLaneDirection) => {
        const order = [];
        const seen = new Set();
        const pushLane = (laneIndex) => {
          if (
            laneIndex < 0 ||
            laneIndex >= desktopAnchorCount ||
            seen.has(laneIndex)
          ) {
            return;
          }

          seen.add(laneIndex);
          order.push(laneIndex);
        };

        pushLane(preferredLaneIndex);

        for (let distance = 1; distance < desktopAnchorCount; distance += 1) {
          pushLane(preferredLaneIndex + distance * preferredLaneDirection);
          pushLane(preferredLaneIndex - distance * preferredLaneDirection);
        }

        for (let laneIndex = 0; laneIndex < desktopAnchorCount; laneIndex += 1) {
          pushLane(laneIndex);
        }

        return order;
      };

      const resolveDesktopCardX = (anchorRatio, cardWidth, laneJitter) => {
        const anchorCenterX = desktopContentLeft + desktopContentWidth * anchorRatio;
        return clamp(
          anchorCenterX - cardWidth * 0.5 + laneJitter,
          desktopContentLeft,
          desktopContentLeft + desktopContentWidth - cardWidth
        );
      };

      const doDesktopCardsOverlap = (
        candidateX,
        candidateY,
        candidateWidth,
        candidateHeight,
        placedCard
      ) =>
        candidateX - horizontalCollisionPadding <
          placedCard.x + placedCard.width &&
        candidateX + candidateWidth + horizontalCollisionPadding >
          placedCard.x &&
        candidateY - verticalCollisionPadding <
          placedCard.y + placedCard.height &&
        candidateY + candidateHeight + verticalCollisionPadding > placedCard.y;

      desktopMetrics.forEach((metric) => {
        const {
          index,
          cardWidth,
          cardHeight,
          preferredLaneIndex,
          preferredLaneDirection,
          laneJitter,
        } = metric;
        const gapRatio = gapPattern[(index - 1 + gapPattern.length) % gapPattern.length];
        const gap = clamp(viewportHeight * gapRatio * 0.16, 12, 38);
        const overlapRatio =
          overlapPattern[(index - 1 + overlapPattern.length) % overlapPattern.length];

        if (index > 0) {
          cursor += Math.max(lastCardHeight * overlapRatio + gap, 92);
        }

        let resolvedY = cursor;
        let resolvedPosition = null;
        const laneOrder = getDesktopLaneOrder(
          preferredLaneIndex,
          preferredLaneDirection
        );

        for (let attempt = 0; attempt < 10 && !resolvedPosition; attempt += 1) {
          const nearbyPositions = desktopPositions.filter(
            (placedCard) =>
              placedCard.y < resolvedY + cardHeight + verticalRetryStep &&
              placedCard.y + placedCard.height > resolvedY - verticalRetryStep
          );

          for (const laneIndex of laneOrder) {
            const anchorRatio = desktopAnchorRatios[laneIndex];
            const anchorJitter =
              laneJitter *
              (desktopAnchorCount > 4
                ? 0.45
                : laneIndex === preferredLaneIndex
                  ? 0.35
                  : 0.2);
            const candidateX = resolveDesktopCardX(
              anchorRatio,
              cardWidth,
              anchorJitter
            );
            const collides = nearbyPositions.some((placedCard) =>
              doDesktopCardsOverlap(
                candidateX,
                resolvedY,
                cardWidth,
                cardHeight,
                placedCard
              )
            );

            if (!collides) {
              resolvedPosition = {
                x: candidateX,
                y: resolvedY,
                width: cardWidth,
                height: cardHeight,
              };
              break;
            }
          }

          if (!resolvedPosition) {
            resolvedY += verticalRetryStep;
          }
        }

        if (!resolvedPosition) {
          const fallbackAnchorRatio = desktopAnchorRatios[preferredLaneIndex];
          resolvedPosition = {
            x: resolveDesktopCardX(fallbackAnchorRatio, cardWidth, laneJitter * 0.2),
            y: resolvedY,
            width: cardWidth,
            height: cardHeight,
          };
        }

        desktopPositions.push(resolvedPosition);
        cursor = resolvedPosition.y;

        lastCardHeight = cardHeight;
      });

      const desktopBounds = desktopPositions.reduce(
        (bounds, position) => ({
          minLeft: Math.min(bounds.minLeft, position.x),
          maxRight: Math.max(bounds.maxRight, position.x + position.width),
        }),
        {
          minLeft: Number.POSITIVE_INFINITY,
          maxRight: Number.NEGATIVE_INFINITY,
        }
      );
      const contentCenterX = desktopContentLeft + desktopContentWidth * 0.5;
      const groupCenterX =
        Number.isFinite(desktopBounds.minLeft) &&
        Number.isFinite(desktopBounds.maxRight)
          ? (desktopBounds.minLeft + desktopBounds.maxRight) * 0.5
          : contentCenterX;
      const desiredDesktopBalanceShift = contentCenterX - groupCenterX;
      const desktopMinBalanceShift = desktopPositions.reduce(
        (minShift, position) =>
          Math.max(minShift, desktopContentLeft - position.x),
        Number.NEGATIVE_INFINITY
      );
      const desktopMaxBalanceShift = desktopPositions.reduce(
        (maxShift, position) =>
          Math.min(
            maxShift,
            desktopContentLeft + desktopContentWidth - position.width - position.x
          ),
        Number.POSITIVE_INFINITY
      );
      const desktopBalanceShift = clamp(
        desiredDesktopBalanceShift,
        desktopMinBalanceShift,
        desktopMaxBalanceShift
      );

      desktopMetrics.forEach((metric, index) => {
        const { card, titleScale } = metric;
        const position = desktopPositions[index];
        const layoutOffset = getVideoTimelineCardLayoutOffset(card);
        const balancedX = position.x + desktopBalanceShift + layoutOffset.x;
        const offsetY = position.y + layoutOffset.y;

        card.style.setProperty("--card-width", `${position.width.toFixed(2)}px`);
        card.style.setProperty("--card-title-scale", titleScale.toFixed(3));
        card.style.setProperty("--mobile-shift", "0px");
        card.style.setProperty("--card-x", `${balancedX.toFixed(2)}px`);
        card.style.setProperty("--card-y", `${offsetY.toFixed(2)}px`);
        card.style.setProperty(
          "--entry-delay",
          `${(0.1 + metric.index * 0.09).toFixed(2)}s`
        );
        card.style.setProperty(
          "--card-color",
          pastelPalette[metric.index % pastelPalette.length]
        );
      });

      const lastCardY =
        Number.parseFloat(
          timelineCards[timelineCards.length - 1]?.style.getPropertyValue("--card-y")
        ) || desktopPositions[desktopPositions.length - 1]?.y || 0;
      const lastHeight = desktopPositions[desktopPositions.length - 1]?.height || maxCardHeight;
      const trackHeight = lastCardY + lastHeight + bottomPadding;

      maxTrackOffset = Math.max(trackHeight - viewportHeight, 0);
      videoTimeline.style.width = `${viewportWidth.toFixed(2)}px`;
      videoTimeline.style.height = `${trackHeight.toFixed(2)}px`;
      timelineScrollArea.style.minHeight = `${trackHeight.toFixed(2)}px`;
      syncVideoTimelinePattern(trackHeight);
    } else {
      const availableHeight = Math.max(
        viewportHeight - safeTop - safeBottom - maxCardHeight,
        120
      );
      let cursor = sidePadding;
      let lastCardWidth = cardMetrics[0]?.cardWidth || rawBaseCardWidth;

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
        card.style.setProperty(
          "--entry-delay",
          `${(0.1 + index * 0.09).toFixed(2)}s`
        );
        card.style.setProperty(
          "--card-color",
          pastelPalette[index % pastelPalette.length]
        );

        lastCardWidth = cardWidth;
      });

      const lastCardX =
        Number.parseFloat(
          timelineCards[timelineCards.length - 1]?.style.getPropertyValue("--card-x")
        ) || 0;
      const lastWidth =
        Number.parseFloat(
          timelineCards[timelineCards.length - 1]?.style.getPropertyValue("--card-width")
        ) || rawBaseCardWidth;
      const trackWidth = lastCardX + lastWidth + trailingPadding;

      maxTrackOffset = Math.max(trackWidth - viewportWidth, 0);
      videoTimeline.style.width = `${trackWidth.toFixed(2)}px`;
      videoTimeline.style.height = `${viewportHeight.toFixed(2)}px`;
      timelineScrollArea.style.minHeight = `${viewportHeight.toFixed(2)}px`;
      syncVideoTimelinePattern(viewportHeight);
    }

    syncVideoTimelineScroll({ snap: true });
    forceVideoMediaRefresh = true;
    refreshVisibleVideoMedia();
    syncMobileVideoTimelinePattern();
  };

  if (videoCanHover) {
    window.addEventListener("pointermove", (event) => {
      videoPointer.x = event.clientX;
      videoPointer.y = event.clientY;
      videoPointer.active = true;
      syncVideoTimelinePatternFocus();
      setVideoScrollbarActivityFromPointer(event.clientX, event.clientY);

      if (isVideoScrollbarDragging) {
        syncTimelineOffsetFromPointerPosition(event.clientX, event.clientY, {
          immediate: true,
          preserveGrabOffset: true,
        });
      }
    });

    window.addEventListener("pointerleave", () => {
      videoPointer.active = false;
      syncVideoTimelinePatternFocus();

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
      videoScrollbarDragGrabOffset = 0;
      if (videoPointer.active) {
        setVideoScrollbarActivityFromPointer(videoPointer.x, videoPointer.y);
        return;
      }

      syncVideoScrollbarState();
    });

    window.addEventListener("pointercancel", () => {
      if (!isVideoScrollbarDragging) {
        return;
      }

      isVideoScrollbarDragging = false;
      videoScrollbarDragGrabOffset = 0;
      if (videoPointer.active) {
        setVideoScrollbarActivityFromPointer(videoPointer.x, videoPointer.y);
        return;
      }

      syncVideoScrollbarState();
    });
  }

  if (videoScrollbarTrack) {
    videoScrollbarTrack.addEventListener("pointerdown", (event) => {
      if (videoIsMobileLayout.matches || getVideoPageMaxScrollTop() <= 0) {
        return;
      }

      event.preventDefault();
      isVideoScrollbarActive = true;
      const startedOnThumb =
        !!videoScrollbarThumb &&
        (event.target === videoScrollbarThumb ||
          videoScrollbarThumb.contains(event.target));

      if (startedOnThumb) {
        stopVideoScrollbarScrollAnimation();
        isVideoScrollbarDragging = true;
        const thumbRect = videoScrollbarThumb.getBoundingClientRect();
        videoScrollbarDragGrabOffset = isVerticalDesktopTimeline()
          ? event.clientY - thumbRect.top
          : event.clientX - thumbRect.left;
        syncVideoScrollbarState();
        syncTimelineOffsetFromPointerPosition(event.clientX, event.clientY, {
          immediate: true,
          preserveGrabOffset: true,
        });
        return;
      }

      isVideoScrollbarDragging = false;
      videoScrollbarDragGrabOffset = 0;
      syncVideoScrollbarState();
      syncTimelineOffsetFromPointerPosition(event.clientX, event.clientY, {
        animated: true,
        centerOnPointer: true,
      });
    });
  }

  layoutVideoTimeline();
  window.addEventListener("resize", layoutVideoTimeline);
  window.addEventListener("scroll", () => {
    syncVideoTimelineScroll({ snap: true });
    syncMobileVideoTimelinePattern();
    forceVideoMediaRefresh = true;
  }, {
    passive: true,
  });
  startVideoScene();
};

const initVideoPage = () => {
  if (!videoTimeline || !timelineScrollArea) {
    return;
  }

  initVideoHoverMedia();
  initVideoProjectLinks();
  initVideoTimelineScene();
  initMotionDesignAutoFormats();
};

initVideoPage();

const categorySection = document.querySelector(".categories");
const categoryCards = document.querySelectorAll(".category-card");
const canHover =
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const isMobileLayout = window.matchMedia("(max-width: 640px)");
const landing = document.querySelector(".landing");
const landingPatternBase = document.querySelector(".landing-pattern-base");
const landingPatternFocus = document.querySelector(".landing-pattern-focus");
const intro = document.querySelector(".intro");
const locationBlock = document.querySelector(".location");

const initLandingPattern = () => {
  if (!landing || !landingPatternBase || !landingPatternFocus) {
    return;
  }

  const landingPointer = { x: 0, y: 0, active: false };
  const desktopLineRatios = [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6];
  const desktopLineOffsets = [320, 720, 450, 200, 900];
  const desktopLineDurations = [29, 32, 30, 34, 31];
  const mobileLineRatios = [1 / 4, 2 / 4, 3 / 4];
  const mobileLineOffsets = [160, 360, 225];
  const mobileLineDurations = [21, 24, 22.5];
  const desktopPatternStep = 1080;
  const mobilePatternStep = 540;

  const getLandingPatternConfig = () =>
    isMobileLayout.matches
      ? {
          lineRatios: mobileLineRatios,
          lineOffsets: mobileLineOffsets,
          lineDurations: mobileLineDurations,
          step: mobilePatternStep,
        }
      : {
          lineRatios: desktopLineRatios,
          lineOffsets: desktopLineOffsets,
          lineDurations: desktopLineDurations,
          step: desktopPatternStep,
        };

  const syncLandingPatternFocus = () => {
    const isFocusActive = canHover && landingPointer.active && !isMobileLayout.matches;
    const focusOpacity = isFocusActive ? 1 : 0;

    landing.style.setProperty(
      "--landing-motif-focus-opacity",
      focusOpacity.toFixed(3)
    );

    if (!isFocusActive) {
      return;
    }

    landing.style.setProperty(
      "--landing-motif-focus-x",
      `${landingPointer.x.toFixed(2)}px`
    );
    landing.style.setProperty(
      "--landing-motif-focus-y",
      `${landingPointer.y.toFixed(2)}px`
    );
  };

  const buildLandingPatternLayer = (patternContainer, iconSrc) => {
    const { lineRatios, lineOffsets, lineDurations, step } =
      getLandingPatternConfig();
    const patternHeight = Math.max(landing.scrollHeight, window.innerHeight);
    const fragment = document.createDocumentFragment();

    lineRatios.forEach((lineRatio, lineIndex) => {
      landing.style.setProperty(
        `--landing-line-${lineIndex + 1}`,
        `${(lineRatio * 100).toFixed(6)}%`
      );

      const track = document.createElement("div");
      track.className = "landing-pattern-track";
      track.style.setProperty("--pattern-x", `var(--landing-line-${lineIndex + 1})`);
      track.style.setProperty("--landing-pattern-travel", `${step}px`);
      track.style.setProperty(
        "--landing-pattern-duration",
        `${(lineDurations[lineIndex] || lineDurations[lineDurations.length - 1]).toFixed(2)}s`
      );

      const firstOffset = lineOffsets[lineIndex] || 0;
      const animationProgress = ((firstOffset % step) + step) % step / step;
      const duration = lineDurations[lineIndex] || lineDurations[lineDurations.length - 1];
      track.style.animationDelay = `${(-animationProgress * duration).toFixed(2)}s`;

      for (let iconY = firstOffset - step; iconY <= patternHeight + step; iconY += step) {
        const icon = document.createElement("img");
        icon.className = "landing-pattern-icon";
        icon.src = iconSrc;
        icon.alt = "";
        icon.decoding = "async";
        icon.draggable = false;
        icon.setAttribute("aria-hidden", "true");
        icon.style.setProperty("--pattern-y", `${iconY}px`);
        track.appendChild(icon);
      }

      fragment.appendChild(track);
    });

    patternContainer.replaceChildren(fragment);
  };

  const rebuildLandingPattern = () => {
    buildLandingPatternLayer(landingPatternBase, "./rsrc/Keyframe-Grise.svg");
    buildLandingPatternLayer(landingPatternFocus, "./rsrc/Keyframe.svg");
    syncLandingPatternFocus();
  };

  if (canHover) {
    window.addEventListener("pointermove", (event) => {
      landingPointer.x = event.clientX;
      landingPointer.y = event.clientY;
      landingPointer.active = true;
      syncLandingPatternFocus();
    });

    window.addEventListener("pointerleave", () => {
      landingPointer.active = false;
      syncLandingPatternFocus();
    });
  }

  rebuildLandingPattern();
  window.addEventListener("resize", rebuildLandingPattern);
  isMobileLayout.addEventListener("change", rebuildLandingPattern);
};

initLandingPattern();

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

  const markCategoryCardMediaReady = (card, fallback = false) => {
    if (card.classList.contains("is-media-ready") || card.classList.contains("is-media-fallback")) {
      return;
    }

    card.classList.add(fallback ? "is-media-fallback" : "is-media-ready");
  };

  cards.forEach(({ element: card }) => {
    const video = card.querySelector(".category-video");

    if (!video) {
      markCategoryCardMediaReady(card, true);
      return;
    }

    const onMediaReady = () => {
      markCategoryCardMediaReady(card, false);
    };

    const onMediaError = () => {
      markCategoryCardMediaReady(card, true);
    };

    if (video.readyState >= 2) {
      onMediaReady();
    } else {
      video.addEventListener("loadeddata", onMediaReady, { once: true });
      video.addEventListener("canplay", onMediaReady, { once: true });
      video.addEventListener("error", onMediaError, { once: true });
    }
  });

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
    const footerHeight = locationBlock ? locationBlock.offsetHeight : 0;

    const topZone = introHeight + 36;
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
  updatePhotographyTitleVisibility();

  if (!event.persisted) {
    return;
  }

  if (isFolioPage) {
    playPageEntry();
    return;
  }

  playPageEntry({ withWhiteFade: true });
});
