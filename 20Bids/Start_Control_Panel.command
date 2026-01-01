#!/bin/bash
echo "Starting 20Bids Control Panel..."
cd "$(dirname "$0")"

# Open the browser after a slight delay
(sleep 4 && open "http://localhost:3333") &

# Start the server (Always compile first to ensure robustness)
cd server

echo "Compiling TypeScript..."
# Suppress output unless error
npm run build > /dev/null

echo "Running Control Panel server..."
# Run the compiled JS version using standard Node (no ts-node fragility)
node dist/scripts/local_server.js
