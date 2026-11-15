"""Create a synthetic equipment reservation example, independent of any exam."""
from pathlib import Path
import argparse
import xml.etree.ElementTree as ET
from bpmn_builder import Diagram, document
from colorize_drawio import colorize_tree
from themes import legend


def build():
    d=Diagram('reservation','Đặt trước thiết bị dùng chung',1450,800)
    d.pool('CUSTOMER','Người đăng ký',80,110,1280,85,black=True)
    d.pool('ORG','Đơn vị quản lý thiết bị',80,270,1280,470)
    d.lane('FRONT','TIẾP NHẬN',(128,270,1232,225),'ORG')
    d.lane('STOCK','KHO THIẾT BỊ',(128,495,1232,245),'ORG')
    d.event('S','Nhận yêu cầu',190,355,'FRONT',symbol='message')
    d.task('CHECK','Kiểm tra số lượng\ncó thể cấp',310,333,'FRONT',marker='user',w=220,h=85)
    d.gateway('G','Còn đủ thiết bị?',650,347,'FRONT')
    d.task('REJECT','Thông báo không đủ\nthiết bị',850,333,'FRONT',marker='abstract',w=220,h=85)
    d.event('E_NO','Không cấp được',1190,355,'FRONT',outline='end')
    d.task('RESERVE','Ghi nhận đặt trước\nvà giữ thiết bị',850,565,'STOCK',marker='user',w=220,h=85)
    d.event('E_OK','Đã giữ thiết bị',1190,587,'STOCK',outline='end')
    d.edge('M','CUSTOMER','S','Yêu cầu đặt trước',kind='messageFlow',exit=(.1,1),entry=(.5,0),points=((208,235),))
    d.edge('F1','S','CHECK')
    d.edge('F2','CHECK','G')
    d.edge('F3','G','REJECT','Không',condition='available < requested')
    d.edge('F4','REJECT','E_NO')
    d.edge('F5','G','RESERVE','Có',condition='available >= requested',exit=(.5,1),points=((677,607),))
    d.edge('F6','RESERVE','E_OK')
    return document([d])


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir',type=Path,required=True)
    args=parser.parse_args();args.output_dir.mkdir(parents=True,exist_ok=True)
    root=build()
    for name,theme in [('Demo.drawio','monochrome'),('Demo_Co_mau.drawio','bizagi-inspired')]:
        tree=colorize_tree(root,theme);ET.indent(tree,space='  ')
        ET.ElementTree(tree).write(args.output_dir/name,encoding='utf-8',xml_declaration=True)
    text='''# Đặt trước thiết bị dùng chung

Ví dụ tổng hợp, không sử dụng đề thi hoặc dữ liệu khách hàng.

| Yêu cầu | Phần tử | Kịch bản |
|---|---|---|
| Nhận yêu cầu từ bên ngoài | CUSTOMER, M, S | Một thông điệp tạo một lần xử lý |
| Kiểm tra tồn khả dụng trước quyết định | CHECK, G | available và requested là số nguyên không âm đã được kiểm tra |
| Đủ thiết bị thì ghi nhận và giữ số lượng | F5, RESERVE, E_OK | Không thực hiện nhánh từ chối |
| Thiếu thiết bị thì thông báo | F3, REJECT, E_NO | Không giữ thiết bị |

Một pool đơn vị quản lý, hai lane phân vai; khách là pool black-box. Sequence đi qua lane trong cùng pool. Message M có nét đứt, vòng gửi và đầu mũi tên rỗng; không truyền token qua pool.

CHECK tạo kết quả tồn khả dụng; G chỉ đọc điều kiện. RESERVE hoàn tất khi đặt trước và giữ thiết bị đã được ghi nhận. REJECT là tác vụ tổng quát vì đề tự đặt chưa xác định kênh thông báo.

Giả định: yêu cầu đã có định danh và số lượng hợp lệ; kiểm tra và giữ thiết bị không có cạnh tranh từ yêu cầu khác trong phạm vi minh họa. Dùng thật cần xác định cơ chế giữ chỗ nguyên tử và xử lý đồng thời; biểu đồ này không chứng minh điều đó. Pool black-box không mô tả việc khách làm sau khi nhận phản hồi.

Walkthrough: available=3/requested=2 → S,CHECK,G,RESERVE,E_OK; available=1/requested=2 → S,CHECK,G,REJECT,E_NO; available=2/requested=2 → nhánh đủ. Mỗi lần chỉ có một kết thúc, không có AND join.

Vẽ lại: đặt hai pool, hai lane trong pool đơn vị; đặt trigger/kiểm tra/gateway trên lane tiếp nhận; nhánh thiếu đi thẳng, nhánh đủ đi xuống lane kho; nối sequence và đặt predicate; tạo bản màu bằng theme, giữ nguyên hình học.

## Chú giải màu

'''+legend()
    (args.output_dir/'README.md').write_text(text,encoding='utf-8')
    print('Created Demo.drawio, Demo_Co_mau.drawio and business walkthrough')


if __name__=='__main__':main()
