#!/bin/sh
# Build only the Apache-2.0 MCP connector. Aseprite is supplied separately.
set -eu
umask 077
base="$HOME/imd-tools/aseprite-1.3.18.6"
mkdir -p "$base/downloads" "$base/build-runtime" "$base/mcp-source"
go_archive="$base/downloads/go1.27.1.linux-amd64.tar.gz"
if [ ! -f "$go_archive" ]; then
  curl --fail --location --proto '=https' --tlsv1.2 'https://go.dev/dl/go1.27.1.linux-amd64.tar.gz' -o "$go_archive"
fi
printf '%s  %s\n' '63d339f0da5ab53635a56f2490a7984dfe12dfcff22ad749f63edaf590168445' "$go_archive" | sha256sum -c -
if [ ! -x "$base/build-runtime/go/bin/go" ]; then
  tar -xzf "$go_archive" -C "$base/build-runtime"
fi
source_archive="$base/downloads/aseprite-mcp-0cd6aac.tar.gz"
if [ ! -f "$source_archive" ]; then
  curl --fail --location --proto '=https' --tlsv1.2 'https://codeload.github.com/mattt/aseprite-mcp/tar.gz/0cd6aac4420a603ec10d19c9fe49a1bb5f6bff8b' -o "$source_archive"
fi
printf '%s  %s\n' '7440947a078f5fac36d7466440a6f09770df0b99fc3c21bf6a6cd9c3434cde98' "$source_archive" | sha256sum -c -
if [ ! -f "$base/mcp-source/go.mod" ]; then
  tar -xzf "$source_archive" --strip-components=1 -C "$base/mcp-source"
fi
cd "$base/mcp-source"
export PATH="$base/build-runtime/go/bin:$PATH"
export GOMAXPROCS=1
export CGO_ENABLED=0
export GOFLAGS='-p=1'
export GOTOOLCHAIN=local
# Keep all build caches private to this installation, so cleanup never touches
# another Go project's shared cache.
export GOCACHE="$base/build-cache"
export GOPATH="$base/build-gopath"
export GOMODCACHE="$base/build-gopath/pkg/mod"
nice -n 15 go build -trimpath -o "$base/aseprite-mcp" ./cmd/aseprite-mcp
printf '%s\n' 'MCP CONNECTOR BUILD COMPLETE.'
exit 0
