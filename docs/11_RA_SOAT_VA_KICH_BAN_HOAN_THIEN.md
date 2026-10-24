# Rà soát hoàn thiện và kịch bản kiểm thử — 24/10/2026

Mục tiêu: có luồng thao tác xuyên suốt, dữ liệu thật trong phạm vi demo, giao diện dễ hiểu và bằng chứng kiểm thử. Không đánh đồng chữ ký demo với chứng thư CA, hoặc kết quả khớp 20 mẫu với độ chính xác trên toàn bộ 405 mốc.

## Các thay đổi trong đợt này

| Hạng mục | Hiện trạng sau sửa | Nơi thực hiện |
| --- | --- | --- |
| Thao tác trong bảng | Các bảng hợp đồng, công việc, tài nguyên, nhật ký, ngoại lệ, quyền, rule và dấu vết engine có nút icon + chữ; menu thao tác có nhãn. Nút là Button thực để dùng được bàn phím | `apps/web/src/features`; không đổi base UniFlow |
| Cột bảng | Cấp chiều rộng đọc được cho cột và thao tác; bảng nhiều cột cuộn bên trong, tránh ép tên hợp đồng thành từng từ hoặc đè nhãn trạng thái | Các trang danh sách |
| Một người ký | Cho phép 1–4 người; chọn mẫu nhanh một người và hiện cảnh báo rõ. Từ 2 người vẫn phải có cả hai bên. Cấm trùng người, sai tổ chức/vai trò và người ngừng hoạt động | `domain/drafts.ts`, form tải hợp đồng |
| Tệp mẫu | Tạo DOCX hợp lệ có điều khoản, giá trị, ngày, phạt, mốc và 1–4 người từ form. Tải xuống, sửa bằng trình soạn thảo rồi tải lên được | `POST /contract-samples`, `apps/engine/sample_contract.py` |
| Đồng bộ upload | Sau upload đọc lại metadata từ server; làm mới các truy vấn tài liệu/hồ sơ/audit. Panel bên phải cập nhật theo form đang sửa | Form và session query invalidation |
| Thông tin kiểm tra tệp | Không tự khẳng định đọc được nội dung hoặc không có chữ ký trước khi thực sự kiểm tra. Bản xem trước được ghi rõ là sơ đồ minh họa, số vùng ký theo người đang chọn | Các panel tải hợp đồng |
| Rule động | Đã có phiên bản, DSL giới hạn, kiểm thử hồi quy và người duyệt độc lập. Bổ sung chạy thử ứng viên chưa lưu, số mốc thay đổi, trước/sau và lệch mẫu | `POST /trust/rules/:id/preview` |
| Giới hạn HTTP | Bộ 128 rule vượt giới hạn JSON mặc định 100 KB. Đặt giới hạn hữu hạn 2 MB, trả 413 khi quá lớn và 400 cho JSON lỗi | `main.ts`, exception filter |

## Chuẩn bị tệp cho đội kiểm thử

Khởi động API, sau đó chạy:

```bash
pnpm samples:generate
# Nếu dùng API kiểm thử:
API_BASE_URL=http://127.0.0.1:3219/api/v1 pnpm samples:generate
# Bản tiếng Anh:
SAMPLE_LANGUAGE=en pnpm samples:generate
```

Kết quả trong `artifacts/contract-samples/`: bốn DOCX cho 1/2/3/4 người và `manifest.json` liệt kê điều khoản, tên, vai trò và thứ tự từng người. Thư mục artifacts không đưa vào Git. Script chỉ tạo/tải tệp, không lưu hoặc kích hoạt hợp đồng. Mặc định dùng tài khoản demo pháp chế; môi trường tắt đăng nhập demo truyền `SAMPLE_ACCESS_TOKEN` của người có quyền, không ghi token vào file hoặc Git.

Trong giao diện, pháp chế hoặc chủ hợp đồng mở **Tải hợp đồng**, nhập điều khoản, chọn người ký rồi bấm **Tạo và dùng hợp đồng mẫu**. Bấm **Tải tệp đang chọn** để lấy DOCX. Một người có nghĩa là chữ ký duy nhất hoàn tất quy trình ký được cấu hình; không có lượt ký ẩn của bên còn lại. Chữ ký hợp đồng không thay cho biểu quyết giải ngân.

## Kịch bản xuyên suốt cần trình diễn

1. **Pháp chế:** chọn loại hợp đồng và điều khoản; chọn 1, 2, 3 hoặc 4 người khác nhau. Dùng tệp vừa tạo hoặc tải DOCX đã sửa lên.
2. **Pháp chế:** lưu hồ sơ → gán vùng ký → trích điều khoản từ tệp. Kiểm tra bằng chứng nguồn, xác nhận các giá trị rồi phát hành. File có hash gắn với bản trích xuất; thay bytes sau đó phải bị phát hiện.
3. **Người ký:** đổi sang từng tài khoản đã chỉ định và ký đúng thứ tự. Người chưa đến lượt hoặc không được chỉ định phải bị từ chối. Lượt cuối bắt buộc ký số; hoàn tất mới tạo đúng một `CONTRACT_SIGNED` và có hiệu lực.
4. **Nhà cung cấp / người duyệt:** dùng CT0103 mốc 2 để nộp và phê duyệt theo hướng dẫn vai trò. Quyết định do Python tính, có reason code, rule và dấu vết. Không nhập tay quyết định vào bảng CRUD.
5. **Tổ kiểm soát / kiểm toán:** kiểm tra ngoại lệ, nhật ký, replay và toàn vẹn. Tài khoản quản trị hệ thống không được thay quyền xử lý ngoại lệ.

Dữ liệu demo thay đổi sau thao tác. Mỗi lượt chạy kiểm thử phá trạng thái phải dùng `DATA_DIR` riêng hoặc reset đúng môi trường kiểm thử; không reset kho demo của thành viên khác.

## Cách trình diễn rule động

1. Quản trị hệ thống tạo phiên bản với tên và lý do. Sửa công thức/điều kiện DSL hoặc mẫu mốc trong phạm vi được cho phép.
2. Bấm **Chạy thử tác động** trước khi lưu: xem số mốc được tính, số khớp mẫu, số vi phạm và các dòng trước/sau. Kết quả cũ ẩn khi tiếp tục chỉnh nội dung.
3. Mô phỏng tính trên Data Pack gốc; thay mẫu mốc chỉ ảnh hưởng việc sinh hợp đồng mới, không sửa ngược dữ liệu của 405 mốc đang kiểm tra. Bảng hiển thị tối đa 100 dòng thay đổi và vẫn báo tổng số.
4. Lưu bản nháp, gửi duyệt. API tự kiểm lại, chặn biểu thức ngoài DSL, lệch mẫu hồi quy hoặc vi phạm bất biến.
5. Một người có quyền khác phát hành. Demo mặc định chỉ có một quản trị hệ thống: cần tạo tài khoản `SYSTEM_ADMIN` thứ hai trong Quản trị → Người dùng để duyệt độc lập; không dùng cùng tài khoản để tự phát hành. Hợp đồng mới ghim phiên bản mới; hợp đồng cũ giữ phiên bản đã ghim, kể cả khi phiên bản ấy được thay thế.

Không có tính năng thực thi JavaScript/Python do người dùng nhập. Kết quả chạy thử không được lưu đè quyết định và không tự phát hành rule.

## Phạm vi đã thực tế và phần cần nối tiếp

- **Đã thực thi:** tệp DOCX hợp lệ, upload/download bytes, hash tài liệu, trích văn bản có bằng chứng nguồn, kiểm tra quyền trên server, thứ tự ký, proof Ed25519 của demo, lưu trạng thái, engine Decimal, phiên bản rule, mô phỏng tác động và audit hash chain.
- **Chưa phải tích hợp bên ngoài:** CA/PAdES/OCSP/TSA, chuyển khoản hoặc ERP thật, neo digest lên ledger độc lập, OCR/LLM bên ngoài. Không trình bày các mục này là đã kết nối thật.
- **Xem tài liệu:** vùng ký trong giao diện hiện là sơ đồ. Chưa render trang PDF/DOCX thực và chưa đóng dấu ký PAdES vào PDF. DOCX mẫu có các ngắt trang phục vụ kiểm thử; kết xuất cuối có thể phụ thuộc trình soạn thảo.
- **Ưu tiên tiếp theo:** render tài liệu bất biến và tọa độ vùng ký trên chính tệp đó; adapter CA có webhook/timeout/idempotency; backup/restore, kiểm thử Mongo replica set và vận hành nhiều instance. Các mục này cần đầu ra kiểm chứng riêng.

## Bằng chứng kiểm thử

`pnpm check` chạy typecheck, lint, định dạng, build, Python và các test nền tảng. Test trust bổ sung kiểm tra 1–4 người từ tạo DOCX đến trích xuất/ký/có hiệu lực; kiểm tra mô phỏng không ghi dữ liệu và từ chối DSL độc hại/phiên bản cũ. HTTP smoke bổ sung lưu/chạy thử bộ rule đầy đủ qua mạng, lỗi JSON và giới hạn tải. Browser smoke bổ sung chọn một người, tạo DOCX và chạy thử rule từ giao diện, ngoài các kịch bản nghiệp vụ/desktop/mobile đã có. Ảnh kiểm tra lưu trong `artifacts/browser/`.

Kết quả xác minh đợt này: `pnpm check` đạt (53 Python + 52 test nền tảng = 105), HTTP smoke đạt, browser smoke đạt 34 màn/kịch bản có desktop/mobile. Bốn tệp DOCX và manifest đã được tạo bằng API thật trong `artifacts/contract-samples/`. Dockerfile đã bổ sung script và template để tránh thiếu tệp lúc triển khai; chưa xác nhận build/chạy image Docker trong đợt này.
