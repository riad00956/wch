const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const express = require("express");
const axios = require("axios");
const pino = require("pino");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = "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";
const PHONE_NUMBER = "8801965064030";

// লগ এবং কোড সেভ করার জন্য ভেরিয়েবল
let logs = ["System initialized..."];
let pairingCode = null;

// টার্মিনাল পেজ (অটো-রিফ্রেশ মোড)
app.get("/", (req, res) => {
    let logHTML = logs.map(l => `<div>> ${l}</div>`).join("");
    let codeHTML = pairingCode ? `
        <div style="background:white; color:black; padding:20px; margin-top:20px; text-align:center;">
            <h2 style="margin:0">YOUR PAIRING CODE</h2>
            <div style="font-size:40px; font-weight:bold; letter-spacing:5px; margin:10px 0;">${pairingCode}</div>
            <p>হোয়াটসঅ্যাপে গিয়ে এই কোডটি দিন।</p>
            <button onclick="navigator.clipboard.writeText('${pairingCode}'); alert('Copied!')" style="padding:10px; font-weight:bold; cursor:pointer;">COPY CODE</button>
        </div>` : `<p style="color:yellow">পেয়ারিং কোড তৈরি হচ্ছে... (৫ সেকেন্ড পর অটো রিফ্রেশ হবে)</p>`;

    res.send(`
        <html>
        <head>
            <title>Live Terminal</title>
            <meta http-equiv="refresh" content="5"> <style>body{background:#000; color:#0f0; font-family:monospace; padding:20px; font-size:14px;} #terminal{border:1px solid #333; padding:10px; height:50vh; overflow-y:auto; background:#050505;}</style>
        </head>
        <body>
            <h2>🚀 AI Agent Live Monitor</h2>
            <div id="terminal">${logHTML}</div>
            ${codeHTML}
            <p style="font-size:12px; color:#555;">Last Update: ${new Date().toLocaleTimeString()}</p>
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

    logs.push("Searching for session...");

    if (!sock.authState.creds.registered) {
        logs.push("Device not found. Generating Pairing Code for: " + PHONE_NUMBER);
        await delay(5000);
        try {
            pairingCode = await sock.requestPairingCode(PHONE_NUMBER);
            logs.push("✅ Pairing Code generated successfully!");
        } catch (err) {
            logs.push("❌ Error generating code: " + err.message);
        }
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection } = update;
        if (connection === "open") {
            logs.push("🎊 BOT IS CONNECTED AND ONLINE!");
            pairingCode = null; // কানেক্ট হয়ে গেলে কোড সরিয়ে ফেলবে
        }
        if (connection === "connecting") logs.push("Connecting to WhatsApp...");
        if (connection === "close") logs.push("Connection closed. Reconnecting...");
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        logs.push(`📩 Message from ${msg.key.remoteJid}: ${text}`);

        try {
            const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
                messages: [{ role: "user", content: text }],
                model: "llama3-8b-8192",
            }, {
                headers: { "Authorization": "Bearer " + API_KEY }
            });
            await sock.sendMessage(msg.key.remoteJid, { text: res.data.choices[0].message.content });
            logs.push("📤 AI Response sent.");
        } catch (e) {
            logs.push("⚠️ AI Error: " + e.message);
        }
    });
}

app.listen(PORT, () => {
    console.log("Server started on port " + PORT);
    startBot();
});
