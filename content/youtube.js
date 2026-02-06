// ===== YouTube Content Script =====

(() => {
  'use strict';

  const DOWNLOAD_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

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
    const url = window.location.href;

    // Video sayfasındaysa
    if (url.includes('/watch') || url.includes('/shorts/')) {
      const videoId = getVideoId(url);
      const title = getVideoTitle();

      if (videoId) {
        // Thumbnail resimleri
        const thumbnailQualities = [
          { name: 'maxresdefault', label: 'Maksimum (1920x1080)' },
          { name: 'sddefault', label: 'SD (640x480)' },
          { name: 'hqdefault', label: 'HQ (480x360)' },
          { name: 'mqdefault', label: 'MQ (320x180)' }
        ];

        thumbnailQualities.forEach(q => {
          media.push({
            type: 'image',
            url: `https://img.youtube.com/vi/${videoId}/${q.name}.jpg`,
            thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
            filename: `${sanitizeFilename(title)}_thumbnail_${q.name}.jpg`,
            quality: `Thumbnail ${q.label}`
          });
        });

        // Video bilgisi
        media.push({
          type: 'video',
          url: url,
          thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          filename: `${sanitizeFilename(title)}.mp4`,
          quality: 'Video (sayfa linki)'
        });
      }
    }

    return media;
  }

  // Video ID'sini al
  function getVideoId(url) {
    try {
      const urlObj = new URL(url);
      // Normal video: /watch?v=VIDEO_ID
      if (urlObj.searchParams.has('v')) {
        return urlObj.searchParams.get('v');
      }
      // Shorts: /shorts/VIDEO_ID
      const shortsMatch = urlObj.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
      if (shortsMatch) return shortsMatch[1];
      // Embed: /embed/VIDEO_ID
      const embedMatch = urlObj.pathname.match(/\/embed\/([a-zA-Z0-9_-]+)/);
      if (embedMatch) return embedMatch[1];
      return null;
    } catch {
      return null;
    }
  }

  // Video başlığını al
  function getVideoTitle() {
    // ytd-watch-metadata'dan başlık al
    const titleEl = document.querySelector(
      'h1.ytd-watch-metadata yt-formatted-string, ' +
      '#title h1 yt-formatted-string, ' +
      'h1.title yt-formatted-string, ' +
      '#title yt-formatted-string'
    );

    if (titleEl && titleEl.textContent.trim()) {
      return titleEl.textContent.trim();
    }

    // Meta tag'den dene
    const metaTitle = document.querySelector('meta[name="title"]')?.content;
    if (metaTitle) return metaTitle;

    // og:title'dan dene
    const ogTitle = document.querySelector('meta[property="og:title"]')?.content;
    if (ogTitle) return ogTitle;

    return `youtube_video_${Date.now()}`;
  }

  // Dosya adını temizle
  function sanitizeFilename(name) {
    return name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 100);
  }

  // Video sayfasına indirme butonu ekle
  function addDownloadButton() {
    // Zaten buton varsa ekleme
    if (document.querySelector('.smd-yt-download-btn')) return;

    const url = window.location.href;
    if (!url.includes('/watch') && !url.includes('/shorts/')) return;

    const videoId = getVideoId(url);
    if (!videoId) return;

    // YouTube'un action butonlarını bul
    const targetSelectors = [
      '#actions #menu',                          // Yeni düzen
      '#top-level-buttons-computed',              // Eski düzen
      'ytd-watch-metadata #actions',              // Alternatif
      '#menu-container',                          // Shorts
      '#actions-inner #menu'                      // Diğer düzen
    ];

    let targetContainer = null;
    for (const selector of targetSelectors) {
      targetContainer = document.querySelector(selector);
      if (targetContainer) break;
    }

    if (!targetContainer) {
      // Biraz bekleyip tekrar dene
      setTimeout(addDownloadButton, 2000);
      return;
    }

    const btn = document.createElement('button');
    btn.className = 'smd-yt-download-btn';
    btn.innerHTML = `${DOWNLOAD_ICON_SVG} İndir`;
    btn.title = 'Thumbnail İndir';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showDownloadMenu(btn, videoId);
    });

    targetContainer.parentElement.insertBefore(btn, targetContainer);
  }

  // İndirme menüsünü göster
  function showDownloadMenu(anchorBtn, videoId) {
    // Varolan menüyü kaldır
    const existingMenu = document.querySelector('.smd-yt-menu');
    if (existingMenu) {
      existingMenu.remove();
      return;
    }

    const title = getVideoTitle();
    const safeTitle = sanitizeFilename(title);

    const menu = document.createElement('div');
    menu.className = 'smd-yt-menu';
    menu.style.cssText = `
      position: absolute;
      top: 100%;
      right: 0;
      z-index: 99999;
      background: #1a1a2e;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 8px 0;
      min-width: 260px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      font-family: 'Roboto', Arial, sans-serif;
    `;

    const menuTitle = document.createElement('div');
    menuTitle.style.cssText = 'padding: 8px 16px; font-size: 12px; color: #888; border-bottom: 1px solid rgba(255,255,255,0.06); margin-bottom: 4px;';
    menuTitle.textContent = '📸 Thumbnail İndir';
    menu.appendChild(menuTitle);

    const qualities = [
      { name: 'maxresdefault', label: 'Maksimum Çözünürlük', desc: '1920 × 1080' },
      { name: 'sddefault', label: 'Standart', desc: '640 × 480' },
      { name: 'hqdefault', label: 'Yüksek Kalite', desc: '480 × 360' },
      { name: 'mqdefault', label: 'Orta Kalite', desc: '320 × 180' }
    ];

    qualities.forEach(q => {
      const item = document.createElement('button');
      item.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 10px 16px;
        border: none;
        background: transparent;
        color: #e0e0e0;
        font-size: 13px;
        cursor: pointer;
        text-align: left;
        transition: background 0.15s;
        font-family: inherit;
      `;

      item.innerHTML = `
        <span>${q.label}</span>
        <span style="font-size: 11px; color: #888;">${q.desc}</span>
      `;

      item.addEventListener('mouseenter', () => {
        item.style.background = 'rgba(102, 126, 234, 0.15)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'transparent';
      });

      item.addEventListener('click', () => {
        const thumbUrl = `https://img.youtube.com/vi/${videoId}/${q.name}.jpg`;
        chrome.runtime.sendMessage({
          action: 'download',
          url: thumbUrl,
          filename: `${safeTitle}_${q.name}.jpg`
        });
        showIndicator(`Thumbnail indiriliyor (${q.label})...`);
        menu.remove();
      });

      menu.appendChild(item);
    });

    // Video linki kopyala butonu
    const separator = document.createElement('div');
    separator.style.cssText = 'border-top: 1px solid rgba(255,255,255,0.06); margin: 4px 0;';
    menu.appendChild(separator);

    const copyBtn = document.createElement('button');
    copyBtn.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 10px 16px;
      border: none;
      background: transparent;
      color: #667eea;
      font-size: 13px;
      cursor: pointer;
      text-align: left;
      transition: background 0.15s;
      font-family: inherit;
    `;
    copyBtn.textContent = '📋 Video Linkini Kopyala';

    copyBtn.addEventListener('mouseenter', () => {
      copyBtn.style.background = 'rgba(102, 126, 234, 0.15)';
    });
    copyBtn.addEventListener('mouseleave', () => {
      copyBtn.style.background = 'transparent';
    });

    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(window.location.href).then(() => {
        showIndicator('Video linki kopyalandı!');
      });
      menu.remove();
    });

    menu.appendChild(copyBtn);

    // Menüyü konumlandır
    anchorBtn.style.position = 'relative';
    anchorBtn.appendChild(menu);

    // Dışarı tıklanınca kapat
    setTimeout(() => {
      document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target) && e.target !== anchorBtn) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 100);
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

  // URL değişikliklerini izle (YouTube SPA)
  let lastUrl = window.location.href;

  const urlObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      // Eski butonları kaldır
      document.querySelectorAll('.smd-yt-download-btn, .smd-yt-menu').forEach(el => el.remove());
      // Yeni buton ekle
      setTimeout(addDownloadButton, 1500);
    }
  });

  // Başlat
  function init() {
    setTimeout(addDownloadButton, 2000); // YouTube'un yüklenmesini bekle
    urlObserver.observe(document.body, { childList: true, subtree: true });
    console.log('Social Media Downloader: YouTube modülü yüklendi');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

