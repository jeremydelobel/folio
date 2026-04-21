const pageTransition = document.querySelector(".page-transition");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const backButton = document.querySelector(".back-button");
const photoGrid = document.querySelector(".photo-grid");
const navigationEntry = performance.getEntriesByType("navigation")[0];
const isBackForwardLoad = navigationEntry?.type === "back_forward";

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
  let currentPhotoColumns = 0;
  let randomizedPhotoModels = [];
  let tileRevealObserver;
  let imageLoadObserver;

  const shuffleArray = (items) => {
    const shuffled = [...items];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));

      [shuffled[index], shuffled[randomIndex]] = [
        shuffled[randomIndex],
        shuffled[index],
      ];
    }

    return shuffled;
  };

  const buildPhotoModels = () =>
    Array.from(photoGrid.querySelectorAll(".photo-tile")).map((tile) => {
      const image = tile.querySelector(".photo-image");
      const width =
        image?.naturalWidth || Number(image?.getAttribute("width")) || 1;
      const height =
        image?.naturalHeight || Number(image?.getAttribute("height")) || 1;
      const ratio = width / height;
      const kind =
        ratio < 0.9 ? "portrait" : ratio > 1.65 ? "wide" : "landscape";

      tile.style.setProperty("--tile-ratio", `${width} / ${height}`);

      return {
        tile,
        image,
        kind,
        visualWeight: height / width,
      };
    });

  const refreshRandomizedPhotoModels = () => {
    randomizedPhotoModels = shuffleArray(buildPhotoModels());
  };

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
      portrait: shuffleArray(items.filter((item) => item.kind === "portrait")),
      landscape: shuffleArray(
        items.filter((item) => item.kind === "landscape")
      ),
      wide: shuffleArray(items.filter((item) => item.kind === "wide")),
    };

    const sequence = [];
    let lastKind = "";

    while (pools.portrait.length || pools.landscape.length || pools.wide.length) {
      const choices = ["portrait", "landscape", "wide"]
        .filter((kind) => pools[kind].length)
        .sort((kindA, kindB) => {
          const poolDifference = pools[kindB].length - pools[kindA].length;

          if (poolDifference !== 0) {
            return poolDifference;
          }

          return Math.random() - 0.5;
        });

      const nextKind =
        choices.find((kind) => kind !== lastKind) || choices[0];

      sequence.push(pools[nextKind].shift());
      lastKind = nextKind;
    }

    return sequence;
  };

  const getSeedPatterns = (columnCount) =>
    shuffleArray(
      columnCount === 2
        ? [
            ["portrait", "landscape", "wide"],
            ["landscape", "wide", "portrait"],
          ]
        : [
            ["portrait", "landscape", "wide"],
            ["landscape", "wide", "portrait"],
            ["portrait", "wide", "landscape"],
            ["landscape", "portrait", "wide"],
          ]
    );

  const buildColumnCandidate = (columnCount) => {
    const columns = Array.from({ length: columnCount }, () => ({
      height: 0,
      lastKind: "",
      items: [],
    }));

    const remaining = [...randomizedPhotoModels];
    const seedPatterns = getSeedPatterns(columnCount);

    const placeInColumn = (column, model) => {
      column.height += model.visualWeight;
      column.lastKind = model.kind;
      column.items.push(model);
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
      const averageHeight =
        columns.reduce((total, column) => total + column.height, 0) /
        columns.length;

      const targetColumn = [...columns].sort((columnA, columnB) => {
        const repetitionPenaltyA = columnA.lastKind === model.kind ? 0.35 : 0;
        const repetitionPenaltyB = columnB.lastKind === model.kind ? 0.35 : 0;
        const projectedHeightA = columnA.height + model.visualWeight;
        const projectedHeightB = columnB.height + model.visualWeight;
        const balancePenaltyA = Math.abs(projectedHeightA - averageHeight);
        const balancePenaltyB = Math.abs(projectedHeightB - averageHeight);
        const itemCountPenaltyA = columnA.items.length * 0.025;
        const itemCountPenaltyB = columnB.items.length * 0.025;

        return (
          columnA.height +
          repetitionPenaltyA +
          balancePenaltyA * 0.55 +
          itemCountPenaltyA -
          (columnB.height +
            repetitionPenaltyB +
            balancePenaltyB * 0.55 +
            itemCountPenaltyB)
        );
      })[0];

      placeInColumn(targetColumn, model);
    });

    return columns;
  };

  const scoreColumnCandidate = (columns) => {
    const heights = columns.map((column) => column.height);
    const tallest = Math.max(...heights);
    const shortest = Math.min(...heights);
    const averageHeight =
      heights.reduce((total, height) => total + height, 0) / heights.length;
    const heightVariance = heights.reduce(
      (total, height) => total + Math.abs(height - averageHeight),
      0
    );
    const repetitionPenalty = columns.reduce((total, column) => {
      let penalty = 0;

      for (let index = 1; index < column.items.length; index += 1) {
        if (column.items[index].kind === column.items[index - 1].kind) {
          penalty += 0.28;
        }
      }

      return total + penalty;
    }, 0);

    return (tallest - shortest) * 4.8 + heightVariance * 1.6 + repetitionPenalty;
  };

  const getBestColumnCandidate = (columnCount) => {
    const attemptCount = columnCount === 2 ? 10 : 16;
    let bestCandidate = null;
    let bestScore = Infinity;

    for (let attempt = 0; attempt < attemptCount; attempt += 1) {
      const candidate = buildColumnCandidate(columnCount);
      const candidateScore = scoreColumnCandidate(candidate);

      if (candidateScore < bestScore) {
        bestCandidate = candidate;
        bestScore = candidateScore;
      }
    }

    return bestCandidate;
  };

  const loadPhotoImage = (image) => {
    if (!image || image.dataset.loaded === "true") {
      return;
    }

    const tile = image.closest(".photo-tile");
    const source = image.dataset.src;

    if (!source) {
      tile?.classList.add("is-loaded");
      image.dataset.loaded = "true";
      return;
    }

    const handleLoad = () => {
      tile?.classList.add("is-loaded");
      image.dataset.loaded = "true";
      image.removeEventListener("load", handleLoad);
    };

    image.addEventListener("load", handleLoad, { once: true });
    image.src = source;

    if (image.complete) {
      handleLoad();
    }
  };

  const observePhotoTiles = () => {
    if (tileRevealObserver) {
      tileRevealObserver.disconnect();
    }

    if (imageLoadObserver) {
      imageLoadObserver.disconnect();
    }

    const tiles = Array.from(photoGrid.querySelectorAll(".photo-tile"));
    const images = tiles
      .map((tile) => tile.querySelector(".photo-image"))
      .filter(Boolean);

    if (prefersReducedMotion.matches || !("IntersectionObserver" in window)) {
      tiles.forEach((tile) => tile.classList.add("is-visible"));
      images.forEach((image) => loadPhotoImage(image));
      return;
    }

    tileRevealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add("is-visible");
          tileRevealObserver.unobserve(entry.target);
        });
      },
      {
        threshold: 0.14,
        rootMargin: "0px 0px -8% 0px",
      }
    );

    imageLoadObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          loadPhotoImage(entry.target);
          imageLoadObserver.unobserve(entry.target);
        });
      },
      {
        threshold: 0.01,
        rootMargin: "400px 0px 400px 0px",
      }
    );

    tiles.forEach((tile) => tileRevealObserver.observe(tile));
    images.forEach((image) => imageLoadObserver.observe(image));
  };

  const rebuildPhotoColumns = () => {
    const nextColumns = window.innerWidth <= 980 ? 2 : 4;

    if (nextColumns === currentPhotoColumns) {
      return;
    }

    currentPhotoColumns = nextColumns;
    photoGrid.innerHTML = "";
    const bestCandidate = getBestColumnCandidate(nextColumns);

    bestCandidate.forEach((column) => {
      const element = document.createElement("div");
      element.className = "photo-column";
      photoGrid.appendChild(element);

      column.items.forEach((model) => {
        element.appendChild(model.tile);
      });
    });

    observePhotoTiles();
  };

  refreshRandomizedPhotoModels();
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
    const footerHeight = locationBlock ? locationBlock.offsetHeight : 0;

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
