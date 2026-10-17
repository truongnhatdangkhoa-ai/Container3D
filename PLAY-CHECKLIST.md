# Checklist đưa "Container 3D" lên Google Play

## Trước khi build
- [ ] `appId` là `com.container3d.app` (file `capacitor.config.template.json`). Phải duy nhất trên Google Play và **không đổi được sau khi đã đăng**. Nếu Play báo trùng, đổi ở đúng 1 chỗ này trước khi tải bản đầu tiên.
- [x] Email liên hệ trong `web/privacy.html` đã điền: truongnhatdangkhoa@gmail.com (bản tiếng Việt và English). Sau khi push lên `main`, workflow Pages sẽ đăng trang.
- [ ] Làm "Bước 1" (khóa ký), lưu 4 secrets, giữ `release.jks` an toàn.
- [ ] "Bước 2" → để **TẮT** ô "Tự cập nhật nội dung". versionCode tự tăng theo số lần chạy workflow.

## Đã xử lý trong code
- targetSdk/compileSdk 36 (script patch báo lỗi nếu thấp hơn).
- Không xin quyền camera/vị trí/bộ nhớ. Web nằm trong app, chạy offline, không gọi mạng.

## Play Console
- **Chính sách quyền riêng tư:** link `privacy.html`.
- **Data safety:** "Không thu thập dữ liệu", "Không chia sẻ dữ liệu".
- **Quảng cáo:** Không. **Đăng nhập:** Không. **Danh mục:** Công cụ hoặc Năng suất. **Đối tượng:** không nhắm đến trẻ em.
- **Hình ảnh:** icon 512×512 và ảnh bìa 1024×500 làm sẵn trong `play-assets/`. Ảnh chụp màn hình điện thoại: tối thiểu 2 ảnh — chụp trên máy thật sau khi cài APK (tab Nhập liệu, Xem 3D, Kết quả).
- **Tài khoản cá nhân mới tạo sau 11/2023:** kiểm thử kín ≥12 người trong 14 ngày liên tục trước khi xin lên bản chính thức.

## Song ngữ
App có Tiếng Việt và English (Lưu → Language). Trên Play Console, nếu muốn hiện cả hai thứ tiếng ở trang cửa hàng, thêm bản dịch "English (United States)" cho tên, mô tả ngắn/dài và ảnh chụp màn hình.

## Thử trước khi gửi (trên điện thoại thật)
- Bấm "Ví dụ mẫu" → "Tính": khung 3D xoay/zoom được, chạm vào thùng hiện chi tiết.
- "Lưu phương án" → thoát app hẳn → mở lại → "Phương án đã lưu" còn đủ.
- "Xuất Excel", "Lưu ảnh 3D" mở được hộp thoại Chia sẻ.
