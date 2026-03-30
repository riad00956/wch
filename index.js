const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const express = require("express");
const axios = require("axios");
const pino = require("pino");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = "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";
const PHONE_NUMBER = "8801650194635";

let logs = ["System refreshing..."];
let pairingCode = null;

app.get("/", (req, res) => {
    let logHTML = logs.slice(-10).map(l => `<div>> ${l}</div>`).join("");
    res.send(`
        <html>
        <head>
            <title>WA Monitor</title>
            <meta http-equiv="refresh" content="8">
            <style>body{background:#000; color:#0f0; font-family:monospace; padding:20px;} #term{border:1px solid #333; padding:10px; height:40vh; overflow-y:auto; background:#050505;}</style>
        </head>
        <body>
            <h3>🚀 WhatsApp AI Terminal</h3>
            <div id="term">${logHTML}</div>
            ${pairingCode ? `<div style="background:white; color:black; padding:20px; margin-top:20px; text-align:center;"><h2>PAIRING CODE: ${pairingCode}</h2><p>এটি আপনার হোয়াটসঅ্যাপে দিন</p></div>` : "<p>সেশন চেক করা হচ্ছে...</p>"}
        </body>
        </html>
    `);
});

async function startBot() {
    // সেশন পাথ নিশ্চিত করা
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
        logs.push("Requesting new pairing code...");
        await delay(8000); // রেন্ডারকে সময় দিন
        try {
            pairingCode = await sock.requestPairingCode(PHONE_NUMBER);
            logs.push("✅ New Code generated: " + pairingCode);
        } catch (err) {
            logs.push("❌ Error: " + err.message);
        }
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (u) => {
        const { connection, lastDisconnect } = u;
        if (connection === "open") {
            logs.push("🎊 SUCCESS: BOT IS ONLINE!");
            pairingCode = null;
        }
        if (connection === "close") {
            logs.push("🔄 Connection closed. Re-initializing...");
            startBot();
        }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        
        if (text) {
            logs.push(`📩 Received: ${text.substring(0,10)}...`);
            try {
                const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
                    messages: [{ role: "user", content: text }],
                    model: "llama3-8b-8192"
                }, {
                    headers: { "Authorization": "Bearer " + API_KEY, "Content-Type": "application/json" }
                });
                await sock.sendMessage(msg.key.remoteJid, { text: res.data.choices[0].message.content });
                logs.push("📤 Replied.");
            } catch (e) {
                logs.push("⚠️ AI Error: " + (e.response?.data?.error?.message || e.message));
            }
        }
    });
}

app.listen(PORT, () => startBot());
