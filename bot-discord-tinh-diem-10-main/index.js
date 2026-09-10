require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, Partials, Events, Collection } = require("discord.js");
const config = require("./config.json");

// Thong bao dung chung khi nguoi dung CHUA kich hoat/da het han - dung o
// ca lenh prefix (!td...) lan lenh slash (/taolineup...).
const NOT_ACTIVATED_MESSAGE =
  "Vui Lòng Dành Ra 30s Vào Web Lấy Key Để Kích Hoạt : https://web-key-discord-1.onrender.com";
const { handleScoreCommand } = require("./commands/scoreCommand");
const { handleKeyCommand, isUserUnlocked, tryAutoActivateFromMessage } = require("./commands/keyCommand");
const { createKey } = require("./lib/keyStore");
const { cleanupOldSlotSessionsAllThreads } = require("./lib/storage");
const { getTodayKeyVN } = require("./lib/timeSlot");

// --- DON RAC TU DONG HANG NGAY (mac dinh 06:00 gio VN) ---
// Chi xoa cac PHIEN KHUNG GIO (slotScores_*.json) da qua "maxAgeDays" ngay,
// KHONG dung toi bang diem mua giai (scores_*.json). Xem lib/storage.js ->
// cleanupOldSlotSessionsAllThreads de biet chi tiet ly do chi xoa slotScores.
function runCleanupNow() {
  try {
    const { scannedThreads, removedSessions } = cleanupOldSlotSessionsAllThreads(
      cleanupCfg.maxAgeDays,
      getTodayKeyVN()
    );
    console.log(
      `🧹 [Dọn rác] Đã quét ${scannedThreads} kênh, xoá ${removedSessions} phiên khung giờ cũ hơn ${cleanupCfg.maxAgeDays} ngày.`
    );
  } catch (err) {
    console.error("⚠️ [Dọn rác] Lỗi khi dọn dữ liệu cũ:", err);
  }
}

// Tinh so ms con lai den moc "runAtHourVN:00" (gio VN, UTC+7) GAN NHAT
// trong tuong lai, dung setTimeout thay vi cron de khong can them thu vien.
function msUntilNextRunVN(runAtHourVN) {
  const nowVNms = Date.now() + 7 * 60 * 60 * 1000; // quy doi ve "gio VN" nhung van la timestamp UTC de tinh toan
  const nowVN = new Date(nowVNms);
  const target = new Date(
    Date.UTC(
      nowVN.getUTCFullYear(),
      nowVN.getUTCMonth(),
      nowVN.getUTCDate(),
      runAtHourVN,
      0,
      0
    )
  );
  if (target.getTime() <= nowVNms) {
    target.setUTCDate(target.getUTCDate() + 1); // da qua gio nay hom nay -> hen ngay mai
  }
  return target.getTime() - nowVNms;
}

const cleanupCfg = Object.assign(
  { enabled: true, runAtHourVN: 6, maxAgeDays: 30 },
  config.cleanup || {}
);

if (cleanupCfg.enabled) {
  const delay = msUntilNextRunVN(cleanupCfg.runAtHourVN);
  console.log(
    `🧹 [Dọn rác] Đã lên lịch: chạy lần đầu sau ${Math.round(delay / 60000)} phút, ` +
    `sau đó lặp lại mỗi ngày lúc ${cleanupCfg.runAtHourVN}h00 (giờ VN).`
  );
  setTimeout(() => {
    runCleanupNow();
    setInterval(runCleanupNow, 24 * 60 * 60 * 1000); // lap lai moi 24h ke tu lan chay dau
  }, delay);
} else {
  console.log("🧹 [Dọn rác] Đang TẮT (config.cleanup.enabled = false).");
}

// --- KHỞI TẠO MÁY CHỦ HTTP & CƠ CHẾ CHỐNG NGỦ (SELF-PING) CO RENDER ---
const express = require("express");
const axios = require("axios"); // Thư viện axios có sẵn trong dự án của bạn
const app = express();
const port = process.env.PORT || 10000;

// ===== PHUC VU GIAO DIEN WEB TAO KEY (shark-key-portal) TREN CUNG DOMAIN =====
// Dat truoc cac route khac: express.static se tu tra ve public/index.html
// khi vao "/" - khong can host web o 1 dia chi rieng nua, tranh nham lan
// URL bot vs URL web (nguyen nhan gay loi vong lap vuot Ouo truoc do).
// VI web va API GIO CUNG CHUNG 1 DOMAIN, web co the goi API bang duong
// dan tuong doi ('/api/generate-key') MA KHONG CAN CORS/API_BASE_URL nua.
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.send("Bot Discord đang hoạt động ổn định!");
});

// ===== CHO PHEP TRANG WEB (khac domain) GOI API =====
// Khong co dong nay, trinh duyet se CHAN request tu shark-key-portal
// (domain khac voi bot) do chinh sach CORS mac dinh cua trinh duyet.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ===== API TAO KEY CHO TRANG WEB (shark-key-portal) =====
// Trang web goi endpoint nay SAU KHI nguoi dung da vuot Ouo xong, thay vi
// tu random key trong trinh duyet nhu ban cu - dam bao key duoc SINH RA
// va LUU LAI ngay tren bot, nen lenh "!key <key>" trong Discord luon xac
// minh duoc dung key ma web da cap.
// Bao ve bang API_SECRET (dat trong .env) de tranh nguoi la spam tao key
// vo han qua API - web PHAI gui dung header "x-api-key" khop voi secret nay.
app.use(express.json());
app.post("/api/generate-key", (req, res) => {
  const apiSecret = process.env.KEY_API_SECRET;
  if (apiSecret) {
    const provided = req.headers["x-api-key"];
    if (provided !== apiSecret) {
      return res.status(401).json({ error: "Sai hoặc thiếu x-api-key." });
    }
  } else {
    console.warn(
      "⚠️ Thiếu KEY_API_SECRET trong .env - endpoint /api/generate-key ĐANG MỞ CÔNG KHAI, " +
      "ai cũng tạo key được. Nên đặt KEY_API_SECRET để bảo vệ."
    );
  }

  try {
    const amount = req.body && req.body.amount;
    const unit = (req.body && req.body.unit) || "ngay";
    const record = createKey({
      amount: amount || 30,
      unit,
      source: "web",
    });
    res.json({ key: record.key, amount: record.amount, unit: record.unit });
  } catch (err) {
    console.error("⚠️ [API] Lỗi khi tạo key qua web:", err);
    res.status(500).json({ error: "Không tạo được key, thử lại sau." });
  }
});

app.listen(port, () => {
  console.log(`🌐 Server HTTP kiểm tra trạng thái đang chạy tại cổng: ${port}`);
  
  // Tự động ping chính nó mỗi 10 phút để giữ bot luôn sống (Anti-sleep)
  const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
  if (RENDER_EXTERNAL_URL) {
    setInterval(async () => {
      try {
        await axios.get(RENDER_EXTERNAL_URL);
        console.log("⏰ [Self-Ping] Đã ping giữ cho bot luôn thức!");
      } catch (err) {
        console.error("⚠️ [Self-Ping] Lỗi khi tự động ping:", err.message);
      }
    }, 10 * 60 * 1000); // 10 phút = 600,000ms
  } else {
    console.warn("⚠️ Thiếu biến RENDER_EXTERNAL_URL (Bạn có thể bỏ qua nếu chạy ở máy cá nhân).");
  }
});
// ------------------------------------------------------------------------

// Ưu tiên token trong biến môi trường DISCORD_TOKEN (file .env), nếu không có
// thì dùng "token" trong config.json. KHÔNG commit token thật lên Git.
const token = process.env.DISCORD_TOKEN || config.token;
if (!token) {
  console.error(
    "❌ Thiếu Discord bot token. Đặt DISCORD_TOKEN trong file .env, hoặc điền vào config.json -> \"token\"."
  );
  process.exit(1);
}

// Cảnh báo sớm nếu thiếu cấu hình Garena, thay vì để lỗi khó hiểu khi chạy lệnh !td
if (!config.garena || !config.garena.cookie || !config.garena.matchApiEndpoint || !config.garena.findMatchApiEndpoint) {
  console.warn(
    "⚠️ Cấu hình \"garena\" trong config.json đang thiếu trường (cookie / matchApiEndpoint / findMatchApiEndpoint). " +
    "Lệnh !td sẽ báo lỗi cho tới khi bạn điền đủ."
  );
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, 
    // BẮT BUỘC: phải bật "MESSAGE CONTENT INTENT"
    // trong Discord Developer Portal -> ứng dụng của bạn -> Bot -> Privileged
    // Gateway Intents, nếu không bot sẽ không đọc được nội dung tin nhắn (!diem...).
  ],
  partials: [Partials.Channel],
});

// ===== NAP CAC LENH SLASH (/taolineup, /taoprofile...) =====
// CHI nap file nao co export "data" (SlashCommandBuilder) + "execute" - day
// la dau hieu 1 file la LENH SLASH, phan biet voi scoreCommand.js (lenh
// prefix "!td", export handleScoreCommand rieng, xu ly qua messageCreate
// ben duoi, KHONG di qua Collection nay).
client.slashCommands = new Collection();
const commandsDir = path.join(__dirname, "commands");
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith(".js"))) {
  const command = require(path.join(commandsDir, file));
  if (command && command.data && typeof command.execute === "function") {
    client.slashCommands.set(command.data.name, command);
  }
}
console.log(
  `🧩 Đã nạp ${client.slashCommands.size} lệnh slash: ${[...client.slashCommands.keys()].join(", ") || "(không có)"}`
);

// Sử dụng chuẩn Events.ClientReady của Discord.js để loại bỏ hoàn toàn cảnh báo v15
client.once(Events.ClientReady, (readyClient) => {
  console.log(`✅ ${config.botName || "FF Score Bot"} đã đăng nhập với tên ${readyClient.user.tag}`);
  console.log(`👤 Bot user ID: ${readyClient.user.id}`);
  console.log(`🎮 Prefix lệnh: ${config.prefix || "!"}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return; // bỏ qua tin nhắn từ bot khác (kể cả chính nó)
  try {
    // Nguoi dung dan/paste key THANG vao khung chat (KHONG can go lenh
    // "!key", khong can prefix) - bot tu quet va kich hoat ngay neu tim
    // thay dung dinh dang key. Kiem tra nay chay TRUOC TIEN, truoc ca
    // lenh "!key" thu cong, vi day chinh la cach "!key" hoat dong ben
    // trong (dung chung ham activateChannelWithKey).
    const autoActivated = await tryAutoActivateFromMessage(message, config);
    if (autoActivated) return;

    // Lenh kich hoat/quan ly key (!key, !taokey, !dskey, !trangthai) LUON
    // duoc xu ly truoc, KHONG bi chan boi kiem tra kich hoat ben duoi -
    // neu khong nguoi dung se khong bao gio go duoc "!key" de mo khoa.
    const handledKeyCommand = await handleKeyCommand(message, config);
    if (handledKeyCommand) return;

    // CHAN moi lenh con lai (!td, !diem...) neu NGUOI GUI TIN NHAN chua
    // duoc kich hoat bang key hoac da HET HAN. MAC DINH KHONG AI DUNG
    // DUOC BOT, tru admin bot (config.adminUserIDs) va nguoi da nhap key
    // con hieu luc - CHI RIENG nguoi do duoc dung, khong anh huong ai
    // khac trong cung kenh.
    const prefix = config.prefix || "!";
    const body = (message.content || "").trim();
    if (body.startsWith(prefix) && !isUserUnlocked(message.author.id, config)) {
      await message.reply(NOT_ACTIVATED_MESSAGE);
      return;
    }

    await handleScoreCommand(message, config);
  } catch (e) {
    console.error("⚠️ Lỗi xử lý sự kiện messageCreate:", e);
  }
});

// ===== XU LY LENH SLASH (/taolineup, /taoprofile...) =====
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.slashCommands.get(interaction.commandName);
  if (!command) return;

  // CHAN lenh slash neu nguoi dung CHUA duoc kich hoat bang key/khong
  // phai admin - dong bo voi kiem tra o lenh prefix "!..." ben tren.
  if (!isUserUnlocked(interaction.user.id, config)) {
    await interaction.reply({
      content: NOT_ACTIVATED_MESSAGE,
      ephemeral: true,
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`⚠️ Lỗi khi chạy lệnh slash "${interaction.commandName}":`, err);
    const payload = { content: "Có lỗi xảy ra khi xử lý lệnh này.", ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply(payload);
    }
  }
});

client.on(Events.Error, (err) => {
  console.error("⚠️ Lỗi client Discord:", err);
});

client.login(token);
