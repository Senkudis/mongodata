const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require('express');
const qrcode = require('qrcode');
const app = express();

const API_KEY = process.env.GEMINI_API_KEY;
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 3000;

let qrCodeImage = "<h1>جاري التحميل...</h1>";

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><meta charset="UTF-8"><title>Kede Bot</title></head>
            <body style="font-family:sans-serif; text-align:center; padding:50px; background:#f4f4f4;">
                <h2>حالة كيدي</h2>
                <div style="margin:20px;">${qrCodeImage}</div>
                <script>setTimeout(()=>window.location.reload(), 10000);</script>
            </body>
        </html>
    `);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// دالة تحويل الصور
function fileToGenerativePart(base64Data, mimeType) {
    return { inlineData: { data: base64Data, mimeType } };
}

async function startBot() {
    try {
        await mongoose.connect(MONGO_URI);
        const store = new MongoStore({ mongoose: mongoose });
        
        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        console.log("Starting Client...");

        const client = new Client({
            authStrategy: new RemoteAuth({
                store: store,
                backupSyncIntervalMs: 600000
            }),
            puppeteer: {
                headless: true,
                executablePath: '/usr/bin/google-chrome-stable',
                // 🔥 دي الإعدادات الوحيدة اللي بتشتغل مع كروم الجديد في Render
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--disable-gpu'
                ],
                authTimeoutMs: 60000, // إعطاء وقت أطول للتحميل
            }
        });

        client.on('qr', (qr) => {
            console.log('QR Generated');
            qrcode.toDataURL(qr, (err, url) => {
                if (!err) qrCodeImage = `<img src="${url}" width="300">`;
            });
        });

        client.on('ready', () => {
            console.log('✅ Kede is Ready!');
            qrCodeImage = "<h1>✅ تم الاتصال بنجاح!</h1>";
        });

        client.on('remote_session_saved', () => console.log('Session Saved!'));

        client.on('message_create', async msg => {
            if (msg.fromMe && !msg.body.startsWith('.')) return;
            const body = msg.body.toLowerCase();

            // Gemini
            if (body.startsWith('.ai') || body.startsWith('كيدي')) {
                 const promptText = body.replace('.ai', '').replace('كيدي', '').trim() || "صف لي الصورة";
                 try {
                    let parts = [promptText];
                    if (msg.hasMedia) {
                        const media = await msg.downloadMedia();
                        if (media.mimetype && media.mimetype.startsWith('image/')) {
                            parts.push(fileToGenerativePart(media.data, media.mimetype));
                        }
                    }
                    const result = await model.generateContent(parts);
                    await msg.reply(result.response.text());
                 } catch(e) { console.error(e); }
            }
        });

        client.initialize();
        
    } catch (err) {
        console.error("Fatal Error:", err);
    }
}

startBot();
