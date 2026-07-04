#!/bin/sh
set -e

echo "Applying database migrations..."
npx drizzle-kit migrate --config drizzle.config.ts

echo "Starting server..."
exec node dist/index.js
