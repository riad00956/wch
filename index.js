const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const express = require("express");
const axios = require("axios");
const pino = require("pino");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = "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";
const PHONE_NUMBER = "8801965064030";

let logs = ["System Rebooted..."];
let pairingCode = null;

app.get("/", (req, res) => {
    let logHTML = logs.slice(-10).map(l => `<div>> ${l}</div>`).join("");
    let codeHTML = pairingCode ? `
        <div style="background:#fff; color:#000; padding:20px; margin-top:20px; text-align:center; border-radius:10px;">
            <h2 style="margin:0">YOUR PAIRING CODE</h2>
            <div style="font-size:45px; font-weight:bold; letter-spacing:8px; margin:15px 0; font-family:serif;">${pairingCode}</div>
            <button onclick="navigator.clipboard.writeText('${pairingCode}'); alert('Copied!')" style="padding:12px 25px; font-weight:bold; background:#25D366; color:white; border:none; border-radius:5px; cursor:pointer;">COPY CODE</button>
        </div>` : logs.includes("✅ BOT IS CONNECTED!") ? `<h2 style="color:#25D366; text-align:center;">✅ বতটি এখন অনলাইনে আছে!</h2>` : `<p style="color:yellow; text-align:center;">অপেক্ষা করুন, নতুন কোড আসছে...</p>`;

    res.send(`
        <html>
        <head>
            <title>WA Bot Monitor</title>
            <meta http-equiv="refresh" content="7">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>body{background:#0a0a0a; color:#00ff00; font-family:monospace; padding:20px;} #terminal{border:1px solid #333; padding:15px; height:40vh; overflow-y:auto; background:#000; border-radius:5px;}</style>
        </head>
        <body>
            <h3>🤖 AI Bot Control Panel</h3>
            <div id="terminal">${logHTML}</div>
            ${codeHTML}
            <div style="margin-top:20px; color:#555; font-size:12px;">Server Time: ${new Date().toLocaleTimeString()}</div>
        </body>
        </html>
    `);
});

async function startBot() {
    // সেশন স্টোর তৈরি
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
        await delay(3000);
        try {
            pairingCode = await sock.requestPairingCode(PHONE_NUMBER);
            logs.push("🔹 New Pairing Code Generated.");
        } catch (err) {
            logs.push("⚠️ Pairing error. Refreshing...");
        }
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === "close") {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            logs.push("🔄 Connection lost. Reason: " + (shouldReconnect ? "Reconnecting..." : "Logged Out"));
            if (shouldReconnect) startBot();
        } else if (connection === "open") {
            logs.push("✅ BOT IS CONNECTED!");
            pairingCode = null;
        }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        
        if (text) {
            logs.push(`💬 Msg: ${text.substring(0,20)}...`);
            try {
                const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
                    messages: [{ role: "user", content: text }],
                    model: "llama3-8b-8192",
                }, {
                    headers: { "Authorization": "Bearer " + API_KEY }
                });
                await sock.sendMessage(msg.key.remoteJid, { text: res.data.choices[0].message.content });
            } catch (e) {
                console.log("AI Error");
            }
        }
    });
}

app.listen(PORT, () => {
    startBot();
});
