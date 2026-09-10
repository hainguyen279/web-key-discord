const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

// Tự động tìm kiếm đường dẫn thư mục assets chính xác nhất trên Render Linux
let ASSETS_DIR = path.join(__dirname, 'assets');
if (!fs.existsSync(ASSETS_DIR)) {
  ASSETS_DIR = path.join(process.cwd(), 'assets');
}
if (!fs.existsSync(ASSETS_DIR)) {
  ASSETS_DIR = path.join(process.cwd(), 'bot', 'assets');
}

console.log('[imageComposer] Thu muc assets duoc xac dinh tai:', ASSETS_DIR);

// Toa do o ten tren template profile moi (FFWS 2026, kich thuoc goc 1920x1080)
const NAME_BOX = {
  x: 185,
  y: 55,
  width: 345,
  height: 100,
};

// Toa do cac o chu tren template Line Up Team (lineup_template.png, kich thuoc goc 1672x941)
const LINEUP_TEMPLATE_FILE = 'lineup_template.png';

const LINEUP_TEAM_NAME_BOX = {
  x: 1248,
  y: 216,
  width: 350,
  height: 42,
};

const LINEUP_PLAYER_BOXES = [
  { x: 70, y: 822, width: 274, height: 45 },
  { x: 385, y: 822, width: 274, height: 45 },
  { x: 700, y: 822, width: 274, height: 45 },
  { x: 1014, y: 822, width: 274, height: 45 },
  { x: 1328, y: 822, width: 272, height: 45 },
];

const MAX_FONT_SIZE = 56;
const MIN_FONT_SIZE = 22;

const LINEUP_MAX_FONT_SIZE = 34;
const LINEUP_MIN_FONT_SIZE = 14;

let CUSTOM_FONT_FAMILY = null;
const fontPath = path.join(ASSETS_DIR, 'fonts', 'display-font.ttf');
if (fs.existsSync(fontPath)) {
  try {
    GlobalFonts.registerFromPath(fontPath, 'FFDisplay');
    CUSTOM_FONT_FAMILY = 'FFDisplay';
    console.log('[imageComposer] Da nap font chu thanh cong tu:', fontPath);
  } catch (fontErr) {
    console.error('[imageComposer] Loi nap font, tu dong fallback:', fontErr.message);
  }
}

const ROLE_VALUES = ['tank', 'support', 'sniper', 'bomber'];
const COLOR_VALUES = ['purple', 'blue', 'silver', 'red', 'gold'];

// Anh xa tu role (hien thi cho nguoi dung) sang ten sung dung tren file anh template
const ROLE_TO_WEAPON = {
  tank: 'm590',
  support: 'trogon',
  sniper: 'awm',
  bomber: 'm79',
};

function isValidRole(role) {
  return ROLE_VALUES.includes(role);
}

function isValidColor(color) {
  return COLOR_VALUES.includes(color);
}

function backgroundPathFor(role, color) {
  const weapon = ROLE_TO_WEAPON[role] || role;
  // File anh dat ten theo dinh dang: mau_sungvukhi.png (vi du: purple_m590.png)
  let primaryPath = path.join(ASSETS_DIR, `${color}_${weapon}.png`);
  if (fs.existsSync(primaryPath)) return primaryPath;

  const capitalizedWeapon = weapon.charAt(0).toUpperCase() + weapon.slice(1);
  const capitalizedColor = color.charAt(0).toUpperCase() + color.slice(1);
  let backupPath = path.join(ASSETS_DIR, `${capitalizedColor}_${capitalizedWeapon}.png`);
  if (fs.existsSync(backupPath)) return backupPath;

  return primaryPath;
}

function fitFontSize(ctx, text, maxWidth, fontFamily, maxSize = MAX_FONT_SIZE, minSize = MIN_FONT_SIZE) {
  let size = maxSize;
  // Bẫy chống treo bot: Ép vòng lặp dừng lại ngay nếu kích thước giảm xuống dưới minSize hoặc dưới 10px
  while (size > minSize && size > 10) {
    ctx.font = `bold ${size}px "${fontFamily}"`;
    const { width } = ctx.measureText(text);
    if (width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function drawName(ctx, rawName) {
  const name = rawName.trim().toUpperCase();
  
  // Tránh sử dụng 'sans-serif' trên Linux Render vì hệ thống lõi Skia sẽ bị lỗi tính toán kích thước chữ gây treo tiến trình.
  // Nếu chưa nạp được font .ttf, dùng chuỗi trống "" làm fallback an toàn.
  const fontFamily = CUSTOM_FONT_FAMILY || ''; 
  const padding = 24;
  const maxTextWidth = NAME_BOX.width - padding * 2;

  const fontSize = fitFontSize(ctx, name, maxTextWidth, fontFamily);
  ctx.font = `bold ${fontSize}px "${fontFamily}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const centerX = NAME_BOX.x + NAME_BOX.width / 2;
  const centerY = NAME_BOX.y + NAME_BOX.height / 2;

  ctx.save();

  if (!CUSTOM_FONT_FAMILY) {
    ctx.translate(centerX, centerY);
    ctx.transform(1, 0, -0.18, 1, 0, 0);
    ctx.translate(-centerX, -centerY);
  }

  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, centerX, centerY + 2);

  ctx.restore();
}

// Ve mot dong chu can giua trong 1 khung box bat ky (dung chung cho ten doi va ten player)
function drawBoxText(ctx, box, rawText, { maxSize = LINEUP_MAX_FONT_SIZE, minSize = LINEUP_MIN_FONT_SIZE } = {}) {
  const text = rawText.trim().toUpperCase();
  const fontFamily = CUSTOM_FONT_FAMILY || '';
  const padding = 20;
  const maxTextWidth = box.width - padding * 2;

  const fontSize = fitFontSize(ctx, text, maxTextWidth, fontFamily, maxSize, minSize);
  ctx.font = `bold ${fontSize}px "${fontFamily}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  ctx.save();

  if (!CUSTOM_FONT_FAMILY) {
    ctx.translate(centerX, centerY);
    ctx.transform(1, 0, -0.18, 1, 0, 0);
    ctx.translate(-centerX, -centerY);
  }

  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, centerX, centerY + 2);

  ctx.restore();
}

async function composeLineup({ teamName, players }) {
  if (!teamName || !teamName.trim()) {
    throw new Error('Ten doi khong duoc de trong');
  }
  if (teamName.trim().length > 20) {
    throw new Error('Ten doi toi da 20 ky tu');
  }
  if (!Array.isArray(players) || players.length !== 5) {
    throw new Error('Can dung 5 ten player');
  }
  players.forEach((p, idx) => {
    if (!p || !p.trim()) {
      throw new Error(`Ten player ${idx + 1} khong duoc de trong`);
    }
    if (p.trim().length > 16) {
      throw new Error(`Ten player ${idx + 1} toi da 16 ky tu`);
    }
  });

  const templatePath = path.join(ASSETS_DIR, LINEUP_TEMPLATE_FILE);
  console.log(`[imageComposer] Dang kiem tra file template lineup tai: ${templatePath}`);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Khong tim thay file template lineup: ${templatePath}`);
  }

  const background = await loadImage(templatePath).catch((loadErr) => {
    throw new Error(`Loi khi phan giai file template lineup: ${loadErr.message}`);
  });

  console.log(`[imageComposer] Nap template lineup thanh cong (${background.width}x${background.height})`);

  const canvas = createCanvas(background.width, background.height);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(background, 0, 0);

  drawBoxText(ctx, LINEUP_TEAM_NAME_BOX, teamName);
  players.forEach((playerName, idx) => {
    drawBoxText(ctx, LINEUP_PLAYER_BOXES[idx], playerName);
  });

  console.log('[imageComposer] Ve lineup hoan tat, bat dau xuat buffer...');
  return canvas.toBuffer('image/png');
}

async function composeProfile({ role, color, name }) {
  if (!isValidRole(role)) {
    throw new Error(`Role khong hop le: ${role}`);
  }
  if (!isValidColor(color)) {
    throw new Error(`Mau khong hop le: ${color}`);
  }
  if (!name || !name.trim()) {
    throw new Error('Ten khong duoc de trong');
  }
  if (name.trim().length > 16) {
    throw new Error('Ten toi da 16 ky tu');
  }

  const bgPath = backgroundPathFor(role, color);
  console.log(`[imageComposer] Dang kiem tra file anh nen tai duong dan: ${bgPath}`);
  
  if (!fs.existsSync(bgPath)) {
    throw new Error(`Khong tim thay file phoi anh nen tai he thong Linux: ${bgPath}`);
  }

  console.log('[imageComposer] File ton tai, bat dau nap anh qua loadImage...');
  
  const background = await loadImage(bgPath).catch((loadErr) => {
    throw new Error(`Loi khi phan giai file anh nen qua @napi-rs/canvas: ${loadErr.message}`);
  });

  console.log(`[imageComposer] Nap anh phoi thanh cong (${background.width}x${background.height}), bat dau khoi tao canvas...`);

  const canvas = createCanvas(background.width, background.height);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(background, 0, 0);
  drawName(ctx, name);

  console.log('[imageComposer] Ve chu hoan tat, bat dau xuat buffer...');
  return canvas.toBuffer('image/png');
}

module.exports = {
  composeProfile,
  composeLineup,
  ROLE_VALUES,
  COLOR_VALUES,
  NAME_BOX,
};
