/**
 * pendingLogoInput.js
 * Quan ly trang thai "dang cho nhap lieu" cho luong lenh !nhapid nhieu buoc:
 *   Buoc 1: nguoi dung go "!nhapid" -> cho GUI UID
 *   Buoc 2: nguoi dung gui UID (tin nhan thuong, khong can prefix "!")
 *   Buoc 3: bot hoi anh logo -> nguoi dung gui (hoac reply) 1 ANH -> luu
 *
 * Trang thai luu trong bo nho (Map), rieng cho tung cap (channelID, userID),
 * tu dong het han sau PENDING_TTL_MS neu nguoi dung khong hoan tat.
 */

const PENDING_TTL_MS = 5 * 60 * 1000; // 5 phut

const pendingMap = new Map();

function keyOf(channelID, senderID) {
  return `${channelID}:${senderID}`;
}

function setPendingLogoInput(channelID, senderID, data) {
  const key = keyOf(channelID, senderID);
  const existing = pendingMap.get(key);
  if (existing && existing.timeoutHandle) clearTimeout(existing.timeoutHandle);

  const timeoutHandle = setTimeout(() => {
    pendingMap.delete(key);
  }, PENDING_TTL_MS);
  // Khong giu tien trinh Node song chi vi bo dem thoi gian nay
  if (timeoutHandle.unref) timeoutHandle.unref();

  pendingMap.set(key, { ...data, timeoutHandle });
}

function getPendingLogoInput(channelID, senderID) {
  return pendingMap.get(keyOf(channelID, senderID)) || null;
}

function clearPendingLogoInput(channelID, senderID) {
  const key = keyOf(channelID, senderID);
  const existing = pendingMap.get(key);
  if (existing && existing.timeoutHandle) clearTimeout(existing.timeoutHandle);
  pendingMap.delete(key);
}

module.exports = {
  setPendingLogoInput,
  getPendingLogoInput,
  clearPendingLogoInput,
};
