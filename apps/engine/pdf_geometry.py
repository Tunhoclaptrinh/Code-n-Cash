"""Read Poppler's actual PDF page/text coordinates; no layout is inferred from a filename."""
import json
import re
import sys
import xml.etree.ElementTree as ET


def geometry(path):
    root = ET.parse(path).getroot()
    pages = []
    for page in (node for node in root.iter() if node.tag.endswith('}page')):
        if len(pages) >= 100:
            raise ValueError('DOCUMENT_PAGE_LIMIT')
        width, height = float(page.attrib['width']), float(page.attrib['height'])
        scale = 520 / width
        zones, anchors = [], []
        for line in (node for node in page.iter() if node.tag.endswith('}line')):
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
                anchors.append(dict(stepNo=int(match.group(1)), x=box['x'], y=box['y'] + box['h'] + 8))
        pages.append(dict(pageNo=len(pages) + 1, width=520, height=round(height * scale, 3),
                          widthPt=width, heightPt=height, blockedZones=zones, anchors=anchors,
                          contentCheck='TEXT' if zones else 'MANUAL'))
    if not pages:
        raise ValueError('INVALID_PDF')
    return pages


if __name__ == '__main__':
    print(json.dumps(geometry(sys.argv[1]), ensure_ascii=False))
