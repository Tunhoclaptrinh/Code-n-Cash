# Đề xuất ứng dụng Gemini — 25/10/2026

Đây là **đề xuất ban đầu**, giữ lại để giải thích lựa chọn. Cập nhật 25/10/2026: ưu tiên 1 đã tích hợp và gọi Gemini thật, xem [24 — PDF thật, vị trí ký và Gemini](24_PDF_THAT_VI_TRI_KY_VA_GEMINI.md) để biết hành vi/kiểm thử hiện tại. Các mục “cần bổ sung/đề xuất” dưới đây mô tả thiết kế tại thời điểm đề xuất. Nguồn hiện trạng là mã backend/web trong repo; khả năng Gemini được đối chiếu tài liệu Google chính thức. Khi triển khai phải chọn model đang hỗ trợ PDF/structured output theo quyền truy cập của project, không cố định một model preview trong nghiệp vụ.

## Ưu tiên theo lợi ích thực tế

| Ưu tiên | Tính năng | Người dùng nhận được gì | Ràng buộc |
| --- | --- | --- | --- |
| 1 — nên làm trước | Đọc hợp đồng PDF và gợi ý điều khoản | Tổng giá trị, ngày, ân hạn, phạt/ngày, trần phạt; mỗi ô có trang và trích dẫn; hỗ trợ tài liệu diễn đạt khác mẫu hoặc scan | Đề xuất → đối chiếu PDF → chỉnh → xác nhận. Thiếu căn cứ để trống. |
| 2 | Tóm tắt chênh lệch và việc cần làm | Chỉ ra điều khoản trong PDF khác dữ liệu nhập, hạn nào cần xác nhận, chứng từ còn thiếu theo kết quả engine | Bám ID và facts đã được API cho phép đọc; không tự tạo event, approver hoặc quyết định. |
| 3 | Giải thích quyết định cho người dùng | Diễn giải vì sao HOLD/PENALTY từ rule, event, ngày và số tiền đã tính; dẫn chứng event ID | Kết quả chính hiển thị ngay từ engine; Gemini lỗi không làm mất quyết định. Không tính lại tiền bằng mô hình. |
| 4 — sau Đồng/Bạc | Soạn bản nháp điều kiện từ tiếng Việt | Gợi ý DSL từ yêu cầu, giải nghĩa biến, chỉ chỗ cấu hình cần xem lại | Qua validator kiểu/đơn vị → preview 405 mốc → cổng baseline → người thứ hai duyệt. Không tự phát hành. |

Tôi đề xuất triển khai **ưu tiên 1 rồi 2**. Luồng demo: tải một PDF khác bố cục mẫu → đọc điều khoản → thấy giá trị, trang, đoạn trích và ô chưa chắc → sửa/xác nhận → engine tạo/kiểm mốc. Đây là phần bổ sung hữu ích hơn một chatbot chung chung.

Gemini hỗ trợ đọc PDF bằng khả năng nhìn tài liệu, gồm văn bản/bảng/hình; output có thể theo JSON Schema. Đây là khả năng hỗ trợ trích xuất, không bảo đảm mọi giá trị đúng với hợp đồng. [Google: document understanding](https://ai.google.dev/gemini-api/docs/document-processing), [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output).

## Điểm nối với code hiện tại

- `apps/api/src/trust/extraction.ts`: hiện `TermExtractor.extract()` chạy đồng bộ, chỉ có loại TEXT_RULES. Cần chuyển giao diện extractor sang async và thêm provider Gemini; giữ parser local là chế độ rõ ràng.
- `extraction-service.ts`: hiện đã đọc bytes, kiểm SHA-256, chốt draft version, lưu proposal và kiểm lại khi xác nhận. Cần thêm timeout, cấu hình provider/model, kiểm output và metadata; không đưa network call dài vào transaction ghi dữ liệu.
- `ExtractionProposal` ở API và contracts phải bổ sung kind, model, prompt/schema version, trạng thái evidence và usage. Không chỉ thay endpoint rồi giữ schema cũ giả làm TEXT_RULES.
- `ExtractionPanel.tsx`: tái sử dụng bảng trường/đề xuất/trang/đoạn trích/giá trị xác nhận. Bổ sung trạng thái đang đọc, bị giới hạn quota, lỗi, cần đối chiếu; không chuyển thành màn chat để nhập điều khoản quan trọng.

Output đề nghị chỉ có sáu trường hiện dùng: `valueMillion`, `graceDays`, `penaltyRatePct`, `maxPenaltyPct`, `startDate`, `endDate`; mỗi trường có value hoặc null, page, quote và trạng thái. Tiền/phần trăm là chuỗi thập phân, ngày ISO; backend kiểm whitelist, giới hạn, ngày hợp lệ và cấu trúc. Không nhận số tiền đã tính hay quyết định thanh toán từ mô hình.

Với PDF có text, kiểm quote tồn tại trên trang tương ứng sau chuẩn hóa. Với bản scan chưa có OCR độc lập, quote do model đọc phải ghi **chưa kiểm chứng tự động**, người dùng đối chiếu ảnh trang; không tuyên bố đã kiểm nguồn chỉ vì model trả đúng JSON. Mâu thuẫn giữa các giá trị cần hiển thị để rà soát.

Cache/dedup theo tổ chức, document hash, draft version, provider, model, prompt/schema version. Cơ chế dedup cũ chỉ theo hồ sơ/hash/version cần mở rộng để tránh lấy proposal local cũ thay cho lượt Gemini mới. Kiểm lại quyền, hash và version trước khi lưu và trước khi xác nhận; không dùng cache xuyên tổ chức.

## Key, chi phí và vận hành

Đề xuất đọc `GEMINI_API_KEY`/`GEMINI_MODEL` tại backend khi adapter được triển khai; hiện các biến này chưa bật tính năng nào. Không đặt key trong `VITE_*`, bundle web, log hay Git. Backend là nơi gọi Google và kiểm quyền tài liệu. [Google: API key security](https://ai.google.dev/gemini-api/docs/api-key#security-and-secret-management).

Chạy bằng nút người dùng bấm, có timeout, giới hạn tệp/trang/token, giới hạn đồng thời theo tổ chức và lưu usage. Khi timeout/429/5xx hiển thị lỗi và cho thử lại; không đổi âm thầm sang dữ liệu mẫu. Cache giúp tránh trả phí lại cho cùng yêu cầu. Chọn ngưỡng và model sau khi đo trên bộ PDF mẫu, không chốt chi phí từ một key chưa kiểm quota.

Dữ liệu demo nên dùng hợp đồng giả lập đã sinh. Google phân biệt điều kiện dữ liệu của dịch vụ miễn phí và project bật billing; dịch vụ miễn phí có thể dùng input/output để cải thiện sản phẩm, dịch vụ trả phí có điều kiện khác. Trước khi gửi hợp đồng thật cần xác định project/tier và dữ liệu được phép gửi. [Google: Gemini API terms, mục dữ liệu](https://ai.google.dev/gemini-api/terms).

Tài liệu được xem là dữ liệu không tin cậy: nội dung trong PDF không được trở thành chỉ dẫn gọi tool, thay quyền, gửi tệp khác hay sửa rules. Adapter giai đoạn đầu chỉ sinh JSON đề xuất, không cấp công cụ ghi dữ liệu cho mô hình.

## Tiêu chí chấp nhận

1. Kiểm trên PDF/DOCX đã render 1–4 người ký, một PDF scan, tài liệu thiếu điều khoản, nhiều giá trị mâu thuẫn và file bị đổi trong lúc đọc.
2. Đo đúng từng trường, tỉ lệ để trống đúng khi thiếu, chất lượng quote/page, thời gian và usage; có bộ đáp án do đội tự rà tài liệu. Không tự gán tỉ lệ chính xác trước khi chạy.
3. Khóa cứng đường ghi: thiếu quyền, sai hash/version, output ngoài schema hoặc provider lỗi không sửa hồ sơ và không ghi nhận thành công.
4. Tắt Gemini vẫn dùng được app; Data Pack chính thức vẫn chạy offline, đủ 405 dòng/22 cột và giữ kết quả baseline. Confidence do AI tự báo không thay `confidence_score` nghiệp vụ.
5. Ghi rõ trong hồ sơ dự thi: AI hỗ trợ nhập/rà soát; rule engine, audit và phân quyền kiểm quyết định. Chỉ báo đã tích hợp khi đã gọi provider thật và có bằng chứng đo.
