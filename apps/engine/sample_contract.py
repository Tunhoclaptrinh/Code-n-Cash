"""Generate editable, business-shaped OOXML contracts and a dedicated, spacious signature page.

mode "sample" (default) is an unsigned test document for a new draft; mode "original" is the
simulated original file of an organiser contract that ships without a document. Output bytes are
deterministic for the same input, so a regenerated original keeps its SHA-256.
"""
import io
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape


def build_document(data):
    language = data.get('language', 'vi')
    if language not in ('vi', 'en'):
        raise ValueError('INVALID_LANGUAGE')
    count = len(data['signers'])
    # Live previews of an unfinished draft may have no signers yet; real fixtures need 1-4.
    partial = data.get('partial') is True
    if not (1 <= count <= 4 or (partial and count == 0)):
        raise ValueError('SIGNER_COUNT')
    if partial:
        # Unfinished drafts leave display fields unset; show the same placeholder the caller uses.
        for key in ('title', 'supplier', 'valueMillion', 'startDate', 'endDate', 'graceDays', 'penaltyRatePct', 'maxPenaltyPct', 'approvalPolicy'):
            if data.get(key) in (None, ''):
                data = {**data, key: '……'}
    vi = language == 'vi'
    labels = json.loads((Path(__file__).parent / 'templates' / f'sample-{language}.json').read_text())
    original = data.get('mode', 'sample') == 'original'
    if original:
        labels['sample'] = labels['original']['notice']
        labels['sections'][-1]['body'] = labels['original']['closing']

    def p(text='', style=None, align=None, before=False, blank=False):
        properties = '<w:spacing w:after="100" w:line="280"/>' + (f'<w:pStyle w:val="{style}"/>' if style else '') + (f'<w:jc w:val="{align}"/>' if align else '')
        if before:
            properties += '<w:pageBreakBefore/>'
        if blank:
            properties = properties.replace('<w:spacing w:after="100" w:line="280"/>', '<w:spacing w:line="2400" w:lineRule="exact"/>')
        content = '</w:t><w:br/><w:t xml:space="preserve">'.join(escape(line) for line in str(text).split('\n'))
        run = '<w:rFonts w:ascii="DejaVu Serif" w:hAnsi="DejaVu Serif"/><w:sz w:val="24"/>'
        if style in ('Heading1', 'Heading2', 'Title'):
            run += '<w:b/>'
        if style == 'Title':
            run = run.replace('w:val="24"', 'w:val="32"')
        if style in ('Notice', 'Anchor'):
            run = run.replace('w:val="24"', 'w:val="18"')
        return f'<w:p><w:pPr>{properties}</w:pPr><w:r><w:rPr>{run}</w:rPr><w:t xml:space="preserve">{content}</w:t></w:r></w:p>'

    def table(rows, widths, header=True):
        grid = ''.join(f'<w:gridCol w:w="{width}"/>' for width in widths)
        output = []
        for index, row in enumerate(rows):
            cells = []
            for value, width in zip(row, widths):
                shading = '<w:shd w:fill="EEF2F7"/>' if header and index == 0 else ''
                cells.append(f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/>{shading}</w:tcPr>{p(value)}</w:tc>')
            output.append('<w:tr><w:trPr><w:cantSplit/></w:trPr>'+''.join(cells)+'</w:tr>')
        return '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>'+''.join(f'<w:{edge} w:val="single" w:sz="4" w:color="CBD5E1"/>' for edge in ['top','left','bottom','right','insideH','insideV'])+'</w:tblBorders><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>'+grid+'</w:tblGrid>'+''.join(output)+'</w:tbl>'

    custom = data.get('documentBody', '')
    if custom:
        custom = re.sub(r'\{\{(title|code|buyer|supplier|valueMillion|startDate|endDate|graceDays|penaltyRatePct|maxPenaltyPct)\}\}', lambda match: str(data[match.group(1)]), custom)
        labels['sections'][1]['body'] = custom.replace('{', '{{').replace('}', '}}')
    content = [p('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM' if vi else 'CONTRACT AGREEMENT', 'Heading2', 'center'),
               p('Độc lập – Tự do – Hạnh phúc' if vi else 'Prepared for review and electronic execution', align='center'),
               p('HỢP ĐỒNG HÀNG HÓA / DỊCH VỤ' if vi else 'GOODS AND SERVICES AGREEMENT', 'Title', 'center'),
               p(data['title'], 'Heading2', 'center'), p(('Số: ' if vi else 'Reference: ') + data['code'], align='center'),
               p(labels['sample'], 'Notice')]
    parties = [[('BÊN MUA' if vi else 'BUYER'), data['buyer']], [('NHÀ CUNG CẤP' if vi else 'SUPPLIER'), data['supplier']]]
    content.append(table(parties, [2400, 7000], False))
    content.append(p('Các bên thống nhất nội dung hợp đồng và cơ chế ký xác nhận dưới đây.' if vi else 'The parties agree on the following terms and execution order.'))
    for key in ('valueMillion', 'startDate', 'endDate', 'graceDays', 'penaltyRatePct', 'maxPenaltyPct'):
        content.append(p(labels['fields'][key].format(value=data[key])))
    events = {'CONTRACT_SIGNED':'Hợp đồng đã ký', 'DELIVERY':'Biên bản bàn giao', 'INVOICE':'Hóa đơn', 'ACCEPTANCE':'Biên bản nghiệm thu', 'WARRANTY_COMPLETED':'Xác nhận hoàn tất bảo hành', 'KICKOFF_CONFIRMED':'Xác nhận khởi động', 'SERVICE_COMPLETED':'Xác nhận hoàn thành dịch vụ'}
    for index, section in enumerate(labels['sections']):
        content += [p(f"Điều {index + 1}. {section['title']}" if vi else f"Article {index + 1}. {section['title']}", 'Heading1'), p(section['body'].format(**data))]
        if index == 3:
            rows = [['Mốc' if vi else 'Milestone', 'Tỷ lệ' if vi else 'Share', 'Thời hạn' if vi else 'Due date', 'Hồ sơ cần có' if vi else 'Required evidence']]
            for stage in data['stages']:
                required = ', '.join(events.get(event.strip(), event.strip()) if vi else event.strip().replace('_',' ').title() for event in stage['requiredEvents'].split(','))
                name = labels['milestoneTypes'].get(stage.get('type', ''), stage['name'])
                rows.append([name, stage['paymentPercent']+'%', stage['dueDate'], required])
            content.append(table(rows, [2200, 1000, 1800, 4400]))
        if index == 6:
            content.append(p(labels['pendingSigners'] if count == 0 else labels['single'] if count == 1 else labels['multiple']))
            for sequence, signer in enumerate(data['signers'], 1):
                content.append(p(f"{sequence}. {signer['name']} — {labels['sides'][signer['party']]}"))
    content += [p(labels['signatures'], 'Title', 'center', before=True),
                p(labels['pendingSigners'] if count == 0 else labels['single'] if count == 1 else labels['multiple']),
                p('Đối chiếu toàn bộ tài liệu trước khi ký. Vùng trống bên dưới dành cho chữ ký; họ tên và thời gian ký được lưu cùng hồ sơ.' if vi else 'Review the entire document before signing. The blank areas below are reserved for signatures; signer identity and time are retained with the record.')]
    # Two full-width signing areas per page keep long names readable and avoid split table rows.
    for index, signer in enumerate(data['signers']):
        if index and index % 2 == 0:
            content.append(p(labels['signatures'] + (' (tiếp)' if vi else ' (continued)'), 'Title', 'center', before=True))
        content += [p(labels['sides'][signer['party']].upper(), 'Heading2'), p(signer['name']),
                    p(('VỊ TRÍ KÝ ' if vi else 'SIGNING AREA ') + str(index + 1).zfill(2), 'Anchor'),
                    p(' ', blank=True),
                    p('Ký số và ghi nhận thời gian trên hệ thống' if vi else 'Digital signature and timestamp recorded by the system', 'Anchor')]
    if count == 0:
        content += [p(labels['pendingSignerBlock'], 'Heading2'), p(' ', blank=True)]
    document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>'+''.join(content)+'<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1134" w:bottom="1000" w:left="1134" w:footer="500"/></w:sectPr></w:body></w:document>'
    styles = '''<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="280"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Title"><w:pPr><w:spacing w:before="180" w:after="180"/><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Notice"><w:rPr><w:color w:val="92400E"/><w:sz w:val="18"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Anchor"><w:rPr><w:color w:val="64748B"/><w:sz w:val="18"/></w:rPr></w:style></w:styles>'''
    footer = '<?xml version="1.0" encoding="UTF-8"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+p(data['code']+' · '+(labels['original']['footer'] if original else 'Mẫu dùng thử — Chưa ký · Trang ' if vi else 'Demo — Unsigned · Page ')).replace('</w:p>', '<w:fldSimple w:instr="PAGE"/></w:p>')+'</w:ftr>'
    output=io.BytesIO()
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as bundle:
        # A fixed timestamp keeps the archive bytes identical for identical input.
        writestr = bundle.writestr
        bundle.writestr = lambda name, text: writestr(zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0)), text, zipfile.ZIP_DEFLATED)
        bundle.writestr('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>')
        bundle.writestr('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        bundle.writestr('word/_rels/document.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer.xml"/></Relationships>')
        bundle.writestr('word/document.xml',document)
        bundle.writestr('word/styles.xml',styles)
        bundle.writestr('word/footer.xml',footer)
    return output.getvalue()


if __name__ == '__main__':
    sys.stdout.buffer.write(build_document(json.load(sys.stdin)))
