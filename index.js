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

// ওয়েব ইন্টারফেস
app.get("/", (req, res) => {
    res.send(`
        <html>
        <head><title>Terminal</title><style>body{background:#000;color:#0f0;font-family:monospace;padding:20px;} #logs{height:70vh;overflow-y:auto;border:1px solid #333;padding:10px;background:#111;word-break:break-all;}</style></head>
        <body>
            <h3>🚀 AI Agent Terminal (Live)</h3>
            <div id="logs">অপেক্ষা করুন, সেশন শুরু হচ্ছে...</div>
            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                const logDiv = document.getElementById('logs');
                socket.on('log', (msg) => {
                    if(logDiv.innerHTML.includes("অপেক্ষা করুন")) logDiv.innerHTML = "";
                    logDiv.innerHTML += msg + "<br>";
                    logDiv.scrollTop = logDiv.scrollHeight;
                });
            </script>
        </body>
        </html>
    `);
});

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false
    });

    // পেয়ারিং কোড জেনারেশন
    if (!sock.authState.creds.registered) {
        io.emit('log', "🔄 পেয়ারিং কোড তৈরি হচ্ছে, অনুগ্রহ করে ১০-২০ সেকেন্ড অপেক্ষা করুন...");
        await delay(8000); // রেন্ডারের জন্য একটু সময় দেওয়া প্রয়োজন
        try {
            const code = await sock.requestPairingCode(PHONE_NUMBER);
            io.emit('log', "<br>**************************************");
            io.emit('log', "👉 আপনার লগইন কোড: <b>" + code + "</b>");
            io.emit('log', "**************************************<br>");
            io.emit('log', "১. WhatsApp > Linked Devices > Link with phone number এ যান।");
            io.emit('log', "২. উপরের কোডটি ইনপুট দিন।");
        } catch (err) {
            io.emit('log', "❌ কোড জেনারেট করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।");
        }
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (u) => {
        const { connection } = u;
        if (connection === "open") io.emit('log', "✅ সফলভাবে কানেক্ট হয়েছে!");
        if (connection === "connecting") io.emit('log', "🔄 সার্ভারের সাথে কানেক্ট হচ্ছে...");
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        const sender = msg.key.remoteJid;
        
        io.emit('log', "📩 নতুন মেসেজ এসেছে: " + text);
        
        try {
            const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
                messages: [{ role: "user", content: text }],
                model: "llama3-8b-8192",
            }, {
                headers: { "Authorization": "Bearer " + API_KEY }
            });
            const reply = response.data.choices[0].message.content;
            await sock.sendMessage(sender, { text: reply });
        } catch (e) {
            io.emit('log', "❌ এআই রিপ্লাই দিতে পারেনি।");
        }
    });
}

server.listen(PORT, () => {
    console.log("Server running on " + PORT);
    startBot();
});
