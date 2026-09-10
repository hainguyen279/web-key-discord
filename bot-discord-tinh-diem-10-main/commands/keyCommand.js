'use strict';

const { createKey, findKey, listKeys, activateUserWithKey, getUserActivation } = require('../lib/keyStore');

const UNIT_LABEL = { phut: 'phút', gio: 'giờ', ngay: 'ngày', vinhvien: 'vĩnh viễn' };
const KEY_PATTERN = /SHARK-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/i;

/**
 * Parse "10ngay" / "30 phut" / "vinhvien" -> { amount, unit }
 */
function parseDuration(raw) {
  const text = String(raw || '').trim().toLowerCase();
  if (!text) return null;
  if (text === 'vinhvien' || text === 'vinh vien') return { amount: null, unit: 'vinhvien' };

  const m = text.match(/^(\d+)\s*(phut|gio|ngay)$/);
  if (!m) return null;
  return { amount: Number(m[1]), unit: m[2] };
}

function formatActivationReply(header, result) {
  const durationText =
    result.unit === 'vinhvien' ? 'VĨNH VIỄN' : `${result.amount} ${UNIT_LABEL[result.unit]}`;
  const expiresText =
    result.expiresAt === null
      ? 'Không bao giờ hết hạn.'
      : `Hết hạn lúc: <t:${Math.floor(result.expiresAt / 1000)}:F>`;
  return (
    `${header}\n` +
    `Thời hạn: **${durationText}** kể từ bây giờ.\n` +
    `${expiresText}\n` +
    `Key: \`${result.key}\`\n` +
    `⚠️ Quyền dùng bot này CHỈ ÁP DỤNG CHO BẠN, người khác trong kênh vẫn cần key riêng.`
  );
}

/**
 * Xử lý lệnh "!taokey" (admin), "!key", "!trangthai", "!dskey".
 * Trả về true nếu đã xử lý (là 1 trong các lệnh này).
 */
async function handleKeyCommand(message, config) {
  const prefix = config.prefix || '!';
  const body = (message.content || '').trim();
  if (!body.startsWith(prefix)) return false;

  const parts = body.slice(prefix.length).trim().split(/\s+/);
  const command = (parts[0] || '').toLowerCase();
  const args = parts.slice(1);

  const adminIDs = (config.adminUserIDs || []).map(String);
  const isAdmin = adminIDs.includes(String(message.author.id));

  if (command === 'taokey') {
    if (!isAdmin) {
      await message.reply('❌ Chỉ admin bot mới được tạo key.');
      return true;
    }
    const durationArg = args.join('');
    const parsed = parseDuration(durationArg) || { amount: 30, unit: 'ngay' };
    const record = createKey({
      amount: parsed.amount,
      unit: parsed.unit,
      createdBy: message.author.id,
      source: `discord:${message.author.id}`,
    });
    const durationText =
      record.unit === 'vinhvien' ? 'VĨNH VIỄN' : `${record.amount} ${UNIT_LABEL[record.unit]}`;
    await message.reply(
      `✅ Đã tạo key mới:\n` +
        `\`${record.key}\`\n` +
        `Thời hạn: **${durationText}** (tính từ lúc người dùng kích hoạt)\n` +
        `Người dùng key này gõ "!key ${record.key}" (hoặc dán thẳng key vào chat) để tự kích hoạt cho RIÊNG họ.`
    );
    return true;
  }

  if (command === 'key') {
    const rawKey = args[0];
    if (!rawKey) {
      await message.reply(`Cú pháp: \`${prefix}key <key>\` (vd: ${prefix}key SHARK-AB12-CD34-EF56)`);
      return true;
    }
    const result = activateUserWithKey(rawKey, message.author.id, message.channel.id);
    if (!result.ok) {
      const reasonText =
        result.reason === 'used'
          ? 'Key này đã được dùng trước đó, không thể dùng lại.'
          : 'Key không tồn tại hoặc sai. Kiểm tra lại key (lấy từ web hoặc admin cấp).';
      await message.reply(`❌ Kích hoạt thất bại: ${reasonText}`);
      return true;
    }
    await message.reply(formatActivationReply('✅ Kích hoạt thành công cho BẠN!', result));
    return true;
  }

  if (command === 'trangthai' || command === 'hethanbot') {
    const status = getUserActivation(message.author.id);
    if (status.neverActivated) {
      await message.reply(
        `⚠️ Bạn CHƯA từng kích hoạt bot. Dùng \`${prefix}key <key>\` hoặc dán key vào chat để kích hoạt.`
      );
    } else if (status.expired) {
      await message.reply(`❌ Quyền dùng bot của bạn ĐÃ HẾT HẠN. Dùng \`${prefix}key <key mới>\` để gia hạn.`);
    } else if (status.expiresAt === null) {
      await message.reply(`✅ Bạn đang có quyền dùng bot VĨNH VIỄN.`);
    } else {
      await message.reply(
        `✅ Bạn đang có quyền dùng bot.\nHết hạn lúc: <t:${Math.floor(status.expiresAt / 1000)}:F> (<t:${Math.floor(status.expiresAt / 1000)}:R>)`
      );
    }
    return true;
  }

  if (command === 'dskey') {
    if (!isAdmin) {
      await message.reply('❌ Chỉ admin bot mới xem được danh sách key.');
      return true;
    }
    const keys = listKeys();
    const unused = keys.filter((k) => !k.used);
    const lines = unused
      .slice(0, 20)
      .map((k) => `\`${k.key}\` - ${k.unit === 'vinhvien' ? 'vĩnh viễn' : `${k.amount} ${UNIT_LABEL[k.unit]}`}`);
    await message.reply(
      `📋 Tổng số key: ${keys.length} (chưa dùng: ${unused.length})\n` +
        (lines.length ? lines.join('\n') : '(không có key nào chưa dùng)') +
        (unused.length > 20 ? `\n...và ${unused.length - 20} key khác` : '')
    );
    return true;
  }

  return false;
}

/**
 * Kiem tra 1 NGUOI GUI TIN NHAN co duoc phep dung bot hay khong - dung o
 * index.js de CHAN moi lenh khac (!td, !diem...) neu nguoi do CHUA kich
 * hoat/da het han. MAC DINH KHONG AI DUOC DUNG BOT, TRU admin bot
 * (config.adminUserIDs) va nguoi da nhap key con hieu luc.
 */
function isUserUnlocked(senderID, config) {
  const adminIDs = (config.adminUserIDs || []).map(String);
  if (adminIDs.includes(String(senderID))) return true;
  return getUserActivation(senderID).active;
}

/**
 * Quet 1 tin nhan BAT KY (khong can go lenh "!key") de tim chuoi dung
 * dinh dang key (SHARK-XXXX-XXXX-XXXX) va TU DONG kich hoat CHO NGUOI GUI
 * neu tim thay. Chi nguoi gui tin nhan do duoc dung bot, khong anh huong
 * nguoi khac trong kenh.
 * Tra ve true neu tin nhan nay CO chua 1 key (du kich hoat thanh cong hay
 * that bai) - de index.js biet KHONG can xu ly tiep nhu 1 lenh binh thuong.
 */
async function tryAutoActivateFromMessage(message, config) {
  const content = (message.content || '').trim();
  const match = content.match(KEY_PATTERN);
  if (!match) return false;

  const rawKey = match[0];
  const result = activateUserWithKey(rawKey, message.author.id, message.channel.id);

  if (!result.ok) {
    const reasonText =
      result.reason === 'used'
        ? 'Key này đã được dùng trước đó, không thể dùng lại.'
        : 'Key không tồn tại hoặc sai. Kiểm tra lại key (lấy từ web hoặc admin cấp).';
    await message.reply(`❌ Phát hiện key nhưng kích hoạt thất bại: ${reasonText}`);
    return true;
  }

  await message.reply(formatActivationReply('🔑 Đã tự động phát hiện và kích hoạt key cho BẠN!', result));
  return true;
}

module.exports = { handleKeyCommand, parseDuration, isUserUnlocked, tryAutoActivateFromMessage };
