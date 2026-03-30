const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");
const pino = require("pino");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const API_KEY = "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";
const PHONE_NUMBER = "8801965064030";

// --- লাইভ টার্মিনাল পেজ ---
app.get("/", (req, res) => {
    res.send(`
        <html>
        <head>
            <title>AI Agent Terminal</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { background: #000; color: #0f0; font-family: 'Courier New', monospace; padding: 15px; margin: 0; }
                #terminal { height: 75vh; overflow-y: auto; border: 1px dashed #333; padding: 10px; background: #050505; font-size: 13px; }
                .code-box { background: #1a1a1a; border: 2px solid #0f0; padding: 20px; margin-top: 15px; text-align: center; }
                .pairing-code { font-size: 32px; color: #fff; letter-spacing: 5px; font-weight: bold; }
                .btn { background: #0f0; color: #000; border: none; padding: 10px 20px; cursor: pointer; margin-top: 10px; font-weight: bold; }
                .status { color: #888; font-style: italic; }
            </style>
        </head>
        <body>
            <h3>🚀 System Live Dashboard</h3>
            <div id="terminal">Initializing system logs...</div>
            <div id="pairing-section"></div>

            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                const term = document.getElementById('terminal');
                const pairSection = document.getElementById('pairing-section');

                socket.on('log', (msg) => {
                    const line = document.createElement('div');
                    line.innerHTML = "[" + new Date().toLocaleTimeString() + "] " + msg;
                    term.appendChild(line);
                    term.scrollTop = term.scrollHeight;
                });

                socket.on('code', (code) => {
                    pairSection.innerHTML = \`
                        <div class="code-box">
                            <div>WHATSAPP PAIRING CODE</div>
                            <div class="pairing-code" id="pcode">\${code}</div>
                            <button class="btn" onclick="copyCode('\${code}')">COPY CODE</button>
                        </div>
                    \`;
                });

                function copyCode(c) {
                    navigator.clipboard.writeText(c);
                    alert("Code Copied: " + c);
                }
            </script>
        </body>
        </html>
    `);
});

// --- ব্যাকগ্রাউন্ড প্রসেস ---
async function startBot() {
    io.emit('log', "<span class='status'>Starting WhatsApp engine...</span>");
    
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        const { version } = await fetchLatestBaileysVersion();
        
        const sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: "silent" }),
            printQRInTerminal: false
        });

        io.emit('log', "System: Connection state initialized.");

        if (!sock.authState.creds.registered) {
            io.emit('log', "System: Device not registered. Requesting Pairing Code...");
            await delay(10000); // রেন্ডার সার্ভার স্টেবল হতে সময় দেয়
            
            const code = await sock.requestPairingCode(PHONE_NUMBER);
            io.emit('log', "✅ SUCCESS: Pairing Code Received.");
            io.emit('code', code); // সরাসরি বড় করে কোড দেখাবে
        }

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", (update) => {
            const { connection } = update;
            if (connection === "open") io.emit('log', "<b style='color:white'>✅ BOT CONNECTED & ONLINE</b>");
            if (connection === "connecting") io.emit('log', "🔄 Connecting to WhatsApp Servers...");
            if (connection === "close") io.emit('log', "❌ Connection Closed. Retrying...");
        });

        sock.ev.on("messages.upsert", async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            io.emit('log', "📩 Incoming: " + text);
            
            try {
                const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
                    messages: [{ role: "user", content: text }],
                    model: "llama3-8b-8192",
                }, {
                    headers: { "Authorization": "Bearer " + API_KEY }
                });
                await sock.sendMessage(msg.key.remoteJid, { text: res.data.choices[0].message.content });
                io.emit('log', "📤 AI Replied successfully.");
            } catch (e) {
                io.emit('log', "⚠️ AI Error: " + e.message);
            }
        });

    } catch (err) {
        io.emit('log', "<span style='color:red'>Critical Error: " + err.message + "</span>");
    }
}

server.listen(PORT, () => {
    console.log("Server port: " + PORT);
    startBot();
});
