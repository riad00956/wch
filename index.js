const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestBaileysVersion, 
    DisconnectReason 
} = require("@whiskeysockets/baileys");
const express = require("express");
const axios = require("axios");
const pino = require("pino");
const fs = require("fs"); // fs-extra বদলে fs ব্যবহার করা হয়েছে

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = "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";
const PHONE_NUMBER = "8801965064030";
let logs = ["System Rebooted..."];
let pairingCode = null;

app.get("/", (req, res) => {
    let logHTML = logs.slice(-15).map(l => `<div>> ${l}</div>`).join("");
    res.send(`
        <html>
        <head>
            <title>AI Agent Terminal</title>
            <meta http-equiv="refresh" content="7">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>body{background:#000; color:#0f0; font-family:monospace; padding:20px;} #term{border:1px solid #333; padding:10px; height:45vh; overflow-y:auto; background:#050505;}</style>
        </head>
        <body>
            <h3>🚀 Live Monitor</h3>
            <div id="term">${logHTML}</div>
            ${pairingCode ? `<div style="background:#fff; color:#000; padding:20px; margin-top:20px; text-align:center;"><h2>CODE: ${pairingCode}</h2></div>` : ""}
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
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    if (!sock.authState.creds.registered) {
        await delay(5000);
        try {
            pairingCode = await sock.requestPairingCode(PHONE_NUMBER);
            logs.push("✅ Pairing Code Generated.");
        } catch (err) { logs.push("❌ Error: " + err.message); }
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (u) => {
        if (u.connection === "open") {
            logs.push("🎊 BOT IS ONLINE!");
            pairingCode = null;
        }
        if (u.connection === "close") startBot();
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        const sender = msg.key.remoteJid;

        if (text) {
            logs.push(`📩 Msg: ${text}`);
            try {
                const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
                    messages: [{ role: "user", content: text }],
                    model: "llama3-8b-8192"
                }, {
                    headers: { "Authorization": "Bearer " + API_KEY }
                });
                await sock.sendMessage(sender, { text: res.data.choices[0].message.content });
                logs.push("📤 Replied.");
            } catch (e) { logs.push("⚠️ AI Error"); }
        }
    });
}

app.listen(PORT, () => startBot());
