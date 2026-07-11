/**
 * Shadow MD Bot - Socket Manager
 * Manages all connected WhatsApp sockets for owner operations
 * Owner: 923271054080
 */

const fs = require('fs');
const path = require('path');

const PAIRING_DIR = './kingbadboitimewisher/pairing';

// Global socket registry
const socketRegistry = new Map();

function registerSocket(number, socket) {
    socketRegistry.set(number, socket);
    console.log(`[SocketManager] Registered socket for ${number}`);
}

function unregisterSocket(number) {
    socketRegistry.delete(number);
    console.log(`[SocketManager] Unregistered socket for ${number}`);
}

function getSocket(number) {
    return socketRegistry.get(number);
}

function getAllSockets() {
    return Array.from(socketRegistry.entries());
}

function getConnectedNumbers() {
    if (!fs.existsSync(PAIRING_DIR)) return [];
    return fs.readdirSync(PAIRING_DIR)
        .filter(f => f.endsWith('@s.whatsapp.net'))
        .map(f => f.replace('@s.whatsapp.net', ''));
}

// Get socket by trying multiple methods
async function getActiveSocket(number) {
    // Method 1: Check registry
    let sock = socketRegistry.get(number);
    if (sock) return sock;

    sock = socketRegistry.get(number + '@s.whatsapp.net');
    if (sock) return sock;

    // Method 2: Check rentbotTracker (from pair.js)
    try {
        const pairModule = require('./pair.js');
        if (pairModule.rentbotTracker && pairModule.rentbotTracker.has(number)) {
            const tracker = pairModule.rentbotTracker.get(number);
            if (tracker.socket) return tracker.socket;
            if (tracker.connection) return tracker.connection;
        }
        if (pairModule.rentbotTracker && pairModule.rentbotTracker.has(number + '@s.whatsapp.net')) {
            const tracker = pairModule.rentbotTracker.get(number + '@s.whatsapp.net');
            if (tracker.socket) return tracker.socket;
            if (tracker.connection) return tracker.connection;
        }
    } catch (e) {
        // Silent
    }

    // Method 3: Check global badboiConnect
    try {
        if (global.badboiConnect) return global.badboiConnect;
    } catch (e) {
        // Silent
    }

    return null;
}

module.exports = {
    registerSocket,
    unregisterSocket,
    getSocket,
    getAllSockets,
    getConnectedNumbers,
    getActiveSocket,
    socketRegistry
};
