// ===== Twitter/X API Interceptor (MAIN World) =====
// Bu script sayfanın ana bağlamında çalışır ve Twitter API yanıtlarındaki
// video URL'lerini yakalar. Ayrıca on-demand tweet fetch yapabilir.

(function () {
  'use strict';

  // Video URL'lerini saklayacak global depo
  const capturedVideos = new Map(); // tweetId -> { variants, thumbnail }

  // Twitter'ın public bearer token'ı (web client kullanır)
  const BEARER_TOKEN = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=';

  // ===== FETCH HOOK =====
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

      // Twitter GraphQL / API yanıtlarını kontrol et
      if (shouldIntercept(requestUrl)) {
        const clone = response.clone();
        clone.json().then(data => {
          processApiResponse(data);
        }).catch(() => { });
      }
    } catch (e) { }

    return response;
  };

  // ===== XMLHttpRequest HOOK =====
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._smd_url = url;
    return originalXHROpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      try {
        const url = this._smd_url || '';
        if (shouldIntercept(url)) {
          const data = JSON.parse(this.responseText);
          processApiResponse(data);
        }
      } catch (e) { }
    });
    return originalXHRSend.apply(this, args);
  };

  // Yakalanması gereken URL mi?
  function shouldIntercept(url) {
    return url.includes('/graphql/') ||
      url.includes('/i/api/') ||
      url.includes('TweetDetail') ||
      url.includes('TweetResultByRestId') ||
      url.includes('UserTweets') ||
      url.includes('HomeTimeline') ||
      url.includes('HomeLatestTimeline') ||
      url.includes('SearchTimeline') ||
      url.includes('ListLatestTweetsTimeline') ||
      url.includes('Bookmarks') ||
      url.includes('Likes') ||
      url.includes('UserMedia');
  }

  // API yanıtını işle
  function processApiResponse(data) {
    const videos = [];
    findTweetsWithVideos(data, videos, 0);

    if (videos.length > 0) {
      // Her videoyu depola
      videos.forEach(v => {
        capturedVideos.set(v.tweetId, {
          variants: v.variants,
          thumbnail: v.thumbnail
        });
      });

      // Content script'e bildir (CustomEvent ile)
      window.dispatchEvent(new CustomEvent('smd-videos-captured', {
        detail: { videos: videos }
      }));
    }
  }

  // Tweet verilerinde video ara (derin arama)
  function findTweetsWithVideos(obj, results, depth) {
    if (depth > 25 || !obj || typeof obj !== 'object') return;

    // Tweet benzeri nesne mi kontrol et
    const tweetId = obj.rest_id || obj.id_str;

    if (tweetId) {
      // Video bilgisi içeren media dizisini ara
      const mediaSources = [
        obj.legacy?.extended_entities?.media,
        obj.legacy?.entities?.media,
        obj.extended_entities?.media,
        obj.entities?.media
      ];

      for (const media of mediaSources) {
        if (!Array.isArray(media)) continue;

        for (const m of media) {
          if (m.video_info && m.video_info.variants) {
            const mp4Variants = m.video_info.variants
              .filter(v => v.content_type === 'video/mp4')
              .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

            if (mp4Variants.length > 0) {
              // Daha önce bu tweet'i bulduk mu kontrol et
              const existing = results.find(r => r.tweetId === tweetId);
              if (!existing) {
                results.push({
                  tweetId: tweetId,
                  variants: mp4Variants.map(v => ({
                    url: v.url,
                    bitrate: v.bitrate || 0,
                    content_type: v.content_type
                  })),
                  thumbnail: m.media_url_https || null,
                  duration: m.video_info.duration_millis || null,
                  aspectRatio: m.video_info.aspect_ratio || null
                });
              }
            }
          }
        }
      }
    }

    // Alt nesnelere dalma
    if (Array.isArray(obj)) {
      for (const item of obj) {
        findTweetsWithVideos(item, results, depth + 1);
      }
    } else {
      for (const key of Object.keys(obj)) {
        try {
          findTweetsWithVideos(obj[key], results, depth + 1);
        } catch (e) { }
      }
    }
  }

  // ===== ON-DEMAND TWEET FETCH =====
  // Depoda yoksa doğrudan Twitter API'sinden tweet verisini çeker
  async function fetchTweetById(tweetId) {
    // Zaten depodaysa döndür
    if (capturedVideos.has(tweetId)) {
      return capturedVideos.get(tweetId);
    }

    try {
      // CSRF token'ı cookie'den al
      const csrfToken = getCsrfToken();
      if (!csrfToken) {
        console.warn('[SMD] CSRF token bulunamadı');
        return null;
      }

      // TweetResultByRestId GraphQL sorgusu
      const variables = {
        tweetId: tweetId,
        withCommunity: false,
        includePromotedContent: false,
        withVoice: false
      };

      const features = {
        creator_subscriptions_tweet_preview_api_enabled: true,
        communities_web_enable_tweet_community_results_fetch: true,
        c9s_tweet_anatomy_moderator_badge_enabled: true,
        articles_preview_enabled: true,
        responsive_web_edit_tweet_api_enabled: true,
        graphql_is_translatable_rweb_tweet_is_translatable: true,
        view_counts_everywhere_api_enabled: true,
        longform_notetweets_consumption_enabled: true,
        responsive_web_twitter_article_tweet_consumption_enabled: true,
        tweet_awards_web_tipping_enabled: false,
        creator_subscriptions_quote_tweet_preview_enabled: false,
        freedom_of_speech_not_reach_fetch_enabled: true,
        standardized_nudges_misinfo: true,
        tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
        rweb_video_timestamps_enabled: true,
        longform_notetweets_rich_text_read_enabled: true,
        longform_notetweets_inline_media_enabled: true,
        responsive_web_enhance_cards_enabled: false,
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
        responsive_web_graphql_timeline_navigation_enabled: true,
        responsive_web_media_download_video_enabled: false,
        tweetypie_unmention_optimization_enabled: true,
        responsive_web_text_conversations_enabled: true,
        vibe_api_enabled: true,
        interactive_text_enabled: true,
        blue_business_profile_image_shape_enabled: true,
        premium_content_api_read_enabled: false
      };

      const fieldToggles = {
        withArticleRichContentState: true,
        withArticlePlainText: false,
        withGrokAnalyze: false,
        withDisallowedReplyControls: false
      };

      const params = new URLSearchParams({
        variables: JSON.stringify(variables),
        features: JSON.stringify(features),
        fieldToggles: JSON.stringify(fieldToggles)
      });

      const response = await originalFetch(`https://x.com/i/api/graphql/xOhkmRac04YFZmOzU9PJHg/TweetResultByRestId?${params}`, {
        method: 'GET',
        headers: {
          'authorization': `Bearer ${BEARER_TOKEN}`,
          'x-csrf-token': csrfToken,
          'x-twitter-auth-type': 'OAuth2Session',
          'x-twitter-active-user': 'yes',
          'x-twitter-client-language': 'en'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        console.warn(`[SMD] Tweet fetch başarısız: HTTP ${response.status}`);
        return null;
      }

      const data = await response.json();

      // Videoları çıkar
      const videos = [];
      findTweetsWithVideos(data, videos, 0);

      if (videos.length > 0) {
        videos.forEach(v => {
          capturedVideos.set(v.tweetId, {
            variants: v.variants,
            thumbnail: v.thumbnail
          });
        });

        // Content script'e bildir
        window.dispatchEvent(new CustomEvent('smd-videos-captured', {
          detail: { videos: videos }
        }));

        return capturedVideos.get(tweetId) || null;
      }

      return null;
    } catch (error) {
      console.error('[SMD] Tweet fetch hatası:', error);
      return null;
    }
  }

  // CSRF token'ı cookie'den al
  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/);
    return match ? match[1] : null;
  }

  // Content script'ten gelen sorgulara yanıt ver
  window.addEventListener('smd-query-videos', (event) => {
    const tweetId = event.detail?.tweetId;

    if (tweetId && capturedVideos.has(tweetId)) {
      window.dispatchEvent(new CustomEvent('smd-video-response', {
        detail: {
          tweetId: tweetId,
          data: capturedVideos.get(tweetId)
        }
      }));
    } else if (tweetId && !capturedVideos.has(tweetId)) {
      // Depoda yok → on-demand fetch yap
      fetchTweetById(tweetId).then(data => {
        window.dispatchEvent(new CustomEvent('smd-video-response', {
          detail: {
            tweetId: tweetId,
            data: data,
            fetched: true
          }
        }));
      });
    } else if (!tweetId) {
      // Tüm yakalanmış videoları gönder
      const allVideos = {};
      capturedVideos.forEach((value, key) => {
        allVideos[key] = value;
      });

      window.dispatchEvent(new CustomEvent('smd-video-response', {
        detail: { all: allVideos }
      }));
    }
  });

  console.log('[SMD] Twitter/X API interceptor yüklendi (on-demand fetch aktif)');
})();
