## Social Media Downloader v1.1.3

### YouTube Fix
- YouTube medya indirmede URL cozumleme akisi duzeltildi.
- Akis seciminde sadece dogrudan medya host'u (`googlevideo.com`) kabul ediliyor.
- Bu sayede "video secenegi HTML dosyasi indiriyor" problemi giderildi.

### Technical Notes
- `signatureCipher` URL parse akisinda gereksiz decode adimi kaldirildi.
- Uygun olmayan kaynak URL'leri indirme listesine alinmiyor.

