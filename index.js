const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");
const pino = require("pino");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const API_KEY = "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";
const PHONE_NUMBER = "8801965064030";

// সেশন ফোল্ডার নিশ্চিত করা
if (!fs.existsSync('./auth_info')) {
    fs.mkdirSync('./auth_info');
}

app.get("/", (req, res) => {
    res.send(`
        <html>
        <head><title>Terminal</title><style>body{background:#000;color:#0f0;font-family:monospace;padding:20px;}</style></head>
        <body>
            <h3>🚀 AI Agent Live Terminal</h3>
            <div id="logs" style="white-space:pre-wrap; border:1px solid #333; height:70vh; overflow-y:scroll; padding:10px; background:#111;"></div>
            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                const logDiv = document.getElementById('logs');
                socket.on('log', (msg) => {
                    logDiv.innerHTML += msg + "\\n";
                    logDiv.scrollTop = logDiv.scrollHeight;
                });
            </script>
        </body>
        </html>
    `);
});

async function getAIReply(userMessage) {
    try {
        const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            messages: [{ role: "user", content: userMessage }],
            model: "llama3-8b-8192",
        }, {
            headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" }
        });
        return response.data.choices[0].message.content;
    } catch (e) {
        return "AI is currently busy.";
    }
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false
    });

    if (!sock.authState.creds.registered) {
        // রেন্ডারে কোড জেনারেশনে একটু দেরি করা ভালো
        await delay(5000);
        const code = await sock.requestPairingCode(PHONE_NUMBER);
        io.emit('log', "\n--------------------------------------");
        io.emit('log', "YOUR PAIRING CODE: " + code);
        io.emit('log', "--------------------------------------\n");
        console.log("Pairing Code generated: " + code);
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        const sender = msg.key.remoteJid;
        io.emit('log', "📩 New Message: " + text);
        const aiReply = await getAIReply(text);
        await sock.sendMessage(sender, { text: aiReply });
    });

    sock.ev.on("connection.update", (u) => {
        const { connection, lastDisconnect } = u;
        if (connection === "open") io.emit('log', "✅ Connected!");
        if (connection === "connecting") io.emit('log', "🔄 Connecting...");
    });
}

// সার্ভার আগে স্টার্ট হবে যাতে Render "Bad Gateway" না দেয়
server.listen(PORT, () => {
    console.log("Server is listening on port " + PORT);
    io.emit('log', "Server started. Waiting for WhatsApp...");
    startBot();
});
