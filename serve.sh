#!/bin/sh
cd "$(dirname "$0")"
echo "G25 Maps → http://127.0.0.1:8765"
exec python3 -m http.server 8765 --bind 127.0.0.1
