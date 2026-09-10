const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");

// Lam sach threadID de dung an toan trong ten file (chi giu so/chu)
function sanitizeThreadID(threadID) {
  return String(threadID).replace(/[^a-zA-Z0-9_-]/g, "");
}

function scoresFilePath(threadID) {
  return path.join(DATA_DIR, `scores_${sanitizeThreadID(threadID)}.json`);
}

function slotScoresFilePath(threadID) {
  return path.join(DATA_DIR, `slotScores_${sanitizeThreadID(threadID)}.json`);
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (err) {
    console.error(`Lỗi đọc file ${filePath}:`, err);
    return {};
  }
}

function writeJsonFile(filePath, data) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

// ===== Bang diem mua giai (theo tung threadID/nhom rieng) =====
function loadTotals(threadID) {
  return readJsonFile(scoresFilePath(threadID));
}

function saveTotals(threadID, totals) {
  writeJsonFile(scoresFilePath(threadID), totals);
}

function resetTotals(threadID) {
  saveTotals(threadID, {});
}

/**
 * ===== Diem theo "khung gio" (phien), rieng cho tung threadID/nhom =====
 * Cau truc file slotScores_<threadID>.json:
 * {
 *   "2026-07-06_20h00": {
 *     "totals": { "Team A": { totalPoints, kills, matches, booyahCount } },
 *     "matchIds": ["123456789", "123456790"],
 *     "matchScores": [ [ {teamKey,...}, ... ], [ {teamKey,...}, ... ] ] // ket
 *       qua tinh diem RIENG cua tung tran (cung thu tu voi matchIds), dung
 *       de "!td ... boN" co the bo 1 tran roi tinh lai tu dau ma khong can
 *       goi lai API. Session cu (truoc khi co tinh nang nay) se KHONG co
 *       field nay hoac bi thieu so voi matchIds -> khong the bo tung tran.
 *     "gameBooyahs": [{"teamKey":"111,222","teamName":"Team A"}, null] // doi
 *       dat Booyah cua tung tran, theo dung thu tu da choi (index 0 = Game 1,
 *       1 = Game 2, ...). teamKey dung de tra logo chinh xac (xem lib/logos.js).
 *       Du lieu CU (truoc khi co teamKey) co the la string ten doi don thuan.
 *     "removedMatchIds": ["123456790"] // cac matchId da bi "boN" (bo trận)
 *       thu cong truoc do. Dung de LAN SAU chay "!td" (khong kem boN) bot
 *       KHONG tu dong tim/cong lai chinh tran nay tu API Garena (vi API van
 *       tra ve tran do trong khung gio, du no da bi nguoi dung chu dong bo).
 *     "excludedGameNumbers": [2] // cac SO THU TU tran (Game N, tinh theo
 *       thoi gian thuc te trong khung, N bat dau tu 1) da bi nguoi dung
 *       "boN" truoc TU LUC TRAN DO CHUA DUOC LAY DIEM. Cho phep go "boN"
 *       NGAY TU DAU (khong can cong diem truoc), lan "!td" ke tiep (khong
 *       kem boN) khi tim thay du lieu se TU DONG bo qua dung Game N nay,
 *       khong cong diem, du van goi API tim tran binh thuong.
 *   },
 *   ...
 * }
 */
function loadSlotData(threadID) {
  return readJsonFile(slotScoresFilePath(threadID));
}

function saveSlotData(threadID, slotData) {
  writeJsonFile(slotScoresFilePath(threadID), slotData);
}

// Trang thai mac dinh cua Champion Rush (CPR) cho 1 phien moi:
// - pendingActivation: true = tran VUA ROI (trong 1 lan chay "!td cpr ...")
//   da co doi du diem kich hoat, tran KE TIEP se xet top 1 de phong vo dich
// - championTeamKey/Name: doi da duoc xac nhan vo dich CPR (neu co) - LUU
//   VINH VIEN cho phien nay, se duoc hien thi lai khi xem !bxhkhung.
// LUU Y: khong co field "enabled" luu san - nguoi dung phai go "cpr" trong
// TUNG lan chay lenh !td thi bot moi kiem tra/tinh Champion Rush lan do.
function defaultCprState() {
  return {
    pendingActivation: false,
    championTeamKey: null,
    championTeamName: null,
    activationThreshold: null,
  };
}

// Lay ra phien (session) theo key, neu chua co thi tra ve phien rong
function getSession(slotData, sessionKey) {
  const session = slotData[sessionKey] || {
    totals: {},
    matchIds: [],
    matchScores: [],
    gameBooyahs: [],
    removedMatchIds: [],
    excludedGameNumbers: [],
    leagueId: null,
    leagueSavedMatchIds: [],
  };
  // Tuong thich nguoc: cac phien da luu tu truoc khi co tinh nang goi
  // API league/create + league/save-match + league/calculate-score cua
  // Garena (de lay bang tong DA GOP SAN theo doi, thay vi bot tu doan gop).
  if (!Array.isArray(session.leagueSavedMatchIds)) {
    session.leagueSavedMatchIds = [];
  }
  if (typeof session.leagueId === "undefined") {
    session.leagueId = null;
  }
  // Tuong thich nguoc: cac phien da luu tu truoc (chua co field cpr) van
  // duoc gan mac dinh cpr.enabled = false khi doc lai.
  if (!session.cpr) {
    session.cpr = defaultCprState();
  }
  // Tuong thich nguoc: cac phien da luu tu truoc khi co tinh nang "boN"
  // ghi nho trung se chua co field nay.
  if (!Array.isArray(session.removedMatchIds)) {
    session.removedMatchIds = [];
  }
  // Tuong thich nguoc: cac phien da luu tu truoc khi co tinh nang "boN
  // truoc khi cong diem" se chua co field nay.
  if (!Array.isArray(session.excludedGameNumbers)) {
    session.excludedGameNumbers = [];
  }
  return session;
}

// Xoa 1 phien (session) cu the theo sessionKey, giu nguyen cac phien khac
function deleteSession(threadID, sessionKey) {
  const slotData = loadSlotData(threadID);
  const existed = Object.prototype.hasOwnProperty.call(slotData, sessionKey);
  if (existed) {
    delete slotData[sessionKey];
    saveSlotData(threadID, slotData);
  }
  return existed;
}

function resetSlotData(threadID) {
  saveSlotData(threadID, {});
}

// ===== Khoi dong lai toan bo (!kdl) =====
// Xoa SACH toan bo thu muc "data" (bang diem mua giai, diem tung khung gio,
// logo da gan, trang thai khoa/mo kenh, ...) de bot tro ve trang thai y het
// LAN DAU TIEN chay (chua co du lieu gi). Khong the hoan tac.
function resetAllData() {
  if (fs.existsSync(DATA_DIR)) {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
  // Tao lai thu muc data rong, san sang cho lan ghi du lieu ke tiep.
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ===== DON RAC TU DONG (chay dinh ky, xem index.js) =====
// Chi xoa cac PHIEN KHUNG GIO (slotScores_<threadID>.json) da qua cu -
// KHONG dung toi bang diem mua giai (scores_<threadID>.json) vi do la
// du lieu tich luy nguoi dung can giu lau dai, khong phai "rac tam".
// sessionKey co dang "YYYY-MM-DD_HHhMM" (xem timeSlot.js -> getSessionKey),
// nen chi can lay 10 ky tu dau (YYYY-MM-DD) de tinh so ngay da troi qua.
function parseSessionKeyDate(sessionKey) {
  const m = String(sessionKey).match(/^(\d{4})-(\d{2})-(\d{2})_/);
  if (!m) return null;
  const [, y, mo, d] = m;
  // Dung gio truc trua UTC de tranh sai lech 1 ngay do timezone/DST khi
  // so sanh voi "todayKeyVN" (cung quy uoc trong timeSlot.js).
  return Date.UTC(+y, +mo - 1, +d, 12, 0, 0);
}

/**
 * Xoa cac phien khung gio cu hon "maxAgeDays" ngay trong file
 * slotScores_<threadID>.json cua MOT threadID. Tra ve so phien da xoa.
 * todayDateKey: "YYYY-MM-DD" theo gio VN (truyen vao tu ben ngoai de
 * dung chung 1 moc "hom nay" cho tat ca threadID trong 1 lan don rac).
 */
function cleanupOldSlotSessionsForThread(threadID, maxAgeDays, todayDateKey) {
  const slotData = loadSlotData(threadID);
  const [ty, tm, td] = todayDateKey.split("-").map(Number);
  const todayMs = Date.UTC(ty, tm - 1, td, 12, 0, 0);
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  let removed = 0;
  for (const sessionKey of Object.keys(slotData)) {
    const sessionMs = parseSessionKeyDate(sessionKey);
    // Khong parse duoc ngay (du lieu la/cu bat thuong) -> AN TOAN, khong
    // dong den, de tranh xoa nham du lieu con dang dung.
    if (sessionMs === null) continue;
    if (todayMs - sessionMs > maxAgeMs) {
      delete slotData[sessionKey];
      removed += 1;
    }
  }

  if (removed > 0) {
    saveSlotData(threadID, slotData);
  }
  return removed;
}

/**
 * Quet TOAN BO thu muc data, don rac cho tat ca threadID/kenh dang co
 * file slotScores_*.json. Goi dinh ky 1 lan/ngay tu index.js (xem
 * scheduleDailyCleanup). Tra ve { scannedThreads, removedSessions }.
 */
function cleanupOldSlotSessionsAllThreads(maxAgeDays, todayDateKey) {
  let scannedThreads = 0;
  let removedSessions = 0;

  if (!fs.existsSync(DATA_DIR)) {
    return { scannedThreads, removedSessions };
  }

  const files = fs.readdirSync(DATA_DIR).filter(
    (f) => f.startsWith("slotScores_") && f.endsWith(".json")
  );

  for (const file of files) {
    const threadID = file.slice("slotScores_".length, -".json".length);
    scannedThreads += 1;
    removedSessions += cleanupOldSlotSessionsForThread(
      threadID,
      maxAgeDays,
      todayDateKey
    );
  }

  return { scannedThreads, removedSessions };
}

module.exports = {
  loadTotals,
  saveTotals,
  resetTotals,
  loadSlotData,
  saveSlotData,
  getSession,
  deleteSession,
  resetSlotData,
  defaultCprState,
  resetAllData,
  cleanupOldSlotSessionsAllThreads,
};
