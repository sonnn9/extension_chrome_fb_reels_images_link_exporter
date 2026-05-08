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
    config: {
      delayMs: 1800,
      maxScrolls: 200,
      idleRounds: 4,
      clearPrevious: true
    }
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function isFacebookReelsPage() {
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

  function normalizeFacebookUrl(rawHref) {
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

      // Drop tracking parameters/hash for cleaner CSV output.
      url.search = "";
      url.hash = "";
      url.pathname = path || "/";
      return url.toString();
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

  function collectLinks() {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    let newCount = 0;

    for (const anchor of anchors) {
      const normalized = normalizeFacebookUrl(anchor.href);
      if (!normalized) continue;

      if (!state.results.has(normalized)) {
        const url = new URL(normalized);
        state.results.set(normalized, {
          reel_url: normalized,
          reel_id: reelIdFromPath(url.pathname),
          label: guessLabel(anchor),
          collected_from: location.href,
          collected_at: new Date().toISOString()
        });
        newCount += 1;
        state.lastAddedAt = new Date().toISOString();
      }
    }

    return newCount;
  }

  async function autoScan(config = {}) {
    if (state.scanning) {
      return { ok: false, message: "Đang quét rồi." };
    }

    state.config = {
      ...state.config,
      ...config,
      delayMs: Number(config.delayMs || state.config.delayMs),
      maxScrolls: Number(config.maxScrolls || state.config.maxScrolls),
      idleRounds: Number(config.idleRounds || state.config.idleRounds),
      clearPrevious: config.clearPrevious !== false
    };

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

    // Initial collect before scrolling.
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

        // Nudge once more in case Facebook lazy-loads a bit later.
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

        // If height no longer grows and no new links appear for several rounds, stop.
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
    return {
      url: location.href,
      isReelsPage: isFacebookReelsPage(),
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
        console.error("FB reel exporter scan failed:", error);
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
