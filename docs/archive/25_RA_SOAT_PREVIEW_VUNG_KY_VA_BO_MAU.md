# Rà soát preview, vùng ký và bộ mẫu — 25/10/2026

Thực hiện các điểm trong tài liệu đề xuất của đội, đồng thời sửa trường hợp ô ký mang tên người này nằm dưới tên người khác trên PDF. Các thay đổi này không sửa dữ liệu nguồn hay quy tắc quyết định của BTC.

## 1. Preview phản ánh thông tin đang nhập

Khung bên phải có hai tab: **Nội dung đang soạn** và **Tài liệu đã chọn**. Tab đầu sinh PDF thật từ các trường hợp lệ sau khi người dùng ngừng nhập; kết quả cũ không được ghi đè kết quả của lần sửa mới hơn. Tab sau hiển thị đúng tệp đã chọn. Chỉnh form không âm thầm thay bytes của tài liệu ký: phải bấm **Tạo và dùng hợp đồng mẫu** để chọn bản mới.

Khung preview cuộn riêng và giữ trong chiều cao màn hình. Trên điện thoại, thanh năm bước thu thành một hàng, chỉ hiện tên bước hiện tại.

## 2. Vùng ký phải đúng người, đúng trang

Nguyên nhân ảnh lỗi: trước đây gợi ý theo số thứ tự `VỊ TRÍ KÝ 01`, trong khi danh sách cấu hình có thể khác danh sách in trên PDF. Hình học hợp lệ chưa đủ để kết luận đúng người.

Với mẫu có marker, backend đọc tên và bên ký in cạnh marker từ PDF thực. Gợi ý tra theo **tên + bên ký** trên mọi trang, không chỉ theo số bước. Tọa độ được tính từ cùng PDF đang render. API kiểm lại khi lưu và khi khóa hồ sơ:

- Đủ đúng một ô cho mỗi bước; không vượt trang, đè chữ hoặc chồng ô khác.
- Danh sách tên/bên ký trên tài liệu phải khớp danh sách cấu hình.
- Ô nằm trong vùng ký đã nhận diện của đúng người; đặt sang vùng người khác bị từ chối.

UI nêu tên đang lệch và có nút sửa người ký/tài liệu. **Đến vùng ký** nhảy tới trang tương ứng; **Vừa trang** cân theo chiều cao khả dụng. Ô mặc định nhỏ hơn, nội dung gọn; danh sách bên phải cuộn để vẫn thấy kiểm tra và nút tiếp tục. Modal xem lại trước ký cũng giới hạn theo chiều cao màn hình.

PDF cũ có bytes/hash hợp lệ được bổ sung metadata layout khi khởi động, có audit và chống chạy trùng. Không đổi bytes, ô đã lưu hoặc bằng chứng ký; vị trí cũ sai phải được người dùng rà soát, không tự dời chữ ký đã có.

**Giới hạn nhận diện:** chỉ xác minh tên tự động khi đọc được marker và tên/bên ký của mẫu hỗ trợ. PDF tùy ý, ảnh scan hoặc bố cục khác vẫn cần kiểm bằng mắt; gợi ý khoảng trống không chứng minh danh tính, không phải OCR tổng quát. Nếu đổi người/thứ tự sau khi tạo mẫu, cần tạo lại và đối chiếu cả điều khoản thứ tự ký. Nhận diện vị trí theo tên không tự sửa điều khoản trong tệp.

## 3. Tải mẫu ngay trong Hướng dẫn

Mở **Hướng dẫn** ở màn tải/ký hoặc phần **Bắt đầu**: có bốn PDF chưa ký cho 1–4 người và ZIP gồm PDF, DOCX, manifest. File được phục vụ tĩnh cùng web, không cần gọi AI để tải.

Chọn nhà cung cấp **Phú Minh — S015**, thêm người lần lượt theo số người của mẫu:

| Thứ tự | Người ký | Tài khoản demo |
| --- | --- | --- |
| 1 | Nguyễn Văn An — bên mua | `owner@novaan.vn` |
| 2 | Vũ Thanh Hà — nhà cung cấp | `supplier@phuminh.vn` |
| 3 | Lê Quốc Dũng — bên mua | `finance@novaan.vn` |
| 4 | Trần Thị Mai — bên mua | `legal@novaan.vn` |

Đường dẫn: `apps/web/public/guide/samples/CodeCash-1-signers.pdf` đến `CodeCash-4-signers.pdf`; ZIP `CodeCash-PDF-1-4-nguoi-ky.zip`. Manifest ghi hash SHA-256, số trang, chủ thể và giá trị kiểm thử. Tạo lại bằng `pnpm samples:guide` khi sửa template; cần LibreOffice và Poppler.

Mẫu này kiểm thử tải lên, trích xuất, gán vị trí và luồng ký; chưa chứa chữ ký số chứng thực. Hệ thống vẫn dùng adapter/bằng chứng thử như mô tả ở [tài liệu 24](24_PDF_THAT_VI_TRI_KY_VA_GEMINI.md).

## 4. Tài khoản, vai trò và điều kiện thanh toán

Menu tài khoản demo tìm theo tên, email, công ty hoặc vai trò; tìm không dấu được. **Bùi Văn Khánh** thuộc **AlphaTech — S001**, email `supplier@alphatech.vn`; đây không phải Vũ Thanh Hà thuộc S015. Không tự thêm người của nhà cung cấp khác vào hợp đồng.

Màn ký và người tham gia phân biệt **vai trò hệ thống** với **chức danh**. Ví dụ Nguyễn Văn An có vai trò Chủ hợp đồng và chức danh Giám đốc dự án; hai thông tin này không mâu thuẫn. Nhãn nguồn tách vai trò/đơn vị trong Data Pack với danh tính demo do hệ thống bổ sung.

**CT0084:** đã ký đủ không đồng nghĩa mọi mốc được chi. MS0337 còn thiếu event `ACCEPTANCE` hợp lệ nên HOLD dù đã có hai phê duyệt. Ba mốc khác RELEASE. UI ghi rõ mốc đang chờ và chứng từ cần nộp; giữ nguyên logic BTC.

## 5. Kiểm chứng và cách chạy lại

- `pnpm check`: kiểm kiểu, lint, format, build và 148 test (77 Python, 71 Node).
- Test PDF thực 1–4 người kiểm tên/vùng ký; có trường hợp đổi thứ tự, người không có trong tệp, đặt nhầm vùng, thiếu người cấu hình, nâng metadata đồng thời và audit không ghi trùng.
- `WEB_URL=http://127.0.0.1:<port> node scripts/refinement-smoke.mjs`: kiểm nội dung PDF sau khi sửa form, hash bốn file tải, ZIP, gợi ý theo tên, API từ chối sai người, CT0084, tìm/đăng nhập tài khoản, hướng dẫn có cuộn và điện thoại. Chỉ chạy trên fixture file riêng vì script tạo/sửa hồ sơ demo.
- `scripts/browser-smoke.mjs`: đạt 36 màn/kịch bản, cả sáng/tối và desktop/mobile. Kiểm tra mobile tính cả bộ mẫu tải mới là nội dung hướng dẫn đầu trang, thay vì chỉ tìm tiêu đề Markdown nằm sau bộ mẫu.
- `scripts/real-contract-smoke.mjs`: API thực đạt cho cả 1–4 người ký, mỗi mẫu trích xuất đủ sáu trường bằng local; kiểm tải/chuyển PDF, render trang, hash cũ, lưu vị trí và khóa hồ sơ. Lượt này không gọi lại Gemini.
- `scripts/guide-screenshots.mjs`: chụp lại 72 ảnh, không thiếu khoanh vùng/không lỗi; kiểm tra riêng có thêm bảy ảnh và ảnh gốc. Hướng dẫn Việt/Anh đã bổ sung các bước và ảnh mới.

Báo cáo kiểm tra riêng ở `playwright-report/refinement/index.html`, dữ liệu `results.json`, ảnh gốc và ảnh khoanh vùng trong cùng thư mục. Bộ hướng dẫn đầy đủ có gallery ở `playwright-report/guide/index.html` và gallery vai trò ở `playwright-report/guide/roles/index.html`. Đây là bằng chứng chạy trên fixture cục bộ, không tự chứng minh Render đã triển khai bản mới hoặc độ chính xác trên hợp đồng tùy ý.
