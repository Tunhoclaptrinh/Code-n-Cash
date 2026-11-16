# 02_Data: Dữ liệu

## 1. Data Pack của BTC (dữ liệu đầu vào chính)

`BangD-Case4/` là bản nguyên trạng BTC phát hành (đề thi PDF và Data Pack, snapshot 18/10/2026). Đội không sửa tệp nào. Bản trong `01_SourceCode/BangD-Case4/` giống hệt, để mã nguồn chạy được ngay.

| Tệp | Số dòng | Nội dung | Dùng ở đâu |
|---|---|---|---|
| `01_data/contracts.csv` | 100 | Hợp đồng: bên mua, nhà cung cấp, giá trị, loại, chính sách duyệt, tham số phạt mặc định | Engine, ứng dụng |
| `01_data/parties.csv` | 65 | 10 bên mua, 25 nhà cung cấp, 30 người phê duyệt (3 vai trò cho mỗi bên mua) | Thẩm quyền lập chứng từ và phê duyệt; sinh tài khoản demo |
| `01_data/milestones.csv` | 405 | Mốc thanh toán: hạn, ân hạn, mức phạt, trần phạt, chứng từ bắt buộc, quorum, vai trò duyệt | Engine |
| `01_data/events.csv` | 1.134 | Sự kiện: giao hàng, nghiệm thu, hoá đơn, phê duyệt, từ chối, mở và đóng tranh chấp | Engine |
| `01_data/payment_rules.csv` | 128 | 8 luật × 16 phạm vi, chạy theo ưu tiên, dừng ở luật đầu tiên khớp | Engine |
| `03_labels_sample/decision_sample.csv` | 20 | Mẫu có nhãn công khai | Đo KPI (`03_Output/02_doi_chieu_20_mau/`) |
| `04_output_templates/submission_output_template.csv` | 405 | Mẫu 22 cột của bài nộp | Engine điền đúng mẫu này |

Ghi chú về Data Pack:
- README của Data Pack ghi `04_output_template/` và `dataset_manifest.csv`; bản phát hành thực tế là `04_output_templates/` và `dataset_manifest_final.csv`. Engine đọc theo bản thực tế.
- 267 sự kiện có thời điểm sau ngày snapshot 18/10/2026. Engine dùng toàn bộ lịch sử (ghi `offline_full_history` trong cột `notes`); ảnh hưởng nếu cắt theo snapshot được đo ở `03_Output/05_kiem_chung_nghiep_vu/nhat_ky_chay.txt`.

## 2. Dữ liệu bổ sung của ứng dụng web

Data Pack không có người dùng và thứ tự ký, nên ứng dụng thêm dữ liệu mẫu có đánh dấu nguồn. Mỗi bản ghi mang trường `origin`:

| `origin` | Ý nghĩa |
|---|---|
| `DATA_PACK` | Nhập nguyên cột từ Data Pack; niêm phong bằng SHA-256 khi nạp, không sửa được, không lập phụ lục |
| `SEED` | Dữ liệu mẫu đội thêm: tài khoản, tổ chức, thứ tự ký, 4 hợp đồng demo |
| `APP` | Do người dùng tạo khi thao tác trên ứng dụng |

Dữ liệu `SEED` sinh trong mã nguồn (`01_SourceCode/apps/api/src/domain/seed.ts` và `accounts.ts`) mỗi lần khởi tạo hoặc "Khôi phục dữ liệu demo", nên không có tệp dữ liệu riêng:

- **102 tài khoản**: danh sách ở `du_lieu_bo_sung/tai_khoan_demo.csv`. Gồm:
  - 30 người phê duyệt của Data Pack;
  - mỗi bên mua một cán bộ hợp đồng và một kiểm soát viên (20);
  - mỗi nhà cung cấp một tài khoản và một kiểm soát viên (50);
  - quản trị hệ thống và kiểm toán (2).

  Họ tên là tên mô phỏng sinh cố định. Mật khẩu local chung `Passw0rd!` chỉ dùng cho dữ liệu mẫu.
- **4 hợp đồng demo** của Nova An (bên mua B010) với Phú Minh (nhà cung cấp S015):

| Mã | Nội dung | Trạng thái ban đầu | Dùng để demo |
|---|---|---|---|
| CT0101 | Mua sắm thiết bị phòng thực hành, 2.400 triệu | Đã tải lên, chưa số hoá | Số hoá điều khoản, đặt vị trí ký |
| CT0102 | Triển khai phần mềm quản lý đào tạo, 3.200 triệu | Đang ký: chủ hợp đồng đã ký, tới lượt nhà cung cấp, cuối cùng là duyệt cấp 2 | Ký theo trình tự |
| CT0103 | Cung cấp thiết bị mạng cho phòng lab, 1.850 triệu | Đã ký; mốc 2 giao hàng 16/10, trễ 2 ngày sau ân hạn, chủ hợp đồng đã duyệt, chờ duyệt tài chính | Trường hợp điển hình: chạy thử, phê duyệt, chi sau trừ phạt |
| CT0104 | Bảo trì hạ tầng máy chủ năm 2026, 960 triệu | Mốc kích hoạt đã duyệt; mốc hoàn tất dịch vụ quá hạn, chưa có chứng từ | Mốc quá hạn, việc cần làm |

## 3. Dữ liệu cho kịch bản kiểm chứng

`06_Demo/kich_ban_kiem_chung/Kxx_*/du_lieu/` là các bản sao Data Pack, mỗi bản sửa đúng một dữ kiện (xoá hoặc thêm sự kiện, đổi tham số, đổi bên lập chứng từ). Mô tả và kết quả: `06_Demo/kich_ban_kiem_chung/KET_QUA_KIEM_CHUNG.md`.
