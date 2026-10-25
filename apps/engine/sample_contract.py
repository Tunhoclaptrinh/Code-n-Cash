"""Generate editable, typeset OOXML contracts with a dedicated signature page.

mode "sample" (default) is an unsigned test document for a new draft; mode "original" is the
simulated original file of an organiser contract that ships without a document. Output bytes are
deterministic for the same input, so a regenerated original keeps its SHA-256.

Layout follows the presentation rules of Nghị định 30/2020/NĐ-CP for administrative documents:
A4 portrait, margins 20 mm top and bottom, 30 mm left, 15 mm right, Times New Roman, 13 pt body,
justified paragraphs with a 1 cm first-line indent and 1.15 line spacing. Every visible text comes
from the input data or from templates/sample-{vi,en}.json; nothing else is invented.
"""
import io
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

# Page geometry in twips (1 mm = 56.7 twips).
PAGE_WIDTH, PAGE_HEIGHT = 11906, 16838
MARGIN_TOP = MARGIN_BOTTOM = 1134
MARGIN_LEFT, MARGIN_RIGHT = 1701, 850
TEXT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
FIRST_LINE = 567  # 1 cm
# One signing box is 240 units wide on a 520 unit page (the web overlay), 5500 twips.
SIGNATURE_WIDTH = 5500
# The empty height after the anchor line must hold the 92 unit overlay plus its 8 unit offset.
SIGNATURE_SPACE = 2300

TERM_KEYS = ('valueMillion', 'startDate', 'endDate', 'graceDays', 'penaltyRatePct', 'maxPenaltyPct')
BORDER = 'w:val="single" w:sz="4" w:space="0" w:color="000000"'


def run(text, bold=False, italic=False, tab=False):
    properties = ('<w:b/>' if bold else '') + ('<w:i/>' if italic else '')
    lines = str(text).split('\n')
    content = '<w:br/>'.join(f'<w:t xml:space="preserve">{escape(line)}</w:t>' for line in lines)
    if tab:
        content = '<w:tab/>' + content
    return f'<w:r>{"<w:rPr>" + properties + "</w:rPr>" if properties else ""}{content}</w:r>'


def para(content='', style=None, keep_next=False, page_break=False, indent=None, jc=None, after=None):
    """One paragraph; `content` is plain text or a list of prepared runs."""
    properties = (f'<w:pStyle w:val="{style}"/>' if style else '') + ('<w:keepNext/>' if keep_next else '') \
        + ('<w:pageBreakBefore/>' if page_break else '')
    if after is not None:
        properties += f'<w:spacing w:after="{after}"/>'
    if indent:
        properties += '<w:ind ' + ' '.join(f'w:{name}="{value}"' for name, value in indent.items()) + '/>'
    if jc:
        properties += f'<w:jc w:val="{jc}"/>'
    runs = content if isinstance(content, list) else [run(content)] if content != '' else []
    return f'<w:p><w:pPr>{properties}</w:pPr>{"".join(runs)}</w:p>'


def cell(text, width, style='TableText', shade=None, jc=None):
    shading = f'<w:shd w:val="clear" w:color="auto" w:fill="{shade}"/>' if shade else ''
    return (f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/>{shading}<w:vAlign w:val="center"/></w:tcPr>'
            f'{para(text, style, jc=jc)}</w:tc>')


def table(rows, widths, header=False, aligns=None):
    """Full width table with 0.5 pt borders; rows never split and the header repeats on each page."""
    aligns = aligns or [None] * len(widths)
    grid = ''.join(f'<w:gridCol w:w="{width}"/>' for width in widths)
    output = []
    for index, row in enumerate(rows):
        head = header and index == 0
        cells = ''.join(cell(value, width, 'TableHead' if head else 'TableText', 'D9D9D9' if head else None, None if head else align)
                        for value, width, align in zip(row, widths, aligns))
        output.append(f'<w:tr><w:trPr><w:cantSplit/>{"<w:tblHeader/>" if head else ""}</w:trPr>{cells}</w:tr>')
    borders = ''.join(f'<w:{edge} {BORDER}/>' for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'))
    properties = (f'<w:tblPr><w:tblW w:w="{sum(widths)}" w:type="dxa"/><w:tblBorders>{borders}</w:tblBorders>'
                  '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="28" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>'
                  '<w:bottom w:w="28" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>')
    return f'<w:tbl>{properties}<w:tblGrid>{grid}</w:tblGrid>{"".join(output)}</w:tbl>'


def style(style_id, name, based='Normal', paragraph='', character='', default=False, next_style=None):
    marker = ' w:default="1"' if default else ''
    return (f'<w:style w:type="paragraph"{marker} w:styleId="{style_id}"><w:name w:val="{name}"/>'
            + (f'<w:basedOn w:val="{based}"/>' if based else '') + (f'<w:next w:val="{next_style}"/>' if next_style else '')
            + '<w:qFormat/>' + (f'<w:pPr>{paragraph}</w:pPr>' if paragraph else '')
            + (f'<w:rPr>{character}</w:rPr>' if character else '') + '</w:style>')


def build_styles(language):
    flat = '<w:ind w:firstLine="0"/>'
    face = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/>'
    lang = 'vi-VN' if language == 'vi' else 'en-US'
    styles = [
        # Body: justified, 1 cm first-line indent, multiple 1.15, 6 pt after, 13 pt.
        style('Normal', 'Normal', based=None, default=True,
              paragraph='<w:widowControl/><w:spacing w:before="0" w:after="120" w:line="276" w:lineRule="auto"/>'
                        f'<w:ind w:firstLine="{FIRST_LINE}"/><w:jc w:val="both"/>',
              character='<w:sz w:val="26"/><w:szCs w:val="26"/>'),
        style('NationalHeader', 'National header', paragraph=f'<w:spacing w:after="0"/>{flat}<w:jc w:val="center"/>',
              character='<w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/>'),
        style('Motto', 'Motto', paragraph='<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="000000"/></w:pBdr>'
                                          f'<w:spacing w:after="0"/>{flat}<w:jc w:val="center"/>',
              character='<w:b/><w:bCs/>'),
        style('DocTitle', 'Document title', paragraph=f'<w:keepNext/><w:spacing w:before="240" w:after="0"/>{flat}<w:jc w:val="center"/>',
              character='<w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/>'),
        style('ContractName', 'Contract name', paragraph=f'<w:keepNext/><w:spacing w:after="0"/>{flat}<w:jc w:val="center"/>',
              character='<w:b/><w:bCs/>'),
        style('ContractNumber', 'Contract number', paragraph=f'<w:spacing w:after="120"/>{flat}<w:jc w:val="center"/>'),
        style('Notice', 'Notice', paragraph=f'<w:spacing w:before="60" w:after="240"/>{flat}<w:jc w:val="center"/>',
              character='<w:i/><w:iCs/><w:sz w:val="22"/><w:szCs w:val="22"/>'),
        style('Basis', 'Legal basis', character='<w:i/><w:iCs/>'),
        style('Note', 'Note', paragraph=f'<w:spacing w:after="60"/>{flat}<w:jc w:val="center"/>',
              character='<w:i/><w:iCs/><w:sz w:val="22"/><w:szCs w:val="22"/>'),
        style('Party', 'Party', paragraph=f'<w:tabs><w:tab w:val="left" w:pos="{FIRST_LINE + 3544}"/></w:tabs><w:spacing w:after="60"/>'
                                          f'<w:ind w:left="{FIRST_LINE + 3544}" w:hanging="3544"/><w:jc w:val="left"/>'),
        style('Heading1', 'heading 1', next_style='Normal',
              paragraph=f'<w:keepNext/><w:spacing w:before="240" w:after="120"/>{flat}<w:jc w:val="left"/><w:outlineLvl w:val="0"/>',
              character='<w:b/><w:bCs/>'),
        style('ListItem', 'List item', paragraph='<w:tabs><w:tab w:val="left" w:pos="851"/></w:tabs>'
                                                 '<w:ind w:left="851" w:hanging="284"/>'),
        style('TableText', 'Table text', paragraph=f'<w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/>{flat}<w:jc w:val="left"/>',
              character='<w:sz w:val="24"/><w:szCs w:val="24"/>'),
        style('TableHead', 'Table head', based='TableText', paragraph='<w:keepNext/><w:jc w:val="center"/>', character='<w:b/><w:bCs/>'),
        style('SignatureTitle', 'Signature title', paragraph=f'<w:keepNext/><w:spacing w:before="360" w:after="120"/>{flat}<w:jc w:val="center"/>',
              character='<w:b/><w:bCs/>'),
        style('SignatureSide', 'Signature side', paragraph=f'<w:keepNext/><w:spacing w:before="160" w:after="0"/>{flat}<w:jc w:val="center"/>',
              character='<w:b/><w:bCs/>'),
        style('SignatureRole', 'Signature role', paragraph=f'<w:keepNext/><w:spacing w:after="0"/>{flat}<w:jc w:val="center"/>',
              character='<w:i/><w:iCs/>'),
        style('SignatureNote', 'Signature note', paragraph=f'<w:keepNext/><w:spacing w:after="0"/>{flat}<w:jc w:val="center"/>',
              character='<w:i/><w:iCs/><w:sz w:val="22"/><w:szCs w:val="22"/>'),
        # The anchor text is what the PDF geometry finds; the empty height below it is the signing box.
        style('Anchor', 'Signature anchor', paragraph=f'<w:keepNext/><w:spacing w:before="60" w:after="{SIGNATURE_SPACE}"/>{flat}<w:jc w:val="left"/>',
              character='<w:color w:val="7F7F7F"/><w:sz w:val="22"/><w:szCs w:val="22"/>'),
        style('SignatureName', 'Signature name', paragraph=f'<w:spacing w:after="60"/>{flat}<w:jc w:val="center"/>',
              character='<w:b/><w:bCs/>'),
    ]
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            f'<w:docDefaults><w:rPrDefault><w:rPr>{face}<w:sz w:val="26"/><w:szCs w:val="26"/><w:lang w:val="{lang}" w:eastAsia="{lang}" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>'
            '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
            + ''.join(styles) + '</w:styles>')


def build_document(data):
    language = data.get('language', 'vi')
    if language not in ('vi', 'en'):
        raise ValueError('INVALID_LANGUAGE')
    count = len(data['signers'])
    # Live previews of an unfinished draft may have no signers yet; real fixtures need 1-4.
    partial = data.get('partial') is True
    if not (1 <= count <= 4 or (partial and count == 0)):
        raise ValueError('SIGNER_COUNT')
    placeholder = '……'
    if partial:
        # Unfinished drafts leave display fields unset; show the same placeholder the caller uses.
        for key in ('title', 'supplier', 'valueMillion', 'startDate', 'endDate', 'graceDays', 'penaltyRatePct', 'maxPenaltyPct', 'approvalPolicy'):
            if data.get(key) in (None, ''):
                data = {**data, key: placeholder}
    labels = json.loads((Path(__file__).parent / 'templates' / f'sample-{language}.json').read_text(encoding='utf-8'))
    original = data.get('mode', 'sample') == 'original'
    if original:
        labels['sample'] = labels['original']['notice']
        labels['sections'][-1]['body'] = labels['original']['closing']
    custom = data.get('documentBody', '')
    if custom:
        custom = re.sub(r'\{\{(title|code|buyer|supplier|valueMillion|startDate|endDate|graceDays|penaltyRatePct|maxPenaltyPct)\}\}', lambda match: str(data[match.group(1)]), custom)
        labels['sections'][1]['body'] = custom.replace('{', '{{').replace('}', '}}')

    header, table_labels = labels['header'], labels['table']
    # The motto rule is a paragraph border limited by the indents; English text is longer.
    motto_indent = 2600 if language == 'vi' else 1800
    signers_note = labels['pendingSigners'] if count == 0 else labels['single'] if count == 1 else labels['multiple']
    content = [para(header['nation'], 'NationalHeader'),
               para(header['motto'], 'Motto', indent={'left': motto_indent, 'right': motto_indent, 'firstLine': 0}),
               para(header['title'], 'DocTitle'),
               para(data['title'], 'ContractName'),
               para(f"{labels['numberPrefix']}{data['code']}", 'ContractNumber'),
               para(labels['sample'], 'Notice')]
    content += [para(line, 'Basis') for line in labels['basis']]
    content.append(para(labels['dateLine']))
    for party, key in (('BUYER', 'buyer'), ('SUPPLIER', 'supplier')):
        content.append(para([run(labels['parties'][party], bold=True), run(data[key], tab=True)], 'Party'))
    content.append(para(labels['intro']))
    content.append(table([[labels['fields'][key]['label'], labels['fields'][key]['value'].format(value=data[key])] for key in TERM_KEYS],
                         [3600, TEXT_WIDTH - 3600]))

    for index, section in enumerate(labels['sections']):
        content.append(para(labels['article'].format(number=index + 1, title=section['title']), 'Heading1'))
        body = section['body'].format(**data)
        # A custom document body may hold several lines; each one is its own paragraph.
        lines = [line for line in body.split('\n') if line.strip()]
        # With one or two signers the first signature page shares the page with the last article.
        closing = index == len(labels['sections']) - 1 and count <= 2
        content += [para(line, keep_next=closing and number == len(lines) - 1) for number, line in enumerate(lines)]
        if index == 3:
            rows = [[table_labels[key] for key in ('index', 'milestone', 'share', 'due', 'evidence')]]
            for number, stage in enumerate(data['stages'], 1):
                required = ', '.join(labels['eventTypes'].get(event.strip(), event.strip()) for event in stage['requiredEvents'].split(',') if event.strip())
                name = labels['milestoneTypes'].get(stage.get('type', ''), stage['name'])
                rows.append([str(number), name, f"{stage['paymentPercent']}%", stage['dueDate'], required])
            if len(rows) == 1:
                rows.append([placeholder] * 5)
            content.append(table(rows, [700, 2300, 1000, 1700, TEXT_WIDTH - 5700], header=True, aligns=['center', 'left', 'right', 'center', 'left']))
        if index == 6:
            content.append(para(signers_note))
            for sequence, signer in enumerate(data['signers'], 1):
                content.append(para([run(f"{sequence}."), run(f"{signer['name']} ({labels['sides'][signer['party']]})", tab=True)], 'ListItem'))

    # Signature pages: up to three blocks (two per page for four signers), every block kept with the next, party sides alternate.
    names = {'BUYER': data['buyer'], 'SUPPLIER': data['supplier']}
    groups = [data['signers'][:2], data['signers'][2:]] if count == 4 else [data['signers']]
    position = 0
    for page_index, group in enumerate(groups):
        title = labels['signatures'].upper() + (f" {labels['continued']}" if page_index else '')
        content.append(para(title, 'SignatureTitle', page_break=page_index > 0))
        if page_index == 0:
            content += [para(signers_note, 'Note', keep_next=True), para(labels['review'], 'Note', keep_next=True)]
        for local, signer in enumerate(group):
            position += 1
            # Buyer blocks sit at the left margin and supplier blocks at the right one.
            side = {'left': 0, 'right': TEXT_WIDTH - SIGNATURE_WIDTH, 'firstLine': 0} if signer['party'] == 'BUYER' \
                else {'left': TEXT_WIDTH - SIGNATURE_WIDTH, 'right': 0, 'firstLine': 0}
            last = local == len(group) - 1
            content += [para(labels['representative'][signer['party']], 'SignatureSide', indent=side),
                        para(names[signer['party']], 'SignatureRole', indent=side),
                        para(labels['signatureNote'], 'SignatureNote', indent=side),
                        para(f"{labels['anchor']} {str(position).zfill(2)}", 'Anchor', indent=side),
                        para(signer['name'], 'SignatureName', keep_next=not last, indent=side)]
    if count == 0:
        content += [para(labels['pendingSignerBlock'], 'SignatureSide'), para('', 'SignatureName', after=SIGNATURE_SPACE)]

    document = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' + ''.join(content)
                + f'<w:sectPr><w:pgSz w:w="{PAGE_WIDTH}" w:h="{PAGE_HEIGHT}"/><w:pgMar w:top="{MARGIN_TOP}" w:right="{MARGIN_RIGHT}" '
                  f'w:bottom="{MARGIN_BOTTOM}" w:left="{MARGIN_LEFT}" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>')
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as bundle:
        # A fixed timestamp keeps the archive bytes identical for identical input.
        def put(name, text):
            bundle.writestr(zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0)), text, zipfile.ZIP_DEFLATED)
        put('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>')
        put('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        put('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
        put('word/document.xml', document)
        put('word/styles.xml', build_styles(language))
    return output.getvalue()


if __name__ == '__main__':
    sys.stdout.buffer.write(build_document(json.load(sys.stdin)))
