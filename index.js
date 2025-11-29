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

// صفحة الويب
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><meta charset="UTF-8"><title>Kede Bot</title></head>
            <body style="font-family:sans-serif; text-align:center; padding:50px; background:#f4f4f4;">
                <h2>حالة كيدي</h2>
                <div style="margin:20px;">${qrCodeImage}</div>
                <p>امسح الكود لربط البوت</p>
            </body>
        </html>
    `);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

function fileToGenerativePart(base64Data, mimeType) {
    return { inlineData: { data: base64Data, mimeType } };
}

mongoose.connect(MONGO_URI).then(() => {
    const store = new MongoStore({ mongoose: mongoose });
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        systemInstruction: "أنت مساعد ذكي ومرح اسمك 'كيدي'. تتحدث باللهجة السودانية."
    });

    const client = new Client({
        authStrategy: new RemoteAuth({
            store: store,
            backupSyncIntervalMs: 300000
        }),
        // 🔥🔥🔥 الحل هنا: كتبنا اليوزر ايجنت يدوياً عشان ما يحاول يغيره ويكرش
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
        
        puppeteer: {
            headless: true,
            executablePath: '/usr/bin/google-chrome-stable',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process', 
                '--disable-gpu',
                '--disable-extensions' // ضفنا دي كمان عشان تخفف الحمل
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

    client.on('message_create', async msg => {
        if (msg.fromMe && !msg.body.startsWith('.')) return;

        const body = msg.body.toLowerCase();

        // ميزة الاستيكر
        if (msg.hasMedia && (body === 'ملصق' || body === 'sticker')) {
            try {
                const media = await msg.downloadMedia();
                await client.sendMessage(msg.from, media, { sendMediaAsSticker: true, stickerName: "Kede", stickerAuthor: "Bot" });
                return;
            } catch(e) { console.error(e); }
        }

        // Gemini
        if (body.startsWith('.ai') || body.startsWith('كيدي')) {
             const chat = await msg.getChat();
             chat.sendStateTyping();

             const promptText = body.replace('.ai', '').replace('كيدي', '').trim() || "صف لي هذه الصورة";
             
             try {
                let parts = [promptText];
                if (msg.hasMedia) {
                    const media = await msg.downloadMedia();
                    if (media.mimetype.startsWith('image/')) {
                        parts.push(fileToGenerativePart(media.data, media.mimetype));
                    }
                }

                const result = await model.generateContent(parts);
                await msg.reply(result.response.text());
                
             } catch(e) { 
                 console.error("Gemini Error:", e);
                 msg.reply("معليش، حصلت مشكلة تقنية 🤕");
             }
        }
    });

    client.initialize();
});
