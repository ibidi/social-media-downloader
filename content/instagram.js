// ===== Instagram Content Script =====

(() => {
  'use strict';
  if (window.__smdInstagramContentLoaded) {
    return;
  }
  window.__smdInstagramContentLoaded = true;

  const DOWNLOAD_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  const DOM_UPDATE_DEBOUNCE_MS = 200;
  let addButtonsTimer = null;

  // Mesajları dinle
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getMedia') {
      const media = findAllMedia();
      sendResponse({ media });
    }
    return true;
  });

  // Sayfadaki tüm medyayı bul
  function findAllMedia() {
    const media = [];
    const seen = new Set();

    // 1. Meta tag'lerden medya bul (gönderi sayfalarında çalışır)
    const ogImage = document.querySelector('meta[property="og:image"]')?.content;
    const ogVideo = document.querySelector('meta[property="og:video"]')?.content;

    if (ogVideo && !seen.has(ogVideo)) {
      seen.add(ogVideo);
      media.push({
        type: 'video',
        url: ogVideo,
        thumbnail: ogImage || null,
        filename: `instagram_video_${Date.now()}.mp4`,
        quality: 'Video'
      });
    }

    if (ogImage && !seen.has(ogImage)) {
      seen.add(ogImage);
      media.push({
        type: 'image',
        url: ogImage,
        thumbnail: ogImage,
        filename: `instagram_image_${Date.now()}.jpg`,
        quality: 'OG Image'
      });
    }

    // 2. Sayfadaki gönderi resimlerini bul
    const postImages = document.querySelectorAll('article img[srcset], article img[src*="cdninstagram"]');
    postImages.forEach(img => {
      let url = getBestImageUrl(img);
      if (url && !seen.has(url) && !isProfilePic(url)) {
        seen.add(url);
        media.push({
          type: 'image',
          url: url,
          thumbnail: img.src,
          filename: `instagram_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`,
          quality: 'Resim'
        });
      }
    });

    // 3. Video etiketlerini bul
    const videos = document.querySelectorAll('article video, div[role="dialog"] video');
    videos.forEach(video => {
      // Video source'u bul
      const src = video.src || video.querySelector('source')?.src;
      if (src && !src.startsWith('blob:') && !seen.has(src)) {
        seen.add(src);
        media.push({
          type: 'video',
          url: src,
          thumbnail: video.poster || null,
          filename: `instagram_video_${Date.now()}.mp4`,
          quality: 'Video'
        });
      }
    });

    // 4. Gönderi detay sayfasındaysa, resim carousel'ını kontrol et
    const carouselImages = document.querySelectorAll('div[role="dialog"] img[srcset], ul li img[srcset]');
    carouselImages.forEach(img => {
      let url = getBestImageUrl(img);
      if (url && !seen.has(url) && !isProfilePic(url)) {
        seen.add(url);
        media.push({
          type: 'image',
          url: url,
          thumbnail: img.src,
          filename: `instagram_carousel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`,
          quality: 'Carousel Resmi'
        });
      }
    });

    // 5. Story resimleri
    const storyImages = document.querySelectorAll('section img[srcset][decoding="sync"]');
    storyImages.forEach(img => {
      let url = getBestImageUrl(img);
      if (url && !seen.has(url) && !isProfilePic(url)) {
        seen.add(url);
        media.push({
          type: 'image',
          url: url,
          thumbnail: img.src,
          filename: `instagram_story_${Date.now()}.jpg`,
          quality: 'Story'
        });
      }
    });

    // 6. Reels videoları
    const reelsVideos = document.querySelectorAll('video[src*="cdninstagram"], video source[src*="cdninstagram"]');
    reelsVideos.forEach(el => {
      const src = el.src || el.getAttribute('src');
      if (src && !seen.has(src)) {
        seen.add(src);
        media.push({
          type: 'video',
          url: src,
          thumbnail: null,
          filename: `instagram_reel_${Date.now()}.mp4`,
          quality: 'Reel'
        });
      }
    });

    return media;
  }

  // En iyi kalitede resim URL'si al
  function getBestImageUrl(img) {
    // srcset'ten en yüksek çözünürlüğü al
    const srcset = img.getAttribute('srcset');
    if (srcset) {
      const sources = srcset.split(',').map(s => {
        const parts = s.trim().split(' ');
        const url = parts[0];
        const width = parseInt(parts[1]) || 0;
        return { url, width };
      });

      // En geniş resmi seç
      sources.sort((a, b) => b.width - a.width);
      if (sources.length > 0 && sources[0].url) {
        return sources[0].url;
      }
    }

    // Normal src kullan
    return img.src;
  }

  // Profil resmi mi kontrol et
  function isProfilePic(url) {
    return url.includes('150x150') ||
           url.includes('profile_pic') ||
           url.includes('44x44') ||
           url.includes('s150x150');
  }

  // Gönderilere indirme butonu ekle
  function addDownloadButtons() {
    // Feed gönderilerine buton ekle
    const articles = document.querySelectorAll('article:not([data-smd-processed])');

    articles.forEach(article => {
      article.setAttribute('data-smd-processed', 'true');

      // Resim ve video container'ları bul
      const mediaContainers = article.querySelectorAll(
        'div[role="button"] img[srcset]:not([data-smd-btn]), ' +
        'div[role="presentation"] img[srcset]:not([data-smd-btn])'
      );

      mediaContainers.forEach(media => {
        if (isProfilePic(media.src)) return;

        media.setAttribute('data-smd-btn', 'true');

        const wrapper = media.closest('div[role="button"]') || media.closest('div[role="presentation"]') || media.parentElement;
        if (!wrapper) return;

        wrapper.style.position = 'relative';

        const btn = createDownloadButton();
        btn.style.position = 'absolute';
        btn.style.top = '12px';
        btn.style.right = '12px';

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const url = getBestImageUrl(media);
          if (url) {
            triggerDownload(url, `instagram_${Date.now()}.jpg`);
            showIndicator('Resim indiriliyor...');
          }
        });

        wrapper.appendChild(btn);
      });

      // Video'lara buton ekle
      const videoContainers = article.querySelectorAll('video:not([data-smd-btn])');
      videoContainers.forEach(video => {
        video.setAttribute('data-smd-btn', 'true');

        const wrapper = video.closest('div') || video.parentElement;
        if (!wrapper) return;

        wrapper.style.position = 'relative';

        const btn = createDownloadButton();
        btn.style.position = 'absolute';
        btn.style.top = '12px';
        btn.style.right = '12px';
        btn.style.zIndex = '10';

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const src = video.src || video.querySelector('source')?.src;
          if (src && !src.startsWith('blob:')) {
            triggerDownload(src, `instagram_video_${Date.now()}.mp4`);
            showIndicator('Video indiriliyor...');
          } else {
            showIndicator('Bu video indirilemedi.', 'error');
          }
        });

        wrapper.appendChild(btn);
      });
    });

    // Dialog/modal içindeki medyaya buton ekle
    const dialogs = document.querySelectorAll('div[role="dialog"]:not([data-smd-processed])');
    dialogs.forEach(dialog => {
      dialog.setAttribute('data-smd-processed', 'true');

      const images = dialog.querySelectorAll('img[srcset]:not([data-smd-btn])');
      images.forEach(img => {
        if (isProfilePic(img.src)) return;

        img.setAttribute('data-smd-btn', 'true');
        const wrapper = img.closest('div[role="button"]') || img.closest('div[role="presentation"]') || img.parentElement;
        if (!wrapper) return;

        wrapper.style.position = 'relative';

        const btn = createDownloadButton();
        btn.style.position = 'absolute';
        btn.style.top = '12px';
        btn.style.right = '12px';

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const url = getBestImageUrl(img);
          if (url) {
            triggerDownload(url, `instagram_${Date.now()}.jpg`);
            showIndicator('Resim indiriliyor...');
          }
        });

        wrapper.appendChild(btn);
      });
    });
  }

  function scheduleAddDownloadButtons() {
    clearTimeout(addButtonsTimer);
    addButtonsTimer = setTimeout(addDownloadButtons, DOM_UPDATE_DEBOUNCE_MS);
  }

  // İndirme butonu oluştur
  function createDownloadButton() {
    const btn = document.createElement('button');
    btn.className = 'smd-download-btn';
    btn.innerHTML = DOWNLOAD_ICON_SVG;
    btn.title = 'İndir';
    return btn;
  }

  // İndirme tetikle
  function triggerDownload(url, filename) {
    chrome.runtime.sendMessage({
      action: 'download',
      url: url,
      filename: filename
    });
  }

  // Bildirim göster
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

  // MutationObserver ile dinamik içerikleri izle
  const observer = new MutationObserver((mutations) => {
    let shouldCheck = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        shouldCheck = true;
        break;
      }
    }
    if (shouldCheck) {
      scheduleAddDownloadButtons();
    }
  });

  // Başlat
  function init() {
    scheduleAddDownloadButtons();
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    console.log('Social Media Downloader: Instagram modülü yüklendi');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
