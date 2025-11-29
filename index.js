const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const pino = require('pino');
const express = require('express');
const qrcode = require('qrcode');
const app = express();

const API_KEY = process.env.GEMINI_API_KEY;
const PORT = process.env.PORT || 3000;

let qrCodeData = "<h1>جاري التحميل...</h1>";

// إعداد صفحة الويب
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><meta charset="UTF-8"><title>Kede Bot</title></head>
            <body style="font-family:sans-serif; text-align:center; padding:50px;">
                <h2>امسح الكود لربط كيدي</h2>
                <div style="margin:20px;">${qrCodeData}</div>
                <p>تحديث كل 5 ثواني</p>
                <script>setTimeout(()=>window.location.reload(), 5000);</script>
            </body>
        </html>
    `);
});
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// إعداد Gemini
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "أنت مساعد ذكي ومرح اسمك 'كيدي'. تتحدث باللهجة السودانية."
});

async function startBot() {
    // إعداد المصادقة (Auth)
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // بيطبع الكود في الlogs كمان
        logger: pino({ level: 'silent' }), // تقليل الازعاج في الlogs
        browser: ["Kede Bot", "Chrome", "1.0.0"]
    });

    // التعامل مع الاتصال
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("QR GENERATED");
            qrcode.toDataURL(qr, (err, url) => {
                if (!err) qrCodeData = `<img src="${url}" width="300">`;
            });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ تم الاتصال بنجاح! كيدي جاهز.');
            qrCodeData = "<h1>✅ متصل وجاهز!</h1>";
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // التعامل مع الرسائل
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return; // تجاهل رسائلي

        const remoteJid = msg.key.remoteJid;
        
        // استخراج النص من الرسالة (Baileys معقدة شوية في استخراج النص)
        const textMessage = msg.message.conversation || 
                            msg.message.extendedTextMessage?.text || 
                            msg.message.imageMessage?.caption || "";

        const body = textMessage.toLowerCase();
        console.log(`📩 رسالة جديدة: ${body}`); // تأكيد الوصول

        if (body.startsWith('.ai') || body.startsWith('كيدي')) {
            const prompt = body.replace('.ai', '').replace('كيدي', '').trim();
            
            // مؤشر الكتابة (Typing...)
            await sock.sendPresenceUpdate('composing', remoteJid);

            try {
                // إرسال الطلب لـ Gemini
                const result = await model.generateContent(prompt);
                const response = result.response.text();
                
                // الرد
                await sock.sendMessage(remoteJid, { text: response }, { quoted: msg });
                console.log("📤 تم الرد.");

            } catch (error) {
                console.error("Gemini Error:", error);
                await sock.sendMessage(remoteJid, { text: "معليش، حصل خطأ تقني." }, { quoted: msg });
            }
        }
    });
}

startBot();
