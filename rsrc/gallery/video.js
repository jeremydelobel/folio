import { beginMediaLoad } from "/rsrc/js/media-loading.js";

export class ProjectVideo {
  constructor(surface) {
    this.surface = surface;
    this.video = surface.querySelector("video");
    this.button = surface.querySelector(".project__playback");
    this.error = surface.querySelector(".project__video-error");
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.userPaused = this.motion.matches;
    this.video.muted = true;
    this.button.addEventListener("click", () => {
      this.userPaused = !this.video.paused;
      if (this.userPaused) this.video.pause();
      else this.play();
    });
    this.error.querySelector("button").addEventListener("click", () => this.load(this.project));
    this.video.addEventListener("playing", () => this.update());
    this.video.addEventListener("pause", () => this.update());
    this.motion.addEventListener("change", () => {
      this.userPaused = true;
      this.video.pause();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.video.pause();
      else this.play();
    });
    window.addEventListener("pagehide", () => this.video.pause());
    window.addEventListener("pageshow", () => this.play());
  }

  reset() {
    this.events?.abort();
    clearTimeout(this.deadline);
    this.loading?.cancel();
    this.project = null;
    this.surface.hidden = true;
    this.button.hidden = true;
    this.error.hidden = true;
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.removeAttribute("poster");
    this.video.load();
  }

  load(project) {
    this.reset();
    this.project = project;
    if (!project.video && !project.poster) return;
    this.surface.hidden = false;
    if (project.poster) this.video.poster = project.poster;
    if (!project.video) return;
    this.events = new AbortController();
    const { signal } = this.events;
    this.loading = beginMediaLoad(this.surface);
    const ready = () => {
      if (this.video.readyState < 2) return;
      clearTimeout(this.deadline);
      this.loading.ready();
      this.error.hidden = true;
      this.button.hidden = false;
      this.update();
    };
    const fail = () => {
      clearTimeout(this.deadline);
      this.loading.fail();
      this.video.pause();
      this.button.hidden = true;
      this.error.hidden = false;
    };
    this.video.addEventListener("loadeddata", ready, { signal });
    this.video.addEventListener("canplay", ready, { signal });
    this.video.addEventListener("error", fail, { signal });
    this.deadline = setTimeout(fail, 15000);
    this.video.src = project.video.url;
    this.video.load();
    this.play();
  }

  play() {
    if (!this.project?.video || this.userPaused || document.hidden || !this.error.hidden) return;
    // A rejected autoplay leaves the same control available for a manual start.
    void this.video.play().catch(() => {}).finally(() => this.update());
  }

  update() {
    const label = this.video.paused ? "Lire la vidéo" : "Mettre la vidéo en pause";
    this.button.dataset.paused = String(this.video.paused);
    this.button.setAttribute("aria-label", label);
    this.button.title = label;
  }
}
