const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const API_KEY = process.env.GEMINI_API_KEY; 
const MONGO_URI = process.env.MONGO_URI; 

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

    client.on('qr', (qr) => {
        console.log('QR RECEIVED', qr); 
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => { console.log('Kede is Ready!'); });
    client.on('remote_session_saved', () => { console.log('Session Saved!'); });

    client.on('message', async msg => {
        const body = msg.body.toLowerCase();
        if (body.startsWith('.ai') || body.startsWith('كيدي')) {
             const prompt = body.replace('.ai', '').replace('كيدي', '');
             try {
                const result = await model.generateContent(prompt);
                msg.reply(result.response.text());
             } catch(e) { msg.reply('مشكلة تقنية بسيطة..'); }
        }
    });

    client.initialize();
});
