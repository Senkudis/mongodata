const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const pino = require('pino');
const express = require('express');
const qrcode = require('qrcode');
const fs = require('fs');
const app = express();

const API_KEY = process.env.GEMINI_API_KEY;
const PORT = process.env.PORT || 3000;

let qrCodeImage = "<h1>جاري التحميل... انتظر 10 ثواني</h1>";

// صفحة الويب
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Kede Bot</title>
                <meta http-equiv="refresh" content="5">
                <style>body{font-family:sans-serif; text-align:center; padding-top:50px; background:#f0f2f5;}</style>
            </head>
            <body>
                <h2>اربط كيدي الآن</h2>
                <div style="background:white; padding:20px; display:inline-block; border-radius:10px;">
                    ${qrCodeImage}
                </div>
                <p>تحديث تلقائي كل 5 ثواني</p>
            </body>
        </html>
    `);
});
app.listen(PORT, () => console.log(`Server on port ${PORT}`));

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// تنظيف أولي لمرة واحدة فقط عند تشغيل السيرفر (اختياري)
// امسح السطرين ديل لو عايز البوت يتذكرك بعد إعادة تشغيل السيرفر
if (fs.existsSync('auth_info')) {
    try { fs.rmSync('auth_info', { recursive: true, force: true }); } catch(e){}
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    // استخدام متجر مفاتيح مؤقت لتحسين الاستقرار
    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Desktop'), // تغيير الهوية لـ Mac لتقليل الحظر
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: true,
        retryRequestDelayMs: 5000 // الانتظار 5 ثواني قبل إعادة المحاولة
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("⚡ QR Code جديد جاهز!");
            qrcode.toDataURL(qr, (err, url) => {
                if (!err) qrCodeImage = `<img src="${url}" width="300">`;
            });
        }

        if (connection === 'close') {
            const reason = (lastDisconnect?.error)?.output?.statusCode;
            console.log(`❌ انقطع الاتصال. السبب: ${reason}`);

            // لو الخطأ 405 (Not Allowed) أو 403 (Forbidden) أو Logged Out
            // هنا بس نمسح الجلسة لأنها خربت
            if (reason === DisconnectReason.loggedOut || reason === 405 || reason === 403) {
                console.log("⚠️ الجلسة غير صالحة. جاري التنظيف وإعادة البدء...");
                fs.rmSync('auth_info', { recursive: true, force: true });
                qrCodeImage = "<h1>جاري تجهيز كود جديد...</h1>";
                setTimeout(startBot, 5000); // انتظر 5 ثواني
            } else {
                // أي خطأ تاني (زي النت فصل) بنعيد المحاولة بدون مسح
                console.log("🔄 إعادة اتصال عادية...");
                startBot();
            }
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
