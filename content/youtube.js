// ===== YouTube Content Script =====

(() => {
  'use strict';
  if (window.__smdYouTubeContentLoaded) {
    return;
  }
  window.__smdYouTubeContentLoaded = true;

  const DOWNLOAD_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  const URL_CHECK_DEBOUNCE_MS = 200;

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
        media.push(...getThumbnailMedia(videoId, title));
        media.push(...getStreamMedia(videoId, title));
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

  function getThumbnailMedia(videoId, title) {
    const thumbnailQualities = [
      { name: 'maxresdefault', label: 'Maksimum (1920x1080)' },
      { name: 'sddefault', label: 'SD (640x480)' },
      { name: 'hqdefault', label: 'HQ (480x360)' },
      { name: 'mqdefault', label: 'MQ (320x180)' }
    ];

    return thumbnailQualities.map(q => ({
      type: 'image',
      url: `https://img.youtube.com/vi/${videoId}/${q.name}.jpg`,
      thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      filename: `${sanitizeFilename(title)}_thumbnail_${q.name}.jpg`,
      quality: `Goruntu ${q.label}`
    }));
  }

  function getStreamMedia(videoId, title) {
    const safeTitle = sanitizeFilename(title);
    const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    const seen = new Set();
    const playerResponse = getInitialPlayerResponse();
    if (!playerResponse?.streamingData) return [];

    const formats = [
      ...(playerResponse.streamingData.formats || []),
      ...(playerResponse.streamingData.adaptiveFormats || [])
    ];

    const media = [];
    formats.forEach((format) => {
      const resolvedUrl = resolveFormatUrl(format);
      if (!resolvedUrl || seen.has(resolvedUrl)) return;
      seen.add(resolvedUrl);

      const mimeType = parseMimeType(format.mimeType);
      if (!mimeType) return;

      if (mimeType.startsWith('audio/')) {
        const ext = getExtensionFromMime(mimeType, 'm4a');
        const quality = buildAudioQualityLabel(format);
        media.push({
          type: 'audio',
          url: resolvedUrl,
          thumbnail: thumbUrl,
          filename: `${safeTitle}_audio_${sanitizeFilename(quality)}.${ext}`,
          quality
        });
        return;
      }

      if (mimeType.startsWith('video/')) {
        const ext = getExtensionFromMime(mimeType, 'mp4');
        const hasAudio = formatHasAudio(format);
        const quality = buildVideoQualityLabel(format, hasAudio);
        media.push({
          type: 'video',
          url: resolvedUrl,
          thumbnail: thumbUrl,
          filename: `${safeTitle}_video_${sanitizeFilename(quality)}.${ext}`,
          quality
        });
      }
    });

    return media;
  }

  function getInitialPlayerResponse() {
    const scripts = Array.from(document.querySelectorAll('script'));
    for (const script of scripts) {
      const text = script.textContent || '';
      if (!text.includes('ytInitialPlayerResponse')) continue;
      const json = extractJsonObjectAfterToken(text, 'ytInitialPlayerResponse');
      if (json) return json;
    }
    return null;
  }

  function extractJsonObjectAfterToken(source, token) {
    const tokenIndex = source.indexOf(token);
    if (tokenIndex < 0) return null;
    const firstBraceIndex = source.indexOf('{', tokenIndex);
    if (firstBraceIndex < 0) return null;

    let depth = 0;
    let inString = false;
    let quoteChar = '';
    let escaped = false;

    for (let i = firstBraceIndex; i < source.length; i += 1) {
      const ch = source[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === quoteChar) {
          inString = false;
        }
        continue;
      }

      if (ch === '"' || ch === "'") {
        inString = true;
        quoteChar = ch;
        continue;
      }

      if (ch === '{') depth += 1;
      if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          const jsonCandidate = source.slice(firstBraceIndex, i + 1);
          try {
            return JSON.parse(jsonCandidate);
          } catch {
            return null;
          }
        }
      }
    }

    return null;
  }

  function parseMimeType(rawMimeType) {
    if (!rawMimeType || typeof rawMimeType !== 'string') return '';
    return rawMimeType.split(';')[0].trim().toLowerCase();
  }

  function getExtensionFromMime(mimeType, fallbackExt) {
    const ext = mimeType.split('/')[1];
    if (!ext) return fallbackExt;
    if (ext === 'mp4') return 'mp4';
    if (ext === 'webm') return 'webm';
    if (ext === '3gpp') return '3gp';
    if (ext === 'mpeg') return 'mp3';
    return ext;
  }

  function resolveFormatUrl(format) {
    if (format.url) return format.url;
    const cipher = format.signatureCipher || format.cipher;
    if (!cipher) return null;

    const params = new URLSearchParams(cipher);
    const encodedUrl = params.get('url');
    if (!encodedUrl) return null;

    const signature = params.get('sig') || params.get('lsig');
    const encryptedSig = params.get('s');
    const signatureParam = params.get('sp') || 'signature';

    try {
      const finalUrl = new URL(decodeURIComponent(encodedUrl));
      if (signature) {
        finalUrl.searchParams.set(signatureParam, signature);
      } else if (encryptedSig) {
        // s alanı çözülmeden kullanılmaz.
        return null;
      }
      return finalUrl.toString();
    } catch {
      return null;
    }
  }

  function formatHasAudio(format) {
    if (format.audioQuality) return true;
    const mime = format.mimeType || '';
    return /codecs="[^"]*(mp4a|opus|vorbis|aac)/i.test(mime);
  }

  function buildVideoQualityLabel(format, hasAudio) {
    const quality = format.qualityLabel || format.quality || 'Video';
    return hasAudio ? quality : `${quality} (sessiz)`;
  }

  function buildAudioQualityLabel(format) {
    const kbps = format.bitrate ? Math.round(format.bitrate / 1000) : 0;
    if (kbps > 0) return `${kbps}kbps`;
    return format.audioQuality || 'Ses';
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
    btn.title = 'Medya İndir';

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

    const mediaItems = findAllMedia();
    const videoItems = mediaItems.filter((item) => item.type === 'video');
    const audioItems = mediaItems.filter((item) => item.type === 'audio');
    const imageItems = mediaItems.filter((item) => item.type === 'image');

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

    appendMenuSection(menu, '🎬 Video', videoItems, (item) => {
      triggerDownload(item);
      showIndicator(`Video indiriliyor (${item.quality})...`);
      menu.remove();
    });

    appendMenuSection(menu, '🎵 Ses', audioItems, (item) => {
      triggerDownload(item);
      showIndicator(`Ses indiriliyor (${item.quality})...`);
      menu.remove();
    });

    appendMenuSection(menu, '🖼️ Goruntu', imageItems, (item) => {
      triggerDownload(item);
      showIndicator(`Goruntu indiriliyor (${item.quality})...`);
      menu.remove();
    });

    const info = document.createElement('div');
    info.style.cssText = 'padding: 8px 16px; border-top: 1px solid rgba(255,255,255,0.06); color: #888; font-size: 11px;';
    info.textContent = 'Not: Bazi videolarda YouTube sifreli URL kullandigi icin tum kalite secenekleri gorunmeyebilir.';
    menu.appendChild(info);

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

  function appendMenuSection(menu, title, items, onClick) {
    const sectionTitle = document.createElement('div');
    sectionTitle.style.cssText = 'padding: 8px 16px; font-size: 12px; color: #888; border-top: 1px solid rgba(255,255,255,0.06); margin-top: 4px;';
    sectionTitle.textContent = title;
    menu.appendChild(sectionTitle);

    if (!items.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding: 8px 16px; font-size: 12px; color: #666;';
      empty.textContent = 'Secenek bulunamadi';
      menu.appendChild(empty);
      return;
    }

    items.forEach((item) => {
      const button = document.createElement('button');
      button.style.cssText = `
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

      const left = document.createElement('span');
      left.textContent = item.quality || item.filename;
      const right = document.createElement('span');
      right.style.cssText = 'font-size: 11px; color: #888;';
      right.textContent = item.filename.split('.').pop()?.toUpperCase() || '';

      button.appendChild(left);
      button.appendChild(right);

      button.addEventListener('mouseenter', () => {
        button.style.background = 'rgba(102, 126, 234, 0.15)';
      });
      button.addEventListener('mouseleave', () => {
        button.style.background = 'transparent';
      });
      button.addEventListener('click', () => onClick(item));

      menu.appendChild(button);
    });
  }

  function triggerDownload(item) {
    chrome.runtime.sendMessage({
      action: 'download',
      url: item.url,
      filename: item.filename
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

  // URL değişikliklerini izle (YouTube SPA)
  let lastUrl = window.location.href;
  let urlCheckTimer = null;

  function handleUrlChange() {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      // Eski butonları kaldır
      document.querySelectorAll('.smd-yt-download-btn, .smd-yt-menu').forEach(el => el.remove());
      // Yeni buton ekle
      setTimeout(addDownloadButton, 1500);
    }
  }

  function scheduleUrlCheck() {
    clearTimeout(urlCheckTimer);
    urlCheckTimer = setTimeout(handleUrlChange, URL_CHECK_DEBOUNCE_MS);
  }

  function observeSpaNavigation(onChange) {
    const notify = () => {
      setTimeout(onChange, 0);
    };

    const originalPushState = history.pushState;
    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      notify();
      return result;
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      notify();
      return result;
    };

    window.addEventListener('popstate', notify);
    window.addEventListener('hashchange', notify);
  }

  const urlObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0) {
        scheduleUrlCheck();
        break;
      }
    }
  });

  // Başlat
  function init() {
    setTimeout(addDownloadButton, 2000); // YouTube'un yüklenmesini bekle
    urlObserver.observe(document.body, { childList: true, subtree: true });
    observeSpaNavigation(scheduleUrlCheck);
    console.log('Social Media Downloader: YouTube modülü yüklendi');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
