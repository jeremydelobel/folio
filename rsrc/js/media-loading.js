// Shared visual states. A stale request cannot settle a newer load on the same surface.
const surfaces = new WeakMap();
const images = new WeakMap();

export function beginMediaLoad(surface) {
  const token = {};
  surfaces.set(surface, token);
  surface.classList.add('media-loading-surface');
  surface.dataset.mediaState = 'loading';
  const settle = state => {
    if (surfaces.get(surface) === token) surface.dataset.mediaState = state;
  };
  return { ready: () => settle('ready'), fail: () => settle('error'),
    cancel: () => { settle('idle'); if (surfaces.get(surface) === token) surfaces.delete(surface); } };
}

export function cancelImageLoad(image) {
  images.get(image)?.();
}

export function loadMediaImage(image, surface, source, { onReady, onError } = {}) {
  cancelImageLoad(image);
  const state = beginMediaLoad(surface);
  let active = true;
  let decoding = false;
  const cleanup = () => {
    clearTimeout(timer);
    image.removeEventListener('load', decode);
    image.removeEventListener('error', fail);
    if (images.get(image) === cancel) images.delete(image);
  };
  const finish = success => {
    if (!active) return;
    active = false;
    cleanup();
    if (success) { state.ready(); onReady?.(); }
    else { state.fail(); onError?.(); }
  };
  const fail = () => finish(false);
  const decode = () => {
    if (!active || decoding || !image.complete || !image.naturalWidth) return;
    decoding = true;
    image.decode().then(() => finish(true), fail);
  };
  const cancel = () => { active = false; cleanup(); state.cancel(); };
  const timer = setTimeout(() => {
    if (!active) return;
    state.fail();
    onError?.();
    // A delayed lazy image can still recover when it eventually loads.
  }, 15000);
  images.set(image, cancel);
  image.addEventListener('load', decode);
  image.addEventListener('error', fail);
  image.src = source;
  // Cached resources may already be complete without a new load event.
  queueMicrotask(decode);
  return cancel;
}
