import { loadMediaImage, cancelImageLoad } from "/rsrc/js/media-loading.js";
import { Gallery } from "./gallery.js?v=20260928-touch-drag";
import { ProjectMetadata } from "./metadata.js";
import { ProjectVideo } from "./video.js";
import { loadContent } from "/rsrc/js/cms.js?v=20261008-lightbox";

const isVideo = document.body.dataset.category === "video";
const main = document.querySelector("main");
const backNavigation = document.querySelector(".project__navigation");
const header = document.querySelector(".project__header");
const title = document.querySelector(".project__title");
const skills = document.querySelector(".project__skills");
const metadata = document.querySelector(".project__meta");
const details = new ProjectMetadata(metadata, isVideo);
const hero = isVideo ? new ProjectVideo(document.querySelector(".project__hero")) : null;
const stills = document.querySelector(".project__stills");
const footer = document.querySelector(".contact");
const container = document.querySelector(".gallery");
const status = document.querySelector(".status");
const message = document.querySelector(".status__message");
const loader = document.querySelector(".status__loader");
const retry = status.querySelector(".status__retry");
const dialog = document.querySelector(".lightbox");
const stage = document.querySelector(".lightbox__stage");
const slide = document.querySelector(".lightbox__slide");
const enlarged = document.querySelector(".lightbox__image");
const lightboxMedia = document.querySelector(".lightbox__media");
const close = document.querySelector(".lightbox__close");
const photoNavigation = [...document.querySelectorAll(".lightbox__nav")];
const photoAnnouncement = document.querySelector(".lightbox__announcement");
// The project selector uses an 820 ms cubic wipe; photos run at 1.5× speed.
const PHOTO_WIPE_DURATION = 820 / 1.5;
const photoCache = new Map();
let photos = [], requestedPhotoIndex = 0, photoDirection = 1;
let switchingPhoto = false, finishPhotoTransition;
let gallery, project, activePhoto, origin, savedScroll;
let request, lightboxRevision = 0;
let closingAnimation, closingPhotoAnimation;

function fitTitle() {
  if (!header || header.hidden) return;
  // Start from the responsive CSS size so a wider screen can grow it again.
  title.style.removeProperty("font-size");
  const available = title.clientWidth;
  const needed = title.scrollWidth;
  if (available > 0 && needed > available) {
    const size = parseFloat(getComputedStyle(title).fontSize);
    title.style.fontSize = `${size * (available - 1) / needed}px`;
  }
}

function showStatus(text, canRetry = false) {
  status.hidden = false;
  loader.hidden = true;
  message.classList.remove("sr-only");
  message.textContent = text;
  retry.hidden = !canRetry;
  main.setAttribute("aria-busy", "false");
}

async function load() {
  request?.abort();
  request = new AbortController();
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15000)]);
  gallery?.destroy();
  gallery = null;
  hero?.reset();
  backNavigation.hidden = false;
  metadata.hidden = footer.hidden = container.hidden = true;
  metadata.replaceChildren();
  if (header) header.hidden = true;
  if (stills) stills.hidden = true;
  status.hidden = loader.hidden = false;
  retry.hidden = true;
  message.classList.add("sr-only");
  message.textContent = "Chargement du projet…";
  main.setAttribute("aria-busy", "true");
  try {
    const id = document.body.dataset.projectId;
    const content = await loadContent(signal);
    project = (isVideo ? content.videos : content.projects).find(item => item.id === id);
    if (!project) throw new Error("Ce projet est introuvable.");
    backNavigation.querySelector("a").href = `${isVideo ? '/video' : '/photography'}#${project.slug}`;
    document.title = `Jérémy Delobel | ${project.title}`;
    details.render(project);
    footer.hidden = false;
    hero?.load(project);
    if (header) {
      title.textContent = project.title;
      skills.replaceChildren(...project.skills.map(skill => {
        const tag = document.createElement("li");
        tag.className = "project__skill";
        tag.textContent = skill;
        return tag;
      }));
      header.hidden = false;
      fitTitle();
    }
    status.hidden = true;
    main.setAttribute("aria-busy", "false");
    photos = project.photos.filter(photo => photo.prepared);
    if (!photos.length) {
      if (!isVideo) showStatus(project.photos.length ? "Les images de ce projet sont indisponibles." : "Ce projet ne contient pas encore d’image.", true);
      return;
    }
    container.hidden = false;
    if (stills) stills.hidden = false;
    gallery = new Gallery(container, photos, project.title, openPhoto, {
      rows: isVideo ? 1 : 2,
      shuffle: !isVideo,
      wheel: !isVideo,
      speed: isVideo ? 24 : 12,
    });
    // Lay out and decode the first visible rows behind the black curtain.
    gallery.layout();
    let imageDeadline;
    await Promise.race([
      Promise.all([...container.querySelectorAll("img")].map(image => image.decode().catch(() => {}))),
      new Promise(resolve => { imageDeadline = setTimeout(resolve, 3000); }),
    ]);
    clearTimeout(imageDeadline);
  } catch (error) {
    if (error.name === "AbortError") return;
    showStatus(error.name === "TimeoutError" ? "Le chargement prend trop de temps. Réessaie." :
      error instanceof TypeError ? "Le portfolio est indisponible. Réessaie." : error.message, true);
  } finally {
    void window.PageTransition.reveal();
  }
}

function fitPhoto() {
  if (!dialog.open || !activePhoto) return;
  for (const media of stage.querySelectorAll(".lightbox__media")) {
    const image = media.querySelector("img");
    const ratio = Number(image.getAttribute("width")) / Number(image.getAttribute("height"));
    const width = Math.min(stage.clientWidth, stage.clientHeight * ratio);
    media.style.width = image.style.width = `${width}px`;
    media.style.height = image.style.height = `${width / ratio}px`;
  }
  const photoBounds = lightboxMedia.getBoundingClientRect();
  const dialogBounds = dialog.getBoundingClientRect();
  dialog.style.setProperty("--lightbox-space-left", `${photoBounds.left - dialogBounds.left}px`);
  dialog.style.setProperty("--lightbox-space-right", `${dialogBounds.right - photoBounds.right}px`);
}

function preparePhoto(photo, priority = "low") {
  if (photoCache.has(photo.id)) return photoCache.get(photo.id).promise;
  const image = new Image();
  image.decoding = "async";
  image.fetchPriority = priority;
  const surface = document.createElement("div");
  const load = source => new Promise((resolve, reject) => {
    loadMediaImage(image, surface, source, {
      onReady: () => resolve(image),
      onError: () => {
        cancelImageLoad(image);
        reject(new Error("Cette photographie est indisponible. Réessaie."));
      },
    });
  });
  const entry = { image, promise: null };
  photoCache.set(photo.id, entry);
  entry.promise = load(photo.variants.large.url).catch(() => {
    if (photoCache.get(photo.id) !== entry) throw new DOMException("Chargement annulé", "AbortError");
    return load(photo.variants.small.url);
  }).catch(error => {
    if (photoCache.get(photo.id) === entry) photoCache.delete(photo.id);
    throw error;
  });
  return entry.promise;
}

function warmPhotoNeighbors() {
  const index = photos.indexOf(activePhoto);
  const neighbors = new Set([-1, 1].map(direction => photos[(index + direction + photos.length) % photos.length]));
  const keep = new Set([activePhoto.id, ...[...neighbors].map(photo => photo.id)]);
  for (const [id, entry] of photoCache) {
    if (keep.has(id)) continue;
    cancelImageLoad(entry.image);
    entry.image.removeAttribute("src");
    photoCache.delete(id);
  }
  for (const photo of neighbors) {
    if (photo !== activePhoto) void preparePhoto(photo).catch(() => {});
  }
}

function openPhoto(photo, source, image) {
  if (dialog.open) return;
  const revision = ++lightboxRevision;
  activePhoto = photo;
  requestedPhotoIndex = photos.indexOf(photo);
  slide.classList.add("is-opening");
  photoAnnouncement.textContent = "";
  for (const button of photoNavigation) button.hidden = photos.length < 2;
  // Moving rows recycle their buttons while the lightbox is open. Restore
  // focus to a stable element, never to a button now showing a different photo.
  origin = source.classList.contains("rail") ? source : container;
  enlarged.alt = `${project.title} — photographie ${photo.order + 1}`;
  enlarged.width = photo.width;
  enlarged.height = photo.height;
  loadMediaImage(enlarged, lightboxMedia, image?.naturalWidth ? image.currentSrc : photo.variants.small.url);
  savedScroll = { x: scrollX, y: scrollY };
  dialog.showModal();
  fitPhoto();
  close.focus({ preventScroll: true });
  void preparePhoto(photo, "high").then(image => {
    if (dialog.open && revision === lightboxRevision) {
      cancelImageLoad(enlarged);
      enlarged.src = image.src;
      lightboxMedia.dataset.mediaState = "ready";
    }
  }).catch(() => {});
  warmPhotoNeighbors();
}

function wipePhoto(outgoing, direction) {
  slide.classList.remove("is-opening");
  if (gallery.reduced) {
    outgoing.remove();
    return Promise.resolve();
  }
  slide.classList.add("is-switching");
  outgoing.classList.add("is-switching");
  const paint = reveal => {
    const hidden = (1 - reveal) * 100;
    // Complementary masks also clear the old image outside a new portrait.
    slide.style.clipPath = direction === 1 ? `inset(0 0 0 ${hidden}%)` : `inset(0 ${hidden}% 0 0)`;
    outgoing.style.clipPath = direction === 1 ? `inset(0 ${reveal * 100}% 0 0)` : `inset(0 0 0 ${reveal * 100}%)`;
  };
  paint(0);
  const start = performance.now();
  return new Promise(resolve => {
    let frame;
    const finish = () => {
      cancelAnimationFrame(frame);
      outgoing.remove();
      slide.style.removeProperty("clip-path");
      slide.classList.remove("is-switching");
      finishPhotoTransition = null;
      resolve();
    };
    finishPhotoTransition = finish;
    const tick = now => {
      const t = gallery.reduced ? 1 : Math.min((now - start) / PHOTO_WIPE_DURATION, 1);
      paint(t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      if (t < 1) frame = requestAnimationFrame(tick);
      else finish();
    };
    frame = requestAnimationFrame(tick);
  });
}

async function advancePhoto() {
  if (switchingPhoto || closingAnimation || !dialog.open || photos[requestedPhotoIndex] === activePhoto) return;
  switchingPhoto = true;
  const photo = photos[requestedPhotoIndex];
  const direction = photoDirection;
  const revision = ++lightboxRevision;
  const button = photoNavigation.find(button => Number(button.dataset.direction) === direction);
  button.dataset.loading = "true";
  photoAnnouncement.textContent = "";
  try {
    const image = await preparePhoto(photo, "high");
    if (!dialog.open || revision !== lightboxRevision) return;
    const outgoing = document.createElement("div");
    outgoing.className = "lightbox__slide";
    outgoing.setAttribute("aria-hidden", "true");
    outgoing.append(lightboxMedia.cloneNode(true));
    stage.prepend(outgoing);
    cancelImageLoad(enlarged);
    enlarged.src = image.src;
    enlarged.alt = `${project.title} — photographie ${photo.order + 1}`;
    enlarged.width = photo.width;
    enlarged.height = photo.height;
    lightboxMedia.dataset.mediaState = "ready";
    activePhoto = photo;
    fitPhoto();
    delete button.dataset.loading;
    await wipePhoto(outgoing, direction);
    if (revision !== lightboxRevision) return;
    photoAnnouncement.textContent = enlarged.alt;
    warmPhotoNeighbors();
  } catch (error) {
    if (revision !== lightboxRevision) return;
    if (photos[requestedPhotoIndex] === photo) requestedPhotoIndex = photos.indexOf(activePhoto);
    photoAnnouncement.textContent = error.message;
  } finally {
    if (revision === lightboxRevision) {
      delete button.dataset.loading;
      switchingPhoto = false;
      void advancePhoto();
    }
  }
}

function switchPhoto(direction) {
  if (!dialog.open || closingAnimation || photos.length < 2) return;
  requestedPhotoIndex = (requestedPhotoIndex + direction + photos.length) % photos.length;
  photoDirection = direction;
  void advancePhoto();
}

function closePhoto() {
  if (!dialog.open || closingAnimation) return;
  ++lightboxRevision;
  if (gallery.reduced) {
    dialog.close();
    return;
  }
  // Start at the current appearance, including when closing during the reveal.
  const opacity = getComputedStyle(dialog).opacity;
  const transform = getComputedStyle(enlarged).transform;
  const timing = { duration: 320, easing: "cubic-bezier(.22,.61,.36,1)", fill: "forwards" };
  closingAnimation = dialog.animate([{ opacity }, { opacity: 0 }], timing);
  closingPhotoAnimation = enlarged.animate([{ transform }, { transform: "scale(.98)" }], timing);
  closingAnimation.finished.then(() => {
    if (dialog.open) dialog.close();
  }, () => {});
}

function restorePage() {
  ++lightboxRevision;
  finishPhotoTransition?.();
  switchingPhoto = false;
  for (const button of photoNavigation) delete button.dataset.loading;
  for (const entry of photoCache.values()) {
    cancelImageLoad(entry.image);
    entry.image.removeAttribute("src");
  }
  photoCache.clear();
  closingAnimation?.cancel();
  closingPhotoAnimation?.cancel();
  closingAnimation = closingPhotoAnimation = null;
  activePhoto = null;
  window.scrollTo({ left: savedScroll.x, top: savedScroll.y, behavior: "instant" });
  if (origin?.isConnected) origin.focus({ preventScroll: true });
  cancelImageLoad(enlarged);
  enlarged.removeAttribute("src");
  origin = null;
}

close.addEventListener("click", closePhoto);
for (const button of photoNavigation) {
  button.addEventListener("click", () => switchPhoto(Number(button.dataset.direction)));
}
dialog.addEventListener("click", event => {
  if (event.target === dialog || event.target === stage || event.target.classList.contains("lightbox__slide")) closePhoto();
});
dialog.addEventListener("cancel", event => {
  event.preventDefault();
  closePhoto();
});
dialog.addEventListener("close", restorePage);
// Keep the document and its scrollbar in place while the modal owns input.
window.addEventListener("wheel", event => {
  if (dialog.open && !event.ctrlKey && !event.metaKey) event.preventDefault();
}, { passive: false });
window.addEventListener("touchmove", event => {
  if (dialog.open && event.touches.length === 1) event.preventDefault();
}, { passive: false });
document.addEventListener("keydown", event => {
  if (!dialog.open) return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    switchPhoto(event.key === "ArrowRight" ? 1 : -1);
    return;
  }
  const scrollKeys = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"];
  if (scrollKeys.includes(event.key) || (event.key === " " && !event.target.closest("button"))) {
    event.preventDefault();
  }
});
window.addEventListener("scroll", () => {
  // Also hold position if the native scrollbar is dragged or clicked.
  if (dialog.open && (scrollX !== savedScroll.x || scrollY !== savedScroll.y)) {
    window.scrollTo({ left: savedScroll.x, top: savedScroll.y, behavior: "instant" });
  }
});
window.addEventListener("resize", fitPhoto);
window.addEventListener("resize", fitTitle);
// Only width changes trigger fitting, avoiding a loop when fitting changes
// the header's height. Refit once the final font replaces its fallback too.
let titleContainerWidth = 0;
const titleResize = new ResizeObserver(([entry]) => {
  if (entry.contentRect.width === titleContainerWidth) return;
  titleContainerWidth = entry.contentRect.width;
  fitTitle();
});
if (header) titleResize.observe(header);
document.fonts.addEventListener("loadingdone", fitTitle);
void document.fonts.ready.then(fitTitle);
window.visualViewport?.addEventListener("resize", fitPhoto);
retry.addEventListener("click", load);
window.addEventListener("pagehide", () => gallery?.stop());
window.addEventListener("pageshow", () => gallery?.wake());
load();
