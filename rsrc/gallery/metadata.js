const monthYear = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const countFormat = new Intl.NumberFormat("de-DE");
const formatDate = value => monthYear.format(new Date(`${value}T00:00:00Z`));

export class ProjectMetadata {
  constructor(container, isVideo) {
    this.container = container;
    this.isVideo = isVideo;
    this.items = [];
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(container);
    document.fonts.addEventListener("loadingdone", () => this.fit());
    void document.fonts.ready.then(() => this.fit());
  }

  render(project) {
    const items = [];
    const add = (tag, key, text) => {
      const element = document.createElement(tag);
      element.className = `project__${key}`;
      element.dataset.field = key;
      if (text) element.textContent = text;
      items.push(element);
      return element;
    };
    const addCount = (value, label) => {
      if (value == null) return;
      const element = add("p", "count", countFormat.format(value));
      const suffix = document.createElement("span");
      suffix.className = "project__count-label";
      suffix.textContent = ` ${label}`;
      element.append(suffix);
    };
    const addDate = () => {
      const date = this.isVideo ? project.startDate : project.date;
      if (!date) return;
      const text = this.isVideo
        ? project.endDate ? `${formatDate(date)} – ${formatDate(project.endDate)}` : `Since ${formatDate(date)}`
        : formatDate(date);
      add("time", "date", text).dateTime = date;
    };

    if (this.isVideo) {
      add("h1", "meta-title", project.title);
      addCount(project.totalViews, "Views");
      addDate();
    } else {
      addDate();
      addCount(project.deliveredPhotos, "Pictures");
    }
    if (project.client) {
      const client = add("p", "client");
      const label = document.createElement("span");
      label.className = "project__client-label";
      label.textContent = "Client :";
      const name = document.createElement(project.clientUrl ? "a" : "span");
      name.className = "project__client-name";
      name.textContent = project.client;
      if (project.clientUrl) {
        name.href = project.clientUrl;
        name.target = "_blank";
        name.rel = "noopener noreferrer";
      }
      client.append(label, name);
    }
    this.items = items;
    this.container.replaceChildren(...items);
    this.container.hidden = !items.length;
    this.fit();
  }

  fit() {
    if (this.container.hidden || !this.items.length) return;
    const style = getComputedStyle(this.container);
    const available = this.container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    if (available <= 0) return;
    const gap = parseFloat(style.columnGap);
    this.container.classList.add("is-measuring");
    for (const item of this.items) {
      item.hidden = false;
      item.style.removeProperty("max-width");
      item.style.removeProperty("flex-shrink");
    }
    // Measure untruncated content, including fields hidden at the previous width.
    const widths = new Map(this.items.map(item => [item, item.getBoundingClientRect().width]));
    let visible = this.items.slice();
    const needed = () => visible.reduce((sum, item) => sum + widths.get(item), 0) + gap * (visible.length - 1);
    const priorities = this.isVideo ? ["date", "count"] : ["count", "date"];
    for (const key of priorities) {
      if (needed() <= available || visible.length === 1) break;
      const item = visible.find(element => element.dataset.field === key);
      if (!item) continue;
      item.hidden = true;
      visible = visible.filter(element => element !== item);
    }
    this.container.classList.remove("is-measuring");

    const title = visible.find(item => item.dataset.field === "meta-title");
    const client = visible.find(item => item.dataset.field === "client");
    if (title && client && needed() > available) {
      // Keep the client whole when possible and give the title the remaining space.
      const titleSpace = Math.min(widths.get(title), Math.max(80, available * .3));
      client.style.maxWidth = `${Math.max(0, available - titleSpace - gap)}px`;
      client.style.flexShrink = "0";
    }
  }
}
