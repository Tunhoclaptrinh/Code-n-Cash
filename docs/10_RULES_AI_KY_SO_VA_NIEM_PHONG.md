# 10 — Rules, AI, ký số và niêm phong độc lập

Rà theo mã nguồn ngày 23/10/2026. Tài liệu phân biệt phần đang chạy và phương án phát triển tiếp; các interface bên dưới là thiết kế đề xuất, chưa phải provider đã tích hợp. Nguồn nghiệp vụ vẫn là [đặc tả 04](04_DAC_TA_NGHIEP_VU.md).

## 1. Hiện trạng đã đối chiếu

| Thành phần | Đang thực hiện | Phần còn thiếu |
| --- | --- | --- |
| Quy tắc quyết định | Đọc `payment_rules.csv`, chọn phạm vi và xét 8 ưu tiên theo first-match | Chưa có giao diện soạn, duyệt và phát hành phiên bản rule |
| Tham số hợp đồng | Form nhận ân hạn, tỷ lệ/trần phạt, chính sách duyệt; tạo mốc và chạy Python bằng các giá trị đó | Chưa trích các giá trị từ nội dung PDF |
| Mẫu quy trình | Mốc đọc từ bảng `milestone-templates`, khởi tạo từ Data Pack | Chưa có quy trình phê duyệt phiên bản template cho hợp đồng mới |
| Số hoá | Dựng mốc theo loại hợp đồng; người dùng xác nhận ngày mơ hồ | Chưa OCR, NLP hoặc LLM; vị trí điều khoản minh hoạ |
| Ký | Đúng người, đúng lượt, bước cuối yêu cầu phương thức số; chữ ký cuối tạo `CONTRACT_SIGNED` | Provider và kết quả chữ ký đang mô phỏng; chưa ký mật mã lên PDF |
| Kiểm chữ ký | Đọc trạng thái chữ ký trong app; PDF ngoài chỉ dò cấu trúc rồi báo chưa xác minh | Chưa kiểm mật mã, trust chain, thu hồi hay dấu thời gian |
| Toàn vẹn | Hash chain, seal dữ liệu BTC/sự kiện app, chạy lại đối soát quyết định, so anchor nhập tay | Chưa niêm phong tới TSA hoặc blockchain độc lập |
| Chuyển kế toán | Ghi khoản bàn giao và khoá mốc, chống chuyển lần hai | Chưa kết nối ERP hoặc ngân hàng |

Mã cần đọc: [`drafts.ts`](../apps/api/src/domain/drafts.ts), [`factory.ts`](../apps/api/src/domain/factory.ts), [`templates.ts`](../apps/api/src/domain/templates.ts), [`engine.ts`](../apps/api/src/domain/engine.ts), [`signing.ts`](../apps/api/src/domain/signing.ts), [`audit-chain.ts`](../apps/api/src/common/audit-chain.ts), [`evaluator`](../tools/kiem_chung_nghiep_vu.py).

## 2. Rules có động không, có sinh từ hợp đồng không?

### 2.1. Đường dữ liệu thật

```text
Form hồ sơ: loại, giá trị, startDate, approvalPolicy, graceDays, penaltyRatePct, maxPenaltyPct
  → saveDraft kiểm quyền, chuẩn hoá và lưu ContractRecord + DraftRecord
  → stagesOf đọc mẫu mốc của loại hợp đồng
  → digitization dựng bản xem trước, cần người xác nhận hạn còn mơ hồ
  → confirmDigitization khoá điều khoản, gọi milestonesFor
  → mốc nhận due_date, required_event_types, approval quorum/roles, ân hạn và phạt
  → release_rule_code = rule_set_id + ':' + milestone_type
  → runEngine xuất dataset cho Python, tìm rules_by_scope và xét ưu tiên 10..80
  → lưu đánh giá, lịch sử và audit
```

`milestonesFor` lấy ân hạn từ hợp đồng cho các mốc; tỷ lệ và trần phạt chỉ được chép vào mốc có `latePenalty`, mốc khác nhận 0. Tiền là chuỗi thập phân và tính phân bổ bằng số nguyên; mốc cuối nhận phần dư để tổng khớp giá trị hợp đồng. Chính sách quyết định các vai trò phê duyệt, không lấy người bất kỳ cho đủ số lượng.

Engine đọc biểu thức điều kiện từ bảng rule và dùng AST giới hạn; không chạy mã tùy ý bằng `eval`. Phạm vi phải đủ các ưu tiên dự kiến. Bộ dữ liệu tải lên trang Data Pack có thể chứa rule riêng, được kiểm cấu trúc và chạy đánh giá tách khỏi dữ liệu nghiệp vụ sống.

Vì vậy cấu hình hiện tại **động theo tham số và bảng dữ liệu**, còn ngữ nghĩa thẩm quyền, trạng thái và biểu thức được giới hạn bởi đặc tả. Không phải hệ thống tự hiểu điều khoản tự do và tạo luật thanh toán mới. Tạo dòng “tham số” bất kỳ ở Quản trị không khiến engine tự sử dụng giá trị đó.

### 2.2. Muốn phát hành rule động cho production

Đề xuất một `RuleSetVersion` bất biến gồm ID, phiên bản, thời gian hiệu lực, hash bộ rule, template, schema và trạng thái `DRAFT → REVIEW → PUBLISHED → RETIRED`. Người soạn không tự duyệt bản của mình. Chạy lại 20 sample và bộ ca cạnh riêng trước phát hành; lưu so sánh quyết định, lý do và tiền giữa hai phiên bản.

Hợp đồng gắn phiên bản lúc xác nhận điều khoản. Sửa template không tự đổi hợp đồng đã khoá; thay đổi hợp đồng phải tạo bản sửa đổi có phê duyệt, không tính lại hồi tố rồi ghi đè lịch sử. API kiểm tổng tỷ lệ, thứ tự mốc, loại sự kiện/thẩm quyền, scope rule và biến biểu thức trước xuất bản. Chưa đưa màn soạn rule vào phạm vi lần nối tiếp này vì sẽ thay đổi cơ chế quản trị nghiệp vụ.

## 3. Áp dụng NLP/LLM ở bước nào?

Điểm phù hợp là **giữa tải tài liệu và xác nhận điều khoản**: OCR lấy văn bản và tọa độ trang; bộ trích xuất đề xuất giá trị, hạn, tỷ lệ, bên, điều kiện chứng từ; người dùng so văn bản gốc và xác nhận. Engine tiếp tục là nguồn quyết định và phép tính tiền.

### 3.1. Hợp đồng dữ liệu cho bộ trích xuất

Thiết kế đề xuất:

```ts
interface ExtractionProposal {
  documentId: string;
  documentSha256: string;
  extractor: { kind: 'TEMPLATE' | 'OCR_RULES' | 'LLM'; version: string };
  fields: Array<{
    path: string;
    value: string | null;
    evidence: { page: number; quote: string; bounds?: number[] } | null;
    state: 'SUGGESTED' | 'NEEDS_REVIEW';
  }>;
  warnings: string[];
}
```

Tách `extract(document)` khỏi `confirm(proposal, edits)`. Không tự biến xác suất model thành phê duyệt. Không tìm thấy nguồn thì trả `null`, không đoán. Trường hạn tương đối luôn cần người duyệt; quote và page phải kiểm lại với văn bản OCR. Đầu vào hợp đồng là dữ liệu, không phải chỉ dẫn cho công cụ hoặc model. Provider không có quyền gọi nghiệp vụ thanh toán.

### 3.2. Demo có thể làm tiếp bằng cùng ranh giới

1. Giữ bộ dựng template hiện tại làm fallback, gắn rõ nguồn `TEMPLATE` thay vì tuyên bố AI.
2. Thêm extractor quy tắc cho tập PDF demo có văn bản: tìm ngày, số tiền và tỷ lệ, trả vị trí nguồn và trường thiếu. PDF ảnh cần OCR riêng.
3. Thêm provider LLM sau khi thống nhất dịch vụ, quyền gửi tài liệu và cấu hình server; validate đầu ra bằng schema và ràng buộc nghiệp vụ.
4. Màn rà soát hiện song song bản gốc và đề xuất; lưu người xác nhận, sửa đổi, hash tài liệu và phiên bản extractor.

Đánh giá bằng bộ hợp đồng có nhãn riêng, đo đúng từng trường và độ khớp nguồn, không dùng KPI 20 sample thanh toán để tuyên bố chất lượng trích xuất. Những lỗi cần thử: tài liệu không ghi phạt, nhiều phụ lục mâu thuẫn, OCR nhầm dấu thập phân, thay tài liệu sau khi trích, ngày tương đối và timeout provider.

Giải thích quyết định hiện đã có facts, rule và replay. LLM có thể diễn đạt lại những facts này, nhưng phải trỏ lại nguồn và không được tạo quyết định hay tính số tiền thay engine.

## 4. Ký số thật: thay mô phỏng ở đâu?

### 4.1. Adapter server đề xuất

```ts
interface SigningProvider {
  begin(input: {
    requestId: string;
    signerUserId: string;
    documentVersion: string;
    digest: string;
    credentialId: string;
  }): Promise<{ providerRequestId: string; expiresAt: string }>;
  status(providerRequestId: string): Promise<{
    state: 'PENDING' | 'SIGNED' | 'DECLINED' | 'EXPIRED' | 'FAILED';
    artifactId?: string;
  }>;
}
```

Đây là interface ứng dụng đề xuất; payload thật cần theo tài liệu và tài khoản đối tác của từng nhà cung cấp. VNPT công bố các hướng tích hợp và Viettel MySign có tài liệu API/SDK; cần nhận môi trường thử và credential để triển khai provider thật. [VNPT SmartCA for Developers](https://doitac-smartca.vnpt.vn/help/docs/tai-lieu-tich-hop-ky-so/), [MySign API/SDK](https://mysign.com.vn/docs/model/sign-3rd-party/).

CSC cung cấp đặc tả giao thức ký từ xa để tham khảo thiết kế adapter; không suy rằng mọi endpoint VNPT/Viettel đều tương thích CSC. [Cloud Signature Consortium](https://cloudsignatureconsortium.org/resources/).

### 4.2. Luồng cần thực hiện khi nối provider

1. API kiểm người ký, tổ chức, lượt hiện tại và phiên bản tài liệu; tạo request với khoá chống lặp.
2. Chuẩn bị PDF và digest cho phiên bản đó, gửi yêu cầu ký. Người dùng xác nhận với provider; bí mật ký không lưu trong trình duyệt ứng dụng.
3. Poll hoặc nhận webhook có xác thực. Kiểm lại request, người ký, hash, phiên bản tài liệu, trạng thái chờ và hạn yêu cầu.
4. Lấy artifact, xác minh mật mã và lưu phiên bản đã ký bất biến. Với nhiều chữ ký PDF, bước sau phải ký bản đã có chữ ký trước theo incremental update thích hợp.
5. Chỉ khi bằng chứng ký đã xác minh mới gọi phần hoàn tất lượt, tạo audit và chuyển người tiếp theo. Webhook trùng không hoàn tất hai lần; callback cũ sau huỷ không được kích hoạt lại hợp đồng.

Không coi ảnh chữ ký, việc có `/ByteRange`, response HTTP 200 hoặc người dùng bấm “đã ký” là bằng chứng ký mật mã. PAdES xác định cấu trúc chữ ký PDF và các baseline; chọn thư viện hỗ trợ chuẩn rồi xây ca kiểm tệp thay đổi, chứng thư hết hạn/thu hồi và nhiều chữ ký. [ETSI EN 319 142-1](https://www.etsi.org/deliver/etsi_EN/319100_319199/31914201/01.02.01_60/en_31914201v010201p.pdf).

Đầu ra xác minh nên tách `cryptoValid`, `documentIntact`, `certificateTrusted`, `revocationStatus`, `timestampStatus` và kết luận `VALID | INVALID | INDETERMINATE`. Không gộp trường “chưa kiểm” thành “hợp lệ”. Mức tin cậy phụ thuộc trust store, dữ liệu thu hồi và thời điểm được xác minh.

### 4.3. Phương án demo trước khi có tài khoản CA

Giữ provider mô phỏng và ghi nhãn rõ. Bổ sung một kịch bản ký mật mã cục bộ bằng chứng thư thử để kiểm tài liệu bị sửa, nhưng đánh dấu chứng thư **không được tin cậy**; không trình bày như đã nối VNPT hoặc Viettel. Dùng cùng interface, trạng thái chờ/thành công/hết hạn và khoá chống lặp; sau này thay provider mà giữ luồng nghiệp vụ.

Hiện tại chưa thêm provider thật, chưa sinh chứng thư thử và chưa gửi tài liệu ra ngoài. Hướng dẫn trong app đã ghi rõ giới hạn chữ ký và số hoá để người demo không hiểu sai kết quả.

## 5. Blockchain hoặc TSA: chỉ neo dấu, giữ dữ liệu nghiệp vụ trong app

### 5.1. Gói niêm phong đề xuất

Tạo payload canonical có `schemaVersion`, định danh hệ thống/chuỗi, `sequence`, `headHash`, `snapshotHash`, `createdAt` và thuật toán. Các trường này ngăn nhầm dấu giữa môi trường, chuỗi và snapshot. Băm payload rồi gửi tới một nơi độc lập; lưu cả payload và biên nhận để xác minh lại.

`snapshotHash` phải gắn đúng snapshot và manifest tệp, không chỉ tên thư mục. Biên nhận neo ngoài cơ sở dữ liệu đang kiểm tra giúp phát hiện trường hợp người có quyền viết lại toàn bộ chuỗi.

### 5.2. Ba mức triển khai

| Mức | Cách demo | Điều chứng minh được |
| --- | --- | --- |
| Lưu độc lập | Xuất cặp seq/hash và manifest vào kho hoặc máy người kiểm soát riêng | So lần sau với dấu đã giữ; chưa có thời gian đáng tin cậy |
| TSA | Gửi digest tới dịch vụ RFC 3161 và kiểm token trả về | Có xác nhận của TSA về imprint và thời điểm theo chính sách tin cậy |
| Blockchain thử nghiệm | Ghi digest/payload hash lên mạng thử, lưu chainId, txHash, block và receipt | Đối chiếu dấu với bản ghi mạng thử; không chứng minh sự kiện kinh doanh là thật |

RFC 3161 mô tả yêu cầu dấu thời gian trên hash và kiểm phản hồi; adapter phải kiểm imprint, nonce, chữ ký và chứng thư TSA. Một chuỗi JSON tự ghi ngày giờ chưa phải token TSA. [RFC 3161](https://www.rfc-editor.org/rfc/rfc3161.html).

Với blockchain, chỉ ghi digest và định danh tối thiểu; không ghi PDF, email, tên hoặc số tiền lên chuỗi. Không phát hành token và không để smart contract chi tiền thay engine trong demo này. Bản đề xuất không phụ thuộc một mạng cụ thể; chọn môi trường và chính sách xác nhận khi triển khai.

Adapter neo nhận yêu cầu qua outbox sau giao dịch nghiệp vụ: `PENDING → SUBMITTED → CONFIRMED` hoặc `FAILED`. Nhà cung cấp ngừng đáp ứng không làm mất audit hoặc làm lại phê duyệt; thử lại phải chống lặp. Xác minh độc lập đọc receipt/token từ bên ngoài, so lại hash và chỉ công bố đã neo khi xác nhận hoàn tất.

### 5.3. Demo rõ ràng với hiện trạng

Trên môi trường thử riêng, lưu seq/hash ra ngoài, ghi thêm thao tác và kiểm lại mốc cũ: MATCH. Dùng bản sao dữ liệu, sửa một sự kiện: khối seal báo lỗi. Nếu viết lại được cả chuỗi, chỉ dấu độc lập mới giúp phát hiện thay lịch sử. Không dùng dữ liệu đang demo của người khác và không sửa trên môi trường thật.

## 6. Thứ tự làm tiếp và tiêu chí nghiệm thu

1. **Đang có:** hướng dẫn có ảnh và giới hạn rõ; rules/tham số đi xuống engine; workflow ký demo và toàn vẹn nội bộ.
2. **Ưu tiên kế tiếp:** provenance trích xuất + ca đánh giá trường; adapter ký với tài liệu bất biến và webhook chống lặp; xuất gói anchor độc lập.
3. **Khi có môi trường đối tác:** provider ký thử và xác minh artifact, TSA hoặc mạng thử, lưu receipt và kiểm lại độc lập.
4. **Trước vận hành:** phiên bản rule và duyệt cấu hình hai người, ca lỗi provider, backup/restore, trust store, kiểm tệp lớn, giám sát và chạy trên kho dữ liệu production đã kiểm thử.

Ca nghiệm thu bắt buộc cho phần phát triển tiếp: đổi tỷ lệ phạt tạo mốc đúng nhưng không đổi hợp đồng cũ; người khác vai trò không duyệt; tài liệu đổi sau yêu cầu ký thì yêu cầu cũ hết hiệu lực; callback trùng không sinh hai sự kiện; chữ ký PDF sai không kích hoạt hợp đồng; receipt sai hash bị từ chối; timeout provider không mất thao tác nghiệp vụ.
