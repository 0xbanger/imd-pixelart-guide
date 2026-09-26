#!/bin/sh
# Run as the ordinary worker user from the extracted package directory.
set -eu
test "$(id -u)" -ne 0 || { printf '%s\n' 'Run as the ordinary worker user, not root.'; exit 1; }
base="$HOME/imd-tools/aseprite-1.3.18.6"
if [ -e "$base/operator-config.json" ] || [ -L "$base/operator-config.json" ] || [ -e "$base/runtime/aseprite" ] || [ -L "$base/runtime/aseprite" ]; then
  printf '%s\n' 'STOPPED: an existing configured installation or retained runtime was found. This command is for first-time setup, not updates. Inspect the installation before changing it; no build was started.' >&2
  exit 1
fi
sh operator/build-on-vps.sh
sh operator/build-mcp-on-vps.sh
node operator/install-integration.cjs
node operator/finalize-installation.cjs
printf '%s\n' 'Installation verified and build files cleaned. Register pixelart when ready: node operator/register-tool.cjs'
exit 0
