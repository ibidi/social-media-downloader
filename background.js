// ===== Background Service Worker =====

// İndirme isteklerini dinle
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'download') {
    handleDownload(message.url, message.filename, sender.tab?.id);
    sendResponse({ success: true });
  }
  return true;
});

// İndirme işlemi
async function handleDownload(url, filename, tabId) {
  const cleanFilename = sanitizeFilename(filename);

  // 1. Doğrudan Chrome downloads API ile dene
  try {
    const downloadId = await chrome.downloads.download({
      url: url,
      filename: cleanFilename,
      saveAs: false,
      conflictAction: 'uniquify'
    });

    console.log(`[SMD] İndirme başlatıldı (#${downloadId}): ${cleanFilename}`);
    return;
  } catch (error) {
    console.warn('[SMD] Doğrudan indirme başarısız, fetch deneniyor:', error.message);
  }

  // 2. Fetch ile blob olarak indir (CORS/redirect sorunları için)
  try {
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Accept': '*/*'
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const downloadId = await chrome.downloads.download({
      url: blobUrl,
      filename: cleanFilename,
      saveAs: false,
      conflictAction: 'uniquify'
    });

    console.log(`[SMD] Fetch ile indirme başlatıldı (#${downloadId}): ${cleanFilename}`);

    // Blob URL'yi temizle
    setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
    return;
  } catch (fetchError) {
    console.warn('[SMD] Fetch ile indirme başarısız:', fetchError.message);
  }

  // 3. Son çare: Tab kontextinde fetch dene (cookie'lere erişim için)
  if (tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: async (downloadUrl, downloadFilename) => {
          try {
            const response = await fetch(downloadUrl, { credentials: 'include' });
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = downloadFilename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(blobUrl);
            }, 5000);
          } catch (e) {
            console.error('[SMD] Tab içinde indirme başarısız:', e);
          }
        },
        args: [url, cleanFilename]
      });

      console.log(`[SMD] Tab içinde indirme denendi: ${cleanFilename}`);
    } catch (scriptError) {
      console.error('[SMD] Tüm indirme yöntemleri başarısız:', scriptError.message);
    }
  }
}

// Dosya adını temizle
function sanitizeFilename(filename) {
  return filename
    .replace(/[<>:"/\\|?*#]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 200);
}

// Eklenti yüklendiğinde
chrome.runtime.onInstalled.addListener(() => {
  console.log('[SMD] Social Media Downloader v1.1.0 yüklendi!');
});
