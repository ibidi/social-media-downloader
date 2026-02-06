// ===== X (Twitter) Content Script =====

(() => {
  'use strict';

  const DOWNLOAD_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  const LOADING_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>`;

  // ===== Video URL Deposu =====
  const videoStore = new Map(); // tweetId -> { variants, thumbnail }

  // Bekleyen resolve'lar (on-demand fetch için)
  const pendingRequests = new Map(); // tweetId -> [resolve callbacks]

  // Interceptor'dan gelen videoları dinle
  window.addEventListener('smd-videos-captured', (event) => {
    const videos = event.detail?.videos || [];
    videos.forEach(v => {
      videoStore.set(v.tweetId, {
        variants: v.variants,
        thumbnail: v.thumbnail,
        duration: v.duration
      });
    });
    // Yeni video bulunduğunda butonları güncelle
    addDownloadButtons();
  });

  // Interceptor'dan video yanıtı (sorgu veya on-demand fetch sonucu)
  window.addEventListener('smd-video-response', (event) => {
    const detail = event.detail;

    if (detail.tweetId && detail.data) {
      videoStore.set(detail.tweetId, detail.data);

      // Bekleyen resolve'ları çalıştır
      const pending = pendingRequests.get(detail.tweetId);
      if (pending) {
        pending.forEach(resolve => resolve(detail.data));
        pendingRequests.delete(detail.tweetId);
      }
    } else if (detail.tweetId && !detail.data) {
      // Fetch yapıldı ama video bulunamadı
      const pending = pendingRequests.get(detail.tweetId);
      if (pending) {
        pending.forEach(resolve => resolve(null));
        pendingRequests.delete(detail.tweetId);
      }
    }

    if (detail.all) {
      Object.entries(detail.all).forEach(([id, data]) => {
        videoStore.set(id, data);
      });
    }
  });

  // ===== Mesajları dinle (popup'tan) =====
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getMedia') {
      // Önce interceptor'dan mevcut verileri iste
      window.dispatchEvent(new CustomEvent('smd-query-videos', { detail: {} }));

      // Biraz bekleyip sonuçları topla
      setTimeout(() => {
        const media = findAllMedia();
        sendResponse({ media });
      }, 500);
      return true; // async response
    }
  });

  // ===== Interceptor'dan video iste (Promise-based) =====
  function requestVideoFromInterceptor(tweetId) {
    return new Promise((resolve) => {
      // Depoda varsa hemen döndür
      if (videoStore.has(tweetId)) {
        resolve(videoStore.get(tweetId));
        return;
      }

      // Pending listesine ekle
      if (!pendingRequests.has(tweetId)) {
        pendingRequests.set(tweetId, []);
      }
      pendingRequests.get(tweetId).push(resolve);

      // Interceptor'a sor (on-demand fetch de dahil)
      window.dispatchEvent(new CustomEvent('smd-query-videos', {
        detail: { tweetId: tweetId }
      }));

      // Timeout: 8 saniye sonra vazgeç
      setTimeout(() => {
        const pending = pendingRequests.get(tweetId);
        if (pending) {
          pending.forEach(r => r(null));
          pendingRequests.delete(tweetId);
        }
      }, 8000);
    });
  }

  // ===== Tüm medyayı bul =====
  function findAllMedia() {
    const media = [];
    const seen = new Set();

    // 1. Tweet'lerdeki resimleri bul
    const tweetImages = document.querySelectorAll('img[src*="pbs.twimg.com/media"]');
    tweetImages.forEach(img => {
      const originalUrl = getOriginalImageUrl(img.src);
      if (!seen.has(originalUrl)) {
        seen.add(originalUrl);
        media.push({
          type: 'image',
          url: originalUrl,
          thumbnail: img.src,
          filename: generateImageFilename(originalUrl),
          quality: 'Orijinal'
        });
      }
    });

    // 2. Interceptor'dan yakalanan videoları ekle
    videoStore.forEach((data, tweetId) => {
      if (data && data.variants && data.variants.length > 0) {
        const best = data.variants[0];
        if (!seen.has(best.url)) {
          seen.add(best.url);

          let quality = 'Video';
          if (best.bitrate >= 2000000) quality = 'Video HD (1080p)';
          else if (best.bitrate >= 800000) quality = 'Video (720p)';
          else if (best.bitrate >= 300000) quality = 'Video (480p)';
          else if (best.bitrate > 0) quality = 'Video (360p)';

          media.push({
            type: 'video',
            url: best.url,
            thumbnail: data.thumbnail || null,
            filename: `twitter_video_${tweetId}.mp4`,
            quality: quality
          });
        }
      }
    });

    // 3. DOM'daki doğrudan video URL'leri (blob olmayan)
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      const src = video.src || video.querySelector('source')?.src;
      if (src && !src.startsWith('blob:') && !seen.has(src)) {
        seen.add(src);
        media.push({
          type: 'video',
          url: src,
          thumbnail: video.poster || null,
          filename: `twitter_video_${Date.now()}.mp4`,
          quality: 'Video'
        });
      }
    });

    // 4. Profil banner resimleri
    const bannerImages = document.querySelectorAll('img[src*="profile_banners"]');
    bannerImages.forEach(img => {
      const url = img.src.split('?')[0];
      if (!seen.has(url)) {
        seen.add(url);
        media.push({
          type: 'image',
          url: url,
          thumbnail: img.src,
          filename: `twitter_banner_${Date.now()}.jpg`,
          quality: 'Banner'
        });
      }
    });

    return media;
  }

  // ===== Tweet'ten ID çıkar =====
  function getTweetIdFromElement(element) {
    const article = element.closest('article[data-testid="tweet"]') || element.closest('article');
    if (!article) {
      // Sayfa URL'sinden dene
      return getTweetIdFromUrl();
    }

    // Status linkinden tweet ID'yi çıkar
    const statusLinks = article.querySelectorAll('a[href*="/status/"]');
    for (const link of statusLinks) {
      const match = link.href.match(/\/status\/(\d+)/);
      if (match) return match[1];
    }

    // Time elementinin parent linki
    const timeLink = article.querySelector('time')?.closest('a[href*="/status/"]');
    if (timeLink) {
      const match = timeLink.href.match(/\/status\/(\d+)/);
      if (match) return match[1];
    }

    // Son çare: Sayfa URL'sinden
    return getTweetIdFromUrl();
  }

  function getTweetIdFromUrl() {
    const match = window.location.href.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  // ===== Video URL'sini al =====
  function getVideoUrlForTweet(tweetId) {
    if (!tweetId) return null;

    const data = videoStore.get(tweetId);
    if (data && data.variants && data.variants.length > 0) {
      return {
        url: data.variants[0].url,
        variants: data.variants,
        thumbnail: data.thumbnail
      };
    }
    return null;
  }

  // ===== Orijinal boyutta resim URL'si =====
  function getOriginalImageUrl(url) {
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname === 'pbs.twimg.com') {
        urlObj.searchParams.set('name', 'orig');
        if (!urlObj.searchParams.has('format')) {
          const pathMatch = urlObj.pathname.match(/\.(jpg|jpeg|png|webp)/i);
          if (pathMatch) {
            urlObj.searchParams.set('format', pathMatch[1]);
          }
        }
      }
      return urlObj.toString();
    } catch {
      return url;
    }
  }

  function generateImageFilename(url) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      const mediaId = pathParts[pathParts.length - 1].split('.')[0];
      const format = urlObj.searchParams.get('format') || 'jpg';
      return `twitter_${mediaId}.${format}`;
    } catch {
      return `twitter_image_${Date.now()}.jpg`;
    }
  }

  // ===== İndirme Butonları =====
  function addDownloadButtons() {
    addImageDownloadButtons();
    addVideoDownloadButtons();
  }

  function addImageDownloadButtons() {
    const tweetPhotos = document.querySelectorAll('[data-testid="tweetPhoto"]:not([data-smd-processed])');

    tweetPhotos.forEach(photo => {
      photo.setAttribute('data-smd-processed', 'true');
      photo.style.position = 'relative';

      const img = photo.querySelector('img[src*="pbs.twimg.com/media"]');
      if (!img) return;

      const btn = createDownloadButton();
      btn.style.position = 'absolute';
      btn.style.top = '8px';
      btn.style.right = '8px';

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const originalUrl = getOriginalImageUrl(img.src);
        const filename = generateImageFilename(originalUrl);
        triggerDownload(originalUrl, filename);
        showIndicator('Resim indiriliyor...');
      });

      photo.appendChild(btn);
    });
  }

  function addVideoDownloadButtons() {
    const videoPlayers = document.querySelectorAll('[data-testid="videoPlayer"]:not([data-smd-video-processed])');

    videoPlayers.forEach(player => {
      player.setAttribute('data-smd-video-processed', 'true');
      player.style.position = 'relative';

      const btn = createDownloadButton();
      btn.style.position = 'absolute';
      btn.style.top = '8px';
      btn.style.right = '8px';
      btn.style.zIndex = '10';
      btn.style.background = 'rgba(102, 126, 234, 0.85)';
      btn.style.opacity = '0.9';

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleVideoDownload(player, btn);
      });

      player.appendChild(btn);
    });
  }

  // ===== Video indirme mantığı =====
  async function handleVideoDownload(playerElement, btn) {
    const tweetId = getTweetIdFromElement(playerElement);

    // 1. Depoda varsa hemen göster
    let videoData = getVideoUrlForTweet(tweetId);
    if (videoData) {
      showVideoQualityMenu(btn, videoData, tweetId);
      return;
    }

    // 2. Yoksa interceptor'dan on-demand fetch iste (loading göster)
    if (tweetId) {
      // Butonu loading durumuna al
      const originalHTML = btn.innerHTML;
      btn.innerHTML = LOADING_SVG;
      btn.style.pointerEvents = 'none';
      showIndicator('Video bilgisi aliniyor...', 'info');

      const data = await requestVideoFromInterceptor(tweetId);

      // Butonu geri yükle
      btn.innerHTML = originalHTML;
      btn.style.pointerEvents = '';

      if (data && data.variants && data.variants.length > 0) {
        videoData = {
          url: data.variants[0].url,
          variants: data.variants,
          thumbnail: data.thumbnail
        };
        showVideoQualityMenu(btn, videoData, tweetId);
        return;
      }
    }

    // 3. DOM'da doğrudan video URL'si var mı?
    const video = playerElement.querySelector('video');
    if (video) {
      const src = video.src || video.querySelector('source')?.src;
      if (src && !src.startsWith('blob:')) {
        triggerDownload(src, `twitter_video_${tweetId || Date.now()}.mp4`);
        showIndicator('Video indiriliyor...');
        return;
      }
    }

    // 4. Hiçbir yöntem çalışmadı
    showIndicator('Video bilgisi alinamadi. Tweet sayfasina gidin ve tekrar deneyin.', 'error');
  }

  // ===== Video Kalite Seçim Menüsü =====
  function showVideoQualityMenu(anchorBtn, videoData, tweetId) {
    const existingMenu = document.querySelector('.smd-quality-menu');
    if (existingMenu) {
      existingMenu.remove();
      return;
    }

    const menu = document.createElement('div');
    menu.className = 'smd-quality-menu';
    menu.style.cssText = `
      position: absolute;
      top: 44px;
      right: 0;
      z-index: 99999;
      background: #1a1a2e;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px;
      padding: 6px 0;
      min-width: 220px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.6);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const title = document.createElement('div');
    title.style.cssText = 'padding: 8px 14px; font-size: 11px; color: #888; border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 2px; letter-spacing: 0.5px; text-transform: uppercase;';
    title.textContent = 'Video Kalitesi';
    menu.appendChild(title);

    const variants = videoData.variants;
    variants.forEach((variant, index) => {
      let qualityLabel = 'Video';
      const bitrate = variant.bitrate || 0;
      if (bitrate >= 2000000) qualityLabel = '1080p HD';
      else if (bitrate >= 800000) qualityLabel = '720p';
      else if (bitrate >= 300000) qualityLabel = '480p';
      else if (bitrate > 0) qualityLabel = '360p';
      else qualityLabel = `Kalite ${index + 1}`;

      const bitrateStr = bitrate > 0 ? `${(bitrate / 1000000).toFixed(1)} Mbps` : '';

      const item = document.createElement('button');
      item.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        width: 100%; padding: 10px 14px; border: none; background: transparent;
        color: #e0e0e0; font-size: 13px; cursor: pointer; text-align: left;
        transition: background 0.15s; font-family: inherit;
      `;

      const bestBadge = index === 0 ? '<span style="background:linear-gradient(135deg,#667eea,#764ba2);padding:1px 6px;border-radius:4px;font-size:10px;margin-right:6px;">EN IYI</span>' : '';

      item.innerHTML = `
        <span>${bestBadge}${qualityLabel}</span>
        <span style="font-size: 11px; color: #666;">${bitrateStr}</span>
      `;

      item.addEventListener('mouseenter', () => { item.style.background = 'rgba(102, 126, 234, 0.15)'; });
      item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });

      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerDownload(variant.url, `twitter_video_${tweetId || Date.now()}_${qualityLabel}.mp4`);
        showIndicator(`Video indiriliyor (${qualityLabel})...`);
        menu.remove();
      });

      menu.appendChild(item);
    });

    anchorBtn.style.position = 'relative';
    anchorBtn.appendChild(menu);

    // Dışarı tıklanınca kapat
    setTimeout(() => {
      const closeHandler = (e) => {
        if (!menu.contains(e.target) && e.target !== anchorBtn) {
          menu.remove();
          document.removeEventListener('click', closeHandler, true);
        }
      };
      document.addEventListener('click', closeHandler, true);
    }, 100);
  }

  // ===== Yardımcı Fonksiyonlar =====

  function createDownloadButton() {
    const btn = document.createElement('button');
    btn.className = 'smd-download-btn';
    btn.innerHTML = DOWNLOAD_ICON_SVG;
    btn.title = 'Indir';
    return btn;
  }

  function triggerDownload(url, filename) {
    chrome.runtime.sendMessage({
      action: 'download',
      url: url,
      filename: filename
    });
  }

  function showIndicator(message, type = 'success') {
    let indicator = document.querySelector('.smd-download-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'smd-download-indicator';
      document.body.appendChild(indicator);
    }

    indicator.textContent = message;
    indicator.className = `smd-download-indicator ${type}`;

    requestAnimationFrame(() => {
      indicator.classList.add('show');
    });

    setTimeout(() => {
      indicator.classList.remove('show');
    }, 3000);
  }

  // ===== MutationObserver =====
  const observer = new MutationObserver((mutations) => {
    let shouldCheck = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        shouldCheck = true;
        break;
      }
    }
    if (shouldCheck) {
      addDownloadButtons();
    }
  });

  // ===== URL Degisikliklerini Izle (SPA) =====
  let lastUrl = window.location.href;
  function checkUrlChange() {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      // Yeni sayfaya gecildi, tweet ID varsa otomatik fetch yap
      const tweetId = getTweetIdFromUrl();
      if (tweetId && !videoStore.has(tweetId)) {
        window.dispatchEvent(new CustomEvent('smd-query-videos', {
          detail: { tweetId: tweetId }
        }));
      }
    }
  }

  // ===== Baslat =====
  function init() {
    // Interceptor'dan mevcut verileri iste
    window.dispatchEvent(new CustomEvent('smd-query-videos', { detail: {} }));

    // Sayfa URL'sinde tweet ID varsa hemen fetch iste
    const currentTweetId = getTweetIdFromUrl();
    if (currentTweetId) {
      window.dispatchEvent(new CustomEvent('smd-query-videos', {
        detail: { tweetId: currentTweetId }
      }));
    }

    // Ilk butonlari ekle
    setTimeout(addDownloadButtons, 1000);

    // DOM degisikliklerini izle
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // URL degisikliklerini izle (SPA navigasyonu)
    setInterval(checkUrlChange, 1000);

    console.log('[SMD] Twitter/X content script yuklendi (on-demand video fetch aktif)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
