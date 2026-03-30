const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");
const pino = require("pino");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- সেটিংস ও এপিআই ---
const PORT = process.env.PORT || 3000;
const API_KEY = "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"; // তোমার দেওয়া API Key
const PHONE_NUMBER = "8801965064030"; // তোমার মোবাইল নম্বর

// ওয়েব টার্মিনাল ইন্টারফেস
app.get("/", (req, res) => {
    res.send(`
        <html>
        <head><title>AI Agent Terminal</title><style>body{background:#000;color:#0f0;font-family:monospace;padding:20px;}</style></head>
        <body>
            <h3>🚀 AI Agent Live Terminal</h3>
            <div id="logs" style="white-space:pre-wrap; border:1px solid #333; height:80vh; overflow-y:scroll; padding:10px;"></div>
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

// AI রিপ্লাই ফাংশন (Groq/Llama API ব্যবহার করে)
async function getAIReply(userMessage) {
    try {
        const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            messages: [{ role: "user", content: userMessage }],
            model: "llama3-8b-8192", // স্টেবল মডেল
        }, {
            headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" }
        });
        return response.data.choices[0].message.content;
    } catch (e) {
        console.log(e);
        return "দুঃখিত, বর্তমানে এআই রেসপন্স করতে পারছে না।";
    }
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: "silent" }),
    });

    // পেয়ারিং কোড রিকোয়েস্ট
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            const code = await sock.requestPairingCode(PHONE_NUMBER);
            io.emit('log', `\n--------------------------------------`);
            io.emit('log', `লগইন করার জন্য তোমার পেয়ারিং কোড: ${code}`);
            io.emit('log', `--------------------------------------\n`);
        }, 5000);
    }

    sock.ev.on("creds.update", saveCreds);

    // মেসেজ রিসিভ ও অটো-রিপ্লাই
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        const sender = msg.key.remoteJid;

        io.emit('log', `📩 নতুন মেসেজ [${sender}]: ${text}`);

        // AI থেকে রিপ্লাই জেনারেট করা
        const aiReply = await getAIReply(text);
        
        await sock.sendMessage(sender, { text: aiReply });
        io.emit('log', `✅ রিপ্লাই পাঠানো হয়েছে।`);
    });

    sock.ev.on("connection.update", (u) => {
        if (u.connection === "open") io.emit('log', "✅ হোয়াটসঅ্যাপ সফলভাবে কানেক্ট হয়েছে!");
    });
}

server.listen(PORT, () => {
    console.log("Server running on port " + PORT);
    startBot();
});
      
