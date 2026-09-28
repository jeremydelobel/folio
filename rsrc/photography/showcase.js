import { beginMediaLoad } from "/rsrc/js/media-loading.js";

const PHOTO_DURATION = 2500;
const FADE_DURATION = 900;
const RETENTION_DURATION = 10_000;
const PRELOAD_COUNT = 2;

export class Showcase {
  constructor(container, photos) {
    this.container = container;
    // Shuffle once per visit so the preload order and cached indices stay stable.
    this.photos = photos.slice();
    for (let index = this.photos.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [this.photos[index], this.photos[other]] = [this.photos[other], this.photos[index]];
    }
    this.entries = new Map();
    this.index = 0;
    this.active = false;
    this.playing = false;
    this.destroyed = false;
    this.preloadVersion = 0;
    this.advanceVersion = 0;
    this.expiresAt = 0;
    this.evictionTimer = 0;
    this.slideTimer = 0;
    this.animation = null;
    this.nextIndex = null;
  }

  load(index, priority = 'low') {
    const cached = this.entries.get(index);
    if (cached) return cached.promise;
    const photo = this.photos[index];
    if (!photo || this.destroyed) return Promise.resolve(null);
    const image = new Image(photo.width, photo.height);
    image.className = 'project__image';
    image.alt = '';
    image.draggable = false;
    image.decoding = 'async';
    image.fetchPriority = priority;
    const entry = { image, ready: false, failed: false, cancel: null, promise: null };
    this.entries.set(index, entry);
    entry.promise = new Promise((resolve, reject) => {
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        image.onload = image.onerror = null;
        entry.cancel = null;
        entry.failed = Boolean(error);
        if (error) {
          image.removeAttribute('src');
          reject(error);
        } else {
          entry.ready = true;
          resolve(image);
        }
      };
      const deadline = setTimeout(() => finish(new Error('La photo tarde à charger. Réessaie.')), 15000);
      entry.cancel = () => finish(new DOMException('Chargement annulé', 'AbortError'));
      image.onload = () => image.decode().then(() => finish(), () => finish(new Error('Cette photographie est indisponible.')));
      image.onerror = () => finish(new Error('Cette photographie est indisponible. Réessaie.'));
      image.src = photo.url;
    });
    // A preload failure must not replace the photo that is already on screen.
    void entry.promise.catch(() => {});
    return entry.promise;
  }

  async prepare(retry = false, priority = 'low') {
    this.evictExpired();
    if (retry && this.entries.get(this.index)?.failed) this.release(this.index);
    const loading = !this.container.children.length && this.photos.length
      ? beginMediaLoad(this.container) : null;
    try {
      const image = await this.load(this.index, priority);
      if (this.destroyed) { loading?.cancel(); return; }
      if (!image) { loading?.fail(); return; }
      if (!this.container.children.length) this.container.replaceChildren(image);
      loading?.ready();
    } catch (error) {
      loading?.fail();
      throw error;
    }
  }

  preload(count) {
    const version = ++this.preloadVersion;
    // One background request per project; leaving it stops the remaining queue.
    void (async () => {
      for (let index = 0; index < Math.min(count, this.photos.length); index++) {
        if (this.destroyed || version !== this.preloadVersion) return;
        try { await this.load(index); } catch { /* Keep loading the other photos. */ }
      }
    })();
  }

  warm() {
    this.evictExpired();
    if (!this.active) this.preload(PRELOAD_COUNT);
  }

  activate() {
    this.evictExpired();
    this.active = true;
    clearTimeout(this.evictionTimer);
    this.expiresAt = 0;
    for (const [index, entry] of this.entries) {
      if (entry.failed) this.release(index);
    }
    this.preload(this.photos.length);
  }

  deactivate() {
    this.active = false;
    this.setPlaying(false);
    this.finishFade();
    ++this.preloadVersion;
    clearTimeout(this.evictionTimer);
    this.expiresAt = Date.now() + RETENTION_DURATION;
    this.evictionTimer = setTimeout(() => this.evictExpired(), RETENTION_DURATION);
  }

  evictExpired() {
    if (this.active || !this.expiresAt || Date.now() < this.expiresAt) return;
    clearTimeout(this.evictionTimer);
    this.expiresAt = 0;
    ++this.preloadVersion;
    this.finishFade();
    this.index = 0;
    const first = this.entries.get(0);
    this.container.replaceChildren(...(first?.ready ? [first.image] : []));
    for (const index of this.entries.keys()) {
      if (index >= PRELOAD_COUNT) this.release(index);
    }
  }

  release(index) {
    const entry = this.entries.get(index);
    if (!entry) return;
    entry.cancel?.();
    entry.image.remove();
    entry.image.removeAttribute('src');
    this.entries.delete(index);
  }

  setPlaying(playing, reduced = false) {
    this.reduced = reduced;
    this.playing = playing && this.active && this.photos.length > 1;
    clearTimeout(this.slideTimer);
    ++this.advanceVersion;
    if (this.animation) {
      if (this.playing) this.animation.play();
      else this.animation.pause();
    } else {
      this.schedule();
    }
  }

  schedule() {
    clearTimeout(this.slideTimer);
    if (this.playing && !this.destroyed) {
      this.slideTimer = setTimeout(() => { void this.advance(); }, PHOTO_DURATION);
    }
  }

  async advance() {
    const version = ++this.advanceVersion;
    // Try each following image once, so a failed image cannot stall the loop.
    for (let offset = 1; offset < this.photos.length; offset++) {
      if (this.destroyed || !this.playing || version !== this.advanceVersion) return;
      const index = (this.index + offset) % this.photos.length;
      let image;
      try { image = await this.load(index); } catch { continue; }
      if (this.destroyed || !this.playing || version !== this.advanceVersion) return;
      if (!image) continue;
      this.nextIndex = index;
      this.container.append(image);
      this.animation = image.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: this.reduced ? 0 : FADE_DURATION,
        easing: 'ease-in-out',
        fill: 'forwards',
      });
      this.animation.onfinish = () => {
        this.finishFade();
        this.schedule();
      };
      return;
    }
    this.schedule();
  }

  finishFade() {
    if (!this.animation) return;
    const image = this.entries.get(this.nextIndex)?.image;
    if (image) {
      this.index = this.nextIndex;
      this.container.replaceChildren(image);
    }
    this.animation.onfinish = null;
    this.animation.cancel();
    this.animation = null;
    this.nextIndex = null;
  }

  destroy() {
    this.destroyed = true;
    this.active = false;
    this.setPlaying(false);
    ++this.preloadVersion;
    clearTimeout(this.evictionTimer);
    this.finishFade();
    for (const index of this.entries.keys()) this.release(index);
    this.container.replaceChildren();
  }
}
