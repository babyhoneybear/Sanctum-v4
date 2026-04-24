// == Sticker System ==
const STICKER_PACKS = {
  nature: ["🌸","🌿","🍃","🌺","🌻","🍄","🌙","⭐","🌊","🌈","🦋","🌷","🍀","🌱","🌾"],
  space:  ["🪐","✨","🌟","🚀","🌌","☄️","🌙","💫","🛸","🌠","⚡","🌑","🔭","💥","🪨"],
  mood:   ["💛","🖤","🤍","💜","🩷","💙","🫧","🌫️","🕯️","🫀","🧠","👁️","🫶","💤","✌️"],
  study:  ["📚","✏️","📝","🖊️","📌","📎","🗒️","💡","🔍","📐","📏","🗓️","⏰","☕","🎯"],
};

let stickerPanelOpen = false;
let activeStickerBook = "nature";
let customStickers = normalizeCustomStickerList(
  (typeof readStorageJSON === "function" && window.STORAGE_KEYS)
    ? readStorageJSON(STORAGE_KEYS.customStickers, [])
    : JSON.parse(localStorage.getItem("sanctum_custom_stickers") || "[]")
);

function normalizeCustomStickerList(list) {
  return Array.isArray(list)
    ? list.filter(src => typeof src === "string" && src.trim())
    : [];
}

function normalizeStickerRecord(data = {}) {
  return {
    emoji: typeof data.emoji === "string" ? data.emoji : "",
    imgSrc: typeof data.imgSrc === "string" ? data.imgSrc : "",
    x: typeof data.x === "string" ? data.x : "0px",
    y: typeof data.y === "string" ? data.y : "0px",
    w: typeof data.w === "string" ? data.w : "80px",
    h: typeof data.h === "string" ? data.h : "80px",
    rotation: typeof data.rotation === "string" ? data.rotation : "0",
    zIndex: typeof data.zIndex === "string" ? data.zIndex : "10",
    locked: data.locked === "true" ? "true" : "false"
  };
}

function saveCustomStickers() {
  customStickers = normalizeCustomStickerList(customStickers);

  if (typeof writeStorageJSON === "function" && window.STORAGE_KEYS) {
    writeStorageJSON(STORAGE_KEYS.customStickers, customStickers);
  } else {
    localStorage.setItem("sanctum_custom_stickers", JSON.stringify(customStickers));
  }
}

function openStickerPanel() {
  const panel = document.getElementById("stickerPanel");
  if (!panel) return;

  stickerPanelOpen = true;

  if (typeof openPanel === "function") {
    openPanel("stickerPanel", panel);
  } else {
    panel.classList.add("open");
  }

  renderStickerGrid(activeStickerBook);
}

function closeStickerPanel() {
  stickerPanelOpen = false;
  document.getElementById("stickerPanel")?.classList.remove("open");

  if (typeof setUIState === "function") {
    const state = getUIState?.();
    if (state?.openPanel === "stickerPanel") {
      setUIState({ openPanel: null });
    }
  }
}

function renderStickerGrid(book) {
  const grid = document.getElementById("stickerGrid");
  const uploadWrap = document.getElementById("stickerUploadWrap");
  if (!grid) return;
  grid.innerHTML = "";

  if (book === "custom") {
    uploadWrap.style.display = "";
    if (!customStickers.length) {
      grid.innerHTML = `<div class="sticker-empty">No stickers yet. Upload some!</div>`;
      return;
    }
    customStickers.forEach((src, i) => {
      const item = document.createElement("div");
      item.className = "sticker-grid-item";
      item.innerHTML = `<img src="${src}" />`;
      item.addEventListener("click", () => placeSticker(null, src));
      grid.appendChild(item);
    });
  } else {
    uploadWrap.style.display = "none";
    const emojis = STICKER_PACKS[book] || [];
    emojis.forEach(emoji => {
      const item = document.createElement("div");
      item.className = "sticker-grid-item";
      item.textContent = emoji;
      item.addEventListener("click", () => placeSticker(emoji, null));
      grid.appendChild(item);
    });
  }
}

function placeSticker(emoji, imgSrc) {
  const canvas = document.getElementById("pageCanvas");
  if (!canvas) return;

  const sticker = document.createElement("div");
  sticker.className = "sticker";
  sticker.dataset.locked = "false";
  sticker.dataset.rotation = "0";

  const canvasRect = canvas.getBoundingClientRect();
  const x = Math.round(canvasRect.width / 2 - 40);
  const y = Math.round(canvas.scrollTop + canvasRect.height / 2 - 40);

  sticker.style.left = `${x}px`;
  sticker.style.top = `${y}px`;
  sticker.style.width = "80px";
  sticker.style.height = "80px";

  // inner wrap — this is what rotates
  const inner = document.createElement("div");
  inner.className = "sticker-inner";

  if (emoji) {
    sticker.dataset.emoji = emoji;
    inner.innerHTML = `<span class="sticker-emoji">${emoji}</span>`;
  } else if (imgSrc) {
    sticker.dataset.imgSrc = imgSrc;
    inner.innerHTML = `<img src="${imgSrc}" class="sticker-img" />`;
  }

  sticker.appendChild(inner);

  // handles — outside inner so they don't rotate
  sticker.innerHTML += `
    <div class="sticker-resize-handle"></div>
    <div class="sticker-rotate-handle">↻</div>
    <button class="sticker-menu-toggle" title="Sticker options">⋯</button>
    <div class="sticker-menu">
      <button class="sticker-ctrl" data-action="front" title="Bring to front">Move Up</button>
      <button class="sticker-ctrl" data-action="back" title="Send to back">Move Down</button>
      <button class="sticker-ctrl" data-action="lock" title="Lock">Lock</button>
      <button class="sticker-ctrl danger" data-action="delete" title="Delete">Delete</button>
    </div>
  `;

  canvas.appendChild(sticker);
  syncStickerVisualSize(sticker);
  initSticker(sticker);
  saveStickers();
  closeStickerPanel();
}

function syncStickerVisualSize(sticker) {
  const emojiEl = sticker.querySelector(".sticker-emoji");
  if (!emojiEl) return;

  const w = parseFloat(sticker.style.width) || sticker.getBoundingClientRect().width;
  const h = parseFloat(sticker.style.height) || sticker.getBoundingClientRect().height;
  const size = Math.max(18, Math.round(Math.min(w, h) * 0.72));
  emojiEl.style.fontSize = `${size}px`;
}

function initSticker(sticker) {
  let isDragging = false;
  let isResizing = false;
  let isRotating = false;
  let startX, startY, startW, startH, startLeft, startTop;
  let startAngle, startRotation;

  const getInner = () => sticker.querySelector(".sticker-inner");

  // drag
  sticker.addEventListener("mousedown", (e) => {
    if (sticker.dataset.locked === "true") return;
    if (e.target.closest(".sticker-resize-handle") || e.target.closest(".sticker-rotate-handle") || e.target.closest(".sticker-menu") || e.target.closest(".sticker-menu-toggle")) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = parseInt(sticker.style.left || "0");
    startTop = parseInt(sticker.style.top || "0");
    sticker.classList.add("dragging");
    e.preventDefault();
    e.stopPropagation();
  });

  const onMouseMove = (e) => {
    if (isDragging) {
      sticker.style.left = `${startLeft + e.clientX - startX}px`;
      sticker.style.top = `${startTop + e.clientY - startY}px`;
    }
    if (isResizing) {
      const newW = Math.max(32, startW + e.clientX - startX);
      const newH = Math.max(32, startH + e.clientY - startY);
      sticker.style.width = `${newW}px`;
      sticker.style.height = `${newH}px`;
      syncStickerVisualSize(sticker);
    }
    if (isRotating) {
      const rect = sticker.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
      const newRotation = angle - startAngle + startRotation;
      sticker.dataset.rotation = newRotation;
      const inner = getInner();
      if (inner) inner.style.transform = `rotate(${newRotation}deg)`;
    }
  };

  const onMouseUp = () => {
    if (isDragging || isResizing || isRotating) {
      isDragging = false;
      isResizing = false;
      isRotating = false;
      sticker.classList.remove("dragging");
      saveStickers();
    }
  };

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);

  // resize
  sticker.querySelector(".sticker-resize-handle")?.addEventListener("mousedown", (e) => {
    if (sticker.dataset.locked === "true") return;
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    startW = parseInt(sticker.style.width || "80");
    startH = parseInt(sticker.style.height || "80");
    e.preventDefault();
    e.stopPropagation();
  });

  // rotate
  sticker.querySelector(".sticker-rotate-handle")?.addEventListener("mousedown", (e) => {
    if (sticker.dataset.locked === "true") return;
    isRotating = true;
    const rect = sticker.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    startRotation = parseFloat(sticker.dataset.rotation || "0");
    e.preventDefault();
    e.stopPropagation();
  });

  // toolbar controls
  sticker.addEventListener("click", (e) => {
    const menuToggle = e.target.closest(".sticker-menu-toggle");
    if (menuToggle) {
      e.stopPropagation();
      sticker.classList.toggle("menu-open");
      return;
    }

    const action = e.target.closest(".sticker-ctrl")?.dataset.action;
    if (!action) return;
    e.stopPropagation();

    if (action === "delete") { sticker.remove(); saveStickers(); return; }
    if (action === "front") { sticker.style.zIndex = String(getMaxStickerZ() + 1); saveStickers(); }
    if (action === "back") { sticker.style.zIndex = "1"; saveStickers(); }
    if (action === "lock") {
      const locked = sticker.dataset.locked === "true";
      sticker.dataset.locked = locked ? "false" : "true";
      sticker.classList.toggle("locked", !locked);
      const btn = sticker.querySelector('[data-action="lock"]');
      if (btn) btn.textContent = locked ? "Lock" : "Unlock";
      saveStickers();
    }
    sticker.classList.remove("menu-open");
  });

  document.addEventListener("click", (e) => {
    if (!sticker.contains(e.target)) sticker.classList.remove("menu-open");
  });
}

function getMaxStickerZ() {
  let max = 10;
  document.querySelectorAll(".sticker").forEach(s => {
    const z = parseInt(s.style.zIndex || "0");
    if (z > max) max = z;
  });
  return max;
}

function saveStickers() {
  const stickers = [];
  document.querySelectorAll(".sticker").forEach(s => {
    stickers.push(normalizeStickerRecord({
      emoji: s.dataset.emoji || "",
      imgSrc: s.dataset.imgSrc || "",
      x: s.style.left,
      y: s.style.top,
      w: s.style.width,
      h: s.style.height,
      rotation: s.dataset.rotation || "0",
      zIndex: s.style.zIndex || "10",
      locked: s.dataset.locked || "false",
    }));
  });
  const all = (typeof readStorageJSON === "function" && window.STORAGE_KEYS)
  ? readStorageJSON(STORAGE_KEYS.stickers, {})
  : JSON.parse(localStorage.getItem("sanctum_stickers") || "{}");
  all[currentPageId] = stickers;
    if (typeof writeStorageJSON === "function" && window.STORAGE_KEYS) {
    writeStorageJSON(STORAGE_KEYS.stickers, all);
  } else {
    localStorage.setItem("sanctum_stickers", JSON.stringify(all));
  }
}

function loadStickers(pageId) {
  document.querySelectorAll(".sticker").forEach(s => s.remove());
    const all = (typeof readStorageJSON === "function" && window.STORAGE_KEYS)
    ? readStorageJSON(STORAGE_KEYS.stickers, {})
    : JSON.parse(localStorage.getItem("sanctum_stickers") || "{}");
  const stickers = Array.isArray(all[pageId])
    ? all[pageId].map(normalizeStickerRecord)
    : [];
  stickers.forEach(data => {
    const sticker = document.createElement("div");
    sticker.className = "sticker";
    sticker.dataset.locked = data.locked || "false";
    if (data.locked === "true") sticker.classList.add("locked");
    sticker.style.left = data.x;
    sticker.style.top = data.y;
    sticker.style.width = data.w;
    sticker.style.height = data.h;
    sticker.style.transform = data.transform;
    sticker.style.zIndex = data.zIndex || "10";

    sticker.dataset.rotation = data.rotation || "0";

    const inner = document.createElement("div");
    inner.className = "sticker-inner";
    inner.style.transform = `rotate(${data.rotation || 0}deg)`;

    if (data.emoji) {
      sticker.dataset.emoji = data.emoji;
      inner.innerHTML = `<span class="sticker-emoji">${data.emoji}</span>`;
    } else if (data.imgSrc) {
      sticker.dataset.imgSrc = data.imgSrc;
      inner.innerHTML = `<img src="${data.imgSrc}" class="sticker-img" />`;
    }

    sticker.appendChild(inner);
    sticker.innerHTML += `
      <div class="sticker-resize-handle"></div>
      <div class="sticker-rotate-handle">↻</div>
      <button class="sticker-menu-toggle" title="Sticker options">⋯</button>
      <div class="sticker-menu">
        <button class="sticker-ctrl" data-action="front" title="Bring to front">Move Up</button>
        <button class="sticker-ctrl" data-action="back" title="Send to back">Move Down</button>
        <button class="sticker-ctrl" data-action="lock" title="Lock">${data.locked === "true" ? "Unlock" : "Lock"}</button>
        <button class="sticker-ctrl danger" data-action="delete" title="Delete">Delete</button>
      </div>
    `;

    document.getElementById("pageCanvas").appendChild(sticker);
    syncStickerVisualSize(sticker);
    initSticker(sticker);
  });
}

// sticker panel tabs
document.getElementById("stickerBooks")?.addEventListener("click", (e) => {
  const tab = e.target.closest(".sticker-book-tab");
  if (!tab) return;
  document.querySelectorAll(".sticker-book-tab").forEach(t => t.classList.remove("active"));
  tab.classList.add("active");
  activeStickerBook = tab.dataset.book;
  renderStickerGrid(activeStickerBook);
});

document.getElementById("stickerPanelClose")?.addEventListener("click", closeStickerPanel);
document.getElementById("toolSticker")?.addEventListener("click", () => {
  stickerPanelOpen ? closeStickerPanel() : openStickerPanel();
});

// upload sticker
document.getElementById("stickerUploadBtn")?.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      customStickers.push(ev.target.result);
      saveCustomStickers();
      renderStickerGrid("custom");
    };
    reader.readAsDataURL(file);
  };
  input.click();
});


