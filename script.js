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
        Number(image?.getAttribute("width")) || image?.naturalWidth || 1;
      const height =
        Number(image?.getAttribute("height")) || image?.naturalHeight || 1;
      const ratio = width / height;
      const kind =
        ratio < 0.9 ? "portrait" : ratio > 1.65 ? "wide" : "landscape";

      tile.style.setProperty("--tile-ratio", `${width} / ${height}`);

      return {
        tile,
        image,
        kind,
        formatGroup: kind === "portrait" ? "portrait" : "horizontal",
        balanceUnits: kind === "portrait" ? 2 : 1,
      };
    });

  const refreshRandomizedPhotoModels = () => {
    randomizedPhotoModels = shuffleArray(buildPhotoModels());
  };

  const buildColumnCandidate = (columnCount) => {
    const portraitModels = shuffleArray(
      randomizedPhotoModels.filter((model) => model.formatGroup === "portrait")
    );
    const horizontalModels = shuffleArray(
      randomizedPhotoModels.filter((model) => model.formatGroup === "horizontal")
    );
    const columns = Array.from({ length: columnCount }, (_, index) => ({
      index,
      portraitCount: 0,
      horizontalCount: 0,
      balanceUnits: 0,
      items: [],
    }));
    let remainingPortraitCount = portraitModels.length;
    let remainingHorizontalCount = horizontalModels.length;
    const startOffset = Math.random() < 0.5 ? 0 : 1;

    const addGroupToColumn = (column, group) => {
      if (group === "portrait") {
        if (remainingPortraitCount <= 0) {
          return false;
        }

        column.portraitCount += 1;
        column.balanceUnits += 2;
        remainingPortraitCount -= 1;
        return true;
      }

      if (remainingHorizontalCount <= 0) {
        return false;
      }

      column.horizontalCount += 1;
      column.balanceUnits += 1;
      remainingHorizontalCount -= 1;
      return true;
    };

    const getColumnItemCount = (column) =>
      column.portraitCount + column.horizontalCount;

    const buildGroupSequence = (portraitCount, horizontalCount, startGroup) => {
      const cache = new Map();

      const solve = (
        remainingPortrait,
        remainingHorizontal,
        lastGroup,
        streakLength,
        isFirstStep
      ) => {
        const cacheKey = [
          remainingPortrait,
          remainingHorizontal,
          lastGroup || "none",
          streakLength,
          isFirstStep ? 1 : 0,
        ].join("|");

        if (cache.has(cacheKey)) {
          return cache.get(cacheKey);
        }

        if (remainingPortrait === 0 && remainingHorizontal === 0) {
          cache.set(cacheKey, []);
          return [];
        }

        const candidateGroups = isFirstStep
          ? [startGroup]
          : shuffleArray(["portrait", "horizontal"]).sort((groupA, groupB) => {
              const remainingCountA =
                groupA === "portrait" ? remainingPortrait : remainingHorizontal;
              const remainingCountB =
                groupB === "portrait" ? remainingPortrait : remainingHorizontal;

              return remainingCountB - remainingCountA;
            });

        for (const group of candidateGroups) {
          if (group === "portrait" && remainingPortrait <= 0) {
            continue;
          }

          if (group === "horizontal" && remainingHorizontal <= 0) {
            continue;
          }

          if (!isFirstStep && lastGroup === group && streakLength >= 2) {
            continue;
          }

          const nextPortrait =
            remainingPortrait - (group === "portrait" ? 1 : 0);
          const nextHorizontal =
            remainingHorizontal - (group === "horizontal" ? 1 : 0);
          const nextStreak = lastGroup === group ? streakLength + 1 : 1;
          const tail = solve(
            nextPortrait,
            nextHorizontal,
            group,
            nextStreak,
            false
          );

          if (tail) {
            const result = [group, ...tail];
            cache.set(cacheKey, result);
            return result;
          }
        }

        cache.set(cacheKey, null);
        return null;
      };

      return solve(portraitCount, horizontalCount, "", 0, true);
    };

    for (const [index, column] of columns.entries()) {
      const startGroup =
        (index + startOffset) % 2 === 0 ? "portrait" : "horizontal";
      let placedStartGroup = startGroup;

      if (!addGroupToColumn(column, startGroup)) {
        const fallbackGroup =
          startGroup === "portrait" ? "horizontal" : "portrait";

        if (!addGroupToColumn(column, fallbackGroup)) {
          return null;
        }

        placedStartGroup = fallbackGroup;
      }

      column.startGroup = placedStartGroup;
    }

    while (remainingPortraitCount > 0) {
      const rankedColumns = shuffleArray([...columns]).sort((columnA, columnB) => {
        if (columnA.balanceUnits !== columnB.balanceUnits) {
          return columnA.balanceUnits - columnB.balanceUnits;
        }

        return getColumnItemCount(columnA) - getColumnItemCount(columnB);
      });

      addGroupToColumn(rankedColumns[0], "portrait");
    }

    while (remainingHorizontalCount > 0) {
      const rankedColumns = shuffleArray([...columns]).sort((columnA, columnB) => {
        if (columnA.balanceUnits !== columnB.balanceUnits) {
          return columnA.balanceUnits - columnB.balanceUnits;
        }

        return getColumnItemCount(columnA) - getColumnItemCount(columnB);
      });

      addGroupToColumn(rankedColumns[0], "horizontal");
    }

    const sequences = columns.map((column) =>
      buildGroupSequence(
        column.portraitCount,
        column.horizontalCount,
        column.startGroup
      )
    );

    if (sequences.some((sequence) => !sequence)) {
      return null;
    }

    const portraitPool = [...portraitModels];
    const horizontalPool = [...horizontalModels];

    columns.forEach((column, index) => {
      column.items = sequences[index].map((group) => {
        const model =
          group === "portrait"
            ? portraitPool.shift()
            : horizontalPool.shift();

        return model;
      });
    });

    if (portraitPool.length || horizontalPool.length) {
      return null;
    }

    return columns;
  };

  const scoreColumnCandidate = (columns) => {
    const balances = columns.map((column) => column.balanceUnits);
    const highestBalance = Math.max(...balances);
    const lowestBalance = Math.min(...balances);
    const averageBalance =
      balances.reduce((total, balance) => total + balance, 0) / balances.length;
    const balanceVariance = balances.reduce(
      (total, balance) => total + Math.abs(balance - averageBalance),
      0
    );
    const counts = columns.map((column) => column.items.length);
    const highestCount = Math.max(...counts);
    const lowestCount = Math.min(...counts);
    const averageCount =
      counts.reduce((total, count) => total + count, 0) / counts.length;
    const countVariance = counts.reduce(
      (total, count) => total + Math.abs(count - averageCount),
      0
    );
    const startPenalty = columns.reduce((total, column, index) => {
      if (index === 0) {
        return total;
      }

      const previousStart = columns[index - 1].items[0]?.formatGroup;
      const currentStart = column.items[0]?.formatGroup;

      return total + (previousStart === currentStart ? 8 : 0);
    }, 0);
    const streakPenalty = columns.reduce((total, column) => {
      let penalty = 0;
      let currentStreak = 1;

      for (let index = 1; index < column.items.length; index += 1) {
        const currentGroup = column.items[index]?.formatGroup;
        const previousGroup = column.items[index - 1]?.formatGroup;

        if (currentGroup === previousGroup) {
          currentStreak += 1;
        } else {
          currentStreak = 1;
        }

        if (currentStreak > 2) {
          penalty += 50;
        }
      }

      return total + penalty;
    }, 0);

    return (
      (highestBalance - lowestBalance) * 42 +
      balanceVariance * 22 +
      (highestCount - lowestCount) * 4 +
      countVariance * 0.6 +
      startPenalty +
      streakPenalty
    );
  };

  const getBestColumnCandidate = (columnCount) => {
    const attemptCount = columnCount === 2 ? 80 : 160;
    let bestCandidate = null;
    let bestScore = Infinity;

    for (let attempt = 0; attempt < attemptCount; attempt += 1) {
      const candidate = buildColumnCandidate(columnCount);

      if (!candidate) {
        continue;
      }

      const candidateScore = scoreColumnCandidate(candidate);

      if (candidateScore < bestScore) {
        bestCandidate = candidate;
        bestScore = candidateScore;
      }
    }

    return bestCandidate || buildColumnCandidate(columnCount);
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
        threshold: 0.02,
        rootMargin: "0px 0px 14% 0px",
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
        rootMargin: "500px 0px 500px 0px",
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

    if (!bestCandidate) {
      return;
    }

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
