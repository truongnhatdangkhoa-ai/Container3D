# Container 3D — App Android (APK + AAB) build bằng GitHub

Mô phỏng xếp hàng vào container lạnh 20'/40' (three.js). Giao diện điện thoại: 3 tab **Nhập liệu · Xem 3D · Kết quả**, nút **Tính** ở giữa, nút **Lưu** mở bảng chức năng (lưu / mở phương án, xuất Excel, lưu ảnh 3D, đổi Sáng/Tối). Nút Back của Android đóng hộp thoại/bảng trước khi thoát.

## Thiết lập 1 lần
1. Tạo repo mới trên GitHub, upload toàn bộ thư mục này (giữ nguyên `.github/`), nhánh `main`.
2. **Settings → Pages → Source: GitHub Actions**, rồi chạy workflow "Cập nhật nội dung app" (để có trang chính sách: `https://<tên-github>.github.io/<tên-repo>/privacy.html`).
3. **Actions → "Bước 1: Tạo khóa ký app" → Run workflow.** Tải artifact `khoa-ky-app-GIU-BI-MAT`, vào **Settings → Secrets and variables → Actions** tạo 4 secret: `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_PASSWORD`, `KEY_ALIAS` (xem secrets.txt). **Lưu `release.jks` ở nơi an toàn** — mất khóa thì không cập nhật được app trên Google Play.
4. **Actions → "Bước 2: Build APK + AAB" → Run workflow** (để TẮT "Tự cập nhật nội dung"). Tải `Container3D.apk` (cài thẳng) và `Container3D.aab` (đưa lên Google Play) ở mục Artifacts.

Thư viện three.js / OrbitControls / SheetJS được workflow tự chép từ npm vào `web/lib/` (`scripts/copy-libs.js`); không cần tải tay.

## Song ngữ Việt / English
Nút **Lưu → Language / Ngôn ngữ** đổi Tiếng Việt / English (mặc định theo ngôn ngữ điện thoại, nhớ lại lần sau). Mã nguồn viết tiếng Việt; `web/js/i18n.js` dịch chữ hiển thị, thông báo và tiêu đề cột khi xuất Excel (dữ liệu bạn nhập không bị dịch). Thêm chữ mới: thêm 1 dòng vào từ điển `D` trong `i18n.js`. Trang chính sách quyền riêng tư cũng có cả hai thứ tiếng.

## Đổi icon
Thay `assets/icon-only.png`, `icon-foreground.png`, `icon-background.png` (1024×1024) và `assets/splash*.png`, rồi chạy lại Bước 2. Logo gốc dạng vector: `brand/logo-container-3d.svg`. Logo/icon do mình vẽ mới hoàn toàn (không dùng ảnh hay logo của bên thứ ba).

## Dữ liệu
Lưu trong IndexedDB của app (`web/js/shim.js` thay cho cơ sở dữ liệu của bản PC). Gỡ app / xóa dữ liệu ứng dụng sẽ mất phương án đã lưu.

Xem `PLAY-CHECKLIST.md` để đưa app lên Google Play.
