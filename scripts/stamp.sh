#!/bin/sh
# Cache-busts the site's CSS/JS: stamps ?v=<timestamp> onto every local asset reference. Run before committing
# front-end changes (GitHub Pages lets browsers cache files for 10 minutes).
cd "$(dirname "$0")/.." || exit 1
v=$(date +%Y%m%d%H%M%S)
sed -i -E "s#(css/style\.css|js/app\.js|config\.js)(\?v=[0-9]+)?\"#\1?v=$v\"#g" index.html
sed -i -E "s#from \"\./(store|format|about)\.js(\?v=[0-9]+)?\"#from \"./\1.js?v=$v\"#g" js/app.js js/store.js
echo "stamped $v"
