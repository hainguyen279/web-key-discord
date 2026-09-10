'use strict';

/**
 * Kho lưu KEY dùng chung giữa Web (shark-key-portal) và Bot Discord.
 *  - Web gọi API POST /api/generate-key (xem index.js) SAU KHI đã vượt Ouo
 *    xong -> bot tạo key ở đây, trả về cho web hiển thị. Vì key được tạo
 *    NGAY TRÊN BOT (không phải random ở trình duyệt như bản cũ), bot LUÔN
 *    biết và xác minh được key này khi dùng lệnh "!key <key>".
 *  - "!taokey <số><đơn vị>" hoặc "!taokey vinhvien" (admin) -> tạo key thủ
 *    công ngay trong Discord, không cần qua web.
 *  - "!key <key>" -> kích hoạt key cho kênh Discord đang gõ lệnh.
 *
 * Quan trọng:
 *  - Thời hạn được TÍNH TỪ LÚC KÍCH HOẠT (dùng lệnh !key), không phải từ
 *    lúc tạo key.
 *  - Mỗi key CHỈ DÙNG ĐƯỢC 1 LẦN. Sau khi kích hoạt thành công, key bị
 *    đánh dấu "used" và không thể dùng lại.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEYS_DB_PATH = path.join(__dirname, '..', 'database', 'keys.json');
const KEYS_DB_DIR = path.dirname(KEYS_DB_PATH);

const DEFAULT_AMOUNT = 30;
const DEFAULT_UNIT = 'ngay'; // 'phut' | 'gio' | 'ngay' | 'vinhvien'
// Bỏ các ký tự dễ nhầm lẫn khi đọc/gõ tay: 0/O, 1/I
const KEY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function ensureFile() {
  fs.mkdirSync(KEYS_DB_DIR, { recursive: true });
  if (!fs.existsSync(KEYS_DB_PATH)) {
    atomicWrite({});
  }
}

function atomicWrite(data) {
  fs.mkdirSync(KEYS_DB_DIR, { recursive: true });
  const tempPath = `${KEYS_DB_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempPath, KEYS_DB_PATH);
}

function readAll() {
  ensureFile();
  try {
    const raw = fs.readFileSync(KEYS_DB_PATH, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.error('[KeyStore] Không đọc được keys.json, dùng dữ liệu rỗng:', error.message);
    return {};
  }
}

function writeAll(data) {
  atomicWrite(data);
}

function randomSegment(len) {
  let out = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) {
    out += KEY_CHARS[bytes[i] % KEY_CHARS.length];
  }
  return out;
}

function generateKeyString() {
  return `SHARK-${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}`;
}

function normalizeKeyInput(input) {
  return String(input || '').trim().toUpperCase();
}

/**
 * Tạo 1 key mới.
 * @param {number|null} amount  Số lượng (bỏ qua nếu unit === 'vinhvien')
 * @param {'phut'|'gio'|'ngay'|'vinhvien'} unit
 * @param {string|null} source  'web' | 'discord:<userId>' - để biết key tạo từ đâu
 */
function createKey({ amount = DEFAULT_AMOUNT, unit = DEFAULT_UNIT, createdBy = null, source = null } = {}) {
  const db = readAll();
  let key;
  do {
    key = generateKeyString();
  } while (db[key]); // tránh trùng (xác suất gần như bằng 0 nhưng cho chắc)

  const normalizedUnit = ['phut', 'gio', 'ngay', 'vinhvien'].includes(unit) ? unit : DEFAULT_UNIT;
  const normalizedAmount = normalizedUnit === 'vinhvien' ? null : (Number(amount) > 0 ? Number(amount) : DEFAULT_AMOUNT);

  db[key] = {
    key,
    amount: normalizedAmount,
    unit: normalizedUnit,
    createdAt: Date.now(),
    createdBy: createdBy ? String(createdBy) : null,
    source: source || null,
    used: false,
    usedAt: null,
    usedChannelID: null,
    usedBy: null,
  };
  writeAll(db);
  return db[key];
}

function findKey(rawKey) {
  const db = readAll();
  return db[normalizeKeyInput(rawKey)] || null;
}

/**
 * Kích hoạt 1 key cho 1 kênh Discord. Key chỉ dùng được 1 lần duy nhất.
 * @returns {{ok:true, amount:?number, unit:string, key:string} | {ok:false, reason:'not_found'|'used'}}
 */
function activateKey(rawKey, channelID, senderID) {
  const db = readAll();
  const key = normalizeKeyInput(rawKey);
  const record = db[key];

  if (!record) return { ok: false, reason: 'not_found' };
  if (record.used) return { ok: false, reason: 'used' };

  record.used = true;
  record.usedAt = Date.now();
  record.usedChannelID = channelID ? String(channelID) : null;
  record.usedBy = senderID ? String(senderID) : null;
  db[key] = record;
  writeAll(db);

  return { ok: true, amount: record.amount, unit: record.unit, key };
}

function listKeys() {
  return Object.values(readAll());
}

// ===== KICH HOAT KENH (channel activation) =====
// Luu rieng vao 1 file activations.json: channelID -> { expiresAt, keyUsed,
// activatedAt }. expiresAt = null nghia la VINH VIEN (khong bao gio het han).
const ACTIVATIONS_DB_PATH = path.join(__dirname, '..', 'database', 'activations.json');

function readActivations() {
  fs.mkdirSync(path.dirname(ACTIVATIONS_DB_PATH), { recursive: true });
  if (!fs.existsSync(ACTIVATIONS_DB_PATH)) {
    fs.writeFileSync(ACTIVATIONS_DB_PATH, '{}', 'utf8');
  }
  try {
    const raw = fs.readFileSync(ACTIVATIONS_DB_PATH, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.error('[KeyStore] Không đọc được activations.json, dùng dữ liệu rỗng:', error.message);
    return {};
  }
}

function writeActivations(data) {
  fs.mkdirSync(path.dirname(ACTIVATIONS_DB_PATH), { recursive: true });
  const tempPath = `${ACTIVATIONS_DB_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempPath, ACTIVATIONS_DB_PATH);
}

const UNIT_MS = { phut: 60 * 1000, gio: 60 * 60 * 1000, ngay: 24 * 60 * 60 * 1000 };

function computeExpiresAt(amount, unit) {
  if (unit === 'vinhvien') return null;
  const ms = (UNIT_MS[unit] || UNIT_MS.ngay) * (Number(amount) || 0);
  return Date.now() + ms;
}

/**
 * Kich hoat cho 1 NGUOI DUNG (theo Discord userID) bang key - CHI nguoi
 * do duoc dung bot, KHONG anh huong nguoi khac trong cung kenh. Thoi han
 * TINH TU BAY GIO (luc kich hoat). Key chi dung duoc 1 lan.
 * @returns {{ok:true, expiresAt:?number, unit:string, amount:?number} | {ok:false, reason:string}}
 */
function activateUserWithKey(rawKey, senderID, channelID) {
  const result = activateKey(rawKey, channelID, senderID);
  if (!result.ok) return result;

  const expiresAt = computeExpiresAt(result.amount, result.unit);
  const activations = readActivations();
  activations[String(senderID)] = {
    expiresAt,
    unit: result.unit,
    amount: result.amount,
    keyUsed: result.key,
    activatedAt: Date.now(),
    activatedInChannel: channelID ? String(channelID) : null,
  };
  writeActivations(activations);

  return { ok: true, expiresAt, unit: result.unit, amount: result.amount, key: result.key };
}

/**
 * Kiem tra 1 NGUOI DUNG (theo userID) co dang duoc kich hoat (con han) hay
 * khong - dung de quyet dinh nguoi do co duoc go lenh bot hay khong.
 * @returns {{active:boolean, expiresAt:?number, expired:boolean}}
 */
function getUserActivation(userID) {
  const activations = readActivations();
  const record = activations[String(userID)];
  if (!record) return { active: false, expiresAt: null, expired: false, neverActivated: true };

  const expired = record.expiresAt !== null && record.expiresAt <= Date.now();
  return { active: !expired, expiresAt: record.expiresAt, expired, neverActivated: false };
}

module.exports = {
  DEFAULT_AMOUNT,
  DEFAULT_UNIT,
  createKey,
  findKey,
  activateKey,
  listKeys,
  normalizeKeyInput,
  activateUserWithKey,
  getUserActivation,
  computeExpiresAt,
};
