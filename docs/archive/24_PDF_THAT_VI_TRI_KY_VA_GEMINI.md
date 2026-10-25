# PDF thật, vị trí ký và Gemini — 25/10/2026

## Hành vi đã triển khai

Mẫu DOCX chứa chủ thể, điều khoản, giá trị/ngày, bảng mốc và trang ký riêng. Bố cục chảy theo nội dung, không ép một điều một trang hoặc mặc định 14 trang. Có 1–4 người ký; mỗi trang ký bố trí tối đa hai người để tên dài và vùng trống dễ đọc. Font DejaVu Serif có sẵn trong cả hai image Linux. Tài liệu ghi rõ mẫu dùng thử, chưa ký.

Khi tải PDF/DOCX vào hợp đồng, backend chuyển DOCX bằng LibreOffice một lần, lưu PDF kết xuất, hash riêng và kích thước từng trang. Poppler đọc đường biên dòng chữ và render PNG của chính PDF đó. Web dùng ảnh trang làm nền đặt ô ký; vị trí lưu theo hệ tọa độ chuẩn hóa rộng 520 đơn vị, chiều cao theo tỉ lệ trang thực. Backend kiểm lại giới hạn, vùng chữ và va chạm giữa các người ký. Mẫu có dòng `VỊ TRÍ KÝ 01` để gợi ý đúng vùng trống; có anchor thì ưu tiên anchor trên mọi trang trước khi tìm khoảng trống. Người dùng luôn cần đối chiếu gợi ý.

Lưu vị trí yêu cầu hash tài liệu và phiên bản layout hiện tại. Thay tệp xóa vị trí cũ, đổi hash/version và buộc rà soát lại. Không được khóa tài liệu thật khi thiếu ô ký. Trước khi chọn phương thức, người ký có nút xem vị trí của mình trên PDF thật. Hồ sơ SEED cũ chưa có bytes hiển thị rõ trang minh họa; dữ liệu BTC không tự được gán tệp giả.

Với bản scan, chưa có OCR độc lập để xác định vùng chữ nên chỉ chặn biên trang và chồng ô, đồng thời yêu cầu kiểm thủ công. Văn bản trong PDF có text được nhận diện không đồng nghĩa mọi hình/biểu đồ đều được chặn. Người dùng cần xem cả trang trước khi lưu.

## Trích xuất Gemini

Backend hỗ trợ `EXTRACTION_PROVIDER=local|gemini`, `GEMINI_API_KEY`, `GEMINI_MODEL`. Provider Gemini gửi bản PDF thật, chỉ nhận JSON gồm sáu trường: giá trị triệu VND, ngày bắt đầu/kết thúc, ân hạn, phạt phần trăm/ngày và trần phạt. Giữ số thập phân là chuỗi; kiểm giới hạn, ngày, thứ tự ngày, schema và trang. Trường thiếu hoặc không có căn cứ để trống. Với PDF có text, quote phải tồn tại trên trang khai báo; scan ghi chưa kiểm chứng và cần đối chiếu.

Quyền người chuẩn bị hồ sơ và tổ chức được kiểm trước khi gửi Google. SHA-256 tệp gốc/PDF được kiểm trước khi dùng lại proposal. Network call nằm ngoài transaction; trước khi ghi kiểm lại draft version/hash. Proposal ghi model, phiên bản prompt, page/quote và usage. Người dùng sửa/xác nhận mới ghi điều khoản vào hợp đồng. Gemini không quyết định RELEASE/HOLD, không tính tiền, không sửa rule và không thay confidence_score nghiệp vụ của BTC.

Giới hạn hiện tại: 10 MB PDF, 40 trang, 60 giây/request, tối đa bốn request đang chạy trong một process, coalesce cùng job và dùng lại proposal đúng provider/model/hash/draft version. Đây chưa phải bộ giới hạn quota phân tán nhiều instance. Key chỉ ở server, redact trong audit; lỗi provider được ánh xạ sang mã lỗi an toàn. Không tự fallback sang local hoặc dữ liệu mẫu khi Google lỗi. Prompt coi tài liệu là dữ liệu, không cho mô hình công cụ thực thi/ghi dữ liệu.

## Kiểm chứng và giới hạn kết luận

- `pnpm check`: typecheck, lint không warning, format, build và 147 test đạt (77 Python, 70 Node).
- `tests/foundation/pdf-gemini.test.mjs`: PDF thực 1–4 người; số trang, anchor và vùng ký; chặn đè chữ/chồng ô/ngoài trang; kiểm quote sai trang, schema, giá trị, khoảng ngày, scan; provider lỗi, output chưa hoàn tất và request trùng.
- `pnpm test:gemini:live`: đã gọi `gemini-3.5-flash` trên bốn PDF mới; 24/24 trường đúng bộ đáp án tự tạo, tất cả quote kiểm được ở đúng trang. Mẫu có 3 trang cho 1–2 người và 4 trang cho 3–4 người; mẫu từ UI có thể dài hơn theo số mốc/nội dung.
- Báo cáo thực tế tại `artifacts/contract-samples/gemini-verification.json`, ghi usage và thời gian từng lượt. Có lượt Google trả lỗi tạm thời khi thử trước đó; UI phải cho thử lại, không suy ra độ sẵn sàng 100%.
- `scripts/real-contract-smoke.mjs`: kiểm API thực cho 1–4 người, bao gồm PNG trang ký, hash cũ bị từ chối, lưu tọa độ, trích xuất/xác nhận và khóa. Test workflow/trust tiếp tục kiểm ký tuần tự/hiệu lực và audit.
- Browser smoke: 36 kịch bản, kiểm bố cục và nút sáng/tối, desktop/mobile. Đã chụp lại 72 ảnh hướng dẫn và ảnh gốc, không thiếu khoanh vùng; ảnh đặt chữ ký dùng PDF thật. Gallery theo vai trò tại `playwright-report/guide/roles/index.html`.

24 giá trị trên mẫu sinh sẵn không đại diện độ chính xác trên hợp đồng tùy ý/scan. Gemini có thể hiểu sai dù quote có thật; bước người dùng đối chiếu/xác nhận vẫn bắt buộc. Chưa nghiệm thu riêng độ chính xác scan hay tập hợp đồng bên ngoài. Data Pack và engine vẫn chạy offline, không gửi Data Pack tới mô hình.

Bản ký hiện tạo/kiểm bằng chứng Ed25519 tách rời bằng khóa thử; VNPT/Viettel vẫn mô phỏng hoặc dùng signing bridge khi cấu hình. Chưa nhúng chữ ký PAdES/CA vào PDF và chưa tích hợp OCSP/CRL. Vùng ký thật và màn xem trước không tự trở thành chữ ký số được chứng thực.

## Chạy lại và triển khai

- `pnpm check`; chạy API file fixture sạch rồi `API_BASE_URL=... node scripts/real-contract-smoke.mjs`.
- `pnpm test:gemini:live` chỉ chạy khi chủ động; lấy cấu hình từ file local đã ignore hoặc biến môi trường. Không đưa key vào lệnh, log hay commit.
- Bốn mẫu PDF/DOCX và ZIP tại `artifacts/contract-samples`; tạo mẫu qua giao diện hoặc `pnpm samples:generate`. Artifact local không được commit.
- [Cập nhật biến trên Render, kho tệp và xác minh deploy](07_HUONG_DAN_TRIEN_KHAI.md#9-cập-nhật-render-và-bật-gemini).

Nguồn Google: [đọc PDF](https://ai.google.dev/gemini-api/docs/document-processing), [JSON Schema](https://ai.google.dev/gemini-api/docs/structured-output), [bảo vệ API key](https://ai.google.dev/gemini-api/docs/api-key#security-and-secret-management).
