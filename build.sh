#!/bin/bash
# Social Media Downloader - ZIP Build Script
# Kullanim: ./build.sh

VERSION=$(grep '"version"' manifest.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')
FILENAME="social-media-downloader-v${VERSION}.zip"

echo "Social Media Downloader v${VERSION} paketleniyor..."
echo ""

# Eski build'i temizle
rm -f "$FILENAME"

# ZIP olustur (gereksiz dosyalari haric tut)
zip -r "$FILENAME" \
  manifest.json \
  background.js \
  popup/ \
  content/ \
  styles/ \
  icons/ \
  -x "*.DS_Store" \
  -x "__MACOSX/*" \
  -x "*.map"

echo ""
echo "Paket olusturuldu: $FILENAME"
echo "Boyut: $(du -h "$FILENAME" | cut -f1)"
echo ""
echo "Bu dosyayi GitHub Releases'a yukleyebilirsiniz."
