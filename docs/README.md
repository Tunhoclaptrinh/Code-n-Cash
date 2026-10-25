# Smart Contract Workflow — tài liệu đội thi

**Festival Chuyển đổi số 2026 · Bảng D · Case 4 · Vòng sơ khảo Blueprint**

Đội **6 người**, chuẩn bị bài trong **7 ngày**. Đọc [note tổng thể](note.md), sau đó dùng [kế hoạch và checklist](03_LO_TRINH_VA_CHECKLIST_NOP_BAI.md) để thống nhất phạm vi, phân vai và tiến độ.

| Tài liệu | Nội dung |
| --- | --- |
| [01 — Đề bài và thuật ngữ](01_DE_BAI_VA_THUAT_NGU.md) | Giải thích bài toán, decision flow và ví dụ đối chiếu sample |
| [02 — Chiến lược kỹ thuật](02_CHIEN_LUOC_BRONZE_SILVER_GOLD.md) | Bronze/Silver/Gold, engine, quyền, audit, ký số và AI |
| [03 — Lộ trình và checklist](03_LO_TRINH_VA_CHECKLIST_NOP_BAI.md) | Phương án tổng thể, phân công sáu người, lịch bảy ngày và đầu ra |
| [04 — Đặc tả nghiệp vụ](04_DAC_TA_NGHIEP_VU.md) (v1.1) | **Nguồn chuẩn** về quy tắc quyết định, thẩm quyền, trạng thái, xử lý ngoại lệ, phân quyền, đầu ra; kiểm chứng bằng [`tools/kiem_chung_nghiep_vu.py`](../tools/kiem_chung_nghiep_vu.py) và [`tests/`](../tests/test_dac_ta_nghiep_vu.py). Bản cũ ở [archive/nghiep-vu](archive/nghiep-vu/) |
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

- [11 — Rà soát hoàn thiện và kịch bản kiểm thử](11_RA_SOAT_VA_KICH_BAN_HOAN_THIEN.md)

- [12 — Phân quyền và preview tài liệu thực](12_PHAN_QUYEN_VA_PREVIEW_TAI_LIEU.md)

- [13 — Mẫu hợp đồng động và adapter ký](13_MAU_HOP_DONG_DONG_VA_TICH_HOP_KY.md)

- [14 — Rà soát theo BTC, ưu tiên Đồng → Bạc → Vàng](14_RA_SOAT_BTC_DONG_BAC_VANG.md)
- [15 — Xác nhận BTC và giả định còn mở](15_XAC_NHAN_BTC_VA_GIA_DINH.md)
- [16 — Đối chiếu 8 loại mốc chưa có sample](16_DOI_CHIEU_CAC_LOAI_MOC_CHUA_CO_SAMPLE.md)

- [17 — Tinh gọn form, đồng bộ UI và báo cáo kiểm thử](17_TINH_GON_FORM_VA_DONG_BO_UI.md)

- [18 — PDF hợp đồng mẫu và nút thao tác theo base](18_PDF_MAU_VA_NUT_THAO_TAC.md)

- [19 — Điều kiện, công thức và từ điển biến quy tắc](19_DIEU_KIEN_CONG_THUC_VA_BIEN_QUY_TAC.md)

- [20 — Kiểm chứng công thức, biến và tham số thực thi](20_KIEM_CHUNG_CONG_THUC_VA_THAM_SO.md)

- [21 — Hợp nhất tính năng và rà soát nút](21_HOP_NHAT_TINH_NANG_VA_RA_SOAT_NUT.md)

- [22 — Đồng bộ nút và mật độ giao diện](22_DONG_BO_NUT_VA_MAT_DO_GIAO_DIEN.md)
- [23 — Đề xuất ứng dụng Gemini](23_DE_XUAT_UNG_DUNG_GEMINI.md)

- [24 — PDF thật, vị trí ký và tích hợp Gemini](24_PDF_THAT_VI_TRI_KY_VA_GEMINI.md)

- [25 — Preview, vùng ký đúng người và bộ mẫu tải trong hướng dẫn](25_RA_SOAT_PREVIEW_VUNG_KY_VA_BO_MAU.md)

- [26 — Kiểm tra trực quan và tinh gọn giao diện](26_KIEM_TRA_TRUC_QUAN_VA_TINH_GON_GIAO_DIEN.md)
