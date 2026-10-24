# Smart Contract Workflow — tài liệu đội thi

**Festival Chuyển đổi số 2026 · Bảng D · Case 4 · Vòng sơ khảo Blueprint**

Đội **6 người**, chuẩn bị bài trong **7 ngày**. Đọc [note tổng thể](note.md), sau đó dùng [kế hoạch và checklist](03_LO_TRINH_VA_CHECKLIST_NOP_BAI.md) để thống nhất phạm vi, phân vai và tiến độ.

| Tài liệu | Nội dung |
| --- | --- |
| [01 — Đề bài và thuật ngữ](01_DE_BAI_VA_THUAT_NGU.md) | Giải thích bài toán, decision flow và ví dụ đối chiếu sample |
| [02 — Chiến lược kỹ thuật](02_CHIEN_LUOC_BRONZE_SILVER_GOLD.md) | Bronze/Silver/Gold, engine, quyền, audit, ký số và AI |
| [03 — Lộ trình và checklist](03_LO_TRINH_VA_CHECKLIST_NOP_BAI.md) | Phương án tổng thể, phân công sáu người, lịch bảy ngày và đầu ra |
| [04 — Đặc tả nghiệp vụ](04_DAC_TA_NGHIEP_VU.md) (v1.0) | **Nguồn chuẩn** về quy tắc quyết định, thẩm quyền, trạng thái, xử lý ngoại lệ, phân quyền, đầu ra; kiểm chứng bằng [`tools/kiem_chung_nghiep_vu.py`](../tools/kiem_chung_nghiep_vu.py) và [`tests/`](../tests/test_dac_ta_nghiep_vu.py). Bản cũ ở [archive/nghiep-vu](archive/nghiep-vu/) |
| [05 — Hướng dẫn đọc và việc còn mở](05_HUONG_DAN_DOC_VA_VIEC_CON_MO.md) | Thứ tự đọc đặc tả theo vai trò, việc còn dở (P0/P1/P2), điểm cần BTC hoặc đội quyết, bản nháp câu hỏi gửi BTC |
| [06 — Kiến trúc monorepo](06_KIEN_TRUC_MONOREPO_VA_TAI_SU_DUNG.md) | Web/API/engine, phần tái sử dụng từ UniFlow, ranh giới trách nhiệm, CRUD và phân quyền |
| [07 — Triển khai](07_HUONG_DAN_TRIEN_KHAI.md) | Docker Compose production, HTTPS, sao lưu, cập nhật/quay lui, xử lý sự cố |
| [08 — Phát triển giao diện](08_HUONG_DAN_PHAT_TRIEN_UI.md) | Layout, thêm màn hình, chọn thành phần, token màu/dark mode, i18n, kiểm tra trước PR |
| [09 — Tính năng và vai trò](09_HUONG_DAN_TINH_NANG_VA_VAI_TRO.md) | App làm gì, từng vai trò thấy và làm gì, tài khoản demo, kịch bản demo đã chạy thử, KPI đo được, giới hạn, đề xuất để thắng, câu hỏi 30 giây |
| [Hướng dẫn có ảnh](../apps/web/src/guide/vi/start.md) | 15 chủ đề Việt/Anh, đăng nhập, vai trò và từng màn; đọc trong app hoặc Markdown, ảnh bấm phóng lớn trong app |
| [10 — Rules, AI, ký số và niêm phong](10_RULES_AI_KY_SO_VA_NIEM_PHONG.md) | Hiện trạng theo mã nguồn, đường tham số xuống engine, thiết kế extractor/provider ký/TSA/blockchain và cách demo đúng phạm vi |
| [Class diagram Data Pack](diagrams/datapack-class-diagram.md) | Đủ 10 CSV, 182 cột, 22 quan hệ; khóa, bội số, metadata, tham chiếu danh sách; SVG/PDF, draw.io và Mermaid; 65 kiểm tra trên dữ liệu nguồn |
| [Proposal outline](templates/PROPOSAL_OUTLINE.md) | Khung proposal 5–10 trang |
| [Slide structure](templates/SLIDE_STRUCTURE.md) | Khung slide tối đa 15 trang |

Nguồn chuẩn: [PDF đề thi](../BangD-Case4/DeThi2026_BangD_SmartContractWorkflow.pdf), [Data Pack README](../BangD-Case4/DataPack-CASE4_SmartContractWorkflow/README.md), [dictionary](../BangD-Case4/DataPack-CASE4_SmartContractWorkflow/02_metadata/data_dictionary.csv), [manifest](../BangD-Case4/DataPack-CASE4_SmartContractWorkflow/02_metadata/dataset_manifest_final.csv).

Dữ liệu đã đếm từ CSV: **100 contracts, 65 parties, 405 milestones, 128 rules, 1.134 events, 20 mẫu công khai**. [Output template](../BangD-Case4/DataPack-CASE4_SmartContractWorkflow/04_output_templates/submission_output_template.csv) có **405 dòng và 22 cột**. Đây là thông tin dữ liệu, chưa phải kết quả chạy engine.

Ưu tiên lõi đúng, dashboard tối thiểu và minh chứng. Không suy accuracy toàn bộ từ 20 mẫu. Hai PDF là hồ sơ bắt buộc theo mục 8 đề thi; cách gửi CSV/source/video theo thông báo BTC. Proposal cần roadmap MVP **2–3 tuần**, tách khỏi lịch chuẩn bị bài **7 ngày**.

- [19 — Điều kiện, công thức và từ điển biến quy tắc](19_DIEU_KIEN_CONG_THUC_VA_BIEN_QUY_TAC.md)
