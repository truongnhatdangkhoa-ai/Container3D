// Chạy sau `npx cap add android`: ép targetSdk 36, ký bản release, đặt số phiên bản, màu nền cửa sổ.
const fs = require('fs'), path = require('path');
const app = 'android/app';
// Container 3D không cần camera/in ấn: giữ AndroidManifest mặc định của Capacitor (chỉ quyền INTERNET do Capacitor tự thêm).

// Google Play (từ 31/08/2026) bắt buộc targetSdk >= 36: kiểm tra và ép nếu template thấp hơn.
const vp = path.join('android', 'variables.gradle');
if (fs.existsSync(vp)) {
  let v = fs.readFileSync(vp, 'utf8');
  v = v.replace(/(targetSdkVersion\s*=\s*)(\d+)/, (m, a, n) => a + Math.max(+n, 36))
       .replace(/(compileSdkVersion\s*=\s*)(\d+)/, (m, a, n) => a + Math.max(+n, 36));
  fs.writeFileSync(vp, v);
  const t = /targetSdkVersion\s*=\s*(\d+)/.exec(v);
  console.log('targetSdkVersion =', t && t[1]);
  if (!t || +t[1] < 36) { console.error('targetSdk < 36: Google Play sẽ từ chối.'); process.exit(1); }
}

// Màu nền cửa sổ / màn chờ khớp với giao diện Sáng/Tối của app (không bị viền đen ở thanh trạng thái, không nháy trắng khi mở).
const resDir = path.join(app, 'src/main/res');
const colorsXml = (c) => `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="qm_window_bg">${c}</color>\n</resources>\n`;
fs.mkdirSync(path.join(resDir, 'values-night'), { recursive: true });
fs.writeFileSync(path.join(resDir, 'values/qm_colors.xml'), colorsXml('#F1F4F8'));
fs.writeFileSync(path.join(resDir, 'values-night/qm_colors.xml'), colorsXml('#0E1218'));
const stp = path.join(resDir, 'values/styles.xml');
if (fs.existsSync(stp)) {
  let st = fs.readFileSync(stp, 'utf8');
  if (!st.includes('qm_window_bg')) {
    st = st.replace(/(<style name="AppTheme\.NoActionBar"[^>]*>)/, '$1\n        <item name="android:windowBackground">@color/qm_window_bg</item>')
           .replace(/(<style name="AppTheme\.NoActionBarLaunch"[^>]*>)/, '$1\n        <item name="windowSplashScreenBackground">@color/qm_window_bg</item>');
    fs.writeFileSync(stp, st);
  }
  console.log('Đã đặt màu nền cửa sổ theo Sáng/Tối');
}

const gp = path.join(app, 'build.gradle');
let g = fs.readFileSync(gp, 'utf8');
const vc = process.env.VERSION_CODE || '1', vn = process.env.VERSION_NAME || '1.0.0';
g = g.replace(/versionCode\s+\d+/, `versionCode ${vc}`).replace(/versionName\s+"[^"]*"/, `versionName "${vn}"`);
if (process.env.KEYSTORE_FILE) {
  g = g.replace(/buildTypes\s*\{/, `signingConfigs {
        release {
            storeFile file(System.getenv("KEYSTORE_FILE"))
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias System.getenv("KEY_ALIAS")
            keyPassword System.getenv("KEY_PASSWORD")
        }
    }
    buildTypes {`);
  g = g.replace(/(buildTypes\s*\{\s*release\s*\{)/, `$1\n            signingConfig signingConfigs.release`);
}
fs.writeFileSync(gp, g);
console.log('Đã patch Android: versionCode', vc, 'versionName', vn, 'ký:', !!process.env.KEYSTORE_FILE);
