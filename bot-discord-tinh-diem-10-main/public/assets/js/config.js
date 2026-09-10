/* Shark Key Portal configuration
   Edit only this file when changing your Ouo.io gate URL.
*/
window.SHARK_CONFIG = Object.freeze({
  OUO_GATE_URL: 'https://web-key-discord-1.onrender.com',
  STORAGE_KEY: 'shark_saved_key_v1',
  RETURN_MARKER: 'shark_ouo_verified_v1',
  // ===== Dong bo voi Bot Discord (cung 1 domain, do bot tu phuc vu web) =====
  // API_KEY_SECRET: PHAI khop CHINH XAC voi KEY_API_SECRET trong file .env
  // cua bot Discord, neu khong API se tra ve loi 401 Unauthorized.
  API_KEY_SECRET: 'hai2792009',
  // Thoi han mac dinh cap cho key tao tu web (khong bat buoc nguoi dung
  // chon) - sua theo y muon: { amount: 30, unit: 'ngay' } hoac
  // { amount: null, unit: 'vinhvien' }.
  DEFAULT_KEY_DURATION: { amount: 1, unit: 'ngay' },
  // ===== Cua sau cho ADMIN test (KHONG can vuot Ouo) =====
  // Vao link: <domain-web>/?admin=<chuoi-nay> se TU DONG duoc coi la da
  // vuot Ouo xong, bam "Lay Key" la co ngay, dung de test khong can cho
  // vuot quang cao moi lan. Doi thanh 1 chuoi bi mat rieng cua ban, dung
  // de trong '' (se tat tinh nang nay).
  ADMIN_BYPASS_SECRET: 'admtest'
});
