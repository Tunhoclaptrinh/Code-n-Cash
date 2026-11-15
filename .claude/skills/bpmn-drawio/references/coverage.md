# Phạm vi hỗ trợ — 1.0.0-rc.2

Mục tiêu: tài liệu hóa **Process và Collaboration theo BPMN 2.0.2** trong draw.io. Đây là tập kiểm tra chọn lọc, không phải engine hoặc chứng nhận toàn bộ chuẩn. Nguồn quy tắc/trang ở [bpmn-rules.md](bpmn-rules.md); nguồn implementation ở [drawio-workflow.md](drawio-workflow.md).

| Nhóm | Hình native / nguồn OMG | Tự động kiểm tra hiện có | Vẫn cần review |
|---|---|---|---|
| Participant / lane | swimlane, `mxgraph.bpmn.swimlane`; §9.3–9.4 | parent tồn tại; sequence không vượt pool/scope; route; containment theo metrics | Participant thật, role, phạm vi white/black box, nested lane |
| Task types | task2/taskMarker; §10.3.3–4 | marker khớp metadata; envelope send/receive trên SVG; tương phản marker | Ai thực hiện, task vật lý/thông tin, service/user/manual phù hợp |
| Call Activity | task2 `bpmnShapeType=call`; §10.3.6 | nhận diện từ viền dày (không còn lẫn với task); flow/boundary như activity; metadata mâu thuẫn bị từ chối | Process/global task được gọi, ánh xạ dữ liệu — luôn có manual-review note |
| Start / intermediate / boundary / end | event; §10.5.2–10.5.6, Bảng 10.84–10.93 | ma trận trigger/result theo **vị trí** (start cấp cao, start subprocess, start event-subprocess ngắt/không ngắt, catch, throw, boundary ngắt/không ngắt, end); vòng mảnh/kép/đậm, boundary liền/đứt trên SVG; metadata trái outline; symbol renderer không vẽ → unsupported | Thời điểm chờ, correlation, nội dung trigger, scope của terminate/escalation/signal |
| Kết nối của event | §10.5.4, §10.6.1 | message chỉ rời event ném/end Message–Multiple, chỉ vào event bắt Message–Multiple–Parallel Multiple; event trung gian không vừa nhận vừa gửi message; boundary (trừ compensation) phải có sequence ra; event trung gian trong luồng thường phải có vào và ra | Message đến sớm/muộn/trùng; nhiều message vào cùng một catch (manual note) |
| Link | §10.5.4 | throw không có sequence ra, catch không có sequence vào; mỗi throw có đúng một catch cùng tên **trong cùng process level**; reachability đi qua cặp link | Tên link mơ hồ; link catch không có nguồn (manual note) |
| XOR / AND | gateway2; §10.6 | glyph metadata; gateway phải tách hoặc gộp (≥2 vào hoặc ≥2 ra); conditional/default chọn lọc | Predicate đầy đủ, độc quyền, token/join và deadlock |
| Inclusive / event-based / complex | gateway2; §10.6 | nhận diện; OR marker; successor của exclusive event race thông dụng | Active-branch synchronization, complex conditions, instantiating/parallel event race |
| Subprocess / event subprocess | task2; §10.3.5 | sequence scope; event subprocess không nối ngoài; một triggered start; trigger theo ma trận | Entry/exit contract, internal paths, interrupt scope |
| Transaction / compensation | task2/transaction; §10.3.5, 10.7 | cancel chỉ với transaction; compensation boundary/association/marker | Protocol rollback, thứ tự, thành công/thất bại compensation |
| Loop / multi-instance | task marker; §10.3, 10.7 | vẽ/nhận diện ở ví dụ, container/flow chung | Cardinality, collection, completion condition, token semantics |
| Sequence flow | solid/filled; §8.4.13 | endpoint, pool/scope, hướng start/end, nét/arrow trên XML và SVG | Điều kiện thực thi, default/exhaustiveness, dữ liệu có sẵn |
| Message flow | dashed/open circle/open head; §9.4 | khác participant, đầu nối, nét/arrow và SVG; template palette `endFill=1` bị từ chối | Message contract, nhận/gửi thật |
| Association/data association | dotted/open; §8.4, 10.3 | đầu mở, dash pattern, nét chấm trên SVG, endpoint dữ liệu chọn lọc | Data inputs/outputs và binding |
| Data object/store | data2/datastore; §8, 10 | đọc, theme, liên kết chọn lọc | Dữ liệu, lifecycle, ownership |
| Palette và normal/color | JSON theme; OMG §7.5 chỉ cho phép tùy biến | contrast theme; fill/header/body/ink/label; canonical chỉ bỏ **giá trị** màu — ẩn nét/chữ (`none`) bị coi là đổi nội dung; nét/chữ ẩn và marker thiếu tương phản bị từ chối | In xám, chú giải, yêu cầu riêng của giảng viên/tổ chức |
| Layout / artifact freshness | render metrics / SHA-256 | source/SVG hash; phiên bản và digest công cụ; route/overlap; nhãn chồng hình/nhãn; nhãn tràn hình của chính nó; nhãn ra ngoài lane/pool/subprocess; nhãn vắt biên container; connector cắt nhãn; hai connector chạy chồng như nhập nhánh | Bo góc, glyph chính xác, giao cắt vuông góc, readability khi in |

## Trạng thái chưa hỗ trợ đầy đủ

- Choreography, Conversation, custom/legacy shapes hoặc loại lạ cần review riêng. Khi có metadata loại chưa biết, auditor đưa vào `unsupported_elements`; `--require-supported` biến việc đó thành failure. Phân tích mở rộng nằm ở [publication-plan.md](publication-plan.md).
- Event-based glyph khác cấu hình exclusive non-instantiating thông dụng được liệt kê unsupported.
- Event symbol renderer không vẽ (ví dụ `terminate2`, `star`) được liệt kê unsupported, không tự quy thành None.
- Các loại được nhận diện vẫn có thể chỉ có kiểm tra một phần. `unsupported_elements=[]` không có nghĩa toàn bộ semantic constraints đã được chứng minh. Tên link so khớp theo nhãn hiển thị (bỏ khoảng trắng/HTML, không phân biệt hoa thường), không theo thuộc tính ẩn.
- Dotted pattern thiếu ở native association cần đọc hình. Điều kiện/default và metadata thiếu không thể suy ra toàn bộ từ nhãn tự do.
- Không có BPMN XSD/DI import-export, thực thi, phân tích Petri net, proof soundness, tự layout hoặc xác nhận nghiệp vụ từ stakeholder.

## Bằng chứng có thể tái tạo

`python3 scripts/run_checks.py` chạy các ca tổng hợp đúng/sai. Thêm `--render --drawio-root SOURCE --output-dir EVIDENCE --report EVIDENCE/checks.json` để kiểm tra ảnh thật: demo hai theme, 10 pattern hai phiên bản, hai association, bốn trang layout control và PDF (bỏ qua có ghi lý do khi thiếu poppler). `scripts/smoke_package.py` lặp lại từ ZIP giải nén. Manual-review notes phải được giữ nguyên trong báo cáo.

Không đổi business scenario hoặc ký hiệu để làm checker pass. Nếu checker có false positive, nêu đúng giới hạn và sửa rule/test có căn cứ.
