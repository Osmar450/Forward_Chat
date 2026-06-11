const { test } = require('node:test');
const assert = require('node:assert');

const { normalizeCode, generateFriendCode, sanitizeMedia, dmKey } = require('../server/users');
const { addUserSocket, removeUserSocket, isOnline, userRoom } = require('../server/presence');

// ==========================================
// Forward Token (códigos de amigo)
// ==========================================
test('normalizeCode acepta variantes con/sin prefijo y minúsculas', () => {
    assert.strictEqual(normalizeCode('fwd-ab2c-3def'), 'FWD-AB2C-3DEF');
    assert.strictEqual(normalizeCode('AB2C3DEF'), 'FWD-AB2C-3DEF');
    assert.strictEqual(normalizeCode('  fwd ab2c 3def  '), 'FWD-AB2C-3DEF');
});

test('normalizeCode rechaza códigos inválidos', () => {
    assert.strictEqual(normalizeCode(''), '');
    assert.strictEqual(normalizeCode(null), '');
    assert.strictEqual(normalizeCode('FWD-SHORT'), '');
    assert.strictEqual(normalizeCode('FWD-AB2C-3DEF-EXTRA'), '');
});

test('generateFriendCode produce el formato FWD-XXXX-XXXX sin caracteres ambiguos', () => {
    for (let i = 0; i < 25; i++) {
        const code = generateFriendCode();
        assert.match(code, /^FWD-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    }
});

// ==========================================
// Saneamiento de media (avatares/banners)
// ==========================================
test('sanitizeMedia limita el tamaño y el tipo', () => {
    assert.strictEqual(sanitizeMedia(12345), null);
    assert.strictEqual(sanitizeMedia('x'.repeat(2_000_001)), null);
    assert.strictEqual(sanitizeMedia('data:image/png;base64,abc'), 'data:image/png;base64,abc');
});

// ==========================================
// Scopes de conversación privada
// ==========================================
test('dmKey es estable sin importar el orden de los participantes', () => {
    assert.strictEqual(dmKey('ana', 'beto'), dmKey('beto', 'ana'));
    assert.strictEqual(dmKey('beto', 'ana'), 'ana|beto');
});

// ==========================================
// Presencia multi-socket (señalización de llamadas)
// ==========================================
test('la presencia soporta múltiples pestañas por usuario', () => {
    const uid = 'test_user_presence';
    assert.strictEqual(isOnline(uid), false);

    addUserSocket(uid, 's1');
    addUserSocket(uid, 's2');
    assert.strictEqual(isOnline(uid), true);

    // Cerrar una pestaña no desconecta al usuario
    assert.strictEqual(removeUserSocket(uid, 's1'), false);
    assert.strictEqual(isOnline(uid), true);

    // Cerrar la última sí lo deja completamente offline
    assert.strictEqual(removeUserSocket(uid, 's2'), true);
    assert.strictEqual(isOnline(uid), false);
});

test('userRoom genera el room de señalización correcto', () => {
    assert.strictEqual(userRoom('osmar'), 'u:osmar');
});
