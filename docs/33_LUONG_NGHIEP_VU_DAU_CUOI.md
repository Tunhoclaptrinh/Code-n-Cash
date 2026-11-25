# 33. Luồng nghiệp vụ đầu–cuối, viết cho người mới

Tài liệu này trả lời ba câu hỏi bằng ngôn ngữ thường ngày:

1. CodeCash giải quyết **bài toán gì**?
2. **Ai** tham gia, mỗi người làm gì?
3. Một hợp đồng đi **từ lúc soạn tới lúc thanh lý** như thế nào?

Đọc tài liệu này trước, rồi mới đọc chi tiết: quy tắc ở [Đặc tả nghiệp vụ](NGHIEP_VU.md), từng bước kèm mã lỗi ở [11 Hợp đồng soạn trong ứng dụng](11_HOP_DONG_TRONG_UNG_DUNG.md), kịch bản trình diễn ở [Kịch bản demo](KICH_BAN_DEMO.md).

Cấu trúc và cách giải thích (từ điển thuật ngữ, hai tầng kiểm quyền, câu chuyện xuyên suốt, nguyên tắc an toàn, hỏi đáp) lấy từ `docs/LUONG_NGHIEP_VU.md` của repo Contract Smart (25/11/2026); nội dung viết lại theo đúng những gì CodeCash đang chạy.

## 0. Đọc nhanh trong một phút

- **Vấn đề:** hợp đồng trả tiền theo nhiều đợt (mốc). Muốn trả một đợt phải kiểm: đủ giấy tờ chưa, đủ người duyệt chưa, có đang khiếu nại không, có trễ hạn không. Ngày nay việc này làm bằng tay nên chậm, dễ sai, khó giải thích.
- **Giải pháp:** điều kiện trả tiền được viết thành **luật**. Các bên **nộp chứng từ, phê duyệt, mở tranh chấp** trên hệ thống. Sau mỗi thao tác, **engine chấm lại** mốc: trả, giữ, từ chối hay trả có trừ phạt; bao nhiêu tiền; **vì sao**.
- **Người tham gia:** bên mua soạn hợp đồng, nghiệm thu, phê duyệt và chi tiền; nhà cung cấp ký, nộp chứng từ và hoá đơn; kiểm soát viên xử lý ngoại lệ; quản trị dựng cấu hình; kiểm toán kiểm toàn vẹn.
- **Luồng:** soạn → số hoá mốc → ký → nộp chứng từ → engine chấm → duyệt → chi → (phụ lục nếu đổi lịch) → thanh lý.
- **Bằng chứng đúng:** engine cho đúng 405/405 quyết định trên dữ liệu của ban tổ chức (Data Pack); mọi thao tác ghi vào nhật ký chuỗi băm.

## 1. Từ điển thuật ngữ

| Thuật ngữ | Nghĩa | Ví dụ |
| --- | --- | --- |
| **Mốc thanh toán** (mốc) | Một đợt trả tiền của hợp đồng, kèm điều kiện để được trả | Mốc "Giao hàng" trả 40% khi đã giao và có hoá đơn |
| **Chứng từ** | Tệp chứng minh một việc đã xảy ra, do **đúng bên** nộp | Biên bản giao hàng (nhà cung cấp), biên bản nghiệm thu (bên mua) |
| **Chứng từ bắt buộc** | Các chứng từ một mốc phải có đủ mới được trả | Giao hàng + Hoá đơn |
| **Phê duyệt chi** | Người có thẩm quyền của bên mua đồng ý trả mốc | Chủ hợp đồng bấm "Phê duyệt" |
| **Tranh chấp** | Ý kiến phản đối về một mốc; khi còn mở thì mốc bị giữ tiền | "Hàng giao bị lỗi" |
| **Luật** | Câu "Nếu … thì …" quyết định trả hay giữ tiền | "Nếu đang tranh chấp thì giữ tiền" |
| **Bộ luật** | Danh sách luật của một loại mốc, xếp theo thứ tự ưu tiên | 8 luật, ưu tiên 10 tới 80 |
| **Quy trình** | Chuỗi mốc của một loại hợp đồng: loại mốc, tỷ lệ, chứng từ, có phạt không | Hàng hoá: Ký 20% · Giao hàng 40% · Nghiệm thu 30% · Bảo hành 10% |
| **Phiên bản luật** | Một lần chốt bộ luật và quy trình; hợp đồng ghim phiên bản lúc soạn | Sửa luật chung không làm đổi hợp đồng đang chạy |
| **Bản số hoá** | Các mốc hệ thống dựng từ quy trình, người soạn đối chiếu với văn bản và chỉnh nếu khác | |
| **Ân hạn** | Số ngày được trễ mà không bị phạt | Hạn 04/01, ân hạn 3 ngày → từ 08/01 mới tính trễ |
| **Trần phạt** | Mức phạt tối đa theo % tiền mốc; luật cho phép tối đa 8% | Mốc 300 triệu, trần 5% → phạt tối đa 15 triệu |
| **Sai thẩm quyền** | Chứng từ do bên không được phép nộp loại đó | Nhà cung cấp tự nộp "Nghiệm thu" |
| **Ngoại lệ** | Gỡ hậu quả của một sự kiện ghi nhầm, cần hai người | Chủ hợp đồng đề xuất, kiểm soát viên duyệt |
| **Lệnh chi** | Chỉ thị chuyển tiền cho một mốc đã đủ điều kiện | |
| **Phụ lục** | Thay đổi lịch sau khi ký, hai bên đồng ý | Dời hạn nghiệm thu 20 ngày |
| **Thanh lý** | Hai bên xác nhận kết thúc hợp đồng với số liệu chốt | |

## 2. Bài toán

### 2.1. Một hợp đồng điển hình

Nova An (bên mua) mua thiết bị của Phú Minh (nhà cung cấp), giá trị 2.400 triệu đồng, chia 4 mốc:

| Mốc | Tỷ lệ | Số tiền | Điều kiện để được trả |
| --- | --- | --- | --- |
| 1. Ký hợp đồng | 20% | 480 tr | Hai bên đã ký; bên mua duyệt |
| 2. Giao hàng | 40% | 960 tr | Có biên bản giao hàng và hoá đơn; bên mua duyệt |
| 3. Nghiệm thu | 30% | 720 tr | Bên mua nghiệm thu; không có khiếu nại; bên mua duyệt |
| 4. Bảo hành | 10% | 240 tr | Hết bảo hành; bên mua duyệt |

Hợp đồng còn quy định: được trễ 3 ngày; trễ hơn thì phạt 0,10% mỗi ngày, tối đa 8% tiền mốc.

### 2.2. Ngày nay làm thế nào và gặp vấn đề gì

| Vấn đề | Hậu quả |
| --- | --- |
| **Chậm:** giấy tờ rải rác ở email, giấy, tin nhắn | Nhà cung cấp chờ tiền lâu |
| **Dễ sai:** quên kiểm một điều kiện | Trả tiền khi hàng đang bị khiếu nại; quên trừ phạt; người không có thẩm quyền vẫn duyệt |
| **Khó giải thích:** không ghi lại vì sao trả | Kiểm toán hỏi "vì sao khoản này trả đủ dù giao trễ?" thì không ai trả lời được |
| **Dễ bị sửa:** hồ sơ sửa được sau khi đã chi | Không chứng minh được hồ sơ lúc duyệt trông như thế nào |

### 2.3. CodeCash giải quyết thế nào

| Vấn đề | Cách giải quyết |
| --- | --- |
| Điều kiện nằm trong văn bản, mỗi người hiểu một kiểu | Điều kiện thành **luật** có phiên bản; văn bản hợp đồng do hệ thống sinh ghi đúng điều kiện đó |
| Giấy tờ rải rác | Mọi chứng từ nộp **lên một chỗ**, kèm tệp; tệp được băm SHA-256 và người nộp ký lên |
| Kiểm bằng tay | **Engine tự chấm** sau mỗi thao tác, không bỏ sót điều kiện |
| Không giải thích được | Mỗi quyết định kèm **vết**: luật nào khớp, con số nào, vì sao |
| Hồ sơ bị sửa | Sự kiện và nhật ký **chỉ thêm, không sửa**; nhật ký nối chuỗi băm, sửa một dòng là lộ |
| Người không có thẩm quyền vẫn duyệt | Quyền lấy từ tài khoản; engine chỉ đếm **đúng người, đúng vai** |

## 3. Các bên tham gia và phân quyền

### 3.1. Ba nhóm người dùng

```
┌─ NỀN TẢNG: người vận hành, không thuộc công ty nào ────────────────────┐
│  Quản trị hệ thống   tài khoản, tổ chức, mẫu hợp đồng, phiên bản luật   │
│  Kiểm toán           chỉ kiểm toàn vẹn (băm, bằng chứng), không ghi     │
└────────────────────────────────────────────────────────────────────────┘
┌─ BÊN MUA: người trả tiền (Nova An) ────────────────────────────────────┐
│  Cán bộ hợp đồng     soạn, số hoá, nộp chứng từ của bên mua, phụ lục   │
│  Chủ hợp đồng        soạn, ký, phê duyệt, đề xuất ngoại lệ             │
│  Phê duyệt tài chính phê duyệt (khi chính sách cần), duyệt lệnh chi    │
│  Phê duyệt cấp 2     phê duyệt (khi chính sách cần)                    │
│  Kiểm soát viên      duyệt hoặc trả lại đề xuất ngoại lệ               │
└────────────────────────────────────────────────────────────────────────┘
┌─ BÊN BÁN: người nhận tiền (Phú Minh) ──────────────────────────────────┐
│  Nhà cung cấp        ký, nộp chứng từ của mình và hoá đơn, đề nghị     │
│                      nghiệm thu, trả lời phụ lục và thanh lý           │
│  Kiểm soát viên      theo dõi, không thao tác nghiệp vụ                │
└────────────────────────────────────────────────────────────────────────┘
```

**Vì sao bên mua có nhiều người hơn?** Bên mua là bên **chi tiền**, nên cần nhiều lớp kiểm: một người xác nhận chứng từ, một hoặc hai người khác phê duyệt, tài chính duyệt lệnh chi, kiểm soát viên xử lý bất thường.

### 3.2. Tài khoản dùng thử

Mật khẩu chung `Passw0rd!`; màn đăng nhập có danh sách tài khoản demo.

| Tài khoản | Vai |
| --- | --- |
| `legal@novaan.vn` | Cán bộ hợp đồng bên mua |
| `owner@novaan.vn` | Chủ hợp đồng |
| `finance@novaan.vn` | Phê duyệt tài chính |
| `secondary@novaan.vn` | Phê duyệt cấp 2 |
| `controller@novaan.vn` | Kiểm soát viên bên mua |
| `supplier@phuminh.vn` | Nhà cung cấp |
| `controller@phuminh.vn` | Kiểm soát viên bên bán |
| `sysadmin@codecash.vn` | Quản trị hệ thống |
| `auditor@codecash.vn` | Kiểm toán |

### 3.3. Hai tầng kiểm quyền

| | Tầng 1: API | Tầng 2: Engine |
| --- | --- | --- |
| **Trả lời câu hỏi** | Người này có được **bấm nút** này không? | Sự kiện này có được **tính** không? |
| **Dựa vào** | Vai trò và tổ chức của tài khoản đăng nhập | Bảng thẩm quyền: loại chứng từ nào thuộc bên nào; vai trò hợp đồng yêu cầu duyệt |
| **Khi sai thì** | Từ chối ngay (403), không lưu gì | Sự kiện vẫn được lưu, nhưng engine **không tính** và giữ tiền |
| **Ví dụ** | Nhà cung cấp mở hợp đồng của công ty khác → không thấy (404) | Sự kiện sai thẩm quyền trong Data Pack → mốc HOLD "sai thẩm quyền" |

**Vì sao tầng 2 không chặn luôn?** Vì ghi lại hành vi sai cũng là bằng chứng. Dữ liệu của ban tổ chức có sẵn những sự kiện như vậy, và engine phải xử lý đúng. Trong ứng dụng, giao diện chỉ mời đúng bên nộp đúng loại; muốn gỡ một sự kiện sai đã nằm trong dữ liệu thì dùng ngoại lệ (§5.6).

**Quan trọng:** người dùng **không tự khai** mình là ai. Bên ghi, tổ chức, vai trò đều lấy từ tài khoản đăng nhập; API bỏ qua mọi vai trò hay mã người trình duyệt gửi lên.

### 3.4. Chính sách phê duyệt

| Chính sách | Cần ai duyệt |
| --- | --- |
| Tự động khi đủ điều kiện | Không ai; đủ chứng từ là đủ điều kiện chi |
| Một người duyệt | Chủ hợp đồng |
| Hai người duyệt | Chủ hợp đồng **và** phê duyệt cấp 2 |
| Tài chính và chủ hợp đồng | Chủ hợp đồng **và** phê duyệt tài chính |

Engine chỉ đếm phê duyệt của **đúng vai** được yêu cầu: hợp đồng "hai người duyệt" mà chủ hợp đồng và tài chính cùng duyệt thì vẫn chỉ tính **1/2**. Từng mốc có thể được miễn duyệt khi số hoá.

### 3.5. Tách nhiệm

| Quy tắc | Ý nghĩa |
| --- | --- |
| Người cấu hình không xử lý nghiệp vụ | Quản trị hệ thống không soạn, không duyệt, không chi |
| Người đề xuất ngoại lệ không tự duyệt | Chủ hợp đồng đề xuất, kiểm soát viên cùng bên duyệt |
| Phiên bản luật cần người thứ hai duyệt | Người soạn phiên bản không tự công bố |
| Không ai sửa trực tiếp kết quả | Muốn đổi kết quả phải có sự kiện mới hoặc đi qua ngoại lệ |

## 4. Toàn cảnh

### 4.1. Sơ đồ

```
  CHUẨN BỊ (một lần, dùng cho nhiều hợp đồng)
  ┌───────────────────────────────────────────────────────────────┐
  │ 0. Quản trị: mẫu hợp đồng, phiên bản luật, quy trình riêng      │
  └──────────────────────────────┬────────────────────────────────┘
  MỖI HỢP ĐỒNG                   ▼
  ┌──────────────┐  ┌──────────────────┐  ┌──────────────┐  ┌───────────────────┐
  │ 1. Soạn       │─▶│ 2. Số hoá mốc     │─▶│ 3. Ký         │─▶│ 4. Nộp chứng từ   │◀─┐
  │ điều khoản,   │  │ đối chiếu văn bản │  │ theo thứ tự,  │  │ hoá đơn, đề nghị  │  │
  │ văn bản       │  │ chỉnh tay nếu cần │  │ có thể trên ĐT│  │ nghiệm thu        │  │
  └──────────────┘  └──────────────────┘  └──────────────┘  └────────┬──────────┘  │
                                                                      ▼             │
                     ┌──────────────────┐                  ┌───────────────────┐   │
                     │ 6. Ngoại lệ       │◀── ghi nhầm ─────│ 5. Engine chấm     │───┘
                     │ hai người duyệt   │─── chấm lại ────▶│ sau mỗi thao tác   │ chưa đủ
                     └──────────────────┘                  └────────┬──────────┘
                                                                      │ đủ điều kiện
                     ┌──────────────────┐                  ┌──────────▼──────────┐
                     │ 8. Phụ lục        │── đổi lịch ────▶│ 7. Duyệt và chi      │
                     │ (sau ký)          │                  │ xem chứng từ, lệnh chi│
                     └──────────────────┘                  └──────────┬──────────┘
                                                                      │ mọi mốc xong
                                                           ┌──────────▼──────────┐
                                                           │ 9. Thanh lý          │
                                                           └─────────────────────┘
  XUYÊN SUỐT: việc cần làm · thông báo trực tiếp · tổng quan · nhật ký chuỗi băm
```

### 4.2. Câu chuyện từ đầu đến cuối

1. **Cán bộ hợp đồng Nova An** soạn hợp đồng hàng hoá 2.400 triệu với Phú Minh, từ 02/11/2026 đến 31/05/2027. Hệ thống tạo văn bản hợp đồng theo thể thức Nghị định 30/2020; người soạn đặt vị trí chữ ký trên trang thật.
2. Phần trích xuất đọc 6 điều khoản (giá trị, ân hạn, mức phạt, trần, hai ngày) kèm trang và câu trích; người soạn xác nhận. Hệ thống dựng 4 mốc: 480 / 960 / 720 / 240 triệu, hạn rải theo thời hạn hợp đồng, mốc cuối đúng ngày kết thúc. Văn bản ghi bảo hành "sau 2 tháng", nên người soạn nhập ngày cụ thể.
3. **Phú Minh** và **chủ hợp đồng Nova An** ký lần lượt, có thể xác nhận bằng mã PIN trên điện thoại. Ký xong, hợp đồng có hiệu lực và mốc 1 tự có sự kiện "hợp đồng đã ký".
4. **Phú Minh** giao hàng, nộp biên bản giao hàng và hoá đơn kèm số, ký hiệu, mã số thuế, tổng tiền. Engine chấm mốc 2: "giữ tiền, chưa đủ người duyệt".
5. **Chủ hợp đồng** mở từng chứng từ ngay trên màn duyệt, thấy hoá đơn "khớp giá trị mốc", rồi phê duyệt. Engine chấm lại: trả 960 triệu, hoặc trả có trừ phạt nếu giao trễ sau ân hạn.
6. **Phê duyệt tài chính** duyệt lệnh chi; nếu bên mua chậm trả quá thời hạn thanh toán, lệnh chi cộng thêm lãi chậm trả.
7. Ở mốc 3, phòng kỹ thuật Nova An phát hiện lỗi và **mở tranh chấp**: tiền bị giữ. Hai bên cần thêm thời gian, nên Nova An lập **phụ lục** dời hạn nghiệm thu 20 ngày; Phú Minh chấp nhận, engine chấm lại theo hạn mới. Xử lý xong, tranh chấp được đóng.
8. Khi mọi mốc đã chi hoặc bị từ chối, Nova An lập **biên bản thanh lý** với số liệu chốt (đã chi + phạt + bị từ chối = giá trị hợp đồng); Phú Minh xác nhận. Hợp đồng khoá hẳn.

## 5. Từng giai đoạn

Mỗi giai đoạn: **ai làm, làm ở đâu, hệ thống kiểm gì, kết quả**. Quy tắc và mã lỗi đầy đủ ở [11](11_HOP_DONG_TRONG_UNG_DUNG.md).

### 5.0. Chuẩn bị (quản trị hệ thống)

| Việc | Màn | Điểm chính |
| --- | --- | --- |
| Mẫu hợp đồng | Quản trị → Mẫu hợp đồng | Giá trị, phạt, thứ tự vai trò ký mặc định; theo đúng quy tắc của bản nháp (trần ≤ 8%) |
| Phiên bản luật | Quản trị → Phiên bản quy tắc | Sửa luật, thêm quy trình riêng `APP_…`; xem trước trên 405 mốc; **chứng minh an toàn** trước khi gửi duyệt; người thứ hai công bố |
| Tổ chức, tài khoản | Quản trị → Tổ chức, Người dùng | Mã số thuế, địa chỉ của tổ chức; vai trò của từng người |

**Vì sao phiên bản luật phải khoá sau khi công bố?** Hợp đồng ký theo luật nào thì phải chấm đúng theo luật đó. Sửa luật là tạo phiên bản mới; hợp đồng cũ vẫn ghim phiên bản cũ.

### 5.1. Soạn hợp đồng (cán bộ hoặc chủ hợp đồng bên mua)

Nhập loại hợp đồng, nhà cung cấp, giá trị **đã gồm VAT**, thời hạn, chính sách duyệt, ân hạn, phạt, thời hạn thanh toán và lãi chậm trả, người ký. Hệ thống kiểm: trần phạt ≤ 8% (Luật Thương mại 2005, Điều 301), mức phạt và trần nhất quán, ngày kết thúc sau ngày bắt đầu, có người ký của cả hai bên.

### 5.2. Số hoá mốc

Mốc **không đọc từ văn bản**: hệ thống dựng từ quy trình của loại hợp đồng, chia tiền theo tỷ lệ (mốc cuối nhận phần lẻ), rải hạn theo thời hạn hợp đồng. Người soạn đối chiếu với văn bản; khác thì **chỉnh tay** tỷ lệ, hạn, chứng từ, phạt, miễn duyệt của từng mốc (tổng phải đúng 100%). Dòng đã chỉnh mang nhãn "Đã chỉnh tay".

### 5.3. Ký

Người ký theo đúng thứ tự, mỗi chữ ký gắn với mã băm văn bản: sửa văn bản một chữ là chữ ký không còn khớp. Có thể ký qua dịch vụ ký tách riêng, xác nhận bằng PIN trên điện thoại ([10](10_DICH_VU_KY_SO.md)). Chữ ký cuối làm hợp đồng có hiệu lực.

### 5.4. Nộp chứng từ

Mỗi bên nộp chứng từ **của mình** (giao diện chỉ mời đúng loại). Mỗi chứng từ là một tệp thật, được băm và ký. Hoá đơn kèm dữ liệu: tổng tiền phải bằng đúng số tiền mốc, mã số thuế đúng nhà cung cấp, không trùng hoá đơn đã dùng. Khi đã nộp đủ phần mình, nhà cung cấp gửi **đề nghị nghiệm thu**: biên bản của bên mua nộp sau đó mang thời điểm của đề nghị, nên bên mua chậm nộp không làm nhà cung cấp bị phạt.

### 5.5. Engine chấm (tự động)

Sau mỗi thao tác ghi, engine chấm lại toàn bộ trong cùng một giao dịch. Màn hình có **chạy thử**: trước khi bấm, người dùng thấy kết quả sẽ ra sao. Cách chấm ở §6.

### 5.6. Ngoại lệ (chủ hợp đồng + kiểm soát viên)

Sự kiện **không xoá được**. Nếu một sự kiện sai làm mốc kẹt, chủ hợp đồng đề xuất vô hiệu kèm lý do; kiểm soát viên **cùng bên mua** duyệt hoặc trả lại. Sự kiện vẫn nằm trong dữ liệu, được đánh dấu "đã vô hiệu", engine bỏ qua và chấm lại.

### 5.7. Duyệt và chi

Người duyệt mở từng chứng từ trên màn duyệt (tệp gốc, chữ ký người nộp, dữ liệu hoá đơn). Đủ điều kiện thì phê duyệt tài chính duyệt **lệnh chi**, mỗi mốc một lần; lệnh chi gửi qua cổng thanh toán (mô phỏng) với khoá chống chi trùng.

### 5.8. Phụ lục

Sau khi ký, lịch chỉ đổi bằng phụ lục: bên mua đề xuất hạn mới hoặc gia hạn kèm lý do, nhà cung cấp chấp nhận hay từ chối. Mốc đã quyết định chi giữ hạn. Điều khoản đã ký không bị sửa, nên chữ ký gốc vẫn kiểm được.

### 5.9. Thanh lý

Khi mọi mốc đã chi hoặc bị từ chối, bên mua lập biên bản với số liệu chốt, nhà cung cấp xác nhận. Hợp đồng chuyển "Đã thanh lý" và khoá hẳn. Hợp đồng của ban tổ chức không thanh lý trong ứng dụng.

## 6. Engine chấm thế nào

### 6.1. Nhận gì, trả gì

```
  Hợp đồng ──┐
  Mốc ───────┤                    ┌─▶ Quyết định: trả / giữ / từ chối / trả có trừ phạt
  Sự kiện ───┼──▶   ENGINE   ─────┼─▶ Số tiền trả, tiền phạt
  Bộ luật ───┤    (Python)        ├─▶ Trạng thái mốc
  Các bên ───┘                    └─▶ Vết: luật nào khớp, vì sao, độ tin cậy
```

### 6.2. Bước 1: tính các con số

| Con số | Cách tính |
| --- | --- |
| Đủ chứng từ chưa | Chứng từ bắt buộc hợp lệ (đúng loại, đúng bên, đúng trạng thái), mỗi loại tính một lần |
| Có tranh chấp đang mở | Có "mở tranh chấp" chưa được "đóng tranh chấp" trỏ tới |
| Số từ chối hợp lệ | Từ chối của người có quyền |
| Số chứng từ sai thẩm quyền | Chứng từ do bên không được phép nộp |
| Số vai trò đã duyệt / cần duyệt | Đếm vai trò **khác nhau**, **đúng vai** chính sách yêu cầu |
| Ngày hoàn thành | Thời điểm của chứng từ bắt buộc hợp lệ muộn nhất |
| Số ngày trễ sau ân hạn | Ngày hoàn thành − (hạn + ân hạn), không âm |

Bản nộp trùng bị loại; sự kiện đã vô hiệu qua ngoại lệ bị bỏ qua.

### 6.3. Bước 2: thử luật từ trên xuống

Luật đầu tiên khớp quyết định, các luật sau không xét. Các luật "chặn" (tranh chấp, từ chối, sai thẩm quyền, thiếu chứng từ, thiếu người duyệt) đứng **trước** luật trả tiền; luật cuối "các trường hợp còn lại thì giữ tiền" là lưới an toàn.

| Ưu tiên | Luật | Quyết định |
| --- | --- | --- |
| 10 | Đang tranh chấp | Giữ tiền |
| 20 | Có từ chối hợp lệ | Từ chối |
| 30 | Có chứng từ sai thẩm quyền | Giữ tiền |
| 40 | Thiếu chứng từ bắt buộc | Giữ tiền |
| 50 | Cần duyệt mà chưa đủ vai trò | Giữ tiền |
| 60 | Có phạt và xong sau hạn + ân hạn | Trả có trừ phạt |
| 70 | Đủ mọi điều kiện | Trả đủ |
| 80 | Còn lại | Giữ tiền |

Ngoài thứ tự, engine còn hai **chốt an toàn**: luật trả tiền chỉ được thắng khi không còn yếu tố chặn, và số tiền phải trong khoảng 0 tới giá trị mốc. Một bộ luật sai thứ tự (ví dụ "đủ chứng từ thì trả" đặt trước "đang tranh chấp thì giữ") bị chặn ngay từ lúc chứng minh an toàn, không công bố được.

### 6.4. Tiền phạt, một ví dụ

```
số ngày trễ = ngày hoàn thành − (hạn + ân hạn)            (không âm)
tiền phạt   = MIN(số ngày trễ × mức phạt × tiền mốc, trần × tiền mốc), làm tròn 0,01 trước khi trừ
tiền trả    = tiền mốc − tiền phạt
```

| Bước | Tính | Kết quả |
| --- | --- | --- |
| Mốc | 516,00 triệu; phạt 0,10%/ngày; trần 10%; ân hạn 2 ngày | |
| Hoàn thành | trễ 3 ngày so với hạn | trễ sau ân hạn **1 ngày** |
| Tiền phạt | 1 × 0,10% × 516,00 = 0,516 | **0,52** (trần 51,60 không chạm) |
| Tiền trả | 516,00 − 0,52 | **515,48** |

Mọi phép tính tiền dùng số thập phân chính xác, không dùng số thực dấu phẩy động.

### 6.5. Giữ tiền khác từ chối

**Giữ tiền** là tạm thời: có thêm chứng từ, phê duyệt hoặc đóng tranh chấp thì chấm lại và có thể được trả. **Từ chối** là kết luận không trả.

## 7. Trạng thái

### 7.1. Hợp đồng

```
Bản nháp ─▶ Đang ký ─▶ (có hiệu lực: Chờ điều kiện / Cần xem xét / Mọi mốc đủ điều kiện)
          ─▶ Đã xong các mốc ─▶ Đã thanh lý
```

Khi có hiệu lực, trạng thái hiển thị được suy ra từ các mốc, chỉ để theo dõi, không đổi quyết định của mốc nào.

### 7.2. Mốc

| Engine kết luận | Trạng thái mốc | Ai cần làm gì |
| --- | --- | --- |
| Giữ: thiếu chứng từ | Chờ chứng từ | Bên còn thiếu nộp |
| Giữ: chưa đủ người duyệt | Chờ phê duyệt | Người duyệt phê duyệt |
| Giữ: tranh chấp, sai thẩm quyền, chưa rõ | Tạm giữ | Giải quyết tranh chấp, hoặc ngoại lệ |
| Từ chối | Bị từ chối | Không trả; xem lý do |
| Trả | Đủ điều kiện chi | Tài chính duyệt lệnh chi |
| Trả có trừ phạt | Chi có trừ phạt | Tài chính duyệt lệnh chi |
| (sau khi duyệt lệnh chi) | Đã chuyển chi | Xong, khoá |

Mỗi người thấy việc của mình ở **Việc cần làm**, kèm "đang chờ ai, chờ bao lâu" ([09](09_VIEC_CON_LAI_VA_HOP_VIEC.md)).

## 8. Nguyên tắc an toàn

| # | Nguyên tắc | Làm thế nào |
| --- | --- | --- |
| 1 | **Chưa chắc thì giữ tiền** | Luật cuối luôn là "còn lại thì giữ"; chốt an toàn khi luật trả tiền thắng |
| 2 | **Trình duyệt không ra quyết định** | Giao diện chỉ hiển thị và chạy thử; API kiểm quyền và nghiệp vụ; engine quyết định |
| 3 | **Không tin điều người dùng tự khai** | Bên ghi, vai trò, tổ chức lấy từ tài khoản đăng nhập |
| 4 | **Tiền tính chính xác** | Số thập phân, không số thực |
| 5 | **Chỉ thêm, không sửa, không xoá** | Sự kiện và nhật ký chỉ thêm; ghi nhầm thì đi qua ngoại lệ |
| 6 | **Tách nhiệm** | Người cấu hình, người đề xuất ngoại lệ, người duyệt ngoại lệ, người duyệt chi là những người khác nhau |
| 7 | **Giải thích được mọi kết quả** | Mỗi quyết định lưu vết luật và con số |
| 8 | **Dữ liệu của ban tổ chức giữ nguyên** | 405 quyết định không đổi; phụ lục và thanh lý chỉ cho hợp đồng lập trong ứng dụng |

## 9. Ý tưởng từ Contract Smart, chưa có trong CodeCash

Repo Contract Smart đi theo hướng "người dùng tự dựng quy trình". Các ý tưởng đáng cân nhắc cho bản sau:

| Ý tưởng | Hiện trạng CodeCash | Ghi chú |
| --- | --- | --- |
| **Viết luật bằng câu mẫu** ("Trễ quá **n** ngày thì …", "Chưa đủ **n** người duyệt thì giữ") thay vì gõ biểu thức | **Đã có** (25/11/2026): 3 câu siết, 2 câu nới, đặt tự động vào khoảng ưu tiên an toàn | Xem [Đặc tả](NGHIEP_VU.md) §6.3 |
| **Thư viện mốc có phiên bản**: mốc mẫu (chứng từ + bộ luật) dùng lại cho nhiều loại hợp đồng; loại hợp đồng ghép từ các mốc | Quy trình riêng `APP_…` trong phiên bản luật | Thư viện mốc linh hoạt hơn nhưng phải giữ 405 quyết định của Data Pack |
| **Luật riêng cho từng hợp đồng** (khách quen được nới điều kiện), không ảnh hưởng luật chung | Chưa có; chỉnh tay mốc chỉ đổi tỷ lệ, hạn, chứng từ, phạt, miễn duyệt | Cần chứng minh an toàn cho từng bản riêng |
| **Quản trị công ty** tự tạo và khoá tài khoản nhân viên công ty mình | Quản trị hệ thống quản lý mọi tài khoản | Phải giữ tách nhiệm SoD-1 |
| **PostgreSQL** có khoá ngoại và trigger khoá dữ liệu đã chốt ngay trong CSDL | Tệp JSON hoặc MongoDB, kiểm bằng mã | Thiết kế cho CodeCash: [31](31_THIET_KE_CSDL_POSTGRES.md); bản Contract Smart đã dựng: [34](34_CSDL_CONTRACT_SMART.md) |
| **Nhật ký do CSDL niêm phong**: trigger cấp số thứ tự, giờ và mã băm; chụp lại vai trò người làm lúc thao tác | Niêm phong trong `Repository.transact` ở API; nhật ký đã ghi vai trò | Khi chuyển PostgreSQL thì dời việc niêm phong xuống trigger như [34](34_CSDL_CONTRACT_SMART.md) §6b.4 |

Ngược lại, nhiều mục Contract Smart còn đánh dấu "chưa làm" thì CodeCash đã có: ký hai bên qua dịch vụ ký, ngoại lệ hai người, chứng từ có tệp và chữ ký, kiểm hoá đơn, cảnh báo trình tự, điểm tin cậy, phụ lục, thanh lý, việc cần làm, tổng quan.

## 10. Câu hỏi thường gặp

**Engine có tự ý trả tiền không?**
Không. Engine chỉ kết luận mốc **đủ điều kiện**. Tiền chỉ đi khi phê duyệt tài chính duyệt lệnh chi. Khi không chắc, engine giữ tiền.

**Ghi nhầm thì sao?**
Không xoá được. Chủ hợp đồng đề xuất ngoại lệ, kiểm soát viên cùng bên duyệt, engine chấm lại.

**Sửa luật chung có làm đổi hợp đồng đang chạy không?**
Không. Hợp đồng ghim phiên bản luật lúc soạn; phiên bản đã công bố bị khoá, sửa luật là tạo phiên bản mới.

**Vì sao mốc giao hàng được trả dù mốc ký còn giữ?**
Mỗi mốc được chấm độc lập, giống dữ liệu của ban tổ chức (bộ luật không có điều kiện phụ thuộc mốc trước).

**Engine có dùng AI không?**
Không. Engine chấm theo luật rõ ràng nên lần nào cũng ra cùng kết quả. AI chỉ **đề xuất** điều khoản khi đọc văn bản hợp đồng, kèm trang và câu trích; người dùng xác nhận.

**Kiểm toán làm sao biết dữ liệu không bị sửa?**
Nhật ký nối chuỗi băm: mỗi dòng chứa mã băm của dòng trước, sửa hay xoá một dòng là chuỗi đứt ở đúng chỗ đó. Kiểm toán bấm "Kiểm tra toàn vẹn" để kiểm lại bất kỳ lúc nào; chuỗi còn được niêm phong độc lập.

**Ai xem được nhật ký?**

| Vai | Thấy | Dùng để |
| --- | --- | --- |
| Kiểm toán, quản trị hệ thống | Toàn bộ nhật ký nhưng **chỉ phần khung**: số thứ tự, mã băm, hành động, đối tượng, thời điểm; không thấy ai làm, số tiền, nội dung | Kiểm chuỗi băm, xuất bằng chứng niêm phong; kiểm mà không đọc được dữ liệu kinh doanh |
| Người làm hợp đồng và kiểm soát viên | Trang **Hoạt động**: lịch sử chứng từ, phê duyệt, tranh chấp của các hợp đồng công ty mình là một bên (nhà cung cấp: hợp đồng của chính mình) | Đối chiếu khi có tranh chấp |
| Không ai | Sửa, xoá | |

Đăng nhập sai và mọi yêu cầu bị từ chối cũng được ghi (`REQUEST_FAILED`, kèm mã lỗi); email gõ vào chỉ lưu dạng băm, và các lần sai lặp lại được gộp để nhật ký không bị làm đầy.
