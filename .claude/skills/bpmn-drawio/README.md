# BPMN với draw.io

Skill hỗ trợ chuyển mô tả nghiệp vụ thành sơ đồ BPMN chỉnh sửa được trong draw.io, tạo hai bản thường/có màu, xuất ảnh và giải thích quyết định mô hình hóa. Hướng phát triển là một bộ công cụ tái sử dụng cho học tập và tài liệu hóa quy trình thực tế.

**Ứng viên `1.0.0-rc.2`:** runtime độc lập, hai theme chính, ma trận trigger/result theo vị trí event, kiểm tra bố cục nhãn/connector, test suite, lệnh doctor, dựng SVG/PNG/PDF, đóng ZIP có manifest và smoke test từ ZIP giải nén. **Giấy phép Apache-2.0, tác giả Tunhoclaptrinh ([LICENSE](LICENSE), [NOTICE](NOTICE)); chưa phát hành công khai.** Đây là bộ hỗ trợ Process/Collaboration với kiểm tra chọn lọc, không phải trình kiểm định toàn bộ BPMN hoặc engine. Xem [phạm vi hỗ trợ](references/coverage.md) và [kế hoạch/trạng thái triển khai](references/publication-plan.md).

## Mục tiêu và nguyên tắc thiết kế

1. **Nghiệp vụ quyết định mô hình.** Đọc yêu cầu, xác định participant/role, đầu vào, quyết định, ngoại lệ và kết quả trước khi đặt hình. Mỗi giả định cần được công khai; số biểu đồ tùy phạm vi.
2. **OMG quyết định ký pháp.** Pool/lane, vòng event, marker, nét và mũi tên phải thể hiện đúng ý nghĩa, dù bản in không có màu.
3. **draw.io quyết định cách hiện thực hình vẽ.** Ưu tiên hình BPMN native, kiểm tra trên bộ dựng thực tế và ghi phiên bản đã dùng.
4. **Tham khảo Bizagi cho cách đọc và trình bày.** Dùng màu để nhận diện nhóm phần tử, nhãn hành động rõ và luồng dễ theo dõi. Khi tài liệu thực hành giản lược một trường hợp, đối chiếu quy tắc gốc và ngữ cảnh trong OMG.
5. **Bằng chứng giới hạn lời khẳng định.** Tách kiểm tra XML, ký pháp, màu, hình ảnh và kịch bản. Công cụ chấp nhận một sơ đồ chưa xác nhận nghiệp vụ ngoài đời.

Skill hướng tới Process và Collaboration trước. Choreography, Conversation, toàn bộ tổ hợp event và xuất BPMN XML thực thi chưa được bảo đảm chỉ vì draw.io có hình tương ứng.

## Hiện có gì?

| Thành phần | Vai trò |
|---|---|
| [SKILL.md](SKILL.md) | Điểm vào cho agent, quy trình tạo/sửa/rà soát |
| [business-review.md](references/business-review.md) | Rà yêu cầu, trách nhiệm, dữ liệu, thời gian và kịch bản |
| [bpmn-rules.md](references/bpmn-rules.md) | Quy tắc ký pháp và những phân biệt dễ sai |
| [drawio-workflow.md](references/drawio-workflow.md) | Hình native, XML, dựng ảnh và đọc báo cáo |
| [patterns.md](references/patterns.md) | Hướng dẫn chọn 10 mẫu nâng cao độc lập |
| `scripts/bpmn_builder.py` | Dựng XML từ phần tử và tọa độ được chỉ định; chưa tự bố trí |
| `scripts/render_drawio.py` | Xuất SVG/PNG qua viewer draw.io và Chrome/Chromium |
| `scripts/audit_drawio.py`, `scripts/notation_rules.py` | Một tập kiểm tra cấu trúc, ký pháp (gồm ma trận event) và hình học |
| `scripts/layout_rules.py` | Kiểm tra bố cục trên số đo render: nhãn, container, connector |
| `scripts/doctor.py`, `scripts/run_checks.py` | Kiểm tra môi trường; test nhanh và test render |
| `scripts/package_skill.py`, `scripts/smoke_package.py` | Đóng ZIP ứng viên; giải nén ở thư mục mới và chạy lại |
| `scripts/colorize_drawio.py` | Tạo bản có màu theo loại phần tử |
| `scripts/drawio_common.py` | Đọc trang, giải nén, suy luận hình và so sánh mô hình |
| [Ví dụ thường](assets/bpmn-patterns.drawio) · [Ví dụ màu](assets/bpmn-patterns-color.drawio) | 10 trang ví dụ tự đặt, không phải mẫu nghiệp vụ bắt buộc |

## Màu và ký hiệu

Hai profile chính là `monochrome` (bản thường, in đen trắng) và `bizagi-inspired` (bản màu); `tool-convention` giữ để tái tạo bài cũ, cùng màu nền nhưng không ép màu nét/chữ. Tư tưởng phân nhóm màu tham khảo cách trình bày của Bizagi; **các mã hex dưới đây do bộ công cụ này lựa chọn**, không phải bảng mã màu chính thức của Bizagi. OMG cho phép tùy biến màu nền; màu không thay thế các đặc điểm ký pháp được quy định. Căn cứ: [OMG §7.5](https://www.omg.org/spec/BPMN/2.0.2/PDF), [Bizagi Events](https://help.bizagi.com/platform/en/events.htm) và [Bizagi Quick Reference](https://www.bizagi.com/files/live/sites/bizagi/files/PDFs/BPMN_Quick_Reference_Guide.pdf).

| Nhóm | Màu nền `bizagi-inspired` | Đặc điểm phải giữ khi tô màu |
|---|---|---|
| Start | Xanh lá `#bbf7d0` | Vòng đơn mảnh; trigger đúng loại |
| End | Đỏ `#fecaca` | Vòng đơn đậm; result đúng loại; đỏ bao gồm kết thúc thành công |
| Intermediate / Boundary | Vàng `#fde68a` | Vòng kép, liền/đứt theo loại; phân biệt catch/throw và interrupting/non-interrupting |
| Gateway | Vàng `#fef08a` | Marker XOR/AND/Inclusive/Event-based đúng loại |
| Task / collapsed subprocess | Xanh dương `#dbeafe` | Marker công việc, dấu cộng và marker lặp nếu có |
| Khung subprocess mở rộng | Xanh rất nhạt `#eff6ff` | Viền thường, event subprocess hoặc transaction theo đúng loại |
| Pool/lane | Header `#e2e8f0`, thân trắng | Ranh giới participant, phân vai và phần tử thuộc container |

Collapsed subprocess dùng activity, expanded dùng frame theo style native; `isLoopSub` ở đây là tên implementation của dấu cộng, không phải BPMN loop. Không dùng màu nền để phân loại subprocess. Biến thể nâng cao giữ nghĩa viền/marker và nghĩa vụ review trong coverage.md.

| Kết nối | Ký pháp cần thể hiện |
|---|---|
| Sequence flow | Nét liền, đầu mũi tên đặc; thuộc cùng process scope, có thể đi qua lane |
| Message flow | Nét đứt, vòng tròn rỗng ở đầu gửi và đầu mũi tên rỗng; giữa participant khác nhau |
| Association | Nét chấm; không có hoặc có đầu mũi tên mở theo hướng liên kết |
| Data association | Nét chấm, đầu mũi tên mở theo hướng dữ liệu; không truyền token điều khiển |
| Default / conditional | Slash mặc định hoặc kim cương rỗng tại nguồn activity khi áp dụng; điều kiện ra gateway không dùng kim cương activity |

Bản thường và bản màu giữ cùng ID, nhãn, container, tọa độ và kết nối. Tô màu không đổi marker, kiểu nét, đầu mũi tên hoặc độ dày vòng event; làm ẩn nét/chữ (`none`) hoặc cho fill trùng màu nét ở event có marker bị coi là lỗi ký pháp, không phải đổi màu. CLI nhận tên profile hoặc file JSON tùy biến, với schema màu và kiểm tra tương phản. Colorizer/auditor/legend đọc cùng một nguồn cấu hình. Xem [theme](references/themes.md).

## Dùng bộ công cụ hiện tại

Cần Python **3.10+**, Chrome/Chromium và draw.io source có viewer. Core dùng standard library; Git cần cho checkout, còn source archive dùng manifest commit/viewer digest. Môi trường đã thử: Linux, Python 3.14.4, Chrome 155 (rc.1) và 156 (rc.2), font Arial (fc-match trả về Arial.ttf). Chưa khẳng định Windows/macOS đã được kiểm thử.

Chạy từ thư mục skill; thay `PATH_TO_DRAWIO` bằng vị trí thật. Ví dụ tổng hợp tự sinh không cần bài thi hay file chuẩn trong workspace cũ:

```bash
python3 scripts/doctor.py --drawio-root PATH_TO_DRAWIO --output-dir output
python3 scripts/create_demo.py --output-dir output/demo
python3 scripts/render_drawio.py output/demo/Demo.drawio --drawio-root PATH_TO_DRAWIO --output-dir output/normal --text-mode plain --pdf
python3 scripts/render_drawio.py output/demo/Demo_Co_mau.drawio --drawio-root PATH_TO_DRAWIO --output-dir output/color --text-mode plain --pdf
python3 scripts/audit_drawio.py output/demo/Demo.drawio --render-dir output/normal --palette monochrome --strict-layout --require-supported --report output/check-normal.json
python3 scripts/audit_drawio.py output/demo/Demo_Co_mau.drawio --render-dir output/color --compare output/demo/Demo.drawio --palette bizagi-inspired --strict-layout --require-supported --report output/check-color.json
```

`--chrome PATH` chọn browser; `--source-manifest assets/drawio-source.json` xác nhận commit/digest khi dùng bản source tương ứng. Không tự tải hoặc cập nhật draw.io. Source XML giữ nguyên; `--text-mode plain` dùng SVG text thay HTML labels trong bản dựng, có thể làm phẳng định dạng phong phú. PDF một trang theo kích thước nội dung; việc điền mẫu/A3/Letter vẫn theo yêu cầu riêng.

Đổi theme của file bất kỳ:

```bash
python3 scripts/colorize_drawio.py source.drawio normal.drawio --theme monochrome
python3 scripts/colorize_drawio.py normal.drawio color.drawio --theme bizagi-inspired
```

File `.drawio` là mxGraph documentation, không phải BPMN XML thực thi. Builder chưa tự suy nghiệp vụ hoặc tự layout. Kiểm tra nhãn/containment là chọn lọc; cần đọc ảnh trước bàn giao.

## Kiểm thử và tạo gói

```bash
python3 scripts/run_checks.py --report output/unit-checks.json
python3 scripts/run_checks.py --render --drawio-root PATH_TO_DRAWIO --output-dir output/integration --report output/render-checks.json
python3 scripts/package_skill.py --output-dir output/candidate
python3 scripts/smoke_package.py output/candidate/bpmn-drawio-1.0.0-rc.2-candidate.zip --drawio-root PATH_TO_DRAWIO --report output/candidate/smoke.json
```

Test nhanh độc lập; test render dùng viewer thật, xuất cả hai theme, 10 mẫu hai phiên bản, association và bốn trang layout control (một sạch, ba cố ý sai), kiểm tra PDF nếu có `pdfimages`/`pdftotext` (thiếu thì ghi skipped). Báo cáo tách expected rejection, unsupported, manual review và layout. CI đã có cấu hình ở repository phát triển; chưa coi cấu hình là bằng chứng CI từ xa đã chạy.

Gói ZIP dùng allowlist, bỏ cache/profile browser/vendor và kiểm tra định danh sinh viên/đường dẫn máy không chủ đích. Có MANIFEST nội bộ, SHA-256 ngoài ZIP và timestamp ổn định để tái tạo gói. `smoke_package.py` giải nén vào thư mục mới, từ chối entry nguy hiểm, so từng hash và digest công cụ với manifest, chạy lại unit test và (khi có `--drawio-root`) tạo, dựng, audit demo từ bản giải nén. Gói luôn là **candidate**; không có thao tác tự xuất bản.

Viewer tham chiếu trong workspace hiện tại: draw.io `32.5.5`, commit `17b367b91dbab91804f852645788d7ffb46dcb79`. Đây là phiên bản đã dùng, không phải tuyên bố tương thích mọi phiên bản. Renderer ghi cả commit và SHA-256 của viewer trong bằng chứng; chưa tự ép người dùng dùng commit này.

## Mức xác nhận

Test suite (75 ca nhanh) kiểm tra parser/theme/canonical, ma trận event, kết nối, nhận diện, bố cục, đóng gói và cú pháp Python 3.10. Render integration xuất 28 trang qua viewer thật và kiểm tra hai PDF demo. rc.2 được rà bằng 41 ca ký pháp mới và một quy trình mượn sách liên thư viện tự đặt có đọc ảnh; mã rc.1 chỉ xử lý đúng 15/41 ca đó. Đây là tự rà của cùng tác giả, chưa phải đánh giá độc lập.

Số ca và hash thực tế nằm trong báo cáo đi kèm ứng viên của repository phát triển; bộ test có thể chạy lại từ ZIP. Chỉ có phạm vi đã thử, không có chứng nhận OMG, proof soundness, stakeholder sign-off hoặc khẳng định đã thử mọi OS. Các pattern nâng cao vẫn có manual-review notes. Xem [coverage](references/coverage.md).

## Nguồn tham khảo và tư tưởng kế thừa

Các nguồn dưới đây được kiểm tra khi lập kế hoạch ngày 22/10/2026. Ghi nguồn không hàm ý được các tổ chức đó chứng nhận hoặc bảo trợ.

| Nguồn | Dùng cho phần nào |
|---|---|
| [OMG BPMN 2.0.2](https://www.omg.org/spec/BPMN/2.0.2/PDF) | Nguồn chuẩn cho notation/semantics; §7.5 màu/viền, §7.6 kết nối, phần Collaboration và Process |
| [draw.io BPMN 2.0](https://www.drawio.com/docs/diagram-types/bpmn-2-0/) | Thư viện hình, pool/lane và thao tác trong công cụ |
| [Mã nguồn draw.io tại commit đã dùng](https://github.com/jgraph/drawio/tree/17b367b91dbab91804f852645788d7ffb46dcb79) | Đối chiếu implementation của hình/marker và viewer; không dùng implementation thay chuẩn nghiệp vụ |
| [Bizagi Events](https://help.bizagi.com/platform/en/events.htm) | Phân biệt trigger/result, catch/throw và cách nhận diện event |
| [Bizagi Quick Reference Guide](https://www.bizagi.com/files/live/sites/bizagi/files/PDFs/BPMN_Quick_Reference_Guide.pdf) | Tra nhanh hình và cảm hứng phân nhóm màu; không lấy mã hex hoặc sao chép bộ hình thương hiệu |
| [Bizagi Best Practices](https://help.bizagi.com/platform/en/best-practices-in-process-mode.htm) | Tham khảo cách đặt tên, phân vai và bố cục; rà lại theo phạm vi mô hình |
| [Bizagi Guidance for Automation](https://help.bizagi.com/platform/en/guidance_for_automation.htm) | Phân biệt mô hình hóa với tập phần tử công cụ thực thi hỗ trợ |
| [IIBA BABOK Glossary](https://www.iiba.org/career-resources/a-business-analysis-professionals-foundation-for-success/babok/glossary/) | Phân biệt verification và validation; không gọi kiểm tra ký pháp là xác nhận nghiệp vụ |

Gói phát hành dự kiến chỉ chứa mã nguồn do dự án quản lý, tài liệu tự viết và ví dụ tổng hợp. Tài liệu OMG/Bizagi ưu tiên liên kết về nguồn chính thức. Skill dùng giấy phép [Apache-2.0](LICENSE); khi phân phối lại phải giữ LICENSE và [NOTICE](NOTICE) (dòng bản quyền của tác giả). Giấy phép này chỉ áp dụng cho nội dung trong gói; draw.io, OMG và Bizagi giữ điều kiện riêng, xem [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Xem danh sách việc cần làm và điều kiện phát hành trong [kế hoạch](references/publication-plan.md).
