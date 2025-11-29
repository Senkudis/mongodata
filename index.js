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

// متغير لحفظ صورة الباركود
let qrCodeImage = "<h1>جاري تشغيل البوت... انتظر قليلاً</h1>";

// إعداد صفحة الويب لعرض الباركود
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>Kede Bot QR</title></head>
            <body style="display:flex; justify-content:center; align-items:center; height:100vh; background:#f0f0f0; flex-direction:column;">
                <h2>امسح الكود لربط كيدي</h2>
                <div>${qrCodeImage}</div>
                <p style="margin-top:20px;">بعد المسح، سيتم حفظ الجلسة تلقائياً.</p>
            </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// الاتصال بقاعدة البيانات وتشغيل البوت
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
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--single-process', '--disable-gpu'],
        }
    });

    // تحويل الكود لصورة وعرضها في الصفحة
    client.on('qr', (qr) => {
        console.log('New QR Received');
        qrcode.toDataURL(qr, (err, url) => {
            if (!err) {
                qrCodeImage = `<img src="${url}" width="300" height="300" style="border: 5px solid white; border-radius: 10px;">`;
            }
        });
    });

    client.on('ready', () => { 
        console.log('Kede is Ready!');
        qrCodeImage = "<h1>✅ تم الاتصال بنجاح! كيدي جاهز.</h1>";
    });

    client.on('remote_session_saved', () => { 
        console.log('Session Saved!'); 
    });

    client.on('message', async msg => {
        const body = msg.body.toLowerCase();
        if (body.startsWith('.ai') || body.startsWith('كيدي')) {
             const prompt = body.replace('.ai', '').replace('كيدي', '');
             try {
                const result = await model.generateContent(prompt);
                msg.reply(result.response.text());
             } catch(e) { 
                 console.error(e);
             }
        }
    });

    client.initialize();
});
