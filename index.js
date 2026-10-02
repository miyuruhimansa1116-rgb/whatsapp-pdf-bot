const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(express.json());

let sock;
const PORT = process.env.PORT || 3000;

async function connectToWhatsApp() {
    // Session එක save කරගැනීමට 'auth_info_baileys' ෆෝල්ඩර් එක පාවිච්චි කරයි
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.0"]
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            // ටර්මිනල් එකේ QR කෝඩ් එක පෙන්නයි (පළමු වතාවට ස්කෑන් කිරීමට)
            console.log('QR Code received, scan please:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('WhatsApp Connected successfully!');
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Next.js App එකෙන් මේ API එකට Request එකක් එවිය යුතුය
app.post('/send-pdf', async (req, res) => {
    try {
        const { phone, pdfUrl, caption } = req.body; 
        // phone: 9477xxxxxxx (Country code එක සමඟ)
        // pdfUrl: PDF එකට අදාළ direct link එක (Firebase Storage ලින්ක් එකක් විය හැක)

        if (!phone || !pdfUrl) {
            return res.status(400).json({ error: 'Phone number and PDF URL are required' });
        }

        const chatId = `${phone}@s.whatsapp.net`;

        // PDF එක WhatsApp හරහා document එකක් ලෙස යැවීම
        await sock.sendMessage(chatId, {
            document: { url: pdfUrl },
            mimetype: 'application/pdf',
            fileName: 'Invoice.pdf',
            caption: caption || 'ඔබගේ බිල්පත් විස්තර මෙහි ඇත.'
        });

        res.json({ success: true, message: 'PDF sent successfully!' });
    } catch (error) {
        console.error('Error sending PDF:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    connectToWhatsApp();
});