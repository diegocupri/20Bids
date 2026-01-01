#!/bin/bash
echo "Starting 20Bids Control Panel (JS Mode)..."
console_log="debug_log.txt"

cd "$(dirname "$0")"

# Open the browser after a slight delay
(sleep 4 && open "http://localhost:3456") &

# Start the server (Run pure JS server, no compilation needed)
cd server

echo "Running Control Panel server on port 3456..."
# Using standard node to run the JS server
node src/scripts/local_server.js 2>&1 | tee ../$console_log

echo "Server stopped or crashed."
read -p "Press ENTER to close window..."
