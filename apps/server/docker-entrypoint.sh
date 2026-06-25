#!/bin/sh
set -e

echo "Applying database migrations..."
npx drizzle-kit migrate

echo "Starting server..."
exec node dist/index.js
