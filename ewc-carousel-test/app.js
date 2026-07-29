import { createCarousel } from "./engine.js";
import { PROJECTS, ENTRY, UI_ANIM } from "./config.js";

const mount = document.querySelector("[data-carousel-canvas]");
const page = document.querySelector(".carousel-page");
const heading = document.querySelector(".project-heading");
const headingBrand = heading.querySelector(".project-kicker");
const headingDescription = heading.querySelector("h1");
const counter = document.querySelector("[data-carousel-counter]");
const closeButton = document.querySelector("[data-carousel-close]");
const cursor = document.querySelector("[data-view-cursor]");
const webglError = document.querySelector("[data-webgl-error]");
const { gsap } = window;

let carousel = null;
let focused = false;
let entryDone = !ENTRY.enabled;
let revealPlayed = false;

function updateProject(index) {
  const project = PROJECTS[index];
  headingBrand.textContent = project.brand;
  headingDescription.textContent = project.desc;
  counter.textContent =
    `${String(index + 1).padStart(2, "0")}/` +
    String(PROJECTS.length).padStart(2, "0");
}

function animateOverlay() {
  if (!entryDone && ENTRY.enabled) {
    gsap.set([heading, counter], { autoAlpha: 0 });
    revealPlayed = false;
    return;
  }

  gsap.set([heading, counter], { xPercent: -50 });
  const headingY = focused
    ? (UI_ANIM.topShiftVh / 100) * window.innerHeight
    : 0;

  if (entryDone && !focused && !revealPlayed) {
    revealPlayed = true;
    gsap.fromTo(
      heading,
      { autoAlpha: 0 },
      {
        autoAlpha: 1,
        duration: UI_ANIM.revealDuration,
        ease: UI_ANIM.revealEase,
      },
    );
    gsap.fromTo(
      counter,
      { autoAlpha: 0 },
      {
        autoAlpha: 1,
        duration: UI_ANIM.revealDuration,
        ease: UI_ANIM.revealEase,
        delay: UI_ANIM.revealStagger,
      },
    );
    return;
  }

  gsap.to(heading, {
    y: headingY,
    autoAlpha: 1,
    duration: UI_ANIM.duration,
    ease: UI_ANIM.ease,
  });
  gsap.to(counter, {
    autoAlpha: focused ? 0 : 1,
    duration: UI_ANIM.duration,
    ease: UI_ANIM.ease,
  });
}

try {
  if (!gsap) throw new Error("GSAP failed to load");

  updateProject(0);
  carousel = createCarousel(mount, {
    cursorElement: cursor,
    onActiveChange: updateProject,
    onFocusChange(open) {
      focused = open;
      page.classList.toggle("is-focused", open);
      animateOverlay();
    },
    onEntryDone(done) {
      entryDone = done;
      animateOverlay();
    },
  });
} catch (error) {
  console.error("[EWC carousel] Initialization failed.", error);
  webglError.hidden = false;
}

closeButton.addEventListener("click", () => carousel?.closeFocus());
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") carousel?.closeFocus();
});
window.addEventListener("pagehide", () => carousel?.destroy(), { once: true });
