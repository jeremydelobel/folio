import { loadMediaImage, cancelImageLoad } from "/rsrc/js/media-loading.js";

const mod = (value, length) => ((value % length) + length) % length;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
// Follow the reusable horizontal-scroll-engine's target easing and wheel
// gestures, while keeping this gallery's continuous drift and recycled DOM.
const SCROLL = { ease: .06, wheelNotchPx: 40, trackpadStepPx: 24, gestureGapMs: 140 };
const FOLLOW_RATE = -60 * Math.log(1 - SCROLL.ease);

export function splitPhotos(photos, rows, shuffle) {
  const ordered = photos.slice();
  if (shuffle) {
    for (let index = ordered.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [ordered[index], ordered[other]] = [ordered[other], ordered[index]];
    }
  }
  if (!ordered.length) return [];
  if (rows === 1) return [ordered];
  // A single photograph still fills both continuously moving lines.
  if (ordered.length === 1) return [ordered, ordered.slice()];
  const middle = Math.ceil(ordered.length / 2);
  return [ordered.slice(0, middle), ordered.slice(middle)];
}

export function measureLine(photos, height, gap) {
  let period = 0;
  const widths = [], starts = [];
  for (const photo of photos) {
    const width = height * photo.width / photo.height;
    starts.push(period);
    widths.push(width);
    period += width + gap;
  }
  return { widths, starts, period };
}

function indexAt(starts, coordinate) {
  let low = 0, high = starts.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (starts[middle] <= coordinate) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

class Line {
  constructor(engine, photos, number) {
    this.engine = engine;
    this.photos = photos;
    this.number = number;
    this.direction = number === 0 ? 1 : -1;
    this.offset = 0;
    this.target = 0;
    this.renderOrigin = 0;
    this.resetWheel();
    this.selected = null;
    this.nodes = new Map();
    this.pool = [];
    this.initial = true;
    this.el = document.createElement("div");
    this.el.className = "rail";
    this.el.tabIndex = 0;
    this.el.setAttribute("role", "region");
    this.el.setAttribute("aria-label", engine.rows === 1 ? "Images du projet" : number === 0 ? "Première ligne de photographies" : "Seconde ligne de photographies");
    this.el.setAttribute("aria-describedby", "gallery-help");
    this.track = document.createElement("div");
    this.track.className = "rail__track";
    this.announcement = document.createElement("span");
    this.announcement.className = "sr-only";
    this.announcement.setAttribute("role", "status");
    this.el.append(this.track, this.announcement);
    engine.container.append(this.el);
    const signal = engine.events.signal;
    if (engine.wheelEnabled) this.el.addEventListener("wheel", event => this.wheel(event), { passive: false, signal });
    this.el.addEventListener("pointerdown", event => this.pointerDown(event), { signal });
    this.el.addEventListener("pointermove", event => this.pointerMove(event), { signal });
    this.el.addEventListener("pointerup", () => this.endDrag(), { signal });
    this.el.addEventListener("pointercancel", () => this.endDrag(true), { signal });
    this.el.addEventListener("lostpointercapture", event => {
      // Touch initially captures the image. Its release bubbles when the rail
      // takes over; only losing the rail's own capture ends the drag.
      if (event.target === this.el && event.pointerId === this.drag?.id) this.endDrag(true);
    }, { signal });
    this.el.addEventListener("click", event => {
      const button = event.target.closest(".photo");
      if (!button || performance.now() < (this.suppressClickUntil || 0)) return;
      const photo = this.photos[Number(button.dataset.index)];
      engine.open(photo, button, button.querySelector("img"));
    }, { signal });
    this.el.addEventListener("keydown", event => this.key(event), { signal });
    this.el.addEventListener("focus", () => {
      if (!this.geometry) return;
      this.keyPaused = true;
      this.target = this.offset;
      this.resetWheel();
      this.selected = this.closest();
      this.updateSelection();
    }, { signal });
    this.el.addEventListener("focusout", event => {
      if (!this.el.contains(event.relatedTarget)) {
        this.keyPaused = false;
        engine.wake();
      }
    }, { signal });
    this.el.addEventListener("dragstart", event => event.preventDefault(), { signal });
  }

  get baseSpeed() {
    return !this.engine.reduced && !this.keyPaused ? this.direction * this.engine.speed : 0;
  }

  get moving() { return !this.drag?.active && (this.baseSpeed !== 0 || this.target !== this.offset); }

  layout(height, gap, viewport) {
    const old = this.geometry;
    let anchor = 0, fraction = 0;
    if (old && old.period) {
      const position = mod(this.offset, old.period);
      anchor = indexAt(old.starts, position);
      fraction = (position - old.starts[anchor]) / (old.widths[anchor] + this.gap);
    }
    this.viewport = viewport;
    this.gap = gap;
    this.geometry = measureLine(this.photos, height, gap);
    const g = this.geometry;
    this.offset = g.starts[anchor] + fraction * (g.widths[anchor] + gap);
    this.target = this.offset;
    this.resetWheel();
    for (const node of [...this.nodes.values(), ...this.pool]) { cancelImageLoad(node.firstElementChild); node.remove(); }
    this.nodes.clear();
    this.pool.length = 0;
    this.coverage = null;
    this.paint(true);
  }

  step(dt) {
    if (!this.drag?.active) {
      // Advance both coordinates so autoplay keeps its configured speed, even
      // after an impulse. The reference's .06 easing is normalized to time.
      const drift = this.baseSpeed * dt;
      this.offset += drift;
      this.target += drift;
      const follow = 1 - Math.exp(-FOLLOW_RATE * dt);
      // Keep the reference's proportional response: successive wheel steps
      // extend the target and naturally accelerate the row, without a plateau.
      this.offset += (this.target - this.offset) * follow;
      if (Math.abs(this.target - this.offset) < .05) this.offset = this.target;
    }
    this.paint();
  }

  createNode() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "photo";
    button.tabIndex = -1;
    const img = document.createElement("img");
    img.className = "photo__image";
    img.decoding = "async";
    img.draggable = false;
    button.append(img);
    return button;
  }

  fillNode(button, index, left) {
    const photo = this.photos[index], g = this.geometry;
    const img = button.firstElementChild;
    button.dataset.index = index;
    button.dataset.loaded = "false";
    delete button.dataset.error;
    button.dataset.selected = String(index === this.selected);
    button.style.left = `${left - this.renderOrigin}px`;
    button.style.width = `${g.widths[index]}px`;
    button.setAttribute("aria-label", `Agrandir la photographie ${photo.order + 1} — ${this.engine.title}`);
    const visible = left + g.widths[index] > this.offset && left < this.offset + this.viewport;
    img.width = photo.width;
    img.height = photo.height;
    img.alt = `${this.engine.title} — photographie ${photo.order + 1}`;
    img.loading = this.initial && visible ? "eager" : "lazy";
    img.fetchPriority = this.initial && visible && !this.prioritized ? "high" : "low";
    if (this.initial && visible) this.prioritized = true;
    // The marquee always uses the CMS small derivative, including on Retina.
    // Large derivatives are requested only when opening the lightbox.
    loadMediaImage(img, button, photo.variants.small.url, {
      onReady: () => { button.dataset.loaded = "true"; delete button.dataset.error; },
      onError: () => { button.dataset.error = "true"; button.dataset.loaded = "false"; },
    });
  }

  paint(force = false) {
    const g = this.geometry;
    const buffer = this.viewport * .55;
    if (force || !this.coverage || this.offset - buffer * .45 < this.coverage.left ||
        this.offset + this.viewport + buffer * .45 > this.coverage.right) {
      const left = this.offset - buffer, right = this.offset + this.viewport + buffer;
      const count = this.photos.length;
      const cycle = Math.floor(left / g.period);
      let index = indexAt(g.starts, mod(left, g.period));
      let virtual = cycle * count + index;
      const wanted = new Map();
      let x = 0;
      while (true) {
        index = mod(virtual, count);
        x = Math.floor(virtual / count) * g.period + g.starts[index];
        if (x > right) break;
        wanted.set(virtual, { index, x });
        virtual++;
      }
      for (const [key, button] of this.nodes) {
        if (!wanted.has(key)) {
          cancelImageLoad(button.firstElementChild);
          button.remove();
          this.nodes.delete(key);
          this.pool.push(button);
        }
      }
      // Rebase only screen coordinates, preserving the actual visible nodes.
      // GPU transforms stay small even for huge libraries and long sessions.
      this.renderOrigin = this.offset;
      for (const [key, { index: photoIndex, x: photoX }] of wanted) {
        if (this.nodes.has(key)) {
          this.nodes.get(key).style.left = `${photoX - this.renderOrigin}px`;
          continue;
        }
        const button = this.pool.pop() || this.createNode();
        this.fillNode(button, photoIndex, photoX);
        this.nodes.set(key, button);
        this.track.append(button);
      }
      // Recycling must preserve the visual reading order for screen readers.
      let sibling = this.track.firstElementChild;
      for (const key of wanted.keys()) {
        const button = this.nodes.get(key);
        if (button !== sibling) this.track.insertBefore(button, sibling);
        sibling = button.nextElementSibling;
      }
      // Keep only a small reusable pool, independent of the total library size.
      this.pool.length = Math.min(this.pool.length, 4);
      this.coverage = { left, right };
      this.initial = false;
    }
    this.track.style.transform = `translate3d(${this.renderOrigin - this.offset}px, 0, 0)`;
    for (const button of this.nodes.values()) {
      const left = parseFloat(button.style.left) + this.renderOrigin;
      const visible = left + g.widths[Number(button.dataset.index)] > this.offset && left < this.offset + this.viewport;
      if (button.inert === visible) button.inert = !visible;
    }
  }

  resetWheel() {
    this.lastWheelAt = -Infinity;
    this.smoothWheelDelta = 0;
    this.smoothGestureStepped = false;
  }

  centerAt(index) {
    const source = mod(index, this.photos.length);
    const g = this.geometry;
    return Math.floor(index / this.photos.length) * g.period + g.starts[source] + g.widths[source] / 2;
  }

  nearestAt(coordinate) {
    const g = this.geometry;
    const slot = Math.floor(coordinate / g.period) * this.photos.length + indexAt(g.starts, mod(coordinate, g.period));
    let nearest = slot;
    for (const candidate of [slot - 1, slot + 1]) {
      if (Math.abs(this.centerAt(candidate) - coordinate) < Math.abs(this.centerAt(nearest) - coordinate)) nearest = candidate;
    }
    return nearest;
  }

  nudge(direction) {
    // Advance from the queued destination, exactly as in the reference.
    // Opposite steps pull that destination back, progressively braking the row.
    const index = this.nearestAt(this.target + this.viewport / 2);
    this.target = this.centerAt(index + direction) - this.viewport / 2;
    if (this.engine.reduced) this.offset = this.target;
  }

  wheel(event) {
    if (event.ctrlKey || event.metaKey || this.drag?.active || !this.geometry) return;
    const delta = event.deltaY || event.deltaX;
    if (!delta) return;
    event.preventDefault();
    this.keyPaused = false;
    const now = performance.now();
    if (now - this.lastWheelAt > SCROLL.gestureGapMs) {
      this.smoothWheelDelta = 0;
      this.smoothGestureStepped = false;
    }
    this.lastWheelAt = now;
    // Test every event, including fractional deltas and the stronger middle
    // of a trackpad swipe. Group only small deltas, as the reference does.
    const notch = event.deltaMode !== 0 || Math.abs(delta) >= SCROLL.wheelNotchPx;
    if (notch) {
      this.smoothWheelDelta = 0;
      this.smoothGestureStepped = false;
      this.nudge(Math.sign(delta));
    } else {
      if (this.smoothWheelDelta !== 0 && Math.sign(delta) !== Math.sign(this.smoothWheelDelta)) {
        this.smoothWheelDelta = 0;
        this.smoothGestureStepped = false;
      }
      this.smoothWheelDelta += delta;
      if (!this.smoothGestureStepped && Math.abs(this.smoothWheelDelta) >= SCROLL.trackpadStepPx) {
        this.smoothGestureStepped = true;
        this.nudge(Math.sign(this.smoothWheelDelta));
      }
    }
    this.engine.wake();
  }

  pointerDown(event) {
    if (!event.isPrimary) { this.endDrag(true); return; }
    if (event.button !== 0) return;
    this.keyPaused = false;
    this.resetWheel();
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY,
      lastX: event.clientX, time: event.timeStamp, speed: 0, active: false };
  }

  pointerMove(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.active) {
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { this.endDrag(true); return; }
      if (Math.abs(dx) < 8) return;
      drag.active = true;
      this.el.setPointerCapture(event.pointerId);
      this.el.classList.add("is-dragging");
    }
    const dx = drag.lastX - event.clientX;
    const dt = Math.max(8, event.timeStamp - drag.time) / 1000;
    drag.speed = drag.speed * .35 + clamp(dx / dt, -1200, 1200) * .65;
    drag.lastX = event.clientX;
    drag.time = event.timeStamp;
    this.offset += dx;
    this.target = this.offset;
    this.engine.wake();
  }

  endDrag(cancel = false) {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    if (drag.active) {
      this.suppressClickUntil = performance.now() + 350;
      const speed = cancel || this.engine.reduced || performance.now() - drag.time > 120 ? 0 : drag.speed;
      // Project the release into the same target follower used by the wheel.
      this.target = this.offset + speed / FOLLOW_RATE;
    }
    this.el.classList.remove("is-dragging");
    if (this.el.hasPointerCapture(drag.id)) this.el.releasePointerCapture(drag.id);
    this.engine.wake();
  }

  closest() {
    return mod(this.nearestAt(this.offset + this.viewport / 2), this.photos.length);
  }

  updateSelection() {
    for (const node of this.nodes.values()) node.dataset.selected = String(Number(node.dataset.index) === this.selected);
  }

  key(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    this.keyPaused = true;
    this.target = this.offset;
    this.resetWheel();
    if (this.selected === null) this.selected = this.closest();
    if (event.key === "Enter" || event.key === " ") {
      const button = [...this.nodes.values()].find(node => Number(node.dataset.index) === this.selected &&
        parseFloat(node.style.left) + this.renderOrigin + this.geometry.widths[this.selected] > this.offset &&
        parseFloat(node.style.left) + this.renderOrigin < this.offset + this.viewport);
      this.engine.open(this.photos[this.selected], this.el, button?.firstElementChild);
      return;
    }
    const delta = event.key === "ArrowLeft" ? -1 : 1;
    this.selected = event.key === "Home" ? 0 : event.key === "End" ? this.photos.length - 1 :
      mod(this.selected + delta, this.photos.length);
    this.offset = this.geometry.starts[this.selected] + this.geometry.widths[this.selected] / 2 - this.viewport / 2;
    this.target = this.offset;
    this.paint(true);
    this.updateSelection();
    this.announcement.textContent = `Photographie ${this.photos[this.selected].order + 1}`;
  }
}

export class Gallery {
  constructor(container, photos, title, open, { rows, shuffle, wheel, speed }) {
    this.container = container;
    this.title = title;
    this.open = open;
    this.rows = rows;
    this.wheelEnabled = wheel;
    this.speed = speed;
    this.events = new AbortController();
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.reduced = this.motion.matches;
    this.lines = splitPhotos(photos, rows, shuffle).map((line, index) => new Line(this, line, index));
    this.frame = 0;
    this.last = null;
    this.layoutPending = true;
    this.resize = new ResizeObserver(() => { this.layoutPending = true; this.wake(); });
    this.resize.observe(container);
    const signal = this.events.signal;
    window.addEventListener("resize", () => { this.layoutPending = true; this.wake(); }, { signal });
    document.addEventListener("visibilitychange", () => {
      this.last = null;
      if (document.hidden) {
        this.stop();
        for (const line of this.lines) line.endDrag(true);
      }
      else this.wake();
    }, { signal });
    this.motion.addEventListener("change", () => {
      this.reduced = this.motion.matches;
      for (const line of this.lines) {
        line.target = line.offset;
        line.resetWheel();
      }
      this.wake();
    }, { signal });
    this.wake();
  }

  layout() {
    const box = this.container.getBoundingClientRect();
    const style = getComputedStyle(this.container);
    const gap = parseFloat(style.columnGap);
    const bleed = parseFloat(style.getPropertyValue("--bleed"));
    // CSS sizes each row independently of the page header, metadata and footer.
    const height = this.lines[0].el.getBoundingClientRect().height - bleed * 2;
    const signature = `${height}:${gap}:${box.width}`;
    if (signature !== this.layoutSignature) {
      this.layoutSignature = signature;
      for (const line of this.lines) line.layout(height, gap, box.width);
    }
    this.layoutPending = false;
  }

  wake() {
    if (this.frame || document.hidden || this.destroyed) return;
    this.frame = requestAnimationFrame(timestamp => this.tick(timestamp));
  }

  tick(timestamp) {
    this.frame = 0;
    if (this.layoutPending) this.layout();
    const dt = this.last === null ? 0 : Math.min((timestamp - this.last) / 1000, .05);
    this.last = timestamp;
    for (const line of this.lines) line.step(dt);
    if (this.lines.some(line => line.moving)) this.wake();
    else this.last = null;
  }

  stop() { cancelAnimationFrame(this.frame); this.frame = 0; this.last = null; }

  destroy() {
    this.destroyed = true;
    this.stop();
    this.resize.disconnect();
    this.events.abort();
    for (const line of this.lines) {
      for (const node of [...line.nodes.values(), ...line.pool]) cancelImageLoad(node.firstElementChild);
    }
    this.container.replaceChildren();
  }
}
