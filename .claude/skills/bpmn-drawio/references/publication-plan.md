# Kế hoạch chuẩn hóa và xuất bản bpmn-drawio

Ngày khảo sát: **22/10/2026**. Đây là phân tích và kế hoạch triển khai, không phải xác nhận đã hoàn thành các hạng mục đề xuất. Nguồn và quy ước màu hiện hành ở [README](../README.md).


## Trạng thái hiện tại — 1.0.0-rc.2

rc.1 (đã có): core độc lập, doctor, source archive có manifest, hai theme cấu hình chung và profile tương thích; association dotted, palette, unsupported; label/containment metrics; SVG text/PDF; test suite, CI cấu hình, ZIP có manifest.

rc.2 (lượt rà 22/10/2026) sửa các lỗi tìm được bằng ví dụ nghiệp vụ mới, không lấy từ bài thi hay bộ mẫu dùng xây checker: trên 41 ca ký pháp mới, mã rc.1 chỉ đúng 15 (2 ca hợp lệ bị từ chối, 23 ca sai bị bỏ sót, Call Activity bị nhận là task thường); rc.1 cũng không báo nhãn tràn hình, nhãn ra ngoài lane (bị lane sau che mất) và connector chạy chồng. Đã bổ sung: ma trận trigger/result theo vị trí, catch/throw của message flow, boundary/intermediate thiếu sequence, Link, gateway phải tách/gộp, Call Activity và lane native, symbol renderer không vẽ, nét/chữ bị ẩn, tương phản marker, năm nhóm layout mới, phiên bản/digest công cụ trong bằng chứng, smoke test từ ZIP. Bằng chứng tách theo lớp nằm trong báo cáo ứng viên của repository phát triển.

Giấy phép đã chốt: **Apache-2.0**, tác giả Tunhoclaptrinh (LICENSE, NOTICE); gói vẫn là ứng viên, chưa phát hành. Windows/macOS, Python 3.10 thực chạy, tất cả tổ hợp BPMN, tự layout và engine XML không được tuyên bố hoàn thành. Các mục khảo sát/kế hoạch dưới đây giữ lịch sử quyết định.

## 1. Đích phát hành

Một skill độc lập giúp agent **phân tích → mô hình hóa → vẽ → dựng ảnh → rà soát → bàn giao** BPMN trong draw.io. Chất lượng ưu tiên: đúng yêu cầu nghiệp vụ, đúng ký pháp, dễ đọc, dễ sửa và có bằng chứng kiểm tra.

Diễn giải yêu cầu “toàn năng” thành khả năng xử lý nhiều quy trình và phát hiện giới hạn của chính mình. Không quảng bá “mọi sơ đồ đều đúng 100%”, “hỗ trợ toàn bộ BPMN 2.x” hoặc “được OMG chứng nhận” khi chưa có căn cứ.

Phạm vi v1.0 đề xuất: Process và Collaboration, với danh mục phần tử/kịch bản đã được kiểm thử. Choreography, Conversation, BPMN XML thực thi, mô phỏng và tích hợp engine là các phạm vi bổ sung độc lập.

## 2. Khảo sát trước triển khai

### Nền tảng nên giữ

- SKILL.md đã tách nghiệp vụ, ký pháp, hình ảnh và giải thích; không mặc định mọi bài có cùng số trang/pool.
- Có business-review, bpmn-rules, patterns và workflow riêng; có thể đọc theo nhu cầu thay vì dồn toàn bộ vào prompt.
- Có builder, reader cho trang nén, tô màu theo loại phần tử, so sánh canonical hai bản, dựng ảnh thật và hash nguồn.
- Có kiểm tra sequence/message, scope, một số marker/event nâng cao và hình học; báo giới hạn thay vì tuyên bố mọi cấu trúc hợp lệ.
- Hai asset 10 trang nằm trong skill, có thể sao chép độc lập.

### Khoảng trống đã xác định bằng đọc mã và thử nhanh

| Hạng mục | Hiện trạng thực tế | Việc cần cải thiện |
|---|---|---|
| Tách workspace | SKILL.md còn quy ước “in this workspace”; refs còn vị trí PDF và chứng cứ ở BA-Exam | Tách mặc định tái sử dụng khỏi ví dụ/local override; core không cần thư mục BA-Exam |
| Kiểm thử độc lập | Audit asset ngoài workspace chạy được; test suite đầy đủ vẫn ở ra-soat-bpmn/ và bo-vi-du-bpmn/ | Mang fixture và runner cần thiết vào gói phát triển, giữ runtime gọn |
| Renderer | Cần Git checkout và gọi `git rev-parse`; tìm Chrome bằng tên chương trình | Doctor kiểm tra môi trường; hỗ trợ đường dẫn Chrome rõ ràng; quyết định hỗ trợ source archive qua manifest |
| Tương thích | Có phiên bản draw.io đã dùng, chưa có ma trận thử nhiều phiên bản/OS | Khóa phiên bản tham chiếu; thử phiên bản nâng cấp trước khi công bố tương thích |
| Theme | Palette là dict trong Python; audit chỉ nhận tool-convention | Theme có schema, cùng nguồn dữ liệu cho tô màu/kiểm tra/chú giải |
| Viền và association | Rule association kiểm tra dashed nhưng chưa kiểm tra đủ dashPattern để phân biệt nét chấm/nét đứt dài | Thêm kiểm tra hình SVG và fixture cố ý sai nét, tránh pass chỉ vì cùng dashed=1 |
| Phần tử mở rộng | Có rule từng phần; chưa có catalog đầy đủ liên kết quy tắc với test | Lập ma trận phân biệt vẽ được, nhận diện được, kiểm tra được và phải rà thủ công |
| Bố cục | Builder nhận tọa độ/waypoint từ người gọi; checker chung chưa bảo đảm mọi nhãn rõ | Layout có ràng buộc, kiểm tra nhãn/biên lane và review ảnh; không hứa tự layout hoàn hảo |
| Đầu ra | SVG/PNG dùng chung; PDF/DOCX theo mẫu nằm trong bài riêng | Chuẩn hóa xuất SVG thuần/PDF vector ở module tùy chọn; không kéo phụ thuộc PDF vào core |
| Xuất bản | Có metadata cơ bản, chưa có license skill, version/manifest và smoke test gói | Bổ sung gói phát hành, kiểm thử từ gói giải nén và nguồn tham khảo |

Lần khảo sát chỉ chạy quick_validate và audit không render trên bản sao skill ở thư mục tạm: **10 trang, 0 lỗi cấu trúc/palette theo checker hiện tại, hai bản chỉ khác màu, 11 manual-review notes**. Chưa chạy lại toàn bộ hồi quy hoặc dựng lại ảnh cho một bản skill mới.

## 3. Chuẩn ký pháp và profile trình bày

### 3.1 Thứ tự giải quyết yêu cầu

Phạm vi và nghiệp vụ lấy từ người dùng/chủ quy trình. Ký pháp lấy OMG BPMN 2.0.2. draw.io cung cấp cách thể hiện. Bizagi cung cấp tham khảo về trình bày/tra cứu. Nếu yêu cầu giảng viên khác chuẩn, ghi rõ khác biệt và không gọi đó là quy tắc OMG.

### 3.2 Theme

Giữ tool-convention để tương thích tài liệu cũ. Thêm monochrome cho in, và profile mang tên **bizagi-inspired** nếu triển khai, với mô tả rõ là cảm hứng trình bày, không phải xuất theme chính thức từ Bizagi.

Màu tham khảo: start xanh, end đỏ, intermediate/boundary/gateway vàng, activity xanh dương, container trung tính. Không dùng đỏ để suy ra thất bại. Giữ độ tương phản chữ/marker; khi in xám vẫn phân biệt được ký pháp. Màu status/risk của doanh nghiệp là lớp tùy chọn riêng, không âm thầm thay màu loại phần tử.

Theme chỉ được thay thuộc tính trình bày màu. Không được đổi ring, marker catch/throw, interrupting, dash, arrowhead hoặc hình học. Mọi profile phải qua so sánh normal/color. Không suy luận loại phần tử từ từ khóa trong nhãn.

### 3.3 Catalog phần tử và kết nối

Mỗi mục cần có: định danh loại, ký hiệu, điều kiện sử dụng, source/target hợp lệ, phạm vi, ánh xạ style native draw.io, nguồn OMG, test đúng/sai, và mức kiểm chứng.

Mức kiểm chứng ghi riêng: **dựng hình**, **kiểm tra cấu trúc**, **kiểm tra ảnh**, **walkthrough nghiệp vụ**. Một ký hiệu có trong thư viện không tự có đủ bốn mức. Biến thể chưa biết cần cảnh báo/unsupported rõ ràng, tránh coi việc không tìm thấy lỗi là đã hỗ trợ.

Ưu tiên rà các nhóm: start/intermediate/end; catch/throw; boundary ngắt/không ngắt; task types; subprocess/call activity; XOR/AND/OR/event-based; sequence/message/association/data association; conditional/default; pool/lane và scope. Sau đó mở rộng message/timer/error/escalation/signal/link/compensation/cancel/multiple, transaction, loop/multi-instance và choreography/conversation theo nhu cầu.

## 4. Các đợt triển khai

### Đợt A — Core độc lập, ưu tiên P0

**Thực hiện:** rút gọn SKILL.md thành quy tắc dùng chung; tách profile bàn giao có thể cấu hình; bỏ phụ thuộc bắt buộc vào cây BA-Exam; chỉ đọc references liên quan. Bổ sung doctor kiểm tra Python, Chrome, viewer, Git/manifest, quyền ghi output và font tiếng Việt.

**Nghiệm thu:** chép skill sang thư mục mới và chạy tạo/tô màu/render/audit ví dụ mà không cần bài tập, PDF chuẩn nội bộ hoặc đường dẫn máy cũ. Môi trường thiếu phụ thuộc phải báo đúng nguyên nhân. Không tự clone/nâng cấp/ghi đè file ngoài phạm vi người dùng yêu cầu.

### Đợt B — Catalog chuẩn và theme, ưu tiên P0

**Thực hiện:** lập catalog trên; bổ sung nguồn OMG đến mục/trang; tạo profile theme dùng chung cho colorizer/audit/legend; rà association dotted, marker message, catch/throw và subprocess. Bổ sung mẫu mở rộng ở phạm vi cần công bố, không cố nhồi mọi symbol vào một mô hình.

**Nghiệm thu:** từng loại công bố có fixture đúng và sai phù hợp; khác biệt viền/nét/mũi tên được thử trên hình thật. Bản in xám vẫn đọc được. Theme tùy biến không lọt thay đổi nghiệp vụ/hình học.

### Đợt C — Layout và xuất ảnh, ưu tiên P1

**Thực hiện:** chuyển các kiểm tra nhãn/biên lane và controls có ích từ bài riêng thành module chung; hỗ trợ khoảng cách và vùng đặt nhãn có cấu hình; xử lý route qua lane cùng pool. Quy định cách xuất SVG thuần và xem PDF ở kích thước thực.

**Nghiệm thu:** rà ảnh tổng thể và chi tiết cho các ví dụ dài, nhãn tiếng Việt, nhiều lane và luồng quay lại. Sửa được giao cắt gây hiểu nhầm, chữ cắt, timer lệch khỏi activity, marker bị che. Không coi mọi giao cắt là lỗi; không áp một cỡ chữ cố định cho mọi trang.

### Đợt D — Phân tích nghiệp vụ và đánh giá hành vi, ưu tiên P1

**Thực hiện:** chuẩn hóa mẫu requirements-to-elements, danh sách giả định và walkthrough. Bổ sung ca mới chưa dùng xây rule: phê duyệt, bổ sung, chờ sự kiện, SLA tính từ nhận thật, xử lý song song, sửa lại, hủy và compensation. Khi dùng trong công việc, hỗ trợ ghi nhận quy trình as-is/to-be, phiên bản và người xác nhận quy tắc.

**Nghiệm thu:** mỗi yêu cầu có phần tử/kịch bản đối chiếu; không đồng nhất “đã gửi” với “đã nhận”, “đề nghị hủy” với “hủy xong”, hoặc phê duyệt với hợp lệ đầu vào. Reviewer có thể xác nhận hoặc chỉ ra giả định sai. Phần nghiệp vụ chưa được chủ quy trình xác nhận phải còn hiển thị.

Một lượt đánh giá độc lập bằng agent khác có ích ở giai đoạn này khi có quyền và tài nguyên; lượt lập kế hoạch hiện tại chưa thực hiện và không lấy tự đánh giá làm xác nhận độc lập.

### Đợt E — Test suite và CI, ưu tiên P0 cho phát hành

**Thực hiện:** tách test nhanh của parser/canonical/theme khỏi render integration test và walkthrough. Đưa fixture tổng hợp vào repo skill; định danh rule/case; kiểm tra cả false positive và false negative. Thử compressed/uncompressed, metadata thiếu/mâu thuẫn, stale evidence, sai source hash, vòng event, edge qua pool/scope và hình che chữ.

**Nghiệm thu:** có một lệnh chạy test nhanh và một lệnh chạy test render; báo số pass/fail/skip cùng lý do, renderer/version/font và hash. Test không được pass chỉ vì công cụ bỏ qua phần tử không nhận diện. Test sai có chủ đích phải bị từ chối vì đúng lỗi dự kiến. Gói giải nén được thử ở vị trí mới; Windows/macOS chỉ ghi hỗ trợ sau khi có bằng chứng chạy thực tế.

### Đợt F — Gói xuất bản, ưu tiên P0 cho phát hành

**Thực hiện:** chốt tên/phạm vi, version và license của skill; thêm hướng dẫn ngắn, nguồn, danh sách phụ thuộc và third-party notices theo những gì thực sự phân phối. Đóng ZIP theo allowlist, tạo manifest SHA-256 và ghi draw.io commit/viewer digest đã thử. Runtime gọn, test suite có thể ở source/development bundle.

**Nghiệm thu:** ZIP không có mã sinh viên, họ tên, bài thi, tài liệu khách hàng, clone vendor, cache hoặc profile Chrome. Không kèm nguyên tài liệu OMG/Bizagi theo mặc định; dùng link nguồn chính thức. Không tự gán license của draw.io cho mã skill. Kiểm tra quyền phân phối đối với file được kèm. License/tác giả cần chủ dự án chốt trước phát hành, nhưng không cản trở chuẩn bị một gói ứng viên để review.

Thứ tự làm thực tế: **A → B → C/D → E → F**, với test được viết cùng thay đổi tương ứng. Không đợi đến cuối mới thử các rule mới. Xuất bản công khai là thao tác riêng sau khi bản ứng viên đã có thể review.

## 5. Cấu trúc phát hành đề xuất

```text
bpmn-drawio/
├── SKILL.md
├── README.md
├── LICENSE, NOTICE                 # Apache-2.0, Copyright 2026 Tunhoclaptrinh
├── agents/openai.yaml
├── references/                     # nghiệp vụ, ký pháp, workflow, coverage
├── assets/                         # ví dụ tổng hợp và theme
└── scripts/                        # builder, doctor, render, audit, package

# Trong source/development bundle, không bắt buộc tải vào context:
tests/                              # unit, fixture, render integration
release/                            # manifest và bằng chứng cho phiên bản
```

Đây là cấu trúc dự kiến; chưa tạo thư mục rỗng hoặc ghi tên script chưa tồn tại vào hướng dẫn chạy. Tài liệu nguồn, changelog và contributor guide chỉ thêm khi phục vụ quy trình phát hành cụ thể. Không cần đưa toàn bộ tài liệu học tập vào runtime skill.

## 6. Điều kiện để gọi là bản v1.0

- Phạm vi hỗ trợ và phần chưa hỗ trợ rõ; không dùng “BPMN 2.xx đầy đủ” cho một tập kiểm tra chọn lọc.
- Gói độc lập chạy được luồng tạo/sửa/rà soát đã công bố, không cần workspace cũ.
- Quy tắc nghiệp vụ, notation, palette và layout tách bạch; theme có nguồn và nguồn cảm hứng rõ.
- Bộ kiểm thử có ca đúng/sai; ảnh và báo cáo gắn đúng hash, không có ca fail chưa giải quyết trong phạm vi công bố.
- Có ví dụ mới được đọc ảnh và review ngoài chính bộ ví dụ dùng xây checker.
- README đủ để dùng trên môi trường đã thử, metadata/frontmatter hợp lệ; license và gói phân phối đã chốt.
- Không có dữ liệu học viên/khách hàng hoặc nguồn bên thứ ba không chủ đích trong ZIP.

## 7. Ưu tiên sau v1.0

Choreography/Conversation nếu có nhu cầu thật; import/export BPMN XML có schema và DI; kiểm tra thêm với công cụ độc lập; hỗ trợ engine theo sản phẩm/phiên bản cụ thể; layout phức tạp và chuyển đổi roundtrip. Những phần này cần kế hoạch và test riêng, không coi là có sẵn từ khả năng vẽ symbol.

**Đề xuất:** hoàn thành gói v1.0 tập trung vào Process/Collaboration đúng và dễ kiểm chứng, rồi mở rộng theo catalog. Nền hiện tại đủ để phát triển tiếp; chưa nên xuất bản với cam kết “toàn năng, kiểm định đầy đủ BPMN”.


## 8. Phân tích mở rộng lớn — chưa triển khai

Các hướng sau cần quyết định phạm vi riêng; không bổ sung ngầm vào v1.0 chỉ vì draw.io có hình tương ứng.

| Hướng | Lợi ích | Chi phí/rủi ro chính | Điều kiện để bắt đầu | Nghiệm thu đề xuất |
|---|---|---|---|---|
| Choreography | Mô tả giao kèo giữa participant không cần process nội bộ | Ngữ nghĩa initiating/non-initiating, band participant, ràng buộc sequence của choreography khác Process; draw.io chỉ có hình, checker hiện coi là unsupported | Có nhu cầu thật (môn học/đơn vị dùng choreography) | Catalog hình + quy tắc §11, fixture đúng/sai, ảnh, ví dụ nghiệp vụ mới |
| Conversation | Bản đồ tổng quan trao đổi giữa nhiều bên | Ít dùng ở bài tập; link hình `shape=link`; quan hệ với message flow chi tiết | Như trên | Quy tắc §9.5, fixture, liên kết với collaboration chi tiết |
| BPMN XML (XSD + DI) | Trao đổi với Camunda/Bizagi/bpmn.io, kiểm tra bằng XSD | Phải ánh xạ id, pool/lane, waypoint, label bounds; mất mát khi khứ hồi; engine yêu cầu thuộc tính thực thi riêng | Chọn một công cụ đích và phiên bản cụ thể | Xuất XML hợp lệ XSD, nhập lại cùng cấu trúc/tọa độ, so sánh với công cụ đích; không gọi là “thực thi được” khi chưa chạy engine |
| Tự layout hoàn toàn | Giảm công đặt tọa độ | Bố cục BPMN tốt phụ thuộc nghiệp vụ (đọc trái→phải, ngoại lệ, message); thuật toán chung dễ tạo giao cắt/nhãn chồng | Có bộ đo chất lượng layout đủ tin (đã có một phần ở rc.2) | Layout gợi ý + kiểm tra strict-layout + đọc ảnh; luôn cho phép chỉnh tay, không ghi đè bố cục người dùng |
| Mô phỏng token/soundness | Phát hiện deadlock, nhánh chết, join sai | Inclusive join, event, boundary, multi-instance đòi semantics đầy đủ | Giới hạn tập con (XOR/AND/link) trước | Petri-net hoặc state-space cho tập con, báo rõ phần không mô hình |

Khuyến nghị: hoàn tất v1.0 Process/Collaboration trước; nếu cần mở rộng, ưu tiên BPMN XML có DI cho một công cụ đích cụ thể, rồi mới tới Choreography/Conversation.

## 9. Việc còn lại trước khi xuất bản

1. ~~License và tác giả~~ — đã chốt Apache-2.0, Copyright 2026 Tunhoclaptrinh. Kênh phát hành đã chọn: repo công khai **`drawio-diagram-skills`** trên GitHub, mỗi skill một thư mục `skills/<tên>/`, tag `<skill>-v<phiên bản>`, bản `-rc` là pre-release. Việc push và tạo release do chủ dự án thực hiện.
2. Chạy CI từ xa ít nhất một lần (Python 3.10/3.12/3.14, job render thủ công) và lưu link kết quả; hiện chỉ có cấu hình.
3. Thử thực tế trên Windows và macOS (doctor, render, PDF, smoke ZIP) hoặc ghi rõ chỉ hỗ trợ Linux.
4. Một lượt forward-test độc lập (người/agent khác) có đọc ảnh, dùng đề mới; rc.2 là tự rà của cùng tác giả.
5. Rà nghiệp vụ ví dụ mới với người có chuyên môn (chủ quy trình hoặc giảng viên) trước khi dùng làm tài liệu giảng dạy.
6. ~~Số phận `tool-convention` và mặc định `save_pair`~~ — đã chốt cho 1.x: giữ `tool-convention` làm profile tương thích (không deprecated) và giữ mặc định `save_pair`, vì script bài cũ (Đề 03, gọi đồ ăn) gọi hàm với mặc định; đổi mặc định sẽ làm bản sinh lại khác bản đã nộp. Bài mới truyền `monochrome`/`bizagi-inspired` tường minh (đã ghi trong drawio-workflow.md). Xem xét lại ở 2.0.
