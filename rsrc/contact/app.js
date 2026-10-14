import { loadContent } from "../js/cms.js";

const reel = document.querySelector(".contact-reel");
const track = reel.querySelector(".contact-reel__track");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let ready = false;

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

function selectImages(manifest, media) {
  const imagesFor = (ids) => shuffle([...new Set(ids)]
    .map(id => media.get(id))
    .filter(image => image?.variants.small));
  const photos = imagesFor(manifest.projects.flatMap(project => project.showcase));
  const stills = imagesFor(manifest.collaborations.flatMap(project => project.images));
  const total = photos.length + stills.length;
  const stillCount = stills.length;
  const selection = [];
  // Spread the video stills throughout the photos, even with unequal counts.
  for (let index = 0; index < total; index += 1) {
    const useStill = Math.floor((index + 1) * stillCount / total) > Math.floor(index * stillCount / total);
    selection.push(useStill ? stills.shift() : photos.shift());
  }
  return selection;
}

function syncPlayback() {
  reel.classList.toggle("is-playing", ready && !reducedMotion.matches && !document.hidden);
}

function createImage(media, index) {
  const { small, large } = media.variants;
  const image = new Image();
  image.className = "contact-reel__frame";
  image.alt = "";
  image.draggable = false;
  image.decoding = "async";
  image.loading = index < 8 ? "eager" : "lazy";
  image.width = 16;
  image.height = 9;
  image.sizes = "(max-width: 700px) 66.6667vw, 18.75vw";
  image.srcset = `${small.url} ${small.width}w, ${large.url} ${large.width}w`;
  image.src = small.url;
  return image;
}

async function initialize() {
  try {
    const { manifest, media } = await loadContent(AbortSignal.timeout(8000));
    const selection = selectImages(manifest, media);
    if (!selection.length) return;
    // Each half must cover the viewport for a seamless loop, including small libraries.
    const frames = Array.from({ length: Math.max(6, selection.length) }, (_, index) => selection[index % selection.length]);
    const group = document.createElement("div");
    group.className = "contact-reel__group";
    group.append(...frames.map(createImage));
    track.append(group, group.cloneNode(true));
    track.style.setProperty("--reel-duration", `${frames.length * 16}s`);
    reel.hidden = false;
    await Promise.allSettled([...group.children].slice(0, 8).map(image => image.decode()));
    ready = true;
    syncPlayback();
  } catch (error) {
    console.error("Unable to load the contact slideshow:", error);
  } finally {
    // Contact links stay available even if the decorative media cannot load.
    void window.PageTransition.reveal();
  }
}

document.addEventListener("visibilitychange", syncPlayback);
reducedMotion.addEventListener("change", syncPlayback);

void initialize();
