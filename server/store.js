const path = require('path');
const fs = require('fs');

// ==========================================
// PERSISTENCIA EN DISCO (data/store.json)
// La app es "sostenible": usuarios, amistades,
// lobby y DMs sobreviven a los reinicios.
// ==========================================
const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const store = {
    users: {},        // userId -> { userId, friendCode, name, avatar, color, banner, bio, status, createdAt }
    friendships: [],  // [ [userIdA, userIdB], ... ]
    lobby: [],        // mensajes del lobby público
    dms: {}           // dmKey -> mensajes privados
};

function loadStore() {
    try {
        if (fs.existsSync(STORE_FILE)) {
            const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
            Object.assign(store, {
                users: raw.users || {},
                friendships: raw.friendships || [],
                lobby: raw.lobby || [],
                dms: raw.dms || {}
            });
            console.log(`💾 Datos cargados: ${Object.keys(store.users).length} usuarios, ${store.lobby.length} mensajes de lobby`);
        }
    } catch (e) {
        console.error('⚠️ No se pudo cargar store.json:', e.message);
    }
}

function saveNow() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(store));
}

let saveTimer = null;
function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        try {
            saveNow();
        } catch (e) {
            console.error('⚠️ No se pudo guardar store.json:', e.message);
        }
    }, 3000);
}

// ==========================================
// IDs DE MENSAJE Y RETENCIÓN
// ==========================================
let msgSeq = 0;
const newMsgId = () => `m${Date.now().toString(36)}${(msgSeq++).toString(36)}`;

const LOBBY_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 horas
const DM_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const MAX_DM_MESSAGES = 500;

function startRetentionCleanup() {
    setInterval(() => {
        const now = Date.now();
        const before = store.lobby.length;
        for (let i = store.lobby.length - 1; i >= 0; i--) {
            if (now - store.lobby[i].timestamp > LOBBY_RETENTION_MS) store.lobby.splice(i, 1);
        }
        for (const key of Object.keys(store.dms)) {
            store.dms[key] = store.dms[key].filter(m => now - m.timestamp <= DM_RETENTION_MS);
            if (store.dms[key].length === 0) delete store.dms[key];
        }
        if (store.lobby.length !== before) scheduleSave();
    }, 60 * 60 * 1000);
}

// Cargar al iniciar, igual que el index.js original
loadStore();

module.exports = {
    store,
    loadStore,
    saveNow,
    scheduleSave,
    newMsgId,
    startRetentionCleanup,
    MAX_DM_MESSAGES
};
