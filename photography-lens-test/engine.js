import * as THREE from "./vendor/three.module.min.js";
import { GRID, LENS, PHOTOS } from "./config.js";

const MAX_SHADER_SAMPLES = 16;

function shuffle(items) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function buildColumnCandidate(models, columnCount) {
  const portraits = shuffle(
    models.filter((model) => model.formatGroup === "portrait"),
  );
  const horizontals = shuffle(
    models.filter((model) => model.formatGroup === "horizontal"),
  );
  const columns = Array.from({ length: columnCount }, (_, index) => ({
    index,
    portraitCount: 0,
    horizontalCount: 0,
    balanceUnits: 0,
    items: [],
  }));
  let remainingPortraits = portraits.length;
  let remainingHorizontals = horizontals.length;
  const startOffset = Math.random() < 0.5 ? 0 : 1;

  function addGroup(column, group) {
    if (group === "portrait") {
      if (!remainingPortraits) return false;
      column.portraitCount += 1;
      column.balanceUnits += 2;
      remainingPortraits -= 1;
      return true;
    }

    if (!remainingHorizontals) return false;
    column.horizontalCount += 1;
    column.balanceUnits += 1;
    remainingHorizontals -= 1;
    return true;
  }

  function itemCount(column) {
    return column.portraitCount + column.horizontalCount;
  }

  function buildSequence(portraitCount, horizontalCount, startGroup) {
    const cache = new Map();

    function solve(
      remainingPortraitCount,
      remainingHorizontalCount,
      lastGroup,
      streakLength,
      firstStep,
    ) {
      const key = [
        remainingPortraitCount,
        remainingHorizontalCount,
        lastGroup || "none",
        streakLength,
        firstStep ? 1 : 0,
      ].join("|");

      if (cache.has(key)) return cache.get(key);
      if (!remainingPortraitCount && !remainingHorizontalCount) return [];

      const candidateGroups = firstStep
        ? [startGroup]
        : shuffle(["portrait", "horizontal"]).sort((groupA, groupB) => {
            const countA =
              groupA === "portrait"
                ? remainingPortraitCount
                : remainingHorizontalCount;
            const countB =
              groupB === "portrait"
                ? remainingPortraitCount
                : remainingHorizontalCount;
            return countB - countA;
          });

      for (const group of candidateGroups) {
        if (group === "portrait" && !remainingPortraitCount) continue;
        if (group === "horizontal" && !remainingHorizontalCount) continue;
        if (!firstStep && lastGroup === group && streakLength >= 2) continue;

        const tail = solve(
          remainingPortraitCount - (group === "portrait" ? 1 : 0),
          remainingHorizontalCount - (group === "horizontal" ? 1 : 0),
          group,
          lastGroup === group ? streakLength + 1 : 1,
          false,
        );

        if (tail) {
          const sequence = [group, ...tail];
          cache.set(key, sequence);
          return sequence;
        }
      }

      cache.set(key, null);
      return null;
    }

    return solve(portraitCount, horizontalCount, "", 0, true);
  }

  for (const [index, column] of columns.entries()) {
    const preferred =
      (index + startOffset) % 2 === 0 ? "portrait" : "horizontal";
    const fallback = preferred === "portrait" ? "horizontal" : "portrait";

    if (addGroup(column, preferred)) {
      column.startGroup = preferred;
    } else if (addGroup(column, fallback)) {
      column.startGroup = fallback;
    } else {
      return null;
    }
  }

  while (remainingPortraits) {
    const [column] = shuffle(columns).sort((columnA, columnB) => {
      return (
        columnA.balanceUnits - columnB.balanceUnits ||
        itemCount(columnA) - itemCount(columnB)
      );
    });
    addGroup(column, "portrait");
  }

  while (remainingHorizontals) {
    const [column] = shuffle(columns).sort((columnA, columnB) => {
      return (
        columnA.balanceUnits - columnB.balanceUnits ||
        itemCount(columnA) - itemCount(columnB)
      );
    });
    addGroup(column, "horizontal");
  }

  const sequences = columns.map((column) =>
    buildSequence(
      column.portraitCount,
      column.horizontalCount,
      column.startGroup,
    ),
  );

  if (sequences.some((sequence) => !sequence)) return null;

  const portraitPool = [...portraits];
  const horizontalPool = [...horizontals];

  columns.forEach((column, index) => {
    column.items = sequences[index].map((group) => {
      return group === "portrait"
        ? portraitPool.shift()
        : horizontalPool.shift();
    });
  });

  return portraitPool.length || horizontalPool.length ? null : columns;
}

function scoreColumns(columns) {
  const balances = columns.map((column) => column.balanceUnits);
  const averageBalance =
    balances.reduce((total, balance) => total + balance, 0) / balances.length;
  const balanceVariance = balances.reduce(
    (total, balance) => total + Math.abs(balance - averageBalance),
    0,
  );
  const counts = columns.map((column) => column.items.length);
  const averageCount =
    counts.reduce((total, count) => total + count, 0) / counts.length;
  const countVariance = counts.reduce(
    (total, count) => total + Math.abs(count - averageCount),
    0,
  );
  const startPenalty = columns.reduce((total, column, index) => {
    if (!index) return total;
    const previous = columns[index - 1].items[0]?.formatGroup;
    const current = column.items[0]?.formatGroup;
    return total + (previous === current ? 8 : 0);
  }, 0);
  const streakPenalty = columns.reduce((total, column) => {
    let streak = 1;
    let penalty = 0;

    for (let index = 1; index < column.items.length; index += 1) {
      if (
        column.items[index].formatGroup ===
        column.items[index - 1].formatGroup
      ) {
        streak += 1;
        if (streak > 2) penalty += 50;
      } else {
        streak = 1;
      }
    }

    return total + penalty;
  }, 0);

  return (
    (Math.max(...balances) - Math.min(...balances)) * 42 +
    balanceVariance * 22 +
    (Math.max(...counts) - Math.min(...counts)) * 4 +
    countVariance * 0.6 +
    startPenalty +
    streakPenalty
  );
}

function buildBalancedColumns(models, columnCount) {
  let bestCandidate = null;
  let bestScore = Infinity;

  for (let attempt = 0; attempt < 160; attempt += 1) {
    const candidate = buildColumnCandidate(models, columnCount);
    if (!candidate) continue;

    const score = scoreColumns(candidate);
    if (score < bestScore) {
      bestCandidate = candidate;
      bestScore = score;
    }
  }

  if (bestCandidate) return bestCandidate;

  const fallback = Array.from({ length: columnCount }, (_, index) => ({
    index,
    balanceUnits: 0,
    items: [],
  }));

  shuffle(models).forEach((model) => {
    const [column] = [...fallback].sort((columnA, columnB) => {
      return (
        columnA.balanceUnits - columnB.balanceUnits ||
        columnA.items.length - columnB.items.length
      );
    });
    column.items.push(model);
    column.balanceUnits += model.balanceUnits;
  });

  return fallback;
}

export function createVerticalLensGallery(mount, callbacks = {}) {
  const { onHeightChange = () => {} } = callbacks;
  let width = Math.max(1, mount.clientWidth || window.innerWidth);
  let height = Math.max(1, mount.clientHeight || window.innerHeight);
  let scrollY = Math.max(0, window.scrollY);
  let destroyed = false;
  let animationFrame = 0;
  let activeLoads = 0;
  let useCounter = 0;
  const loadQueue = [];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0xffffff, 1);
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, GRID.MAX_DPR),
  );
  renderer.setSize(width, height, false);
  renderer.domElement.setAttribute("aria-hidden", "true");
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(
    -width / 2,
    width / 2,
    height / 2,
    -height / 2,
    -100,
    100,
  );
  camera.position.z = 10;

  const sharedGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  const loader = new THREE.TextureLoader();
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const models = shuffle(PHOTOS).map((photo, index) => {
    const material = new THREE.MeshBasicMaterial({
      color: 0xf3f3f3,
      transparent: true,
      opacity: 1,
    });
    const mesh = new THREE.Mesh(sharedGeometry, material);
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);

    return {
      ...photo,
      id: index,
      formatGroup: photo.aspect < 0.9 ? "portrait" : "horizontal",
      balanceUnits: photo.aspect < 0.9 ? 2 : 1,
      material,
      mesh,
      texture: null,
      status: "idle",
      desired: false,
      queued: false,
      lastUsed: 0,
      fadeStartedAt: 0,
      layout: null,
    };
  });
  const columns = buildBalancedColumns(models, GRID.COLUMNS);

  const targetDpr = renderer.getPixelRatio();
  const renderTarget = new THREE.WebGLRenderTarget(
    Math.max(1, Math.round(width * targetDpr)),
    Math.max(1, Math.round(height * targetDpr)),
  );
  renderTarget.texture.colorSpace = THREE.NoColorSpace;

  const lensScene = new THREE.Scene();
  const lensCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const lensUniforms = {
    uTex: { value: renderTarget.texture },
    uRes: {
      value: new THREE.Vector2(width * targetDpr, height * targetDpr),
    },
    uCenter: { value: new THREE.Vector2(LENS.posX, LENS.posY) },
    uSizeX: { value: Math.max(1, (width / height) * 0.58) },
    uSizeY: { value: LENS.sizeY },
    uShape: { value: LENS.shape === "square" ? 1 : 0 },
    uSquareRound: { value: LENS.squareRound },
    uRotation: { value: LENS.rotation },
    uAspect: { value: width / height },
    uZoom: { value: LENS.zoom },
    uDispersion: { value: LENS.dispersion },
    uBlur: { value: LENS.blur },
    uGlow: { value: LENS.glow },
    uWhiteGlow: { value: LENS.whiteGlow },
    uNovaSize: { value: LENS.novaSize },
    uBlueRing: { value: LENS.blueRing },
    uRingRadius: { value: LENS.ringRadius },
    uRingWidth: { value: LENS.ringWidth },
    uShimmer: {
      value: LENS.shimmer && !reducedMotion.matches ? 1 : 0,
    },
    uShimmerFreq: { value: LENS.shimmerFreq },
    uShimmerSpeed: { value: LENS.shimmerSpeed },
    uShimmerDepth: { value: LENS.shimmerDepth },
    uTime: { value: 0 },
    uRimStart: { value: LENS.rimStart },
    uRimTangential: { value: LENS.rimTangential },
    uRimInward: { value: LENS.rimInward },
    uRimFreq1: { value: LENS.rimFreq1 },
    uRimFreq2: { value: LENS.rimFreq2 },
    uBlueColor: { value: new THREE.Color(LENS.blueColor) },
    uRimLine: { value: LENS.rimLine },
    uRimLinePos: { value: LENS.rimLinePos },
    uRimLineWidth: { value: LENS.rimLineWidth },
    uVignette: { value: LENS.vignette },
    uVignetteSize: { value: LENS.vignetteSize },
    uSamples: {
      value: Math.min(MAX_SHADER_SAMPLES, Math.max(2, LENS.samples)),
    },
  };

  const lensMaterial = new THREE.ShaderMaterial({
    uniforms: lensUniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      #define PI 3.14159265
      precision highp float;

      varying vec2 vUv;
      uniform sampler2D uTex;
      uniform vec2 uRes;
      uniform vec2 uCenter;
      uniform float uSizeX;
      uniform float uSizeY;
      uniform float uAspect;
      uniform float uZoom;
      uniform float uDispersion;
      uniform float uBlur;
      uniform float uGlow;
      uniform float uWhiteGlow;
      uniform float uNovaSize;
      uniform float uBlueRing;
      uniform float uRingRadius;
      uniform float uRingWidth;
      uniform float uShimmer;
      uniform float uShimmerFreq;
      uniform float uShimmerSpeed;
      uniform float uShimmerDepth;
      uniform float uTime;
      uniform float uRimStart;
      uniform float uRimTangential;
      uniform float uRimInward;
      uniform float uRimFreq1;
      uniform float uRimFreq2;
      uniform vec3 uBlueColor;
      uniform float uRimLine;
      uniform float uRimLinePos;
      uniform float uRimLineWidth;
      uniform float uVignette;
      uniform float uVignetteSize;
      uniform float uShape;
      uniform float uSquareRound;
      uniform float uRotation;
      uniform int uSamples;

      const int MAX_SAMPLES = 16;

      float sdRoundBox(vec2 point, vec2 bounds, float radius) {
        vec2 q = abs(point) - bounds + radius;
        return min(max(q.x, q.y), 0.0)
          + length(max(q, 0.0))
          - radius;
      }

      vec3 discLens(vec2 center, float aspectCorrect, out float outAlpha) {
        vec2 point = vUv - center;
        point.x *= aspectCorrect;

        float cosine = cos(uRotation);
        float sine = sin(uRotation);
        point = mat2(cosine, -sine, sine, cosine) * point;

        vec2 halfSize = vec2(uSizeX, uSizeY);
        float distanceFromCenter = length(point / halfSize);
        outAlpha = 0.0;

        float maskDistance;
        if (uShape > 0.5) {
          float corner = min(uSizeX, uSizeY)
            * clamp(uSquareRound, 0.0, 1.0);
          float signedDistance = sdRoundBox(point, halfSize, corner);
          maskDistance =
            1.0 + signedDistance / min(uSizeX, uSizeY);
        } else {
          maskDistance = distanceFromCenter;
        }

        if (maskDistance > 1.0) return vec3(0.0);

        float shapeDistance = clamp(maskDistance, 0.0, 1.0);
        float normalizedDistance = clamp(distanceFromCenter, 0.0, 1.0);
        vec2 offset = vUv - center;
        vec2 radialDirection = normalize(offset + 1e-6);
        vec2 tangentDirection = vec2(
          -radialDirection.y,
          radialDirection.x
        );
        float angle = atan(point.y, point.x);

        float pull = uZoom * 0.30
          * (normalizedDistance * normalizedDistance);
        float rimStrength = smoothstep(
          uRimStart,
          1.0,
          normalizedDistance
        );
        float fluidWave =
          sin(angle * uRimFreq1) * 0.55
          + sin(angle * uRimFreq2) * 0.25;
        float screenRadius = (uSizeX + uSizeY) * 0.5;
        vec2 rimOffset =
          tangentDirection
          * fluidWave
          * rimStrength
          * screenRadius
          * uRimTangential;
        vec2 rimPull =
          -radialDirection
          * rimStrength
          * screenRadius
          * uRimInward;
        vec2 baseUv =
          center
          + offset * (1.0 - pull)
          + rimOffset
          + rimPull;

        float rimMask = smoothstep(
          0.55,
          1.0,
          normalizedDistance
        );
        vec3 color;

        if (rimMask <= 0.0001) {
          color = texture2D(uTex, baseUv).rgb;
        } else {
          vec2 dispersionDirection =
            offset * uDispersion * 0.004 * rimMask;
          int sampleCount = uSamples;
          if (sampleCount < 2) sampleCount = 2;
          if (sampleCount > MAX_SAMPLES) sampleCount = MAX_SAMPLES;
          vec3 accumulatedColor = vec3(0.0);
          vec3 accumulatedWeight = vec3(0.0);

          for (int index = 0; index < MAX_SAMPLES; index += 1) {
            if (index >= sampleCount) break;
            float samplePosition =
              float(index) / float(sampleCount - 1);
            vec2 sampleUv =
              baseUv
              + dispersionDirection * (samplePosition - 0.5);
            vec3 sampleColor = texture2D(uTex, sampleUv).rgb;
            vec3 weight = vec3(
              exp(-pow((samplePosition - 0.00) / 0.38, 2.0)),
              exp(-pow((samplePosition - 0.50) / 0.38, 2.0)),
              exp(-pow((samplePosition - 1.00) / 0.38, 2.0))
            );
            accumulatedColor += sampleColor * weight;
            accumulatedWeight += weight;
          }

          color =
            accumulatedColor / max(accumulatedWeight, vec3(0.001));
        }

        float blurFade =
          1.0 - smoothstep(0.72, 0.98, normalizedDistance);
        if (uBlur > 0.01 && blurFade > 0.01) {
          vec2 blurRadius = vec2(uBlur) / uRes * blurFade;
          vec3 blurredColor = vec3(0.0);
          float totalBlurWeight = 0.0;

          for (
            float blurAngle = 0.0;
            blurAngle < PI * 2.0;
            blurAngle += PI * 2.0 / 6.0
          ) {
            for (
              float blurStep = 0.4;
              blurStep <= 1.001;
              blurStep += 0.3
            ) {
              vec2 blurOffset =
                vec2(cos(blurAngle), sin(blurAngle))
                * blurRadius
                * blurStep;
              float blurWeight = 1.0 - blurStep * 0.38;
              blurredColor +=
                texture2D(uTex, baseUv + blurOffset).rgb
                * blurWeight;
              totalBlurWeight += blurWeight;
            }
          }

          color = mix(
            blurredColor / totalBlurWeight,
            color,
            rimMask
          );
        }

        float radiusSquared =
          shapeDistance * shapeDistance * 0.25;
        float glowSize =
          max(uNovaSize * uGlow * 0.003, 0.004);
        float nova =
          exp(-radiusSquared / glowSize)
          + exp(-radiusSquared / (glowSize * 7.0)) * 0.18;
        nova *=
          uWhiteGlow
          * (uGlow / 17.0)
          * 1.15;
        color += vec3(nova);

        float ringDistance = shapeDistance * 0.5;
        float ringRadius = clamp(uRingRadius, 0.1, 0.49);
        float ringWidth = max(uRingWidth, 0.003);
        float ring = exp(
          -pow((ringDistance - ringRadius) / ringWidth, 2.0)
        );
        ring *=
          uBlueRing
          * (uGlow / 17.0)
          * 1.8;

        if (uShimmer > 0.5) {
          ring *=
            sin(
              angle * uShimmerFreq
              + uTime * uShimmerSpeed
            )
            * uShimmerDepth
            + (1.0 - uShimmerDepth);
        }

        float ringAura = exp(
          -pow(
            (ringDistance - ringRadius) / (ringWidth * 6.0),
            2.0
          )
        );
        ringAura *=
          0.28
          * uBlueRing
          * (uGlow / 17.0);
        color += uBlueColor * (ring + ringAura);

        color += vec3(
          exp(
            -pow(
              (ringDistance - uRimLinePos)
                / max(uRimLineWidth, 0.0001),
              2.0
            )
          )
          * uRimLine
        );

        outAlpha = smoothstep(1.0, 0.93, maskDistance);
        return color;
      }

      void main() {
        vec3 untouched = texture2D(uTex, vUv).rgb;
        vec3 outputColor = untouched;
        float lensAlpha = 0.0;
        // In this horizontal variant, uSizeX is expressed in viewport UVs.
        // Keeping X out of the height-based aspect correction pushes the two
        // lateral rims off-screen while preserving the top and bottom rims.
        vec3 lensColor = discLens(
          uCenter,
          1.0,
          lensAlpha
        );
        outputColor = mix(outputColor, lensColor, lensAlpha);

        if (uVignette > 0.001) {
          vec2 vignettePoint = vUv - 0.5;
          vignettePoint.x *= uAspect;
          float vignetteDistance =
            length(vignettePoint)
            / max(uVignetteSize, 0.0001);
          float vignette =
            1.0
            - uVignette
            * smoothstep(0.5, 1.0, vignetteDistance);
          outputColor *= clamp(vignette, 0.0, 1.0);
        }

        gl_FragColor = vec4(outputColor, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const lensGeometry = new THREE.PlaneGeometry(2, 2);
  const lensMesh = new THREE.Mesh(lensGeometry, lensMaterial);
  lensScene.add(lensMesh);

  function computeLayout() {
    const gridWidth = Math.min(1440, Math.max(1, width - 400));
    const columnWidth =
      (gridWidth - GRID.GAP * (GRID.COLUMNS - 1)) / GRID.COLUMNS;
    const gridLeft = (width - gridWidth) / 2;
    let totalHeight = GRID.TOP_PADDING;

    columns.forEach((column, columnIndex) => {
      let top = GRID.TOP_PADDING;

      column.items.forEach((model) => {
        const itemHeight = columnWidth / model.aspect;
        model.layout = {
          left: gridLeft + columnIndex * (columnWidth + GRID.GAP),
          top,
          width: columnWidth,
          height: itemHeight,
        };
        top += itemHeight + GRID.GAP;
      });

      totalHeight = Math.max(
        totalHeight,
        top - GRID.GAP + GRID.BOTTOM_PADDING,
      );
    });

    onHeightChange(Math.max(height, totalHeight));
  }

  function requestTexture(model) {
    if (
      destroyed ||
      model.status === "loaded" ||
      model.status === "loading" ||
      model.queued
    ) {
      return;
    }

    model.queued = true;
    model.status = "queued";
    loadQueue.push(model);
  }

  function enforceTextureBudget() {
    const loaded = models.filter(
      (model) => model.status === "loaded" && model.texture,
    );
    let excess = loaded.length - GRID.CACHE_SIZE;
    if (excess <= 0) return;

    const disposable = loaded
      .filter((model) => !model.desired && !model.mesh.visible)
      .sort((modelA, modelB) => modelA.lastUsed - modelB.lastUsed);

    for (const model of disposable) {
      if (excess <= 0) break;
      model.texture.dispose();
      model.texture = null;
      model.material.map = null;
      model.material.color.setHex(0xf3f3f3);
      model.material.opacity = 1;
      model.material.needsUpdate = true;
      model.status = "idle";
      model.fadeStartedAt = 0;
      excess -= 1;
    }
  }

  function pumpTextureQueue() {
    if (destroyed) return;

    loadQueue.sort((modelA, modelB) => {
      const centerA =
        modelA.layout.top + modelA.layout.height * 0.5;
      const centerB =
        modelB.layout.top + modelB.layout.height * 0.5;
      const viewportCenter = scrollY + height * 0.5;
      return (
        Math.abs(centerA - viewportCenter) -
        Math.abs(centerB - viewportCenter)
      );
    });

    while (activeLoads < GRID.MAX_CONCURRENT && loadQueue.length) {
      const model = loadQueue.shift();
      model.queued = false;

      if (!model.desired || model.status !== "queued") {
        if (model.status === "queued") model.status = "idle";
        continue;
      }

      model.status = "loading";
      activeLoads += 1;

      loader.load(
        model.src,
        (texture) => {
          activeLoads -= 1;

          if (destroyed) {
            texture.dispose();
            return;
          }

          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = true;
          texture.anisotropy = maxAnisotropy;
          texture.colorSpace = THREE.SRGBColorSpace;

          model.texture = texture;
          model.material.map = texture;
          model.material.color.setHex(0xffffff);
          model.material.opacity = 0;
          model.material.needsUpdate = true;
          model.fadeStartedAt = performance.now();
          model.status = "loaded";
          model.lastUsed = ++useCounter;

          enforceTextureBudget();
          pumpTextureQueue();
        },
        undefined,
        () => {
          activeLoads -= 1;
          if (!destroyed) {
            model.status = "error";
            model.material.opacity = 1;
            pumpTextureQueue();
          }
        },
      );
    }
  }

  function updateVisibleModels(now) {
    const overscan = height * GRID.OVERSCAN;
    const visibleTop = scrollY - overscan;
    const visibleBottom = scrollY + height + overscan;

    models.forEach((model) => {
      const { layout } = model;
      const isVisible =
        layout.top + layout.height >= visibleTop &&
        layout.top <= visibleBottom;
      model.desired = isVisible;
      model.mesh.visible = isVisible;

      if (!isVisible) return;

      model.lastUsed = ++useCounter;
      model.mesh.position.set(
        layout.left + layout.width * 0.5 - width * 0.5,
        height * 0.5 -
          (layout.top - scrollY + layout.height * 0.5),
        0,
      );
      model.mesh.scale.set(layout.width, layout.height, 1);

      if (model.status === "idle") requestTexture(model);
      if (model.status === "loaded" && model.fadeStartedAt) {
        const fadeProgress = Math.min(
          1,
          (now - model.fadeStartedAt) / 320,
        );
        model.material.opacity = fadeProgress;
        if (fadeProgress === 1) model.fadeStartedAt = 0;
      }
    });

    pumpTextureQueue();
    enforceTextureBudget();
  }

  function render(now) {
    if (destroyed || document.hidden) return;

    updateVisibleModels(now);
    lensUniforms.uTime.value = now * 0.001;

    renderer.setRenderTarget(renderTarget);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(lensScene, lensCamera);

    animationFrame = requestAnimationFrame(render);
  }

  function startRendering() {
    if (destroyed || document.hidden || animationFrame) return;
    animationFrame = requestAnimationFrame(render);
  }

  function stopRendering() {
    if (!animationFrame) return;
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      stopRendering();
    } else {
      startRendering();
    }
  }

  function handleReducedMotionChange() {
    lensUniforms.uShimmer.value =
      LENS.shimmer && !reducedMotion.matches ? 1 : 0;
  }

  function setScroll(nextScrollY) {
    if (!Number.isFinite(nextScrollY)) return;
    scrollY = Math.max(0, nextScrollY);
  }

  function resize() {
    if (destroyed) return;

    width = Math.max(1, mount.clientWidth || window.innerWidth);
    height = Math.max(1, mount.clientHeight || window.innerHeight);
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      GRID.MAX_DPR,
    );

    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.left = -width / 2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.updateProjectionMatrix();

    renderTarget.setSize(
      Math.max(1, Math.round(width * dpr)),
      Math.max(1, Math.round(height * dpr)),
    );
    lensUniforms.uRes.value.set(width * dpr, height * dpr);
    lensUniforms.uAspect.value = width / height;
    lensUniforms.uSizeX.value = Math.max(
      1,
      (width / height) * 0.58,
    );
    computeLayout();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stopRendering();
    document.removeEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );
    reducedMotion.removeEventListener(
      "change",
      handleReducedMotionChange,
    );

    models.forEach((model) => {
      model.texture?.dispose();
      model.material.dispose();
    });
    sharedGeometry.dispose();
    lensGeometry.dispose();
    lensMaterial.dispose();
    renderTarget.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    renderer.domElement.remove();
    loadQueue.length = 0;
  }

  computeLayout();
  document.addEventListener(
    "visibilitychange",
    handleVisibilityChange,
  );
  reducedMotion.addEventListener(
    "change",
    handleReducedMotionChange,
  );
  startRendering();

  return {
    setScroll,
    resize,
    destroy,
  };
}
