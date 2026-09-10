"use strict";
/**
 * channelQueue.js
 * Thay the co che "isBusy -> tu choi lenh, bat nguoi dung tu go lai" cu
 * (xem lich su o commands/scoreCommand.js) bang HANG DOI TU DONG theo
 * tung channelID: nhieu lenh !td cung luc trong 1 kenh se duoc XEP HANG
 * va TU DONG chay lan luot ngay khi den luot - khong can nguoi dung phai
 * tu gui lai lenh - trong khi VAN dam bao chi 1 lenh duoc xu ly tren 1
 * kenh tai 1 thoi diem (tranh 2 lenh cung doc/ghi de session gay tinh
 * sai/trung diem).
 *
 * Cac kenh KHAC NHAU hoan toan doc lap, khong anh huong lan nhau.
 */

// channelID -> mang cac ham resolve dang cho den luot cua CHINH kenh do.
const waitersByChannel = new Map();

// Tap cac channelID dang co 1 lenh giu "luot" (dang chay), dung de biet
// kenh co dang "ban" hay khong.
const activeChannels = new Set();

/**
 * Kenh nay co dang co lenh khac giu luot / dang chay hay khong - dung de
 * quyet dinh co bao cho nguoi dung biet "lenh cua ban da duoc xep hang,
 * se tu dong chay tiep theo" hay khong (chi bao khi THAT SU phai cho).
 */
function isChannelBusy(channelID) {
  return activeChannels.has(channelID);
}

/**
 * Xin 1 "luot" xu ly doc quyen cho channelID nay.
 * - Neu kenh dang ranh: tra ve ngay (Promise da resolve), giong het hanh
 *   vi markBusy() cu, khong lam cham lenh dau tien.
 * - Neu kenh dang ban: xep vao CUOI hang doi cua kenh nay, Promise CHI
 *   resolve khi den luot (sau khi lenh dang giu luot goi releaseChannelSlot).
 * Nho luon goi releaseChannelSlot(channelID) (vi du trong finally) sau khi
 * xu ly xong, neu khong ca hang doi cua kenh do se bi "ket" mai mai.
 */
function acquireChannelSlot(channelID) {
  return new Promise((resolve) => {
    if (!activeChannels.has(channelID)) {
      activeChannels.add(channelID);
      resolve();
      return;
    }
    if (!waitersByChannel.has(channelID)) {
      waitersByChannel.set(channelID, []);
    }
    waitersByChannel.get(channelID).push(resolve);
  });
}

/**
 * Tra "luot" xu ly cho channelID nay.
 * - Neu con nguoi dang xep hang cho CHINH kenh nay: chuyen luot NGAY cho
 *   nguoi dau hang doi (khong xoa khoi activeChannels - "luot" duoc
 *   chuyen thang tay, khong tao khoang trong de lenh khac chen ngang).
 * - Neu khong con ai cho: danh dau kenh la ranh.
 * An toan khi lo goi thua 1 lan cho cung 1 lenh (vi du vua o nhanh boN
 * vua o catch an toan ben ngoai) MIEN LA code goi noi giu 1 co rieng danh
 * dau "da tung acquire" truoc khi goi release - xem cach dung trong
 * scoreCommand.js (bien channelSlotHeld).
 */
function releaseChannelSlot(channelID) {
  const waiters = waitersByChannel.get(channelID);
  if (waiters && waiters.length > 0) {
    const next = waiters.shift();
    next();
    return;
  }
  activeChannels.delete(channelID);
}

module.exports = { isChannelBusy, acquireChannelSlot, releaseChannelSlot };
