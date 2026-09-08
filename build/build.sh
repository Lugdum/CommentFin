#!/usr/bin/env bash
# Build the Comment Track plugin without any host toolchain.
# Runs Node (bundle the overlay) then the .NET SDK (build + package the plugin),
# both in throwaway containers. Output: dist/commentfin_<version>.zip
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NODE_IMAGE="node:22-alpine"
SDK_IMAGE="mcr.microsoft.com/dotnet/sdk:9.0"
UID_GID="$(id -u):$(id -g)"

echo ">> [1/3] Bundling the client overlay (esbuild)…"
docker run --rm -u "$UID_GID" \
  -v "$ROOT":/work -w /work/client \
  -e npm_config_cache=/tmp/.npm \
  "$NODE_IMAGE" sh -c "npm ci --no-audit --no-fund && node esbuild.mjs"

echo ">> [2/3] Building the plugin (.NET 9)…"
docker run --rm -u "$UID_GID" \
  -v "$ROOT":/work -w /work \
  -e DOTNET_CLI_HOME=/tmp -e NUGET_PACKAGES=/tmp/.nuget -e DOTNET_CLI_TELEMETRY_OPTOUT=1 \
  "$SDK_IMAGE" \
  dotnet publish src/Jellyfin.Plugin.CommentTrack/Jellyfin.Plugin.CommentTrack.csproj \
    -c Release -o /work/dist/publish -p:DebugType=none -p:DebugSymbols=false

echo ">> [3/3] Packaging…"
VERSION="$(grep -oP '(?<=<Version>)[^<]+' src/Jellyfin.Plugin.CommentTrack/Jellyfin.Plugin.CommentTrack.csproj | head -1)"
VERSION="${VERSION:-0.0.0.0}"
mkdir -p dist
rm -f "dist/commentfin_${VERSION}.zip"
# Ship only the plugin DLL; Microsoft.Data.Sqlite + Newtonsoft (used only via
# reflection on File Transformation's own copy) come from the host / FT.
# .deps.json is dropped on purpose - it can confuse Jellyfin's plugin load context.
( cd dist/publish && zip -qr "../commentfin_${VERSION}.zip" \
    Jellyfin.Plugin.CommentTrack.dll )
echo ">> done: dist/commentfin_${VERSION}.zip"
unzip -l "dist/commentfin_${VERSION}.zip"
