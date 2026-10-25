# Lược bớt thông tin kỹ thuật trên UI — 25/10/2026

Thực hiện theo plan đã duyệt sau góp ý trong "Đề xuất chỉnh sửa web" (CT0084, CT0105, Nguyễn Văn An có hai vai trò). Mục tiêu: màn hình của người dùng nghiệp vụ chỉ còn ngôn ngữ nghiệp vụ, **vẫn giữ các mã BTC cần để chấm và theo dõi**. Chỉ đổi phần hiển thị: API, dữ liệu, logic ký số và xác minh chữ ký không đổi.

## 1. Nguyên tắc ba mức

Mã được giữ lấy theo các cột BTC chấm trong `submission_output_template.csv`: `contract_id`, `milestone_id`, `predicted_decision`, `reason_code`, `evidence_event_ids`, `rule_id_applied`.

| Mức | Hiển thị | Gồm | Thành phần |
| --- | --- | --- | --- |
| A. Mã theo dõi (giữ) | Chữ nhỏ màu xám, có nút copy, đặt cạnh nội dung tiếng Việt | Mã hợp đồng CT…, mốc MS…, sự kiện EV…, luật PR…, mã lý do (`MISSING_REQUIRED_EVENT`…), quyết định RELEASE/HOLD/PENALTY/REJECT | `TrackingCode` |
| A'. Nhãn nguồn cấp hợp đồng (giữ) | Một nhãn "Dữ liệu BTC / Bổ sung / Tạo trong app" | Đầu trang hợp đồng/mốc; cột và bộ lọc ở danh sách hợp đồng | `OriginTag` |
| B. Chi tiết kỹ thuật (thu gọn) | Mục "Chi tiết kỹ thuật" đóng sẵn, hoặc dấu "+" mở rộng từng dòng bảng | Nguồn dữ liệu từng dòng, mã tài liệu (CTR-/APR-/DN-…), kênh ghi nhận (API/PORTAL/WORKFLOW_ENGINE), mã bên, lượt đánh giá (run id, phiên bản đặc tả, độ tin cậy), mã quy trình/bộ quy tắc, mã khoá và đối tượng được ký | `TechnicalDetails`, `TechnicalList` |
| C. Bỏ khỏi màn nghiệp vụ | Không hiển thị | Mã bên trong dòng chữ (A028/B010/S018), tên party tiếng Anh ("Contract Owner - Nova An Business JSC"), khối "Môi trường · v0.1.0", nhãn "Danh tính demo", phiên bản mẫu "· v1", từ engine/Data Pack/event/schema/Ed25519/snapshot trong câu chữ | — |

Không đổi: Nhật ký hoạt động, Toàn vẹn dữ liệu, Hàng đợi ngoại lệ, Phiên bản luật, Kết quả Data Pack, Quản trị/Phân quyền. Đây là màn của kiểm soát/kiểm toán/quản trị và giữ đầy đủ mã, hash.

## 2. Thành phần dùng chung mới

| Tệp | Thành phần | Mục đích |
| --- | --- | --- |
| `apps/web/src/shared/ui/TechnicalInfo.tsx` | `TrackingCode` | Mã mức A: chữ mono nhỏ, màu phụ, copy được, `data-testid="tracking-code"` |
| `apps/web/src/shared/ui/TechnicalInfo.tsx` | `TechnicalList` | Danh sách nhãn/giá trị kỹ thuật, bỏ qua trường rỗng; rộng tối đa 560 px để dòng mở rộng không kéo giãn bảng |
| `apps/web/src/shared/ui/TechnicalInfo.tsx` | `TechnicalDetails` | `TechnicalList` trong mục thu gọn "Chi tiết kỹ thuật" |
| `apps/web/src/shared/auth/useDemoMode.ts` | `useDemoMode()` | `true` khi API bật đăng nhập demo; dùng để chỉ hiện email người tham gia trong bản demo |
| `apps/web/src/shared/lib/domain.ts` | `contractTitle`, `contractHeading` | Bỏ hậu tố "- CT0084" lặp mã trong tiêu đề Data Pack: "CT0084 · Cung cấp thiết bị hội nghị" |
| `apps/web/src/shared/lib/domain.ts` | `actorName`, `peopleOf` | Người ghi nhận sự kiện: với bên phê duyệt hiện tên người (nếu biết) hoặc tên vai trò, thay cho tên party tiếng Anh |

## 3. Thay đổi theo từng màn

| Màn / thành phần | Vị trí | Trước | Sau | Mức |
| --- | --- | --- | --- | --- |
| Khung ứng dụng (`AppLayout`) | Chân thanh bên | "MÔI TRƯỜNG · Bản demo: dữ liệu mẫu, luồng ký mô phỏng · v0.1.0 · tổ chức" | "ĐƠN VỊ · tên tổ chức"; ẩn khi thu gọn thanh bên | C |
| Đăng nhập (`LoginPage`) | Menu tài khoản demo | Dòng tài khoản "email · S015"; nhóm "S001 · AlphaTech…"; "Tất cả tổ chức trong Data Pack" | "email · tên tổ chức"; nhóm theo tên tổ chức; "Tất cả tổ chức". Vẫn tìm được bằng mã bên | C |
| Đăng nhập | Gợi ý demo | Nhắc "dữ liệu bổ sung", "Data Pack" | Chỉ hướng dẫn chọn "Tài khoản demo" | C |
| Danh sách hợp đồng | Câu giới thiệu | "Data Pack của BTC… quyết định của engine… đặc tả mục 9.3" | "100 hợp đồng mẫu của Ban tổ chức… kết quả đánh giá từng mốc thanh toán" | C |
| Danh sách hợp đồng | Cột/bộ lọc nguồn | Có | Giữ nguyên | A' |
| Chi tiết hợp đồng | Breadcrumb | "CT0084 · Cung cấp thiết bị hội nghị - CT0084" | "CT0084 · Cung cấp thiết bị hội nghị" | C |
| Chi tiết hợp đồng | Nhãn nguồn đầu trang | Có | Giữ (một nhãn duy nhất) | A' |
| Chi tiết hợp đồng › Điều khoản | Quy trình / bộ quy tắc | "Hàng hoá · 4 mốc: R_GOODS_STD" | "Quy trình mốc: Hàng hoá · 4 mốc", "Bộ quy tắc thanh toán: Hàng hoá tiêu chuẩn"; mã `WF_GOODS_4STAGE`/`R_GOODS_STD` trong Chi tiết kỹ thuật | B |
| Chi tiết hợp đồng › Các mốc | Đầu thẻ mốc | Nhãn nguồn khi mốc không phải dữ liệu BTC; không có mã mốc | Thêm `MS0337`; bỏ nhãn nguồn từng mốc | A |
| Chi tiết hợp đồng › Các mốc | Dòng lý do | "Lý do: … · PR0004" | "Lý do: Còn thiếu chứng từ bắt buộc `MISSING_REQUIRED_EVENT` `PR0004`" | A |
| Chi tiết hợp đồng › Tab sự kiện | Tên tab | "Event (12)" | "Hồ sơ & sự kiện (12)" | C |
| Chi tiết hợp đồng › Tab sự kiện | Cột | Thời điểm, Event, Mốc, Bên tạo, Chứng từ, ID | Thời điểm, Sự kiện (kèm `EV…` bên dưới), Mốc, Bên ghi nhận, Tệp đính kèm | A |
| Chi tiết hợp đồng › Tab sự kiện | Bên ghi nhận | "Contract Owner - Nova An Business JSC" + "A028 · Người phê duyệt" | "Nguyễn Văn An" + "Người phê duyệt" | C |
| Chi tiết hợp đồng › Tab sự kiện | Mã tài liệu, kênh, nguồn, mã bên | Hiện trên dòng | Bấm "+" để mở Chi tiết kỹ thuật của dòng | B |
| Chi tiết hợp đồng › Lịch sử trạng thái | Dòng đổi trạng thái | "… · Nhập Data Pack · <mã lượt chạy>" | "… · Dữ liệu ban đầu"; giữ mã EV | B |
| Chi tiết hợp đồng › Ký hợp đồng | Ghi chú | "Thứ tự và người ký là dữ liệu bổ sung (Data Pack chỉ có event CONTRACT_SIGNED)…" + nhãn nguồn | "Ký lần lượt theo thứ tự dưới đây. Hợp đồng có hiệu lực khi người ký cuối cùng hoàn tất." | C |
| Chi tiết hợp đồng › Ký hợp đồng | Ngày ký (mới) | — | "Ngày ký ghi trên hợp đồng: 04/08/2026 · hoàn tất ký trên hệ thống: 12/08/2026"; chỉ hiện khi hai ngày khác nhau | — |
| Chi tiết hợp đồng › Người tham gia | Dòng người | "Chủ hợp đồng · A028 · Contract Owner - Nova An Business JSC · email" + nhãn nguồn + "Danh tính demo" | "Nguyễn Văn An — Giám đốc dự án · Nova An Business JSC · email (chỉ bản demo)" + nhãn [Chủ hợp đồng · duyệt chi] [Ký bước 3] | C |
| Chi tiết hợp đồng › Người tham gia | Dòng tổ chức | "Bên mua · B010" + nhãn nguồn | "Bên mua" | C |
| Popup xem nhanh hợp đồng (`ContractModal`) | Tiêu đề | "CT0084 · … - CT0084" | "CT0084 · …"; giữ nhãn nguồn | A' |
| Popup xem nhanh hợp đồng | Bên mua / NCC | "Nova An Business JSC (B010)" | "Nova An Business JSC" | C |
| Popup xem nhanh hợp đồng | Bộ quy tắc | "R_GOODS_STD" | "Hàng hoá tiêu chuẩn" | C |
| Popup xem nhanh hợp đồng | Bảng mốc | "MS0335 · PR0023" dạng chữ | `MS0335` `PR0023` dạng mã theo dõi | A |
| Popup xem nhanh hợp đồng | Bảng sự kiện | Cột ID riêng + nhãn nguồn từng dòng; tên party tiếng Anh | `EV…` dưới tên sự kiện; tên người/vai trò; bỏ nhãn nguồn | A/C |
| Popup xem nhanh hợp đồng | Người tham gia | Tên party tiếng Anh, mã bên, nhãn nguồn, "Danh tính demo" | Tên · tổ chức · email (demo) + vai trò + [Ký bước n] | C |
| Việc cần làm | Cột hợp đồng | "CT0084" + nhãn nguồn | "CT0084"; nhãn nguồn vẫn có trong popup chi tiết | A' |
| Việc cần làm | Câu giới thiệu, "Lý do engine giữ" | Có engine/event | "đánh giá mới nhất của hệ thống…", "Lý do đang giữ" | C |
| Quyết định mốc (màn BTC chấm) | Banner | Tiêu đề lý do + nhãn nguồn; dòng "Lần chạy <mã> · đặc tả v… · độ chắc chắn …" | Tiêu đề lý do + `MS0337` `MISSING_REQUIRED_EVENT`; giữ "Rule PR0004 · đủ điều kiện chi · phạt"; lượt đánh giá và nguồn vào Chi tiết kỹ thuật | A/B |
| Quyết định mốc | Bảng 8 luật | Cột "Rule" + biểu thức `open_dispute == TRUE` | Cột "Luật" (`PR0001`…); cột Điều kiện hiện mô tả tiếng Việt của BTC (tiếng Anh: tên luật), biểu thức nằm ở tooltip | A/B |
| Quyết định mốc | Bảng sự kiện của mốc | Cột ID + nhãn nguồn, mã tài liệu, mã bên | Như tab sự kiện: `EV…` dưới tên, "+" mở Chi tiết kỹ thuật, tên người/vai trò | A/B |
| Quyết định mốc | Lịch sử chuyển trạng thái | "… · EV… · <mã lượt chạy>" | "… · EV…"; bỏ run id | B |
| Quyết định mốc | Ngoại lệ | Mã yêu cầu ngoại lệ dạng code | Bỏ mã yêu cầu; giữ "vô hiệu EV…" | B |
| Quyết định mốc | Câu chữ | "engine", "Decimal, không dùng float", "event" | "hệ thống", "số thập phân chính xác (Decimal)"; giữ mã BR cho BTC đối chiếu | C |
| Nộp chứng từ | Dòng ngữ cảnh | "CT0084 · tiêu đề - CT0084 · loại mốc · bên" | "CT0084 · tiêu đề · loại mốc · bên · `MS…`" | A |
| Nộp chứng từ | Chạy thử | Quyết định + lý do | Thêm mã lý do | A |
| Nộp chứng từ | Ô chứng từ đã nộp | "Hợp lệ" + nhãn nguồn | "Hợp lệ"; người ghi nhận theo tên người/vai trò | C |
| Nộp chứng từ | Câu chữ | "event theo schema của Data Pack", "Engine Python chạy 8 rule", "ma trận 4.2, BR-03, BR-04" | "chứng từ của mốc", "đối chiếu các quy tắc thanh toán", "kiểm tra đúng thẩm quyền… loại bỏ bản trùng lặp" | C |
| Phê duyệt chi | Dòng ngữ cảnh | "CT0084 · tiêu đề - CT0084 · NCC" | "CT0084 · tiêu đề · NCC · `MS…`" | A |
| Phê duyệt chi | Đề xuất | Lý do | Lý do + mã lý do | A |
| Phê duyệt chi | Chứng từ | Nhãn nguồn từng chứng từ | Bỏ; nhãn nguồn còn ở đầu trang | A' |
| Phê duyệt chi | Tiến độ duyệt | "Chủ hợp đồng · Nguyễn Văn An [A028]" | "Chủ hợp đồng · Nguyễn Văn An" | C |
| Phê duyệt chi | Câu chữ | "ghi event APPROVAL/REJECTION", "rule 20", "BR-10", "Engine chạy thử" | "ghi nhận ý kiến đồng ý", "mốc chuyển sang bị từ chối", "Chạy thử" | C |
| Tranh chấp | Dòng ngữ cảnh | "loại mốc · tiêu đề - CT… · bên mua ↔ NCC" | "loại mốc · CT… · tiêu đề · bên mua ↔ NCC · `MS…`" | A |
| Tranh chấp | Hồ sơ tranh chấp | "Nova An Business JSC (B010)", mã `EV…` dạng code, nhãn nguồn | Tên tổ chức; `EV…` dạng mã theo dõi; bỏ nhãn nguồn | A/C |
| Tranh chấp | Câu chữ | "engine chạy thử", "rule 10", "DISPUTE_RESOLVED (BR-08)" | "chạy thử", "mốc bị tạm giữ", "ghi nhận đã giải quyết" | C |
| Trình tự ký (`SigningFlowPage`) | Đầu trang | Nhãn nguồn | Bỏ | C |
| Kiểm tra chữ ký | Ô chọn hợp đồng | "CT0084 · tiêu đề - CT0084 (3/3)" | "CT0084 · tiêu đề (3/3)" | C |
| Kiểm tra chữ ký | Đầu trang | Nhãn nguồn | Bỏ | C |
| Kiểm tra chữ ký | Từng chữ ký | "Mã khóa: <fingerprint> · Gắn với snapshot điều khoản" | Kết quả Hợp lệ/Không hợp lệ/Chưa xác minh giữ nguyên; mã khoá và "Đối tượng được ký" trong Chi tiết kỹ thuật | B |
| Ký số / Kiểm tra chữ ký | Thông báo demo | "Demo tạo bằng chứng ký Ed25519 cục bộ… snapshot điều khoản… CA" | "Bản demo: chữ ký số được mô phỏng… chưa kết nối nhà cung cấp thật và chưa được tổ chức chứng thực (CA) công nhận." Nội dung trung thực giữ nguyên | C |
| Tải hợp đồng lên | Ô mã hợp đồng | Nhãn nguồn dưới ô | Bỏ | C |
| Tải hợp đồng lên | Chọn mẫu hợp đồng | "<tên mẫu> · v<phiên bản>" | "<tên mẫu>" (phiên bản vẫn lưu cùng bản nháp) | C |
| Tải hợp đồng lên | Câu giới thiệu, lỗi chọn NCC | "workflow… Data Pack… 405 mốc của BTC", "nhà cung cấp trong Data Pack" | "quy trình của loại hợp đồng… cùng bộ quy tắc thanh toán", "nhà cung cấp trong danh sách" | C |

## 4. Câu chữ đã đổi (tiếng Việt; tiếng Anh đổi tương ứng)

| Namespace | Khoá | Trước | Sau |
| --- | --- | --- | --- |
| common | `sider.environment`, `sider.demoShort`, `sider.demoBody` | Môi trường / Demo / Bản demo: dữ liệu mẫu, luồng ký mô phỏng. | (xoá) |
| common | `sider.organization` | (mới) | Đơn vị |
| common | `technical.*` | (mới) | Chi tiết kỹ thuật, Nguồn dữ liệu, Mã tài liệu, Kênh ghi nhận, Lượt đánh giá, Mã bên |
| common | `identity.*` | Danh tính demo; Vai trò/đơn vị: | (xoá) |
| common | `login.demoAll` | Tất cả tổ chức trong Data Pack | Tất cả tổ chức |
| common | `login.demoHint` | … Người dùng là dữ liệu bổ sung; tổ chức và người phê duyệt lấy từ Data Pack. | Môi trường demo: chọn "Tài khoản demo" ở góc trên bên phải để đăng nhập nhanh. |
| contracts | `contractList.intro` | Danh sách lấy từ Data Pack của BTC… quyết định của engine… (đặc tả mục 9.3). | Danh sách gồm 100 hợp đồng mẫu của Ban tổ chức và các hợp đồng bổ sung để demo. Trạng thái hợp đồng được tổng hợp từ kết quả đánh giá từng mốc thanh toán. |
| contracts | `contractList.modal.event`, `events` | Event; {{count}} event | Sự kiện; Hồ sơ & sự kiện ({{count}}) |
| contracts | `contractList.modal.payment` | Thanh toán theo quyết định của engine | Thanh toán theo kết quả đánh giá |
| contracts | `contractList.modal.demoIdentity` | Danh tính demo | (xoá) |
| contracts | `contractUpload.intro` | … workflow… Data Pack… 405 mốc của BTC. | Bước 1/5. Hợp đồng mới được chia thành các mốc theo quy trình của loại hợp đồng và được đánh giá bằng cùng bộ quy tắc thanh toán với các hợp đồng mẫu. |
| contracts | `contractUpload.form.errors.INVALID_SUPPLIER` | Chọn nhà cung cấp trong Data Pack. | Chọn nhà cung cấp trong danh sách. |
| domain | `ruleSet.*` | (mới) | Hàng hoá / Dịch vụ / Phần mềm / Bảo trì tiêu chuẩn |
| domain | `trigger.IMPORT`, `trigger.EVENTS` | Nhập Data Pack; Event mới | Dữ liệu ban đầu; Sự kiện mới |
| milestones | `detail.tabs.events` | Event ({{count}}) | Hồ sơ & sự kiện ({{count}}) |
| milestones | `detail.events.type/actor/document` | Event / Bên tạo / Chứng từ | Sự kiện / Bên ghi nhận / Tệp đính kèm |
| milestones | `detail.history.body` | Event và các lần engine đổi trạng thái… | Các sự kiện hồ sơ và mỗi lần trạng thái mốc thay đổi… |
| milestones | `detail.signing.note` | Thứ tự và người ký là dữ liệu bổ sung (Data Pack chỉ có event CONTRACT_SIGNED)… | Ký lần lượt theo thứ tự dưới đây. Hợp đồng có hiệu lực khi người ký cuối cùng hoàn tất. |
| milestones | `detail.signing.dates`, `detail.signing.step`, `detail.participants.approves` | (mới) | Ngày ký ghi trên hợp đồng… · hoàn tất ký trên hệ thống…; Ký bước {{step}}; {{role}} · duyệt chi |
| milestones | `detail.terms.workflow`, `detail.terms.ruleSet` | (mới) | Quy trình mốc; Bộ quy tắc thanh toán |
| milestones | `detail.milestone.noDue` | Chưa có hạn (giữ theo rule 80) | Chưa có hạn nên mốc đang được giữ |
| milestones | `detail.requirement.UNAUTHORIZED` | Có event sai thẩm quyền… (BR-19) | Có chứng từ sai thẩm quyền {{id}}; cần {{side}} nộp lại và kiểm soát viên xử lý |
| milestones | `inbox.intro`, `inbox.detail.reason` | … quyết định mới nhất của engine… / Lý do engine giữ | … đánh giá mới nhất của hệ thống… / Lý do đang giữ |
| milestones | `submit.done`, `approve.done` | Đã ghi event. Engine đánh giá lại… | Đã ghi nhận chứng từ/phê duyệt. Kết quả đánh giá lại… |
| milestones | `submit.lockNote` | Mỗi tệp thành một event theo schema của Data Pack… | Mỗi tệp được ghi nhận thành một chứng từ của mốc… |
| milestones | `submit.aftermath.validate`, `submit.aftermath.match` | ma trận 4.2… BR-03, BR-04 / Engine Python chạy 8 rule… | Kiểm tra đúng thẩm quyền… loại bỏ bản trùng lặp / Hệ thống đối chiếu các quy tắc thanh toán… |
| milestones | `submit.preview.title`, `approve.proposal.preview` | (engine chạy thử) / Engine chạy thử… | (chạy thử) / Chạy thử… |
| milestones | `submit.file.replacesUnauthorized` | … event sai quyền cũ… (BR-19) | … chứng từ sai thẩm quyền trước đó… |
| milestones | `approve.blocked.ALREADY_APPROVED` | … (BR-10) | Bỏ mã BR |
| milestones | `approve.consequences.*` | ghi event APPROVAL/REJECTION, rule 20, không tạo event | ghi nhận ý kiến đồng ý; mốc chuyển sang bị từ chối; gửi ghi chú cho các bên |
| milestones | `decision.rules.rule` | (mới) | Luật |
| milestones | `decision.issues`, `decision.amounts.note`, `decision.events.title`, `decision.exceptions.decided`, `decision.replay.body`, `decision.history.note` | engine, float, run id, as-of | hệ thống, số thập phân chính xác (Decimal), "mỗi lần đánh giá đều được lưu lại" |
| disputes | `impact.afterResolve`, `impact.footnote`, `decision.options.RESOLVE.description`, `decision.done` | engine chạy thử, rule 10, DISPUTE_RESOLVED (BR-08), Đã ghi event | chạy thử, mốc bị tạm giữ, ghi nhận đã giải quyết, Đã ghi nhận |
| signing | `localProof.notice`, `localProof.bridgeNotice` | Ed25519 cục bộ, snapshot điều khoản, CA/PAdES | Bản demo: chữ ký số được mô phỏng…; chưa bao gồm xác thực chứng thư của tổ chức CA |
| signing | `localProof.untrusted`, `localProof.unverifiedContent` | Khóa thử cục bộ…; Chưa có bằng chứng mật mã | Chứng thư thử nghiệm, chưa được CA công nhận; Chưa có bằng chứng ký số |
| signing | `localProof.basisLabel`, `localProof.basis.TERMS_SNAPSHOT` | (mới); Gắn với snapshot điều khoản | Đối tượng được ký; Gắn với bản điều khoản đã chốt |

## 5. Tệp đã sửa

| Nhóm | Tệp |
| --- | --- |
| Thành phần/hàm dùng chung | `shared/ui/TechnicalInfo.tsx` (mới), `shared/auth/useDemoMode.ts` (mới), `shared/lib/domain.ts`, `shared/layout/AppLayout.tsx`, `AppLayout.module.css`, `shared/auth/LoginPage.tsx` |
| Hợp đồng | `features/milestones/pages/ContractDetailPage.tsx`, `features/contracts/components/ContractModal.tsx`, `features/contracts/components/ContractUploadForm.tsx` |
| Mốc và tranh chấp | `MilestoneDecisionPage.tsx`, `EvidenceSubmissionPage.tsx`, `PaymentApprovalPage.tsx`, `TaskInboxPage.tsx`, `features/disputes/pages/DisputePage.tsx`, `features/disputes/components/SubmissionPanel.tsx` |
| Ký số | `features/signing/pages/SigningFlowPage.tsx`, `SignatureVerificationPage.tsx` |
| Chuỗi | `locales/{vi,en}/{common,contracts,disputes,domain,milestones,signing}.json` |
| Quy ước/kiểm thử | `apps/web/CLAUDE.md`, `docs/08_HUONG_DAN_PHAT_TRIEN_UI.md`, `tests/foundation/i18n.test.mjs`, `scripts/guide-screenshots.mjs` |

Đường dẫn trong bảng tính từ `apps/web/src` trừ khi ghi rõ.

## 6. Kiểm chứng

| Kiểm tra | Kết quả |
| --- | --- |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check` | Đạt |
| `pnpm build` | Đạt |
| `pnpm test` (78 test Python + test Node) | Đạt; thêm test "business screens use business wording, not system jargon" |
| `pnpm test:browser` (API file storage riêng) | Đạt: 36 màn, desktop/mobile, đăng nhập demo từng vai trò, phê duyệt → PENALTY, tải hợp đồng, popup toàn màn hình… |
| Kiểm trực quan CT0084 (Chủ hợp đồng) | Các mốc, Hồ sơ & sự kiện (kể cả dòng mở rộng), Ký hợp đồng, Người tham gia, Quyết định mốc 3: không còn A028/B010/S018, "Contract Owner -", CTR-…, WORKFLOW_ENGINE, Data Pack, engine, "Event ("; vẫn thấy CT0084, MS…, EV…, PR… |

## 7. Lưu ý

- Màn Quyết định mốc vẫn giữ mã BR, `ROUND_HALF_UP`, phạm vi `R_GOODS_STD:ACCEPTANCE` và nhãn "first-match" vì đây là màn BTC đối chiếu quyết định.
- Người tham gia: email chỉ hiện khi API bật đăng nhập demo, để giám khảo biết đăng nhập tài khoản nào khi thử ký/duyệt.
- Ảnh hướng dẫn trong `apps/web/public/guide` chưa chụp lại; chạy `pnpm guide:screenshots` khi cập nhật bộ hướng dẫn (đã sửa sẵn selector cho nhãn mới).
- Bản xem trước hợp đồng có chữ ký/dấu demo bên cạnh mọi thao tác: xem [32 — Văn bản hợp đồng bên cạnh thao tác](32_VAN_BAN_HOP_DONG_BEN_CANH_THAO_TAC.md). Góp ý về tài khoản Bùi Văn Khánh ở CT0105 chưa xử lý.
