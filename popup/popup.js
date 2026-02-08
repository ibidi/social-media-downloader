// ===== Popup Script =====

document.addEventListener('DOMContentLoaded', async () => {
  const statusBadge = document.getElementById('statusBadge');
  const statusText = statusBadge.querySelector('.status-text');
  const currentPageCard = document.getElementById('currentPageCard');
  const platformIcon = document.getElementById('platformIcon');
  const platformName = document.getElementById('platformName');
  const pageTitle = document.getElementById('pageTitle');
  const pageUrl = document.getElementById('pageUrl');
  const mediaCard = document.getElementById('mediaCard');
  const mediaList = document.getElementById('mediaList');
  const mediaCount = document.getElementById('mediaCount');
  const downloadAllBtn = document.getElementById('downloadAllBtn');
  const emptyState = document.getElementById('emptyState');
  const notSupported = document.getElementById('notSupported');
  const versionEl = document.getElementById('extensionVersion');

  let currentMedia = [];
  versionEl.textContent = `v${chrome.runtime.getManifest().version}`;

  // Aktif sekmeyi al
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';

  // Platform algıla
  const platform = detectPlatform(url);

  if (!platform) {
    statusBadge.classList.add('unsupported');
    statusText.textContent = 'Desteklenmeyen sayfa';
    notSupported.style.display = 'block';
    return;
  }

  // Platform bilgilerini göster
  statusBadge.classList.add('active');
  statusText.textContent = `${platform.name} algılandı`;
  currentPageCard.style.display = 'block';
  platformIcon.textContent = platform.icon;
  platformName.textContent = platform.name;
  pageTitle.textContent = tab.title || 'Bilinmeyen sayfa';
  pageUrl.textContent = url;

  // Medya ara
  try {
    statusText.textContent = 'Medya aranıyor...';

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getMedia' });

    if (response && Array.isArray(response.media) && response.media.length > 0) {
      currentMedia = response.media;
      showMedia(currentMedia);
    } else {
      emptyState.style.display = 'block';
      statusText.textContent = `${platform.name} - Medya bulunamadı`;
    }
  } catch (error) {
    console.error('Medya alınamadı:', error);
    emptyState.style.display = 'block';
    statusText.textContent = `${platform.name} - Bağlantı hatası`;

    // Content script yüklenmemiş olabilir, yeniden enjekte et
    try {
      await reinjectContentScripts(platform.id, tab.id);

      // Tekrar dene
      const retryResponse = await chrome.tabs.sendMessage(tab.id, { action: 'getMedia' });
      if (retryResponse && Array.isArray(retryResponse.media) && retryResponse.media.length > 0) {
        currentMedia = retryResponse.media;
        emptyState.style.display = 'none';
        showMedia(currentMedia);
      }
    } catch (retryError) {
      console.error('Yeniden enjeksiyon başarısız:', retryError);
    }
  }

  // Tümünü indir butonu
  downloadAllBtn.addEventListener('click', () => {
    currentMedia.forEach((media, index) => {
      setTimeout(() => {
        downloadMedia(media);
      }, index * 500); // Her indirme arasında 500ms bekle
    });
    showToast('Tüm dosyalar indiriliyor...', 'success');
  });

  // ===== Yardımcı Fonksiyonlar =====

  function detectPlatform(url) {
    if (url.includes('twitter.com') || url.includes('x.com')) {
      return { id: 'twitter', name: 'X (Twitter)', icon: '𝕏' };
    }
    if (url.includes('youtube.com')) {
      return { id: 'youtube', name: 'YouTube', icon: '▶️' };
    }
    if (url.includes('instagram.com')) {
      return { id: 'instagram', name: 'Instagram', icon: '📷' };
    }
    return null;
  }

  function showMedia(mediaItems) {
    mediaCard.style.display = 'block';
    mediaCount.textContent = mediaItems.length;
    mediaList.innerHTML = '';
    statusText.textContent = `${mediaItems.length} medya bulundu`;

    mediaItems.forEach((media, index) => {
      const item = document.createElement('div');
      item.className = 'media-item';

      const isVideo = media.type === 'video';
      const typeClass = isVideo ? 'video' : 'image';
      const typeLabel = isVideo ? 'Video' : 'Resim';
      const thumbSrc = media.thumbnail || media.url;
      const fileLabel = media.filename || `media_${index + 1}`;
      const qualityLabel = media.quality ? `${typeLabel} • ${media.quality}` : typeLabel;

      if (media.thumbnail || !isVideo) {
        const thumbImg = document.createElement('img');
        thumbImg.className = 'media-thumb';
        thumbImg.src = thumbSrc;
        thumbImg.alt = '';
        thumbImg.addEventListener('error', () => {
          thumbImg.style.display = 'none';
        });
        item.appendChild(thumbImg);
      } else {
        const thumbPlaceholder = document.createElement('div');
        thumbPlaceholder.className = 'media-thumb';
        thumbPlaceholder.style.display = 'flex';
        thumbPlaceholder.style.alignItems = 'center';
        thumbPlaceholder.style.justifyContent = 'center';
        thumbPlaceholder.style.fontSize = '20px';
        thumbPlaceholder.textContent = '🎬';
        item.appendChild(thumbPlaceholder);
      }

      const info = document.createElement('div');
      info.className = 'media-info';

      const type = document.createElement('div');
      type.className = `media-type ${typeClass}`;
      type.textContent = qualityLabel;
      info.appendChild(type);

      const name = document.createElement('div');
      name.className = 'media-name';
      name.textContent = fileLabel;
      info.appendChild(name);

      item.appendChild(info);

      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'media-download-btn';
      downloadBtn.title = 'İndir';
      downloadBtn.appendChild(createDownloadIcon());

      downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadMedia(media);
        showToast('İndirme başladı!', 'success');
      });

      item.appendChild(downloadBtn);
      mediaList.appendChild(item);
    });
  }

  function createDownloadIcon() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');

    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3');
    svg.appendChild(path);

    return svg;
  }

  async function reinjectContentScripts(platformId, tabId) {
    if (platformId === 'twitter') {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/twitter-interceptor.js'],
        world: 'MAIN'
      });
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/twitter.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ['styles/content.css']
      });
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: [`content/${platformId}.js`]
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['styles/content.css']
    });
  }

  function downloadMedia(media) {
    chrome.runtime.sendMessage({
      action: 'download',
      url: media.url,
      filename: media.filename || generateFilename(media)
    });
  }

  function generateFilename(media) {
    const ext = media.type === 'video' ? 'mp4' : 'jpg';
    const timestamp = Date.now();
    const platform = detectPlatform(url)?.id || 'media';
    return `${platform}_${timestamp}.${ext}`;
  }

  function showToast(message, type = 'success') {
    // Varolan toast'ı kaldır
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }
});
