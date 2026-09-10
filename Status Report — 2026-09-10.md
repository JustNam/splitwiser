# SplitWiser — Báo cáo tiến độ

**Ngày 10/09/2026 · Katie (Thoa Trần)**
Tiếp theo báo cáo ngày 08/09. Stack không đổi: Next.js + React (frontend), Supabase (database + auth).

---

## Đã làm

**Tiến độ chung:** xong **10/10 màn**. App đã đi được **trọn vòng**: đăng ký → tạo nhóm → chia link mời → người thứ 2 vào nhóm → ghi buổi → xem ai nợ ai → trả tiền → xem chi tiết → sửa buổi.

Tất cả đã chạy trên **dữ liệu thật** trong Supabase.

**Backend (Supabase)**
- Viết **6 function trong database** cho mọi thao tác ghi: tạo nhóm, vào nhóm, ghi buổi, trả tiền, sửa buổi, đổi mã mời.
- Lý do phải là function chứ không viết ở app: một buổi chơi phải ghi vào **4 bảng cùng lúc**. Ghi từ app thì lỗi giữa đường để lại dữ liệu dở dang, mà `ledger` không cho sửa/xóa nên không có cách dọn. Function trong database thì lỗi ở đâu cũng **hủy sạch cả 4**.
- **Sửa buổi không ghi đè số cũ** — nó thêm một dòng điều chỉnh mới. Số gốc, số đã sửa và ai sửa đều còn nguyên.
- Số tiền do app tính rồi gửi xuống, nhưng database **kiểm tra lại tổng** trước khi ghi. App chặn một lần, database chặn lần nữa.

**Frontend**
- **Ghi buổi:** ngày, số tiền, ai ứng trả, ai có mặt, thêm khách. Xem trước tiền mỗi người trước khi lưu.
- **Trả tiền:** tick từng khoản, mỗi khoản trả full, có bước xác nhận trước khi ghi.
- **Chi tiết buổi:** tiền từng người kèm trạng thái — chưa trả / đã trả / còn thiếu / **trả thừa**.
- **Sửa buổi:** chỉ nhập số đúng, app tự tính phần chênh. Có **cảnh báo** nếu việc sửa ảnh hưởng người đã trả tiền.
- **Trang nhóm:** xem thành viên, lấy lại mã mời, tạo mã mới, đăng xuất.
- Đổi nhóm ở thanh trên, và nhóm đang chọn được **dùng chung cho mọi màn**.

---

## Chưa làm

- **RLS (phân quyền dữ liệu) đang tắt** — em cố tình để vậy trong lúc dựng màn hình cho dễ debug. Phải bật trước khi có người thật dùng.
- Chưa chặn màn hình theo trạng thái đăng nhập (vẫn như báo cáo trước).
- Ghi buổi: mới làm **chia đều**. 4 cách chia còn lại đã xong phần tính toán, chưa gắn giao diện.
- Sửa buổi: chưa đổi được người ứng trả, và chưa xử lý buổi có nhiều dòng chi phí.
- Chưa đổi được tên nhóm.
- Chưa tạo được nhóm mới sau khi đã đăng nhập.
