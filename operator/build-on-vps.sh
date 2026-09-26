#!/bin/sh
# Run on the operator's Ubuntu machine as their ordinary worker user.
# Downloads source from upstream and builds locally. Do not redistribute the result.
# Ubuntu prerequisites: build-essential cmake ninja-build pkg-config unzip libxcb1-dev
# libx11-dev libxcursor-dev libxi-dev libxrandr-dev libgl1-mesa-dev libfontconfig1-dev
set -eu
umask 077
base="$HOME/imd-tools/aseprite-1.3.18.6"
mkdir -p "$base/downloads" "$base/source" "$base/build-runtime"
archive="$base/downloads/Aseprite-v1.3.18.6-Source.zip"
if [ ! -f "$archive" ]; then
  curl --fail --location --proto '=https' --tlsv1.2 'https://github.com/aseprite/aseprite/releases/download/v1.3.18.6/Aseprite-v1.3.18.6-Source.zip' -o "$archive"
fi
printf '%s  %s\n' 'fa9dd07a0c2a5ec91a4166333296bbb9e5c237933b59875d0cfee849d2358306' "$archive" | sha256sum -c -
if [ ! -f "$base/source/CMakeLists.txt" ]; then
  unzip -q "$archive" -d "$base/source"
fi
cmake -U HAVE_XCB_XLIB_H -S "$base/source" -B "$base/build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DLAF_BACKEND=none \
  -DENABLE_SCRIPTING=ON -DENABLE_NEWS=OFF -DENABLE_UPDATER=OFF \
  -DENABLE_DRM=OFF -DENABLE_STEAM=OFF -DENABLE_WEBSOCKET=OFF \
  -DENABLE_TESTS=OFF -DENABLE_I18N_STRINGS=OFF
# Leave capacity for the contributor's live IMD worker.
nice -n 15 cmake --build "$base/build" --target aseprite --parallel 2
"$base/build/bin/aseprite" --version
printf '%s\n' 'ASEPRITE SOURCE BUILD COMPLETE. This local executable is not part of the shared skill package.'
exit 0
