/**
 * logos.js
 * Quan ly logo rieng gan theo tung UID nguoi choi (lenh !nhapid).
 * Logo duoc luu vat ly trong data/logos/<uid>.<ext>, va anh xa
 * uid -> ten file duoc luu trong data/logos.json.
 */
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const DATA_DIR = path.join(__dirname, "..", "data");
const LOGO_DIR = path.join(DATA_DIR, "logos");
const INDEX_PATH = path.join(DATA_DIR, "logos.json");

// Logo mac dinh (hinh ca map "NTH") dung cho MOI doi khi chua co ai trong
// doi tu !nhapid gan logo rieng. Ngay khi mot uid trong doi duoc gan logo
// khac, logo do se duoc uu tien va thay the logo mac dinh nay.
const DEFAULT_LOGO_PATH = path.join(__dirname, "..", "assets", "default_logo.jpg");

function loadIndex() {
  if (!fs.existsSync(INDEX_PATH)) return {};
  try {
    const raw = fs.readFileSync(INDEX_PATH, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (err) {
    console.error("Lỗi đọc data/logos.json:", err);
    return {};
  }
}

function saveIndex(index) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), "utf8");
}

function extFromContentType(contentType) {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  return "png"; // mac dinh
}

/**
 * Tai anh tu URL dinh kem tren Discord ve va luu thanh logo chinh thuc
 * cho 1 uid. Neu uid da co logo cu (khac duoi file) thi xoa file cu di
 * de khong con rac.
 */
async function saveLogoFromUrl(uid, url, contentType) {
  if (!fs.existsSync(LOGO_DIR)) fs.mkdirSync(LOGO_DIR, { recursive: true });

  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15000,
  });

  const ext = extFromContentType(contentType || response.headers["content-type"]);
  const fileName = `${uid}.${ext}`;
  const filePath = path.join(LOGO_DIR, fileName);

  const index = loadIndex();
  if (index[uid] && index[uid] !== fileName) {
    const oldPath = path.join(LOGO_DIR, index[uid]);
    if (fs.existsSync(oldPath)) {
      try {
        fs.unlinkSync(oldPath);
      } catch (_) {
        /* bo qua loi xoa file cu, khong quan trong */
      }
    }
  }

  fs.writeFileSync(filePath, response.data);
  index[uid] = fileName;
  saveIndex(index);
  return filePath;
}

// Tra ve duong dan file logo cua 1 uid, hoac null neu chua co / file bi mat
function getLogoPath(uid) {
  const index = loadIndex();
  const fileName = index[uid];
  if (!fileName) return null;
  const filePath = path.join(LOGO_DIR, fileName);
  return fs.existsSync(filePath) ? filePath : null;
}

/**
 * Tim logo dai dien cho CA DOI: duyet cac uid trong nameStats cua doi
 * (xem scoring.js -> mergeIntoLeaderboard), tra ve logo cua UID DAU TIEN
 * (theo thu tu xuat hien trong tran) co dang ky logo.
 * Neu KHONG ai trong doi da !nhapid logo rieng, tra ve logo MAC DINH
 * (hinh ca map "NTH") thay vi null, de doi nao cung co logo hien thi.
 * Ngay khi co ai trong doi gan logo rieng, logo do se thay the logo mac dinh.
 */
function findTeamLogoPath(nameStats) {
  if (nameStats) {
    for (const uid of Object.keys(nameStats)) {
      const logoPath = getLogoPath(uid);
      if (logoPath) return logoPath;
    }
  }
  return fs.existsSync(DEFAULT_LOGO_PATH) ? DEFAULT_LOGO_PATH : null;
}

// Xoa logo cua 1 uid (dung cho lenh quan ly sau nay neu can, vd !xoalogo)
function removeLogo(uid) {
  const index = loadIndex();
  const fileName = index[uid];
  if (!fileName) return false;
  const filePath = path.join(LOGO_DIR, fileName);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (_) {
      /* bo qua */
    }
  }
  delete index[uid];
  saveIndex(index);
  return true;
}

module.exports = {
  saveLogoFromUrl,
  getLogoPath,
  findTeamLogoPath,
  removeLogo,
};
