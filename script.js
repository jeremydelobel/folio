const translations = {
  fr: {
    name: 'Jérémy "Kota" Delobel',
    roles: "Monteur Vidéo, Motion Designer & Photographe",
    locationLine1: "Basé en France,",
    locationLine2: "à Angoulême",
    comingSoon: "Bientôt",
    backButton: "Retour",
    photoPageTitle: "Photographie",
    cardVideo: "MONTAGE VIDÉO",
    cardPhotography: "PHOTOGRAPHIE",
    cardMotion: "MOTION DESIGN",
  },
  en: {
    name: 'Jérémy "Kota" Delobel',
    roles: "Video Editor, Motion Designer & Photographer",
    locationLine1: "Based in France,",
    locationLine2: "in Angoulême",
    comingSoon: "Coming soon",
    backButton: "Back",
    photoPageTitle: "Photography",
    cardVideo: "VIDEO EDITING",
    cardPhotography: "PHOTOGRAPHY",
    cardMotion: "MOTION DESIGN",
  },
};

const languageSwitch = document.querySelector(".language-switch");
const languageOptions = document.querySelectorAll(".language-option");
const pageTransition = document.querySelector(".page-transition");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const backButton = document.querySelector(".back-button");
const photoGrid = document.querySelector(".photo-grid");
const navigationEntry = performance.getEntriesByType("navigation")[0];
const isBackForwardLoad = navigationEntry?.type === "back_forward";

const setLanguage = (lang) => {
  const copy = translations[lang];

  if (!copy) {
    return;
  }

  document.documentElement.lang = lang;

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;

    if (copy[key]) {
      element.textContent = copy[key];
    }
  });

  if (languageSwitch) {
    languageSwitch.dataset.active = lang;
  }

  languageOptions.forEach((option) => {
    const isActive = option.dataset.lang === lang;
    option.classList.toggle("is-active", isActive);
    option.setAttribute("aria-pressed", String(isActive));
  });
};

if (languageSwitch) {
  languageSwitch.addEventListener("click", () => {
    const current = languageSwitch.dataset.active || "fr";
    setLanguage(current === "fr" ? "en" : "fr");
  });
}

setLanguage("fr");

const startIntroAnimation = () => {
  requestAnimationFrame(() => {
    document.body.classList.add("is-ready");
  });
};

const resetIntroAnimation = () => {
  document.body.classList.remove("is-ready");
  void document.body.offsetWidth;
};

const playPageEntry = ({ withWhiteFade = false } = {}) => {
  const reveal = () => {
    if (pageTransition) {
      if (withWhiteFade && !prefersReducedMotion.matches) {
        pageTransition.classList.add("is-visible");
      } else {
        pageTransition.classList.remove("is-visible");
      }
    }

    resetIntroAnimation();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (pageTransition && !prefersReducedMotion.matches) {
          pageTransition.classList.remove("is-visible");
        }

        startIntroAnimation();
      });
    });
  };

  if (prefersReducedMotion.matches) {
    if (pageTransition) {
      pageTransition.classList.remove("is-visible");
    }
    resetIntroAnimation();
    startIntroAnimation();
    return;
  }

  if (withWhiteFade) {
    reveal();
    return;
  }

  if (pageTransition) {
    window.setTimeout(reveal, 90);
    return;
  }

  reveal();
};

const navigateWithFade = (href) => {
  if (!href) {
    return;
  }

  if (prefersReducedMotion.matches || !pageTransition) {
    window.location.href = href;
    return;
  }

  pageTransition.classList.add("is-visible");

  window.setTimeout(() => {
    window.location.href = href;
  }, 460);
};

document.querySelectorAll("[data-route]").forEach((element) => {
  element.addEventListener("click", () => {
    navigateWithFade(element.dataset.route);
  });
});

if (backButton) {
  backButton.addEventListener("click", () => {
    navigateWithFade("./index.html");
  });
}

if (photoGrid) {
  const photoModels = Array.from(photoGrid.querySelectorAll(".photo-tile")).map(
    (tile) => {
      const image = tile.querySelector(".photo-image");
      const width = Number(image?.getAttribute("width")) || 1;
      const height = Number(image?.getAttribute("height")) || 1;
      const ratio = width / height;
      const kind =
        ratio < 0.9 ? "portrait" : ratio > 1.65 ? "wide" : "landscape";

      return {
        tile,
        width,
        height,
        ratio,
        kind,
        visualWeight: height / width,
      };
    }
  );

  let currentPhotoColumns = 0;

  const takeFirstMatching = (items, preferredKinds) => {
    for (const kind of preferredKinds) {
      const index = items.findIndex((item) => item.kind === kind);

      if (index >= 0) {
        return items.splice(index, 1)[0];
      }
    }

    return items.shift();
  };

  const buildBalancedSequence = (items) => {
    const pools = {
      portrait: items.filter((item) => item.kind === "portrait"),
      landscape: items.filter((item) => item.kind === "landscape"),
      wide: items.filter((item) => item.kind === "wide"),
    };

    const sequence = [];
    let lastKind = "";

    while (pools.portrait.length || pools.landscape.length || pools.wide.length) {
      const choices = ["portrait", "landscape", "wide"]
        .filter((kind) => pools[kind].length)
        .sort((kindA, kindB) => pools[kindB].length - pools[kindA].length);

      const nextKind =
        choices.find((kind) => kind !== lastKind) || choices[0];

      sequence.push(pools[nextKind].shift());
      lastKind = nextKind;
    }

    return sequence;
  };

  const rebuildPhotoColumns = () => {
    const nextColumns = window.innerWidth <= 980 ? 2 : 4;

    if (nextColumns === currentPhotoColumns) {
      return;
    }

    currentPhotoColumns = nextColumns;
    photoGrid.innerHTML = "";

    const columns = Array.from({ length: nextColumns }, () => {
      const element = document.createElement("div");
      element.className = "photo-column";
      photoGrid.appendChild(element);

      return {
        element,
        height: 0,
        lastKind: "",
      };
    });

    const remaining = [...photoModels];
    const seedPatterns =
      nextColumns === 2
        ? [
            ["portrait", "landscape", "wide"],
            ["landscape", "wide", "portrait"],
          ]
        : [
            ["portrait", "landscape", "wide"],
            ["landscape", "wide", "portrait"],
            ["portrait", "wide", "landscape"],
            ["landscape", "portrait", "wide"],
          ];

    const placeInColumn = (column, model) => {
      column.element.appendChild(model.tile);
      column.height += model.visualWeight;
      column.lastKind = model.kind;
    };

    columns.forEach((column, index) => {
      const model = takeFirstMatching(
        remaining,
        seedPatterns[index] || ["portrait", "landscape", "wide"]
      );

      if (model) {
        placeInColumn(column, model);
      }
    });

    const balancedSequence = buildBalancedSequence(remaining);

    balancedSequence.forEach((model) => {
      const targetColumn = [...columns].sort((columnA, columnB) => {
        const penaltyA = columnA.lastKind === model.kind ? 0.35 : 0;
        const penaltyB = columnB.lastKind === model.kind ? 0.35 : 0;

        return columnA.height + penaltyA - (columnB.height + penaltyB);
      })[0];

      placeInColumn(targetColumn, model);
    });
  };

  rebuildPhotoColumns();
  window.addEventListener("resize", rebuildPhotoColumns);
}

const categorySection = document.querySelector(".categories");
const categoryCards = document.querySelectorAll(".category-card");
const canHover =
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const isMobileLayout = window.matchMedia("(max-width: 640px)");
const landing = document.querySelector(".landing");
const intro = document.querySelector(".intro");
const locationBlock = document.querySelector(".location");
const shopButton = document.querySelector(".shop-button");

if (categorySection && categoryCards.length) {
  const pointer = { x: 0, y: 0, active: false };
  const cards = Array.from(categoryCards).map((card, index) => ({
    element: card,
    currentX: 0,
    currentY: 0,
    targetX: 0,
    targetY: 0,
    strength: index === 0 ? 18 : 16,
  }));

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const updateMobileLandingLayout = () => {
    if (!landing || !isMobileLayout.matches) {
      if (landing) {
        landing.style.removeProperty("--mobile-card-width");
        landing.style.removeProperty("--mobile-card-gap");
        landing.style.removeProperty("--mobile-side-padding");
      }
      return;
    }

    const sidePadding = Math.max(window.innerWidth * 0.15, 20);
    const introHeight = intro ? intro.offsetHeight : 0;
    const shopHeight = shopButton ? shopButton.offsetHeight : 0;
    const footerHeight = Math.max(
      languageSwitch ? languageSwitch.offsetHeight : 0,
      locationBlock ? locationBlock.offsetHeight : 0
    );

    const topZone = Math.max(introHeight, shopHeight) + 36;
    const bottomZone = footerHeight + 36;
    const availableHeight = window.innerHeight - topZone - bottomZone - 28;
    const mobileGap = clamp(availableHeight * 0.055, 12, 22);
    const labelAllowance = 28;
    const widthFromHeight = Math.max(
      (availableHeight - labelAllowance * 3 - mobileGap * 2) / 2,
      190
    );
    const widthFromViewport = window.innerWidth - sidePadding * 2;
    const mobileWidth = clamp(
      Math.min(widthFromHeight, widthFromViewport),
      190,
      widthFromViewport
    );

    landing.style.setProperty("--mobile-side-padding", `${sidePadding.toFixed(1)}px`);
    landing.style.setProperty("--mobile-card-gap", `${mobileGap.toFixed(1)}px`);
    landing.style.setProperty("--mobile-card-width", `${mobileWidth.toFixed(1)}px`);
  };

  const updateGroupScale = () => {
    if (isMobileLayout.matches) {
      categorySection.style.setProperty("--group-scale", "1");
      return;
    }

    const widthScale = window.innerWidth / 1440;
    const heightScale = window.innerHeight / 980;
    const scale = clamp(Math.min(widthScale, heightScale), 0.9, 1.28);

    categorySection.style.setProperty("--group-scale", scale.toFixed(3));
  };

  const centerGroup = () => {
    if (isMobileLayout.matches) {
      categorySection.style.setProperty("--gx", "0px");
      categorySection.style.setProperty("--gy", "0px");
      return;
    }

    let minLeft = Infinity;
    let minTop = Infinity;
    let maxRight = -Infinity;
    let maxBottom = -Infinity;

    cards.forEach((card) => {
      const { element } = card;
      const left = element.offsetLeft;
      const top = element.offsetTop;
      const right = left + element.offsetWidth;
      const bottom = top + element.offsetHeight;

      minLeft = Math.min(minLeft, left);
      minTop = Math.min(minTop, top);
      maxRight = Math.max(maxRight, right);
      maxBottom = Math.max(maxBottom, bottom);
    });

    const groupCenterX = (minLeft + maxRight) / 2;
    const groupCenterY = (minTop + maxBottom) / 2;
    const offsetX = categorySection.clientWidth / 2 - groupCenterX;
    const offsetY = categorySection.clientHeight / 2 - groupCenterY;

    categorySection.style.setProperty("--gx", `${offsetX.toFixed(2)}px`);
    categorySection.style.setProperty("--gy", `${offsetY.toFixed(2)}px`);
  };

  const updateTargets = () => {
    if (!canHover || isMobileLayout.matches) {
      cards.forEach((card) => {
        card.targetX = 0;
        card.targetY = 0;
      });
      return;
    }

    cards.forEach((card) => {
      if (!pointer.active) {
        card.targetX = 0;
        card.targetY = 0;
        return;
      }

      const rect = card.element.getBoundingClientRect();
      const cardCenterX = rect.left + rect.width / 2;
      const cardCenterY = rect.top + rect.height / 2;
      const dx = pointer.x - cardCenterX;
      const dy = pointer.y - cardCenterY;
      const distance = Math.hypot(dx, dy);
      const influenceRadius = Math.max(rect.width, rect.height) * 1.85;
      const influence = clamp(1 - distance / influenceRadius, 0, 1);
      const easedInfluence = influence * influence;

      if (easedInfluence === 0) {
        card.targetX = 0;
        card.targetY = 0;
        return;
      }

      const normalizedX = dx / influenceRadius;
      const normalizedY = dy / influenceRadius;

      card.targetX = clamp(
        normalizedX * card.strength * 4.4 * easedInfluence,
        -32,
        32
      );
      card.targetY = clamp(
        normalizedY * card.strength * 5.2 * easedInfluence,
        -24,
        24
      );
    });
  };

  const syncLayout = () => {
    updateMobileLandingLayout();
    updateGroupScale();
    centerGroup();
    updateTargets();
  };

  const animate = () => {
    cards.forEach((card) => {
      card.currentX += (card.targetX - card.currentX) * 0.08;
      card.currentY += (card.targetY - card.currentY) * 0.08;

      card.element.style.setProperty("--mx", `${card.currentX.toFixed(2)}px`);
      card.element.style.setProperty("--my", `${card.currentY.toFixed(2)}px`);
    });

    requestAnimationFrame(animate);
  };

  if (canHover) {
    window.addEventListener("pointermove", (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
      updateTargets();
    });

    window.addEventListener("pointerleave", () => {
      pointer.active = false;
      updateTargets();
    });

    animate();
  }

  window.addEventListener("resize", syncLayout);
  window.addEventListener("load", syncLayout);

  if (document.fonts) {
    document.fonts.ready.then(() => {
      syncLayout();
      if (!document.body.classList.contains("photography-page")) {
        if (isBackForwardLoad) {
          playPageEntry({ withWhiteFade: true });
        } else {
          startIntroAnimation();
        }
      }
    });
  } else if (!document.body.classList.contains("photography-page")) {
    if (isBackForwardLoad) {
      playPageEntry({ withWhiteFade: true });
    } else {
      startIntroAnimation();
    }
  }

  syncLayout();
} else if (document.body.classList.contains("photography-page")) {
  playPageEntry();
} else if (isBackForwardLoad) {
  playPageEntry({ withWhiteFade: true });
} else {
  startIntroAnimation();
}

window.addEventListener("pageshow", (event) => {
  if (!event.persisted) {
    return;
  }

  if (document.body.classList.contains("photography-page")) {
    playPageEntry();
    return;
  }

  playPageEntry({ withWhiteFade: true });
});
