import { loadMediaImage, cancelImageLoad } from "/rsrc/js/media-loading.js";
import { Gallery } from "./gallery.js?v=20260928-touch-drag";
import { ProjectMetadata } from "./metadata.js";
import { ProjectVideo } from "./video.js";
import { loadContent } from "/rsrc/js/cms.js";

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
const enlarged = document.querySelector(".lightbox__image");
const lightboxMedia = document.querySelector(".lightbox__media");
const close = document.querySelector(".lightbox__close");
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
    const photos = project.photos.filter(photo => photo.prepared);
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
  const ratio = activePhoto.width / activePhoto.height;
  const width = Math.min(stage.clientWidth, stage.clientHeight * ratio);
  lightboxMedia.style.width = `${width}px`;
  lightboxMedia.style.height = `${width / ratio}px`;
  enlarged.style.width = `${width}px`;
  enlarged.style.height = `${width / ratio}px`;
}

function openPhoto(photo, source, image) {
  if (dialog.open) return;
  const revision = ++lightboxRevision;
  activePhoto = photo;
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
  const large = new Image();
  large.decoding = "async";
  large.fetchPriority = "high";
  large.onload = async () => {
    try { await large.decode(); } catch { return; }
    if (dialog.open && revision === lightboxRevision) {
      cancelImageLoad(enlarged);
      enlarged.src = photo.variants.large.url;
      lightboxMedia.dataset.mediaState = "ready";
    }
  };
  // Keep the already visible image if the larger derivative fails.
  large.src = photo.variants.large.url;
}

function closePhoto() {
  if (!dialog.open || closingAnimation) return;
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
dialog.addEventListener("click", event => {
  if (event.target === dialog || event.target === stage) closePhoto();
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
  const scrollKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"];
  if (scrollKeys.includes(event.key) || (event.key === " " && event.target !== close)) {
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
