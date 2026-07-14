(() => {
  "use strict";

  const COLLECTIONS = {
    "esports-world-cup": {
      label: "Esports World Cup",
      folder: "esports-world-cup-2026",
    },
    rlcs: {
      label: "RLCS",
      folder: "rlcs-paris-major-2026",
    },
    "paris-games-week": {
      label: "Paris Games Week",
      folder: "paris-games-week-2025",
    },
  };

  const STORAGE_PREFIX = "photo-layout-editor:v1:";
  const SELECTED_COLLECTION_KEY = `${STORAGE_PREFIX}selected-collection`;
  const MAX_HISTORY = 40;
  const PHOTO_TRANSFER_TYPE = "application/x-photo-layout-item";

  const collectionSelect = document.querySelector("#collection-select");
  const layoutCanvas = document.querySelector("#layout-canvas");
  const photoLibrary = document.querySelector("#photo-library");
  const libraryPanel = document.querySelector("#library-panel");
  const libraryReturnZone = document.querySelector("#library-return-zone");
  const saveStatus = document.querySelector("#save-status");
  const placedCount = document.querySelector("#placed-count");
  const libraryCount = document.querySelector("#library-count");
  const undoButton = document.querySelector("#undo-layout");
  const importButton = document.querySelector("#import-layout");
  const importFile = document.querySelector("#import-file");
  const exportButton = document.querySelector("#export-layout");
  const resetButton = document.querySelector("#reset-layout");
  const editorMessage = document.querySelector("#editor-message");
  const canvasPanel = document.querySelector(".canvas-panel");
  const libraryFilters = Array.from(
    document.querySelectorAll("[data-library-filter]")
  );

  let catalogByCollection = new Map();
  let currentCollection = "esports-world-cup";
  let rows = [];
  let history = [];
  let libraryFilter = "available";
  let dragState = null;
  let pointerCandidate = null;
  let pointerDropTarget = null;
  let dragGhost = null;
  let messageTimer = 0;
  let resetConfirmationTimer = 0;
  let resetArmed = false;
  let rowSequence = 0;

  const createRowId = () => {
    rowSequence += 1;
    return `row-${Date.now().toString(36)}-${rowSequence.toString(36)}`;
  };

  const getStorageKey = (collectionKey) =>
    `${STORAGE_PREFIX}${collectionKey}`;

  const getCatalog = () => catalogByCollection.get(currentCollection) || [];

  const getPhoto = (photoId) =>
    getCatalog().find((photo) => photo.id === photoId) || null;

  const getPhotoFilename = (photoId) =>
    photoId?.split("/").pop() || photoId || "Photo";

  const formatPhotoType = (photo) => {
    if (photo.kind === "portrait") {
      return "Portrait";
    }

    return photo.wideOnly ? "Grand" : "3:2";
  };

  const showMessage = (message) => {
    window.clearTimeout(messageTimer);
    editorMessage.textContent = message;
    editorMessage.classList.add("is-visible");
    messageTimer = window.setTimeout(() => {
      editorMessage.classList.remove("is-visible");
    }, 2600);
  };

  const setSaveStatus = (message) => {
    saveStatus.textContent = message;
  };

  const normalizePhotoId = (source) => {
    const marker = "/rsrc/photos/";
    const normalizedSource = String(source || "").replace(/\\/g, "/");
    const markerIndex = normalizedSource.indexOf(marker);

    if (markerIndex >= 0) {
      return normalizedSource.slice(markerIndex + marker.length);
    }

    return normalizedSource
      .replace(/^\.\//, "")
      .replace(/^rsrc\/photos\//, "");
  };

  const loadPhotoCatalog = async () => {
    const response = await fetch("./photography.html", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Impossible de lire photography.html (${response.status})`);
    }

    const html = await response.text();
    const parsedDocument = new DOMParser().parseFromString(html, "text/html");
    const imageElements = Array.from(
      parsedDocument.querySelectorAll(".photo-image[data-src]")
    );

    const catalogs = new Map();

    Object.entries(COLLECTIONS).forEach(([collectionKey, collection]) => {
      const photos = imageElements
        .map((image) => {
          const id = normalizePhotoId(image.dataset.src);

          if (!id.startsWith(`${collection.folder}/`)) {
            return null;
          }

          const width = Number(image.getAttribute("width")) || 1;
          const height = Number(image.getAttribute("height")) || 1;
          const ratio = width / height;
          const kind = ratio < 1 ? "portrait" : "landscape";
          const isThreeTwo =
            kind === "landscape" && Math.abs(ratio - 1.5) <= 0.035;

          return {
            id,
            src: `./rsrc/photos/${id}`,
            filename: getPhotoFilename(id),
            width,
            height,
            ratio,
            kind,
            isThreeTwo,
            wideOnly: kind === "landscape" && !isThreeTwo,
          };
        })
        .filter(Boolean);

      catalogs.set(collectionKey, photos);
    });

    catalogByCollection = catalogs;
  };

  const cloneRows = (value = rows) =>
    JSON.parse(JSON.stringify(value));

  const normalizeSinglePortraitPair = (row) => {
    if (row.type !== "pair") {
      return row;
    }

    const remainingPortraits = row.photos
      .map((photoId, index) => ({ photoId, index }))
      .filter(
        ({ photoId }) => photoId && getPhoto(photoId)?.kind === "portrait"
      );
    const placedPhotoCount = row.photos.filter(Boolean).length;

    if (placedPhotoCount !== 1 || remainingPortraits.length !== 1) {
      return row;
    }

    const [{ photoId, index }] = remainingPortraits;

    return {
      id: row.id,
      type: "composition",
      portraitSide: index === 0 ? "left" : "right",
      portrait: photoId,
      landscapes: [null, null],
    };
  };

  const normalizeSinglePortraitPairs = () => {
    rows = rows.map(normalizeSinglePortraitPair);
  };

  const sanitizeRows = (candidateRows) => {
    if (!Array.isArray(candidateRows)) {
      return [];
    }

    return candidateRows
      .map((row) => {
        if (!row || typeof row !== "object") {
          return null;
        }

        if (row.type === "featured") {
          return {
            id: row.id || createRowId(),
            type: "featured",
            photo: typeof row.photo === "string" ? row.photo : null,
          };
        }

        if (row.type === "pair") {
          const photos = Array.isArray(row.photos) ? row.photos.slice(0, 2) : [];

          return {
            id: row.id || createRowId(),
            type: "pair",
            photos: [
              typeof photos[0] === "string" ? photos[0] : null,
              typeof photos[1] === "string" ? photos[1] : null,
            ],
          };
        }

        if (row.type === "composition") {
          const landscapes = Array.isArray(row.landscapes)
            ? row.landscapes.slice(0, 2)
            : [];

          return {
            id: row.id || createRowId(),
            type: "composition",
            portraitSide: row.portraitSide === "right" ? "right" : "left",
            portrait:
              typeof row.portrait === "string" ? row.portrait : null,
            landscapes: [
              typeof landscapes[0] === "string" ? landscapes[0] : null,
              typeof landscapes[1] === "string" ? landscapes[1] : null,
            ],
          };
        }

        return null;
      })
      .filter(Boolean)
      .map(normalizeSinglePortraitPair);
  };

  const loadRowsFromStorage = (collectionKey) => {
    try {
      const savedValue = window.localStorage.getItem(getStorageKey(collectionKey));

      if (!savedValue) {
        return [];
      }

      const parsedValue = JSON.parse(savedValue);
      return sanitizeRows(parsedValue.rows || parsedValue);
    } catch {
      return [];
    }
  };

  const saveRowsToStorage = () => {
    const payload = {
      version: 1,
      collection: currentCollection,
      rows: cloneRows(),
    };

    window.localStorage.setItem(
      getStorageKey(currentCollection),
      JSON.stringify(payload)
    );
    window.localStorage.setItem(SELECTED_COLLECTION_KEY, currentCollection);
    setSaveStatus("Sauvegardé");
  };

  const pushHistory = () => {
    history.push(cloneRows());

    if (history.length > MAX_HISTORY) {
      history.shift();
    }
  };

  const commitChange = (change, message = "") => {
    pushHistory();
    change();
    normalizeSinglePortraitPairs();
    removeEmptyRows();
    saveRowsToStorage();
    renderEditor();

    if (message) {
      showMessage(message);
    }
  };

  const getRowPhotoIds = (row) => {
    if (row.type === "featured") {
      return [row.photo].filter(Boolean);
    }

    if (row.type === "pair") {
      return row.photos.filter(Boolean);
    }

    return [row.portrait, ...row.landscapes].filter(Boolean);
  };

  const getUsedPhotoIds = () =>
    new Set(rows.flatMap((row) => getRowPhotoIds(row)));

  const removeEmptyRows = () => {
    rows = rows.filter((row) => getRowPhotoIds(row).length > 0);
  };

  const detachPhoto = (photoId, shouldCleanup = true) => {
    rows.forEach((row) => {
      if (row.type === "featured" && row.photo === photoId) {
        row.photo = null;
      }

      if (row.type === "pair") {
        row.photos = row.photos.map((id) => (id === photoId ? null : id));
      }

      if (row.type === "composition") {
        if (row.portrait === photoId) {
          row.portrait = null;
        }

        row.landscapes = row.landscapes.map((id) =>
          id === photoId ? null : id
        );
      }
    });

    if (shouldCleanup) {
      removeEmptyRows();
    }
  };

  const getSlotPhotoId = (row, slotKey) => {
    if (row.type === "featured") {
      return row.photo;
    }

    if (row.type === "pair") {
      return row.photos[Number(slotKey.split(":")[1])];
    }

    if (slotKey === "portrait") {
      return row.portrait;
    }

    return row.landscapes[Number(slotKey.split(":")[1])];
  };

  const setSlotPhotoId = (row, slotKey, photoId) => {
    if (row.type === "featured") {
      row.photo = photoId;
      return;
    }

    if (row.type === "pair") {
      row.photos[Number(slotKey.split(":")[1])] = photoId;
      return;
    }

    if (slotKey === "portrait") {
      row.portrait = photoId;
      return;
    }

    row.landscapes[Number(slotKey.split(":")[1])] = photoId;
  };

  const canConvertCompositionToPortraitPair = (photo, row, slotKey) =>
    Boolean(
      photo?.kind === "portrait" &&
        row?.type === "composition" &&
        slotKey.startsWith("landscape:") &&
        row.portrait &&
        row.portrait !== photo.id
    );

  const convertCompositionToPortraitPair = (row, photoId) => {
    const existingPortraitId = row.portrait;
    const photos =
      row.portraitSide === "right"
        ? [photoId, existingPortraitId]
        : [existingPortraitId, photoId];

    row.type = "pair";
    row.photos = photos;
    delete row.portraitSide;
    delete row.portrait;
    delete row.landscapes;
  };

  const canPlacePhotoInSlot = (photo, row, slotKey) => {
    if (!photo || !row) {
      return false;
    }

    if (row.type === "featured") {
      return true;
    }

    if (row.type === "composition") {
      if (slotKey === "portrait") {
        return photo.kind === "portrait";
      }

      if (canConvertCompositionToPortraitPair(photo, row, slotKey)) {
        return true;
      }

      return photo.kind === "landscape" && photo.isThreeTwo;
    }

    if (photo.wideOnly) {
      return false;
    }

    const targetIndex = Number(slotKey.split(":")[1]);
    const otherId = row.photos[targetIndex === 0 ? 1 : 0];
    const otherPhoto = otherId && otherId !== photo.id ? getPhoto(otherId) : null;

    if (!otherPhoto) {
      return photo.kind === "portrait" || photo.isThreeTwo;
    }

    if (photo.kind === "portrait") {
      return otherPhoto.kind === "portrait";
    }

    return photo.isThreeTwo && otherPhoto.isThreeTwo;
  };

  const validateRow = (row) => {
    const errors = [];

    if (row.type === "featured") {
      if (!row.photo || !getPhoto(row.photo)) {
        errors.push("Photo grand format manquante");
      }

      return errors;
    }

    if (row.type === "pair") {
      const pairPhotos = row.photos.map((id) => (id ? getPhoto(id) : null));

      if (pairPhotos.some((photo) => !photo)) {
        errors.push("Duo incomplet");
        return errors;
      }

      if (pairPhotos.some((photo) => photo.wideOnly)) {
        errors.push("Un paysage atypique doit être en grand");
      }

      const bothPortraits = pairPhotos.every(
        (photo) => photo.kind === "portrait"
      );
      const bothLandscapes = pairPhotos.every((photo) => photo.isThreeTwo);

      if (!bothPortraits && !bothLandscapes) {
        errors.push("Le duo doit contenir deux formats compatibles");
      }

      return errors;
    }

    const portrait = row.portrait ? getPhoto(row.portrait) : null;
    const landscapes = row.landscapes.map((id) => (id ? getPhoto(id) : null));

    if (!portrait || portrait.kind !== "portrait") {
      errors.push("Portrait manquant");
    }

    if (landscapes.some((photo) => !photo || !photo.isThreeTwo)) {
      errors.push("Deux paysages 3:2 sont nécessaires");
    }

    return errors;
  };

  const validateLayout = () => {
    const errors = [];
    const seenIds = new Set();

    rows.forEach((row, index) => {
      validateRow(row).forEach((error) => {
        errors.push(`Rangée ${index + 1} : ${error}`);
      });

      getRowPhotoIds(row).forEach((photoId) => {
        if (seenIds.has(photoId)) {
          errors.push(
            `Rangée ${index + 1} : ${getPhotoFilename(photoId)} est en double`
          );
        }

        seenIds.add(photoId);

        if (!getPhoto(photoId)) {
          errors.push(`Rangée ${index + 1} : fichier photo introuvable`);
        }
      });
    });

    return errors;
  };

  const clearDropVisuals = () => {
    document
      .querySelectorAll(".is-drop-active, .is-invalid-drop")
      .forEach((element) => {
        element.classList.remove("is-drop-active", "is-invalid-drop");
      });
    document.querySelectorAll(".insertion-zone[data-preview]").forEach((zone) => {
      zone.removeAttribute("data-preview");
      const preview = zone.querySelector(".insertion-preview");

      if (preview) {
        preview.textContent = "";
      }
    });
  };

  const setDragState = (event, state, dragImage) => {
    dragState = state;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(PHOTO_TRANSFER_TYPE, JSON.stringify(state));
    event.dataTransfer.setData("text/plain", state.photoId || state.rowId || "");

    if (dragImage) {
      event.dataTransfer.setDragImage(
        dragImage,
        Math.min(dragImage.clientWidth / 2, 80),
        Math.min(dragImage.clientHeight / 2, 60)
      );
    }

    window.requestAnimationFrame(() => {
      document.body.classList.add("is-dragging");
      document.body.classList.toggle("is-dragging-row", state.kind === "row");
      document.body.classList.toggle(
        "is-dragging-from-grid",
        state.kind === "photo" && state.source === "grid"
      );
    });
  };

  const getDragState = (event) => {
    if (dragState) {
      return dragState;
    }

    try {
      const transferredState = event.dataTransfer.getData(PHOTO_TRANSFER_TYPE);
      return transferredState ? JSON.parse(transferredState) : null;
    } catch {
      return null;
    }
  };

  const finishDrag = () => {
    dragState = null;
    pointerCandidate = null;
    pointerDropTarget = null;
    dragGhost?.remove();
    dragGhost = null;
    clearDropVisuals();
    libraryReturnZone.classList.remove("is-drop-active");
    document.body.classList.remove(
      "is-dragging",
      "is-dragging-row",
      "is-dragging-from-grid"
    );
  };

  const activatePointerDrag = (candidate) => {
    dragState = candidate.state;
    document.body.classList.add("is-dragging");
    document.body.classList.toggle(
      "is-dragging-row",
      candidate.state.kind === "row"
    );
    document.body.classList.toggle(
      "is-dragging-from-grid",
      candidate.state.kind === "photo" && candidate.state.source === "grid"
    );

    dragGhost = document.createElement("div");
    dragGhost.className = "drag-ghost";

    if (candidate.imageSource) {
      const image = document.createElement("img");
      image.src = candidate.imageSource;
      image.alt = "";
      dragGhost.appendChild(image);
    } else {
      dragGhost.textContent = "Rangée";
    }

    document.body.appendChild(dragGhost);
  };

  const updateDragGhost = (clientX, clientY) => {
    if (!dragGhost) {
      return;
    }

    dragGhost.style.transform = `translate3d(${clientX + 14}px, ${
      clientY + 14
    }px, 0)`;
  };

  const updatePointerDropTarget = (event) => {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    pointerDropTarget = null;
    clearDropVisuals();

    if (!element || !dragState) {
      return;
    }

    if (dragState.kind === "row") {
      const insertionZone = element.closest(".insertion-zone");

      if (!insertionZone) {
        return;
      }

      const preview = insertionZone.querySelector(".insertion-preview");
      insertionZone.dataset.preview = "row";

      if (preview) {
        preview.textContent = "Déplacer la rangée";
      }

      pointerDropTarget = {
        type: "row-insertion",
        index: Number(insertionZone.dataset.insertionIndex),
      };
      return;
    }

    const photo = getPhoto(dragState.photoId);

    if (!photo) {
      return;
    }

    if (
      dragState.source === "grid" &&
      element.closest("#library-panel")
    ) {
      libraryReturnZone.classList.add("is-drop-active");
      pointerDropTarget = { type: "remove" };
      autoScrollPanel(photoLibrary, event);
      return;
    }

    const slot = element.closest(".layout-slot");

    if (slot) {
      const row = rows.find((candidate) => candidate.id === slot.dataset.rowId);
      const convertsToPortraitPair = canConvertCompositionToPortraitPair(
        photo,
        row,
        slot.dataset.slotKey
      );

      if (canPlacePhotoInSlot(photo, row, slot.dataset.slotKey)) {
        const dropVisual = convertsToPortraitPair
          ? slot.closest(".composition-stack")
          : slot;
        dropVisual?.classList.add("is-drop-active");
        pointerDropTarget = {
          type: "slot",
          rowId: row.id,
          slotKey: slot.dataset.slotKey,
        };
      } else {
        slot.classList.add("is-invalid-drop");
      }

      autoScrollPanel(canvasPanel, event);
      return;
    }

    const compositionStack = element.closest(".composition-stack");

    if (compositionStack) {
      const rowElement = compositionStack.closest(".layout-row");
      const row = rows.find(
        (candidate) => candidate.id === rowElement?.dataset.rowId
      );

      if (
        canConvertCompositionToPortraitPair(photo, row, "landscape:0")
      ) {
        compositionStack.classList.add("is-drop-active");
        pointerDropTarget = {
          type: "slot",
          rowId: row.id,
          slotKey: "landscape:0",
        };
      }

      autoScrollPanel(canvasPanel, event);
      return;
    }

    const insertionZone = element.closest(".insertion-zone");

    if (!insertionZone) {
      return;
    }

    const placement = getInsertionPlacement(event, insertionZone, photo);
    const preview = insertionZone.querySelector(".insertion-preview");
    insertionZone.dataset.preview = placement;

    if (preview) {
      preview.textContent = getInsertionLabel(placement, photo);
    }

    pointerDropTarget = {
      type: "photo-insertion",
      index: Number(insertionZone.dataset.insertionIndex),
      placement,
    };
    autoScrollPanel(canvasPanel, event);
  };

  const placePhotoInSlot = (photoId, rowId, slotKey) => {
    const photo = getPhoto(photoId);
    const targetRow = rows.find((row) => row.id === rowId);

    if (!canPlacePhotoInSlot(photo, targetRow, slotKey)) {
      showMessage(
        photo?.wideOnly
          ? "Ce paysage doit être placé en grand format."
          : "Ce format ne correspond pas à cet emplacement."
      );
      return;
    }

    if (getSlotPhotoId(targetRow, slotKey) === photo.id) {
      return;
    }

    const convertsToPortraitPair = canConvertCompositionToPortraitPair(
      photo,
      targetRow,
      slotKey
    );
    const replacedPhotoIds = convertsToPortraitPair
      ? targetRow.landscapes.filter(Boolean)
      : [getSlotPhotoId(targetRow, slotKey)].filter(Boolean);
    commitChange(
      () => {
        detachPhoto(photo.id, false);
        const liveTargetRow = rows.find((row) => row.id === rowId);

        if (!liveTargetRow) {
          return;
        }

        if (convertsToPortraitPair) {
          convertCompositionToPortraitPair(liveTargetRow, photo.id);
        } else {
          setSlotPhotoId(liveTargetRow, slotKey, photo.id);
        }
      },
      replacedPhotoIds.length
        ? convertsToPortraitPair
          ? "Les paysages sont retournés dans la bibliothèque."
          : "La photo remplacée est retournée dans la bibliothèque."
        : ""
    );
  };

  const insertPhotoAt = (photoId, requestedIndex, placement) => {
    const photo = getPhoto(photoId);

    if (!photo) {
      return;
    }

    commitChange(() => {
      const sourceRowIndex = rows.findIndex((row) =>
        getRowPhotoIds(row).includes(photo.id)
      );
      const sourceRowWillDisappear =
        sourceRowIndex >= 0 && getRowPhotoIds(rows[sourceRowIndex]).length === 1;
      detachPhoto(photo.id);
      let targetIndex = requestedIndex;

      if (
        sourceRowWillDisappear &&
        sourceRowIndex >= 0 &&
        sourceRowIndex < requestedIndex
      ) {
        targetIndex -= 1;
      }

      rows.splice(
        Math.max(0, Math.min(targetIndex, rows.length)),
        0,
        createRowForPhoto(photo, placement)
      );
    });
  };

  const insertRowAt = (rowId, requestedIndex) => {
    commitChange(() => {
      const sourceIndex = rows.findIndex((row) => row.id === rowId);

      if (sourceIndex < 0) {
        return;
      }

      const [movedRow] = rows.splice(sourceIndex, 1);
      const targetIndex =
        sourceIndex < requestedIndex ? requestedIndex - 1 : requestedIndex;
      rows.splice(Math.max(0, Math.min(targetIndex, rows.length)), 0, movedRow);
    });
  };

  const performPointerDrop = () => {
    if (!dragState || !pointerDropTarget) {
      return;
    }

    if (pointerDropTarget.type === "slot") {
      placePhotoInSlot(
        dragState.photoId,
        pointerDropTarget.rowId,
        pointerDropTarget.slotKey
      );
      return;
    }

    if (pointerDropTarget.type === "photo-insertion") {
      insertPhotoAt(
        dragState.photoId,
        pointerDropTarget.index,
        pointerDropTarget.placement
      );
      return;
    }

    if (pointerDropTarget.type === "row-insertion") {
      insertRowAt(dragState.rowId, pointerDropTarget.index);
      return;
    }

    if (pointerDropTarget.type === "remove") {
      commitChange(() => detachPhoto(dragState.photoId));
    }
  };

  const bindPointerDrag = (element, state, image) => {
    element.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest(".placed-photo-remove")) {
        return;
      }

      pointerCandidate = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        sourceElement: element,
        imageSource: image?.currentSrc || image?.src || "",
        state,
      };

      try {
        element.setPointerCapture(event.pointerId);
      } catch {}
    });
  };

  const handlePointerMove = (event) => {
    if (!pointerCandidate || event.pointerId !== pointerCandidate.pointerId) {
      return;
    }

    if (!dragState) {
      const distance = Math.hypot(
        event.clientX - pointerCandidate.startX,
        event.clientY - pointerCandidate.startY
      );

      if (distance < 6) {
        return;
      }

      activatePointerDrag(pointerCandidate);
    }

    event.preventDefault();
    updateDragGhost(event.clientX, event.clientY);
    updatePointerDropTarget(event);
  };

  const handlePointerEnd = (event) => {
    if (!pointerCandidate || event.pointerId !== pointerCandidate.pointerId) {
      return;
    }

    if (dragState) {
      event.preventDefault();
      performPointerDrop();
    }

    finishDrag();
  };

  const renderLibrary = () => {
    const photos = getCatalog();
    const usedIds = getUsedPhotoIds();
    const visiblePhotos = photos.filter(
      (photo) => libraryFilter === "all" || !usedIds.has(photo.id)
    );
    const availableCount = photos.length - usedIds.size;

    photoLibrary.innerHTML = "";
    libraryCount.textContent = `${availableCount} à placer`;

    if (!visiblePhotos.length) {
      const emptyMessage = document.createElement("p");
      emptyMessage.className = "library-empty";
      emptyMessage.textContent = photos.length
        ? "Toutes les photos sont placées."
        : "Aucune photo pour cet onglet.";
      photoLibrary.appendChild(emptyMessage);
      return;
    }

    visiblePhotos.forEach((photo) => {
      const isUsed = usedIds.has(photo.id);
      const item = document.createElement("button");
      const image = document.createElement("img");
      const format = document.createElement("span");

      item.type = "button";
      item.className = `library-photo${isUsed ? " is-used" : ""}`;
      item.title = photo.filename;
      item.setAttribute(
        "aria-label",
        `${photo.filename}, ${formatPhotoType(photo)}${isUsed ? ", placée" : ""}`
      );
      item.draggable = false;
      item.dataset.photoId = photo.id;

      image.src = photo.src;
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      image.draggable = false;

      format.className = "photo-format";
      format.textContent = formatPhotoType(photo);

      item.append(image, format);

      if (!isUsed) {
        bindPointerDrag(
          item,
          { kind: "photo", photoId: photo.id, source: "library" },
          image
        );
        item.addEventListener("dragstart", (event) => {
          setDragState(
            event,
            { kind: "photo", photoId: photo.id, source: "library" },
            image
          );
        });
        item.addEventListener("dragend", finishDrag);
        item.addEventListener("dblclick", () => {
          const placement = photo.wideOnly ? "full" : photo.kind === "portrait" ? "left" : "full";
          commitChange(() => {
            rows.push(createRowForPhoto(photo, placement));
          });
        });
      }

      photoLibrary.appendChild(item);
    });
  };

  const createPlacedPhoto = (photo, rowId) => {
    const placedPhoto = document.createElement("div");
    const image = document.createElement("img");
    const removeButton = document.createElement("button");

    placedPhoto.className = "placed-photo";
    placedPhoto.draggable = false;
    placedPhoto.dataset.photoId = photo.id;
    placedPhoto.title = photo.filename;

    image.src = photo.src;
    image.alt = "";
    image.draggable = false;

    removeButton.type = "button";
    removeButton.className = "placed-photo-remove";
    removeButton.setAttribute("aria-label", `Retirer ${photo.filename}`);
    removeButton.textContent = "×";
    removeButton.draggable = false;
    removeButton.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      commitChange(() => detachPhoto(photo.id));
    });

    placedPhoto.addEventListener("dragstart", (event) => {
      if (event.target.closest(".placed-photo-remove")) {
        event.preventDefault();
        return;
      }

      setDragState(
        event,
        {
          kind: "photo",
          photoId: photo.id,
          source: "grid",
          sourceRowId: rowId,
        },
        image
      );
    });
    placedPhoto.addEventListener("dragend", finishDrag);
    bindPointerDrag(
      placedPhoto,
      {
        kind: "photo",
        photoId: photo.id,
        source: "grid",
        sourceRowId: rowId,
      },
      image
    );

    placedPhoto.append(image, removeButton);
    return placedPhoto;
  };

  const createLayoutSlot = (row, slotKey, slotKind, emptyLabel) => {
    const slot = document.createElement("div");
    const photoId = getSlotPhotoId(row, slotKey);
    const photo = photoId ? getPhoto(photoId) : null;

    slot.className = `layout-slot${photo ? " is-filled" : ""}`;
    slot.dataset.slotKey = slotKey;
    slot.dataset.slotKind = slotKind;
    slot.dataset.rowId = row.id;

    if (photo) {
      slot.style.setProperty("--slot-ratio", `${photo.width} / ${photo.height}`);
      slot.appendChild(createPlacedPhoto(photo, row.id));
    } else {
      const label = document.createElement("span");
      label.className = "slot-label";
      label.textContent = emptyLabel;
      slot.appendChild(label);
    }

    slot.addEventListener("dragover", (event) => {
      const state = getDragState(event);

      if (!state || state.kind !== "photo") {
        return;
      }

      const draggedPhoto = getPhoto(state.photoId);
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      clearDropVisuals();

      if (canPlacePhotoInSlot(draggedPhoto, row, slotKey)) {
        const dropVisual = canConvertCompositionToPortraitPair(
          draggedPhoto,
          row,
          slotKey
        )
          ? slot.closest(".composition-stack")
          : slot;
        dropVisual?.classList.add("is-drop-active");
      }
    });

    slot.addEventListener("drop", (event) => {
      const state = getDragState(event);

      if (!state || state.kind !== "photo") {
        return;
      }

      event.preventDefault();
      placePhotoInSlot(state.photoId, row.id, slotKey);
      finishDrag();
    });

    return slot;
  };

  const moveRow = (rowId, direction) => {
    const currentIndex = rows.findIndex((row) => row.id === rowId);
    const targetIndex = currentIndex + direction;

    if (
      currentIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= rows.length
    ) {
      return;
    }

    commitChange(() => {
      const [movedRow] = rows.splice(currentIndex, 1);
      rows.splice(targetIndex, 0, movedRow);
    });
  };

  const createRowControls = (row, rowIndex) => {
    const controls = document.createElement("div");
    const dragHandle = document.createElement("button");
    const upButton = document.createElement("button");
    const downButton = document.createElement("button");
    const deleteButton = document.createElement("button");

    controls.className = "row-controls";

    dragHandle.type = "button";
    dragHandle.className = "row-control row-drag-handle";
    dragHandle.setAttribute("aria-label", "Déplacer la rangée");
    dragHandle.title = "Glisser la rangée";
    dragHandle.textContent = "⋮⋮";
    dragHandle.draggable = false;
    bindPointerDrag(dragHandle, { kind: "row", rowId: row.id });
    dragHandle.addEventListener("dragstart", (event) => {
      setDragState(event, { kind: "row", rowId: row.id });
    });
    dragHandle.addEventListener("dragend", finishDrag);

    upButton.type = "button";
    upButton.className = "row-control";
    upButton.setAttribute("aria-label", "Monter la rangée");
    upButton.textContent = "↑";
    upButton.disabled = rowIndex === 0;
    upButton.addEventListener("click", () => moveRow(row.id, -1));

    downButton.type = "button";
    downButton.className = "row-control";
    downButton.setAttribute("aria-label", "Descendre la rangée");
    downButton.textContent = "↓";
    downButton.disabled = rowIndex === rows.length - 1;
    downButton.addEventListener("click", () => moveRow(row.id, 1));

    deleteButton.type = "button";
    deleteButton.className = "row-control";
    deleteButton.setAttribute("aria-label", "Supprimer la rangée");
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", () => {
      commitChange(() => {
        rows = rows.filter((candidate) => candidate.id !== row.id);
      });
    });

    controls.append(dragHandle, upButton, downButton, deleteButton);
    return controls;
  };

  const createLayoutRow = (row, rowIndex) => {
    const rowElement = document.createElement("div");
    const rowErrors = validateRow(row);

    rowElement.className = `layout-row${rowErrors.length ? " is-invalid" : ""}`;
    rowElement.dataset.rowId = row.id;
    rowElement.dataset.rowType = row.type;
    rowElement.title = rowErrors.join(" · ");
    rowElement.appendChild(createRowControls(row, rowIndex));

    if (row.type === "featured") {
      rowElement.appendChild(
        createLayoutSlot(row, "featured", "featured", "Grand format")
      );
      return rowElement;
    }

    if (row.type === "pair") {
      rowElement.append(
        createLayoutSlot(row, "pair:0", "pair", "Photo gauche"),
        createLayoutSlot(row, "pair:1", "pair", "Photo droite")
      );
      return rowElement;
    }

    rowElement.dataset.portraitSide = row.portraitSide;
    const portraitSlot = createLayoutSlot(
      row,
      "portrait",
      "portrait",
      `Portrait ${row.portraitSide === "left" ? "gauche" : "droite"}`
    );
    const landscapeStack = document.createElement("div");
    portraitSlot.classList.add("composition-portrait");
    landscapeStack.className = "composition-stack";
    landscapeStack.append(
      createLayoutSlot(row, "landscape:0", "landscape", "Paysage haut"),
      createLayoutSlot(row, "landscape:1", "landscape", "Paysage bas")
    );
    landscapeStack.addEventListener("dragover", (event) => {
      if (event.target.closest(".layout-slot")) {
        return;
      }

      const state = getDragState(event);
      const photo = state?.kind === "photo" ? getPhoto(state.photoId) : null;
      const liveRow = rows.find((candidate) => candidate.id === row.id);

      if (
        !canConvertCompositionToPortraitPair(
          photo,
          liveRow,
          "landscape:0"
        )
      ) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      clearDropVisuals();
      landscapeStack.classList.add("is-drop-active");
    });
    landscapeStack.addEventListener("drop", (event) => {
      if (event.target.closest(".layout-slot")) {
        return;
      }

      const state = getDragState(event);

      if (!state || state.kind !== "photo") {
        return;
      }

      event.preventDefault();
      placePhotoInSlot(state.photoId, row.id, "landscape:0");
      finishDrag();
    });
    rowElement.append(portraitSlot, landscapeStack);

    return rowElement;
  };

  const getInsertionPlacement = (event, zone, photo) => {
    if (photo.wideOnly) {
      return "full";
    }

    const rect = zone.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / Math.max(rect.width, 1);

    if (photo.kind === "portrait") {
      return relativeX < 0.5 ? "left" : "right";
    }

    if (relativeX < 0.3) {
      return "left";
    }

    if (relativeX > 0.7) {
      return "right";
    }

    return "full";
  };

  const getInsertionLabel = (placement, photo) => {
    if (placement === "full") {
      return "Grand format";
    }

    const side = placement === "left" ? "gauche" : "droite";
    return photo.kind === "portrait"
      ? `Portrait à ${side}`
      : `Petite photo à ${side}`;
  };

  const createRowForPhoto = (photo, placement) => {
    if (placement === "full" || photo.wideOnly) {
      return {
        id: createRowId(),
        type: "featured",
        photo: photo.id,
      };
    }

    if (photo.kind === "portrait") {
      return {
        id: createRowId(),
        type: "composition",
        portraitSide: placement,
        portrait: photo.id,
        landscapes: [null, null],
      };
    }

    return {
      id: createRowId(),
      type: "pair",
      photos: placement === "left" ? [photo.id, null] : [null, photo.id],
    };
  };

  const createInsertionZone = (insertionIndex, isEmptyCanvas = false) => {
    const zone = document.createElement("div");
    const preview = document.createElement("span");

    zone.className = `insertion-zone${isEmptyCanvas ? " is-empty-canvas" : ""}`;
    zone.dataset.insertionIndex = String(insertionIndex);
    preview.className = "insertion-preview";
    zone.appendChild(preview);

    if (isEmptyCanvas) {
      const emptyCopy = document.createElement("p");
      emptyCopy.className = "canvas-empty-copy";
      emptyCopy.textContent = "Glisse une photo ici pour commencer.";
      zone.appendChild(emptyCopy);
    }

    zone.addEventListener("dragover", (event) => {
      const state = getDragState(event);

      if (!state) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      clearDropVisuals();

      if (state.kind === "row") {
        zone.dataset.preview = "row";
        preview.textContent = "Déplacer la rangée";
        return;
      }

      const photo = getPhoto(state.photoId);

      if (!photo) {
        return;
      }

      const placement = getInsertionPlacement(event, zone, photo);
      zone.dataset.preview = placement;
      preview.textContent = getInsertionLabel(placement, photo);
    });

    zone.addEventListener("drop", (event) => {
      const state = getDragState(event);

      if (!state) {
        return;
      }

      event.preventDefault();
      const requestedIndex = Number(zone.dataset.insertionIndex);

      if (state.kind === "row") {
        insertRowAt(state.rowId, requestedIndex);
        finishDrag();
        return;
      }

      const photo = getPhoto(state.photoId);

      if (!photo) {
        finishDrag();
        return;
      }

      const placement = getInsertionPlacement(event, zone, photo);
      insertPhotoAt(photo.id, requestedIndex, placement);
      finishDrag();
    });

    return zone;
  };

  const renderCanvas = () => {
    layoutCanvas.innerHTML = "";

    if (!rows.length) {
      layoutCanvas.appendChild(createInsertionZone(0, true));
      placedCount.textContent = "0 photo placée";
      return;
    }

    rows.forEach((row, index) => {
      layoutCanvas.appendChild(createInsertionZone(index));
      layoutCanvas.appendChild(createLayoutRow(row, index));
    });
    layoutCanvas.appendChild(createInsertionZone(rows.length));

    const usedCount = getUsedPhotoIds().size;
    placedCount.textContent = `${usedCount} photo${usedCount > 1 ? "s" : ""} placée${
      usedCount > 1 ? "s" : ""
    }`;
  };

  const renderEditor = () => {
    renderCanvas();
    renderLibrary();
    undoButton.disabled = history.length === 0;
  };

  const switchCollection = (collectionKey) => {
    if (!COLLECTIONS[collectionKey]) {
      return;
    }

    currentCollection = collectionKey;
    collectionSelect.value = collectionKey;
    rows = loadRowsFromStorage(collectionKey);
    history = [];
    window.localStorage.setItem(SELECTED_COLLECTION_KEY, collectionKey);
    setSaveStatus("Sauvegardé");
    renderEditor();
  };

  const serializeRowsForExport = () =>
    rows.map((row) => {
      if (row.type === "featured") {
        return { type: "featured", photo: row.photo };
      }

      if (row.type === "pair") {
        return { type: "pair", photos: [...row.photos] };
      }

      return {
        type: "composition",
        portrait: row.portrait,
        landscapes: [...row.landscapes],
        portraitSide: row.portraitSide,
      };
    });

  const exportLayout = () => {
    const validationErrors = validateLayout();
    const usedIds = getUsedPhotoIds();
    const unplaced = getCatalog()
      .filter((photo) => !usedIds.has(photo.id))
      .map((photo) => photo.id);
    const exportPayload = {
      version: 1,
      collection: currentCollection,
      collectionLabel: COLLECTIONS[currentCollection].label,
      status: validationErrors.length ? "draft" : "ready",
      collections: {
        [currentCollection]: serializeRowsForExport(),
      },
      unplaced,
      warnings: validationErrors,
    };
    const blob = new Blob([`${JSON.stringify(exportPayload, null, 2)}\n`], {
      type: "application/json",
    });
    const objectUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");

    downloadLink.href = objectUrl;
    downloadLink.download = `photo-layout-${currentCollection}.json`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);

    showMessage(
      validationErrors.length
        ? `Plan exporté avec ${validationErrors.length} point${
            validationErrors.length > 1 ? "s" : ""
          } à compléter.`
        : "Plan exporté."
    );
  };

  const getImportedRows = (payload) => {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    if (payload.collections?.[currentCollection]) {
      return payload.collections[currentCollection];
    }

    if (payload.collection === currentCollection && Array.isArray(payload.rows)) {
      return payload.rows;
    }

    return null;
  };

  const validateImportedRows = (candidateRows) => {
    if (!Array.isArray(candidateRows)) {
      return null;
    }

    const importedRows = sanitizeRows(candidateRows);

    if (importedRows.length !== candidateRows.length) {
      return null;
    }

    const knownIds = new Set(getCatalog().map((photo) => photo.id));
    const seenIds = new Set();

    for (const row of importedRows) {
      for (const photoId of getRowPhotoIds(row)) {
        if (!knownIds.has(photoId) || seenIds.has(photoId)) {
          return null;
        }

        seenIds.add(photoId);
      }
    }

    return importedRows;
  };

  const importLayout = async (file) => {
    try {
      const payload = JSON.parse(await file.text());
      const candidateRows = getImportedRows(payload);
      const importedRows = validateImportedRows(candidateRows);

      if (!importedRows) {
        throw new Error("Plan incompatible");
      }

      commitChange(() => {
        rows = importedRows;
      }, "Plan importé.");
    } catch {
      showMessage("Ce fichier ne correspond pas à l’onglet sélectionné.");
    } finally {
      importFile.value = "";
    }
  };

  const autoScrollPanel = (panel, event) => {
    const rect = panel.getBoundingClientRect();
    const edgeSize = 64;

    if (event.clientY < rect.top + edgeSize) {
      panel.scrollBy(0, -14);
    } else if (event.clientY > rect.bottom - edgeSize) {
      panel.scrollBy(0, 14);
    }
  };

  const bindStaticEvents = () => {
    collectionSelect.addEventListener("change", () => {
      switchCollection(collectionSelect.value);
    });

    libraryFilters.forEach((button) => {
      button.addEventListener("click", () => {
        libraryFilter = button.dataset.libraryFilter;
        libraryFilters.forEach((candidate) => {
          candidate.classList.toggle("is-active", candidate === button);
        });
        renderLibrary();
      });
    });

    undoButton.addEventListener("click", () => {
      const previousRows = history.pop();

      if (!previousRows) {
        return;
      }

      rows = previousRows;
      saveRowsToStorage();
      renderEditor();
    });

    importButton.addEventListener("click", () => importFile.click());
    importFile.addEventListener("change", () => {
      const [file] = importFile.files;

      if (file) {
        void importLayout(file);
      }
    });
    exportButton.addEventListener("click", exportLayout);

    resetButton.addEventListener("click", () => {
      if (!rows.length) {
        return;
      }

      if (!resetArmed) {
        resetArmed = true;
        resetButton.textContent = "Confirmer";
        window.clearTimeout(resetConfirmationTimer);
        resetConfirmationTimer = window.setTimeout(() => {
          resetArmed = false;
          resetButton.textContent = "Réinitialiser";
        }, 3000);
        return;
      }

      window.clearTimeout(resetConfirmationTimer);
      resetArmed = false;
      resetButton.textContent = "Réinitialiser";
      commitChange(() => {
        rows = [];
      }, "Grille réinitialisée.");
    });

    libraryReturnZone.addEventListener("dragover", (event) => {
      const state = getDragState(event);

      if (!state || state.kind !== "photo" || state.source !== "grid") {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      libraryReturnZone.classList.add("is-drop-active");
    });
    libraryReturnZone.addEventListener("dragleave", () => {
      libraryReturnZone.classList.remove("is-drop-active");
    });
    libraryReturnZone.addEventListener("drop", (event) => {
      const state = getDragState(event);

      if (!state || state.kind !== "photo" || state.source !== "grid") {
        return;
      }

      event.preventDefault();
      commitChange(() => detachPhoto(state.photoId));
      finishDrag();
    });

    canvasPanel.addEventListener("dragover", (event) => {
      if (getDragState(event)) {
        autoScrollPanel(canvasPanel, event);
      }
    });
    photoLibrary.addEventListener("dragover", (event) => {
      if (getDragState(event)) {
        autoScrollPanel(photoLibrary, event);
      }
    });

    window.addEventListener("dragend", finishDrag);
    window.addEventListener("drop", () => {
      window.setTimeout(finishDrag, 0);
    });
    window.addEventListener("pointermove", handlePointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", handlePointerEnd, {
      passive: false,
    });
    window.addEventListener("pointercancel", finishDrag);
  };

  const initializeEditor = async () => {
    bindStaticEvents();

    try {
      await loadPhotoCatalog();
      const savedCollection = window.localStorage.getItem(
        SELECTED_COLLECTION_KEY
      );
      switchCollection(
        savedCollection && COLLECTIONS[savedCollection]
          ? savedCollection
          : currentCollection
      );
    } catch {
      setSaveStatus("Photos indisponibles");
      layoutCanvas.innerHTML =
        '<p class="loading-error">Ouvre cet outil depuis le serveur local du site pour charger les photos.</p>';
      photoLibrary.innerHTML =
        '<p class="loading-error">Impossible de lire photography.html.</p>';
      exportButton.disabled = true;
    }
  };

  void initializeEditor();
})();
