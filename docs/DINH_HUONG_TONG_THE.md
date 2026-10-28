# Định hướng tổng thể hệ thống CodeCash

Tài liệu ghi lại định hướng sản phẩm do nhóm đặt ra, và đối chiếu từng định hướng với hiện trạng mã nguồn (nhánh `feat/dynamic-policy-engine`, tháng 10/2026). Nghiệp vụ đang chạy vẫn lấy theo [đặc tả nghiệp vụ](NGHIEP_VU.md); tài liệu này mô tả hướng đi, không thay đặc tả.

## 1. Mục tiêu

CodeCash là hệ thống đứng giữa các bên của hợp đồng và thực thi hợp đồng theo cách của smart contract:

- hợp đồng được số hoá đúng thể thức;
- các điều khoản trong hợp đồng là căn cứ đưa vào một engine động;
- engine xử lý điều khoản có con người tham gia ở các điểm quyết định (human in the loop);
- kết quả cuối cùng là một quyết định trên hợp đồng, được gửi tới hệ thống bên ngoài để thực hiện.

## 2. Các định hướng

| Mã  | Định hướng                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Hệ thống là nơi trung gian thực thi hợp đồng chuẩn smart contract cho các bên liên quan                                                                                                                                                                                                                     |
| D2  | Hợp đồng được số hoá đúng thể thức; nội dung trong hợp đồng là căn cứ đưa vào engine                                                                                                                                                                                                                        |
| D3  | Ký tuần tự 1 đến 4 người; chữ ký gắn với ảnh chụp điều khoản; tệp đổi sau khi trích xuất thì dừng ký; hợp đồng ghim phiên bản luật khi hai bên ký (SoD-4); người ký thấy mã băm văn bản và phiên bản luật mình sắp ký                                                                                       | Một phần | Ký số mặc định là mô phỏng; có cổng kết nối dịch vụ ký qua HTTP nhưng chưa tích hợp nhà cung cấp chữ ký số (CA) |
| D4  | Hợp đồng và các điều khoản đi theo suốt quá trình thực hiện hợp đồng                                                                                                                                                                                                                                        |
| D5  | Cấu hình hệ thống đáp ứng cả hai phía và bao quát các trường hợp theo hai chiều; bên bán hoặc bên mua đều có thể là người soạn thảo hợp đồng                                                                                                                                                                |
| D6  | Người soạn thảo soạn phần điều khoản đúng thể thức để làm cơ sở cho engine, và phân quyền các cá nhân có mặt trong hợp đồng vào từng mốc; người được phân quyền có quyền tương ứng để xử lý các event trên hợp đồng đó                                                                                      |
| D7  | Engine dùng các điều kiện để tự động đánh giá các tác nhân và các event trong hợp đồng                                                                                                                                                                                                                      |
| D8  | Con người tham gia ở các điểm quyết định (human in the loop)                                                                                                                                                                                                                                                |
| D9  | Chủ thể của hợp đồng là đại diện của mỗi bên: vai trò lớn nhất, người quyết định chính và đại diện về mặt pháp lý. Người thực hiện công việc trong điều khoản và người tác động tới các event thường là những người khác (người nghiệm thu, kế toán và các vị trí khác)                                     |
| D10 | Cả hai bên đều có kiểm soát viên: hợp đồng là hai chiều, không phải một bên kiểm soát bên còn lại; vi phạm điều khoản có thể đến từ cả hai phía                                                                                                                                                             |
| D11 | Danh tính và tổ chức suy ra từ phiên đăng nhập; ma trận quyền duy nhất kiểm ở API; audit là chuỗi băm; dữ liệu cá nhân trong audit lưu dạng HMAC; vai trò nền tảng không đọc nội dung hợp đồng; khi đặt `TSA_URL`, mỗi lần neo có dấu thời gian RFC 3161 của đơn vị độc lập                                 | Một phần | Chữ ký số được pháp luật công nhận                                                                              |
| D12 | Vai trò `AUDITOR` chỉ thấy bản tóm tắt mục audit, neo và bằng chứng Merkle; bộ kiểm độc lập `tools/verify_audit.py`; có neo thì phát hiện 5/6 kiểu giả mạo; dấu thời gian RFC 3161 kiểm được bằng `openssl ts -verify`; gói kiểm chứng quyết định và `tools/verify_decision.py` chạy lại engine ngoại tuyến | Một phần | Kiểm tra tính pháp lý của chữ ký                                                                                |
| D13 | Quyết định RELEASE hoặc PENALTY tự lập lệnh chi; phê duyệt tài chính bên mua duyệt một lần mỗi mốc; lệnh được gửi tới `PAYMENT_GATEWAY_URL` (khoá chống gửi trùng, chữ ký HMAC), lưu kết quả và cho gửi lại khi lỗi; không đặt URL thì dùng cổng mô phỏng                                                   | Một phần | Kết nối cổng thanh toán hoặc hệ thống kế toán thật và đối soát định kỳ                                          |
| D14 | Phụ lục đính kèm bản nháp trước khi ký. Chứng từ của event được tải lên thật, lưu theo SHA-256, ký Ed25519 bởi người nộp; tải về thì băm lại; không có tệp đã lưu thì không tạo được event chứng từ                                                                                                         | Một phần | Ký số chứng từ bằng chứng thư số (CA); phụ lục bổ sung sau khi ký                                               |

## 3. Vòng đời hợp đồng theo định hướng

| Bước          | Nội dung                                                                               | Người thực hiện                   | Kiểm soát                                         |
| ------------- | -------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------- |
| 1. Soạn thảo  | Soạn hợp đồng đúng thể thức, điều khoản có cấu trúc làm căn cứ cho engine              | Bên mua hoặc bên bán              | Kiểm thể thức và các trường điều khoản bắt buộc   |
| 2. Phân quyền | Gán cá nhân của từng bên vào từng mốc và từng loại event                               | Người soạn thảo, hai bên xác nhận | Một người chỉ xử lý event được giao               |
| 3. Chốt và ký | Hai bên xác nhận điều khoản, cùng ký số                                                | Đại diện pháp lý của hai bên      | Chữ ký gắn với đúng nội dung đã xác nhận          |
| 4. Thực hiện  | Mỗi bên nộp chứng từ (phụ lục, biên nhận, nghiệm thu, hoá đơn), ký số và xác nhận      | Người thực hiện được phân quyền   | Engine đánh giá tác nhân và event theo điều khoản |
| 5. Kiểm soát  | Kiểm soát viên mỗi bên theo dõi, xử lý vi phạm hoặc ngoại lệ phía mình                 | Kiểm soát viên của hai bên        | Không ai sửa trực tiếp kết quả                    |
| 6. Quyết định | Engine ra quyết định trên mốc; người có thẩm quyền xác nhận tại các điểm cần con người | Engine và người được phân quyền   | Mọi bước ghi vào nhật ký audit                    |
| 7. Thực thi   | Gửi quyết định tới hệ thống bên ngoài (cổng thanh toán, kế toán)                       | Hệ thống                          | Gửi một lần, có xác nhận từ hệ thống nhận         |
| 8. Kiểm toán  | Kiểm tra truy vết, toàn vẹn và tính pháp lý                                            | Kiểm toán viên                    | Độc lập, không thay đổi dữ liệu                   |

## 4. Vai trò theo định hướng

| Nhóm vai trò                                                                   | Bên mua | Bên bán | Nền tảng |
| ------------------------------------------------------------------------------ | ------- | ------- | -------- |
| Đại diện pháp lý, người quyết định chính                                       | Có      | Có      | Không    |
| Người thực hiện điều khoản (nghiệm thu, kế toán, giao hàng và các vị trí khác) | Có      | Có      | Không    |
| Kiểm soát viên                                                                 | Có      | Có      | Không    |
| Quản trị hệ thống                                                              | Không   | Không   | Có       |
| Kiểm toán viên trung tính                                                      | Không   | Không   | Có       |

## 5. Đối chiếu với hiện trạng

Mức đáp ứng: **Đã có**, **Một phần**, **Chưa có**.

| Mã  | Hiện trạng                                                                                                                                                                                                                                                             | Mức      | Phần còn thiếu                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| D1  | API thực thi quy trình; engine Python chạy lại sau mỗi thao tác ghi trong cùng giao dịch                                                                                                                                                                               | Đã có    |                                                                                                                 |
| D2  | Tải DOCX, trích xuất điều khoản kèm nguồn gốc, bắt buộc rà soát trước khi khoá; hợp đồng sinh từ dữ liệu được dàn theo thể thức văn bản hành chính                                                                                                                     | Đã có    |                                                                                                                 |
| D3  | Ký tuần tự 1 đến 4 người; chữ ký gắn với ảnh chụp điều khoản; tệp đổi sau khi trích xuất thì dừng ký; hợp đồng ghim phiên bản luật khi hai bên ký (SoD-4)                                                                                                              | Một phần | Ký số mặc định là mô phỏng; có cổng kết nối dịch vụ ký qua HTTP nhưng chưa tích hợp nhà cung cấp chữ ký số (CA) |
| D4  | Hợp đồng ghim phiên bản luật lúc tạo; mỗi quyết định truy vết về điều kiện của mốc, luật thắng và bằng chứng                                                                                                                                                           | Đã có    |                                                                                                                 |
| D5  | Chỉ bên mua soạn thảo (`contracts:draft-write`: chủ hợp đồng, cán bộ hợp đồng của bên mua). Thẩm quyền event chia theo bên trong policy pack (`BUYER`, `SUPPLIER`)                                                                                                     | Chưa có  | Cho bên bán soạn thảo; cấu hình hai chiều cho mọi loại hợp đồng                                                 |
| D6  | Người ký gán theo từng hợp đồng. Quyền xử lý event theo vai trò của tổ chức; phê duyệt theo `required_approval_roles` của mốc                                                                                                                                          | Một phần | Gán cá nhân cụ thể vào từng mốc và loại event của từng hợp đồng                                                 |
| D7  | Policy pack (`apps/engine/policy/case4_btc.json`): thẩm quyền tác nhân là biểu thức trên `parties.csv` và `contracts.csv`; luật là dữ liệu có phiên bản; chốt an toàn độc lập với bảng luật                                                                            | Đã có    |                                                                                                                 |
| D8  | Luật ELSE giữ mốc (HOLD) chờ người; phê duyệt, tranh chấp, ngoại lệ do người quyết; chạy thử trước khi xác nhận                                                                                                                                                        | Đã có    |                                                                                                                 |
| D9  | Bên mua có chủ hợp đồng, cán bộ hợp đồng, phê duyệt tài chính, phê duyệt thứ hai. Bên bán chỉ có một vai trò `SUPPLIER`                                                                                                                                                | Một phần | Tách đại diện pháp lý và người thực hiện ở bên bán (giao hàng, kế toán)                                         |
| D10 | Mỗi bên có một kiểm soát viên (`controller@novaan.vn`, `controller@phuminh.vn`). Ngoại lệ chỉ đi theo chiều bên mua: chủ hợp đồng bên mua đề xuất, kiểm soát viên bên mua duyệt; kiểm soát viên bên bán chỉ theo dõi. Engine chỉ xét các điều kiện để bên mua chi tiền | Một phần | Kiểm soát viên bên bán xử lý ngoại lệ phía mình; ghi nhận vi phạm của bên mua                                   |
| D11 | Danh tính và tổ chức suy ra từ phiên đăng nhập; ma trận quyền duy nhất kiểm ở API; audit là chuỗi băm; dữ liệu cá nhân trong audit lưu dạng HMAC; vai trò nền tảng không đọc nội dung hợp đồng                                                                         | Một phần | Chữ ký số được pháp luật công nhận; dấu thời gian hoặc bên làm chứng bên ngoài (RFC 3161 hoặc blockchain)       |
| D12 | Vai trò `AUDITOR` chỉ thấy bản tóm tắt mục audit, neo và bằng chứng Merkle; bộ kiểm độc lập `tools/verify_audit.py`; có neo thì phát hiện 5/6 kiểu giả mạo                                                                                                             | Một phần | Bên làm chứng bên ngoài; kiểm tra tính pháp lý của chữ ký                                                       |
| D13 | Lệnh chuyển khoản mô phỏng (`payments:transfer`): chỉ phê duyệt tài chính của bên mua, chỉ khi quyết định là RELEASE hoặc PENALTY, một lần mỗi mốc                                                                                                                     | Một phần | Gửi tới cổng thanh toán hoặc hệ thống kế toán thật, nhận xác nhận và đối soát                                   |
| D14 | Phụ lục chỉ đính kèm bản nháp trước khi ký (`POST /documents/:draftId/appendices`). Event ghi mã chứng từ (`document_id`) và được ghi vào audit                                                                                                                        | Một phần | Số hoá, ký số và xác nhận chứng từ của từng event trong quá trình thực hiện                                     |

## 6. Hướng phát triển đề xuất

Thiết kế chi tiết cho D5, D6, D9, D10 và kế hoạch theo giai đoạn: [THIET_KE_HAI_CHIEU.md](THIET_KE_HAI_CHIEU.md).

Thứ tự dưới đây là đề xuất, suy ra từ các phần còn thiếu ở mục 5.

| Thứ tự | Hạng mục                                                                                     | Định hướng   |
| ------ | -------------------------------------------------------------------------------------------- | ------------ |
| 1      | Chứng từ của event được số hoá, ký số và xác nhận như phụ lục hợp đồng                       | D14, D3      |
| 2      | Phân quyền cá nhân vào từng mốc và loại event trên từng hợp đồng                             | D6           |
| 3      | Vai trò đầy đủ cho bên bán: đại diện pháp lý tách khỏi người thực hiện                       | D9           |
| 4      | Kiểm soát hai chiều: ngoại lệ và vi phạm phía bên mua, kiểm soát viên bên bán có quyền xử lý | D10          |
| 5      | Bên bán là người soạn thảo; cấu hình hợp đồng hai chiều                                      | D5           |
| 6      | Tích hợp nhà cung cấp chữ ký số và dấu thời gian bên ngoài                                   | D3, D11, D12 |
| 7      | Gửi quyết định tới cổng thanh toán hoặc hệ thống kế toán, kèm xác nhận và đối soát           | D13          |

Mỗi hạng mục giữ các nguyên tắc hiện có: trình duyệt không quyết định nghiệp vụ, danh tính lấy từ phiên đăng nhập, audit chỉ ghi qua `Repository.transact`, tiền không dùng số thực, và không đổi kết quả trên 405 mốc của Data Pack.
