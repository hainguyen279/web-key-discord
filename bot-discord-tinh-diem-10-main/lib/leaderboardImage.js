const path = require("path");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const {
  getTemplatePath,
  pickRandomTemplateKey,
} = require("./templates");
const { getLayout } = require("./layouts");
const { findTeamLogoPath } = require("./logos");

// Dang ky font rieng dong goi san trong assets/fonts thay vi phu thuoc vao
// font co san tren may chu (vd "Arial" thuong KHONG ton tai tren Linux
// server -> canvas fallback sang font mac dinh thieu glyph cho dau tieng
// Viet / ky tu dac biet trong ten doi -> hien thi o vuong trong "tofu box").
// DejaVu Sans co vung phu Unicode rong, ho tro tot dau tieng Viet.
const FONT_FAMILY = "DejaVu Sans";
let fontsRegistered = false;
function ensureFontsRegistered() {
  if (fontsRegistered) return;
  const fontsDir = path.join(__dirname, "..", "assets", "fonts");
  GlobalFonts.registerFromPath(
    path.join(fontsDir, "DejaVuSans.ttf"),
    FONT_FAMILY
  );
  GlobalFonts.registerFromPath(
    path.join(fontsDir, "DejaVuSans-Bold.ttf"),
    `${FONT_FAMILY} Bold`
  );
  // Font du phong: DejaVu Sans khong co glyph cho nhieu ky hieu/dingbat/emoji
  // ma nguoi choi hay chen vao nickname (vd ♪, ★, ✈, emoji trang tri...).
  // Dang ky them cac font nay de canvas (Skia) TU DONG fallback sang glyph
  // co san trong font khac khi font chinh (DejaVu Sans) khong co - khong can
  // sua ctx.font, Skia tu tim glyph trong tat ca font da dang ky.
  GlobalFonts.registerFromPath(
    path.join(fontsDir, "FreeSans.ttf"),
    "Symbol Fallback"
  );
  GlobalFonts.registerFromPath(
    path.join(fontsDir, "FreeSansBold.ttf"),
    "Symbol Fallback Bold"
  );
  GlobalFonts.registerFromPath(
    path.join(fontsDir, "NotoColorEmoji.ttf"),
    "Emoji Fallback"
  );
  // Fallback CUOI CUNG: GNU Unifont - phu gan nhu toan bo Basic Multilingual
  // Plane cua Unicode, bao gom ca cac bang chu hiem/trang tri (Javanese,
  // Balinese, Cham...) ma nguoi choi hay chen vao nickname cho "dep". Khong
  // font nao o tren (DejaVu/FreeSans/NotoColorEmoji) co cac ky tu nay ->
  // van ra o vuong "tofu" neu thieu lop nay. Dat cuoi cung trong danh sach
  // fallback vi glyph Unifont xau/pixel hoa, chi dung khi khong con lua chon
  // nao khac.
  GlobalFonts.registerFromPath(
    path.join(fontsDir, "unifont-16.0.03.ttf"),
    "Unifont Fallback"
  );
  fontsRegistered = true;
}

// Cat ngan chu neu vuot qua do rong cho phep, them dau "..." o cuoi
function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;

  let result = text;
  while (result.length > 0 && ctx.measureText(result + "…").width > maxWidth) {
    result = result.slice(0, -1);
  }
  return result + "…";
}

// Ve logo LAP DAY mot khung vuong (kieu "cover", giong object-fit: cover
// trong CSS): cat phan giua cua anh theo hinh vuong (bo bot canh du neu
// anh la hinh chu nhat) roi phong to lap kin khung, KHONG chua vien trong
// nao ca. Khac voi kieu "contain" truoc day (giu nguyen ti le, anh khong
// vuong se bi ho vien) - gio moi logo du to hay nho, vuong hay chu nhat
// deu duoc cat vuong tu dong va lap day o hien thi.
function drawLogoCover(ctx, img, centerX, centerY, size) {
  const srcSize = Math.min(img.width, img.height);
  const sx = (img.width - srcSize) / 2;
  const sy = (img.height - srcSize) / 2;
  ctx.drawImage(
    img,
    sx,
    sy,
    srcSize,
    srcSize,
    centerX - size / 2,
    centerY - size / 2,
    size,
    size
  );
}

// Ve icon vuong mien (crown) bang path canvas thay vi emoji unicode, de
// khong bao gio bi loi "tofu box" do thieu glyph font tren may chu.
// cx, cy: tam icon. size: canh khung icon (px).
function drawCrownIcon(ctx, cx, cy, size) {
  const w = size;
  const h = size * 0.72;
  const left = cx - w / 2;
  const top = cy - h / 2;
  const baseY = top + h;
  const spikeTopY = top;
  const midY = top + h * 0.32;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(left, baseY);
  ctx.lineTo(left, midY);
  ctx.lineTo(left + w * 0.2, midY + h * 0.18);
  ctx.lineTo(left + w * 0.5, spikeTopY);
  ctx.lineTo(left + w * 0.8, midY + h * 0.18);
  ctx.lineTo(left + w, midY);
  ctx.lineTo(left + w, baseY);
  ctx.closePath();

  ctx.fillStyle = "#ffd54a";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();

  // 3 cham nho tren dau 3 nhon mien
  ctx.fillStyle = "#ffe9a8";
  const dotR = w * 0.045;
  [
    [left, midY],
    [left + w * 0.5, spikeTopY],
    [left + w, midY],
  ].forEach(([px, py]) => {
    ctx.beginPath();
    ctx.arc(px, py, dotR, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

async function generateLeaderboardImage(rankedTeams, templateKey, gameBooyahs) {
  ensureFontsRegistered();
  // Neu khong chi dinh hinh cu the thi bot tu chon ngau nhien 1 trong cac mau co san
  const chosenKey = templateKey || pickRandomTemplateKey();
  const templatePath = getTemplatePath(chosenKey);
  const bg = await loadImage(templatePath);
  const canvas = createCanvas(bg.width, bg.height);
  const ctx = canvas.getContext("2d");

  // Toa do rieng cho tung anh nen (xem lib/layouts.js de chinh)
  const layout = getLayout(chosenKey);
  const { rowY: ROW_Y, colX: COL_X, topPanel: TOP_PANEL, gameBooyah: GAME_BOOYAH } = layout;

  ctx.drawImage(bg, 0, 0);

  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px DejaVu Sans Bold, Symbol Fallback Bold, Emoji Fallback, Unifont Fallback";

  const maxTeamNameWidth = COL_X.elim - COL_X.teamName - 20; // 20px dem an toan

  const rows = rankedTeams.slice(0, ROW_Y.length);

  for (let idx = 0; idx < rows.length; idx += 1) {
    const team = rows[idx];
    const y = ROW_Y[idx];

    // Doi da duoc xac nhan VO DICH qua Champion Rush (CPR): to mau vang,
    // them icon vuong mien phia truoc ten de phan biet voi cac doi khac -
    // doi nay LUON o hang 1 du diem so co bi doi khac vuot qua.
    const isChampion = Boolean(team.isChampionRush);
    ctx.fillStyle = isChampion ? "#FFD700" : "#ffffff";

    ctx.textAlign = "left";
    const namePrefix = isChampion ? "👑 " : "";

    // Ve logo rieng (neu uid dai dien cua doi da !nhapid) ben trai ten doi.
    // findTeamLogoPath duyet nameStats (uid -> {name,count}) cua doi de tim
    // uid dau tien co dang ky logo (xem lib/logos.js).
    let nameX = COL_X.teamName;
    const logoPath = findTeamLogoPath(team.nameStats);
    if (logoPath) {
      try {
        const logoImg = await loadImage(logoPath);
        const logoSize = 28; // canh o vuong logo (px)
        drawLogoCover(ctx, logoImg, COL_X.teamName + logoSize / 2, y, logoSize);
        nameX += logoSize + 8; // dem 8px giua logo va chu ten doi
      } catch (err) {
        console.error(`⚠️ Lỗi vẽ logo cho đội "${team.teamName}":`, err.message);
      }
    }

    const displayName = truncateText(
      ctx,
      `${namePrefix}${team.teamName}`,
      maxTeamNameWidth - (nameX - COL_X.teamName)
    );
    ctx.fillText(displayName, nameX, y);

    ctx.textAlign = "center";
    ctx.fillText(String(team.kills ?? 0), COL_X.elim, y);
    ctx.fillText(String(team.booyahCount ?? 0), COL_X.booyah, y);
    ctx.fillText(String(team.totalPoints ?? 0), COL_X.points, y);

    // Tra ve mau chu mac dinh cho cac hang tiep theo
    ctx.fillStyle = "#ffffff";
  }

  // Team dung hang 1 hien o o vuong "BOOYAH!" goc duoi trai
  if (rows.length > 0) {
    const top = rows[0];
    ctx.font = "bold 30px DejaVu Sans Bold, Symbol Fallback Bold, Emoji Fallback, Unifont Fallback";
    ctx.textAlign = "center";
    ctx.fillText(String(top.kills ?? 0), TOP_PANEL.elimX, TOP_PANEL.y);
    ctx.fillText(String(top.totalPoints ?? 0), TOP_PANEL.ptsX, TOP_PANEL.y);

    // Logo TO cua doi hang 1, ve vua khit trong khung vuong "logo" (giu
    // nguyen ti le anh, khong keo bien dang - anh nao vuong san se lap
    // day khung, anh chu nhat se can giua va chua het chieu rong/cao).
    if (TOP_PANEL.logo) {
      const championLogoPath = findTeamLogoPath(top.nameStats);
      if (championLogoPath) {
        try {
          const logoImg = await loadImage(championLogoPath);
          const { centerX, centerY, size } = TOP_PANEL.logo;
          drawLogoCover(ctx, logoImg, centerX, centerY, size);
        } catch (err) {
          console.error(`⚠️ Lỗi vẽ logo to cho đội vô địch "${top.teamName}":`, err.message);
        }
      }
    }
  }

  // Ten team dat Booyah cua tung tran (Game 1/2/3/4/5/6), ghi ngay giua moi o hinh
  // ben phai. Chi ap dung cho du lieu theo khung gio (!td, !bxhkhung) - noi
  // moi tran tuong ung 1 "Game" theo dung thu tu da choi.
  // Moi phan tu co the la: string (du lieu CU, chi co ten) hoac object
  // {teamKey, teamName} (du lieu MOI) - object cho phep tra logo chinh xac
  // theo teamKey thay vi doi chieu theo ten (ten co the doi qua cac tran).
  if (Array.isArray(gameBooyahs) && gameBooyahs.length > 0) {
    // Bang tra cuu nameStats theo teamKey va theo ten (fallback cho du lieu
    // cu), lay tu TOAN BO rankedTeams (khong chi 12 hang hien thi) de van
    // tim duoc logo cho doi da thang 1 game nhung hien khong con trong top.
    const nameStatsByKey = {};
    const nameStatsByName = {};
    rankedTeams.forEach((t) => {
      nameStatsByKey[t.teamKey] = t.nameStats;
      nameStatsByName[t.teamName] = t.nameStats;
    });

    ctx.font = "bold 24px DejaVu Sans Bold, Symbol Fallback Bold, Emoji Fallback, Unifont Fallback";
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#000000";
    ctx.fillStyle = "#ffffff";

    // Panel nay co so o CO DINH theo template anh (GAME_BOOYAH.rowsY.length),
    // khong the mo rong bang code. TRUOC DAY luon lay N game DAU TIEN - neu
    // khung gio dau hon so o (vd 8 tran nhung panel chi co 6 o), 2 tran MOI
    // NHAT bi cat mat khoi recap (du van duoc tinh diem day du trong bang
    // chinh/cot PTS - day chi la panel hien thi, khong anh huong diem).
    // BAY GIO: lay N game GAN DAY NHAT thay vi N game dau, vi nguoi dung
    // thuong quan tam ket qua moi nhat hon la ket qua tran dau tien.
    const entries =
      gameBooyahs.length > GAME_BOOYAH.rowsY.length
        ? gameBooyahs.slice(-GAME_BOOYAH.rowsY.length)
        : gameBooyahs;
    for (let idx = 0; idx < entries.length; idx += 1) {
      const entry = entries[idx];
      if (!entry) continue;

      const teamName = typeof entry === "string" ? entry : entry.teamName;
      const teamKey = typeof entry === "string" ? null : entry.teamKey;
      if (!teamName) continue;

      const y = GAME_BOOYAH.rowsY[idx];
      // KHONG dung emoji unicode (vd 👑) o day: DejaVu/FreeSans khong co
      // glyph mau cho emoji, va font mau (NotoColorEmoji) khong tuong thich
      // voi ctx.strokeText/fillText trong @napi-rs/canvas -> ra o vuong
      // "tofu" thay vi hinh. Thay vao do ve vuong mien vang bang path canvas,
      // khong phu thuoc font nao ca.
      const label = truncateText(ctx, teamName, GAME_BOOYAH.maxWidth);
      const labelWidth = ctx.measureText(label).width;
      const crownSize = 18;
      const crownGap = 6;
      const crownCenterX =
        GAME_BOOYAH.centerX - labelWidth / 2 - crownGap - crownSize / 2;
      drawCrownIcon(ctx, crownCenterX, y - 7, crownSize);
      ctx.strokeText(label, GAME_BOOYAH.centerX, y);
      ctx.fillText(label, GAME_BOOYAH.centerX, y);

      // Ve logo NGAY PHIA TREN ten doi (neu tim duoc logo cua doi nay)
      const nameStats =
        (teamKey && nameStatsByKey[teamKey]) || nameStatsByName[teamName];
      const logoPath = findTeamLogoPath(nameStats);
      if (logoPath && GAME_BOOYAH.logoSize) {
        try {
          const logoImg = await loadImage(logoPath);
          const size = GAME_BOOYAH.logoSize;
          const logoBottomY = y - 5 - GAME_BOOYAH.logoGap; // 16 ~ nua chieu cao chu
          drawLogoCover(
            ctx,
            logoImg,
            GAME_BOOYAH.centerX,
            logoBottomY - size / 2,
            size
          );
        } catch (err) {
          console.error(`⚠️ Lỗi vẽ logo Game ${idx + 1} cho đội "${teamName}":`, err.message);
        }
      }
    }
  }

  return canvas.encode("png");
}

// ===== DEBUG: tao anh nen co ke luoi toa do de tim toa do chinh xac =====
// Dung cho lenh !luoitoado <tenhinh>. Ke duong moi 50px (mau nhat) va
// moi 100px (mau dam, co ghi so toa do) de nguoi dung do pixel bang mat.
async function generateGridPreview(templateKey) {
  ensureFontsRegistered();
  const chosenKey = templateKey || pickRandomTemplateKey();
  const templatePath = getTemplatePath(chosenKey);
  const bg = await loadImage(templatePath);
  const canvas = createCanvas(bg.width, bg.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bg, 0, 0);

  const step = 50;
  const major = 100;

  for (let x = 0; x < bg.width; x += step) {
    const isMajor = x % major === 0;
    ctx.strokeStyle = isMajor ? "rgba(255,0,0,0.9)" : "rgba(255,120,120,0.5)";
    ctx.lineWidth = isMajor ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, bg.height);
    ctx.stroke();
    if (isMajor) {
      ctx.fillStyle = "#ffff00";
      ctx.font = "bold 16px DejaVu Sans Bold, Symbol Fallback Bold, Emoji Fallback, Unifont Fallback";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(String(x), x + 2, 2);
    }
  }

  for (let y = 0; y < bg.height; y += step) {
    const isMajor = y % major === 0;
    ctx.strokeStyle = isMajor ? "rgba(0,255,0,0.9)" : "rgba(150,255,150,0.5)";
    ctx.lineWidth = isMajor ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(bg.width, y);
    ctx.stroke();
    if (isMajor) {
      ctx.fillStyle = "#00ffff";
      ctx.font = "bold 16px DejaVu Sans Bold, Symbol Fallback Bold, Emoji Fallback, Unifont Fallback";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(String(y), 2, y + 2);
    }
  }

  return { buffer: await canvas.encode("png"), chosenKey };
}

// ===== DEBUG: ve o vuong placeholder cho tung vi tri logo de kiem tra khop =====
// Lenh !testlogo <tenhinh>: ve len anh nen:
//   - 12 o vuong nho (28px) tai cot teamName cho 12 hang doi - kiem tra logo hang
//   - 1 o vuong to (size px) tai topPanel.logo - kiem tra logo doi hang 1
//   - 4 o vuong nho (logoSize px) tai cac vi tri gameBooyah - kiem tra logo game
// Moi o vuong co vien do + chu nhan (Row1..12, TOP, G1..G4) de nhan biet vi tri.
async function generateLogoTest(templateKey) {
  ensureFontsRegistered();
  const chosenKey = templateKey || pickRandomTemplateKey();
  const templatePath = getTemplatePath(chosenKey);
  const bg = await loadImage(templatePath);
  const canvas = createCanvas(bg.width, bg.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bg, 0, 0);

  const layout = getLayout(chosenKey);
  const { rowY: ROW_Y, colX: COL_X, topPanel: TOP_PANEL, gameBooyah: GAME_BOOYAH } = layout;

  // Helper: ve o vuong placeholder tai (x, y) voi kich thuoc w x h
  // Vien do dam + nen trong suot nua + chu nhan chinh giua
  function drawPlaceholder(x, y, w, h, label) {
    // Nen trong suot mau trang nhat
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(x, y, w, h);
    // Vien do
    ctx.strokeStyle = "#ff2222";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    // Duong cheo X de ro rang day la placeholder
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
    ctx.moveTo(x + w, y);
    ctx.lineTo(x, y + h);
    ctx.strokeStyle = "rgba(255,50,50,0.6)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // Chu nhan chinh giua o vuong
    ctx.font = "bold 11px DejaVu Sans Bold, Symbol Fallback Bold, Emoji Fallback, Unifont Fallback";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Bo vien den de chu noi ro tren nen bat ky
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.strokeText(label, x + w / 2, y + h / 2);
    ctx.fillStyle = "#ffff00";
    ctx.fillText(label, x + w / 2, y + h / 2);
  }

  // --- 12 hang logo nho ben bang xep hang ---
  const rowLogoSize = 28; // px, dong bo voi leaderboardImage.js
  for (let i = 0; i < ROW_Y.length; i += 1) {
    const y = ROW_Y[i];
    drawPlaceholder(
      COL_X.teamName,
      y - rowLogoSize / 2,
      rowLogoSize,
      rowLogoSize,
      `R${i + 1}`
    );
  }

  // --- Logo TO doi hang 1 (topPanel.logo) ---
  if (TOP_PANEL.logo) {
    const { centerX, centerY, size } = TOP_PANEL.logo;
    drawPlaceholder(
      centerX - size / 2,
      centerY - size / 2,
      size,
      size,
      "TOP"
    );
  }

  // --- 6 logo nho cot Game 1-6 (gameBooyah) ---
  if (GAME_BOOYAH.logoSize && GAME_BOOYAH.rowsY) {
    const gSize = GAME_BOOYAH.logoSize;
    const gGap = GAME_BOOYAH.logoGap || 14;
    for (let i = 0; i < GAME_BOOYAH.rowsY.length; i += 1) {
      const textY = GAME_BOOYAH.rowsY[i];
      // Logo ve PHIA TREN dong chu (cung logic voi leaderboardImage.js)
      const logoBottomY = textY - 16 - gGap;
      drawPlaceholder(
        GAME_BOOYAH.centerX - gSize / 2,
        logoBottomY - gSize,
        gSize,
        gSize,
        `G${i + 1}`
      );
    }
  }

  return { buffer: await canvas.encode("png"), chosenKey };
}

module.exports = { generateLeaderboardImage, generateGridPreview, generateLogoTest };
