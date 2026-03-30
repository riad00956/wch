const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const express = require("express");
const axios = require("axios");
const pino = require("pino");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// আপনার সঠিক এপিআই কি এবং নম্বর
const API_KEY = "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";
const PHONE_NUMBER = "8801965064030";
let logs = ["System Started..."];
let pairingCode = null;

app.get("/", (req, res) => {
    let logHTML = logs.slice(-15).map(l => `<div style="margin-bottom:5px;">> ${l}</div>`).join("");
    res.send(`
        <html>
        <head>
            <title>AI Monitor</title>
            <meta http-equiv="refresh" content="7">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>body{background:#000; color:#0f0; font-family:monospace; padding:20px; font-size:13px;} #term{border:1px solid #333; padding:15px; height:50vh; overflow-y:auto; background:#050505;}</style>
        </head>
        <body>
            <h3>🚀 AI Agent Dashboard</h3>
            <div id="term">${logHTML}</div>
            ${pairingCode ? `<div style="background:white; color:black; padding:15px; margin-top:20px; text-align:center;"><h2>CODE: ${pairingCode}</h2></div>` : ""}
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
        if (u.connection === "close") {
            logs.push("🔄 Connection lost. Reconnecting...");
            setTimeout(startBot, 5000);
        }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        const sender = msg.key.remoteJid;

        if (text) {
            logs.push(`📩 New Message: ${text}`);
            try {
                // Groq API Call with corrected headers
                const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
                    messages: [
                        { role: "system", content: "You are a smart assistant." },
                        { role: "user", content: text }
                    ],
                    model: "llama3-8b-8192"
                }, {
                    headers: { 
                        "Authorization": `Bearer ${API_KEY}`,
                        "Content-Type": "application/json"
                    }
                });

                const aiReply = res.data.choices[0].message.content;
                await sock.sendMessage(sender, { text: aiReply });
                logs.push("📤 AI Replied successfully.");

            } catch (e) {
                // ডিটেইল এরর মেসেজ লগে দেখাবে
                const errMsg = e.response?.data?.error?.message || e.message;
                logs.push(`⚠️ AI Error: ${errMsg}`);
            }
        }
    });
}

app.listen(PORT, () => startBot());
