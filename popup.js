const el = {
  mode: document.getElementById('mode'),
  delayMs: document.getElementById('delayMs'),
  maxScrolls: document.getElementById('maxScrolls'),
  idleRounds: document.getElementById('idleRounds'),
  clearPrevious: document.getElementById('clearPrevious'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  exportBtn: document.getElementById('exportBtn'),
  copyBtn: document.getElementById('copyBtn'),
  hint: document.getElementById('hint'),
  pageUrl: document.getElementById('pageUrl'),
  scanState: document.getElementById('scanState'),
  foundCount: document.getElementById('foundCount'),
  scrollCount: document.getElementById('scrollCount'),
  lastAddedAt: document.getElementById('lastAddedAt'),
  preview: document.getElementById('preview')
};

let pollTimer = null;

function setHint(message, isError = false) {
  el.hint.textContent = message || '';
  el.hint.style.color = isError ? '#b91c1c' : '#374151';
}

function csvEscape(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows) {
  const headers = ['index', 'item_url', 'item_id', 'type', 'label', 'image_url', 'collected_from', 'collected_at'];
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach((row, index) => {
    lines.push([
      index + 1,
      row.item_url ?? row.reel_url ?? '',
      row.item_id ?? row.reel_id ?? '',
      row.type ?? 'reel',
      row.label ?? '',
      row.image_url ?? '',
      row.collected_from ?? '',
      row.collected_at ?? ''
    ].map(csvEscape).join(','));
  });
  return '﻿' + lines.join('\n');
}

function filenameFromUrl(url, mode) {
  const prefix = mode === 'images' ? 'fb-photos' : 'fb-reels';
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '');
    let last = path.split('/').filter(Boolean).pop() || '';
    if (!last && parsed.searchParams.get('id')) last = `id-${parsed.searchParams.get('id')}`;
    if (!last) last = 'facebook';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${prefix}-${last}-${stamp}.csv`;
  } catch {
    return `${prefix}-${Date.now()}.csv`;
  }
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error('Không tìm thấy tab đang mở.');
  return chrome.tabs.sendMessage(tab.id, message);
}

function modeLabel(mode) {
  if (mode === 'images') return 'Ảnh';
  if (mode === 'reels') return 'Reels';
  return mode || '-';
}

function renderStatus(status) {
  el.pageUrl.textContent = status?.url || '-';
  const stateText = status?.scanning ? 'Đang quét' : 'Đang chờ';
  const resolved = status?.resolvedMode || 'reels';
  const matchFlag = status?.isMatchingPage
    ? `Đúng trang ${modeLabel(resolved)}`
    : `Không phải trang ${modeLabel(resolved)}`;
  el.scanState.textContent = `${stateText} • ${matchFlag}`;
  el.foundCount.textContent = String(status?.foundCount || 0);
  el.scrollCount.textContent = String(status?.scrollCount || 0);
  el.lastAddedAt.textContent = status?.lastAddedAt || '-';
  const previewLines = (status?.preview || []).map((item, idx) => {
    const url = item.item_url || item.reel_url || '';
    return `${idx + 1}. ${url}`;
  });
  el.preview.value = previewLines.join('\n');
  el.exportBtn.disabled = (status?.foundCount || 0) === 0;
  el.copyBtn.disabled = (status?.foundCount || 0) === 0;
}

function hintForMode(status) {
  const resolved = status?.resolvedMode || 'reels';
  if (resolved === 'images') {
    return status?.isMatchingPage
      ? 'Sẵn sàng quét ảnh. Bấm Bắt đầu quét.'
      : 'Hãy mở trang ảnh, ví dụ: https://www.facebook.com/profile.php?id=...&sk=photos hoặc https://www.facebook.com/USER/photos';
  }
  return status?.isMatchingPage
    ? 'Sẵn sàng quét reels. Bấm Bắt đầu quét.'
    : 'Hãy mở trang reels, ví dụ: https://www.facebook.com/USER/reels/';
}

async function refreshStatus(silent = false) {
  try {
    const response = await sendToActiveTab({ type: 'FB_REEL_EXPORTER_STATUS' });
    if (!response?.ok) throw new Error(response?.message || 'Không lấy được trạng thái.');
    renderStatus(response.status);
    if (!silent) setHint(hintForMode(response.status));
  } catch (error) {
    renderStatus(null);
    setHint(error.message || String(error), true);
  }
}

async function startScan() {
  try {
    const config = {
      mode: el.mode.value || 'auto',
      delayMs: Number(el.delayMs.value || 1800),
      maxScrolls: Number(el.maxScrolls.value || 200),
      idleRounds: Number(el.idleRounds.value || 4),
      clearPrevious: el.clearPrevious.checked
    };

    setHint('Đã gửi lệnh quét. Hãy giữ tab Facebook đang mở trong lúc extension tự cuộn.');
    await sendToActiveTab({ type: 'FB_REEL_EXPORTER_START', config });
    startPolling();
    await refreshStatus(true);
  } catch (error) {
    setHint(error.message || String(error), true);
  }
}

async function stopScan() {
  try {
    const response = await sendToActiveTab({ type: 'FB_REEL_EXPORTER_STOP' });
    setHint(response?.message || 'Đã gửi lệnh dừng.');
    await refreshStatus(true);
  } catch (error) {
    setHint(error.message || String(error), true);
  }
}

async function exportCsv() {
  try {
    const statusResponse = await sendToActiveTab({ type: 'FB_REEL_EXPORTER_STATUS' });
    const resultsResponse = await sendToActiveTab({ type: 'FB_REEL_EXPORTER_RESULTS' });
    const rows = resultsResponse?.results || [];
    if (!rows.length) {
      setHint('Chưa có dữ liệu để xuất CSV.', true);
      return;
    }

    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const blobUrl = URL.createObjectURL(blob);

    const mode = statusResponse?.status?.resolvedMode || 'reels';
    await chrome.downloads.download({
      url: blobUrl,
      filename: filenameFromUrl(statusResponse?.status?.url || 'facebook', mode),
      saveAs: true
    });

    setHint(`Đã tạo CSV với ${rows.length} link.`);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
  } catch (error) {
    setHint(error.message || String(error), true);
  }
}

async function copyAllLinks() {
  try {
    const resultsResponse = await sendToActiveTab({ type: 'FB_REEL_EXPORTER_RESULTS' });
    const rows = resultsResponse?.results || [];
    const text = rows.map((row) => row.item_url || row.reel_url || '').filter(Boolean).join('\n');
    if (!text) {
      setHint('Chưa có link để copy.', true);
      return;
    }
    await navigator.clipboard.writeText(text);
    setHint(`Đã copy ${rows.length} link vào clipboard.`);
  } catch (error) {
    setHint(error.message || String(error), true);
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    await refreshStatus(true);
    try {
      const response = await sendToActiveTab({ type: 'FB_REEL_EXPORTER_STATUS' });
      if (!response?.status?.scanning && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
        setHint(`Quét xong. Tìm thấy ${response?.status?.foundCount || 0} link.`);
      }
    } catch {
      // Ignore polling errors while user navigates.
    }
  }, 1500);
}

el.startBtn.addEventListener('click', startScan);
el.stopBtn.addEventListener('click', stopScan);
el.refreshBtn.addEventListener('click', () => refreshStatus());
el.exportBtn.addEventListener('click', exportCsv);
el.copyBtn.addEventListener('click', copyAllLinks);
el.mode.addEventListener('change', () => refreshStatus());

document.addEventListener('DOMContentLoaded', async () => {
  el.exportBtn.disabled = true;
  el.copyBtn.disabled = true;
  await refreshStatus();
});
