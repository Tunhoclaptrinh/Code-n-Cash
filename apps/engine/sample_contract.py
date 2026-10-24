"""Produce a genuine 14-section OOXML contract fixture, without external dependencies."""
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
    if not 1 <= count <= 4:
        raise ValueError('SIGNER_COUNT')
    labels = json.loads((Path(__file__).parent / 'templates' / f'sample-{language}.json').read_text())

    def paragraph(text, style=None):
        props = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ''
        content = '</w:t><w:br/><w:t xml:space="preserve">'.join(escape(line) for line in str(text).split('\n'))
        return f'<w:p>{props}<w:r><w:t xml:space="preserve">{content}</w:t></w:r></w:p>'

    custom = data.get('documentBody', '')
    if custom:
        custom = re.sub(r'\{\{(title|code|buyer|supplier|valueMillion|startDate|endDate|graceDays|penaltyRatePct|maxPenaltyPct)\}\}', lambda match: str(data[match.group(1)]), custom)
        labels['sections'][1]['body'] = custom.replace('{', '{{').replace('}', '}}')
    pages = []
    for index, section in enumerate(labels['sections']):
        parts = [paragraph(labels['sample'], 'Notice'), paragraph(f"{index + 1}. {section['title']}", 'Heading1')]
        parts.append(paragraph(data['title'], 'Heading2'))
        parts.append(paragraph(section['body'].format(**data)))
        if index == 0:
            for key in ('valueMillion', 'startDate', 'endDate', 'graceDays', 'penaltyRatePct', 'maxPenaltyPct'):
                parts.append(paragraph(labels['fields'][key].format(value=data[key])))
        if index == 3:
            for stage in data['stages']:
                parts.append(paragraph(labels['stage'].format(**stage)))
        if index == 6:
            parts.append(paragraph(labels['single'] if count == 1 else labels['multiple']))
            for sequence, signer in enumerate(data['signers'], 1):
                parts.append(paragraph(f"{sequence}. {signer['name']} — {labels['sides'][signer['party']]}"))
        parts.append(paragraph(labels['page'].format(page=index + 1)))
        content = ''.join(parts)
        if index: content = content.replace('</w:pPr>', '<w:pageBreakBefore w:val="1"/></w:pPr>', 1)
        pages.append(content)
    signatures = [paragraph(labels['sample'], 'Notice'), paragraph(labels['signatures'], 'Heading1'), paragraph(labels['single'] if count == 1 else labels['multiple'])]
    for sequence, signer in enumerate(data['signers'], 1):
        signatures.extend([paragraph(f"{sequence}. {signer['name']} — {labels['sides'][signer['party']]}", 'Heading2'), paragraph(labels['signHere']), paragraph(' '), paragraph(' ')])
    signatures.append(paragraph(labels['page'].format(page=14)))
    pages.append(''.join(signatures).replace('</w:pPr>', '<w:pageBreakBefore w:val="1"/></w:pPr>', 1))
    body = ''.join(pages)
    document = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>'''
    styles = '''<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Notice"><w:rPr><w:b/><w:color w:val="B45309"/></w:rPr></w:style></w:styles>'''
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as bundle:
        bundle.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>')
        bundle.writestr('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        bundle.writestr('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
        bundle.writestr('word/document.xml', document)
        bundle.writestr('word/styles.xml', styles)
    return output.getvalue()


if __name__ == '__main__':
    sys.stdout.buffer.write(build_document(json.load(sys.stdin)))
