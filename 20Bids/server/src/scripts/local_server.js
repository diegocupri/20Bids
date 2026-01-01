
const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());

let syncProcess = null;

// HTML UI
const HTML_UI = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>20Bids Control Panel</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        body { background: #111; color: #eee; font-family: monospace; padding: 20px; display: flex; flex-direction: column; height: 90vh; }
        .controls { display: flex; gap: 20px; margin-bottom: 20px; }
        button { padding: 15px 30px; font-size: 18px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: opacity 0.2s; }
        button:hover { opacity: 0.8; }
        #startBtn { background: #10b981; color: white; }
        #stopBtn { background: #ef4444; color: white; }
        button:disabled { background: #333; color: #555; cursor: not-allowed; }
        #logs { flex: 1; background: #000; border: 1px solid #333; padding: 15px; overflow-y: auto; white-space: pre-wrap; font-size: 14px; border-radius: 8px; }
        .log-entry { margin-bottom: 4px; border-bottom: 1px solid #1a1a1a; padding-bottom: 2px; }
        .status { margin-bottom: 10px; font-size: 14px; color: #888; }
        .badge { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; }
        .running { background: #10b981; box-shadow: 0 0 10px #10b981; }
        .stopped { background: #ef4444; }
    </style>
</head>
<body>
    <h1>20Bids IBKR Sync Controller (JS Native) 🎛️</h1>
    <div class="status">Status: <span id="statusIndicator" class="badge stopped"></span> <span id="statusText">STOPPED</span></div>
    
    <div class="controls">
        <button id="startBtn" onclick="startSync()">▶ START SYNC</button>
        <button id="stopBtn" onclick="stopSync()" disabled>⏹ STOP SYNC</button>
    </div>

    <div id="logs"></div>

    <script>
        const socket = io();
        const logsDiv = document.getElementById('logs');
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const statusText = document.getElementById('statusText');
        const statusIndicator = document.getElementById('statusIndicator');

        socket.on('status', (isRunning) => {
            if (isRunning) {
                startBtn.disabled = true;
                stopBtn.disabled = false;
                statusText.innerText = 'RUNNING (Syncing every 60s)';
                statusText.style.color = '#10b981';
                statusIndicator.className = 'badge running';
            } else {
                startBtn.disabled = false;
                stopBtn.disabled = true;
                statusText.innerText = 'STOPPED';
                statusText.style.color = '#ef4444';
                statusIndicator.className = 'badge stopped';
            }
        });

        socket.on('log', (msg) => {
            const entry = document.createElement('div');
            entry.className = 'log-entry';
            entry.textContent = msg;
            logsDiv.appendChild(entry);
            logsDiv.scrollTop = logsDiv.scrollHeight;
        });

        function startSync() {
            socket.emit('start');
        }

        function stopSync() {
            socket.emit('stop');
        }
    </script>
</body>
</html>
`;

app.get('/', (req, res) => {
    res.send(HTML_UI);
});

io.on('connection', (socket) => {
    console.log('UI Connected');
    socket.emit('status', syncProcess !== null);

    socket.on('start', () => {
        if (syncProcess) return;

        console.log('Starting sync process...');
        io.emit('log', '>>> Starting IBKR Sync Script...');

        const scriptRelativePath = './src/scripts/sync_ibkr_to_cloud.ts';
        const cwd = path.resolve(__dirname, '../..'); // server/

        console.log(`Spawning npx ts-node ${scriptRelativePath} in ${cwd}`);

        // Using 'npx' command handles path resolution for node_modules/.bin
        syncProcess = spawn('npx', ['ts-node', scriptRelativePath], {
            cwd: cwd,
            shell: true
        });

        io.emit('status', true);

        syncProcess.stdout.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg) io.emit('log', msg);
        });

        syncProcess.stderr.on('data', (data) => {
            const msg = `ERROR: ${data.toString().trim()}`;
            if (msg) io.emit('log', msg);
        });

        syncProcess.on('close', (code) => {
            console.log(`Child process exited with code ${code}`);
            io.emit('log', `>>> Process exited with code ${code}`);
            syncProcess = null;
            io.emit('status', false);
        });
    });

    socket.on('stop', () => {
        if (syncProcess) {
            io.emit('log', '>>> Stopping process...');
            syncProcess.kill();
            syncProcess = null;
            io.emit('status', false);
        }
    });
});

const PORT = 3456;
server.listen(PORT, () => {
    console.log(`Control Panel running at http://localhost:${PORT}`);
});
