const el = {
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
  const headers = ['index', 'reel_url', 'reel_id', 'label', 'collected_from', 'collected_at'];
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach((row, index) => {
    lines.push([
      index + 1,
      row.reel_url,
      row.reel_id,
      row.label,
      row.collected_from,
      row.collected_at
    ].map(csvEscape).join(','));
  });
  return '\ufeff' + lines.join('\n');
}

function filenameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '');
    const last = path.split('/').filter(Boolean).pop() || 'facebook_reels';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `fb-reels-${last}-${stamp}.csv`;
  } catch {
    return `fb-reels-${Date.now()}.csv`;
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

function renderStatus(status) {
  el.pageUrl.textContent = status?.url || '-';
  const stateText = status?.scanning ? 'Đang quét' : 'Đang chờ';
  const pageFlag = status?.isReelsPage ? 'Đúng trang reels' : 'Không phải trang reels';
  el.scanState.textContent = `${stateText} • ${pageFlag}`;
  el.foundCount.textContent = String(status?.foundCount || 0);
  el.scrollCount.textContent = String(status?.scrollCount || 0);
  el.lastAddedAt.textContent = status?.lastAddedAt || '-';
  const previewLines = (status?.preview || []).map((item, idx) => `${idx + 1}. ${item.reel_url}`);
  el.preview.value = previewLines.join('\n');
  el.exportBtn.disabled = (status?.foundCount || 0) === 0;
  el.copyBtn.disabled = (status?.foundCount || 0) === 0;
}

async function refreshStatus(silent = false) {
  try {
    const response = await sendToActiveTab({ type: 'FB_REEL_EXPORTER_STATUS' });
    if (!response?.ok) throw new Error(response?.message || 'Không lấy được trạng thái.');
    renderStatus(response.status);
    if (!silent) {
      setHint(response.status?.isReelsPage
        ? 'Sẵn sàng quét. Mở đúng tab Facebook /reels rồi bấm Bắt đầu quét.'
        : 'Hãy mở đúng trang Facebook reels, ví dụ: https://www.facebook.com/TEN_TRANG/reels/');
    }
  } catch (error) {
    renderStatus(null);
    setHint(error.message || String(error), true);
  }
}

async function startScan() {
  try {
    const config = {
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

    await chrome.downloads.download({
      url: blobUrl,
      filename: filenameFromUrl(statusResponse?.status?.url || 'facebook_reels'),
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
    const text = rows.map((row) => row.reel_url).join('\n');
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

document.addEventListener('DOMContentLoaded', async () => {
  el.exportBtn.disabled = true;
  el.copyBtn.disabled = true;
  await refreshStatus();
});
