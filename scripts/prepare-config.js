// Tạo capacitor.config.json.
// Mặc định (bản đưa lên Google Play): web nằm TRONG app -> mở được ngay cả khi chưa từng có mạng.
// REMOTE_UPDATE=1: app mở địa chỉ GitHub Pages của repo để tự cập nhật nội dung mà không cần build lại APK.
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('capacitor.config.template.json', 'utf8'));
if (process.env.REMOTE_UPDATE === '1') {
  const repo = process.env.GITHUB_REPOSITORY;           // vd: tenban/qr-manager
  const url = process.env.PAGES_URL || (repo ? `https://${repo.split('/')[0].toLowerCase()}.github.io/${repo.split('/')[1]}/` : null);
  if (!url) { console.error('Thiếu GITHUB_REPOSITORY/PAGES_URL'); process.exit(1); }
  cfg.server = { url, allowNavigation: [new URL(url).host], androidScheme: 'https' };
  console.log('Chế độ tự cập nhật từ:', url);
} else {
  cfg.server = { androidScheme: 'https' };
  console.log('Chế độ đóng gói: web nằm trong app (offline hoàn toàn).');
}
fs.writeFileSync('capacitor.config.json', JSON.stringify(cfg, null, 2));
