const el = {
  mode: document.getElementById('mode'),
  delayMs: document.getElementById('delayMs'),
  maxScrolls: document.getElementById('maxScrolls'),
  idleRounds: document.getElementById('idleRounds'),
  clearPrevious: document.getElementById('clearPrevious'),
  viewFilter: document.getElementById('viewFilter'),
  customViewRow: document.getElementById('customViewRow'),
  minViews: document.getElementById('minViews'),
  includeUnknownViews: document.getElementById('includeUnknownViews'),
  filteredCount: document.getElementById('filteredCount'),
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

const FILTER_STORAGE_KEY = 'fbExporterViewFilter';

function getFilter() {
  const raw = el.viewFilter.value;
  const minViews = raw === 'custom' ? Number(el.minViews.value || 0) : Number(raw || 0);
  return {
    minViews: Number.isFinite(minViews) && minViews > 0 ? Math.floor(minViews) : 0,
    includeUnknown: el.includeUnknownViews.checked
  };
}

function syncFilterUi() {
  const isCustom = el.viewFilter.value === 'custom';
  el.customViewRow.classList.toggle('hidden', !isCustom);
  const filter = getFilter();
  el.includeUnknownViews.disabled = filter.minViews === 0;
}

async function saveFilter() {
  try {
    await chrome.storage.local.set({
      [FILTER_STORAGE_KEY]: {
        viewFilter: el.viewFilter.value,
        minViews: Number(el.minViews.value || 0),
        includeUnknown: el.includeUnknownViews.checked
      }
    });
  } catch {
    // Bỏ qua nếu không lưu được cấu hình.
  }
}

async function loadFilter() {
  try {
    const saved = (await chrome.storage.local.get(FILTER_STORAGE_KEY))?.[FILTER_STORAGE_KEY];
    if (!saved) return;
    if (saved.viewFilter) el.viewFilter.value = saved.viewFilter;
    if (Number.isFinite(Number(saved.minViews))) el.minViews.value = String(saved.minViews);
    el.includeUnknownViews.checked = Boolean(saved.includeUnknown);
  } catch {
    // Bỏ qua nếu không đọc được cấu hình.
  }
}

function viewCountOf(row) {
  const value = Number(row?.view_count);
  return Number.isFinite(value) ? value : null;
}

function passesViewFilter(row, filter) {
  if (!filter.minViews) return true;
  // Ảnh không có lượt xem nên không bị bộ lọc video loại bỏ.
  if ((row?.type || 'reel') === 'image') return true;
  const views = viewCountOf(row);
  if (views === null) return filter.includeUnknown;
  return views > filter.minViews;
}

function filterRows(rows, filter) {
  return (rows || []).filter((row) => passesViewFilter(row, filter));
}

function formatViews(row) {
  const views = viewCountOf(row);
  if (views === null) return '';
  return views.toLocaleString('vi-VN');
}

function csvEscape(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows) {
  const headers = [
    'index',
    'item_url',
    'item_id',
    'type',
    'label',
    'view_count',
    'view_text',
    'image_url',
    'collected_from',
    'collected_at'
  ];
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach((row, index) => {
    const views = viewCountOf(row);
    lines.push([
      index + 1,
      row.item_url ?? row.reel_url ?? '',
      row.item_id ?? row.reel_id ?? '',
      row.type ?? 'reel',
      row.label ?? '',
      views === null ? '' : views,
      row.view_text ?? '',
      row.image_url ?? '',
      row.collected_from ?? '',
      row.collected_at ?? ''
    ].map(csvEscape).join(','));
  });
  return '﻿' + lines.join('\n');
}

function filenameFromUrl(url, mode, minViews = 0) {
  const base = mode === 'images' ? 'fb-photos' : 'fb-reels';
  const prefix = minViews > 0 ? `${base}-gt${minViews}view` : base;
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

function renderStatus(status, rows = null) {
  el.pageUrl.textContent = status?.url || '-';
  const stateText = status?.scanning ? 'Đang quét' : 'Đang chờ';
  const resolved = status?.resolvedMode || 'reels';
  const matchFlag = status?.isMatchingPage
    ? `Đúng trang ${modeLabel(resolved)}`
    : `Không phải trang ${modeLabel(resolved)}`;
  el.scanState.textContent = `${stateText} • ${matchFlag}`;

  const total = status?.foundCount || 0;
  el.foundCount.textContent = String(total);
  el.scrollCount.textContent = String(status?.scrollCount || 0);
  el.lastAddedAt.textContent = status?.lastAddedAt || '-';

  const filter = getFilter();
  let previewRows = status?.preview || [];
  let exportable = total;

  if (filter.minViews > 0) {
    const filtered = filterRows(rows || [], filter);
    exportable = rows ? filtered.length : 0;
    previewRows = (rows ? filtered : []).slice(0, 20);
    el.filteredCount.textContent = `${exportable} / ${total} (> ${filter.minViews.toLocaleString('vi-VN')} view)`;
  } else {
    el.filteredCount.textContent = `${total} (không lọc)`;
  }

  const previewLines = previewRows.map((item, idx) => {
    const url = item.item_url || item.reel_url || '';
    const views = formatViews(item);
    return views ? `${idx + 1}. ${url} — ${views} view` : `${idx + 1}. ${url}`;
  });
  el.preview.value = previewLines.join('\n');
  el.exportBtn.disabled = exportable === 0;
  el.copyBtn.disabled = exportable === 0;
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

    let rows = null;
    if (getFilter().minViews > 0 && (response.status?.foundCount || 0) > 0) {
      const resultsResponse = await sendToActiveTab({ type: 'FB_REEL_EXPORTER_RESULTS' });
      rows = resultsResponse?.results || [];
    }

    renderStatus(response.status, rows);
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
    const allRows = resultsResponse?.results || [];
    if (!allRows.length) {
      setHint('Chưa có dữ liệu để xuất CSV.', true);
      return;
    }

    const filter = getFilter();
    const rows = filterRows(allRows, filter);
    if (!rows.length) {
      const unknown = allRows.filter((row) => (row.type || 'reel') !== 'image' && viewCountOf(row) === null).length;
      setHint(
        `Không có video nào > ${filter.minViews.toLocaleString('vi-VN')} view` +
          (unknown ? ` (${unknown} video chưa đọc được lượt xem — có thể bật tùy chọn giữ lại).` : '.'),
        true
      );
      return;
    }

    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const blobUrl = URL.createObjectURL(blob);

    const mode = statusResponse?.status?.resolvedMode || 'reels';
    await chrome.downloads.download({
      url: blobUrl,
      filename: filenameFromUrl(statusResponse?.status?.url || 'facebook', mode, filter.minViews),
      saveAs: true
    });

    setHint(
      filter.minViews > 0
        ? `Đã tạo CSV với ${rows.length}/${allRows.length} link (> ${filter.minViews.toLocaleString('vi-VN')} view).`
        : `Đã tạo CSV với ${rows.length} link.`
    );
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
  } catch (error) {
    setHint(error.message || String(error), true);
  }
}

async function copyAllLinks() {
  try {
    const resultsResponse = await sendToActiveTab({ type: 'FB_REEL_EXPORTER_RESULTS' });
    const allRows = resultsResponse?.results || [];
    const filter = getFilter();
    const rows = filterRows(allRows, filter);
    const text = rows.map((row) => row.item_url || row.reel_url || '').filter(Boolean).join('\n');
    if (!text) {
      setHint(
        filter.minViews > 0
          ? `Không có link nào > ${filter.minViews.toLocaleString('vi-VN')} view để copy.`
          : 'Chưa có link để copy.',
        true
      );
      return;
    }
    await navigator.clipboard.writeText(text);
    setHint(
      filter.minViews > 0
        ? `Đã copy ${rows.length}/${allRows.length} link (> ${filter.minViews.toLocaleString('vi-VN')} view).`
        : `Đã copy ${rows.length} link vào clipboard.`
    );
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

async function onFilterChanged() {
  syncFilterUi();
  await saveFilter();
  await refreshStatus(true);
}

el.viewFilter.addEventListener('change', onFilterChanged);
el.minViews.addEventListener('change', onFilterChanged);
el.includeUnknownViews.addEventListener('change', onFilterChanged);

document.addEventListener('DOMContentLoaded', async () => {
  el.exportBtn.disabled = true;
  el.copyBtn.disabled = true;
  await loadFilter();
  syncFilterUi();
  await refreshStatus();
});
