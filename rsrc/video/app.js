import { beginMediaLoad } from '/rsrc/js/media-loading.js';
import { loadContent } from '/rsrc/js/cms.js';

const stage = document.querySelector('.project');
const slides = document.querySelector('.project__slides');
const template = document.querySelector('#project-slide');
const status = document.querySelector('.project__status');
const message = document.querySelector('.project__message');
const loader = document.querySelector('.project__loader');
const retry = document.querySelector('.project__retry');
const playback = document.querySelector('.project__playback');
const announcement = document.querySelector('.project__announcement');
const navigation = [...document.querySelectorAll('.project__nav')];
const viewCursor = document.querySelector('.project__cursor');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let projects = [];
let activeIndex = 0;
let previewIndex = null;
let previewDirection = 0;
let hoveredDirection = 0;
let previewVersion = 0;
let reveal = 0;
let peekTarget = 0;
let peekFrame = 0;
let transitioning = false;
let userPaused = reducedMotion.matches;
let retryAction = loadProjects;
let generation = 0;
let request;
let cursorFrame = 0;
let cursorX = 0;
let cursorY = 0;
let cursorTargetX = 0;
let cursorTargetY = 0;
let cursorTime = 0;
let cursorWidth = 0;
let cursorHeight = 0;
let cursorActive = false;

async function prepareViewCursor() {
  await document.fonts.load('500 12px "JetBrains Mono"');
  cursorWidth = viewCursor.offsetWidth;
  cursorHeight = viewCursor.offsetHeight;
  viewCursor.dataset.ready = 'true';
}

function stopViewCursor() {
  cursorActive = false;
  cancelAnimationFrame(cursorFrame);
  cursorFrame = 0;
}

function hideViewCursor() {
  viewCursor.dataset.visible = 'false';
  // Keep following until the fade has finished.
  if (reducedMotion.matches) stopViewCursor();
}

viewCursor.addEventListener('transitionend', event => {
  if (event.propertyName === 'opacity' && viewCursor.dataset.visible !== 'true') {
    stopViewCursor();
  }
});

function followViewCursor(now) {
  const elapsed = Math.min(now - cursorTime, 64);
  cursorTime = now;
  const easing = reducedMotion.matches ? 1 : 1 - Math.exp(-elapsed / 90);
  cursorX += (cursorTargetX - cursorX) * easing;
  cursorY += (cursorTargetY - cursorY) * easing;
  const settled = Math.hypot(cursorTargetX - cursorX, cursorTargetY - cursorY) < 0.1;
  if (settled) {
    cursorX = cursorTargetX;
    cursorY = cursorTargetY;
  }
  viewCursor.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0)`;
  cursorFrame = settled ? 0 : requestAnimationFrame(followViewCursor);
}

stage.addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' || stage.dataset.state !== 'ready') {
    hideViewCursor();
    return;
  }
  cursorTargetX = Math.max(8, Math.min(event.clientX + 16, innerWidth - cursorWidth - 8));
  cursorTargetY = Math.max(8, Math.min(event.clientY - cursorHeight - 16, innerHeight - cursorHeight - 8));
  if (transitioning || event.target.closest('button, a:not(.project__link), [role="button"]')) {
    hideViewCursor();
  } else {
    if (!cursorActive) {
      cursorX = cursorTargetX;
      cursorY = cursorTargetY;
    }
    cursorActive = true;
    viewCursor.dataset.visible = 'true';
  }
  if (!cursorActive || cursorFrame) return;
  cursorTime = performance.now();
  cursorFrame = requestAnimationFrame(followViewCursor);
});
stage.addEventListener('pointerleave', hideViewCursor);
window.addEventListener('blur', hideViewCursor);
window.addEventListener('resize', hideViewCursor);
void prepareViewCursor();

const fontsReady = Promise.race([
  Promise.allSettled([
    document.fonts.load('700 72px "Special Gothic"'),
    document.fonts.load('500 12px "JetBrains Mono"'),
  ]),
  new Promise(resolve => setTimeout(resolve, 1800)),
]);

const neighbor = direction => (activeIndex + direction + projects.length) % projects.length;
const current = () => projects[activeIndex];

function updatePlayback() {
  const paused = current()?.video.paused ?? true;
  const label = paused ? 'Lire la vidéo' : 'Mettre la vidéo en pause';
  playback.hidden = !current()?.data.video || stage.dataset.state !== 'ready';
  playback.dataset.paused = String(paused);
  playback.setAttribute('aria-label', label);
  playback.title = label;
}

function updateNavigation() {
  for (const button of navigation) {
    button.hidden = projects.length < 2 || stage.dataset.state !== 'ready';
    const direction = Number(button.dataset.direction);
    const label = direction === 1 ? 'Projet suivant' : 'Projet précédent';
    button.setAttribute('aria-label', `${label} : ${projects[neighbor(direction)]?.data.title || ''}`);
    button.setAttribute('aria-disabled', String(transitioning));
  }
}

function showFailure(text, action = loadProjects, fatal = false) {
  if (fatal) {
    stage.dataset.state = 'error';
    playback.hidden = true;
    projects.forEach(item => item.video.pause());
    updateNavigation();
  }
  stage.setAttribute('aria-busy', 'false');
  status.hidden = false;
  loader.hidden = true;
  message.classList.remove('sr-only');
  message.textContent = text;
  retry.hidden = false;
  retryAction = action;
}

function play(item) {
  if (!item?.data.video || userPaused || document.hidden) return;
  // A blocked autoplay leaves the manual play control available.
  item.video.play().catch(() => {}).finally(updatePlayback);
}

function ensureReady(item, allowRetry = false) {
  if (!item.data.video || item.video.readyState >= 2) return Promise.resolve();
  if (item.readyPromise && !(allowRetry && item.failed)) return item.readyPromise;
  item.failed = false;
  const loading = beginMediaLoad(item.video.parentElement);
  item.readyPromise = new Promise((resolve, reject) => {
    if (!item.data.video) {
      reject(new Error('Ajoute une vidéo principale à ce projet dans le CMS.'));
      return;
    }
    if (!item.video.canPlayType(item.data.video.type)) {
      loading.fail();
      reject(new Error('Le navigateur ne prend pas en charge cette vidéo.'));
      return;
    }
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      error ? loading.fail() : loading.ready();
      clearTimeout(deadline);
      item.video.removeEventListener('loadeddata', ready);
      item.video.removeEventListener('canplay', ready);
      item.video.removeEventListener('error', fail);
      if (error) reject(error);
      else resolve();
    };
    const ready = () => { if (item.video.readyState >= 2) finish(); };
    const fail = () => finish(new Error('Cette vidéo est indisponible. Réessaie.'));
    const deadline = setTimeout(() => finish(new Error('La vidéo tarde à charger. Réessaie.')), 15000);
    item.video.addEventListener('loadeddata', ready);
    item.video.addEventListener('canplay', ready);
    item.video.addEventListener('error', fail);
    item.video.src = item.data.video.url;
    item.video.load();
  }).catch(error => {
    item.failed = true;
    throw error;
  });
  return item.readyPromise;
}

function fitProjectTitles() {
  for (const item of projects) {
    const title = item.element.querySelector('.project__title');
    const available = title.parentElement.getBoundingClientRect().width;
    if (!available) continue;
    // Start from the responsive CSS size so titles can grow again on wider screens.
    title.style.removeProperty('font-size');
    const text = document.createRange();
    text.selectNodeContents(title);
    if (text.getBoundingClientRect().width <= available) continue;
    let small = 0;
    let large = parseFloat(getComputedStyle(title).fontSize);
    // Measure the real uppercase glyphs, including spacing and the loaded font.
    for (let step = 0; step < 12; step++) {
      const size = (small + large) / 2;
      title.style.fontSize = `${size}px`;
      if (text.getBoundingClientRect().width <= available) small = size;
      else large = size;
    }
    title.style.fontSize = `${small}px`;
  }
}

new ResizeObserver(fitProjectTitles).observe(stage);
document.fonts.addEventListener('loadingdone', fitProjectTitles);

function createProject(data) {
  const element = template.content.firstElementChild.cloneNode(true);
  const video = element.querySelector('video');
  const link = element.querySelector('.project__link');
  const item = { data, element, video, link, readyPromise: null, failed: false };
  link.href = data.url;
  link.setAttribute('aria-label', `Voir le projet ${data.title}`);
  link.addEventListener('click', event => {
    if (transitioning || current() !== item) event.preventDefault();
  });
  element.inert = true;
  element.querySelector('h1').textContent = data.title;
  element.querySelector('.project__skills').replaceChildren(...data.skills.map(skill => {
    const tag = document.createElement('li');
    tag.className = 'project__skill';
    tag.textContent = skill;
    return tag;
  }));
  video.muted = true;
  video.addEventListener('playing', updatePlayback);
  video.addEventListener('pause', updatePlayback);
  video.addEventListener('error', () => {
    if (current() === item && stage.dataset.state === 'ready' && !transitioning) {
      showFailure('Cette vidéo est indisponible. Réessaie.');
    }
  });
  return item;
}

function paintMask() {
  if (previewIndex === null) return;
  const hidden = ((1 - reveal) * 100).toFixed(4);
  projects[previewIndex].element.style.clipPath = previewDirection === 1
    ? `inset(0 0 0 ${hidden}%)`
    : `inset(0 ${hidden}% 0 0)`;
}

function removePreview() {
  if (previewIndex !== null && previewIndex !== activeIndex) {
    const item = projects[previewIndex];
    item.element.classList.remove('is-preview', 'is-entering');
    item.element.style.removeProperty('clip-path');
    item.video.pause();
  }
  previewIndex = null;
  reveal = 0;
}

function preparePreview(index, direction) {
  if (previewIndex === index && previewDirection === direction) return;
  removePreview();
  previewIndex = index;
  previewDirection = direction;
  projects[index].element.classList.add('is-preview');
  paintMask();
  play(projects[index]);
}

function animatePeek() {
  if (peekFrame || transitioning) return;
  let previous = performance.now();
  const tick = now => {
    const elapsed = Math.min(now - previous, 64);
    previous = now;
    reveal += (peekTarget - reveal) * (1 - Math.exp(-elapsed / 75));
    if (Math.abs(peekTarget - reveal) < 0.0002) reveal = peekTarget;
    paintMask();
    if (reveal !== peekTarget) {
      peekFrame = requestAnimationFrame(tick);
    } else {
      peekFrame = 0;
      if (reveal === 0) removePreview();
    }
  };
  peekFrame = requestAnimationFrame(tick);
}

async function requestPreview(direction, depth = 0.13) {
  if (transitioning || reducedMotion.matches || stage.dataset.state !== 'ready') return;
  peekTarget = depth;
  if (hoveredDirection === direction && previewIndex !== null) {
    animatePeek();
    return;
  }
  if (hoveredDirection === direction) return;
  hoveredDirection = direction;
  const version = ++previewVersion;
  const index = neighbor(direction);
  try {
    await ensureReady(projects[index]);
    if (version !== previewVersion || transitioning) return;
    preparePreview(index, direction);
    animatePeek();
  } catch {
    // Keep the current project visible; clicking offers an explicit retry.
  }
}

function closePreview() {
  hoveredDirection = 0;
  previewVersion++;
  if (transitioning) return;
  peekTarget = 0;
  animatePeek();
}

function expandMask() {
  if (reducedMotion.matches) {
    reveal = 1;
    paintMask();
    return Promise.resolve();
  }
  const start = performance.now();
  const from = reveal;
  return new Promise(resolve => {
    const tick = now => {
      const t = Math.min((now - start) / 820, 1);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      reveal = from + (1 - from) * eased;
      paintMask();
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

async function switchProject(direction) {
  if (transitioning || projects.length < 2 || stage.dataset.state !== 'ready') return;
  transitioning = true;
  hideViewCursor();
  previewVersion++;
  hoveredDirection = 0;
  cancelAnimationFrame(peekFrame);
  peekFrame = 0;
  status.hidden = true;
  const button = navigation.find(el => Number(el.dataset.direction) === direction);
  button.dataset.loading = 'true';
  updateNavigation();
  const index = neighbor(direction);
  const next = projects[index];
  const outgoing = current();
  try {
    await ensureReady(next, true);
    delete button.dataset.loading;
    preparePreview(index, direction);
    play(next);
    outgoing.element.classList.add('is-leaving');
    next.element.classList.add('is-entering');
    await expandMask();
    outgoing.element.classList.remove('is-active', 'is-leaving');
    outgoing.element.setAttribute('aria-hidden', 'true');
    outgoing.element.inert = true;
    outgoing.link.tabIndex = -1;
    outgoing.video.pause();
    next.element.classList.remove('is-preview', 'is-entering');
    next.element.classList.add('is-active');
    next.element.style.removeProperty('clip-path');
    next.element.setAttribute('aria-hidden', 'false');
    next.element.inert = false;
    next.link.tabIndex = 0;
    activeIndex = index;
    previewIndex = null;
    reveal = 0;
    document.title = `${next.data.title} — Motion & Editing`;
    history.replaceState(null, '', `#${next.data.slug}`);
    announcement.textContent = next.data.title;
  } catch (error) {
    removePreview();
    showFailure(error.message, () => switchProject(direction));
  } finally {
    transitioning = false;
    delete button.dataset.loading;
    updateNavigation();
    updatePlayback();
  }
}

async function loadProjects() {
  const version = ++generation;
  request?.abort();
  const controller = new AbortController();
  request = controller;
  previewVersion++;
  cancelAnimationFrame(peekFrame);
  peekFrame = 0;
  projects.forEach(item => {
    item.video.pause();
    item.video.removeAttribute('src');
    item.video.load();
  });
  projects = [];
  slides.replaceChildren();
  activeIndex = 0;
  previewIndex = null;
  hoveredDirection = 0;
  reveal = 0;
  transitioning = false;
  stage.dataset.state = 'loading';
  stage.setAttribute('aria-busy', 'true');
  playback.hidden = true;
  updateNavigation();
  status.hidden = false;
  loader.hidden = false;
  retry.hidden = true;
  message.classList.add('sr-only');
  message.textContent = 'Chargement des projets…';
  const deadline = setTimeout(() => controller.abort(), 8000);
  try {
    const content = await loadContent(controller.signal);
    const data = { projects: content.videos };
    clearTimeout(deadline);
    if (version !== generation) return;
    if (!data.projects.length) throw new Error('Aucun projet vidéo pour le moment.');
    projects = data.projects.map(createProject);
    activeIndex = Math.max(0, projects.findIndex(item => item.data.slug === location.hash.slice(1)));
    slides.replaceChildren(...projects.map(item => item.element));
    fitProjectTitles();
    await Promise.all([ensureReady(current()), fontsReady]);
    if (version !== generation) return;
    fitProjectTitles();
    current().element.classList.add('is-active');
    current().element.setAttribute('aria-hidden', 'false');
    current().element.inert = false;
    current().link.tabIndex = 0;
    history.replaceState(null, '', `#${current().data.slug}`);
    stage.dataset.state = 'ready';
    stage.setAttribute('aria-busy', 'false');
    status.hidden = true;
    playback.hidden = false;
    document.title = `${current().data.title} — Motion & Editing`;
    updateNavigation();
    play(current());
    updatePlayback();
    // Decode the neighboring first frame before it is exposed by the mask.
    for (const index of new Set([neighbor(-1), neighbor(1)])) {
      if (index !== activeIndex) void ensureReady(projects[index]).catch(() => {});
    }
  } catch (error) {
    if (version !== generation) return;
    showFailure(error.name === 'AbortError'
      ? 'Le chargement prend trop de temps. Réessaie.'
      : error.message, loadProjects, true);
  } finally {
    clearTimeout(deadline);
    if (version === generation) void window.PageTransition.reveal();
  }
}

// The menu overlays the edge navigation but remains part of its hover area.
document.addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
  const overMenu = event.target.closest('.page-menu');
  if (overMenu || event.target.closest('.project__nav')) {
    for (const button of navigation) {
      if (button.hidden) continue;
      const direction = Number(button.dataset.direction);
      const rect = button.getBoundingClientRect();
      // Include the entire menu, even when it extends past the edge on small screens.
      if (overMenu) {
        if (direction !== -1) continue;
      } else if (event.clientX < rect.left || event.clientX > rect.right
        || event.clientY < rect.top || event.clientY > rect.bottom) continue;
      const proximity = direction === 1 ? (event.clientX - rect.left) / rect.width : (rect.right - event.clientX) / rect.width;
      void requestPreview(direction, 0.09 + Math.max(0, Math.min(1, proximity)) * 0.06);
      return;
    }
  }
  if (hoveredDirection) closePreview();
});
document.addEventListener('pointerleave', closePreview);
window.addEventListener('blur', closePreview);

for (const button of navigation) {
  const direction = Number(button.dataset.direction);
  button.addEventListener('focus', () => {
    if (button.matches(':focus-visible')) void requestPreview(direction);
  });
  button.addEventListener('blur', closePreview);
  button.addEventListener('click', () => { void switchProject(direction); });
}

document.addEventListener('keydown', event => {
  if (window.PageTransition.busy) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.target.isContentEditable) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    void switchProject(event.key === 'ArrowRight' ? 1 : -1);
  }
});

playback.addEventListener('click', () => {
  userPaused = !current().video.paused;
  for (const [index, item] of projects.entries()) {
    if (userPaused) item.video.pause();
    else if (index === activeIndex || index === previewIndex) play(item);
  }
  updatePlayback();
});

retry.addEventListener('click', () => { void retryAction(); });

reducedMotion.addEventListener('change', () => {
  userPaused = true;
  projects.forEach(item => item.video.pause());
  closePreview();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hideViewCursor();
    projects.forEach(item => item.video.pause());
    closePreview();
  } else {
    play(current());
  }
});

void loadProjects();
