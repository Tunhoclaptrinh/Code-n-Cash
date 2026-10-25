"""Read Poppler's actual PDF page/text coordinates; no layout is inferred from a filename."""
import json
import re
import sys
import xml.etree.ElementTree as ET


def line_text(line):
    return ' '.join(node.text or '' for node in line.iter() if node.tag.endswith('}word'))


# Signature blocks read "ĐẠI DIỆN BÊN MUA / role / (Ký, ...) / VỊ TRÍ KÝ 01 / signer name".
SIDE_LINE = re.compile(r'^(?:ĐẠI DIỆN|REPRESENTATIVE|FOR)\b.*?(BÊN MUA|NHÀ CUNG CẤP|BUYER|SUPPLIER)\s*$', re.I)
SIDES = {'BÊN MUA': 'BUYER', 'BUYER': 'BUYER', 'NHÀ CUNG CẤP': 'SUPPLIER', 'SUPPLIER': 'SUPPLIER'}


def signer_of(lines, index):
    """Printed signer name and party for the anchor at `index`, or (name, None) when not recognised."""
    for back in range(1, 7):
        if index - back < 0:
            break
        side = SIDE_LINE.match(line_text(lines[index - back]).strip())
        if side and index + 1 < len(lines):
            return line_text(lines[index + 1]).strip(), SIDES[side.group(1).upper()]
    # Older layout: the name sits right above the anchor and the party label above the name.
    name = line_text(lines[index - 1]) if index else ''
    side = line_text(lines[index - 2]) if index > 1 else ''
    party = 'BUYER' if side.upper() in ('BÊN MUA', 'BUYER') else 'SUPPLIER' if side.upper() in ('NHÀ CUNG CẤP', 'SUPPLIER') else None
    return name, party


def geometry(path):
    root = ET.parse(path).getroot()
    pages = []
    for page in (node for node in root.iter() if node.tag.endswith('}page')):
        if len(pages) >= 100:
            raise ValueError('DOCUMENT_PAGE_LIMIT')
        width, height = float(page.attrib['width']), float(page.attrib['height'])
        scale = 520 / width
        zones, anchors = [], []
        lines = [node for node in page.iter() if node.tag.endswith('}line')]
        for index, line in enumerate(lines):
            words = [node for node in line.iter() if node.tag.endswith('}word')]
            if not words:
                continue
            text = ' '.join(node.text or '' for node in words)
            box = dict(x=float(line.attrib['xMin']) * scale,
                       y=float(line.attrib['yMin']) * scale,
                       w=(float(line.attrib['xMax']) - float(line.attrib['xMin'])) * scale,
                       h=(float(line.attrib['yMax']) - float(line.attrib['yMin'])) * scale)
            zones.append(box)
            match = re.search(r'(?:VỊ TRÍ KÝ|SIGNING AREA)\s*0?([1-4])', text, re.I)
            if match:
                name, party = signer_of(lines, index)
                anchor = dict(stepNo=int(match.group(1)), x=box['x'], y=box['y'] + box['h'] + 8, w=240, h=92)
                if party and name:
                    anchor.update(signerName=name, party=party)
                anchors.append(anchor)
        pages.append(dict(pageNo=len(pages) + 1, width=520, height=round(height * scale, 3),
                          widthPt=width, heightPt=height, blockedZones=zones, anchors=anchors,
                          contentCheck='TEXT' if zones else 'MANUAL'))
    if not pages:
        raise ValueError('INVALID_PDF')
    return pages


if __name__ == '__main__':
    print(json.dumps(geometry(sys.argv[1]), ensure_ascii=False))
