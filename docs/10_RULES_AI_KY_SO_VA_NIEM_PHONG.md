# Quy tắc, trích xuất điều khoản, ký và niêm phong

Bản triển khai theo lựa chọn **demo cục bộ, có adapter nối dịch vụ thật sau**. Tài liệu này phân biệt chức năng chạy được với phần tích hợp chưa làm. Hướng dẫn trên ứng dụng có cả tiếng Việt và tiếng Anh; mở nút Hướng dẫn tại trang liên quan.

## 1. Trạng thái triển khai

| Hạng mục | Đã thực hiện trong demo | Chưa thực hiện |
| --- | --- | --- |
| Biểu mẫu | Placeholder và lỗi tại trường; bộ kiểm tra dùng chung API/web; ngày lịch hợp lệ, khoảng ngày, tiền tối đa hai chữ số thập phân, tỷ lệ, ngày ân hạn, email, mã và trường tham chiếu | Kiểm tra chữ nghĩa trong hợp đồng ngoài sáu trường trích xuất |
| Audit | Ghi nguyên tử với thay đổi; snapshot tên/vai trò; requestId/transactionId; trước/sau đã loại thông tin xác thực; đăng nhập/đăng xuất, lỗi HTTP, xem chi tiết, tải và yêu cầu xuất | Thu thập truy cập mạng/hệ điều hành; quan sát việc người dùng thực sự lưu/mở tệp trên máy |
| Phiên bản rule | DRAFT → REVIEW → PUBLISHED → RETIRED; editor biểu thức/mẫu; kiểm AST, 20 nhãn mẫu và 405 mốc; người thứ hai phát hành; hash; hợp đồng gắn phiên bản bất biến | Tập nhãn độc lập ngoài 20 mẫu; chính sách ngoại lệ khi chủ đích thay kết quả chuẩn |
| Trích xuất | Tải/lưu bytes PDF/DOCX, SHA-256; PDF có lớp chữ qua pdftotext, DOCX qua XML; sáu trường với đoạn nguồn/trang; người dùng xác nhận trước khi khoá | OCR ảnh scan, LLM ngoài hệ thống, bảng biểu phức tạp và phân tích pháp lý |
| Ký | Adapter ký cục bộ Ed25519; bằng chứng rời gắn hash bytes + điều khoản + thứ tự + người ký; chặn hết hạn, đổi tài liệu, lặp xác nhận; xuất/xác minh offline | Ký nhúng PDF/PAdES, CA thật, OCSP/CRL, HSM và webhook nhà cung cấp |
| Neo hash | Outbox bền PENDING/FAILED/CONFIRMED; idempotency key, thử lại; manifest snapshot; biên nhận ký được lưu ngoài records.json; xuất gói và kiểm offline | Blockchain/TSA ngoài máy, xác nhận giao dịch mạng, chứng thực thời gian độc lập |

Không công bố chính xác trên cả 405 mốc từ 20 nhãn. 405 là số mốc chạy kiểm tra cấu trúc/bất biến; 20 là số trường hợp có nhãn mẫu so được kết quả và tiền.

## 2. Form và tham số nghiệp vụ

Các giới hạn của hồ sơ hợp đồng: tên 1–250 ký tự sau trim; giá trị lớn hơn 0 và không quá 1.000.000 triệu VND; tối đa hai chữ số thập phân; ngày ISO có thật và bắt đầu không sau kết thúc; ân hạn nguyên 0–60; phạt mỗi ngày 0–5%; trần phạt 0–100%. Chấp nhận dấu phẩy thập phân rồi chuẩn hoá. Tiền dùng BigInt theo phần trăm triệu, không tính bằng float.

Bảng quản trị đọc quy tắc từ resources.json: mã chỉ chữ/số/gạch dưới/gạch nối, email đúng định dạng, độ dài và khoảng số theo loại trường; trường tham chiếu được kiểm lại trong API. Việc gõ đúng không thay thế kiểm quyền, phạm vi hay version khi lưu.

Hồ sơ đưa chính sách phê duyệt, quorum, ân hạn và phạt xuống các mốc thực sự. Dòng tham số tuỳ ý ở bảng quản trị vẫn không tự thay engine.

## 3. Phiên bản rule và mẫu mốc

Mở **Quản trị → Phiên bản quy tắc** bằng SYSTEM_ADMIN. Tạo tên và lý do; sửa biểu thức trong DSL cho phép và tỷ lệ/hạn/chứng từ/phạt của mẫu mốc. Tổng tỷ lệ mỗi workflow phải bằng 100%. Cấu trúc, mã, độ ưu tiên và phạm vi rule chuẩn không đổi qua editor này.

Lưu có optimistic version. **Kiểm thử và gửi duyệt** kiểm mọi nhánh biểu thức bằng AST allowlist, sau đó chạy evaluator chuẩn trên Data Pack nguyên bản và so 20 nhãn (decision, reason, payable, penalty). Không khớp hoặc vi phạm bất biến thì không sang REVIEW. REVIEW khoá nội dung. Một SYSTEM_ADMIN khác mới được phát hành; tài khoản tác giả không được tự duyệt. Có thể tạo tài khoản quản trị thứ hai ở Người dùng cho demo; không dùng kiểm soát viên thay vai quản trị.

Phát hành không sửa 128 rule gốc. Rule mới có namespace phiên bản; hồ sơ mới/lần lưu đầu của hồ sơ chưa gắn phiên bản nhận bản đang phát hành. Hồ sơ đã gắn bản cũ tiếp tục dùng bản đó, kể cả khi RETIRED. Hash nội dung được kiểm trước khi áp dụng; thay đổi cấu hình sau này không ngầm đổi hợp đồng cũ.

Nguồn: apps/api/src/trust/rules-service.ts, domain/rule-versions.ts, apps/engine/validate_rules.py. Ma trận quyền vẫn phải thay bằng review mã, không có editor bật/tắt quyền trực tiếp.

## 4. Trích xuất có nguồn và xác nhận

Tải hợp đồng lưu bytes vào DATA_DIR/uploads và gắn documentId/hash phía server. Tên tệp/metadata do trình duyệt gửi không đủ để chứng minh đã có tài liệu. Hồ sơ seed có thể chỉ có tên: màn hình ghi rõ dùng mẫu minh hoạ.

Tại rà soát, **Đọc điều khoản từ tệp** tạo proposal có documentId/hash, draftVersion, loại/phiên bản extractor, giá trị đề xuất, đoạn trích nguyên văn, trang và trạng thái cần rà soát. Các trường: giá trị triệu VND, ân hạn, phạt/ngày, trần phạt, ngày bắt đầu/kết thúc. Nhiều giá trị mâu thuẫn hoặc không đọc được thì để trống đề xuất, không tự đoán. DOCX được chuẩn hoá thành văn bản một trang; đây không phải số trang của bản Word được dàn trang.

Người dùng xem tệp gốc, sửa giá trị xác nhận và bấm **Xác nhận giá trị vào hồ sơ**. Audit giữ cả đề xuất và giá trị xác nhận, không ghi đè nguồn. Bản xác nhận gắn với revision hồ sơ sau khi áp dụng; sửa/tải lại hồ sơ phải trích xuất/rà soát lại. PDF scan hoặc thiếu pdftotext được báo rõ để nhập tay và xác nhận. Các mốc tiếp tục được dựng bằng mẫu quy trình; vị trí điều khoản trên bản preview minh hoạ không trở thành bằng chứng trích xuất thật.

TermExtractor và LocalTermExtractor là điểm thay provider; chưa có LLM/OCR. Khi nối dịch vụ thật vẫn phải giữ schema, nguồn, hash, kiểm giới hạn và bước xác nhận; provider không tự phê duyệt thanh toán hoặc sửa rule.

## 5. Ký cục bộ có bằng chứng mật mã

SigningProvider/LocalSigningProvider tạo Ed25519 detached proof. Payload gồm hợp đồng, request, bước/người ký, phương thức được chọn, hash tài liệu, hash điều khoản và vị trí/thứ tự ký, thời điểm do máy ghi, hash chữ ký trước. Khóa riêng lưu TRUST_DIR/keys, không xuất trong API, audit hoặc gói bằng chứng.

Yêu cầu có hạn 5 phút. Chỉ người được gán đang đến lượt được đọc/xác nhận request; request cũ bị huỷ khi gửi request mới. Xác nhận kiểm lại trạng thái, hạn và hash; lặp không tạo chữ ký/sự kiện lần hai. Chữ ký cuối tạo CONTRACT_SIGNED đúng bên mua. Bộ kiểm đối chiếu chữ ký với khóa cục bộ đã biết và hash hiện tại; chữ ký seed chỉ có trạng thái cũ hiển thị **Chưa xác minh**.

Mọi lựa chọn USB/SmartCA/MySign trong demo đều dùng adapter cục bộ. Đây không phải chữ ký PDF của CA. Bằng chứng bytes và điều khoản được phân biệt; hồ sơ seed không có bytes chỉ ký snapshot điều khoản. CertificateTrusted luôn false; thời gian máy không phải timestamp của TSA. Giao diện và hướng dẫn hiển thị giới hạn này.

Xuất JSON tại trang Kiểm tra chữ ký. Kiểm bên ngoài API:

```bash
node scripts/verify-trust.mjs signatures.json --document original.pdf
node scripts/verify-trust.mjs signatures.json --document original.pdf --fingerprint <SHA256_khoa_nguoi_ky>
```

Lặp --fingerprint cho từng người ký. Không truyền fingerprint chỉ kiểm đúng phép ký với khóa nhúng, kết quả CRYPTO_VALID_UNTRUSTED_KEY. VERIFIED_LOCAL_KEY chỉ có nghĩa khớp khóa cục bộ đã lưu độc lập, không có nghĩa CA/pháp lý. Chuỗi có chữ ký seed thiếu proof không được công cụ offline chứng nhận đầy đủ. PDF ngoài hệ thống vẫn chỉ kiểm cấu trúc và ghi chưa xác minh.

## 6. Nhật ký và neo hash

Audit ghi thêm trong cùng Repository.transact với dữ liệu nghiệp vụ. Một giao dịch có thể có dòng kỹ thuật và dòng hoạt động; dùng transactionId để liên kết, không đếm dòng thành số lần thanh toán. Dòng đầu chứa changes trước/sau, dòng liên quan dùng cùng mã giao dịch. Dữ liệu nhập khởi tạo lớn có summary/count/digest. Không ghi password/hash mật khẩu, token, OTP, khoá riêng; thất bại đăng nhập chỉ lưu hash email cùng loại lỗi.

Nhật ký hoạt động phục vụ phạm vi hợp đồng; chi tiết chỉ lấy thay đổi của chính hợp đồng đó. Nhật ký quản trị tại /platform/audit dành cho ba vai trò nội bộ, có cả auth/CRUD/lỗi. Lượt xem chi tiết, tải tệp và yêu cầu xuất được ghi; tải danh sách, notification poll, signing poll không thay trạng thái không tạo thêm log. Yêu cầu xuất từ trình duyệt là bản khai yêu cầu, không chứng minh file đã được lưu. Xem ma trận và ca kiểm ở tests/foundation/trust.test.mjs cùng scripts/smoke.mjs.

Chuỗi SHA-256 phát hiện chỉnh sửa, thiếu số thứ tự hoặc mất liên kết. Nó không tự chống người có thể sửa toàn DB và tính lại cả chuỗi. Blockchain phù hợp làm **nơi neo digest lịch sử**, không cần đưa toàn bộ audit hay dữ liệu cá nhân lên chuỗi.

Mở **Neo hash kiểm toán** hoặc cuối trang Toàn vẹn. Bấm tạo mốc: API chụp seq/head, genesis định danh hệ thống, manifest số dòng/hash từng bảng và snapshotHash; lưu job PENDING trước khi gọi adapter. LocalWitnessProvider ký biên nhận, lưu bản sao ở TRUST_DIR/receipts rồi mới CONFIRMED. Lỗi ghi FAILED; nút thử lại dùng cùng job/payload, không chạy lại nghiệp vụ. Sau restart, PENDING/FAILED còn trong danh sách để thử lại; chưa có worker tự retry theo lịch.

Tải gói JSON về nơi độc lập. Nhập lại để kiểm receipt, chữ ký, bản witness đã lưu, đúng hệ thống và chuỗi tại seq cũ. Snapshot hiện tại thay đổi hợp lệ có thể khác mốc chụp; màn hình báo riêng, không coi cập nhật hợp lệ là receipt sai.

```bash
node scripts/verify-trust.mjs audit-anchor.json --fingerprint <SHA256_khoa_witness>
node scripts/verify-trust.mjs audit-anchor.json --fingerprint <SHA256_khoa_witness> --records backup-records.json
```

Lệnh đầu kiểm chữ ký/manifest; thêm records mới kiểm được chuỗi trong bản sao và snapshot. Không có records thì chainMatched=null; không được suy rằng đã kiểm DB. Lưu fingerprint bằng kênh độc lập trước khi dùng. TRUST_DIR mặc định là DATA_DIR thêm hậu tố -trust, ngoài records.json; cùng máy/quyền quản trị vẫn cùng miền tin cậy. Bị chiếm cả khoá và receipt thì demo không tạo được bằng chứng độc lập. Adapter thật phải lưu/kiểm receipt từ TSA hoặc ledger ngoài hệ thống trước khi công bố CONFIRMED.

## 7. Chạy và kiểm thử

Cần Node 22+, Python 3, pnpm và pdftotext (gói poppler-utils; Dockerfile đã cài). DOCX dùng thư viện chuẩn Python. Có thể cấu hình TRUST_DIR để giữ key/receipt qua restart; sao lưu có kiểm soát cùng dữ liệu nhưng không đưa khoá riêng vào git hoặc gói xuất. .data-trust đã được ignore.

```bash
pnpm check
API_PORT=3219 DATA_DIR=/tmp/codecash-demo-review TRUST_DIR=/tmp/codecash-demo-witness pnpm start:api
VITE_API_PROXY=http://127.0.0.1:3219 pnpm --filter @codecash/web exec vite --host 127.0.0.1 --port 5291 --strictPort
API_BASE_URL=http://127.0.0.1:3219/api/v1 pnpm test:e2e
WEB_URL=http://127.0.0.1:5291 pnpm test:browser
```

Smoke thay đổi workflow; mỗi kịch bản phê duyệt/chụp hướng dẫn dùng DATA_DIR mới. Không chạy trên dữ liệu demo người khác. Ca kiểm gồm hết hạn/lặp/đổi bytes khi ký, proof giả, văn bản thiếu/mâu thuẫn, scope và audit redaction, rule độc hại ở nhánh không chạy, tự duyệt, giữ phiên bản cũ, receipt giả, chuỗi bị sửa, witness lỗi và retry idempotent.

## 8. Phần còn lại để nối thật

- LLM/OCR: adapter HTTP, schema và nguồn, đánh giá field-level trên tài liệu có nhãn, timeout và xử lý dữ liệu riêng tư.
- CA/PAdES: khóa tài liệu bất biến, signature artifact, chain/trust store, OCSP/CRL/TSA, webhook có xác thực/idempotency/expiry và ca lỗi đối tác.
- Blockchain/TSA: provider bên ngoài, digest-only payload, transaction receipt và độ sâu xác nhận, retry theo lịch, kiểm độc lập từ endpoint khác. Không có token hoặc smart contract chi tiền trong demo.
- Vận hành: kiểm thử Mongo replica set thực, worker nhiều instance, backup/restore khoá/receipt, xoay/thu hồi khoá, parser tài liệu lớn, quan sát tải và kết nối ERP thật. Phần này chưa được xác nhận chỉ từ kiểm thử file-storage cục bộ.
