# Theme, màu và ký pháp

Hai profile chính là `monochrome` và `bizagi-inspired`. `tool-convention` giữ API/palette lịch sử; profile này chỉ thay fill thay vì ép đổi toàn bộ màu chữ/viền. Màu của profile Bizagi là lựa chọn cục bộ lấy cảm hứng từ tài liệu, không phải trích xuất mã màu chính thức. Nguồn: [OMG §7.5](https://www.omg.org/spec/BPMN/2.0.2/PDF), [Bizagi Events](https://help.bizagi.com/platform/en/events.htm).

## Nguồn cấu hình duy nhất

JSON trong `assets/themes/` được `themes.py` đọc và kiểm tra cho cả colorize/audit/legend. Có thể truyền tên hoặc đường dẫn file JSON vào `--theme` của colorizer và `--palette` của auditor. Không sửa mã Python để thêm palette.

Schema runtime: `schema_version=1`, `id`, `description`/`source` tùy chọn, `fills`, `stroke`, `text`, `label_background`, `min_text_contrast`, `apply_ink`. `fills` phải có đúng start, end, intermediate, gateway, activity, frame, header, body. Màu phải là hex sáu chữ số. Unknown keys bị từ chối: không thể đưa endArrow/dashed/fontSize vào theme.

Chữ cần tương phản tối thiểu 4.5 với mọi màu nền và nền nhãn; viền/marker tối thiểu 3. Đây là kiểm tra profile, không phải chứng nhận accessibility cho mọi tình huống hiển thị. Profile tùy biến vẫn cần kiểm tra ảnh và trạng thái in xám.

`bizagi-inspired`: start xanh nhạt, end đỏ nhạt, intermediate/boundary/gateway vàng, activity xanh dương, khung nhạt, header xám, body trắng. `monochrome`: nền trắng, viền và chữ gần đen. Data object/store dùng màu body. Tên kết quả không điều khiển màu; end thành công vẫn đỏ.

## Những thứ theme không được đổi

ID, nhãn, geometry, parent, source/target, ring, marker, dash, arrowhead, strokeWidth, trigger/result và loại activity/gateway. So sánh canonical giữ tất cả ngoại trừ giá trị sáu thuộc tính màu được công khai trong drawio_common.py. `strokeColor=none` hoặc `fontColor=none` làm mất nét/chữ nên được tính là đổi nội dung, không phải đổi màu. Hai profile chỉ khác màu; không xóa style không hiểu để làm kết quả so sánh pass.

Ngoài palette, auditor luôn kiểm tra tương phản fill/stroke của event có marker và send/receive task (tối thiểu 3:1): fill trùng màu nét làm marker bắt (rỗng) trông như marker ném (đặc). `id` của theme là chữ thường/số/gạch nối; `description`/`source` phải là văn bản.

`isLoopSub=1` trong shape task2 của draw.io được sử dụng làm dấu cộng của collapsed subprocess; tên thuộc tính implementation không có nghĩa là BPMN loop. Expanded subprocess dùng màu frame, collapsed dùng activity. Viền event subprocess/transaction/call activity vẫn phải theo loại, không được đổi vì palette. Call Activity hiện cần targeted review, xem coverage.md.

## Ví dụ

```bash
python3 scripts/colorize_drawio.py source.drawio normal.drawio --theme monochrome
python3 scripts/colorize_drawio.py normal.drawio color.drawio --theme bizagi-inspired
python3 scripts/audit_drawio.py color.drawio --compare normal.drawio --palette bizagi-inspired --report color-check.json
```

Lệnh cuối chưa kiểm tra ảnh nếu không có `--render-dir`. Để hoàn tất bàn giao, dựng ảnh cả hai bản và đọc lại chúng.
