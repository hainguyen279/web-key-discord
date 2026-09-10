/**
 * timeSlot.js
 * Quan ly danh sach "khung gio" co dinh trong ngay va gom nhom
 * cac tran dau nhap vao dung khung gio do (cong don den khi
 * chuyen sang khung gio tiep theo).
 */

// Danh sach khung gio theo thu tu trong ngay.
// Khung 23h30 keo qua nua dem va van tinh den 01h30 (giu nguyen logic khung cu);
// khung 01h00 moi la mot khung doc lap, tinh du lieu tu 01h00 toi 03h00.
const SLOTS = [
  "08h00",
  "10h00",
  "13h00",
  "15h00",
  "18h00",
  "20h00",
  "21h50",
  "22h00",
  "23h30",
  "01h00",
];

/**
 * Chuan hoa chuoi nguoi dung nhap (vd "20h", "20h00", "20:00", "2000")
 * ve dung 1 trong cac khung gio da dinh nghia o SLOTS.
 * Tra ve null neu khong khop khung nao.
 */
function normalizeSlotLabel(raw) {
  if (!raw) return null;
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/:/g, "h").replace(/\s+/g, "");

  // dang "20h", "20h00", "20h0"
  let m = s.match(/^(\d{1,2})h(\d{0,2})$/);
  // dang so thuan "2000" hoac "800" (khong co chu h)
  if (!m) {
    const m2 = s.match(/^(\d{1,4})$/);
    if (m2) {
      const digits = m2[1];
      if (digits.length <= 2) {
        m = [null, digits, ""];
      } else {
        m = [null, digits.slice(0, digits.length - 2), digits.slice(-2)];
      }
    }
  }
  if (!m) return null;

  const hh = m[1].padStart(2, "0");
  const mm = (m[2] || "").padStart(2, "0") || "00";
  const candidate = `${hh}h${mm}`;

  if (SLOTS.includes(candidate)) return candidate;

  // Neu nguoi dung chi go gio (khong go phut), tim khung co cung gio
  if (!m[2]) {
    const found = SLOTS.find((slot) => slot.startsWith(hh + "h"));
    if (found) return found;
  }

  return null;
}

// Gio:phut cua tung khung, dung de tinh moc thoi gian (epoch)
const SLOT_TIME = {
  "08h00": [8, 0],
  "10h00": [10, 0],
  "13h00": [13, 0],
  "15h00": [15, 0],
  "18h00": [18, 0],
  "20h00": [20, 0],
  "21h50": [21, 50],
  "22h00": [22, 0],
  "23h30": [23, 50],
  "01h00": [1, 0],
};

// Gio ket thuc THUC TE cho mot so khung dac biet, dung thay the cho gio
// bat dau cua khung ke tiep khi tinh endTime trong getSlotTimeRange.
// Khung 23h30 giu moc ket thuc 01h30 nhu logic cu de khong cat mat
// cac tran dien ra tu 01h00-01h30 (day la phan da bi thieu trong ban cap nhat truoc).
// Khung 01h00 la khung moi, tinh rieng den 03h00. Hai khung co the overlap theo yeu cau.
const SLOT_END_OVERRIDE = {
  "23h30": [1, 50],
  "01h00": [3, 0],
};

function getSlotIndex(label) {
  return SLOTS.indexOf(label);
}

function getNextSlotLabel(label) {
  const idx = getSlotIndex(label);
  if (idx === -1) return null;
  return SLOTS[(idx + 1) % SLOTS.length];
}

// Yeu cau rieng: khung "21h50" va khung "22h00" deu cong don diem
// den khi bat dau khung "23h30" (thay vi khung ke tiep binh thuong).
// Ham nay tra ve "khung ket thuc" thuc su duoc dung de tinh diem/hien thi.
function getEffectiveNextSlotLabel(label) {
  if (label === "21h50" || label === "22h00") return "23h30";
  return getNextSlotLabel(label);
}

// Cong them "days" ngay vao dateKey dang "YYYY-MM-DD", tra ve dateKey moi
function addDaysToDateKey(dateKey, days) {
  const [y, m, d] = dateKey.split("-").map(Number);
  // Dung gio truc trua UTC de tranh loi lech ngay do DST/timezone
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  const ny = dt.getUTCFullYear();
  const nm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const nd = String(dt.getUTCDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

// Doi (dateKey "YYYY-MM-DD" + gio:phut theo gio VN) thanh epoch giay (UTC)
function vnDateTimeToEpoch(dateKey, hour, minute) {
  const [y, m, d] = dateKey.split("-").map(Number);
  // Gio VN = UTC+7, nen epoch UTC = thoi gian VN tru 7 tieng
  return Math.floor(Date.UTC(y, m - 1, d, hour - 7, minute, 0) / 1000);
}

/**
 * Tinh khoang thoi gian [startTime, endTime] (epoch giay) cua 1 khung gio,
 * tinh tu luc khung gio bat dau cho den luc khung gio ke tiep bat dau.
 * dateKey la ngay (theo gio VN) ma lenh !td duoc goi, dang "YYYY-MM-DD".
 */
function getSlotTimeRange(slotLabel, dateKey) {
  const cur = SLOT_TIME[slotLabel];
  const nextLabel = getEffectiveNextSlotLabel(slotLabel);
  const next = SLOT_END_OVERRIDE[slotLabel] || SLOT_TIME[nextLabel];
  if (!cur || !next) return null;

  const curMinutes = cur[0] * 60 + cur[1];
  const nextMinutes = next[0] * 60 + next[1];

  // Neu khung ke tiep co gio:phut "nho hon hoac bang" khung hien tai,
  // nghia la no roi sang ngay hom sau (vd 23h30 -> 01h00)
  const endDateKey =
    nextMinutes <= curMinutes ? addDaysToDateKey(dateKey, 1) : dateKey;

  const startTime = vnDateTimeToEpoch(dateKey, cur[0], cur[1]);
  const endTime = vnDateTimeToEpoch(endDateKey, next[0], next[1]);

  return { startTime, endTime, nextLabel };
}

// Ngay hien tai theo gio Viet Nam (UTC+7), dang "YYYY-MM-DD"
function getTodayKeyVN() {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parse ngay nguoi dung nhap ve dang dateKey "YYYY-MM-DD".
 * Ho tro cac dang: "5/7/2026", "05/07/2026", "5-7-2026", "2026-07-05".
 * Dang "d/m/yyyy" duoc uu tien (theo thoi quen Viet Nam: ngay/thang/nam).
 * Tra ve null neu khong parse duoc hoac ngay khong hop le.
 */
function parseDateArg(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  // Dang YYYY-MM-DD hoac YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return isValidDate(+y, +mo, +d) ? formatDateKey(+y, +mo, +d) : null;
  }

  // Dang d/m/yyyy hoac d-m-yyyy (uu tien kieu Viet Nam)
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return isValidDate(+y, +mo, +d) ? formatDateKey(+y, +mo, +d) : null;
  }

  return null;
}

function isValidDate(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

function formatDateKey(y, mo, d) {
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}


// Neu nguoi dung khong nhap ngay va dang goi !td trong khoang
// 00h00 -> truoc 06h00 sang, mac dinh phai lay NGAY HOM TRUOC,
// NGOAI TRU khung "01h00" (khung nay tinh cho dung ngay hien tai).
// Nhu vay chi can go !td <uid> 23h30 (hoac khung khac) luc nua dem,
// bot van tim dung cac tran cua dem hom truoc.
function getDefaultDateKeyForSlot(slotLabel) {
  const today = getTodayKeyVN();
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const hourVN = now.getUTCHours();
  if (slotLabel !== "01h00" && hourVN >= 0 && hourVN < 6) {
    return addDaysToDateKey(today, -1);
  }
  return today;
}

// Khoa luu tru cho 1 "phien" = 1 khung gio trong 1 ngay cu the
function getSessionKey(slotLabel, dateKey) {
  return `${dateKey || getTodayKeyVN()}_${slotLabel}`;
}

function listSlotsText() {
  return SLOTS.join(", ");
}

module.exports = {
  SLOTS,
  normalizeSlotLabel,
  getSlotIndex,
  getNextSlotLabel,
  getEffectiveNextSlotLabel,
  getTodayKeyVN,
  getDefaultDateKeyForSlot,
  getSessionKey,
  listSlotsText,
  getSlotTimeRange,
  parseDateArg,
};
