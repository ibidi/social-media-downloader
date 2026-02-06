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

  let currentMedia = [];

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

    if (response && response.media && response.media.length > 0) {
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
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [`content/${platform.id}.js`]
      });

      // Tekrar dene
      const retryResponse = await chrome.tabs.sendMessage(tab.id, { action: 'getMedia' });
      if (retryResponse && retryResponse.media && retryResponse.media.length > 0) {
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

      item.innerHTML = `
        ${media.thumbnail || !isVideo ? `<img class="media-thumb" src="${thumbSrc}" alt="" onerror="this.style.display='none'">` : '<div class="media-thumb" style="display:flex;align-items:center;justify-content:center;font-size:20px;">🎬</div>'}
        <div class="media-info">
          <div class="media-type ${typeClass}">${typeLabel}${media.quality ? ' • ' + media.quality : ''}</div>
          <div class="media-name">${media.filename || `media_${index + 1}`}</div>
        </div>
        <button class="media-download-btn" data-index="${index}" title="İndir">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
        </button>
      `;

      const downloadBtn = item.querySelector('.media-download-btn');
      downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadMedia(media);
        showToast('İndirme başladı!', 'success');
      });

      mediaList.appendChild(item);
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

