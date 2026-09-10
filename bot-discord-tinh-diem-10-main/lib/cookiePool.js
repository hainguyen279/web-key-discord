/**
 * cookiePool.js
 * Quan ly NHIEU cookie Garena (thay vi 1 cookie duy nhat), xoay vong
 * (round-robin) cho cac lan goi API khac nhau, va TU DONG bo qua cookie
 * nao vua bi Garena tra ve 401/403 (het han/khong hop le) trong 1 khoang
 * thoi gian, thay vi ca bot ngung hoat dong chi vi 1 cookie chet.
 *
 * config.json ho tro CA 2 dang (tuong thich nguoc):
 *   garena.cookie: "..."          -> 1 cookie duy nhat (cach cu)
 *   garena.cookies: ["...", "..."] -> nhieu cookie, bot tu xoay vong
 * Neu co ca 2, "cookies" (mang) duoc uu tien dung.
 */

// So giay 1 cookie bi danh dau "chet" (401/403) truoc khi duoc thu lai -
// tranh viec 1 cookie da het han bi thu lien tuc gay ton request vo ich,
// nhung van cho phep "song lai" neu sau nay admin da thay cookie moi ma
// chua kip restart bot (VD Render tu dong load config lai).
const DEAD_COOKIE_RETRY_MS = 10 * 60 * 1000; // 10 phut

/**
 * Chuan hoa cau hinh garena.cookie/garena.cookies ve 1 mang cookie[].
 * Loai bo chuoi rong/trung lap.
 */
function normalizeCookieList(garenaConfig) {
  const raw = [];
  if (Array.isArray(garenaConfig.cookies)) {
    raw.push(...garenaConfig.cookies);
  }
  if (garenaConfig.cookie) {
    raw.push(garenaConfig.cookie);
  }
  const seen = new Set();
  const result = [];
  for (const c of raw) {
    const trimmed = typeof c === "string" ? c.trim() : "";
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

// Trang thai xoay vong + cookie chet, luu theo tung BO cookie (dua tren
// noi dung cau hinh) - dung Map de ho tro nhieu bot/nhieu config chay
// chung 1 process neu can, khong bat buoc phai la singleton toan cuc.
const poolStateByConfigKey = new Map();

function getPoolState(cookies) {
  const configKey = cookies.join("||");
  let state = poolStateByConfigKey.get(configKey);
  if (!state) {
    state = {
      cookies,
      nextIndex: 0,
      // Map<cookie, deadUntilTimestampMs>
      deadUntil: new Map(),
    };
    poolStateByConfigKey.set(configKey, state);
  }
  return state;
}

/**
 * Lay danh sach cookie THEO THU TU se duoc thu, bat dau tu cookie xoay
 * vong tiep theo (round-robin), uu tien cookie con "song", cookie da bi
 * danh dau "chet" van duoc xep cuoi danh sach (phong khi TAT CA cookie
 * deu chet thi van con co gi do de thu, thay vi bao loi ngay lap tuc).
 */
function getOrderedCandidates(garenaConfig) {
  const cookies = normalizeCookieList(garenaConfig);
  if (cookies.length === 0) return [];

  const state = getPoolState(cookies);
  const now = Date.now();

  // Xoay vong: bat dau tu nextIndex, lay du 1 vong danh sach.
  const rotated = [];
  for (let i = 0; i < cookies.length; i += 1) {
    rotated.push(cookies[(state.nextIndex + i) % cookies.length]);
  }
  state.nextIndex = (state.nextIndex + 1) % cookies.length;

  const alive = [];
  const dead = [];
  for (const c of rotated) {
    const deadUntil = state.deadUntil.get(c);
    if (deadUntil && deadUntil > now) {
      dead.push(c);
    } else {
      alive.push(c);
    }
  }
  // Cookie song truoc, cookie chet xep cuoi (van giu lam phuong an cuoi).
  return [...alive, ...dead];
}

/**
 * Danh dau 1 cookie la "chet" (Garena tra 401/403) trong DEAD_COOKIE_RETRY_MS,
 * de cac lan goi sau uu tien bo qua no, tru khi da het cookie song.
 */
function markCookieDead(garenaConfig, cookie) {
  const cookies = normalizeCookieList(garenaConfig);
  if (cookies.length === 0) return;
  const state = getPoolState(cookies);
  state.deadUntil.set(cookie, Date.now() + DEAD_COOKIE_RETRY_MS);
}

/**
 * So cookie hien co trong cau hinh (dung de log / bao loi cho de hieu).
 */
function countConfiguredCookies(garenaConfig) {
  return normalizeCookieList(garenaConfig).length;
}

module.exports = {
  normalizeCookieList,
  getOrderedCandidates,
  markCookieDead,
  countConfiguredCookies,
};
