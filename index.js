const { Client, RemoteAuth, MessageMedia } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require('express');
const qrcode = require('qrcode');
const app = express();

const API_KEY = process.env.GEMINI_API_KEY;
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 3000;

let qrCodeImage = "<h1>جاري تشغيل البوت... انتظر قليلاً</h1>";
let client; // متغير عالمي للبوت

// إعداد السيرفر
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><meta charset="UTF-8"><title>Kede Bot</title></head>
            <body style="font-family:sans-serif; text-align:center; padding:50px; background:#f4f4f4;">
                <h2>حالة كيدي</h2>
                <div style="margin:20px;">${qrCodeImage}</div>
                <p>تحديث تلقائي كل 30 ثانية</p>
                <script>setTimeout(function(){location.reload()}, 30000);</script>
            </body>
        </html>
    `);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// الدالة الرئيسية لتشغيل البوت
async function startBot() {
    await mongoose.connect(MONGO_URI);
    const store = new MongoStore({ mongoose: mongoose });
    
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        systemInstruction: "أنت مساعد ذكي ومرح اسمك 'كيدي'. تتحدث باللهجة السودانية."
    });

    console.log("Starting Client...");

    client = new Client({
        authStrategy: new RemoteAuth({
            store: store,
            backupSyncIntervalMs: 600000 // قللنا معدل النسخ الاحتياطي لتوفير الموارد
        }),
        // 🔥 الحل الجذري 1: تثبيت نسخة الويب عشان ما يحملها كل مرة
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        },
        puppeteer: {
            headless: true,
            executablePath: '/usr/bin/google-chrome-stable',
            // 🔥 الحل الجذري 2: أوامر تقليل استهلاك الذاكرة لأقصى حد
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process', 
                '--disable-gpu',
                '--disable-extensions',
                '--disable-default-apps',
                '--mute-audio',
                '--disable-client-side-phishing-detection',
                '--disable-component-extensions-with-background-pages',
                '--disable-features=Translate',
                '--disable-background-networking',
                '--disable-sync'
            ],
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
        qrCodeImage = "<h1>✅ تم الاتصال بنجاح! كيدي جاهز.</h1>";
    });

    client.on('remote_session_saved', () => console.log('Session Saved!'));

    // نظام التعامل مع الانهيار (Crash Handler)
    client.on('disconnected', (reason) => {
        console.log('Client was logged out', reason);
        qrCodeImage = "<h1>تم قطع الاتصال.. جاري إعادة التشغيل</h1>";
        client.destroy();
        client.initialize();
    });

    client.on('message_create', async msg => {
        if (msg.fromMe && !msg.body.startsWith('.')) return;
        const body = msg.body.toLowerCase();

        // 1. استيكر
        if (msg.hasMedia && (body === 'ملصق' || body === 'sticker')) {
            try {
                const media = await msg.downloadMedia();
                await client.sendMessage(msg.from, media, { sendMediaAsSticker: true, stickerName: "Kede", stickerAuthor: "Bot" });
            } catch(e) { console.error(e); }
        }

        // 2. Gemini
        if (body.startsWith('.ai') || body.startsWith('كيدي')) {
             const promptText = body.replace('.ai', '').replace('كيدي', '').trim() || "صف لي الصورة";
             try {
                let parts = [promptText];
                if (msg.hasMedia) {
                    const media = await msg.downloadMedia();
                    if (media.mimetype.startsWith('image/')) {
                        parts.push({ inlineData: { data: media.data, mimeType: media.mimetype } });
                    }
                }
                const result = await model.generateContent(parts);
                await msg.reply(result.response.text());
             } catch(e) { console.error(e); }
        }
    });

    client.initialize();
}

startBot();
