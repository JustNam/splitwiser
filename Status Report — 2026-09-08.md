# SplitWiser — Báo cáo tiến độ

**Ngày 08/09/2026 · Katie (Thoa Trần)**
Dự án đã đổi tên từ **CourtTab** sang **SplitWiser**. Stack: Next.js + React (frontend), Supabase (database + auth).

---

## Đã làm

**Tiến độ chung:** xong **3/10 màn** — đăng nhập, đăng ký, Home. Màn "Ghi buổi mới" đã xong phần tính toán, chưa dựng giao diện.

**Backend (Supabase)**
- Đã setup Supabase và tạo đủ **7 bảng** theo database design.
- Đăng ký tài khoản → **tự động tạo profile** trong database.
- `ledger`: chỉ **thêm dữ liệu, không sửa/xóa** để đảm bảo lưu lịch sử điều chỉnh.

**Frontend**
- Đăng nhập/Đăng ký: kết nối Supabase Auth, có validation và error handling.
- Home: hiển thị số dư, phân biệt khách/thành viên và lịch sử các buổi chơi.
- Hiển thị khoản nợ bằng **text** thay vì `+/-` để tránh hiểu nhầm.
- Hoàn thành logic tính tiền cho **5 cách chia**.

---

## Chưa làm

- Chưa chặn màn hình theo trạng thái đăng nhập — ai cũng vào được mọi trang.
- Home vẫn đọc **dữ liệu giả**, chưa nối vào Supabase thật.

---

## Khó khăn

**Về năng lực tự code**
- Thành thật là hiện tại **em chưa tự code được** project này: ví dụ em không biết nên bắt đầu từ đâu và làm như thế nào
- Cách em đang tiếp cận: **nhờ Claude làm từng bước một**, yêu cầu giải thích vì sao theo thứ tự đó, để quan sát xem **một dev bình thường sẽ approach vấn đề thế nào**. Sau đó em đọc lại code, cố gắng hiểu và cố nối chúng lại với nhau.
- Em **chưa hiểu hết**, ví dụ được giải thích thì hiểu, nhưng tự viết lại từ đầu thì chưa làm được.
- Em được anh Nam nhắc về việc tự code, nhưng em đang thấy nó take time và em không đảm bảo được tự code thì sẽ có output để proceed tiếp với mọi người nên em vẫn đang cố gắng để hiểu code T.T

**Về thời gian**
- Tbh, em thấy có lỗi với 2 anh vì đã take time của 2 anh mà còn làm bài chậm quá
- Just sharing, trên công ty em đang handle nhiều feature cùng lúc, và những features đó cùng external project đang vào giai đoạn gần cuối nên workload tăng cao nên em không dành nhiều thời gian làm bài nhiều T.T

---

## Sắp tới

1. **Tạo nhóm** + **vào nhóm bằng mã mời**
2. Giao diện màn **ghi buổi mới** (phần tính toán đã xong).
3. Chi tiết buổi → trả tiền → sửa buổi.
4. Chặn màn hình theo đăng nhập, nối Home vào dữ liệu thật.
