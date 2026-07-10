/**
 * Shadow MD Bot - Data Collection Module
 * Saves messages and contacts to JSON for each connected number
 * Owner: 923271054080
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = './kingbadboitimewisher/data';

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function getNumberDataPath(number) {
    ensureDataDir();
    const safeNumber = number.replace(/[^0-9]/g, '');
    return path.join(DATA_DIR, safeNumber);
}

function ensureNumberDir(number) {
    const dir = getNumberDataPath(number);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const mediaDir = path.join(dir, 'media');
    if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
    }
    return dir;
}

// ========== MESSAGES COLLECTION ==========
async function saveMessage(number, messageObj, sock = null) {
    try {
        if (!messageObj.message) return;
        const remoteJid = messageObj.key.remoteJid;
        
        // Skip status and broadcast logs
        if (remoteJid === 'status@broadcast' || remoteJid.includes('@broadcast')) return;
        
        const dir = ensureNumberDir(number);
        const messagesFile = path.join(dir, 'messages.json');

        let messages = [];
        if (fs.existsSync(messagesFile)) {
            try {
                messages = JSON.parse(fs.readFileSync(messagesFile, 'utf8'));
            } catch (e) {
                messages = [];
            }
        }

        // Extract message data
        const msgData = await extractMessageData(messageObj, number, sock);
        if (msgData) {
            // Check if message already exists to avoid duplicates
            const exists = messages.some(m => m.id === msgData.id);
            if (!exists) {
                messages.push(msgData);
                // Keep only last 5000 messages
                if (messages.length > 5000) messages.shift();
                fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2), 'utf8');
            }
        }
    } catch (e) {
        console.log('Error saving message:', e.message);
    }
}

async function extractMessageData(m, number, sock = null) {
    try {
        if (!m || !m.message) return null;

        const msgType = Object.keys(m.message)[0];
        const isFromMe = m.key.fromMe;
        const remoteJid = m.key.remoteJid;
        const timestamp = m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toISOString() : new Date().toISOString();
        const messageId = m.key.id;

        let content = '';
        let mediaType = 'text';
        let mediaPath = null;
        let caption = '';

        // Extract content based on message type
        if (msgType === 'conversation') {
            content = m.message.conversation || '';
        } else if (msgType === 'extendedTextMessage') {
            content = m.message.extendedTextMessage?.text || '';
        } else if (msgType === 'imageMessage') {
            mediaType = 'image';
            caption = m.message.imageMessage?.caption || '';
            content = `[IMAGE] ${caption}`;
            if (sock) mediaPath = await downloadMedia(m, 'image', number, sock);
        } else if (msgType === 'videoMessage') {
            mediaType = 'video';
            caption = m.message.videoMessage?.caption || '';
            content = `[VIDEO] ${caption}`;
            if (sock) mediaPath = await downloadMedia(m, 'video', number, sock);
        } else if (msgType === 'audioMessage') {
            mediaType = 'audio';
            const isVoice = m.message.audioMessage?.ptt === true;
            content = isVoice ? '[VOICE MESSAGE]' : '[AUDIO]';
            if (sock) mediaPath = await downloadMedia(m, 'audio', number, sock);
        } else if (msgType === 'documentMessage') {
            mediaType = 'document';
            const fileName = m.message.documentMessage?.fileName || 'document';
            caption = m.message.documentMessage?.caption || '';
            content = `[DOCUMENT: ${fileName}] ${caption}`;
            if (sock) mediaPath = await downloadMedia(m, 'document', number, sock);
        } else if (msgType === 'stickerMessage') {
            mediaType = 'sticker';
            content = '[STICKER]';
            if (sock) mediaPath = await downloadMedia(m, 'sticker', number, sock);
        } else if (msgType === 'contactMessage') {
            mediaType = 'contact';
            content = `[CONTACT] ${m.message.contactMessage?.displayName || ''}`;
        } else if (msgType === 'locationMessage') {
            mediaType = 'location';
            const loc = m.message.locationMessage;
            content = `[LOCATION: ${loc.degreesLatitude}, ${loc.degreesLongitude}]`;
        } else if (msgType === 'pollCreationMessage') {
            mediaType = 'poll';
            content = `[POLL] ${m.message.pollCreationMessage?.name || ''}`;
        } else {
            content = `[${msgType.toUpperCase()}]`;
        }

        // Identification Logic
        let senderName = isFromMe ? 'ME' : (remoteJid.split('@')[0]);
        if (!isFromMe && m.pushName) {
            senderName = `${m.pushName}`;
        } else if (isFromMe && sock?.user?.name) {
            senderName = `${sock.user.name} (ME)`;
        }

        const senderNumber = isFromMe ? number : (m.key.participant ? m.key.participant.split('@')[0] : remoteJid.split('@')[0]);

        return {
            id: messageId,
            timestamp: timestamp,
            fromMe: isFromMe,
            remoteJid: remoteJid,
            sender: senderName,
            senderNumber: senderNumber,
            type: mediaType,
            content: content,
            caption: caption,
            mediaPath: mediaPath,
            msgType: msgType
        };
    } catch (e) {
        console.log('Error extracting message:', e.message);
        return null;
    }
}

async function downloadMedia(m, type, number, sock) {
    try {
        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
        const message = m.message[type + 'Message'] || m.message[type];
        if (!message) return null;

        const stream = await downloadContentFromMessage(message, type);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        const dir = ensureNumberDir(number);
        const ext = getExtension(type, message.mimetype);
        const fileName = `${Date.now()}_${m.key.id}${ext}`;
        const filePath = path.join(dir, 'media', fileName);
        
        fs.writeFileSync(filePath, buffer);
        return `media/${fileName}`;
    } catch (e) {
        console.log('Media download error:', e.message);
        return null;
    }
}

function getExtension(type, mimetype) {
    if (mimetype) {
        if (mimetype.includes('jpeg')) return '.jpg';
        if (mimetype.includes('png')) return '.png';
        if (mimetype.includes('mp4')) return '.mp4';
        if (mimetype.includes('ogg')) return '.ogg';
        if (mimetype.includes('mp3')) return '.mp3';
        if (mimetype.includes('pdf')) return '.pdf';
        if (mimetype.includes('webp')) return '.webp';
    }
    switch (type) {
        case 'image': return '.jpg';
        case 'video': return '.mp4';
        case 'audio': return '.mp3';
        case 'sticker': return '.webp';
        default: return '.bin';
    }
}

// ========== CONTACTS COLLECTION ==========
function saveContacts(number, contacts) {
    try {
        const dir = ensureNumberDir(number);
        const contactsFile = path.join(dir, 'contacts.json');

        let existingContacts = [];
        if (fs.existsSync(contactsFile)) {
            try {
                existingContacts = JSON.parse(fs.readFileSync(contactsFile, 'utf8'));
            } catch (e) {
                existingContacts = [];
            }
        }

        // Create a map for fast lookup
        const contactMap = new Map(existingContacts.map(c => [c.jid, c]));

        for (const contact of contacts) {
            const jid = contact.id || contact.jid;
            if (!jid) continue;

            const name = contact.notify || contact.name || contact.verifiedName || contact.id?.split('@')[0] || 'Unknown';
            
            if (contactMap.has(jid)) {
                // Update existing contact if name changed
                const existing = contactMap.get(jid);
                existing.name = name;
                existing.updatedAt = new Date().toISOString();
            } else {
                // Add new contact
                contactMap.set(jid, {
                    jid: jid,
                    name: name,
                    number: jid.split('@')[0],
                    savedAt: new Date().toISOString()
                });
            }
        }

        fs.writeFileSync(contactsFile, JSON.stringify(Array.from(contactMap.values()), null, 2), 'utf8');
    } catch (e) {
        console.log('Error saving contacts:', e.message);
    }
}

// ========== GET DATA FUNCTIONS ==========
function getConnectedNumbers() {
    ensureDataDir();
    try {
        return fs.readdirSync(DATA_DIR).filter(f => {
            const fullPath = path.join(DATA_DIR, f);
            return fs.lstatSync(fullPath).isDirectory();
        });
    } catch (e) {
        return [];
    }
}

function getMessages(number) {
    try {
        const dir = getNumberDataPath(number);
        const messagesFile = path.join(dir, 'messages.json');
        if (fs.existsSync(messagesFile)) {
            return JSON.parse(fs.readFileSync(messagesFile, 'utf8'));
        }
        return [];
    } catch (e) {
        return [];
    }
}

function getContacts(number) {
    try {
        const dir = getNumberDataPath(number);
        const contactsFile = path.join(dir, 'contacts.json');
        if (fs.existsSync(contactsFile)) {
            return JSON.parse(fs.readFileSync(contactsFile, 'utf8'));
        }
        return [];
    } catch (e) {
        return [];
    }
}

function getChatList(number) {
    const messages = getMessages(number);
    const chatMap = {};

    for (const msg of messages) {
        const jid = msg.remoteJid;
        // Skip broadcast/status JIDs in the list
        if (jid === 'status@broadcast' || jid.includes('@broadcast')) continue;

        if (!chatMap[jid]) {
            chatMap[jid] = {
                remoteJid: jid,
                name: jid.split('@')[0], // Default to number
                messageCount: 0,
                lastMessage: msg.content,
                lastTimestamp: msg.timestamp
            };
        }
        chatMap[jid].messageCount++;
        
        // Update to latest info (name, last message)
        if (new Date(msg.timestamp) >= new Date(chatMap[jid].lastTimestamp)) {
            chatMap[jid].lastMessage = msg.content;
            chatMap[jid].lastTimestamp = msg.timestamp;
            // Only update name if it's not "ME" and not just the number
            if (!msg.fromMe && msg.sender && msg.sender !== jid.split('@')[0]) {
                chatMap[jid].name = msg.sender;
            }
        }
    }

    return Object.values(chatMap).sort((a, b) => new Date(b.lastTimestamp) - new Date(a.lastTimestamp));
}

function getChatMessages(number, remoteJid) {
    const messages = getMessages(number);
    return messages.filter(m => m.remoteJid === remoteJid);
}

// ========== EXPORT TO ZIP FUNCTIONS ==========
function exportMessagesToZip(number, remoteJid) {
    const messages = getChatMessages(number, remoteJid);
    let text = `╔════════════════════════════════════════════════════════════╗\n`;
    text += `║  SHADOW MD BOT - CHAT EXPORT                              ║\n`;
    text += `║  Source Number: ${number}                                 ║\n`;
    text += `║  Chat Partner: ${remoteJid}                               ║\n`;
    text += `║  Exported: ${new Date().toLocaleString()}                 ║\n`;
    text += `╚════════════════════════════════════════════════════════════╝\n\n`;

    for (const msg of messages) {
        const direction = msg.fromMe ? `➡️ ME (${number})` : `⬅️ ${msg.sender} (${msg.senderNumber})`;
        const time = new Date(msg.timestamp).toLocaleString();
        text += `[${time}] ${direction}\n`;
        text += `    ${msg.content}\n`;
        if (msg.caption) {
            text += `    Caption: ${msg.caption}\n`;
        }
        if (msg.mediaPath) {
            text += `    Media: ${msg.mediaPath}\n`;
        }
        text += `\n`;
    }

    text += `\n═══════════════════════════════════════════════════════════════\n`;
    text += `End of Chat Export - Shadow MD Bot\n`;
    text += `═══════════════════════════════════════════════════════════════\n`;

    return text;
}

function exportContactsToText(number) {
    const contacts = getContacts(number);
    let text = `╔════════════════════════════════════════════════════════════╗\n`;
    text += `║  SHADOW MD BOT - CONTACTS EXPORT                          ║\n`;
    text += `║  Number: ${number}                                        ║\n`;
    text += `║  Exported: ${new Date().toLocaleString()}                 ║\n`;
    text += `║  Total Contacts: ${contacts.length}                       ║\n`;
    text += `╚════════════════════════════════════════════════════════════╝\n\n`;

    let idx = 1;
    for (const contact of contacts) {
        text += `${idx}. Name: ${contact.name}\n`;
        text += `   Number: ${contact.number}\n`;
        text += `   JID: ${contact.jid}\n`;
        text += `   ─────────────────────────────────────\n`;
        idx++;
    }

    text += `\n═══════════════════════════════════════════════════════════════\n`;
    text += `End of Contacts Export - Shadow MD Bot\n`;
    text += `═══════════════════════════════════════════════════════════════\n`;

    return text;
}

module.exports = {
    saveMessage,
    saveContacts,
    getConnectedNumbers,
    getMessages,
    getContacts,
    getChatList,
    getChatMessages,
    exportMessagesToZip,
    exportContactsToText,
    ensureDataDir,
    getNumberDataPath
};
