#!/bin/bash

# scripts/fetch_assets_git.sh
# -------------------------------------------------------------------------
# 1. Downloads pre-compiled v86 Core
# 2. Downloads specific OS images from i.copy.sh
# -------------------------------------------------------------------------

set -e

ASSET_DIR="public/assets/v86"

# 1. Clean & Init
echo ">>> Cleaning up old assets..."
rm -rf "$ASSET_DIR"
mkdir -p "$ASSET_DIR"

# 2. Fetch Pre-Compiled Core Files (WASM + JS)
echo ">>> Downloading v86 Core..."
curl -L -o "$ASSET_DIR/libv86.js" https://github.com/copy/v86/releases/download/v86-latest/libv86.js
curl -L -o "$ASSET_DIR/v86.wasm" https://github.com/copy/v86/releases/download/v86-latest/v86.wasm

# 3. Fetch BIOS
echo ">>> Downloading BIOS..."
curl -L -o "$ASSET_DIR/seabios.bin" https://github.com/copy/v86/raw/master/bios/seabios.bin
curl -L -o "$ASSET_DIR/vgabios.bin" https://github.com/copy/v86/raw/master/bios/vgabios.bin

# 4. Fetch OS Images (Using your list)
echo ">>> Downloading OS Images..."
# Note: --output-dir requires newer curl. Using cd for compatibility.
cd "$ASSET_DIR"

curl --compressed --remote-name-all https://i.copy.sh/{linux.iso,linux3.iso,linux4.iso,buildroot-bzimage68.bin,TinyCore-11.0.iso,oberon.img,msdos.img,openbsd-floppy.img,kolibri.img,windows101.img,os8.img,freedos722.img,mobius-fd-release5.img,msdos622.img}

cd ../../../

echo "--------------------------------------------------------"
echo "✅ Assets successfully fetched."
ls -lh "$ASSET_DIR"
echo "--------------------------------------------------------"
