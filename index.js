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
const fs = require("fs-extra");

const app = express();
const PORT = process.env.PORT || 3000;

// --- আপনার তথ্য ---
const API_KEY = "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";
const PHONE_NUMBER = "8801965064030";
let logs = ["System Starting..."];
let pairingCode = null;

// --- ওয়েব ড্যাশবোর্ড ---
app.get("/", (req, res) => {
    let logHTML = logs.slice(-15).map(l => `<div style="margin-bottom:5px;">> ${l}</div>`).join("");
    let statusBox = pairingCode ? `
        <div style="background:#fff; color:#000; padding:20px; border-radius:10px; text-align:center; box-shadow: 0 0 20px #0f0;">
            <h2 style="margin:0; font-size:18px;">WHATSAPP PAIRING CODE</h2>
            <div style="font-size:45px; font-weight:bold; letter-spacing:8px; margin:15px 0; color:#128C7E;">${pairingCode}</div>
            <button onclick="navigator.clipboard.writeText('${pairingCode}'); alert('Copied!')" style="padding:10px 20px; background:#25D366; color:white; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">COPY CODE</button>
            <p style="font-size:12px; margin-top:10px; color:#666;">হোয়াটসঅ্যাপে 'Link with phone number' এ গিয়ে এই কোডটি দিন।</p>
        </div>` : logs.includes("✅ BOT IS ONLINE!") ? 
        `<div style="text-align:center; color:#25D366; font-size:20px; font-weight:bold;">● BOT IS ACTIVE & RESPONDING</div>` : 
        `<div style="text-align:center; color:yellow;">🔄 সেশন প্রসেস হচ্ছে, অপেক্ষা করুন...</div>`;

    res.send(`
        <html>
        <head>
            <title>AI Agent Terminal</title>
            <meta http-equiv="refresh" content="6">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { background:#0a0a0a; color:#0f0; font-family: 'Courier New', monospace; padding:20px; margin:0; }
                .container { max-width: 600px; margin: auto; }
                #terminal { background:#000; border:1px solid #333; padding:15px; height:45vh; overflow-y:auto; border-radius:5px; font-size:13px; box-shadow: inset 0 0 10px #000; }
                h3 { text-align:center; color:#fff; text-shadow: 0 0 5px #0f0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h3>🚀 AI AGENT LIVE MONITOR</h3>
                <div id="terminal">${logHTML}</div>
                <div style="margin-top:20px;">${statusBox}</div>
                <div style="text-align:center; margin-top:30px; color:#444; font-size:10px;">Server Update: ${new Date().toLocaleTimeString()}</div>
            </div>
        </body>
        </html>
    `);
});

// --- হোয়াটসঅ্যাপ বট ফাংশন ---
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        browser: ["Chrome (Linux)", "Google", "1.0.0"]
    });

    // পেয়ারিং কোড জেনারেশন
    if (!sock.authState.creds.registered) {
        await delay(5000);
        try {
            pairingCode = await sock.requestPairingCode(PHONE_NUMBER);
            logs.push("🔹 Pairing Code Generated Successfully.");
        } catch (err) {
            logs.push("⚠️ Pairing Request Failed. Retrying...");
        }
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            let reason = lastDisconnect?.error?.output?.statusCode;
            logs.push(`❌ Connection Closed (Reason: ${reason}). Reconnecting...`);
            startBot(); // অটো রিকানেক্ট
        } else if (connection === "open") {
            logs.push("✅ BOT IS ONLINE!");
            pairingCode = null;
        }
    });

    // মেসেজ রিপ্লাই লজিক
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (text) {
            logs.push(`📩 New Msg: "${text.substring(0, 15)}..." from ${sender.split('@')[0]}`);
            
            try {
                // AI API Call (Groq)
                const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
                    messages: [
                        { role: "system", content: "You are a friendly and smart AI assistant. Answer concisely." },
                        { role: "user", content: text }
                    ],
                    model: "llama3-8b-8192"
                }, {
                    headers: { 
                        "Authorization": `Bearer ${API_KEY}`,
                        "Content-Type": "application/json"
                    }
                });

                const aiReply = response.data.choices[0].message.content;
                await sock.sendMessage(sender, { text: aiReply });
                logs.push(`📤 Replied to ${sender.split('@')[0]}`);

            } catch (error) {
                logs.push(`⚠️ AI Error: ${error.message}`);
            }
        }
    });
}

// সার্ভার চালু
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startBot();
});
