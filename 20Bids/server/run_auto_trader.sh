#!/bin/bash
# 20Bids Auto Trader - Launch Script
# 
# This script is designed to be run by cron or launchd at 16:25 Spain time (10:25 ET).
# 
# To install as a cron job, run:
#   crontab -e
#   Add line: 25 16 * * 1-5 /path/to/20Bids/20Bids/server/run_auto_trader.sh >> /tmp/auto_trader.log 2>&1

cd "$(dirname "$0")"

echo "=============================================="
echo "20Bids Auto Trader - $(date)"
echo "=============================================="

# Ensure we're in the server directory
if [ ! -f "package.json" ]; then
    echo "ERROR: Not in server directory. Expected to find package.json"
    exit 1
fi

# Check if IB Gateway is running (check if port 7497 is open)
if ! nc -z localhost 7497 2>/dev/null; then
    echo "WARNING: IB Gateway does not appear to be running on port 7497"
    echo "Proceeding anyway - the script will retry connection..."
fi

# Run the auto trader
echo "Starting auto_trader.ts..."
npx ts-node src/scripts/auto_trader.ts

echo ""
echo "Auto Trader finished at $(date)"
echo "=============================================="
