# Kịch bản demo và kiểm chứng Vòng 3

Dùng cho phần **Pitch & Demo (7 phút)** và **Q&A & Kiểm chứng (5 phút)** của Vòng 3.

BTC muốn thấy chuỗi **Input → Processing → Output → Explanation/Trace**, và đánh giá cao sản phẩm "chạy được, giải thích được, truy vết được, kiểm chứng được". Vì vậy mỗi bước dưới đây ghi bốn thứ: làm gì, màn hình sẽ hiện gì, nói gì, và vì sao bước đó chứng minh được điều BTC hỏi. Lời nói theo từng slide nằm ở tệp `06_Demo/KICH_BAN_THUYET_TRINH.md` của gói nộp.

## 1. Phân bổ 12 phút

| Lượt | Thời lượng | Nội dung | Ai làm |
|---|---|---|---|
| Pitch | 0:00–2:30 | Slide 1–8: vấn đề, giải pháp, kiến trúc, luật, phân quyền, chức năng | Người trình bày |
| Demo trực tiếp | 2:30–5:00 | Mục 3: CT0103 mốc 2, từ chạy thử tới nhật ký | Người thao tác, người trình bày nói |
| Bằng chứng | 5:00–7:00 | Slide 10–15: tình huống khó, KPI, baseline, tác động, kết | Người trình bày |
| Q&A & Kiểm chứng | 7:00–12:00 | Mục 5: BGK yêu cầu, đội thao tác | Cả đội |

**Về video:** BTC ghi video demo chỉ dùng dự phòng khi có sự cố và "không nên thay thế hoàn toàn Demo trực tiếp". Đội demo trực tiếp mục 3, mở sẵn video ở một tab khác. Nếu web lỗi quá 20 giây, chuyển sang video và nói "đây là đúng luồng vừa định thao tác", rồi đi tiếp.

## 2. Chuẩn bị

### Trước ngày thi

1. Chạy local trên chính máy mang đi thi theo [README](../README.md).
   - Nên dùng chế độ lưu tệp (`STORAGE_DRIVER=file`, mặc định). Chế độ này không cần Docker, nên không hỏng nếu Docker Desktop dừng giữa chừng.
   - Không cần Internet. Chỉ tính năng AI đọc PDF qua Gemini cần mạng, và tính năng này không dùng trong demo.
2. Tập trọn mục 3 ít nhất hai lần, bấm giờ. Mục 3 phải xong trong 2 phút 30 giây.
3. Quay lại video dự phòng đúng mục 3 sau lần tập cuối.
4. Kiểm số liệu trên trang **Kết quả Data Pack**: RELEASE 348, PENALTY 15, HOLD 36, REJECT 6.

### 30 phút trước khi lên

1. Mở PowerShell, chạy `pnpm dev`, đợi web lên ở <http://127.0.0.1:5173>.
2. Đăng nhập `sysadmin@codecash.vn` → menu tài khoản (góc phải) → **Khôi phục dữ liệu demo** → xác nhận. Dữ liệu về trạng thái ban đầu; dữ liệu và nhật ký cũ được lưu trữ, không bị xoá.
3. Mở sẵn các tab trình duyệt:

   | Tab | Tài khoản | Trang |
   |---|---|---|
   | 1 | `finance@novaan.vn` | **Việc cần làm** |
   | 2 | `controller@novaan.vn` | **Nhật ký hoạt động** |
   | 3 | `auditor@codecash.vn` | **Kiểm tra toàn vẹn** |
   | 4 | `controller@novaan.vn` | **Kết quả Data Pack** |
   | 5 | Video dự phòng | — |

   Mỗi tab dùng một cửa sổ ẩn danh hoặc một hồ sơ trình duyệt riêng, vì phiên đăng nhập lưu theo trình duyệt.
4. Phóng to trình duyệt 125% để BGK đọc được chữ trên máy chiếu.
5. Tắt thông báo hệ điều hành, đóng ứng dụng khác.

## 3. Demo trực tiếp: trường hợp điển hình CT0103, mốc 2

### Dữ liệu đầu vào (Input)

Hợp đồng CT0103 "Cung cấp thiết bị mạng cho phòng lab" giữa Nova An (bên mua) và Phú Minh (nhà cung cấp), đã ký đủ 3 bước. Mốc 2 là giao hàng:

| Dữ kiện | Giá trị |
|---|---|
| Giá trị mốc (P) | 740,00 triệu (40% của 1.850 triệu) |
| Hạn | 12/10/2026, ân hạn 2 ngày, nên hạn cuối là 14/10/2026 |
| Mức phạt, trần phạt | 0,15%/ngày, tối đa 8% |
| Chứng từ bắt buộc | Biên bản giao hàng (Phú Minh, 16/10/2026 09:20), hoá đơn (Phú Minh, 16/10/2026 15:10) |
| Phê duyệt cần | Chủ hợp đồng (đã duyệt 19/10) và duyệt tài chính (chưa duyệt) |
| Quyết định hiện tại | Tạm giữ: chưa đủ phê duyệt (luật ưu tiên 50) |

### Xử lý (Processing): engine sẽ tính

- Ngày hoàn thành = chứng từ bắt buộc muộn nhất = **16/10/2026**. Phê duyệt không đẩy ngày hoàn thành.
- Trễ = 16/10 − 14/10 = **2 ngày**.
- Phạt = 0,15% × 2 × 740 = **2,22 triệu**. Trần là 8% × 740 = 59,20 triệu, chưa chạm.
- Luật 10–50 không khớp (không tranh chấp, không từ chối, đúng thẩm quyền, đủ chứng từ, đủ phê duyệt), nên luật đầu tiên khớp là **ưu tiên 60: trễ hạn**.

### Các bước

| # | Thời lượng | Tài khoản, màn hình | Thao tác | Màn hình hiện | Nói | Vì sao bước này quan trọng |
|---|---|---|---|---|---|---|
| 1 | 20 giây | `finance@novaan.vn`, **Việc cần làm** | Mở việc "Phê duyệt chi" của CT0103, mốc 2 | Bên trái là văn bản hợp đồng; bên phải là chứng từ, các vai trò đã duyệt, và kết quả **nếu phê duyệt** | "Người duyệt tài chính thấy ngay: nếu tôi duyệt, engine sẽ ra Chi sau trừ phạt, phạt 2,22 triệu." | Chạy thử trước khi ghi: người duyệt biết hệ quả tiền trước khi bấm |
| 2 | 25 giây | như trên | Chỉ vào phần căn cứ: ngày hoàn thành 16/10, trễ 2 ngày | Ngày hoàn thành, số ngày trễ, công thức | "Hôm nay là 15/11, nhưng engine tính trễ từ ngày giao hàng 16/10, không từ lúc tôi duyệt. Duyệt muộn không làm nhà cung cấp bị phạt thêm." | Lỗi hay gặp nhất khi tính phạt (Lỗi 6 trong README của BTC) |
| 3 | 15 giây | như trên | Bấm **Phê duyệt**, xác nhận | Quyết định chuyển sang **Chi sau trừ phạt: 737,78 triệu**, phạt 2,22 | "Engine chạy lại trong cùng giao dịch và ra quyết định. Không ai sửa tay con số này." | Output thật, do engine Python tính bằng Decimal |
| 4 | 20 giây | như trên | Mở chi tiết quyết định của mốc | Luật áp dụng (ưu tiên 60), chứng từ làm căn cứ, điều kiện đạt và thiếu, kết cục từng luật, độ tin cậy | "Vì sao ra số này: luật 10 đến 50 không khớp, luật 60 khớp. Đây là các chứng từ làm căn cứ, bên lập, thời điểm." | Explanation/Trace mà BTC yêu cầu |
| 5 | 15 giây | như trên | Bấm **Duyệt lệnh chi** | Lệnh chi 737,78 triệu gửi sang cổng thanh toán mô phỏng; nút có khoá chống trùng | "Lệnh chi mang mã băm của quyết định. Bấm lại không chi hai lần." | Tác động tiếp theo của quyết định |
| 6 | 25 giây | Tab 2 `controller@novaan.vn`, **Nhật ký hoạt động** | Tìm CT0103 | Các mục vừa ghi: phê duyệt, quyết định, lệnh chi; ai làm, lúc nào | "Mọi thao tác đều vào nhật ký. Mỗi mục chứa mã băm của mục trước." | Truy vết được |
| 7 | 20 giây | Tab 3 `auditor@codecash.vn`, **Kiểm tra toàn vẹn** | Bấm **Kiểm tra lại** | Trạng thái **Toàn vẹn**: chuỗi băm hợp lệ, mốc neo gần nhất khớp, quyết định đã niêm phong | "Kiểm toán chỉ thấy mã băm và bằng chứng, không đọc nội dung hợp đồng. Chuỗi còn nguyên vẹn." | Kiểm chứng được; tách quyền xem |
| 8 | 10 giây | Tab 4, **Kết quả Data Pack** | Chỉ vào bảng tổng | 405 mốc, phân bố 4 quyết định, KPI | "Cùng một engine chạy trên toàn bộ 405 mốc của BTC." | Từ một ca sang toàn bộ dữ liệu |

Nếu thiếu thời gian, bỏ bước 5 và 8. Không được bỏ bước 2 và 4: hai bước này là phần giải thích.

Ảnh màn hình từng bước (cả mục 4 và 5) nằm ở `06_Demo/Anh_man_hinh/` của gói nộp, lấy từ hướng dẫn sử dụng trong ứng dụng. Dùng để tập trước, hoặc để chỉ cho BGK nếu web lỗi mà video chưa mở được.

## 4. Tình huống khó (dùng khi BGK hỏi hoặc khi còn thời gian)

### 4.1. Tranh chấp: CT0019, mốc 3

| Bước | Tài khoản | Thao tác | Kết quả |
|---|---|---|---|
| 1 | `owner@novaan.vn` | Mở CT0019 → mốc 3 (nghiệm thu, 591 triệu) | **Tạm giữ, lý do tranh chấp đang mở.** Đã có nghiệm thu và đủ 2 vai trò duyệt, nhưng tranh chấp mở ngày 10/08 vẫn giữ tiền (luật ưu tiên 10) |
| 2 | như trên | **Giải quyết tranh chấp**, chọn đúng lần mở, ghi lý do | Engine chạy lại: **Chi đủ 591,00** |

Nói: "Mở tranh chấp thì dễ, chỉ dẫn tới tạm giữ. Đóng thì khó: phải tham chiếu đúng lần mở và do bên mua đóng. Đóng tranh chấp không đẩy ngày hoàn thành, nên không phát sinh phạt."

Các mốc khác của CT0019 không bị ảnh hưởng, vì tranh chấp tính theo mốc.

### 4.2. Chứng từ sai thẩm quyền, xử lý hai người: CT0090, mốc 3

Dữ liệu: biên bản nghiệm thu EV01006 của mốc 3 (255 triệu) do nhà cung cấp S008 ghi. Nghiệm thu phải do bên mua lập, nên engine không coi là căn cứ và giữ tiền.

| Bước | Tài khoản | Thao tác | Kết quả |
|---|---|---|---|
| 1 | `owner@cuulong.vn` (chủ hợp đồng, bên mua B003) | Mở CT0090 → mốc 3 → chi tiết quyết định | **Tạm giữ, lý do chứng từ sai thẩm quyền** (luật ưu tiên 30) |
| 2 | như trên | Khung **Ngoại lệ** → chọn EV01006 → ghi lý do → **Đề xuất vô hiệu** | Trạng thái "Chờ duyệt". Người đề xuất không tự duyệt được |
| 3 | `controller@cuulong.vn` (kiểm soát viên cùng bên mua) | **Ngoại lệ chứng từ** → mở đề xuất → **Duyệt vô hiệu** | Engine chạy lại: vẫn **Tạm giữ**, nhưng lý do chuyển thành **thiếu biên bản nghiệm thu** |
| 4 | `legal@cuulong.vn` (cán bộ hợp đồng bên mua) | **Nộp chứng từ** nghiệm thu cho mốc 3 | Engine chấm lại. Nộp hôm nay thì ngày hoàn thành là hôm nay, trễ hơn 54 ngày nên phạt chạm trần 8%: dự kiến **Chi sau trừ phạt 234,60, phạt 20,40** |

Nói: "Không ai sửa thẳng kết quả. Chứng từ sai được loại bằng một đề xuất có lý do và một người thứ hai duyệt; nhật ký ghi ai đề xuất, ai duyệt. Vô hiệu chỉ loại căn cứ sai, không tự tạo căn cứ chi."

Bước 1–3 đã kiểm bằng dữ liệu ở kịch bản kiểm chứng K12. Bước 4 dùng ngày nộp thật, nên kiểm lại con số khi tập. Nếu nộp với ngày nghiệm thu đúng hạn (22/04), kết quả là Chi đủ 255,00 (kịch bản K13).

### 4.3. Ký theo trình tự: CT0102

| Bước | Tài khoản | Thao tác | Kết quả |
|---|---|---|---|
| 1 | `supplier@phuminh.vn` | **Việc cần làm** → ký CT0102 (bước 2/3) | Chủ hợp đồng đã ký bước 1; ký xong thì tới lượt duyệt cấp 2 |
| 2 | như trên | **Kiểm tra chữ ký** CT0102 | Chữ ký gắn với mã băm SHA-256 của văn bản; sửa văn bản thì báo tài liệu đã thay đổi |

Nói rõ: ký số dùng chứng thư mô phỏng, chưa có giá trị pháp lý.

## 5. Q&A & Kiểm chứng: BGK có thể yêu cầu gì, đội làm gì

BTC liệt kê các yêu cầu BGK có thể đưa ra (mục 4 thông báo). Bảng dưới ghi cách đáp ứng từng yêu cầu bằng thao tác thật. Các kịch bản `Kxx` nằm trong `06_Demo/kich_ban_kiem_chung/`; mỗi kịch bản là một bản sao Data Pack đã sửa đúng một dữ kiện, có sẵn kết quả để đối chiếu.

| BGK yêu cầu | Cách làm nhanh nhất | Điều cần nói |
|---|---|---|
| Mở một bản ghi bất kỳ | **Kết quả Data Pack** → tìm theo mã mốc (ô tìm kiếm) → mở dòng | Mỗi dòng có quyết định, lý do, luật, căn cứ, độ tin cậy và dấu vết kiểm toán |
| Giải thích vì sao ra kết quả đó | Mở **Dấu vết kiểm toán** của dòng | Giá trị từng biến luật; luật nào khớp, luật nào không xét vì đã có luật khớp trước |
| Truy vết từ kết quả về nguồn dữ liệu | Từ dòng kết quả → mã chứng từ trong cột căn cứ → hợp đồng → **Hồ sơ & sự kiện** | Căn cứ không gồm bản lặp và chứng từ sai thẩm quyền; trace có dấu vân tay dữ liệu đầu vào |
| Chỉ ra dữ liệu đầu vào được sử dụng | Tệp `02_Data/BangD-Case4/.../01_data/*.csv`, hoặc thẻ **Hồ sơ & sự kiện** trên web | Dữ liệu Data Pack nhập nguyên cột, niêm phong SHA-256, gắn nhãn nguồn `DATA_PACK` |
| Thay đổi một tham số | CLI: K09 (ân hạn 5 → 11 ngày: Chi sau trừ phạt → Chi đủ), K10 (mức phạt 0,15% → 2%: phạt chạm trần 72,00). Web: `sysadmin@codecash.vn` → **Phiên bản quy tắc và mẫu mốc** → **Soạn phiên bản mới** → sửa biểu thức → **Chạy thử tác động** | Đổi luật phải chạy thử trên 405 mốc; bản làm đổi bất kỳ kết quả nào bị chặn phát hành, và hợp đồng đang chạy giữ phiên bản đã ký |
| Thay đổi một điều kiện | K03 (phiếu thứ hai cùng vai trò: vẫn Tạm giữ), K06 (hoá đơn ghi do bên mua lập: Tạm giữ vì sai thẩm quyền), K11 (duyệt muộn 17 ngày: phạt không đổi) | Đếm phê duyệt theo vai trò; thẩm quyền tra theo danh sách các bên; phê duyệt không đẩy ngày hoàn thành |
| Bổ sung hoặc xoá một dữ kiện | K01 (xoá nghiệm thu), K02 (xoá phiếu duyệt cấp 2), K04 (thêm tranh chấp), K07 (thêm phiếu từ chối). Trên web: mục 4.1, hoặc nhà cung cấp mở tranh chấp ở một mốc đang đủ điều kiện | Mỗi mốc chấm độc lập: cột "Mốc khác đổi" trong `KET_QUA_KIEM_CHUNG.md` luôn bằng 0 |
| Chạy lại một trường hợp | `python apps/engine/cli.py --data ../06_Demo/kich_ban_kiem_chung/K05_MO_VA_DONG_TRANH_CHAP/du_lieu --output out-k05`; hoặc trên web: **Kết quả Data Pack** → **Đánh giá dữ liệu** | Chạy lại cho đúng kết quả cũ; chỉ thời gian xử lý và mã trace thay đổi |
| Kiểm tra một KPI | Mở `03_Output/01_ket_qua_data_pack/metrics.json` và `03_Output/02_doi_chieu_20_mau/doi_chieu_20_mau.csv`; hoặc khung KPI trên **Kết quả Data Pack** | Nói cỡ mẫu: 20 mẫu, khoảng tin cậy 95% là 83,9–100%; engine viết khi đã đọc 20 mẫu này |
| Giải thích một trường hợp sai hoặc failure case | Mục 6 dưới đây | Nói thẳng giới hạn, kèm cách xử lý |
| Phân biệt phần đội xây dựng và phần thư viện/API | Slide 4 (kiến trúc): khung viền liền là đội tự xây dựng, khung gạch đứt là bên ngoài | Engine, luật, phân quyền, nhật ký là của đội; Gemini chỉ đề xuất điều khoản, không quyết định thanh toán |
| Kiểm chứng độc lập, không tin hệ thống | `python tools/verify_decision.py ../03_Output/07_goi_kiem_chung_mau/verification_CT0005.json` | Công cụ viết riêng, không dùng mã của API; báo `seal: MATCH`, `rerun: MATCH` cho từng mốc |

Mở sẵn một cửa sổ PowerShell ở thư mục `01_SourceCode` để chạy lệnh ngay khi được yêu cầu. Mỗi lệnh CLI chạy dưới 2 giây.

## 6. Failure case và giới hạn: trả lời trung thực

| Câu hỏi | Trả lời |
|---|---|
| Macro-F1 bằng 1 có phải overfit? | Engine là bộ luật, không học từ dữ liệu, nhưng được viết khi đã đọc 20 mẫu, nên 20/20 là độ chính xác trên tập đã thấy. Đội dựng thêm 33 kịch bản tổng hợp áp lên 405 mốc, nhưng đáp án do đội viết, nên bộ ca đo độ phủ và lỗi cài đặt chứ không thay được tập ẩn. Cài 16 lỗi vào engine: 20 mẫu bắt 7, bộ ca lần đầu bắt 11, sau khi bổ sung 5 kịch bản thì bắt đủ 16. Con số khách quan là 11/16 |
| Trường hợp nào engine có thể sai? | Những chỗ BTC chưa chốt. Có 15 mốc kích hoạt bảo trì ghi `invoice_required = TRUE` mà hoá đơn không nằm trong chứng từ bắt buộc. Đội đi theo danh sách chứng từ bắt buộc nên chi; nếu BTC muốn bắt buộc hoá đơn thì 15 mốc này thành Tạm giữ. Cả 15 mốc được hạ độ tin cậy xuống 0,80 và ghi `confidence:A08` |
| Ai được đóng tranh chấp? | Trên web: bên mua (chủ hợp đồng hoặc cán bộ hợp đồng), và bản đóng phải tham chiếu đúng lần mở. Bài nộp BTC chỉ kiểm tham chiếu; trên Data Pack, cả 8 bản đóng đều do bên mua nên hai cách hiểu cho cùng kết quả |
| Tranh chấp có giữ cả hợp đồng không? | Không. Đội chốt tranh chấp tính theo mốc: tranh chấp ở một mốc không giữ các mốc khác (kịch bản K04: các mốc khác đổi = 0) |
| 267 sự kiện sau ngày snapshot thì sao? | Engine dùng toàn bộ lịch sử và ghi `offline_full_history` trong cột `notes`. Nếu cắt theo snapshot 18/10/2026 thì 92 mốc đổi kết quả; độ nhạy này nằm trong `03_Output/05_kiem_chung_nghiep_vu/nhat_ky_chay.txt` |
| ELSE xảy ra khi nào? | Khi không luật nào khớp hoặc dữ liệu lỗi (ví dụ quorum không đọc được). Luôn Tạm giữ để người kiểm tra |
| Độ tin cậy dùng để làm gì? | Báo người duyệt nên xem kỹ mốc nào. Không phải xác suất đúng, không bao giờ đổi quyết định |
| Nhật ký có thật sự không sửa được? | Mỗi mục chứa mã băm của mục trước, đầu chuỗi được neo tự động mỗi 15 phút kèm gốc Merkle, quyết định đã lưu được niêm phong. Công cụ Python độc lập `tools/verify_audit.py` kiểm lại được. Giới hạn: mặc định bên làm chứng ở cùng máy chủ; bật `TSA_URL` thì có dấu thời gian RFC 3161 của đơn vị bên ngoài. Có neo thì phát hiện 5/6 kiểu giả mạo đã thử |
| Sao không dùng blockchain? | Nhật ký hiện đã theo đúng nguyên lý đó trên một máy chủ: chuỗi băm, gốc Merkle neo mỗi 15 phút, quyết định niêm phong. Bước tiếp theo là gửi gốc Merkle đó lên sổ cái dùng chung, để bên làm chứng không còn nằm cùng máy chủ; giao diện `AnchorProvider` đã sẵn chỗ nối. Xa hơn là khoá giải ngân trên chuỗi cấp phép: ngân hàng chỉ chuyển tiền khi có niêm phong quyết định và đủ chữ ký. Engine vẫn chạy ngoài chuỗi; chỉ ghi mã băm, không ghi dữ liệu cá nhân; tiền vẫn là VND qua ngân hàng. Đây là định hướng, chưa triển khai (tài liệu sản phẩm mục 9.1) |
| Ký số và thanh toán có thật không? | Chưa. Ký số dùng chứng thư mô phỏng, cổng thanh toán mô phỏng (đã có adapter HTTP có khoá chống trùng và chữ ký HMAC). Bước tiếp theo là ký qua tổ chức chứng thực được cấp phép và nối cổng ngân hàng |
| AI làm gì? | Chỉ đọc PDF hợp đồng và đề xuất 6 điều khoản kèm trang và trích dẫn, để người dùng xác nhận. AI không tham gia quyết định thanh toán |
| Áp dụng thực tế thế nào? | Triển khai bằng Docker Compose. Thêm loại chứng từ, đổi luật, đổi chính sách bằng dữ liệu, không sửa code. Muốn có giá trị pháp lý và chi tiền thật thì cần ký qua tổ chức chứng thực được cấp phép và nối cổng ngân hàng |

## 7. Xử lý sự cố khi đang demo

| Sự cố | Cách xử lý |
|---|---|
| Web không lên hoặc báo lỗi | Chuyển sang tab video dự phòng; trong lúc đó một người chạy lại `pnpm dev`. Lỗi `EADDRINUSE` nghĩa là còn tiến trình cũ chiếm cổng: đóng cửa sổ terminal cũ rồi chạy lại |
| Dữ liệu demo đã bị thao tác ở lần tập trước | `sysadmin@codecash.vn` → **Khôi phục dữ liệu demo** (mất khoảng vài giây) |
| Đã phê duyệt CT0103 trước giờ trình bày | Khôi phục dữ liệu demo; hoặc dùng mục 4.1 (tranh chấp CT0019) làm ca chính |
| Máy chiếu không đọc rõ | Phóng to trình duyệt (Ctrl +); chỉ vào số tiền và lý do bằng con trỏ |
| BGK yêu cầu điều đội chưa làm | Nói đúng trạng thái: đã triển khai, mô phỏng, hay định hướng (theo slide 8). Không trình bày phần kế hoạch như đã có |
