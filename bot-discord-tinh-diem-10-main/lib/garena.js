const axios = require("axios");
const cookiePool = require("./cookiePool");

// Cac ma loi HTTP coi la "cookie/session Garena da het han" (khong con
// dang nhap duoc nua) - dung de bot bao "dang bao tri" thay vi loi ky
// thuat kho hieu cho nguoi dung thuong.
const AUTH_EXPIRED_STATUSES = [401, 403];

/**
 * Tao 1 Error danh dau ro la loi "cookie Garena het han" (isGarenaAuthExpired
 * = true), de scoreCommand.js nhan biet va bao "bot dang bao tri" + tag admin
 * thay vi hien thi loi ky thuat cho nguoi dung thuong.
 */
function makeGarenaAuthError(status, context) {
  const err = new Error(
    `Garena trả về lỗi ${status} (${context}) - có thể cookie phiên đăng nhập Garena đã hết hạn.`
  );
  err.isGarenaAuthExpired = true;
  err.garenaStatus = status;
  return err;
}

/**
 * Ham dung chung de goi POST toi Garena, TU DONG XOAY VONG qua nhieu
 * cookie (neu config.garena.cookies la mang nhieu cookie) va TU DONG
 * chuyen sang cookie khac neu cookie hien tai bi 401/403 (het han),
 * thay vi bao loi ngay lap tuc. Chi bao "het han cookie" (isGarenaAuthExpired)
 * khi TAT CA cookie da cau hinh deu bi 401/403 trong lan goi nay.
 * Dung chung cho fetchMatchResult, findMatchesByAccount, va garenaLeaguePost
 * - tranh lap code xoay vong o 3-4 noi khac nhau.
 */
async function postToGarena(config, endpoint, body, context) {
  const garenaConfig = config.garena || {};
  const candidates = cookiePool.getOrderedCandidates(garenaConfig);

  if (candidates.length === 0) {
    throw new Error(
      `Thiếu cấu hình config.garena.cookie / config.garena.cookies trong config.json. ` +
        `Kiểm tra lại mục "garena" trong config.json.`
    );
  }

  let lastAuthError = null;

  for (let i = 0; i < candidates.length; i += 1) {
    const cookie = candidates[i];
    try {
      const response = await axios.post(endpoint, body, {
        timeout: 15000, // 15s - tranh treo vo thoi han neu Garena khong phan hoi
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      return response.data;
    } catch (err) {
      if (err.code === "ECONNABORTED") {
        throw new Error(`Garena không phản hồi sau 15s khi ${context} (timeout).`);
      }
      if (err.response) {
        const status = err.response.status;
        if (AUTH_EXPIRED_STATUSES.includes(status)) {
          // Cookie nay het han -> danh dau "chet" de lan sau uu tien bo qua,
          // roi THU COOKIE TIEP THEO trong danh sach (neu con) thay vi bao
          // loi ngay - day chinh la diem khac biet so voi truoc (1 cookie
          // chet = ca bot ngung hoat dong).
          cookiePool.markCookieDead(garenaConfig, cookie);
          lastAuthError = makeGarenaAuthError(status, context);
          continue;
        }
        const respBody = err.response.data;
        const bodyText =
          typeof respBody === "string" ? respBody : JSON.stringify(respBody, null, 2);
        throw new Error(`Garena trả về lỗi ${status} khi ${context}:\n${bodyText}`);
      }
      throw err;
    }
  }

  // Het tat ca cookie deu 401/403 -> that su het han, bao dung nhu truoc.
  const totalCookies = candidates.length;
  const err = lastAuthError || makeGarenaAuthError(401, context);
  err.message += ` (đã thử hết cả ${totalCookies} cookie đang cấu hình, cookie nào cũng hết hạn)`;
  throw err;
}


/**
 * Ghep ten hien thi cho 1 doi (team) tu du lieu tra ve.
 * Vi API nay khong co teamName (luon rong), nen dung 4 ten nguoi choi ghep lai.
 */
function buildTeamLabel(entry) {
  if (entry.teamName && entry.teamName.trim().length > 0) {
    return entry.teamName.trim();
  }
  if (Array.isArray(entry.accountNames) && entry.accountNames.length > 0) {
    return entry.accountNames[0];
  }
  return `Team hạng ${entry.rank}`;
}

/**
 * Ghep danh sach uid -> ten hien thi cua TAT CA thanh vien trong doi o 1
 * tran dau (khong chi lay 1 nguoi dau tien nhu buildTeamLabel).
 * Dung de sau nay xac dinh uid nao choi DU tat ca cac tran trong 1 khung
 * gio, tu do lay ten nguoi do lam ten chinh thuc cho ca doi (xem
 * scoring.js -> pickMainTeamName).
 */
function buildRosterNames(entry) {
  const ids = Array.isArray(entry.playerAccountIds) ? entry.playerAccountIds : [];
  const names = Array.isArray(entry.accountNames) ? entry.accountNames : [];
  const roster = {};
  ids.forEach((id, idx) => {
    if (id && names[idx]) roster[id] = names[idx];
  });
  return roster;
}

/**
 * Tao 1 khoa (key) ON DINH cho doi, dua tren tap hop playerAccountId
 * (khong doi giua cac tran), thay vi dua tren ten hien thi (co the doi
 * thu tu / doi nguoi dai dien giua cac tran, gay gop nham/tach nham doi
 * khi cong don nhieu tran o lenh !td).
 * Neu khong co playerAccountIds (du lieu loi), fallback ve dung teamName.
 */
function buildTeamKey(entry) {
  if (Array.isArray(entry.playerAccountIds) && entry.playerAccountIds.length > 0) {
    return [...entry.playerAccountIds].sort().join(",");
  }
  return `name:${buildTeamLabel(entry)}`;
}

/**
 * Kiem tra 1 hang (entry) trong match.ranks co phai la du lieu "rac" tu
 * Garena hay khong: khong co ten doi VA thieu uid (duoi 2 nguoi trong
 * playerAccountIds). Loai nay thuong xay ra khi Garena tra ve 1 hang chi
 * co 1 uid le, khong du 4 nguoi, khong co teamName - neu khong loc se bi
 * bot hieu nham thanh 1 doi "ma" rieng biet (vi playerAccountIds cua no
 * khong khop uid voi bat ky doi that nao khac -> buildTeamKey tao ra key
 * moi, tach thanh doi thu 13, 14... trong khi Garena da tu loai no khoi
 * bang tong)hop cua ho.
 */
function isGarbageRankEntry(entry) {
  const ids = Array.isArray(entry.playerAccountIds)
    ? entry.playerAccountIds.filter(Boolean)
    : [];
  const hasTeamName =
    typeof entry.teamName === "string" && entry.teamName.trim().length > 0;
  const hasAccountNames =
    Array.isArray(entry.accountNames) && entry.accountNames.filter(Boolean).length > 0;
  // TRUOC DAY: bo hang co duoi 2 uid VA khong co teamName. Van de: Garena
  // doi khi tra ve 1 doi THAT (co dau chan tran that su, co diem/kill) nhung
  // chi kem 1 uid hop le (nguoi con lai bi rot mang/disconnect giua tran nen
  // Garena khong ghi nhan du uid) -> hang nay bi coi la "rac" va bi XOA HOAN
  // TOAN, khien doi do MAT DUNG 1 TRAN trong tong so (trong khi cac doi khac
  // van du) - day chinh la nguyen nhan bao loi "thieu tran" dù trang web (lay
  // qua league/calculate-score, khong loc kieu nay) van hien du.
  // BAY GIO: chi coi la rac khi THUC SU khong co CACH NAO xac dinh duoc doi
  // nay la ai (0 uid hop le VA khong teamName VA khong ca accountNames) -
  // tuc la hang hoan toan rong, khong the gop duoc du co co gang the nao.
  return ids.length === 0 && !hasTeamName && !hasAccountNames;
}

/**
 * Loc bo cac hang "rac" trong danh sach ranks cua 1 tran dau, log ra
 * console de biet tran nao / hang nao bi Garena tra thieu du lieu (phuc
 * vu tra cuu thu cong khi can). Dung chung cho web, bot Discord, bot FB
 * vi ca 3 deu goi qua fetchMatchResult().
 */
function filterGarbageRanks(ranks, matchId) {
  const clean = [];
  for (const entry of ranks) {
    if (isGarbageRankEntry(entry)) {
      const ids = Array.isArray(entry.playerAccountIds)
        ? entry.playerAccountIds
        : [];
      console.warn(
        `[garena] Bỏ qua hạng rác - matchId ${matchId}, hạng ${entry.rank}: ` +
          `uid=${JSON.stringify(ids)}, teamName="${entry.teamName || ""}" ` +
          `(thiếu tên đội và dưới 2 uid hợp lệ - có thể Garena trả dữ liệu thiếu)`
      );
      continue;
    }
    clean.push(entry);
  }
  return clean;
}

/**
 * Lay ket qua 1 tran dau cu the theo matchId.
 * API: POST https://congdong.ff.garena.vn/league-score-api/match
 * Body: { matchId: "..." }
 */
async function fetchMatchResult(config, matchId) {
  if (!config.garena || !config.garena.matchApiEndpoint) {
    throw new Error(
      "Thiếu cấu hình config.garena.matchApiEndpoint trong config.json. " +
        "Kiểm tra lại mục \"garena\" trong config.json."
    );
  }
  const { matchApiEndpoint } = config.garena;

  if (!matchId) {
    throw new Error("Thiếu matchId. Dữ liệu trận không hợp lệ.");
  }

  const data = await postToGarena(
    config,
    matchApiEndpoint,
    { matchId },
    `matchId ${matchId}`
  );

  const match = data && data.match;

  if (!match || !Array.isArray(match.ranks)) {
    throw new Error(
      `Không lấy được dữ liệu trận đấu (matchId: ${matchId}). Kiểm tra lại matchId hoặc cookie còn hạn không.\n` +
        `Phản hồi từ Garena: ${JSON.stringify(data)}`
    );
  }

  const cleanRanks = filterGarbageRanks(match.ranks, matchId);

  // ===== "tinh diem truoc khi tran ket thuc" (dong bo voi bot Messenger) =====
  // Khi nguoi choi go lenh tinh diem NGAY TRONG LUC tran dau con dang dien ra
  // (chua co doi nao Booyah), API /match cua Garena van co the tra ve mot phan
  // du lieu (cac doi da bi loai som, dang co rank) thay vi bao loi han hoi.
  // Mot tran THAT SU ket thuc luon co DUNG 1 doi duoc Garena danh dau
  // booyah=1; neu khong doi nao co booyah nay (hoac ranks rong) nghia la
  // tran van dang dien ra. TRUOC DAY bot bo qua hoan toan cac tran nay.
  // BAY GIO: van tra ve du lieu (tam thoi/provisional) de scoreCommand.js
  // CONG TAM vao bang diem hien thi ngay lap tuc, nhung KHONG cache/luu
  // vinh vien theo matchId - moi lan goi lenh se FETCH LAI tran nay cho
  // den khi thuc su ket thuc (co booyah), luc do moi duoc chot & luu cache.
  // LUU Y: r.booyah la SO (1/0), KHONG phai boolean - phai dung
  // Number(r.booyah) === 1, KHONG duoc so sanh === true.
  const hasBooyahWinner = cleanRanks.some((r) => Number(r.booyah) === 1);

  const result = cleanRanks.map((r) => ({
    teamKey: buildTeamKey(r),
    teamName: buildTeamLabel(r),
    // SUA LOI: danh dau ro day co phai TEN DOI THAT (entry.teamName cua
    // Garena) hay chi la ten "chua co gi tot hon" (buildTeamLabel fallback
    // ve ten 1 thanh vien / "Team hang N" khi Garena khong tra teamName).
    // Dung o scoring.js de KHONG BAO GIO lay ten 1 thanh vien de doi ten
    // hien thi cua ca doi khi da co san ten doi that tu Garena.
    hasOfficialTeamName: Boolean(r.teamName && String(r.teamName).trim().length > 0),
    rank: r.rank,
    kills: r.kill,
    booyah: r.booyah,
    // Toan bo danh sach uid -> ten cua doi trong tran nay (dung de xac
    // dinh sau nay uid nao choi du tat ca cac tran -> lam ten chinh)
    rosterNames: buildRosterNames(r),
    // TOAN BO uid trong doi (KHONG can co ten kem theo) - dung RIENG cho
    // viec do logo theo uid, tach biet voi rosterNames.
    allAccountIds: (Array.isArray(r.playerAccountIds) ? r.playerAccountIds : []).filter(Boolean),
    // Garena da tinh san diem cho tran nay, dung luon cho chinh xac
    scoreFromSource: r.score,
  }));

  // Danh dau tren mang ket qua (khong anh huong .map/.forEach) de
  // scoreCommand.js biet tran nay con dang dien ra hay da xong that.
  result.isProvisional = !hasBooyahWinner;
  return result;
}

/**
 * Tim tat ca tran dau cua 1 tai khoan (accountId) trong khoang thoi gian.
 * API: POST https://congdong.ff.garena.vn/league-score-api/player/find-match
 * Body: { accountId, startTime, endTime } (startTime/endTime la epoch giay)
 * Tra ve: [{ id, startTime, endTime }, ...]
 */
async function findMatchesByAccount(config, accountId, startTime, endTime) {
  if (!config.garena || !config.garena.findMatchApiEndpoint) {
    throw new Error(
      "Thiếu cấu hình config.garena.findMatchApiEndpoint trong config.json. " +
        "Kiểm tra lại mục \"garena\" trong config.json (dùng cho lệnh !td)."
    );
  }
  const { findMatchApiEndpoint } = config.garena;

  if (!accountId) {
    throw new Error("Thiếu accountId (uid người chơi).");
  }

  const data = await postToGarena(
    config,
    findMatchApiEndpoint,
    { accountId, startTime, endTime },
    `tìm trận theo uid ${accountId}`
  );

  const matches = data && data.matches;
  if (!Array.isArray(matches)) {
    throw new Error(
      `Không tìm được danh sách trận cho uid ${accountId}.\n` +
        `Phản hồi từ Garena: ${JSON.stringify(data)}`
    );
  }

  return matches;
}

/**
 * Ham dung chung de goi 1 endpoint POST cua Garena (giong het cach
 * fetchMatchResult/findMatchesByAccount dang lam), tranh lap code 3 lan
 * cho 3 endpoint moi (create / save-match / calculate-score).
 * endpointKey: ten field trong config.garena (vd "createLeagueApiEndpoint").
 * context: chuoi mo ta dung de bao loi de hieu (vd "tạo giải \"Giải khung 20h\"").
 */
async function garenaLeaguePost(config, endpointKey, body, context) {
  if (!config.garena || !config.garena[endpointKey]) {
    throw new Error(
      `Thiếu cấu hình config.garena.${endpointKey} trong config.json.`
    );
  }
  const endpoint = config.garena[endpointKey];
  return postToGarena(config, endpoint, body, context);
}

/**
 * Tao 1 "league" (giai) moi ben phia Garena, dung de gop nhieu tran vao
 * roi goi calculate-score lay bang tong DA GOP SAN theo doi (khong can
 * bot tu doan gop nua). API: POST .../league/create Body: { name }
 * Tra ve leagueId (so).
 */
async function createLeague(config, name) {
  const data = await garenaLeaguePost(
    config,
    "createLeagueApiEndpoint",
    { name },
    `tạo giải "${name}"`
  );
  const leagueId = data && data.league && data.league.id;
  if (!leagueId) {
    throw new Error(
      `Tạo giải Garena thất bại - không nhận được leagueId.\nPhản hồi: ${JSON.stringify(data)}`
    );
  }
  return leagueId;
}

/**
 * Luu 1 tran (matchId) vao 1 league da tao. API: POST .../league/save-match
 * Body: { leagueId, matchId }. Goi 1 lan cho moi tran (khong goi lai neu
 * da luu roi - xem session.leagueSavedMatchIds trong scoreCommand.js).
 */
async function saveMatchToLeague(config, leagueId, matchId) {
  await garenaLeaguePost(
    config,
    "saveMatchApiEndpoint",
    { leagueId, matchId },
    `lưu trận ${matchId} vào giải ${leagueId}`
  );
}

/**
 * Goi Garena tinh bang tong DA GOP SAN theo doi cho 1 league, dua tren
 * danh sach matchIds da luu vao league do. API: POST .../league/calculate-score
 * Body: { leagueId, matchIds }. Tra ve mang aggregatedTeamRanks (moi phan
 * tu la 1 doi da gop, Garena tu xu ly viec doi thay nguoi/sub giua cac tran).
 *
 * LUU Y: chua xac nhan duoc 100% ten field diem tong trong 1 phan tu
 * aggregatedTeamRanks (JSON mau nhan duoc bi cat, chi thay chac chan co
 * booyah, kill, numberOfPlayedMatch). Ham nay tra ve NGUYEN mang tho, viec
 * doi chieu/anh xa sang dinh dang totals cua bot nam o scoreCommand.js,
 * co canh bao console.warn neu khong tim thay field diem nao khop.
 */
async function calculateLeagueScore(config, leagueId, matchIds) {
  const data = await garenaLeaguePost(
    config,
    "calculateScoreApiEndpoint",
    { leagueId, matchIds },
    `tính bảng tổng hợp giải ${leagueId}`
  );
  const rows = data && data.aggregatedTeamRanks;
  if (!Array.isArray(rows)) {
    throw new Error(
      `Không lấy được bảng tổng hợp từ Garena (leagueId ${leagueId}).\nPhản hồi: ${JSON.stringify(data)}`
    );
  }
  return rows;
}

module.exports = {
  fetchMatchResult,
  findMatchesByAccount,
  buildTeamLabel,
  buildRosterNames,
  buildTeamKey,
  isGarbageRankEntry,
  filterGarbageRanks,
  createLeague,
  saveMatchToLeague,
  calculateLeagueScore,
};
