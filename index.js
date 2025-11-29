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

let qrCodeImage = "<h1>جاري تشغيل البوت... انتظر قليلاً</h1>";

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><meta charset="UTF-8"><title>Kede Bot</title></head>
            <body style="font-family:sans-serif; text-align:center; padding:50px; background:#f4f4f4;">
                <h2>حالة كيدي</h2>
                <div style="margin:20px;">${qrCodeImage}</div>
                <p>تحديث تلقائي كل 15 ثانية</p>
                <script>setTimeout(function(){location.reload()}, 15000);</script>
            </body>
        </html>
    `);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// دالة تحويل الملفات
function fileToGenerativePart(base64Data, mimeType) {
    return { inlineData: { data: base64Data, mimeType } };
}

async function startBot() {
    try {
        console.log("Connecting to Mongo...");
        await mongoose.connect(MONGO_URI);
        const store = new MongoStore({ mongoose: mongoose });
        console.log("Mongo Connected.");

        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            systemInstruction: "أنت مساعد ذكي ومرح اسمك 'كيدي'. تتحدث باللهجة السودانية."
        });

        console.log("Initializing Client...");

        const client = new Client({
            authStrategy: new RemoteAuth({
                store: store,
                backupSyncIntervalMs: 600000
            }),
            // 🔥 هذا السطر يمنع الخطأ (Protocol error) لأنه يوقف محاولة تغيير الهوية
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
            
            puppeteer: {
                headless: true,
                executablePath: '/usr/bin/google-chrome-stable',
                // 🔥 أوامر تخفيف قصوى للذاكرة
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
                    '--disable-software-rasterizer', // تعطيل معالجة الصور الثقيلة
                    '--disable-sync',
                    '--window-size=800,600' // تصغير حجم النافذة لتوفير الرام
                ],
                timeout: 60000 // زيادة وقت الانتظار
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
