/**
 * scoring.js
 * Nhan du lieu tho cua 1 tran dau (danh sach doi: rank + so kill)
 * va tra ve diem cong tich luy cho tung doi/nguoi choi.
 *
 * Du lieu dau vao mong doi co dang (ban se dieu chinh lai cho khop
 * voi du lieu thuc te lay tu congdong.ff.garena.vn):
 *
 * [
 *   { teamName: "Team A", rank: 1, kills: 8 },
 *   { teamName: "Team B", rank: 2, kills: 5 },
 *   ...
 * ]
 */

function calculateMatchScores(matchResults, scoringConfig) {
  const { pointsPerKill, rankPoints, rankPointsDefaultBelow10 } = scoringConfig;

  return matchResults.map((entry) => {
    const killPoints = (entry.kills || 0) * pointsPerKill;

    const placementPoints =
      rankPoints[String(entry.rank)] !== undefined
        ? rankPoints[String(entry.rank)]
        : rankPointsDefaultBelow10;

    // DA DOI CHIEU THUC TE: entry.scoreFromSource (diem Garena tra ve san
    // cho tung tran) moi la diem CHINH XAC duoc dung lam ket qua chinh
    // thuc (da kiem tra khop 100% voi bang xep hang cuoi cung cua giai).
    // Bang rankPoints trong config.json KHONG khop cong thuc that cua
    // Garena o moi hang (vd hang 2/3 co the +8 hay +9 tuy so doi con song
    // trong tran, khong co dinh nhu bang config) -> neu tu tinh lai se bi
    // lech diem cong don qua nhieu tran. Vi vay uu tien dung scoreFromSource
    // khi co, fallback ve cong thuc rankPoints chi khi thieu du lieu nay.
    const totalPoints =
      typeof entry.scoreFromSource === "number"
        ? entry.scoreFromSource
        : killPoints + placementPoints;

    return {
      // teamKey: dinh danh doi ON DINH (dua tren playerAccountIds), dung de
      // gop diem dung doi giua nhieu tran. teamName: chi de HIEN THI.
      teamKey: entry.teamKey || entry.teamName,
      teamName: entry.teamName,
      // Xem chu thich o garena.js: co phai ten doi THAT tu Garena hay chi
      // la ten fallback (ten 1 thanh vien / "Team hang N").
      hasOfficialTeamName: Boolean(entry.hasOfficialTeamName),
      rank: entry.rank,
      // Cờ booyah THẬT lấy nguyên từ Garena (entry.booyah), không tự suy ra
      // từ rank === 1 - dùng để xác định đội thắng chính xác 100% theo nguồn.
      // LUU Y: Garena tra ve booyah dang SO (1/0), KHONG phai boolean
      // (true/false) -> phai ep kieu qua Number(...) === 1, dung "=== true"
      // se LUON SAI (1 !== true trong JS).
      booyah: Number(entry.booyah) === 1,
      kills: entry.kills,
      killPoints,
      placementPoints,
      totalPoints,
      // uid -> ten cua tat ca thanh vien doi trong tran nay, dung de
      // mergeIntoLeaderboard xac dinh uid nao choi DU tat ca cac tran.
      rosterNames: entry.rosterNames || {},
      // TOAN BO uid trong doi tran nay, KE CA uid khong co ten kem theo
      // (xem chu thich o garena.js) - dung RIENG cho viec do logo !nhapid.
      allAccountIds: entry.allAccountIds || [],
    };
  });
}

/**
 * Tim key THUC SU dung de gop 1 dong ket qua (row) vao bang totals hien tai.
 *
 * Truoc day bot chi lookup dung `totals[row.teamKey]` (row.teamKey = tap
 * playerAccountIds cua tran nay, sort + join). Cach nay ĐÒI HỎI danh sach
 * uid phai GIONG HET nhau 100% giua cac tran thi moi duoc tinh la cung 1
 * doi -> chi can 1 tran co uid bi thieu/khac thu tu (sub vao thay, Garena
 * tra ve playerAccountIds khong day du...) la doi bi TACH thanh 2 dong
 * rieng trong bang xep hang, du la cung 1 doi ngoai doi.
 *
 * Ham nay sua lai theo huong "gop theo DA SO uid trung nhau":
 *  1) Neu totals[row.teamKey] da ton tai (uid tran nay khop y het 1 doi
 *     da co) -> dung luon key do (duong nhanh, khong can do gi them).
 *  2) Neu khong, so sanh danh sach uid cua tran nay (row.rosterNames) voi
 *     danh sach uid ĐÃ TUNG ghi nhan cua tung doi trong totals (luu trong
 *     stat.nameStats). Doi nao co so uid trung >= QUA BAN (hon 50%) so
 *     voi so thanh vien tran nay, va co so uid trung CAO NHAT, thi duoc
 *     chon la doi de gop vao.
 *  3) Neu khong tim thay doi nao dat qua ban -> coi la doi MOI, dung
 *     row.teamKey lam key moi (giu nguyen hanh vi cu).
 *
 * Vi du: doi 4 nguoi, tran 1 co du 4 uid A,B,C,D -> tao key "A,B,C,D".
 * Tran 2 vang 1 nguoi, C duoc thay bang E -> uid tran nay la A,B,D,E,
 * trung 3/4 (A,B,D) voi doi cu -> 3 >= qua ban cua 4 (>=3) -> gop dung
 * vao doi cu, khong tao dong moi nua.
 */
function resolveMergeKey(totals, row) {
  // Khop tuyet doi (nhanh + chinh xac nhat khi co the) -> uu tien dung truoc.
  if (totals[row.teamKey]) return row.teamKey;

  const uids = Object.keys(row.rosterNames || {});
  // Khong co du lieu roster (uid) de so sanh -> khong the gop theo da so,
  // danh phai tao/dung key theo kieu cu (fallback ve teamName).
  if (uids.length === 0) return row.teamKey;

  // Can TU MOT NUA tro len thanh vien tran nay da tung duoc ghi nhan
  // thuoc ve doi do thi tinh la "cung 1 doi" (>=50%, KHONG bat buoc
  // phai hon 50%). Vi du doi 4 nguoi doi 2/4 thanh vien (thay the do
  // nghi/sub) van con trung dung 2/4 = 50% -> van phai duoc gop, khong
  // duoc tach thanh doi moi. Truoc day dung floor(n/2)+1 (bat buoc HON
  // ban, tuc >=3/4 voi doi 4 nguoi) nen truong hop doi dung 50% roster
  // (vd NOBITA doi 2/4 thanh vien) bi tinh la KHONG dat nguong -> bi
  // tach thanh 2 dong diem rieng du la cung 1 doi ngoai doi.
  const requiredForRow = Math.ceil(uids.length / 2);

  let bestKey = null;
  let bestOverlap = 0;

  for (const [key, stat] of Object.entries(totals)) {
    const knownUids = stat.nameStats || {};
    const knownUidList = Object.keys(knownUids);
    let overlap = 0;
    for (const uid of uids) {
      if (knownUids[uid]) overlap += 1;
    }
    // SUA LOI: TRUOC DAY chi xet "qua ban" theo so uid cua TRAN NAY
    // (requiredForRow). Neu 1 doi lan DAU TIEN duoc ghi nhan lai la 1 tran
    // bi thieu du lieu (vd chi 1 uid do disconnect - xem isGarbageRankEntry),
    // thi doi do trong "totals" chi co 1 uid da biet. Khi 1 tran SAU day
    // du 4 uid xuat hien, overlap toi da chi la 1 (vi totals chi biet 1 uid)
    // trong khi requiredForRow (tinh tu 4 uid cua tran nay) = 3 -> 1 < 3 ->
    // KHONG duoc gop, bi tach thanh doi moi rieng du la cung 1 doi ngoai doi.
    // BAY GIO: cung xet "qua ban" theo huong NGUOC LAI - so uid da biet cua
    // doi trong totals (requiredForExisting) - neu overlap dat qua ban theo
    // BAT KY chieu nao (tran nay HOAC doi da luu) thi van gop, tranh phu
    // thuoc vao thu tu tran nao den truoc/sau.
    const requiredForExisting = Math.ceil(knownUidList.length / 2);
    const required = Math.min(requiredForRow, requiredForExisting);
    if (overlap > 0 && overlap >= required && overlap > bestOverlap) {
      bestOverlap = overlap;
      bestKey = key;
    }
  }

  return bestKey || row.teamKey;
}

/**
 * Cong don diem tu nhieu tran vao 1 bang tong (theo teamKey on dinh,
 * KHONG theo teamName vi ten hien thi co the doi giua cac tran).
 * existingTotals: object dang { teamKey: { teamName, totalPoints, kills, matches, booyahCount }, ... }
 */
/**
 * Chon UID lam "ten chinh" cho ca doi, dua tren so tran uid do da choi
 * (nameStats: { uid: { name, count } }) so voi tong so tran cua doi
 * (totalMatches). Uu tien uid CHOI DU TAT CA cac tran (count === totalMatches).
 * Neu co nhieu uid cung du tran, hoac KHONG co uid nao du tran, chon uid
 * co so tran cao nhat; neu vao tiep tuc bang nhau, giu thu tu xuat hien
 * truoc (Object.entries giu dung thu tu them vao).
 * Tra ve null neu khong co du lieu roster (fallback ve teamName cu).
 */
function pickMainTeamName(nameStats, totalMatches) {
  const entries = Object.values(nameStats || {});
  if (entries.length === 0) return null;

  const fullAttendance = entries.filter((e) => e.count === totalMatches);
  const pool = fullAttendance.length > 0 ? fullAttendance : entries;

  let best = pool[0];
  for (const e of pool) {
    if (e.count > best.count) best = e;
  }
  return best.name;
}

/**
 * Cong don diem tu nhieu tran vao 1 bang tong (theo teamKey on dinh,
 * KHONG theo teamName vi ten hien thi co the doi giua cac tran).
 * existingTotals: object dang { teamKey: { teamName, totalPoints, kills, matches, booyahCount, nameStats }, ... }
 */
/**
 * Tra ve { totals, resolvedKeys }:
 *  - totals: bang tong da gop (nhu truoc).
 *  - resolvedKeys: object { teamKeyGocCuaTranNay: teamKeyThucSuDungTrongTotals }.
 *    Vi voi co che gop theo da so uid, key thuc su dung de luu trong
 *    totals co the KHAC voi row.teamKey goc cua tran nay (vd tran nay
 *    thieu 1 uid so voi lan dau) -> cac noi khac (CPR championTeamKey,
 *    gameBooyahs) PHAI dung resolvedKeys[...] thay vi row.teamKey truc
 *    tiep, neu khong se bi "lac" khoi totals (xem scoreCommand.js).
 */
function mergeIntoLeaderboard(existingTotals, matchScored) {
  const totals = { ...existingTotals };
  const resolvedKeys = {};

  for (const row of matchScored) {
    const key = resolveMergeKey(totals, row);
    resolvedKeys[row.teamKey] = key;
    if (!totals[key]) {
      totals[key] = {
        teamName: row.teamName,
        totalPoints: 0,
        kills: 0,
        matches: 0,
        booyahCount: 0,
        nameStats: {},
        // Dem so lan tung TEN DOI THAT (row.teamName khi hasOfficialTeamName
        // = true) xuat hien qua cac tran, de chon ten pho bien nhat lam ten
        // hien thi chinh thuc - KHONG lien quan gi den ten tung thanh vien.
        officialNameStats: {},
      };
    }
    const teamTotal = totals[key];
    teamTotal.nameStats = teamTotal.nameStats || {};
    teamTotal.officialNameStats = teamTotal.officialNameStats || {};
    teamTotal.allUids = teamTotal.allUids || {};

    // Ghi nhan TOAN BO uid tung xuat hien trong doi nay (ke ca uid khong
    // co ten kem theo tu Garena) - dung RIENG de do logo !nhapid, tach biet
    // voi nameStats (chi dung de chon TEN hien thi cua doi). Chuan hoa
    // String().trim() dong bo voi logos.js.
    const allIdsThisRow = Array.isArray(row.allAccountIds) ? row.allAccountIds : [];
    for (const rawUid of allIdsThisRow) {
      const uid = String(rawUid).trim();
      if (!uid) continue;
      teamTotal.allUids[uid] = true;
    }

    // Dem so tran tung uid da xuat hien trong doi nay
    const roster = row.rosterNames || {};
    for (const [rawUid, name] of Object.entries(roster)) {
      const uid = String(rawUid).trim();
      if (!teamTotal.nameStats[uid]) {
        teamTotal.nameStats[uid] = { name, count: 0 };
      }
      teamTotal.nameStats[uid].name = name; // cap nhat ten moi nhat cua uid nay
      teamTotal.nameStats[uid].count += 1;
    }

    teamTotal.totalPoints += row.totalPoints;
    teamTotal.kills += row.kills;
    teamTotal.matches += 1;
    // Lay dung cho "booyah" ma Garena tra ve (row.booyah), KHONG tu suy ra
    // tu rank === 1 nua - vi rank va booyah co the lech nhau trong du lieu
    // goc (VD hoa hang, du lieu tra thieu...) -> tin dung nguon, khong tu tinh.
    if (row.booyah === true) {
      teamTotal.booyahCount += 1;
    }

    // SUA LOI HIEN THI TEN THANH VIEN THAY VI TEN DOI:
    // TRUOC DAY dong nay luon goi pickMainTeamName(teamTotal.nameStats,...)
    // - ma nameStats chi la uid -> TEN THANH VIEN (tu rosterNames), khong
    // phai ten doi - nen ket qua LUON la ten 1 nguoi choi (vd "16.johan@",
    // "_kutin.z") de len bang xep hang thay vi ten doi that Garena tra ve
    // (vd "NOBITA", "NE ESPORTS"), du Garena van co san ten doi.
    // BAY GIO: uu tien TUYET DOI ten doi THAT (row.teamName voi
    // hasOfficialTeamName = true) - dem so lan xuat hien cua tung ten doi
    // that qua cac tran, chon ten pho bien nhat. CHI khi KHONG CO tran nao
    // tung tra ve ten doi that (vd giai dau/du lieu cu khong co truong nay)
    // thi moi fallback ve ten thanh vien choi du tran (pickMainTeamName)
    // nhu logic cu, giu tuong thich nguoc.
    if (row.hasOfficialTeamName && row.teamName) {
      if (!teamTotal.officialNameStats[row.teamName]) {
        teamTotal.officialNameStats[row.teamName] = 0;
      }
      teamTotal.officialNameStats[row.teamName] += 1;
    }

    const officialNames = Object.entries(teamTotal.officialNameStats);
    if (officialNames.length > 0) {
      officialNames.sort((a, b) => b[1] - a[1]);
      teamTotal.teamName = officialNames[0][0];
    } else {
      const mainName = pickMainTeamName(teamTotal.nameStats, teamTotal.matches);
      teamTotal.teamName = mainName || row.teamName;
    }
  }

  return { totals, resolvedKeys };
}

// Tieu chi xep hang khi BANG diem tuyet doi (tranh tinh trang doi co top 1
// + nhieu kill hon van bi xep DUOI doi it kill/khong co booyah nao, chi vi
// Array.sort() giu nguyen thu tu cu trong object khi 2 phan tu bang nhau):
//   1. totalPoints cao hon truoc
//   2. Bang diem -> booyahCount (so lan top 1) cao hon xep truoc
//   3. Van bang -> kills cao hon xep truoc
//   4. Van bang tiep -> giu nguyen thu tu xuat hien (doi duoc cong diem/tao truoc)
function toRankedArray(totals) {
  return Object.entries(totals)
    .map(([teamKey, stat]) => ({ teamKey, ...stat }))
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if ((b.booyahCount || 0) !== (a.booyahCount || 0)) {
        return (b.booyahCount || 0) - (a.booyahCount || 0);
      }
      return (b.kills || 0) - (a.kills || 0);
    });
}

/**
 * ===== CHAMPION RUSH (CPR) =====
 * Xep hang co tinh den "Champion Rush": neu 1 doi da duoc xac dinh la
 * vo dich CPR (championTeamKey), doi do LUON dung dau bang xep hang,
 * BAT KE tong diem, cac doi con lai van xep phia duoi theo diem nhu binh
 * thuong (bat dau tu hang 2).
 *
 * Neu championTeamKey khong duoc truyen vao (hoac khong ton tai trong
 * totals), ham nay hoat dong y het toRankedArray thong thuong.
 */
function toRankedArrayWithChampion(totals, championTeamKey) {
  const ranked = toRankedArray(totals);

  if (!championTeamKey || !totals[championTeamKey]) {
    return ranked;
  }

  const championRow = ranked.find((row) => row.teamKey === championTeamKey);
  if (!championRow) return ranked;

  const rest = ranked.filter((row) => row.teamKey !== championTeamKey);
  return [{ ...championRow, isChampionRush: true }, ...rest];
}

/**
 * Kiem tra xem trong bang totals hien tai, co doi nao da dat/vuot nguong
 * diem de KICH HOAT Champion Rush cho tran tiep theo hay khong.
 * Tra ve teamKey cua doi dau tien dat nguong (theo thu tu duyet object),
 * hoac null neu chua co doi nao dat.
 */
function findChampionRushTrigger(totals, threshold) {
  if (!threshold || threshold <= 0) return null;
  for (const [teamKey, stat] of Object.entries(totals)) {
    if ((stat.totalPoints || 0) >= threshold) {
      return teamKey;
    }
  }
  return null;
}

function formatLeaderboardMessage(totals, title = "BANG XEP HANG", championTeamKey) {
  const rows = championTeamKey
    ? toRankedArrayWithChampion(totals, championTeamKey)
    : toRankedArray(totals);

  let msg = `🏆 ${title} 🏆\n`;
  msg += "----------------------------\n";
  rows.forEach((row, idx) => {
    const crown = row.isChampionRush ? " 👑 VÔ ĐỊCH (Champion Rush)" : "";
    msg += `${idx + 1}. ${row.teamName} — ${row.totalPoints} điểm (${row.kills} kill, ${row.matches} trận)${crown}\n`;
  });

  return msg;
}

module.exports = {
  calculateMatchScores,
  resolveMergeKey,
  mergeIntoLeaderboard,
  formatLeaderboardMessage,
  toRankedArray,
  toRankedArrayWithChampion,
  findChampionRushTrigger,
};
