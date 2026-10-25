# Mẫu hợp đồng động và luồng tài liệu thực

Cập nhật mới hơn: [24 — PDF thật, vị trí ký và Gemini](24_PDF_THAT_VI_TRI_KY_VA_GEMINI.md); ảnh nền và tọa độ ký hiện lấy từ PDF thật khi hồ sơ có tệp đã tải lên.


## Đường đi của hồ sơ

1. `SYSTEM_ADMIN` mở **Quản trị → Mẫu hợp đồng**. Thêm/sửa/xóa, bật/tắt mẫu; tìm kiếm, phân trang, nhập/xuất dùng CRUD base. Cấu hình loại hợp đồng, chính sách phê duyệt, giá trị, phạt, thứ tự 1–4 vai trò ký và nội dung riêng. Với nhiều người ký phải có hai bên. Mẫu không gán cứng người ký hay tổ chức.
2. Cán bộ/chủ hợp đồng mở **Tải hợp đồng lên**, chọn mẫu từ Select rồi chỉnh điều khoản, người ký, nội dung theo hồ sơ. Có thể bỏ chọn mẫu và giữ các trường đã điền. Chọn lại mẫu đang dùng sẽ áp dụng phiên bản đang hoạt động.
3. **Tạo hợp đồng mẫu** tạo bytes DOCX thật từ dữ liệu đã nhập. Nội dung tùy chỉnh được chèn vào phần phạm vi/điều khoản của mẫu nền; đây chưa phải trình soạn thảo toàn bộ bố cục Word. Có thể thay bằng PDF/DOCX soạn bên ngoài. Sửa trường đã dùng để sinh DOCX thì phải tạo lại hoặc tải tệp thay thế trước khi tiếp tục.
4. Xem PDF thật: PDF mở trực tiếp, DOCX kết xuất qua LibreOffice. Khi lưu, tệp gốc được lưu bền vững kèm SHA-256, gắn hồ sơ và ghi audit. PDF xem trước không thay thế tệp gốc.
5. Rà soát dữ liệu trích xuất và xác nhận; hợp đồng mới không được phát hành chỉ bằng metadata tên tệp. Khóa điều khoản tạo mốc thực, phân lượt ký thực và khóa sửa dữ liệu. Tài liệu gốc có thể xem ở bước rà soát, trình tự ký, màn ký và chi tiết hợp đồng. Tệp đang dùng được xếp trước các bản tải cũ; tải tệp gốc và bản PDF xem trước là hai thao tác riêng.
6. Ký đúng người, đúng lượt. Bằng chứng gắn với hash bytes gốc, snapshot điều khoản, danh sách/vị trí ký và hash chữ ký trước. Chữ ký cuối kích hoạt hợp đồng. Thay bytes hoặc điều khoản làm bằng chứng không hợp lệ.

Không tự thêm OCR hay kết luận pháp lý: extractor hiện đọc text PDF/DOCX theo quy tắc, không đọc được mọi bản scan. Người dùng phải đối chiếu và xác nhận. Canvas đặt vị trí ký hiện là sơ đồ quy ước; chưa phải tọa độ PAdES trên từng trang PDF. Ảnh chữ ký không được dùng thay bằng chứng số. Dữ liệu nguồn Data Pack/SEED vẫn được ghi nhãn.

## Phiên bản và phân quyền mẫu

- Các mẫu mặc định được nạp **một lần** qua marker migration riêng. Xóa hết mẫu rồi khởi động lại không tự sinh lại. Có thể thêm mẫu mới bất kỳ, không phụ thuộc danh sách ID trong frontend.
- Draft giữ `templateId`, `templateVersion`, `templateSnapshot` do server xác lập. Snapshot chứa tên/nội dung gốc; điều khoản và nội dung tùy chỉnh được lưu riêng trên draft. Sửa/xóa/tắt mẫu không sửa hồ sơ đã lưu.
- Đang chọn phiên bản cũ chưa được lưu mà quản trị đã cập nhật: server từ chối `VERSION_CONFLICT`. Mở lại/chọn lại mẫu rồi rà soát. Không tin snapshot do client gửi.
- Quản trị hệ thống được CRUD/import/export mẫu. Chủ hợp đồng/cán bộ hợp đồng được đọc để áp dụng. Kiểm toán đọc/xuất; controller ngoại lệ không có quyền quản trị mẫu. Quyền nghiệp vụ, phạm vi tổ chức, SoD và engine Data Pack giữ nguyên.
- CRUD có kiểm tra kiểu/trường, giới hạn tiền theo số thập phân chính xác, thứ tự vai trò, optimistic version và audit. Xóa mẫu là xóa khỏi danh mục; snapshot trong hồ sơ không bị xóa.

## Nội dung mẫu

Nội dung là văn bản thuần, tối đa 20.000 ký tự, không chạy biểu thức/code/HTML. Khi tạo DOCX, các biến sau được thay bằng dữ liệu hồ sơ:

`{{title}}`, `{{code}}`, `{{buyer}}`, `{{supplier}}`, `{{valueMillion}}`, `{{startDate}}`, `{{endDate}}`, `{{graceDays}}`, `{{penaltyRatePct}}`, `{{maxPenaltyPct}}`.

Ví dụ:

```text
Bên {{supplier}} cung cấp dịch vụ theo {{title}} cho {{buyer}}.
Giá trị {{valueMillion}} triệu VND. Thực hiện từ {{startDate}} đến {{endDate}}.
Điều kiện bổ sung: bàn giao tài liệu vận hành và tổ chức một buổi hướng dẫn.
```

Các biến ngoài danh sách được giữ nguyên để người soạn phát hiện, không tự suy ra dữ liệu. Phụ lục PDF/DOCX được tải bytes thật khi lưu, tối đa 20 tệp × 20 MB; có thể bỏ khỏi hồ sơ khi còn nháp. Danh sách/hash phụ lục hiện hành được gắn vào bằng chứng ký, kiểm toàn vẹn khi ký/xác minh. Tệp đã bỏ khỏi hồ sơ vẫn giữ lịch sử tải trong kho, không bị xóa vật lý.

## Adapter ký và điểm tích hợp

Mặc định `SIGNING_PROVIDER=local`: xác nhận phương thức VNPT/Viettel/USB là mô phỏng; Ed25519 và kiểm tra hash là mật mã thật với khóa thử cục bộ. Không có chứng thư CA, OCSP/CRL, TSA hay PDF PAdES.

Đã có adapter HTTP đồng bộ với xác thực token, timeout 10 giây, khóa xác minh được pin và không fallback sang local khi dịch vụ lỗi:

```dotenv
SIGNING_PROVIDER=http
SIGNING_URL=https://your-signing-bridge.example/sign
SIGNING_API_TOKEN=your-server-side-token
SIGNING_KEY_FINGERPRINT=64_hex_characters_sha256_of_public_key_pem
```

Backend gọi POST đến URL cấu hình; header `Authorization: Bearer ...`, `Idempotency-Key` bằng SHA-256 canonical `{subject,payload}`. Request:

```json
{"schema":"codecash.detached-signature.v1","subject":"signer:USER_ID","payload":{"kind":"CONTRACT_SIGNATURE","contractCode":"CT...","requestId":"...","stepNo":1,"signerUserId":"...","documentDigest":"...","termsDigest":"...","signedAt":"...","previousSignatureHash":null,"certificateTrusted":false}}
```

Payload thực còn có `declaredMethod` và `basis`. Bridge trả bằng chứng detached Ed25519 theo `LocalProof`: `provider: "LOCAL_ED25519"` mô tả định dạng mật mã, `payload` giữ nguyên, `publicKey` PEM SPKI, `keyFingerprint` SHA-256 PEM, `signature` base64. Ký canonical JSON của payload theo `apps/api/src/common/audit-chain.ts`. API so khớp toàn bộ payload và fingerprint đã cấu hình rồi mới kiểm chữ ký. Không tin khóa do response tự công bố. Màn ký HTTP dùng nút gửi đến dịch vụ; không tự xác nhận theo bộ đếm demo. Nguồn bằng chứng được ghi trên từng bước; bằng chứng local cũ vẫn kiểm bằng khóa local khi đổi provider.

Đây là **hợp đồng tích hợp bridge đã có mã chạy và kiểm thử**, chưa là kết nối trực tiếp VNPT/Viettel. Muốn dùng CA thực cần adapter theo API của nhà cung cấp, xác thực người ký/chứng thư, signed artifact, kiểm PAdES/chuỗi chứng thư/thu hồi, callback có xác thực và outbox/reconciliation cho yêu cầu bất đồng bộ. HTTP bridge hiện gọi trong transaction workflow; khi timeout/mất commit có rủi ro dịch vụ đã ký nhưng ứng dụng chưa ghi nhận. Idempotency hiện gắn payload (có thời điểm ký), chưa bảo đảm đúng một lần qua mọi lần retry. Không bật HTTP với nhà cung cấp chưa đáp ứng protocol rồi kỳ vọng tương thích tự động.

## Kiểm chứng

- Foundation tests kiểm CRUD/quyền/validation mẫu, pin phiên bản và tồn tại snapshot sau xóa; audit và không reseed.
- Bộ kiểm thử tài liệu thật tạo DOCX 1–4 người ký, thay biến/nội dung đặc biệt an toàn, upload, trích xuất, rà soát, ký tuần tự, kích hoạt; kiểm PDF kết xuất từ bytes thật.
- Bridge tests kiểm payload bị đổi, khóa không tin cậy, HTTP lỗi và mất mạng đều từ chối; cấu hình không hợp lệ không fallback.
- `pnpm check`, `pnpm test:e2e`, `pnpm test:browser`; ảnh hướng dẫn sinh bằng `pnpm guide:screenshots` trên dữ liệu thử riêng. Không chạy script có thay đổi nghiệp vụ vào dữ liệu người dùng.

Kết quả lần kiểm tra này: `pnpm check` đạt 107 test; browser smoke đạt 34 màn/kịch bản cùng hai ngôn ngữ hướng dẫn, có thêm kiểm tra sửa mẫu quản trị → danh mục hồ sơ và chặn tệp cũ sau sửa nội dung. Bộ hướng dẫn có 64 ảnh, không thiếu khoanh vùng hay bước lỗi. Báo cáo: `playwright-report/guide/index.html` và `playwright-report/guide/roles/index.html`; manifest ở `apps/web/public/guide/images/manifest.json`. Bốn tệp thử DOCX ở `artifacts/contract-samples/CodeCash-{1,2,3,4}-signers.docx`. Bản chạy thử riêng: web 5300 → API 3230, dữ liệu trong `/tmp/codecash-dynamic-templates-guide-final`, không thay dữ liệu của môi trường mặc định.

Cập nhật sau rà soát BTC: form tạo mới trống, có một nút điền mẫu toàn bộ form; không đè phần đã nhập và không tự lưu/gửi. Mở bản nháp bằng `?draft=CODE` giữ dữ liệu đã lưu. Rule động phải vượt cổng toàn pack và tách profile bài nộp/workflow; xem tài liệu 14–16 để dùng số liệu kiểm chứng hiện tại, thay cho số đếm kiểm thử lịch sử phía trên.

## Tải bộ PDF mẫu

`pnpm samples:generate` xuất cả DOCX và PDF từ cùng bytes tài liệu, qua endpoint preview thật. Dùng API test `STORAGE_DRIVER=file`, đặt `API_BASE_URL` nếu khác cổng; không tự lưu/kích hoạt hợp đồng. Bộ hiện tại ở `artifacts/contract-samples`: [PDF 1 người](../artifacts/contract-samples/CodeCash-1-signers.pdf), [2 người](../artifacts/contract-samples/CodeCash-2-signers.pdf), [3 người](../artifacts/contract-samples/CodeCash-3-signers.pdf), [4 người](../artifacts/contract-samples/CodeCash-4-signers.pdf). [ZIP tải cả bốn PDF](../artifacts/contract-samples/CodeCash-PDF-1-4-nguoi-ky.zip) và manifest cho biết thứ tự/tên người ký. Tệp chưa ký, dùng để upload và kiểm thử.
