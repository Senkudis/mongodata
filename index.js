const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const pino = require('pino');
const express = require('express');
const qrcode = require('qrcode');
const fs = require('fs');
const app = express();

const API_KEY = process.env.GEMINI_API_KEY;
const PORT = process.env.PORT || 3000;

let qrCodeImage = "<h1>جاري تجهيز الباركود...</h1>";

// 1. صفحة الويب
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Kede Bot</title>
                <meta http-equiv="refresh" content="3">
                <style>body{font-family:sans-serif; text-align:center; padding-top:50px; background:#f0f2f5;}</style>
            </head>
            <body>
                <h2>اربط كيدي الآن</h2>
                <div style="background:white; padding:20px; display:inline-block; border-radius:10px;">
                    ${qrCodeImage}
                </div>
                <p>امسح الكود بسرعة - يتحدث كل 3 ثواني</p>
            </body>
        </html>
    `);
});
app.listen(PORT, () => console.log(`Server on port ${PORT}`));

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function startBot() {
    // 🔥🔥🔥 التعديل المهم جداً: مسح الجلسة القديمة لبدء صفحة جديدة
    // هذا السطر يمنع الخطأ 405
    console.log("تنظيف الجلسات القديمة...");
    if (fs.existsSync('auth_info')) {
        fs.rmSync('auth_info', { recursive: true, force: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    console.log("جاري الاتصال بواتساب...");

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        // استخدام هوية متصفح رسمية لتجنب الحظر أو الرفض
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false, // تسريع عملية الربط
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("⚡ QR Code جاهز!");
            qrcode.toDataURL(qr, (err, url) => {
                if (!err) qrCodeImage = `<img src="${url}" width="300">`;
            });
        }

        if (connection === 'close') {
            const reason = (lastDisconnect?.error)?.output?.statusCode;
            console.log(`❌ انقطع الاتصال. السبب: ${reason}`);

            // إعادة التشغيل
            console.log("🔄 إعادة تشغيل البوت...");
            setTimeout(startBot, 2000);
        } else if (connection === 'open') {
            console.log('✅ تم الاتصال بنجاح! كيدي جاهز.');
            qrCodeImage = "<h1>✅ تم الربط بنجاح!</h1>";
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const text = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || 
                     msg.message.imageMessage?.caption || "";
        
        const body = text.toLowerCase().trim();
        const sender = msg.key.remoteJid;

        console.log(`📩 رسالة: ${body}`);

        if (body.startsWith('كيدي') || body.startsWith('.ai')) {
            const prompt = body.replace('كيدي', '').replace('.ai', '').trim();
            await sock.sendPresenceUpdate('composing', sender);

            try {
                const result = await model.generateContent(prompt);
                await sock.sendMessage(sender, { text: result.response.text() }, { quoted: msg });
            } catch (error) {
                console.error("Gemini Error:", error);
            }
        }
    });
}

startBot();
