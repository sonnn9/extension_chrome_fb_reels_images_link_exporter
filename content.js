(() => {
  if (window.__fbReelExporterLoaded) return;
  window.__fbReelExporterLoaded = true;

  const state = {
    scanning: false,
    stopRequested: false,
    results: new Map(),
    scrollCount: 0,
    startedAt: null,
    finishedAt: null,
    lastAddedAt: null,
    resolvedMode: "reels",
    config: {
      mode: "auto",
      delayMs: 1800,
      maxScrolls: 200,
      idleRounds: 4,
      clearPrevious: true
    }
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function detectModeFromUrl(href = location.href) {
    try {
      const url = new URL(href);
      const sk = (url.searchParams.get("sk") || "").toLowerCase();
      const path = url.pathname.toLowerCase();

      if (
        sk === "photos" ||
        sk === "photos_albums" ||
        sk === "photos_of" ||
        sk === "photos_by" ||
        /\/photos(_of|_albums|_by)?\b/.test(path) ||
        /\/photo(\.php)?\b/.test(path) ||
        /\/media\/set\b/.test(path)
      ) {
        return "images";
      }

      if (
        sk === "reels" ||
        /\/reels?\b/.test(path) ||
        /\/videos\b/.test(path) ||
        /\/share\/r\b/.test(path)
      ) {
        return "reels";
      }
    } catch {}
    return "reels";
  }

  function effectiveMode() {
    return state.config.mode === "auto" ? detectModeFromUrl() : state.config.mode;
  }

  function isMatchingPage() {
    const mode = effectiveMode();
    if (mode === "images") {
      const url = new URL(location.href);
      const sk = (url.searchParams.get("sk") || "").toLowerCase();
      return (
        sk === "photos" ||
        sk === "photos_albums" ||
        sk === "photos_of" ||
        sk === "photos_by" ||
        /\/photos\b/i.test(url.pathname) ||
        /\/photo(\.php)?\b/i.test(url.pathname) ||
        /\/media\/set\b/i.test(url.pathname)
      );
    }
    return /facebook\.com\/.+\/reels\/?/i.test(location.href) || /facebook\.com\/reel\//i.test(location.href);
  }

  function reelIdFromPath(pathname) {
    const reelMatch = pathname.match(/\/reel\/(\d+)/i);
    if (reelMatch) return reelMatch[1];

    const reelsMatch = pathname.match(/\/reels\/(\d+)/i);
    if (reelsMatch) return reelsMatch[1];

    const videosMatch = pathname.match(/\/videos\/(\d+)/i);
    if (videosMatch) return videosMatch[1];

    return "";
  }

  function normalizeReelUrl(rawHref) {
    try {
      const url = new URL(rawHref, location.origin);
      if (!/facebook\.com$/i.test(url.hostname.replace(/^www\./i, ""))) return null;

      const path = url.pathname.replace(/\/+$/, "");
      const looksLikeReel =
        /\/reel\//i.test(path) ||
        /\/reels\//i.test(path) ||
        /\/videos\//i.test(path) ||
        /\/share\/r\//i.test(path);

      if (!looksLikeReel) return null;

      url.search = "";
      url.hash = "";
      url.pathname = path || "/";
      return url.toString();
    } catch {
      return null;
    }
  }

  function photoIdFromUrl(url) {
    const fbid = url.searchParams.get("fbid");
    if (fbid && /^\d{6,}$/.test(fbid)) return fbid;

    const path = url.pathname;
    let m = path.match(/\/photos\/(?:[^/]+\/)*?(\d{8,})(?:\/|$)/i);
    if (m) return m[1];

    m = path.match(/\/photo\/?(?:\.php)?\/(\d{8,})/i);
    if (m) return m[1];

    return "";
  }

  function normalizeImageUrl(rawHref) {
    try {
      const url = new URL(rawHref, location.origin);
      if (!/facebook\.com$/i.test(url.hostname.replace(/^www\./i, ""))) return null;

      const path = url.pathname.toLowerCase();
      const looksLikePhoto =
        /^\/photo\.php$/.test(path) ||
        /^\/photo\/?$/.test(path) ||
        /\/photos\//.test(path) ||
        /\/media\/set\//.test(path);

      if (!looksLikePhoto) return null;

      const id = photoIdFromUrl(url);
      if (!id) return null;

      const normalized = new URL("/photo/", url.origin);
      normalized.searchParams.set("fbid", id);
      const set = url.searchParams.get("set");
      if (set) normalized.searchParams.set("set", set);
      return normalized.toString();
    } catch {
      return null;
    }
  }

  function cleanText(value) {
    return (value || "")
      .replace(/\s+/g, " ")
      .replace(/^[\s\-–—|]+|[\s\-–—|]+$/g, "")
      .trim();
  }

  function guessLabel(anchor) {
    const candidates = [
      anchor.getAttribute("aria-label"),
      anchor.textContent,
      anchor.querySelector("img")?.getAttribute("alt"),
      anchor.closest('[role="article"]')?.textContent,
      anchor.closest('[data-pagelet]')?.textContent
    ];

    for (const candidate of candidates) {
      const text = cleanText(candidate);
      if (text) return text.slice(0, 160);
    }

    return "";
  }

  function extractImageSrc(anchor) {
    const img = anchor.querySelector("img");
    if (!img) return "";
    const src = img.currentSrc || img.src || img.getAttribute("data-src") || "";
    if (!src) return "";
    if (src.startsWith("data:")) return "";
    return src;
  }

  function collectReelLinks() {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    let newCount = 0;

    for (const anchor of anchors) {
      const normalized = normalizeReelUrl(anchor.href);
      if (!normalized) continue;

      if (!state.results.has(normalized)) {
        const url = new URL(normalized);
        state.results.set(normalized, {
          item_url: normalized,
          item_id: reelIdFromPath(url.pathname),
          type: "reel",
          label: guessLabel(anchor),
          image_url: "",
          collected_from: location.href,
          collected_at: new Date().toISOString()
        });
        newCount += 1;
        state.lastAddedAt = new Date().toISOString();
      }
    }

    return newCount;
  }

  function collectImageLinks() {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    let newCount = 0;

    for (const anchor of anchors) {
      const normalized = normalizeImageUrl(anchor.href);
      if (!normalized) continue;

      const existing = state.results.get(normalized);
      const imageSrc = extractImageSrc(anchor);

      if (!existing) {
        const url = new URL(normalized);
        state.results.set(normalized, {
          item_url: normalized,
          item_id: url.searchParams.get("fbid") || "",
          type: "image",
          label: guessLabel(anchor),
          image_url: imageSrc,
          collected_from: location.href,
          collected_at: new Date().toISOString()
        });
        newCount += 1;
        state.lastAddedAt = new Date().toISOString();
      } else if (!existing.image_url && imageSrc) {
        existing.image_url = imageSrc;
      }
    }

    return newCount;
  }

  function collectLinks() {
    return state.resolvedMode === "images" ? collectImageLinks() : collectReelLinks();
  }

  async function autoScan(config = {}) {
    if (state.scanning) {
      return { ok: false, message: "Đang quét rồi." };
    }

    state.config = {
      ...state.config,
      ...config,
      mode: config.mode || state.config.mode || "auto",
      delayMs: Number(config.delayMs || state.config.delayMs),
      maxScrolls: Number(config.maxScrolls || state.config.maxScrolls),
      idleRounds: Number(config.idleRounds || state.config.idleRounds),
      clearPrevious: config.clearPrevious !== false
    };

    state.resolvedMode = effectiveMode();

    if (state.config.clearPrevious) {
      state.results.clear();
      state.scrollCount = 0;
      state.finishedAt = null;
      state.lastAddedAt = null;
    }

    state.startedAt = new Date().toISOString();
    state.stopRequested = false;
    state.scanning = true;

    let idleRounds = 0;
    let previousHeight = 0;

    const initialNew = collectLinks();
    if (initialNew === 0) {
      await sleep(800);
      collectLinks();
    }

    try {
      for (let i = 0; i < state.config.maxScrolls; i += 1) {
        if (state.stopRequested) break;

        const beforeCount = state.results.size;
        const targetHeight = Math.max(
          document.documentElement.scrollHeight,
          document.body?.scrollHeight || 0,
          previousHeight
        );

        window.scrollTo({ top: targetHeight, behavior: "smooth" });
        state.scrollCount += 1;
        previousHeight = targetHeight;

        await sleep(state.config.delayMs);

        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
        await sleep(Math.max(300, Math.round(state.config.delayMs * 0.35)));

        const added = collectLinks();
        const afterCount = state.results.size;

        if (added <= 0 && afterCount === beforeCount) {
          idleRounds += 1;
        } else {
          idleRounds = 0;
        }

        const newHeight = Math.max(
          document.documentElement.scrollHeight,
          document.body?.scrollHeight || 0
        );

        if (idleRounds >= state.config.idleRounds && newHeight <= previousHeight + 8) {
          break;
        }

        previousHeight = Math.max(previousHeight, newHeight);
      }
    } finally {
      state.scanning = false;
      state.finishedAt = new Date().toISOString();
    }

    return {
      ok: true,
      message: state.stopRequested ? "Đã dừng quét." : "Quét xong.",
      stats: getStatus()
    };
  }

  function getStatus() {
    const resolved = state.scanning ? state.resolvedMode : effectiveMode();
    return {
      url: location.href,
      mode: state.config.mode,
      resolvedMode: resolved,
      isMatchingPage: isMatchingPage(),
      isReelsPage: resolved === "reels"
        ? (/facebook\.com\/.+\/reels\/?/i.test(location.href) || /facebook\.com\/reel\//i.test(location.href))
        : false,
      scanning: state.scanning,
      stopRequested: state.stopRequested,
      foundCount: state.results.size,
      scrollCount: state.scrollCount,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
      lastAddedAt: state.lastAddedAt,
      config: state.config,
      preview: Array.from(state.results.values()).slice(0, 20)
    };
  }

  function getResults() {
    return Array.from(state.results.values());
  }

  function stopScan() {
    state.stopRequested = true;
    return { ok: true, message: "Đã gửi lệnh dừng." };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return;

    if (message.type === "FB_REEL_EXPORTER_START") {
      autoScan(message.config).catch((error) => {
        console.error("FB exporter scan failed:", error);
      });
      sendResponse({ ok: true, message: "Đã bắt đầu quét." });
      return false;
    }

    if (message.type === "FB_REEL_EXPORTER_STOP") {
      sendResponse(stopScan());
      return false;
    }

    if (message.type === "FB_REEL_EXPORTER_STATUS") {
      sendResponse({ ok: true, status: getStatus() });
      return false;
    }

    if (message.type === "FB_REEL_EXPORTER_RESULTS") {
      sendResponse({ ok: true, results: getResults() });
      return false;
    }
  });
})();
