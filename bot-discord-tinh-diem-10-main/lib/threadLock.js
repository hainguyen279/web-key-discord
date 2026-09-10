const fs = require("fs");
const path = require("path");

const LOCK_PATH = path.join(__dirname, "..", "data", "channelLocks.json");

function readLocks() {
  if (!fs.existsSync(LOCK_PATH)) return {};
  try {
    const raw = fs.readFileSync(LOCK_PATH, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("Lỗi đọc channelLocks.json:", e);
    return {};
  }
}

function writeLocks(data) {
  const dir = path.dirname(LOCK_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LOCK_PATH, JSON.stringify(data, null, 2), "utf8");
}

// true = tính năng tính điểm đang bị khoá ở kênh này.
// Mặc định bot luôn MỞ tính điểm ở mọi kênh.
// Chỉ khi admin dùng !lock diem thì kênh đó mới bị khoá.
// !unlock diem sẽ mở lại và xoá trạng thái khoá đã lưu.
function isScoreLocked(channelID, config) {
  const locks = readLocks();
  return locks[channelID] === true;
}

function getLockedChannelCount() {
  const locks = readLocks();
  return Object.values(locks).filter((value) => value === true).length;
}

function setScoreLocked(channelID, locked) {
  const locks = readLocks();
  if (locked) {
    locks[channelID] = true;
  } else {
    delete locks[channelID];
  }
  writeLocks(locks);
}

module.exports = { isScoreLocked, setScoreLocked, getLockedChannelCount };
