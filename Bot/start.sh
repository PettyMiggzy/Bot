#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Starting Miggzy Bot..."
echo "PORT=${PORT:-10000}"
echo "Render URL: ${RENDER_EXTERNAL_URL:-not set}"

# START THE CORRECT ENTRY (Bot/index.js)
node Bot/index.js
