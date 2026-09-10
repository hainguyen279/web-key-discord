const path = require("path");

const ASSETS_DIR = path.join(__dirname, "..", "assets");

// Danh sach template: key noi bo -> ten file trong thu muc assets
const TEMPLATES = {
  default: "booyah_template_itachi.png",
  itachi: "booyah_template_itachi.png",
  kimetsu: "booyah_template_kimetsu.png",
  naruto: "booyah_template_naruto.png",
  chainsawman: "booyah_template_chainsawman.png",
  onepiece: "booyah_template_onepiece.png",
  jjk: "booyah_template_jjk.png",
};

// Cac tu khoa nguoi dung co the go de chon hinh (khong phan biet hoa/thuong, dau)
const ALIASES = {
  "1": "itachi",
  "itachi": "itachi",
  "uchiha": "itachi",
  "akatsuki": "itachi",

  "2": "kimetsu",
  "kimetsu": "kimetsu",
  "demonslayer": "kimetsu",
  "luoiquy": "kimetsu",
  "guimetnoyaiba": "kimetsu",

  "3": "naruto",
  "naruto": "naruto",
  "naruto2": "naruto",
  "hokage": "naruto",

  "4": "chainsawman",
  "chainsawman": "chainsawman",
  "csm": "chainsawman",
  "maytraycua": "chainsawman",

  "5": "onepiece",
  "onepiece": "onepiece",
  "luffy": "onepiece",
  "haiptac": "onepiece",

  "6": "jjk",
  "jjk": "jjk",
  "jujutsukaisen": "jjk",
  "chuthuathuat": "jjk",
  "gojo": "jjk",

  "0": "default",
  "default": "default",
  "macdinh": "default",
  "goc": "default",
};

function stripAccents(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

// Chuan hoa 1 chuoi nguoi dung nhap thanh key template hop le, hoac null neu khong khop
function resolveTemplateKey(raw) {
  if (!raw) return null;
  const cleaned = stripAccents(String(raw).trim().toLowerCase()).replace(/[\s_-]+/g, "");
  const key = ALIASES[cleaned];
  if (key && TEMPLATES[key]) return key;
  return null;
}

// Chon ngau nhien 1 template trong danh sach hien co.
// LOAI "default" ra khoi danh sach random: "default" chi la bi danh
// TRUNG FILE ANH voi "itachi" (xem TEMPLATES o tren) nhung LAYOUT_OVERRIDES
// cua no lai la {} -> dung BASE_LAYOUT thay vi toa do rieng da do cho itachi.
// Neu de "default" trong danh sach random, ~1/7 lan bot se ve chu SAI toa do
// len anh itachi (dung BASE_LAYOUT thay vi LAYOUT_OVERRIDES.itachi) du toa do
// da do dung cho tung anh - day la nguyen nhan gay lech ngau nhien.
function pickRandomTemplateKey() {
  const keys = Object.keys(TEMPLATES).filter((k) => k !== "default");
  return keys[Math.floor(Math.random() * keys.length)];
}

function getTemplatePath(key) {
  const templateFile = TEMPLATES[key] || TEMPLATES.default;
  return path.join(ASSETS_DIR, templateFile);
}

function listTemplatesText() {
  return "itachi, kimetsu, naruto, chainsawman, onepiece, jjk (hoặc số 1-6). Không chọn thì bot lấy ngẫu nhiên.";
}

module.exports = {
  TEMPLATES,
  resolveTemplateKey,
  pickRandomTemplateKey,
  getTemplatePath,
  listTemplatesText,
};