#!/bin/sh
# usage: render.sh <model.py> <outbase> <width> <height>
S="$(dirname "$0")"
python -I -X utf8 -c "import sys; sys.path.insert(0, r'$S'); sys.argv=['x', r'$2']; exec(open(r'$1', encoding='utf-8').read())" || exit 1
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=${5:-1} --window-size=$3,$4 --screenshot="$(cygpath -w "$2.png")" "file:///$(cygpath -m "$2.svg")" >/dev/null 2>&1
ls -la "$2".*
