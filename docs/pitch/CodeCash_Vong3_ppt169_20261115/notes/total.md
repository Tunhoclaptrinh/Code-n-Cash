# 01_cover

Kính chào Ban giám khảo, chúng tôi là đội Code và Cash với sản phẩm CodeCash cho Case 4, Smart Contract Workflow. Một câu để nhớ về chúng tôi: không chi tiền khi chưa đủ căn cứ, và chứng minh được vì sao. Tấm thẻ bên phải là một quyết định thật của hệ thống: mặt trước là số tiền được chi, mặt sau là luật, chứng từ và phê duyệt làm căn cứ. Toàn bộ chạy trên Data Pack chính thức của Ban tổ chức: 100 hợp đồng, 405 mốc, 1.134 sự kiện, không vi phạm bất biến nào.

---

# 02_problem

Thanh toán theo mốc hiện được kiểm bằng tay, nên có ba nỗi đau. Tiền bị chi khi chứng từ còn thiếu, do sai bên lập, đang tranh chấp hoặc đã có phiếu từ chối. Tiền phạt trễ hạn dễ tính nhầm ân hạn, trần phạt và ngày hoàn thành, trong khi duyệt muộn không được làm nhà cung cấp bị phạt thêm. Và không ai trả lời được khoản này chi theo luật nào, ai duyệt, dựa trên chứng từ nào. Trên chính Data Pack, có 42 mốc với tổng 56.452 triệu đồng chưa đủ điều kiện; một hệ thống luôn chi đủ sẽ chi hết, còn CodeCash tạm giữ hoặc từ chối kèm lý do. Người dùng gồm bên mua, nhà cung cấp và nhóm kiểm soát, mỗi người chỉ thấy và làm đúng phần của mình.

---

# 03_solution

Ý tưởng cốt lõi: mỗi thao tác là một sự kiện, và sau mỗi sự kiện engine chấm lại mốc theo bộ luật của Ban tổ chức. Trình duyệt không quyết định gì: API lấy danh tính và phạm vi từ tài khoản đăng nhập, rồi gọi engine Python tính bằng Decimal trong cùng một giao dịch, sau đó ghi nhật ký chuỗi băm. Đầu ra là một trong bốn quyết định: chi đủ, chi sau trừ phạt, tạm giữ hoặc từ chối, kèm luật áp dụng, căn cứ và độ tin cậy. Khung nét đứt là phần bên ngoài: ký số và cổng thanh toán đang mô phỏng, còn Gemini chỉ đề xuất điều khoản từ PDF và không tham gia quyết định thanh toán. Ba nguyên tắc: luật là dữ liệu, nghi ngờ thì tạm giữ, không ai sửa được kết quả.

---

# 04_datapack

Trước khi viết dòng code nào, đội đọc kỹ Data Pack để thiết kế cơ sở dữ liệu. Năm bảng CSV, lớn nhất là events với 1.134 dòng. Từ dữ liệu, đội đọc ra quan hệ: một hợp đồng có ba đến năm mốc, một mốc có một đến sáu sự kiện, mỗi bên mua có đúng ba người duyệt, và cả năm khoá ngoại đều khớp. Đội cũng rút ra quy luật: 100 trên 100 hợp đồng có mốc cuối trùng ngày kết thúc, và hạn mốc co giãn theo thời hạn hợp đồng chứ không cộng thẳng số ngày. Quan trọng nhất là các điểm bất thường: chứng từ gửi lặp, 267 sự kiện sau ngày snapshot, cột thẩm quyền thiếu loại sự kiện, và 15 mốc có cờ hoá đơn mâu thuẫn; mỗi điểm đều có cách xử lý rõ ràng. Kết quả là năm bảng nhập nguyên cột, mỗi dòng gắn nhãn nguồn, và dữ liệu đội bổ sung không làm đổi kết quả của 405 mốc gốc.

---

# 05_demo_input

Bây giờ là ca điển hình, hợp đồng CT0103 mốc 2, mốc giao hàng 740 triệu. Hạn 12 tháng 10 cộng hai ngày ân hạn, nên hạn cuối là 14 tháng 10; phạt 0,15 phần trăm mỗi ngày, trần 8 phần trăm. Nhà cung cấp đã nộp biên bản giao hàng và hoá đơn ngày 16 tháng 10, chủ hợp đồng đã duyệt, chỉ còn thiếu duyệt tài chính nên mốc đang tạm giữ theo luật 50. Khi người duyệt tài chính mở việc, họ thấy ngay kết quả nếu phê duyệt: chi sau trừ phạt, phạt 2,22 triệu, được chi 737,78 triệu. Người duyệt biết hệ quả tiền trước khi bấm.

---

# 06_demo_processing

Engine tính như sau. Ngày hoàn thành là thời điểm chứng từ bắt buộc muộn nhất, tức 16 tháng 10; phê duyệt không đẩy ngày hoàn thành. Trễ hai ngày sau hạn cuối, nên phạt bằng 0,15 phần trăm nhân hai nhân 740, bằng 2,22 triệu, chưa chạm trần 59,20. Tám luật chạy theo ưu tiên: luật 10 đến 50 không khớp vì không tranh chấp, không từ chối, đủ chứng từ đúng thẩm quyền và đủ phê duyệt, nên luật đầu tiên khớp là luật 60, trễ hạn. Màn hình hiển thị đúng các bước này. Duyệt vào ngày nào thì phạt vẫn chỉ tính tới ngày giao hàng; đây là lỗi tính phạt hay gặp nhất mà đề bài cảnh báo.

---

# 07_demo_output_trace

Sau khi bấm phê duyệt, engine chạy lại trong cùng giao dịch và ra quyết định chi sau trừ phạt, 737,78 triệu, không ai sửa tay con số này. Lệnh chi được lập tự động, mang mã băm của quyết định, và bấm lại không chi hai lần. Kiểm soát viên thấy trong nhật ký hoạt động: ai duyệt, lúc nào, quyết định nào, mỗi mục chứa mã băm của mục trước. Tài khoản kiểm toán chỉ đọc mở trang kiểm tra toàn vẹn: chuỗi băm hợp lệ, năm bảng dữ liệu của Ban tổ chức giữ nguyên, và kiểm toán chỉ thấy mã băm chứ không đọc nội dung hợp đồng. Cùng engine này chạy trên toàn bộ 405 mốc.

---

# 08_hard_case

Tình huống khó cần người quyết định: hợp đồng CT0090 mốc 3. Biên bản nghiệm thu do nhà cung cấp lập, trong khi nghiệm thu phải do bên mua lập, nên engine không coi là căn cứ và tạm giữ theo luật 30. Chủ hợp đồng đề xuất vô hiệu chứng từ đó, ghi lý do, nhưng không tự duyệt được. Kiểm soát viên của bên mua duyệt; engine chấm lại và vẫn tạm giữ, nhưng lý do chuyển thành thiếu biên bản nghiệm thu. Chỉ khi bên mua nộp biên bản hợp lệ thì tiền mới được chi: đúng hạn thì chi đủ 255 triệu, nộp muộn thì phạt theo ngày, tối đa 8 phần trăm. Không ai sửa thẳng kết quả; vô hiệu chỉ loại căn cứ sai, không tự tạo căn cứ chi.

---

# 09_kpi

Về bằng chứng, đội đo đủ năm nhóm KPI của Ban tổ chức. Trên 20 mẫu có nhãn: đúng quyết định 20 trên 20, khớp đủ 17 cột, Macro-F1 bằng 1, khớp số tiền tới 0,01 triệu, và không chi sai mốc nào trong 10 mốc chưa đủ điều kiện. So với hệ luôn chi đủ: hệ đó chỉ đúng 8 trên 20, Macro-F1 0,14 và chi sai cả 10 trên 10. Trên 405 mốc, mọi dòng đều có luật, căn cứ và mã truy vết, thời gian xử lý dưới 1 mili giây mỗi mốc. Cột baseline nay có trong metrics.json, ai cũng tái lập được bằng một lệnh. Giới hạn chúng tôi nói thẳng: 20 mẫu là ít, khoảng tin cậy 95 phần trăm là 83,9 đến 100 phần trăm, và engine được viết khi đã đọc các mẫu này.

---

# 10_honest_testing

Chúng tôi không tự chấm cho đẹp. Đội cài 16 lỗi thật vào engine để xem bộ kiểm thử có phát hiện không: 20 mẫu của Ban tổ chức bắt được 7, bộ ca tổng hợp lần đầu bắt được 11. Sau đó đội thêm 5 kịch bản và bắt đủ 16, nhưng con số đó đo trên chính bộ lỗi đã dùng để bổ sung, nên con số khách quan là 11 trên 16. Độ tin cậy không bao giờ đổi quyết định: 385 mốc đạt 1,00, 15 mốc 0,80 vì phụ thuộc điểm Ban tổ chức chưa chốt về hoá đơn, 5 mốc 0,97 vì có bản lặp chứng từ. Các giới hạn còn lại gồm ít nhãn để đo, hai điểm đề chưa chốt, ký số và thanh toán mô phỏng, bên làm chứng cùng máy chủ; mỗi giới hạn đều có cách xử lý.

---

# 11_impact

Trên Data Pack chính thức, engine ra 348 mốc chi đủ, 36 tạm giữ, 15 chi sau trừ phạt và 6 từ chối. Tổng được chi 365.785,87 triệu, tổng phạt 102,13 triệu ở 15 mốc, và 56.452 triệu không bị chi khi chưa đủ căn cứ. Chúng tôi phân biệt rõ đã có và sẽ có: phần lõi đã triển khai gồm engine, workflow, chạy thử trước khi ghi, ngoại lệ hai người, phân quyền, nhật ký chuỗi băm, phiên bản luật và gói kiểm chứng. Ký số, cổng thanh toán và AI đọc PDF đang ở mức mô phỏng. Bước tiếp theo là ký qua tổ chức chứng thực được cấp phép, nối cổng ngân hàng qua adapter đã có, và bổ sung bằng chứng độc lập.

---

# 12_video

Để thấy toàn cảnh, mời Ban giám khảo xem video giới thiệu một phút rưỡi: từ soạn hợp đồng, hai bên ký số, engine đánh giá theo mốc, kiểm toán, tới lệnh chi.

---

# 13_closing

Tóm lại, điểm mạnh nhất của CodeCash là không chi tiền khi chưa đủ căn cứ, và chứng minh được vì sao: chạy được, giải thích được, truy vết được và kiểm chứng được trên đúng dữ liệu của Ban tổ chức. Chúng tôi mời Ban giám khảo kiểm chứng ngay trên sản phẩm: mở một bản ghi bất kỳ, truy về dòng dữ liệu gốc, đổi một tham số, thêm hoặc xoá một dữ kiện, chạy lại và kiểm KPI, hoặc kiểm chứng độc lập bằng công cụ riêng. Tiếp theo là phần demo trực tiếp và hỏi đáp.

---

# 14_appendix_index

Phụ lục dùng khi hỏi đáp, chia bốn nhóm: engine, dữ liệu, quy trình và phân quyền, kiểm chứng. Khi được hỏi, mở đúng trang theo số ghi trên mục lục.

---

# 15_a1_rules

Bảng luật lấy nguyên văn từ payment_rules.csv. Tám luật chạy theo ưu tiên từ 10 đến 80 và dừng ở luật đầu tiên khớp; luật 80 là nhánh còn lại, luôn tạm giữ. Bộ luật là dữ liệu: đổi luật phải chạy thử trên 405 mốc trước khi công bố. Ngoài bảng luật còn một chốt an toàn: còn tranh chấp mở, có từ chối hợp lệ hoặc thiếu điều kiện thì mọi luật trả tiền bị đưa về tạm giữ, kể cả khi bảng luật bị sửa sai.

---

# 16_a2_pipeline

Engine xử lý mỗi mốc qua chín bước: lọc dữ kiện từ bước một đến năm, quyết định ở bước sáu và bảy, giải thích ở bước tám và chín. Công thức tiền là F bằng giá trị nhỏ hơn giữa số ngày trễ nhân mức phạt nhân giá trị mốc và trần phạt nhân giá trị mốc; được chi bằng giá trị mốc trừ F, không âm. Tiền phạt làm tròn tới 0,01 triệu trước khi trừ. Ngày hoàn thành là chứng từ bắt buộc hợp lệ muộn nhất; phê duyệt muộn và đóng tranh chấp không đẩy ngày này. Dữ liệu lỗi luôn đi vào nhánh tạm giữ.

---

# 17_a3_confidence

Độ tin cậy bắt đầu ở 1,00. Nhóm một trừ thẳng khi kết quả phụ thuộc điểm Ban tổ chức chưa chốt: engine chạy lại theo cách hiểu ngược lại, nếu quyết định hoặc số tiền đổi thì trừ trọng số. Nhóm hai nhân giảm theo chất lượng dữ liệu: bản lặp, sự kiện không liên quan, cảnh báo thứ tự, sát ranh giới trễ, và có lỗi dữ liệu thì chặn trần 0,50. Ví dụ thật là MS0047 đạt 0,80 và MS0172 đạt 0,97. Điểm không phải xác suất đúng và không bao giờ đổi quyết định.

---

# 18_b1_profile

Hồ sơ Data Pack: phê duyệt chiếm gần một nửa số sự kiện, vì vậy engine đếm phê duyệt theo vai trò chứ không theo số phiếu. Sự kiện tranh chấp và từ chối ít nhưng quyết định việc tạm giữ hay từ chối. Hợp đồng gồm bốn loại, nhiều nhất là cung cấp hàng hoá. Bảng bên phải tóm tắt khoá và vai trò của từng bảng.

---

# 19_b2_erd_datapack

Đây là ERD của dữ liệu gốc. CSV không có khoá ngoại vật lý, nên đội tự kiểm và thấy cả năm quan hệ đều khớp, cộng thêm quan hệ người duyệt thuộc bên mua. Hợp đồng nối với bên mua và nhà cung cấp; mốc thuộc hợp đồng; sự kiện thuộc mốc và do một bên thực hiện; mốc trỏ tới bộ luật qua release_rule_code.

---

# 20_b3_enriched_db

Sau khi làm giàu, năm bảng của Ban tổ chức ở giữa, giữ nguyên cột và niêm phong mã băm. Đội thêm quanh đó các nhóm: danh tính và phạm vi, hợp đồng và ký số, engine và luật, kiểm soát và tiền, và nhật ký bất biến. Mọi bản ghi mang nhãn nguồn DATA_PACK, SEED hoặc APP, có phiên bản để khoá lạc quan và mã tổ chức để lọc phạm vi.

---

# 21_b4_seed

Đội chỉ bổ sung thứ Data Pack không có: người dùng, thông tin pháp lý của tổ chức, chi tiết ký số, các bước đã qua trong lịch sử và cấu hình chạy. Bốn hợp đồng demo, mỗi cái minh hoạ một bước của luồng. Mọi dòng bổ sung mang nhãn SEED, không làm đổi kết quả 405 mốc gốc, và khôi phục dữ liệu demo không xoá nhật ký cũ.

---

# 22_b5_mapping

Cách ánh xạ: 65 bên trong parties.csv thành 36 tổ chức và 102 tài khoản. Mỗi bên mua có cán bộ hợp đồng và kiểm soát viên; ba người duyệt của bên mua thành chủ hợp đồng, duyệt tài chính và duyệt thứ hai; mỗi nhà cung cấp có đại diện và kiểm soát viên riêng; nền tảng có quản trị và kiểm tra toàn vẹn. Tên miền email lấy từ tên công ty. Danh tính luôn lấy từ tài khoản đăng nhập, không tin dữ liệu trình duyệt gửi.

---

# 23_b6_trace

Từ một dòng kết quả, đi ngược được tới luật áp dụng, chứng từ làm căn cứ, hợp đồng và mốc, rồi tới dòng dữ liệu gốc có dấu vân tay SHA-256. Nhật ký chuỗi băm chỉ ghi thêm, mỗi mục chứa mã băm của mục trước và được neo gốc Merkle mỗi 15 phút. Ai cũng kiểm lại được bằng hai công cụ Python viết riêng, không dùng mã của API.

---

# 24_b7_quality

Sáu điểm bất thường và cách xử lý. Chứng từ gửi lặp thì giữ bản sớm nhất. Sự kiện sau snapshot thì dùng toàn bộ lịch sử, vì cắt theo snapshot làm sai ba mẫu đã có nhãn. Cột thẩm quyền thiếu loại thì dựng ma trận theo bên, vì đọc nguyên văn cột bị mẫu công khai bác bỏ. Cờ hoá đơn mâu thuẫn thì đi theo danh sách chứng từ bắt buộc và hạ độ tin cậy. Hạn mốc hợp đồng mới dùng quy luật co giãn. Ai đóng tranh chấp thì đo độ nhạy, hiện không mốc nào đổi.

---

# 25_c1_bpmn

Sơ đồ BPMN rút gọn cho một mốc: bên mua soạn và ký trước, nhà cung cấp ký rồi nộp chứng từ, engine chấm lại sau mỗi sự kiện. Cổng quyết định dẫn về phê duyệt nếu thiếu duyệt, về nộp chứng từ nếu thiếu hoặc có tranh chấp, hoặc tới chi đủ hay chi sau trừ phạt. Sau đó duyệt tài chính duyệt lệnh chi và gửi sang cổng thanh toán mô phỏng. Mọi bước đều ghi nhật ký.

---

# 26_c2_sequence

Sơ đồ tuần tự cho một lần phê duyệt. Trước khi ghi, API gọi engine đánh giá giả định để người duyệt thấy kết quả. Khi bấm phê duyệt, trong một giao dịch, API ghi phiếu duyệt, chạy lại engine, lưu quyết định niêm phong, lệnh chi và mục nhật ký. Vi phạm bất biến thì huỷ cả giao dịch.

---

# 27_c3_rbac

Phân quyền có hai lớp. Lớp một do engine kiểm: bên nào được lập loại chứng từ nào. Lớp hai do API kiểm: vai trò nào được làm thao tác nào, theo một ma trận quyền duy nhất. Tách nhiệm vụ: người đề xuất không tự duyệt, quản trị không đọc nội dung hợp đồng, kiểm toán chỉ thấy mã băm.

---

# 28_d1_kpi_detail

Mỗi KPI có đủ sáu ý: đo gì, cách tính, tập đo, kết quả, baseline và giới hạn. Lệnh tái lập ra đủ cả cột CodeCash và cột baseline trong metrics.json.

---

# 29_d2_scenarios

Mười ba kịch bản kiểm chứng, mỗi kịch bản là một bản sao Data Pack sửa đúng một dữ kiện: xoá, thêm, đổi điều kiện, đổi tham số hoặc có người quyết định. Ở mọi kịch bản, không mốc nào khác bị đổi kết quả. Mỗi lệnh chạy dưới hai giây.

---

# 30_d3_built_vs_external

Phần đội tự xây dựng gồm engine và bộ luật, nghiệp vụ và phân quyền, nhật ký và công cụ kiểm chứng, giao diện và dữ liệu. Phần bên ngoài gồm thư viện nền tảng, hạ tầng, Gemini tuỳ chọn chỉ để đề xuất điều khoản, và dấu thời gian RFC 3161 tuỳ chọn. Gói nộp theo đúng cấu trúc Ban tổ chức gợi ý và không chứa thông tin mật.
