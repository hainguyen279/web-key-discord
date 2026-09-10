const { AttachmentBuilder, EmbedBuilder } = require("discord.js");

const {
  fetchMatchResult,
  findMatchesByAccount,
  buildTeamKey,
  createLeague,
  saveMatchToLeague,
  calculateLeagueScore,
} = require("../lib/garena");
const {
  calculateMatchScores,
  mergeIntoLeaderboard,
  toRankedArray,
  toRankedArrayWithChampion,
  findChampionRushTrigger,
} = require("../lib/scoring");
const {
  loadTotals,
  saveTotals,
  loadSlotData,
  saveSlotData,
  getSession,
  defaultCprState,
  resetAllData,
} = require("../lib/storage");
const { generateLeaderboardImage, generateLogoTest } = require("../lib/leaderboardImage");
const {
  normalizeSlotLabel,
  getSessionKey,
  getDefaultDateKeyForSlot,
  listSlotsText,
  getSlotTimeRange,
  parseDateArg,
} = require("../lib/timeSlot");
const { resolveTemplateKey, listTemplatesText } = require("../lib/templates");
const { isScoreLocked, setScoreLocked, getLockedChannelCount } = require("../lib/threadLock");
const { saveLogoFromUrl, removeLogo } = require("../lib/logos");
const {
  setPendingLogoInput,
  getPendingLogoInput,
  clearPendingLogoInput,
} = require("../lib/pendingLogoInput");

// Gửi ảnh bảng xếp hạng trực tiếp bằng buffer (không cần ghi file tạm như
// bản Messenger, vì discord.js nhận thẳng Buffer qua AttachmentBuilder).
async function sendLeaderboardImage(
  channel,
  totals,
  captionText,
  templateKey,
  gameBooyahs,
  championTeamKey
) {
  const rankedTeams = championTeamKey
    ? toRankedArrayWithChampion(totals, championTeamKey)
    : toRankedArray(totals);
  const buffer = await generateLeaderboardImage(rankedTeams, templateKey, gameBooyahs);
  const attachment = new AttachmentBuilder(buffer, { name: "leaderboard.png" });
  await channel.send({ content: captionText || "", files: [attachment] });
}

// Chống xử lý chồng chéo: nếu 1 kênh đang có lệnh nặng (!td) chạy (đang gọi
// API từng trận), lệnh tiếp theo trong CÙNG kênh đó sẽ tự động XẾP HÀNG và
// tự chạy tiếp ngay khi đến lượt - KHÔNG cần người dùng tự gửi lại - trong
// khi vẫn đảm bảo chỉ 1 lệnh xử lý trên 1 kênh tại 1 thời điểm (tránh đọc/
// ghi đè session gây cộng trùng/tính sai điểm). Xem lib/channelQueue.js.
const { isChannelBusy, acquireChannelSlot, releaseChannelSlot } = require("../lib/channelQueue");

// Cac ten field CO THE co trong 1 phan tu aggregatedTeamRanks tra ve tu
// Garena (.../league/calculate-score) ung voi tung so lieu bot can. Vi
// JSON mau nhan duoc bi cat (chi chac chan co booyah, kill,
// numberOfPlayedMatch), liet ke nhieu ten khop de tang co hoi tim dung,
// nhung KHONG doan mo - neu khong tim thay field diem tong nao, ham goi
// se coi nhu that bai va bot tu dong fallback ve cach tinh cu (local merge).
const LEAGUE_SCORE_FIELD_CANDIDATES = ["score", "totalPoints", "totalScore", "point", "points"];

/**
 * Doi chieu 1 phan tu aggregatedTeamRanks (tra ve tu Garena, da gop san
 * theo doi - kem ca truong hop doi doi/sub nguoi giua cac tran) sang dung
 * dinh dang totals ma bot dang dung (teamName/totalPoints/kills/matches/
 * booyahCount). Tra ve null neu khong tim thay field diem tong nao khop -
 * de goi tu choi tin tuong hang nay thay vi ghi de bang so sai.
 */
function mapLeagueRowToTotalsPatch(row) {
  let totalPoints = null;
  for (const field of LEAGUE_SCORE_FIELD_CANDIDATES) {
    if (typeof row[field] === "number") {
      totalPoints = row[field];
      break;
    }
  }
  if (totalPoints === null) return null;

  return {
    totalPoints,
    kills: typeof row.kill === "number" ? row.kill : row.kills,
    matches: typeof row.numberOfPlayedMatch === "number" ? row.numberOfPlayedMatch : row.matches,
    booyahCount: typeof row.booyah === "number" ? row.booyah : row.booyahCount,
  };
}

/**
 * Goi Garena (create league neu chua co -> save-match cho tung tran moi
 * -> calculate-score) de lay bang tong DA GOP SAN theo doi, roi GHI DE
 * (khong thay the hoan toan) len recomputedTotals dang co - chi ghi de
 * cho nhung teamKey ma Garena tra ve du du lieu nhan dien duoc (xem
 * mapLeagueRowToTotalsPatch). teamKey duoc build giong het cach cả 2 phia
 * dang dung (buildTeamKey = sap xep + noi playerAccountIds), nen 1 doi o
 * local merge va 1 doi trong aggregatedTeamRanks se KHOP dung teamKey,
 * khong lam sai lech resolvedKeys/gameBooyahs/champion dang dung teamKey
 * do local merge tao ra.
 *
 * Neu buoc nao that bai (mat mang, cookie het han, field khong khop...)
 * thi CHI log canh bao va GIU NGUYEN recomputedTotals tu local merge -
 * khong bao gio lam hong hay chan lenh !td vi ly do nay.
 */
async function enrichTotalsFromLeague(config, session, slotLabel, orderedMatchIds, totals) {
  try {
    if (!session.leagueId) {
      session.leagueId = await createLeague(config, `Giải khung ${slotLabel}`);
    }
    if (!Array.isArray(session.leagueSavedMatchIds)) session.leagueSavedMatchIds = [];

    for (const matchId of orderedMatchIds) {
      if (!session.leagueSavedMatchIds.includes(matchId)) {
        await saveMatchToLeague(config, session.leagueId, matchId);
        session.leagueSavedMatchIds.push(matchId);
      }
    }

    const aggregatedTeamRanks = await calculateLeagueScore(config, session.leagueId, orderedMatchIds);

    let patchedCount = 0;
    for (const row of aggregatedTeamRanks) {
      const teamKey = buildTeamKey(row);
      if (!totals[teamKey]) continue; // doi la khong xuat hien o local merge -> bo qua, khong tu tao moi
      const patch = mapLeagueRowToTotalsPatch(row);
      if (!patch) {
        console.warn(
          `[garena-league] Không nhận diện được field điểm tổng trong aggregatedTeamRanks cho teamKey ${teamKey}, giữ số liệu tự gộp cục bộ.`
        );
        continue;
      }
      Object.assign(totals[teamKey], patch);
      patchedCount += 1;
    }
    return patchedCount > 0;
  } catch (err) {
    console.warn(
      "[garena-league] Không dùng được API tổng hợp Garena (create/save-match/calculate-score), giữ nguyên bảng tự gộp cục bộ:",
      err.message
    );
    return false;
  }
}

// CHỈ admin bot (config.json -> adminUserIDs, là Discord user ID) mới được
// lock/unlock - KHÔNG tính vai trò quản trị viên/role của server.
function isConfigAdmin(config, userId) {
  return Array.isArray(config.adminUserIDs) && config.adminUserIDs.includes(userId);
}

// Chi nhan UID la day so (uid Free Fire tren Garena luon la so)
function isValidUid(raw) {
  return /^\d{3,20}$/.test(String(raw || "").trim());
}

/**
 * Xu ly 1 tin nhan khi nguoi gui dang trong luong "!nhapid" (dang cho UID
 * hoac dang cho anh logo). Tra ve true neu tin nhan nay DA duoc xu ly boi
 * luong nay (khong can xu ly tiep nhu lenh binh thuong nua), false neu
 * khong lien quan (khong co pending, hoac nguoi dung go lenh khac de huy).
 */
async function handlePendingLogoInput(message, config) {
  const channelID = message.channel.id;
  const senderID = message.author.id;
  const prefix = config.prefix || "!";
  const pending = getPendingLogoInput(channelID, senderID);
  if (!pending) return false;

  const body = (message.content || "").trim();

  // Cho phep huy luong bang lenh !huy bat cu luc nao dang cho
  if (body.toLowerCase() === `${prefix}huy`) {
    clearPendingLogoInput(channelID, senderID);
    await message.reply("❎ Đã huỷ thao tác nhập logo.");
    return true;
  }

  if (pending.step === "awaiting_uid") {
    // Neu nguoi dung go 1 lenh khac (bat dau bang prefix) thay vi gui UID,
    // coi nhu ho bo qua/huy luong nay, huy pending va KHONG chan lenh moi.
    if (body.startsWith(prefix)) {
      clearPendingLogoInput(channelID, senderID);
      return false;
    }

    if (!isValidUid(body)) {
      await message.reply(
        `⚠️ UID không hợp lệ (chỉ gồm số). Gửi lại UID Free Fire, hoặc gõ \`${prefix}huy\` để huỷ.`
      );
      return true;
    }

    setPendingLogoInput(channelID, senderID, { step: "awaiting_logo", uid: body });
    await message.reply(
      `📌 Đã ghi nhận UID **${body}**. Giờ gửi (hoặc reply) 1 ẢNH làm logo cho UID này (trong vòng 5 phút), hoặc gõ \`${prefix}huy\` để huỷ.`
    );
    return true;
  }

  if (pending.step === "awaiting_logo") {
    const attachment = message.attachments.find(
      (a) => a.contentType && a.contentType.startsWith("image/")
    );

    if (!attachment) {
      // Neu la lenh khac thi coi nhu bo qua/huy luong
      if (body.startsWith(prefix)) {
        clearPendingLogoInput(channelID, senderID);
        return false;
      }
      await message.reply(
        `⚠️ Chưa thấy ảnh nào. Gửi 1 ảnh (png/jpg/webp) làm logo cho UID **${pending.uid}**, hoặc gõ \`${prefix}huy\` để huỷ.`
      );
      return true;
    }

    try {
      await saveLogoFromUrl(pending.uid, attachment.url, attachment.contentType);
      clearPendingLogoInput(channelID, senderID);
      await message.reply(
        `✅ Đã lưu logo cho UID **${pending.uid}**. Từ lần \`${prefix}td\` sau, hễ UID này thi đấu thì logo sẽ hiện bên trái tên đội.`
      );
    } catch (err) {
      console.error("⚠️ Lỗi lưu logo:", err);
      clearPendingLogoInput(channelID, senderID);
      await message.reply(`❌ Lỗi khi tải/lưu ảnh logo: ${err.message}. Gõ lại ${prefix}nhapid để thử lại.`);
    }
    return true;
  }

  return false;
}


// và lệnh khoá/mở tính năng này theo từng kênh (!lock diem / !unlock diem).
// message: đối tượng Message của discord.js. config: nội dung config.json.
async function handleScoreCommand(message, config) {
  const channelID = message.channel.id;
  const senderID = message.author.id;
  // Co danh dau "hien dang giu luot xu ly kenh nay hay khong" - dung de
  // catch an toan o cuoi ham (xem cuoi file) CHI release dung 1 lan, khong
  // lo tra nham luot cua nguoi khac neu ham thoat truoc khi kip acquire.
  let channelSlotHeld = false;
  const body = (message.content || "").trim();
  const prefix = config.prefix || "!";

  // ===== Luong nhap logo nhieu buoc (!nhapid): xu ly TRUOC khi kiem tra
  // prefix, vi tin nhan gui UID / gui anh logo khong bat dau bang "!" =====
  if (await handlePendingLogoInput(message, config)) return;

  if (!body.startsWith(prefix)) return;

  const parts = body.slice(prefix.length).trim().split(/\s+/);
  const command = (parts[0] || "").toLowerCase();
  const args = parts.slice(1);

  // ===== !kdl (Khởi Động Lại) =====
  // Xoá SẠCH toàn bộ dữ liệu (bảng điểm mùa giải, điểm từng khung giờ, logo
  // đã gắn, trạng thái khoá/mở kênh...) của TOÀN BỘ bot, đưa bot về trạng
  // thái y hệt lần đầu tiên chạy - dùng để "sửa" khi bot bị lỗi/tính sai mà
  // không rõ nguyên nhân. Đặt TRƯỚC bước kiểm tra khoá kênh (isScoreLocked)
  // và trước SCORE_COMMANDS, để lệnh này luôn dùng được kể cả khi kênh đang
  // bị khoá. KHÔNG giới hạn admin - AI trong kênh cũng gõ được, để xử lý
  // nhanh khi bot gặp sự cố giữa trận. Hành động này KHÔNG THỂ hoàn tác.
  if (command === "kdl") {
    try {
      resetAllData();
      // resetAllData() xoá luôn data/channelLocks.json, nên nếu không làm
      // gì thêm thì kênh này sẽ rơi về trạng thái KHOÁ mặc định (trừ khi
      // nằm trong config.channelIDs) -> phải nhờ admin !unlock diem mới
      // dùng lại được. Chủ động MỞ KHOÁ ngay kênh vừa gõ !kdl để dùng được
      // luôn, không cần chờ admin.
      setScoreLocked(channelID, false);
    } catch (err) {
      console.error("⚠️ Lỗi khi khởi động lại (kdl):", err);
      await message.reply(`❌ Lỗi khi khởi động lại: ${err.message}`);
      return;
    }

    await message.reply("🔄 **Đã Khởi Động Lại**");
    return;
  }

  // ===== !trangthai =====
  // Lệnh chẩn đoán nhanh: không bị ảnh hưởng bởi trạng thái khoá tính điểm.
  if (command === "trangthai") {
    try {
      const client = message.client;
      const mem = process.memoryUsage();
      const uptimeSeconds = Math.floor(process.uptime());
      const days = Math.floor(uptimeSeconds / 86400);
      const hours = Math.floor((uptimeSeconds % 86400) / 3600);
      const minutes = Math.floor((uptimeSeconds % 3600) / 60);
      const seconds = uptimeSeconds % 60;
      const uptimeText = `${days} ngày ${hours} giờ ${minutes} phút ${seconds} giây`;

      const dataDir = require("path").join(__dirname, "..", "data");
      const fs = require("fs");
      const dataExists = fs.existsSync(dataDir);
      const dataFiles = dataExists
        ? fs.readdirSync(dataDir).filter((name) => name.endsWith(".json"))
        : [];
      const scoreFiles = dataFiles.filter((name) => name.startsWith("scores_")).length;
      const slotFiles = dataFiles.filter((name) => name.startsWith("slotScores_")).length;

      const garena = config.garena || {};
      const garenaReady = Boolean(garena.cookie && garena.matchApiEndpoint && garena.findMatchApiEndpoint);
      const discordReady = Boolean(client && client.user && client.ws);
      const discordStatus = discordReady ? `ONLINE${client.ws.status !== 0 ? ` (WS ${client.ws.status})` : ""}` : "OFFLINE";
      const lockedCount = getLockedChannelCount();
      const currentLocked = isScoreLocked(channelID, config);
      const memoryText = `${Math.round(mem.rss / 1024 / 1024)} MB RSS / ${Math.round(mem.heapUsed / 1024 / 1024)} MB Heap`;

      const embed = new EmbedBuilder()
        .setTitle("🩺 TRẠNG THÁI BOT")
        .setColor(0x3498db)
        .setDescription(
          `🤖 **Discord:** ${discordStatus}\n` +
          `⏱️ **Uptime:** ${uptimeText}\n` +
          `🧠 **Bộ nhớ:** ${memoryText}\n` +
          `📡 **Garena/API:** ${garenaReady ? "✅ Đã cấu hình" : "❌ Thiếu cấu hình"}\n` +
          `💾 **Data:** ${dataExists ? `✅ OK (${dataFiles.length} file)` : "⚠️ Chưa có thư mục data"}\n` +
          `🏆 **File BXH:** ${scoreFiles} | **Khung giờ:** ${slotFiles}\n` +
          `🔒 **Kênh đang khoá điểm:** ${lockedCount}\n` +
          `📍 **Kênh hiện tại:** ${currentLocked ? "🔒 Đang khoá" : "🟢 Đang mở"}`
        )
        .setFooter({ text: `${config.botName || "FF Score Bot"} • ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}` });

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error("⚠️ Lỗi !trangthai:", err);
      await message.reply(`❌ Không thể lấy trạng thái bot: ${err.message}`);
    }
    return;
  }

  // ===== !lock diem / !unlock diem =====
  if (command === "lock" || command === "unlock") {
    const target = (args[0] || "").toLowerCase();
    if (target !== "diem") return;

    if (!isConfigAdmin(config, senderID)) {
      await message.reply(
        "⚠️ Chỉ admin bot (trong config.json -> adminUserIDs) mới được khoá/mở tính năng tính điểm."
      );
      return;
    }

    const shouldLock = command === "lock";
    setScoreLocked(channelID, shouldLock);
    await message.reply(
      shouldLock
        ? "🔒 Đã KHOÁ tính năng tính điểm Free Fire ở kênh này. Dùng !unlock diem để mở lại."
        : "🔓 Đã MỞ tính năng tính điểm Free Fire ở kênh này."
    );
    return;
  }

  const SCORE_COMMANDS = [
    "help", "huongdan",
    "diem", "leaderboard",
    "td",
    "testlogo",
    "nhapid",
    "xoalogo",
    "huy",
  ];
  if (!SCORE_COMMANDS.includes(command)) return;

  if (isScoreLocked(channelID, config)) {
    await message.reply(
      "⛔ Tính năng tính điểm Free Fire đang bị khoá ở kênh này. Nhờ admin bot gõ !unlock diem để mở lại."
    );
    return;
  }

  try {
    if (command === "help" || command === "huongdan") {
      const defaultCprThreshold =
        (config.scoring && config.scoring.championRushThreshold) || 50;
      const embed = new EmbedBuilder()
        .setTitle("📖 HƯỚNG DẪN FF SCORE")
        .setColor(0x2ecc71)
        .setDescription(
          `🏆 **${prefix}diem** → Xem BXH tổng\n\n` +
          `⏱️ **${prefix}td <uid> <khung>** → Tự tìm và tính toàn bộ trận trong khung\n` +
          `↳ Ví dụ: \`${prefix}td 8000487920 20h\`\n` +
          `↳ Khung đêm: chạy \`${prefix}td 8000487920 23h30\` từ **00h–06h** sẽ tự lấy **ngày hôm trước**, không cần nhập ngày.\n` +
          `🕐 Khung: **${listSlotsText()}**\n\n` +
          `🔥 **CPR** → mặc định mốc **${defaultCprThreshold} điểm**\n` +
          `↳ Đổi mốc riêng: \`${prefix}td cpr70 <uid> <khung>\` → phải đạt **70 điểm** mới kích hoạt.\n` +
          `↳ Ví dụ: \`${prefix}td cpr70 8000487920 23h30\`\n\n` +
          `❌ **Bỏ game lỗi:** \`${prefix}td <uid> <khung> bo2\` → bỏ Game 2\n` +
          `🖼️ **${prefix}nhapid <uid>** → Gắn logo đội\n` +
          `🗑️ **${prefix}xoalogo <uid>** → Xóa logo\n` +
          `🔒 **${prefix}lock diem** / **${prefix}unlock diem** → Admin khóa/mở tính điểm\n` +
          `🔄 **${prefix}kdl** → Khởi động lại và xóa dữ liệu\n` +
          `🩺 **${prefix}trangthai** → Kiểm tra trạng thái bot, API, dữ liệu và kênh đang khoá\n\n` +
          `💡 Lệnh đã bỏ: \`${prefix}bxh\`, \`${prefix}capnhat <matchId>\`, \`${prefix}bxhkhung\`, \`${prefix}chitiet\`, \`${prefix}reset\`, \`${prefix}reset khung\`, \`${prefix}luoitoado\``
        );
      await message.reply({ embeds: [embed] });
      return;
    }

    if (command === "diem" || command === "leaderboard") {
      const totals = loadTotals(channelID);
      if (Object.keys(totals).length === 0) {
        await message.reply(`Chưa có dữ liệu điểm nào. Dùng lệnh ${prefix}td để tính điểm trận theo khung giờ.`);
        return;
      }
      const templateKey = resolveTemplateKey(args[0]) || undefined;
      await sendLeaderboardImage(message.channel, totals, "🏆 BẢNG XẾP HẠNG 🏆", templateKey);
      return;
    }

    // ===== !nhapid [uid] =====
    // Buoc 1: !nhapid (khong kem uid) -> bot hoi UID.
    // Buoc 1b: !nhapid <uid> -> co san uid, bot hoi luon anh logo.
    // Sau khi co UID, nguoi dung gui (hoac reply) 1 anh -> bot luu lam logo.
    // Logo se tu dong hien ben trai ten doi tu lan !td sau, chi
    // can uid do co mat trong doi thi dau (khong can biet ten hien thi).
    if (command === "nhapid") {
      const uidArg = (args[0] || "").trim();

      if (uidArg) {
        if (!isValidUid(uidArg)) {
          await message.reply("⚠️ UID không hợp lệ (chỉ gồm số). Ví dụ: !nhapid 8000487920");
          return;
        }
        setPendingLogoInput(channelID, senderID, { step: "awaiting_logo", uid: uidArg });
        await message.reply(
          `📌 Đã ghi nhận UID **${uidArg}**. Giờ gửi (hoặc reply) 1 ẢNH làm logo cho UID này (trong vòng 5 phút), hoặc gõ \`${prefix}huy\` để huỷ.`
        );
        return;
      }

      setPendingLogoInput(channelID, senderID, { step: "awaiting_uid" });
      await message.reply(
        `📝 Gửi UID Free Fire bạn muốn gắn logo (chỉ gồm số, trong vòng 5 phút). Gõ \`${prefix}huy\` để huỷ bất cứ lúc nào.`
      );
      return;
    }

    // ===== !xoalogo <uid> =====
    if (command === "xoalogo") {
      const uidArg = (args[0] || "").trim();
      if (!isValidUid(uidArg)) {
        await message.reply(`Vui lòng nhập UID hợp lệ. Ví dụ: ${prefix}xoalogo 8000487920`);
        return;
      }
      const removed = removeLogo(uidArg);
      await message.reply(
        removed
          ? `🗑️ Đã xoá logo của UID **${uidArg}**.`
          : `UID **${uidArg}** chưa có logo nào để xoá.`
      );
      return;
    }

    // ===== !huy (khi khong co pending nao dang cho) =====
    if (command === "huy") {
      await message.reply("Không có thao tác nhập logo nào đang chờ để huỷ.");
      return;
    }

    // ===== !testlogo <tenhinh> =====
    // Lenh debug: gui lai anh nen co ve cac o vuong placeholder tai chinh xac
    // vi tri se hien thi logo (Row1-12, TOP, G1-G6). Dung de kiem tra xem
    // cac o logo co khop vung trong anh nen truoc khi dang ky logo that.
    // Khong doc/ghi du lieu diem, dung o kenh nao cung duoc.
    if (command === "testlogo") {
      const templateKey = resolveTemplateKey(args[0]);
      if (!templateKey) {
        await message.reply(
          `Vui lòng nhập tên hình. Ví dụ: ${prefix}testlogo jjk\n` +
            `Các hình có sẵn: ${listTemplatesText()}`
        );
        return;
      }
      try {
        const { buffer, chosenKey } = await generateLogoTest(templateKey);
        const { getLayout } = require("../lib/layouts");
        const testLayout = getLayout(chosenKey);
        const topLogoSize = testLayout.topPanel.logo?.size ?? 90;
        const gbLogoSize  = testLayout.gameBooyah.logoSize ?? 40;
        const attachment = new AttachmentBuilder(buffer, { name: `testlogo_${chosenKey}.png` });
        await message.reply({
          content:
            `🖼️ Ảnh test logo **${chosenKey}** — ô vuông đỏ = vị trí logo sẽ xuất hiện:\n` +
            `• **R1–R12** → logo nhỏ (28px) cạnh tên 12 đội trong bảng\n` +
            `• **TOP** → logo to (${topLogoSize}px) đội hạng 1 góc dưới trái\n` +
            `• **G1–G6** → logo nhỏ (${gbLogoSize}px) cột Game 1–6 bên phải\n\n` +
            `Nếu ô lệch → chỉnh trong \`lib/layouts.js\` → \`LAYOUT_OVERRIDES.${chosenKey}\``,
          files: [attachment],
        });
      } catch (err) {
        console.error("⚠️ Lỗi !testlogo:", err);
        await message.reply(
          `❌ Lỗi khi tạo ảnh test logo: ${err.message}\n` +
          `Kiểm tra lại file ảnh nền trong thư mục \`assets/\` và chạy lại \`npm install\`.`
        );
      }
      return;
    }

    // ===== Lệnh khung giờ: !td [cpr] <uid> <khungGiờ> [ngày] [tên hình] =====
    if (command === "td") {
      const cprToken = (args[0] || "").toLowerCase();
      const cprMatch = /^cpr(\d+)?$/i.exec(cprToken);
      const cprFlag = Boolean(cprMatch);
      const cprThresholdOverride = cprFlag && cprMatch[1] ? Number(cprMatch[1]) : null;
      const baseArgs = cprFlag ? args.slice(1) : args;

      if (cprThresholdOverride !== null && (!Number.isInteger(cprThresholdOverride) || cprThresholdOverride <= 0 || cprThresholdOverride > 9999)) {
        await message.reply(`⚠️ Mốc CPR không hợp lệ. Dùng dạng \`${prefix}td cpr70 <uid> <khung>\` với số điểm lớn hơn 0.`);
        return;
      }

      const uid = baseArgs[0];
      const slotRaw = baseArgs[1];
      const extraArgs = baseArgs.slice(2);

      if (!uid || !slotRaw) {
        await message.reply(
          `Cú pháp: ${prefix}td [cprNN] <uid> <khungGiờ> [ngày] [tên hình]\n` +
            `Ví dụ: ${prefix}td 8000487920 20h\n` +
            `Xem ngày khác: ${prefix}td 8000487920 20h 5/7/2026\n` +
            `Chọn hình riêng: ${prefix}td 8000487920 20h itachi\n` +
            `CPR mặc định: ${prefix}td cpr 8000487920 20h\n` +
            `CPR mốc riêng: ${prefix}td cpr70 8000487920 20h\n` +
            `Bỏ riêng 1 trận (vd trận 2 lỗi/out phòng, gõ trước hay sau khi cộng điểm đều được): ${prefix}td 8000487920 20h bo2 (bo1, bo2, bo3... đều dùng được, các trận khác vẫn giữ nguyên)\n` +
            `("uid" là accountId của 1 người chơi bất kỳ trong trận)\n` +
            `Các khung giờ hợp lệ: ${listSlotsText()}\n` +
            `Các hình có sẵn: ${listTemplatesText()}`
        );
        return;
      }

      const slotLabel = normalizeSlotLabel(slotRaw);
      if (!slotLabel) {
        await message.reply(`Khung giờ "${slotRaw}" không hợp lệ.\nCác khung giờ hợp lệ: ${listSlotsText()}`);
        return;
      }

      // Neu co token dang "boN" (vd bo1, bo2...) trong cac tham so con lai,
      // nghia la nguoi dung muon BO 1 TRAN da cong diem truoc do (khong
      // phai lay tran moi). Tach rieng token nay ra khoi extraArgs truoc
      // khi xu ly ngay/ten hinh nhu binh thuong.
      let removeMatchNumber = null;
      const extraArgsFiltered = [];
      for (const a of extraArgs) {
        const boMatch = /^bo(\d+)$/i.exec(a);
        if (boMatch && removeMatchNumber === null) {
          removeMatchNumber = parseInt(boMatch[1], 10);
          continue;
        }
        extraArgsFiltered.push(a);
      }

      let dateArg = null;
      let templateKey;
      for (const a of extraArgsFiltered) {
        const maybeTemplate = resolveTemplateKey(a);
        if (maybeTemplate) {
          templateKey = maybeTemplate;
          continue;
        }
        if (!dateArg) dateArg = a;
      }

      let dateKey = getDefaultDateKeyForSlot(slotLabel);
      if (dateArg) {
        const parsedDate = parseDateArg(dateArg);
        if (!parsedDate) {
          await message.reply(
            `Ngày "${dateArg}" không hợp lệ. Dùng dạng d/m/yyyy, ví dụ: 5/7/2026\n` +
              `Hoặc "${dateArg}" không phải tên hình hợp lệ. Các hình có sẵn: ${listTemplatesText()}`
          );
          return;
        }
        dateKey = parsedDate;
      }

      // ===== Nhanh "bo trận": !td <uid> <khungGiờ> boN [ngày] [tên hình] =====
      // Bo di 1 tran DA cong diem truoc do (theo thu tu da them, N bat dau
      // tu 1), roi tinh lai toan bo tu dau tu cac tran con lai - KHONG goi
      // lai API Garena.
      // handledInline = true khi nhanh nay da TU XU LY XONG va gui bang roi
      // (khong can chay tiep xuong doan fetch ben duoi). Truong hop "Game
      // do CHUA tung duoc fetch" thi KHONG dat co nay, de code roi xuong
      // doan fetch/gui bang phia duoi luon trong CUNG 1 lan goi lenh - TRUOC
      // DAY nhanh nay chi luu "ghi nho" roi bat nguoi dung phai go lai !td
      // (khong kem boN) de thuc su lay bang; BAY GIO bot tu dong fetch va
      // gui bang luon, khong bat cho lenh thu 2.
      let handledInline = false;
      if (removeMatchNumber !== null) {
        if (isChannelBusy(channelID)) {
          await message.reply("⏳ Kênh này đang xử lý lệnh trước đó, lệnh của bạn đã được xếp hàng và sẽ tự động chạy tiếp theo (không cần gửi lại)...");
        }
        await acquireChannelSlot(channelID);
        channelSlotHeld = true;

        try {
          const sessionKey = getSessionKey(slotLabel, dateKey);
          const slotData = loadSlotData(channelID);
          const session = getSession(slotData, sessionKey);
          session.matchIds = (session.matchIds || []).map(String);
          session.gameBooyahs = session.gameBooyahs || [];
          session.matchScores = Array.isArray(session.matchScores) ? session.matchScores : [];
          session.removedMatchIds = Array.isArray(session.removedMatchIds) ? session.removedMatchIds : [];
          session.excludedGameNumbers = Array.isArray(session.excludedGameNumbers)
            ? session.excludedGameNumbers
            : [];

          const matchIndex = removeMatchNumber - 1;

          // ===== Truong hop trận đó CHƯA được lấy/cộng điểm (chưa tìm thấy
          // trong khung, hoặc khung chưa có trận nào) - KHÔNG bắt buộc phải
          // !td cộng điểm trước rồi mới bỏ nữa. Chỉ ghi nhớ SỐ THỨ TỰ Game N
          // này lại, rồi RƠI THẲNG XUỐNG đoạn fetch/gửi bảng phía dưới trong
          // CÙNG lần gọi lệnh này (không đặt handledInline, không return),
          // để bot tự tìm trận + loại đúng Game N + gửi bảng luôn 1 lần. =====
          if (matchIndex < 0) {
            handledInline = true;
            await message.reply(`"bo${removeMatchNumber}" không hợp lệ (Game phải bắt đầu từ 1).`);
            return;
          }

          if (matchIndex >= session.matchIds.length) {
            if (!session.excludedGameNumbers.includes(removeMatchNumber)) {
              session.excludedGameNumbers.push(removeMatchNumber);
            }
            slotData[sessionKey] = session;
            saveSlotData(channelID, slotData);
            // KHONG set handledInline, KHONG return o day nua - de code roi
            // xuong doan fetch ben duoi (sau finally nay) xu ly luon.
          } else {

          if (session.matchScores.length !== session.matchIds.length) {
            handledInline = true;
            await message.reply(
              `⚠️ Khung ${slotLabel} (${dateKey}) có dữ liệu cũ (tạo trước khi có tính năng bỏ trận) nên bot không xác định được chính xác từng trận để bỏ.\n` +
                `Dùng \`${prefix}reset khung ${slotLabel} ${dateKey}\` rồi chạy lại \`${prefix}td ${uid} ${slotLabel}\` để tính lại từ đầu, sau đó mới dùng được "boN".`
            );
            return;
          }

          // Truong hop trận đã được cộng điểm rồi -> bỏ ngay lập tức như cũ.
          // Ghi nho lai matchId vua bi bo, de lan sau chay "!td" (khong kem
          // boN) bot KHONG tu dong tim/cong lai chinh tran nay tu API Garena
          // (API van tra ve tran do vi no van nam trong khung gio, du da bi
          // nguoi dung chu dong bo - vd tran loi/out phong giua chung).
          const removedMatchId = session.matchIds[matchIndex];
          if (removedMatchId && !session.removedMatchIds.includes(removedMatchId)) {
            session.removedMatchIds.push(removedMatchId);
          }
          if (!session.excludedGameNumbers.includes(removeMatchNumber)) {
            session.excludedGameNumbers.push(removeMatchNumber);
          }

          session.matchIds.splice(matchIndex, 1);
          session.matchScores.splice(matchIndex, 1);

          // Tinh lai toan bo diem tu dau, dua tren cac tran CON LAI. Dung
          // luon dip nay dung lai gameBooyahs voi teamKey DA GOP cua tung
          // tran (thay vi chi splice() nhu truoc), vi sau khi bo 1 tran,
          // thu tu gop co the khien 1 vai doi duoc gop ve key khac truoc.
          let recomputedTotals = {};
          const recomputedGameBooyahs = [];
          for (const scoredMatch of session.matchScores) {
            const { totals: merged, resolvedKeys } = mergeIntoLeaderboard(recomputedTotals, scoredMatch);
            recomputedTotals = merged;
            // Dung cờ booyah THẬT (r.booyah) tu Garena, khong tu suy tu rank===1.
            const winnerRow = scoredMatch.find((r) => r.booyah === true);
            // Lay teamName tu BANG TONG DA GOP (merged[key].teamName), KHONG
            // dung winnerRow.teamName (ten rieng cua dung tran nay) - vi neu
            // nguoi choi doi nickname giua cac tran, ten rieng tung tran co
            // the khac ten chinh thuc da chon cho ca doi (pickMainTeamName)
            // -> ten o o "Game X" bi lech voi ten tren bang xep hang du cung
            // 1 doi (cung teamKey da gop). Dung ten tu merged de LUON khop.
            const winnerKey = winnerRow ? (resolvedKeys[winnerRow.teamKey] || winnerRow.teamKey) : null;
            recomputedGameBooyahs.push(
              winnerRow
                ? { teamKey: winnerKey, teamName: merged[winnerKey]?.teamName || winnerRow.teamName }
                : null
            );
          }
          session.totals = recomputedTotals;
          session.gameBooyahs = recomputedGameBooyahs;

          // Bo 1 tran lam thay doi thu tu/tinh trang cac tran -> trang thai
          // Champion Rush (neu co) khong con dang tin cay, reset ve mac dinh.
          const hadCpr = Boolean(session.cpr && (session.cpr.championTeamKey || session.cpr.pendingActivation));
          session.cpr = defaultCprState();

          slotData[sessionKey] = session;
          saveSlotData(channelID, slotData);

          const cprResetNote = hadCpr
            ? `\nℹ️ Trạng thái Champion Rush của khung này đã được đặt lại do vừa bỏ 1 trận. Gõ "${prefix}td cpr ${uid} ${slotLabel} ${dateKey}" nếu cần tính lại Champion Rush.`
            : "";

          await sendLeaderboardImage(
            message.channel,
            session.totals,
            `❌ Đã bỏ Game ${removeMatchNumber} khỏi khung ${slotLabel} (${dateKey}). Đã tính lại điểm với ${session.matchIds.length} trận còn lại.${cprResetNote}`,
            templateKey,
            session.gameBooyahs,
            null
          );
          handledInline = true;
          }
        } finally {
          releaseChannelSlot(channelID);
          channelSlotHeld = false;
        }
        if (handledInline) return;
        // Khong handledInline -> Game N chua tung duoc fetch, roi thang
        // xuong doan tim tran/gui bang phia duoi, dung uid/slotLabel/dateKey
        // hien tai, giong het nhu goi "!td" thuong (khong kem boN) - nhung
        // gio da co excludedGameNumbers moi vua luu nen Game N se tu dong
        // bi loai khoi bang ngay lan nay, khong can go lenh lan 2.
      }

      const { startTime, endTime } = getSlotTimeRange(slotLabel, dateKey);

      if (isChannelBusy(channelID)) {
        await message.reply("⏳ Kênh này đang xử lý lệnh trước đó, lệnh của bạn đã được xếp hàng và sẽ tự động chạy tiếp theo (không cần gửi lại)...");
      }
      await acquireChannelSlot(channelID);
      channelSlotHeld = true;

      try {
        await message.reply(
          `Đang tìm các trận của uid ${uid} trong khung ${slotLabel} (${dateKey})...`
        );

        const foundMatches = await findMatchesByAccount(config, uid, startTime, endTime);

        if (foundMatches.length === 0) {
          await message.reply(`Không tìm thấy trận nào của uid ${uid} trong khung ${slotLabel} (${dateKey}).`);
          return;
        }

        // Sap xep TOAN BO tran tim duoc theo thoi gian truoc, de xac dinh
        // dung "Game N" (vi tri thu N theo thoi gian thuc te trong khung)
        // cho tung tran - dung de doi chieu voi excludedGameNumbers (cac
        // Game da bi nguoi dung "boN" truoc TU LUC CHUA CO DU LIEU), du
        // trận đó co the chua tung duoc lay/cong diem lan nao.
        const sortedFoundMatches = foundMatches.slice().sort((a, b) => a.startTime - b.startTime);
        const gameNumberByMatchId = new Map();
        sortedFoundMatches.forEach((m, idx) => {
          gameNumberByMatchId.set(String(m.id), idx + 1);
        });

        // Gioi han so LAN GOI API MOI (fetchMatchResult) trong 1 lan chay
        // lenh, tranh spam Garena khi co qua nhieu tran chua tung fetch.
        // Cac tran DA fetch tu truoc (dang cache trong session.matchScores)
        // khong tinh vao gioi han nay va van duoc giu lai dung vi tri thoi
        // gian, de dam bao thu tu tinh diem luon dung.
        const MAX_MATCHES_PER_CALL = 20;

        const sessionKey = getSessionKey(slotLabel, dateKey);
        const slotData = loadSlotData(channelID);
        const session = getSession(slotData, sessionKey);
        session.matchIds = (session.matchIds || []).map(String);
        session.gameBooyahs = session.gameBooyahs || [];
        session.matchScores = Array.isArray(session.matchScores) ? session.matchScores : [];
        session.removedMatchIds = Array.isArray(session.removedMatchIds) ? session.removedMatchIds : [];
        session.excludedGameNumbers = Array.isArray(session.excludedGameNumbers)
          ? session.excludedGameNumbers
          : [];
        session.cpr = { ...defaultCprState(), ...(session.cpr || {}) };
        const configuredCprThreshold = (config.scoring && config.scoring.championRushThreshold) || 50;
        const cprThreshold = cprFlag
          ? (cprThresholdOverride !== null ? cprThresholdOverride : configuredCprThreshold)
          : (session.cpr.activationThreshold || configuredCprThreshold);
        if (cprFlag) {
          session.cpr.activationThreshold = cprThreshold;
        }

        // ===== SỬA LỖI "chạy lâu thì tính sai" =====
        // TRƯỚC ĐÂY: bot chỉ lấy các trận MỚI (chưa có trong session.matchIds)
        // rồi NỐI THÊM vào cuối session.totals đã lưu. Vấn đề: API find-match
        // của Garena đôi khi trả trận CHẬM hơn trận diễn ra sau nó vài phút.
        // Nếu !td được gọi nhiều lần rải rác qua nhiều giờ, có thể trận 4 đã
        // được cộng vào TRƯỚC trận 3 (do lúc đó trận 3 chưa kịp lên API) ->
        // cộng SAI thứ tự thời gian thật -> resolveMergeKey (gộp đội theo uid
        // trùng nhau) bị lệch, tách nhầm 1 đội thành 2 dòng trong bảng.
        // BÂY GIỜ: giống hệt cách trang web tính (luôn tính lại từ đầu, theo
        // ĐÚNG thứ tự sortedFoundMatches) - chỉ gọi lại API Garena cho trận
        // THỰC SỰ chưa có dữ liệu (dùng cache từ session.matchScores cho các
        // trận đã fetch trước đó), rồi build lại matchIds/matchScores THEO
        // ĐÚNG THỨ TỰ THỜI GIAN, và tính lại totals/gameBooyahs từ con số 0.
        const cachedScoredById = new Map();
        session.matchIds.forEach((id, idx) => {
          cachedScoredById.set(id, session.matchScores[idx]);
        });

        let addedCount = 0;
        let skippedRemovedCount = 0;
        let skippedExcludedCount = 0;
        let skippedLimitCount = 0;
        let liveUnfinishedCount = 0;
        let newFetchesThisCall = 0;
        const newlyFetchedIds = new Set();

        const orderedMatchIds = [];
        const orderedMatchScores = [];
        // Tran dang dien ra (chua Booyah): tinh TAM de hien thi ngay lan
        // goi nay, nhung KHONG dua vao orderedMatchIds/orderedMatchScores
        // (nen KHONG duoc luu vao session/cache) - lan goi lenh ke tiep se
        // tu dong fetch lai tran nay, cap nhat lien tuc cho den khi thuc
        // su ket thuc (co Booyah) thi moi duoc chot diem va luu cache.
        const liveMatchIds = [];
        const liveMatchScores = [];

        for (const m of sortedFoundMatches) {
          const matchIdStr = String(m.id);
          const gameNumber = gameNumberByMatchId.get(matchIdStr);

          // Tran nay da bi nguoi dung chu dong "boN" bo di truoc do trong
          // khung nay -> KHONG tu dong cong lai, du API Garena van tra ve no.
          if (session.removedMatchIds.includes(matchIdStr)) {
            skippedRemovedCount += 1;
            continue;
          }
          // Tran nay roi dung vao dung "Game N" da bi nguoi dung danh dau
          // "boN" TU TRUOC (tu luc chua co du lieu) -> bo qua, khong cong
          // diem, va nho luon theo matchId de lan sau van bo qua dung tran
          // nay ke ca khi thu tu/vi tri co the thay doi.
          if (gameNumber && session.excludedGameNumbers.includes(gameNumber)) {
            skippedExcludedCount += 1;
            if (!session.removedMatchIds.includes(matchIdStr)) {
              session.removedMatchIds.push(matchIdStr);
            }
            continue;
          }

          let scored = cachedScoredById.get(matchIdStr);
          if (!scored) {
            // Chi gioi han so LAN GOI API MOI trong 1 lan chay lenh (tranh
            // spam Garena) - cac tran da fetch tu truoc luon duoc dung lai
            // tu cache, khong tinh vao gioi han nay.
            if (newFetchesThisCall >= MAX_MATCHES_PER_CALL) {
              skippedLimitCount += 1;
              continue;
            }
            const matchResults = await fetchMatchResult(config, m.id);
            scored = calculateMatchScores(matchResults, config.scoring);
            newFetchesThisCall += 1;

            if (matchResults.isProvisional) {
              // Tran con dang dien ra (chua co doi Booyah): KHONG cache,
              // KHONG cong vao addedCount chinh thuc - chi dua vao bang
              // hien thi TAM cho lan goi lenh nay. Lan goi ke tiep se tu
              // dong fetch lai, cap nhat lien tuc cho den khi thuc su xong.
              liveUnfinishedCount += 1;
              liveMatchIds.push(matchIdStr);
              liveMatchScores.push(scored);
              continue;
            }

            newlyFetchedIds.add(matchIdStr);
            addedCount += 1;
          }

          orderedMatchIds.push(matchIdStr);
          orderedMatchScores.push(scored);
        }

        session.matchIds = orderedMatchIds;
        session.matchScores = orderedMatchScores;

        // Tinh lai TOAN BO totals + gameBooyahs tu dau, dung THEO DUNG thu tu
        // thoi gian thuc te (sortedFoundMatches) - giong het cach lenh "boN"
        // va trang web dang lam, dam bao ket qua luon nhat quan du !td duoc
        // goi rai rac bao nhieu lan qua bao nhieu gio di nua.
        let recomputedTotals = {};
        const recomputedGameBooyahs = [];
        let championJustDecided = false;
        session.matchScores.forEach((scoredMatch, idx) => {
          const matchIdStr = session.matchIds[idx];
          const { totals: merged, resolvedKeys } = mergeIntoLeaderboard(recomputedTotals, scoredMatch);
          recomputedTotals = merged;
          // Dung cờ booyah THẬT (r.booyah) tu Garena, khong tu suy tu rank===1
          // - tin tuong du lieu nguon, khong tu tinh lai.
          const winnerRow = scoredMatch.find((r) => r.booyah === true);
          const winnerKey = winnerRow ? (resolvedKeys[winnerRow.teamKey] || winnerRow.teamKey) : null;
          // Lay teamName tu BANG TONG DA GOP (merged[key].teamName) thay vi
          // winnerRow.teamName (ten rieng cua dung tran nay) - dam bao ten
          // hien o o "Game X" LUON khop voi ten tren bang xep hang (cung
          // 1 doi = cung 1 ten, khong bi lech du doi nickname giua cac tran).
          const winnerDisplayName = winnerKey ? (merged[winnerKey]?.teamName || winnerRow.teamName) : null;
          recomputedGameBooyahs.push(
            winnerRow ? { teamKey: winnerKey, teamName: winnerDisplayName } : null
          );

          // Champion Rush: chi xu ly kich hoat/xac dinh vo dich khi day la
          // tran THUC SU MOI duoc fetch trong lan chay lenh nay (giu nguyen
          // hanh vi cu - khong "hoi to" lai cac quyet dinh CPR cua nhung lan
          // chay truoc, vi championTeamKey mot khi da chot la VINH VIEN).
          if (cprFlag && newlyFetchedIds.has(matchIdStr)) {
            if (!session.cpr.championTeamKey && session.cpr.pendingActivation && winnerRow) {
              session.cpr.championTeamKey = winnerKey;
              session.cpr.championTeamName = winnerDisplayName;
              session.cpr.pendingActivation = false;
              championJustDecided = true;
            }
            if (!session.cpr.championTeamKey) {
              const triggerKey = findChampionRushTrigger(recomputedTotals, cprThreshold);
              if (triggerKey) {
                session.cpr.pendingActivation = true;
              }
            }
          }
        });
        session.totals = recomputedTotals;
        session.gameBooyahs = recomputedGameBooyahs;

        // ĐÃ TẮT: enrichTotalsFromLeague ghi đè totalPoints/booyahCount bằng
        // dữ liệu từ API "league/calculate-score" của Garena, nhưng tên field
        // điểm/booyah trong đó là ĐOÁN (xem comment gốc ở mapLeagueRowToTotalsPatch),
        // chưa từng được xác nhận đúng nghĩa 100%. Đây chính là nguyên nhân
        // BOOYAH và ĐIỂM bị sai trên bảng xếp hạng (ghi đè số ĐÚNG đã tính
        // theo từng trận bằng số SAI đoán được từ endpoint khác).
        // Bang totals tu gop cuc bo (session.totals) da du chinh xac: moi
        // tran deu dung scoreFromSource + co booyah THAT lay tu API match
        // rieng le cua Garena (dang tin cay, khong doan field) - khong can
        // "doi chieu" them qua endpoint league nay nua.
        // await enrichTotalsFromLeague(config, session, slotLabel, orderedMatchIds, session.totals);

        slotData[sessionKey] = session;
        saveSlotData(channelID, slotData);

        // ===== Cộng TẠM các trận đang diễn ra vào bảng SẼ GỬI lần này =====
        // Chỉ dùng để hiển thị ngay - KHÔNG ghi vào session.totals (đã lưu
        // ở trên rồi, chỉ gồm trận đã xong) nên không ảnh hưởng đến cache/
        // các lần tính điểm sau. Trận đang diễn ra sẽ tự fetch lại mỗi lần
        // gõ lệnh cho đến khi thật sự có Booyah.
        // Deep-clone truoc khi merge tam: mergeIntoLeaderboard SUA TRUC TIEP
        // (mutate) tung object doi ben trong thay vi tao object moi, nen neu
        // dung chung reference voi session.totals (da luu file o tren) thi
        // diem cua tran dang dien ra se bi "ghi de" nham vao ca du lieu da
        // luu vinh vien. Clone rieng de an toan tuyet doi.
        let displayTotals = JSON.parse(JSON.stringify(session.totals));
        const displayGameBooyahs = session.gameBooyahs.slice();
        liveMatchIds.forEach((matchIdStr, idx) => {
          const scoredMatch = liveMatchScores[idx];
          const { totals: merged } = mergeIntoLeaderboard(displayTotals, scoredMatch);
          displayTotals = merged;
          displayGameBooyahs.push(null); // trận chưa có Booyah, chưa xác định đội thắng
        });

        const championTeamKey = cprFlag ? session.cpr.championTeamKey : null;

        let cprNote = "";
        if (cprFlag) {
          if (championTeamKey) {
            cprNote = championJustDecided
              ? `\n👑 CHAMPION RUSH: "${session.cpr.championTeamName}" đã thắng trận Top 1 và chính thức VÔ ĐỊCH - luôn đứng đầu BXH!`
              : `\n👑 Champion Rush: "${session.cpr.championTeamName}" đang giữ ngôi VÔ ĐỊCH.`;
          } else if (session.cpr.pendingActivation) {
            cprNote = `\n🔥 CHAMPION RUSH đã kích hoạt ở mốc **${cprThreshold} điểm**! Trận kế tiếp, đội Top 1 (Booyah) sẽ VÔ ĐỊCH luôn.`;
          }
        } else if (session.cpr.championTeamKey) {
          cprNote = `\nℹ️ Lưu ý: khung này có nhà vô địch Champion Rush ("${session.cpr.championTeamName}") nhưng lần này bạn chưa gõ "cpr" nên bảng điểm hiển thị theo điểm số bình thường. Gõ "!td cpr ..." để hiển thị lại đúng nhà vô địch.`;
        }

        const removedNote =
          skippedRemovedCount > 0
            ? `\n(Bỏ qua ${skippedRemovedCount} trận đã bị "bo" thủ công trước đó, không tự động cộng lại)`
            : "";
        const excludedNote =
          skippedExcludedCount > 0
            ? `\n(Bỏ qua ${skippedExcludedCount} trận đúng theo Game đã đánh dấu "boN" từ trước, không cộng điểm)`
            : "";
        const limitNote =
          skippedLimitCount > 0
            ? `\n(Còn ${skippedLimitCount} trận mới chưa lấy kịp do giới hạn ${MAX_MATCHES_PER_CALL} trận/lần, chạy lại lệnh để lấy tiếp phần còn thiếu)`
            : "";
        const liveNote =
          liveUnfinishedCount > 0
            ? `\n⏳ Có ${liveUnfinishedCount} trận đang DIỄN RA (chưa có đội Booyah) - điểm các trận này đã được cộng TẠM vào bảng dưới đây để cập nhật liên tục, sẽ tự điều chỉnh lại khi trận thực sự kết thúc.`
            : "";

        const caption =
          `Tính Điểm Khung Giờ : ${slotLabel} (${dateKey})\nShark 🦈DV : TD&CP GIÁ RẺ !` +
          removedNote +
          excludedNote +
          limitNote +
          liveNote +
          cprNote;

        await sendLeaderboardImage(
          message.channel,
          displayTotals,
          caption,
          templateKey,
          displayGameBooyahs,
          championTeamKey
        );
      } finally {
        releaseChannelSlot(channelID);
        channelSlotHeld = false;
      }
      return;
    }

  } catch (e) {
    console.error("⚠️ Lỗi hệ thống khi xử lý lệnh tính điểm:", e);
    // An toan: chi tra luot neu THAT SU dang giu luot (tranh tra nham
    // luot cua 1 lenh khac trong truong hop loi xay ra truoc khi kip
    // acquireChannelSlot, hoac loi xay ra sau khi da tu release roi).
    if (channelSlotHeld) {
      releaseChannelSlot(channelID);
      channelSlotHeld = false;
    }

    // Loi rieng: cookie/session Garena het han (danh dau isGarenaAuthExpired
    // = true tu lib/garena.js khi Garena tra ve 401/403). Nguoi choi thuong
    // khong can biet chi tiet ky thuat -> bao "dang bao tri" + tag admin bot
    // (config.adminUserIDs) de ho biet ma vao thay cookie moi.
    if (e && e.isGarenaAuthExpired) {
      const adminIds = Array.isArray(config.adminUserIDs) ? config.adminUserIDs : [];
      const adminMentions = adminIds.map((id) => `<@${id}>`).join(" ");
      await message
        .reply(
          `🛠️ Bot đang bảo trì, vui lòng chờ ADMIN fix xong.` +
            (adminMentions ? ` ${adminMentions}` : "")
        )
        .catch(() => {});
      return;
    }

    await message.reply(`⚠️ Có lỗi xảy ra: ${e.message || e}`).catch(() => {});
  }
}

module.exports = { handleScoreCommand };
