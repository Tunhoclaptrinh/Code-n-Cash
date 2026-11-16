# CodeAndCash_VONG3: Gói sản phẩm Vòng 3

**Đội:** Code & Cash · **Sản phẩm:** CodeCash · Festival Chuyển đổi số 2026 · Bảng D · Case 4: Smart Contract Workflow.

CodeCash chạy hợp đồng có điều kiện thanh toán từ ký đến chi. Mỗi thao tác (ký, nộp chứng từ, phê duyệt, mở hoặc đóng tranh chấp) là một sự kiện. Sau mỗi sự kiện, engine Python chấm lại mốc thanh toán theo bộ luật và ra một trong bốn quyết định: **Chi đủ / Chi sau trừ phạt / Tạm giữ / Từ chối**, kèm số tiền, lý do, luật áp dụng và chứng từ làm căn cứ. Chưa đủ căn cứ thì không chi; mọi quyết định đều truy vết và chạy lại được.

## Kết quả chính trên Data Pack của BTC

| Chỉ số | Kết quả | Tệp chứng minh |
|---|---|---|
| Phạm vi | 100 hợp đồng, 405 mốc, 1.134 sự kiện, 128 luật | `03_Output/01_ket_qua_data_pack/metrics.json` |
| Quyết định trên 405 mốc | Chi đủ 348 · Tạm giữ 36 · Chi sau trừ phạt 15 · Từ chối 6 | `03_Output/01_ket_qua_data_pack/submission_output.csv` |
| Tiền | Chi 365.785,87 triệu · phạt 102,13 triệu · 42 mốc (56.452 triệu) không bị chi khi chưa đủ điều kiện | như trên |
| 20 mẫu có nhãn | 20/20 khớp quyết định, mã lý do, tiền chi, tiền phạt | `03_Output/02_doi_chieu_20_mau/` |
| Chi sai (Unauthorized Payment) | 0/10 trên 20 mẫu; 0/4.044 trên bộ ca tổng hợp | `03_Output/01_ket_qua_data_pack/metrics.json`, `03_Output/03_bo_ca_tong_hop/` |
| Truy vết | 405/405 dòng có luật, căn cứ và trace | `03_Output/01_ket_qua_data_pack/audit.json` |
| Bất biến | 0 vi phạm (không chi khi thiếu điều kiện, tiền không âm, phạt không vượt trần) | `03_Output/05_kiem_chung_nghiep_vu/` |
| Kiểm thử | 211 test Python, các bộ test API/workflow/nhật ký, 22 test giao diện; 16 lỗi cài vào engine | `05_Test/BAO_CAO_KIEM_THU.md` |

Giới hạn quan trọng nhất, nói trước: 20/20 là trên tập đã nhìn thấy khi viết engine; bộ ca tổng hợp do đội gán đáp án nên chỉ đo độ phủ. Độ chính xác thật do 250 mốc ẩn và 135 mốc holdout của BTC quyết định. Chi tiết ở `04_Document/TAI_LIEU_SAN_PHAM.md` mục 8.

## Cấu trúc gói

```text
CodeAndCash_VONG3/
├── README.md                  Tệp này
├── TINH_TRANG_GOI_NOP.md      Thời điểm đóng gói, commit, kết quả quét bảo mật, tài liệu còn thiếu
├── 01_SourceCode/             Mã nguồn đội xây dựng, chạy được ngay (xem README.md bên trong)
├── 02_Data/                   Data Pack BTC (nguyên bản) và mô tả dữ liệu bổ sung của ứng dụng
├── 03_Output/                 Đầu ra engine theo mẫu BTC, KPI, trace, đối chiếu 20 mẫu, bộ ca tổng hợp
├── 04_Document/               Tài liệu sản phẩm, đặc tả nghiệp vụ, hướng dẫn sử dụng có ảnh, sơ đồ, slide
├── 05_Test/                   Báo cáo kiểm thử, nhật ký chạy test, mã kiểm thử
└── 06_Demo/                   Ảnh màn hình từng bước demo, tài khoản demo, kịch bản kiểm chứng, video
```

## Kiểm tra nhanh trong 5 phút (không cần cài thư viện)

Yêu cầu: Python 3.9 trở lên. Engine chỉ dùng thư viện chuẩn.

```bash
cd 01_SourceCode

# 1. Chạy engine trên Data Pack: 405 dòng theo mẫu BTC, trace, KPI
python apps/engine/cli.py --output out
#    So với 03_Output/01_ket_qua_data_pack/ (trừ cột thời gian xử lý và evaluated_at, mọi cột trùng khớp)

# 2. Kiểm mẫu và bất biến trên 405 mốc
python tools/kiem_chung_nghiep_vu.py --check

# 3. Sửa một dữ kiện rồi chạy lại: xoá biên bản nghiệm thu của mốc MS0029
python apps/engine/cli.py --data ../06_Demo/kich_ban_kiem_chung/K01_XOA_NGHIEM_THU/du_lieu --output out-k01
#    MS0029 chuyển từ Chi đủ 4.220 triệu sang Tạm giữ, lý do thiếu ACCEPTANCE

# 4. Kiểm độc lập gói kiểm chứng của hợp đồng CT0005: so niêm phong và chạy lại từng quyết định
python tools/verify_decision.py ../03_Output/07_goi_kiem_chung_mau/verification_CT0005.json
#    Mỗi mốc phải báo "seal": "MATCH" và "rerun": "MATCH"
```

Chạy giao diện web: `01_SourceCode/README.md` mục "Cài đặt và chạy" (Node.js 24, pnpm). Đăng nhập bằng menu **Tài khoản demo**; danh sách tài khoản ở `06_Demo/tai_khoan_demo.csv`.

## Phần đội xây dựng và phần bên ngoài

| Đội xây dựng | Bên ngoài (thư viện, dịch vụ, mô phỏng) |
|---|---|
| Engine 9 bước và cách đọc bộ luật, policy pack, tính tiền bằng Decimal | React, Ant Design, NestJS, MongoDB, LibreOffice, Poppler (thư viện và công cụ nền) |
| Phân quyền 8 vai trò, workflow, ngoại lệ hai người | Google Gemini API: tuỳ chọn, chỉ đề xuất 6 điều khoản từ PDF |
| Nhật ký chuỗi băm, niêm phong, neo Merkle, gói kiểm chứng | Ký số: chứng thư mô phỏng; cổng thanh toán: mô phỏng |
| Giao diện theo vai trò, trang Kết quả Data Pack | Dấu thời gian RFC 3161: tuỳ chọn, dịch vụ bên ngoài |
| Bộ ca tổng hợp, kiểm thử đột biến, công cụ kiểm chứng độc lập | Bộ luật 128 dòng và Data Pack: của BTC, giữ nguyên |

## Đối chiếu yêu cầu của BTC (thông báo chuẩn bị Vòng 3)

Theo đúng thứ tự các mục trong thông báo. Đường dẫn tính từ thư mục gốc của gói. "Slide tr. N" là trang N của bộ slide trong `04_Document/Slide/`: trang 1–12 giống nhau ở `CodeCash_Slide_V3.pptx` và `CodeCash_Vong3.pptx`; trang 13 và phụ lục (tr. 14–30) chỉ có trong `CodeCash_Vong3.pptx`. Ghi chú trong ngoặc: mục không có, có tài liệu thay thế, hoặc đội phải tự chuẩn bị.

### Mục 2. Slide trình bày

| Yêu cầu | Vị trí |
|---|---|
| Sản phẩm giải quyết vấn đề gì? | Slide tr. 3; `04_Document/TAI_LIEU_SAN_PHAM.md` mục 1 |
| Ai là người sử dụng? | Slide tr. 3; `TAI_LIEU_SAN_PHAM.md` mục 1 |
| Sản phẩm có những chức năng chính nào? | Slide tr. 4, tr. 12; `TAI_LIEU_SAN_PHAM.md` mục 4 |
| Công nghệ được sử dụng ở đâu và để làm gì? | Slide tr. 4, tr. 30 (phụ lục D3); `TAI_LIEU_SAN_PHAM.md` mục 5 |
| Sản phẩm đã chạy được đến mức nào? | Slide tr. 6–9 (demo), tr. 12 (Đã triển khai / Mô phỏng / Định hướng) |
| Kết quả/KPI đạt được ra sao? | Slide tr. 10, tr. 11, tr. 28 (phụ lục D1) |
| Giá trị thực tế của sản phẩm là gì? | Slide tr. 12, tr. 13 |
| a. Problem & Value | Slide tr. 3 |
| b. Solution Overview | Slide tr. 4; chi tiết ở phụ lục A1–A3 (tr. 15–17), C1–C2 (tr. 25–26) |
| c. Key Features: chức năng đã chạy và chức năng định hướng | Slide tr. 12 (không có trang riêng tên Key Features; ba cột trạng thái ở tr. 12 thay thế. Bản HTML có trang riêng: `04_Document/pitch/CodeCash_Vong3_Pitch.html` trang 8) |
| d. MVP / Product | Slide tr. 6–8; ảnh màn hình `06_Demo/Anh_man_hinh/` |
| e. Evidence & KPI | Slide tr. 10, tr. 11, tr. 28, tr. 29 |
| f. Impact & Next Step | Slide tr. 12 |

### Mục 3. Demo

| Yêu cầu | Vị trí |
|---|---|
| Input → Processing → Output → Explanation/Trace | Ảnh 03–09 trong `06_Demo/Anh_man_hinh/` (chứng từ đầu vào → bảng tính tiền → luật áp dụng → sự kiện được phân loại); Slide tr. 6–8; `04_Document/TAI_LIEU_SAN_PHAM.md` mục 3 |
| 3.1. Luồng sử dụng thực tế | Ảnh 01–13 trong `06_Demo/Anh_man_hinh/` (`README.md` trong thư mục ghi từng bước); `04_Document/Huong_dan_su_dung/` |
| 3.2. Các chức năng cốt lõi | Slide tr. 6–8; `TAI_LIEU_SAN_PHAM.md` mục 4 |
| 3.3. Một trường hợp điển hình | CT0103 mốc 2: `TAI_LIEU_SAN_PHAM.md` mục 7; Slide tr. 6–8; ảnh 03–10 |
| 3.4. Dữ liệu thiếu | K01 (xoá nghiệm thu), K02 (xoá phê duyệt cấp 2) trong `06_Demo/kich_ban_kiem_chung/` |
| 3.4. Dữ liệu bất thường | K06 (hoá đơn sai thẩm quyền), K08 (hoá đơn gửi lặp); Slide tr. 24 (phụ lục B7) |
| 3.4. Điều kiện thay đổi | K09 (tăng ân hạn), K10 (tăng mức phạt), K11 (phê duyệt muộn) |
| 3.4. Trường hợp rủi ro | Tranh chấp CT0019: ảnh 16–17; `04_Document/Huong_dan_su_dung/09_dispute.md`; K04, K05 |
| 3.4. Kết quả không chắc chắn | 15 mốc độ tin cậy 0,80: `TAI_LIEU_SAN_PHAM.md` mục 6 và 8; Slide tr. 17 (phụ lục A3) |
| 3.4. Trường hợp cần human-in-the-loop | CT0090, ngoại lệ hai người: Slide tr. 9; ảnh 18–20; `04_Document/Huong_dan_su_dung/11_exceptions.md`; K12, K13 |
| Video demo dự phòng | `06_Demo/Video/video_demo.mp4` |

### Mục 4. Q&A và kiểm chứng

| BGK có thể yêu cầu | Vị trí |
|---|---|
| Mở một bản ghi/kết quả bất kỳ | Web: trang **Kết quả Data Pack**; tệp `03_Output/01_ket_qua_data_pack/submission_output.csv` |
| Giải thích vì sao hệ thống đưa ra kết quả đó | `03_Output/01_ket_qua_data_pack/audit.json` (trace từng mốc); web: **Dấu vết kiểm toán** |
| Chỉ ra dữ liệu đầu vào được sử dụng | `02_Data/BangD-Case4/` (nguyên bản BTC); `02_Data/README.md` |
| Chạy lại một trường hợp | `python apps/engine/cli.py` (xem "Kiểm tra nhanh" ở trên); `06_Demo/kich_ban_kiem_chung/chay_kiem_chung.py` |
| Kiểm tra một KPI | `03_Output/01_ket_qua_data_pack/metrics.json`; `03_Output/02_doi_chieu_20_mau/doi_chieu_20_mau.csv` |
| Giải thích một trường hợp sai hoặc failure case | `TAI_LIEU_SAN_PHAM.md` mục 8; độ nhạy theo ngày snapshot: `03_Output/05_kiem_chung_nghiep_vu/nhat_ky_chay.txt` |
| Truy vết từ kết quả về nguồn dữ liệu | Slide tr. 23 (phụ lục B6); `03_Output/01_ket_qua_data_pack/audit.json`; ảnh 15 |
| Thay đổi một tham số hoặc điều kiện | K09, K10, K11, K03, K06; kết quả sẵn ở `06_Demo/kich_ban_kiem_chung/KET_QUA_KIEM_CHUNG.md` |
| Bổ sung/xoá một dữ kiện | K01, K02, K04, K07 |
| Phân biệt phần đội xây dựng và phần thư viện/API/nền tảng bên ngoài | Mục "Phần đội xây dựng và phần bên ngoài" ở trên; Slide tr. 30 (phụ lục D3) |
| Kiểm chứng độc lập (đội bổ sung) | `01_SourceCode/tools/verify_decision.py` với `03_Output/07_goi_kiem_chung_mau/verification_CT0005.json` |

### Mục 5. KPI và kết quả thực nghiệm

| Yêu cầu | Vị trí |
|---|---|
| KPI đo nội dung gì | `04_Document/TAI_LIEU_SAN_PHAM.md` mục 6, cột "KPI"; Slide tr. 10, tr. 28 |
| Cách tính | `TAI_LIEU_SAN_PHAM.md` mục 6, cột "Cách tính"; `04_Document/NGHIEP_VU.md` mục 10 |
| Dữ liệu/tập kiểm thử dùng để đo | `TAI_LIEU_SAN_PHAM.md` mục 6, cột "Tập đo"; `02_Data/BangD-Case4/` (20 mẫu có nhãn), `03_Output/03_bo_ca_tong_hop/` |
| Kết quả đạt được | `03_Output/01_ket_qua_data_pack/metrics.json` |
| Baseline hoặc cơ sở so sánh | Baseline "luôn chi đủ" trong `metrics.json` và `TAI_LIEU_SAN_PHAM.md` mục 6; Slide tr. 10 |
| Giới hạn của kết quả | `TAI_LIEU_SAN_PHAM.md` mục 8; Slide tr. 11 |

### Mục 6.1. Mã nguồn

| Yêu cầu | Vị trí |
|---|---|
| Backend | `01_SourceCode/apps/api/` (NestJS) |
| Frontend | `01_SourceCode/apps/web/` (React), `01_SourceCode/packages/ui/` |
| Notebook | (Không có. Thay bằng script Python chạy dòng lệnh: `apps/engine/cli.py`, `tools/`) |
| Rule engine | `01_SourceCode/apps/engine/` (gói `codecash_engine`, mỗi bước một module); bộ luật và chính sách: `apps/engine/policy/` |
| Model/pipeline | (Không dùng mô hình học máy. Pipeline 9 bước của engine: `apps/engine/codecash_engine/`) |
| Script xử lý dữ liệu | `01_SourceCode/tools/` (kiểm chứng, rà soát, kiểm thử đột biến); nhập Data Pack: `apps/api/src/domain/` |
| API | `01_SourceCode/apps/api/`; cách đọc và gọi API: `04_Document/API.md` (Swagger chạy ở `http://127.0.0.1:3000/api/docs`); dịch vụ ký: `apps/signer/openapi.yaml` |
| Dashboard | Trang **Kết quả Data Pack** (KPI, 405 dòng, trace) và **Tổng quan hợp đồng** trong `apps/web/`; hướng dẫn: `04_Document/Huong_dan_su_dung/14_data.md` |
| Test code | `01_SourceCode/tests/`, `apps/web/src/**/*.test.*`; bản sao: `05_Test/ma_kiem_thu/` |
| File cấu hình | `01_SourceCode/.env.example`, `.env.production.example`, `Dockerfile`, `Dockerfile.standalone`, `infra/`, `.github/` (CI) |
| Không nộp lại thư viện bên thứ ba | Không kèm `node_modules`; phiên bản khoá trong `01_SourceCode/pnpm-lock.yaml` |
| Ghi rõ API thương mại | (Không dùng. Ký số và cổng thanh toán là mô phỏng) `01_SourceCode/README.md` mục "Thư viện và dịch vụ bên ngoài" |
| Ghi rõ AI API | Google Gemini API, tuỳ chọn, chỉ đề xuất điều khoản từ PDF: cùng mục README trên; `TAI_LIEU_SAN_PHAM.md` mục 5 |
| Ghi rõ Cloud | Bản demo chạy trên cloud bằng `Dockerfile.standalone` (chấm và demo không cần cloud, chạy local đầy đủ) |
| Ghi rõ Low-code/No-code | (Không dùng) |
| Ghi rõ nền tảng SaaS | (Không dùng. Dấu thời gian RFC 3161 là dịch vụ bên ngoài tuỳ chọn, mặc định tắt) |
| Ghi rõ mô hình pretrained | (Không tự huấn luyện hay nhúng mô hình. Chỉ gọi Gemini qua API khi bật) |

### Mục 6.2. README hướng dẫn chạy

Tất cả nằm trong `01_SourceCode/README.md` (bản đọc trực tiếp: `04_Document/README_SAN_PHAM.md`).

| Yêu cầu | Mục trong README |
|---|---|
| Tên sản phẩm | Tiêu đề |
| Chức năng chính | "Chức năng chính" |
| Cấu trúc thư mục | "Cấu trúc thư mục" |
| Yêu cầu môi trường | "Yêu cầu môi trường" |
| Thư viện/dependency | "Thư viện và dịch vụ bên ngoài"; danh sách đầy đủ: `package.json`, `pnpm-lock.yaml` (engine chỉ dùng thư viện chuẩn Python) |
| Cách cài đặt | "Cài đặt và chạy" |
| Cách chạy | "Cài đặt và chạy"; chạy không cần Node: "Kiểm tra nhanh" ở trên |
| Cách chạy demo | "Chạy demo" |
| Tài khoản demo | "Tài khoản demo"; danh sách: `06_Demo/tai_khoan_demo.csv` |
| Dữ liệu mẫu sử dụng | "Dữ liệu mẫu và đầu ra"; `02_Data/README.md` |
| Các giới hạn hoặc lưu ý | "Giới hạn và lưu ý" |

### Mục 6.3. Dữ liệu và đầu ra

| Yêu cầu | Vị trí |
|---|---|
| Dữ liệu đầu vào dùng cho demo | `02_Data/BangD-Case4/` (nguyên bản BTC); `02_Data/du_lieu_bo_sung/tai_khoan_demo.csv` và `02_Data/README.md` mục 2 (dữ liệu đội thêm, có đánh dấu nguồn); dữ liệu từng kịch bản: `06_Demo/kich_ban_kiem_chung/Kxx_*/du_lieu/` |
| Dữ liệu đã xử lý | `03_Output/05_kiem_chung_nghiep_vu/ket_qua_tung_moc.csv` (405 mốc với các biến trung gian: chứng từ hợp lệ, sai thẩm quyền, bản lặp, số phê duyệt, số ngày trễ) |
| Output hệ thống | `03_Output/01_ket_qua_data_pack/submission_output.csv` (đúng mẫu 22 cột của BTC) |
| File KPI | `03_Output/01_ket_qua_data_pack/metrics.json`; `03_Output/03_bo_ca_tong_hop/metrics.json` |
| Log/audit | `03_Output/01_ket_qua_data_pack/audit.json` (trace 405 quyết định), `nhat_ky_chay.txt` trong từng thư mục `03_Output/` (nhật ký chuỗi băm của ứng dụng xem trên web: **Nhật ký hoạt động**, **Kiểm tra toàn vẹn**; không xuất kèm vì sinh ra theo từng phiên chạy) |
| Các kết quả thực nghiệm | `03_Output/02_doi_chieu_20_mau/` đến `03_Output/07_goi_kiem_chung_mau/`; mô tả ở `03_Output/README.md` |
| Không đưa mật khẩu cá nhân, token, private key, API key, thông tin đăng nhập thật | Đã loại `.env`, thư mục khoá ký và nhật ký, cấu hình bản deploy; kết quả quét tự động: `TINH_TRANG_GOI_NOP.md`. (Mật khẩu `Passw0rd!` chỉ dành cho tài khoản mẫu chạy local) |

### Mục 6.4. Test và minh chứng

| Yêu cầu | Vị trí |
|---|---|
| Unit test | `05_Test/ma_kiem_thu/tests/`; nhật ký chạy: `05_Test/nhat_ky_kiem_thu/` |
| Scenario test | `03_Output/03_bo_ca_tong_hop/` (33 kịch bản tổng hợp trên 405 mốc); `06_Demo/kich_ban_kiem_chung/` (K01–K13) |
| Evaluation script | `01_SourceCode/apps/engine/cli.py` (tính KPI), `tools/kiem_chung_nghiep_vu.py`, `tools/mutation_check.py`, `apps/engine/benchmark.py` |
| Test report | `05_Test/BAO_CAO_KIEM_THU.md` |
| Benchmark | `03_Output/03_bo_ca_tong_hop/` (bộ ca tổng hợp); baseline và thời gian xử lý trong `03_Output/01_ket_qua_data_pack/metrics.json`; `03_Output/04_kiem_thu_dot_bien/mutation_check.json` |
| Confusion matrix | `03_Output/02_doi_chieu_20_mau/ma_tran_nham_lan.md` |
| Audit log | `03_Output/01_ket_qua_data_pack/audit.json`; công cụ kiểm nhật ký: `01_SourceCode/tools/verify_audit.py` |
| File đối chiếu kết quả | `03_Output/02_doi_chieu_20_mau/doi_chieu_20_mau.csv`; `06_Demo/kich_ban_kiem_chung/KET_QUA_KIEM_CHUNG.md` |

### Mục 6.5. Tài liệu sản phẩm

Tệp `04_Document/TAI_LIEU_SAN_PHAM.md`, bản in `04_Document/TAI_LIEU_SAN_PHAM.pdf`.

| Yêu cầu | Mục trong tài liệu |
|---|---|
| 1. Bài toán | Mục 1 |
| 2. Giải pháp | Mục 2 |
| 3. Kiến trúc/luồng xử lý | Mục 3; sơ đồ: `04_Document/bpmn/`, `04_Document/diagrams/` |
| 4. Các chức năng chính | Mục 4 |
| 5. Công nghệ sử dụng | Mục 5 |
| 6. KPI và kết quả | Mục 6 |
| 7. Hướng dẫn sử dụng | Mục 7; bản đầy đủ có ảnh: `04_Document/Huong_dan_su_dung/` (15 chủ đề) |
| 8. Giới hạn | Mục 8 |
| 9. Hướng phát triển | Mục 9 (gồm 9.1 định hướng blockchain) |

### Mục 7. Chuẩn bị kỹ thuật cho ngày thi

| Yêu cầu | Vị trí |
|---|---|
| Máy tính chạy sản phẩm | (Đội tự chuẩn bị. Cấu hình cần: `01_SourceCode/README.md` mục "Yêu cầu môi trường") |
| Dữ liệu demo | Nạp tự động khi khởi động; khôi phục bằng **Khôi phục dữ liệu demo**: `01_SourceCode/README.md` mục "Chạy demo" |
| Tài khoản demo | `06_Demo/tai_khoan_demo.csv` |
| Kết nối mạng nếu cần | (Không cần. Chỉ tính năng AI đọc PDF cần mạng và không dùng trong demo) |
| Môi trường chạy đã kiểm tra trước | (Đội tự kiểm trên máy thi) kết quả test lần đóng gói: `05_Test/nhat_ky_kiem_thu/` |
| Slide lưu cả `.pptx` và `.pdf` | `04_Document/Slide/` (`.pptx` và `.pdf` của cả hai bản) |
| Phương án demo offline | Chạy local, không cần Internet: `01_SourceCode/README.md` mục "Thư viện và dịch vụ bên ngoài"; dự phòng: `06_Demo/Video/` |
| Video demo dự phòng | `06_Demo/Video/video_demo.mp4` |
| Phân biệt Đã triển khai / Đang phát triển / Prototype / Định hướng (mục 8.3) | `TAI_LIEU_SAN_PHAM.md` mục 4 và 9; Slide tr. 12 |
