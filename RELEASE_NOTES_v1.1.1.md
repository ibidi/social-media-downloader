## Social Media Downloader v1.1.1

### Fixes
- Popup medya listesi render akisi guvenli DOM API'ye tasindi (`innerHTML` kaldirildi).
- Twitter fallback re-enjeksiyon akisi duzeltildi:
  - `twitter-interceptor.js` (MAIN world)
  - `twitter.js`
  - `styles/content.css`
- Re-enjeksiyon sonrasi cift hook/observer olusmasini engellemek icin tek-seferlik yukleme guard'lari eklendi.

### Performance
- Twitter ve Instagram tarafinda MutationObserver tetiklemeleri debounce edildi.
- Twitter tarafinda periyodik polling kaldirildi, SPA navigation algilama ile degistirildi.
- YouTube tarafinda URL degisimi kontrolu debounce edildi ve SPA history hook ile desteklendi.

### Maintenance
- Popup surum etiketi manifestten dinamik okunacak sekilde guncellendi.
- Kullanilmayan `storage` izni manifestten kaldirildi.

