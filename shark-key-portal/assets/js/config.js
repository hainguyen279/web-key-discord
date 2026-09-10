/* Shark Key Portal configuration
   Edit only this file when changing your Ouo.io gate URL.
*/
window.SHARK_CONFIG = Object.freeze({
  OUO_GATE_URL: 'https://ouo.io/PUT-YOUR-LINK-HERE',
  STORAGE_KEY: 'shark_saved_key_v1',
  RETURN_MARKER: 'shark_ouo_verified_v1',
  // ===== Dong bo voi Bot Discord =====
  // API_BASE_URL: dia chi cong khai cua bot Discord (vi du: Render URL
  // dang chay index.js, dang co san server Express o do). De TRONG neu
  // muon web tu tao key rieng (KHONG dong bo voi bot - bot se khong biet
  // key nay, lenh "!key" trong Discord se bao "khong tim thay").
  API_BASE_URL: 'https://web-key-discord.onrender.com',
  // API_KEY_SECRET: PHAI khop CHINH XAC voi KEY_API_SECRET trong file .env
  // cua bot Discord, neu khong API se tra ve loi 401 Unauthorized.
  API_KEY_SECRET: 'hai2792009',
  // Thoi han mac dinh cap cho key tao tu web (khong bat buoc nguoi dung
  // chon) - sua theo y muon: { amount: 30, unit: 'ngay' } hoac
  // { amount: null, unit: 'vinhvien' }.
  DEFAULT_KEY_DURATION: { amount: 30, unit: 'ngay' }
});
