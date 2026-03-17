#!/bin/bash
set -e

VERSION="3.11.174"
BASE="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${VERSION}"
LIB_DIR="$(dirname "$0")/lib"

echo "PDF.js v${VERSION} をダウンロードしています..."
mkdir -p "$LIB_DIR"

curl -fSL "${BASE}/pdf.min.js"        -o "${LIB_DIR}/pdf.min.js"
curl -fSL "${BASE}/pdf.worker.min.js" -o "${LIB_DIR}/pdf.worker.min.js"

echo ""
echo "完了！ファイル:"
ls -lh "${LIB_DIR}/"
echo ""
echo "次のステップ:"
echo "  1. Chrome で chrome://extensions を開く"
echo "  2. 「デベロッパーモード」を ON にする"
echo "  3. 「パッケージ化されていない拡張機能を読み込む」でこのフォルダを選択"
echo "  4. .pdf の URL を開くと自動的にビューアーが起動します"
