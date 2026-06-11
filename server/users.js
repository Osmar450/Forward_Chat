const { store, scheduleSave } = require('./store');

// ==========================================
// FRIEND TOKEN: identificador único que simula
// ser un "número" (formato FWD-XXXX-XXXX)
// ==========================================
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos (0/O, 1/I)

function generateFriendCode() {
    const block = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    let code;
    do {
        code = `FWD-${block()}-${block()}`;
    } while (Object.values(store.users).some(u => u.friendCode === code));
    return code;
}

function normalizeCode(input) {
    if (!input) return '';
    const clean = String(input).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const body = clean.startsWith('FWD') ? clean.slice(3) : clean;
    if (body.length !== 8) return '';
    return `FWD-${body.slice(0, 4)}-${body.slice(4)}`;
}

const MAX_DATAURL_LENGTH = 2_000_000; // ~1.5MB en base64; evita perfiles gigantes

function sanitizeMedia(value) {
    if (typeof value !== 'string') return null;
    if (value.length > MAX_DATAURL_LENGTH) return null;
    return value;
}

function getOrCreateUser(userId) {
    if (!store.users[userId]) {
        store.users[userId] = {
            userId,
            friendCode: generateFriendCode(),
            name: userId,
            avatar: null,
            color: null,
            banner: null,
            bannerColor: null,
            bio: '',
            status: 'online',
            createdAt: Date.now()
        };
        scheduleSave();
    }
    return store.users[userId];
}

function publicProfile(user, isOnline) {
    const status = isOnline ? (user.status === 'invisible' ? 'offline' : (user.status || 'online')) : 'offline';
    return {
        userId: user.userId,
        name: user.name,
        avatar: user.avatar,
        color: user.color,
        banner: user.banner,
        bannerColor: user.bannerColor,
        bio: user.bio || '',
        status,
        isBot: false
    };
}

// Contador perezoso: se inicializa en el primer uso, cuando el store ya cargó
let anonymousCounter = null;
const generateAnonymousId = () => {
    if (anonymousCounter === null) anonymousCounter = Object.keys(store.users).length + 1;
    let id;
    do {
        id = `anonimo_${anonymousCounter++}`;
    } while (store.users[id]);
    return id;
};

const BOT_ID = 'forwardbot';
const BOT_PROFILE = {
    userId: BOT_ID,
    name: 'ForwardBot',
    avatar: '/assets/Forwardbot_profile.svg',
    color: '#8B5CF6',
    banner: null,
    bannerColor: '#8B5CF6',
    bio: 'Asistente de IA de Forward_Chat. Menciona @ForwardBot en el lobby o escríbeme por privado.',
    status: 'online',
    isBot: true
};

// ==========================================
// AMISTADES Y DMs
// ==========================================
const dmKey = (a, b) => [a, b].sort().join('|');

function areFriends(a, b) {
    return store.friendships.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

function friendIdsOf(userId) {
    return store.friendships
        .filter(([x, y]) => x === userId || y === userId)
        .map(([x, y]) => (x === userId ? y : x));
}

module.exports = {
    generateFriendCode,
    normalizeCode,
    sanitizeMedia,
    getOrCreateUser,
    publicProfile,
    generateAnonymousId,
    BOT_ID,
    BOT_PROFILE,
    dmKey,
    areFriends,
    friendIdsOf
};
