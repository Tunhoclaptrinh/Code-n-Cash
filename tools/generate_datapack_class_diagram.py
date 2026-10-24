"""Generate and validate the class diagram against the actual Data Pack CSVs.

Run: python3 tools/generate_datapack_class_diagram.py
No dependencies. SVG and draw.io use the same coordinates; Mermaid is also emitted.
"""
import csv
import hashlib
import html
import json
import textwrap
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'BangD-Case4/DataPack-CASE4_SmartContractWorkflow'
OUT = ROOT / 'docs/diagrams'
STEM = 'datapack-class-diagram'


def read(path):
    with path.open(encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle)
        return reader.fieldnames, list(reader)


FILES = {p.name: (p, *read(p)) for p in sorted(BASE.rglob('*.csv'))}
DICTIONARY = {(r['file_name'], r['field_name']): r for r in FILES['data_dictionary.csv'][2]}

# Only these keys are explicitly called primary keys in the supplied dictionary.
PRIMARY = {'contracts': 'contract_id', 'parties': 'party_id', 'milestones': 'milestone_id',
           'events': 'event_id', 'payment_rules': 'rule_id', 'scenario_labels_sample': 'scenario_id'}
TYPES = {
    'data_dictionary': dict(field_order='integer', file_name='string', field_name='string', data_type='string',
                            nullable='string', unit='string', description='string', allowed_values_or_format='string',
                            example_value='string', usage_note='string'),
    'dataset_manifest_final': dict(manifest_order='string', dataset_name='string', dataset_version='string',
                                  snapshot_date='date', generation_seed='integer', artifact_group='category',
                                  file_name='string', file_format='category', public_release='boolean',
                                  required_for_teams='boolean', data_is_synthetic='boolean', row_count='integer',
                                  column_count='integer', line_count='integer', columns='string_list',
                                  size_bytes='integer', sha256='string', source_path_internal='string', status='category'),
    'submission_output_template': dict(contract_id='string', milestone_id='string', contract_type='category',
                                       milestone_sequence='integer', milestone_type='category',
                                       planned_payment_vnd_mn='decimal', predicted_decision='category',
                                       predicted_milestone_status='category', conditions_met='string_list',
                                       missing_conditions='string_list', payable_amount_vnd_mn='decimal',
                                       penalty_amount_vnd_mn='decimal', reason_code='category', decision_reason='string',
                                       evidence_event_ids='string_list', rule_id_applied='string', confidence_score='decimal',
                                       processing_time_ms='decimal', evaluated_at='datetime', engine_name='string',
                                       audit_trace_id='string', notes='string'),
}
MARKS = {
    'contracts': {'buyer_id': 'FK', 'supplier_id': 'FK', 'rule_set_id': 'JOIN'},
    'parties': {'parent_party_id': 'FK'},
    'milestones': {'contract_id': 'FK', 'release_rule_code': 'JOIN'},
    'events': {'contract_id': 'FK', 'milestone_id': 'FK', 'actor_party_id': 'FK', 'reference_event_id': 'FK'},
    'payment_rules': {'rule_set_id': 'JOIN', 'release_rule_code': 'JOIN'},
    'scenario_labels_sample': {'contract_id': 'FK', 'milestone_id': 'FK'},
    'decision_sample': {'scenario_id': 'UK/FK', 'contract_id': 'FK', 'milestone_id': 'FK', 'evidence_event_ids': 'LIST'},
    'submission_output_template': {'contract_id': 'FK', 'milestone_id': 'UK/FK', 'rule_id_applied': 'OUT',
                                   'evidence_event_ids': 'LIST'},
    'data_dictionary': {'file_name': 'CK', 'field_name': 'CK'},
    'dataset_manifest_final': {'manifest_order': 'UK', 'file_name': 'UK'},
}
# Coordinates leave corridors for redundant contract links and list-valued references.
SPECS = [
    ('parties', 'CORE', 80, 260, 520, ['PK: party_id; parent_party_id tự tham chiếu.', 'BUYER / SUPPLIER / APPROVER cùng một bảng.']),
    ('contracts', 'CORE', 810, 260, 520, ['PK: contract_id; buyer_id và supplier_id → parties.', 'UK quan sát: (contract_id) = 100 giá trị duy nhất.']),
    ('payment_rules', 'CORE', 1540, 260, 560, ['PK: rule_id; UK quan sát: (release_rule_code, priority).', '16 scope × 8 rule; 4 rule_set_id. JOIN ≠ FK tới rule_id.']),
    ('data_dictionary', 'META', 2330, 260, 580, ['CK quan sát: (file_name, field_name).', '131 mô tả cột cho 7 CSV; field_order lặp theo file.']),
    ('dataset_manifest_final', 'META', 2330, 1030, 580, ['UK quan sát: manifest_order và file_name.', '16 artifact được kê khai; không phải 16 CSV hiện có.']),
    ('events', 'CORE', 80, 1150, 520, ['PK: event_id; reference_event_id → events.event_id.', 'UK quan sát: (contract_id, contract_event_sequence).']),
    ('milestones', 'CORE', 810, 1150, 560, ['PK: milestone_id; UK quan sát: (contract_id, milestone_sequence).', 'release_rule_code chọn nhóm 8 rule, không chọn 1 rule.']),
    ('submission_output_template', 'OUTPUT', 1540, 1150, 560, ['UK: milestone_id trong một file nộp (405 dòng).', '6 cột có sẵn; 16 cột OUT chờ engine sinh kết quả.']),
    ('scenario_labels_sample', 'SAMPLE', 80, 2200, 540, ['PK: scenario_id; mỗi scenario gắn đúng 1 milestone.', 'Mẫu công khai: 20 dòng; không phủ toàn bộ 405 mốc.']),
    ('decision_sample', 'SAMPLE', 810, 2200, 590, ['UK quan sát: scenario_id; FK → scenario_labels_sample.', '20/20 scenario có đúng 1 đáp án trong pack hiện tại.']),
]
COLORS = {'CORE': '#1d4ed8', 'SAMPLE': '#7c3aed', 'OUTPUT': '#087f8c', 'META': '#475569'}
TABLES = {}
for name, group, x, y, w, foot in SPECS:
    path, headers, rows = FILES[name + '.csv']
    fields = []
    for column in headers:
        d = DICTIONARY.get((path.name, column))
        marks = MARKS.get(name, {}).get(column, '')
        if PRIMARY.get(name) == column:
            marks = 'PK'
        if name == 'submission_output_template' and headers.index(column) >= 6 and not marks:
            marks = 'OUT'
        fields.append({'name': column, 'type': d['data_type'] if d else TYPES[name][column],
                       'nullable': d['nullable'] if d else None,
                       'source': 'dictionary' if d else 'inferred', 'marks': marks,
                       'blank_count': sum(not r[column] for r in rows),
                       'description': d['description'] if d else '', 'unit': d['unit'] if d else '',
                       'format': d['allowed_values_or_format'] if d else '', 'usage_note': d['usage_note'] if d else ''})
    TABLES[name] = dict(name=name, group=group, x=x, y=y, w=w, h=186 + len(fields) * 26,
                        foot=foot, fields=fields, rows=rows, path=path)


def edge(id_, a, b, ca, cb, label, points, position, kind='FK', detail=''):
    return dict(id=id_, a=a, b=b, ca=ca, cb=cb, label=label, points=points,
                position=position, kind=kind, detail=detail)


RELATIONS = [
    edge('R01', 'parties', 'contracts', '1', '0..*', 'buyer_id', [(600, 420), (810, 420)], (705, 390),
         detail='contracts.buyer_id → parties.party_id; party_type phải là BUYER.'),
    edge('R02', 'parties', 'contracts', '1', '0..*', 'supplier_id', [(600, 530), (810, 530)], (705, 500),
         detail='contracts.supplier_id → parties.party_id; party_type phải là SUPPLIER.'),
    edge('R03', 'parties', 'parties', '0..1', '0..*', 'parent_party_id',
         [(80, 480), (24, 480), (24, 690), (80, 690)], (170, 865),
         detail='parties.parent_party_id → parties.party_id; APPROVER thuộc BUYER; BUYER/SUPPLIER để trống.'),
    edge('R04', 'contracts', 'milestones', '1', '0..*', 'contract_id',
         [(1120, 966), (1120, 1150)], (1215, 1070),
         detail='milestones.contract_id → contracts.contract_id. Pack này có 3–5 milestone/hợp đồng.'),
    edge('R05', 'contracts', 'events', '1', '0..*', 'contract_id',
         [(920, 966), (920, 1010), (420, 1010), (420, 1150)], (600, 998),
         detail='events.contract_id → contracts.contract_id; phải bằng contract_id của milestone tương ứng.'),
    edge('R06', 'milestones', 'events', '1', '0..*', 'milestone_id',
         [(810, 1320), (600, 1320)], (705, 1290),
         detail='events.milestone_id → milestones.milestone_id; không suy ra rằng mỗi milestone luôn có event.'),
    edge('R07', 'parties', 'events', '1', '0..*', 'actor_party_id',
         [(300, 836), (300, 1150)], (185, 950),
         detail='events.actor_party_id → parties.party_id. actor_party_type/actor_role là dữ liệu lặp, không phải FK.'),
    edge('R08', 'events', 'events', '0..1', '0..*', 'reference_event_id',
         [(80, 1380), (24, 1380), (24, 1570), (80, 1570)], (205, 1790),
         detail='events.reference_event_id → events.event_id khi có giá trị; 8 tham chiếu trong pack là RESOLVED → OPENED.'),
    edge('R09', 'contracts', 'payment_rules', '0..*', '0..*', 'rule_set_id (nhóm)',
         [(1330, 700), (1540, 700)], (1435, 680), 'JOIN',
         'contracts.rule_set_id = payment_rules.rule_set_id; mỗi rule_set_id có nhiều rule, không phải khóa duy nhất.'),
    edge('R10', 'payment_rules', 'milestones', '0..*', '0..*', 'release_rule_code (scope)',
         [(1770, 966), (1770, 1030), (1450, 1030), (1450, 1240), (1370, 1240)], (1580, 1015), 'JOIN',
         'milestones.release_rule_code = payment_rules.release_rule_code; N:M theo giá trị nhóm; mỗi mốc khớp 8 rule trong pack.'),
    edge('R11', 'contracts', 'scenario_labels_sample', '1', '0..*', 'contract_id',
         [(810, 880), (665, 880), (665, 2120), (330, 2120), (330, 2200)], (445, 2105),
         detail='scenario_labels_sample.contract_id → contracts.contract_id; nhất quán với milestone được gắn.'),
    edge('R12', 'milestones', 'scenario_labels_sample', '1', '0..*', 'milestone_id',
         [(900, 1934), (900, 2050), (510, 2050), (510, 2200)], (655, 2035),
         detail='scenario_labels_sample.milestone_id → milestones.milestone_id; hiện 20 mốc có mẫu, mỗi mốc 1 mẫu.'),
    edge('R13', 'contracts', 'decision_sample', '1', '0..*', 'contract_id',
         [(1330, 880), (1410, 880), (1410, 2150), (1270, 2150), (1270, 2200)], (1340, 2135),
         detail='decision_sample.contract_id → contracts.contract_id; phải khớp scenario và milestone.'),
    edge('R14', 'milestones', 'decision_sample', '1', '0..*', 'milestone_id',
         [(1130, 1934), (1130, 2200)], (1240, 2090),
         detail='decision_sample.milestone_id → milestones.milestone_id; phải khớp scenario_id tương ứng.'),
    edge('R15', 'scenario_labels_sample', 'decision_sample', '1', '1', 'scenario_id',
         [(620, 2370), (810, 2370)], (715, 2340),
         detail='decision_sample.scenario_id → scenario_labels_sample.scenario_id; 1:1 được kiểm trên 20 mẫu hiện tại.'),
    edge('R16', 'decision_sample', 'events', '0..*', '0..*', 'evidence_event_ids (tách ;)',
         [(810, 2790), (710, 2790), (710, 1830), (420, 1830), (420, 1752)], (400, 1860), 'LIST',
         'Mỗi token trong decision_sample.evidence_event_ids → events.event_id; cùng milestone; không có bảng nối vật lý.'),
    edge('R17', 'contracts', 'submission_output_template', '1', '0..*', 'contract_id',
         [(1330, 600), (1490, 600), (1490, 1090), (1840, 1090), (1840, 1150)], (1690, 1075),
         detail='submission_output_template.contract_id → contracts.contract_id; cùng contract với milestone.'),
    edge('R18', 'milestones', 'submission_output_template', '1', '1', 'milestone_id',
         [(1370, 1450), (1540, 1450)], (1455, 1420),
         detail='submission_output_template.milestone_id → milestones.milestone_id; đúng 1 dòng/mốc trong template 405 dòng.'),
    edge('R19', 'payment_rules', 'submission_output_template', '0..1', '0..*', 'rule_id_applied (OUT)',
         [(1990, 966), (1990, 1150)], (2125, 1025), 'OUT',
         'Sau khi đánh giá: rule_id_applied → payment_rules.rule_id, rule thắng phải thuộc scope của milestone. Template gốc để trống.'),
    edge('R20', 'submission_output_template', 'events', '0..*', '0..*', 'evidence_event_ids (OUT; tách ;)',
         [(1840, 1908), (1840, 1990), (510, 1990), (510, 1752)], (1600, 1975), 'LIST',
         'Sau khi sinh kết quả: mỗi token evidence_event_ids → events.event_id, cùng milestone. Template gốc để trống.'),
    edge('R21', 'dataset_manifest_final', 'data_dictionary', '1', '0..*', 'file_name (metadata)',
         [(2620, 1030), (2620, 706)], (2730, 860), 'META',
         'data_dictionary.file_name = dataset_manifest_final.file_name. Liên kết metadata ở cấp file; không phải FK nghiệp vụ.'),
    edge('R22', 'submission_output_template', 'decision_sample', '1', '0..1', 'milestone_id (đối chiếu mẫu)',
         [(2100, 1800), (2200, 1800), (2200, 2470), (1400, 2470)], (1840, 2455), 'COMPARE',
         'Join đối chiếu kết quả theo milestone_id trên 20 mốc có sample; không phải khóa ngoại. Bội số chỉ đúng với pack này.'),
]


def verify():
    checks = []

    def check(name, ok, detail):
        checks.append(dict(name=name, passed=bool(ok), detail=detail))

    def unique(name, cols):
        rows = TABLES[name]['rows']
        keys = [tuple(r[c] for c in cols) for r in rows]
        check('unique:' + name + ':' + ','.join(cols), len(set(keys)) == len(keys) and all(all(k) for k in keys), len(keys))

    def fk(src, column, dst, target, optional=False, split=False):
        domain = {r[target] for r in TABLES[dst]['rows']}
        bad = []
        for i, r in enumerate(TABLES[src]['rows'], 2):
            if optional and not r[column]:
                continue
            values = r[column].split(';') if split else [r[column]]
            bad.extend((i, v) for v in values if v not in domain)
        check('reference:' + src + '.' + column, not bad, bad)

    check('csv_coverage', {n + '.csv' for n in TABLES} == set(FILES), sorted(FILES))
    check('field_coverage', sum(len(t['fields']) for t in TABLES.values()) == 182, 182)
    for name, column in PRIMARY.items():
        unique(name, [column])
    for name, cols in [('milestones', ['contract_id', 'milestone_sequence']),
                       ('events', ['contract_id', 'contract_event_sequence']),
                       ('payment_rules', ['release_rule_code', 'priority']), ('decision_sample', ['scenario_id']),
                       ('submission_output_template', ['milestone_id']), ('data_dictionary', ['file_name', 'field_name']),
                       ('dataset_manifest_final', ['manifest_order']), ('dataset_manifest_final', ['file_name'])]:
        unique(name, cols)
    for name in {r['file_name'][:-4] for r in DICTIONARY.values()}:
        check('dictionary_columns:' + name, {c for f, c in DICTIONARY if f == name + '.csv'} == set(FILES[name + '.csv'][1]), len(TABLES[name]['fields']))
    for src, col, dst, target, opt, split in [
        ('contracts', 'buyer_id', 'parties', 'party_id', False, False),
        ('contracts', 'supplier_id', 'parties', 'party_id', False, False),
        ('parties', 'parent_party_id', 'parties', 'party_id', True, False),
        ('milestones', 'contract_id', 'contracts', 'contract_id', False, False),
        ('events', 'contract_id', 'contracts', 'contract_id', False, False),
        ('events', 'milestone_id', 'milestones', 'milestone_id', False, False),
        ('events', 'actor_party_id', 'parties', 'party_id', False, False),
        ('events', 'reference_event_id', 'events', 'event_id', True, False),
        ('scenario_labels_sample', 'contract_id', 'contracts', 'contract_id', False, False),
        ('scenario_labels_sample', 'milestone_id', 'milestones', 'milestone_id', False, False),
        ('decision_sample', 'contract_id', 'contracts', 'contract_id', False, False),
        ('decision_sample', 'milestone_id', 'milestones', 'milestone_id', False, False),
        ('decision_sample', 'scenario_id', 'scenario_labels_sample', 'scenario_id', False, False),
        ('decision_sample', 'evidence_event_ids', 'events', 'event_id', True, True),
        ('submission_output_template', 'contract_id', 'contracts', 'contract_id', False, False),
        ('submission_output_template', 'milestone_id', 'milestones', 'milestone_id', False, False),
        ('data_dictionary', 'file_name', 'dataset_manifest_final', 'file_name', False, False),
        ('contracts', 'rule_set_id', 'payment_rules', 'rule_set_id', False, False),
        ('milestones', 'release_rule_code', 'payment_rules', 'release_rule_code', False, False),
    ]:
        fk(src, col, dst, target, opt, split)
    parties = {r['party_id']: r for r in TABLES['parties']['rows']}
    contracts = {r['contract_id']: r for r in TABLES['contracts']['rows']}
    milestones = {r['milestone_id']: r for r in TABLES['milestones']['rows']}
    events = {r['event_id']: r for r in TABLES['events']['rows']}
    scenarios = {r['scenario_id']: r for r in TABLES['scenario_labels_sample']['rows']}
    check('buyer_supplier_types', all(parties[c['buyer_id']]['party_type'] == 'BUYER' and parties[c['supplier_id']]['party_type'] == 'SUPPLIER' for c in contracts.values()), '100 contracts')
    check('approver_parent', all((p['party_type'] == 'APPROVER' and p['parent_party_id'] and parties[p['parent_party_id']]['party_type'] == 'BUYER') or (p['party_type'] != 'APPROVER' and not p['parent_party_id']) for p in parties.values()), '30 approvers; 35 roots')
    check('rules_per_scope', set(Counter(r['release_rule_code'] for r in TABLES['payment_rules']['rows']).values()) == {8}, '16 scopes × 8 rules')
    check('milestone_scope', all(m['release_rule_code'] == contracts[m['contract_id']]['rule_set_id'] + ':' + m['milestone_type'] for m in milestones.values()), '405 milestones')
    for name in ['events', 'scenario_labels_sample', 'decision_sample', 'submission_output_template']:
        check('contract_milestone_consistency:' + name, all(r['contract_id'] == milestones[r['milestone_id']]['contract_id'] for r in TABLES[name]['rows']), len(TABLES[name]['rows']))
    check('sample_scenario_consistency', all(all(r[c] == scenarios[r['scenario_id']][c] for c in ['contract_id', 'milestone_id', 'scenario_type']) for r in TABLES['decision_sample']['rows']), '20 samples')
    check('sample_one_to_one', Counter(r['scenario_id'] for r in TABLES['decision_sample']['rows']) == Counter(scenarios.keys()), 'one decision per public scenario')
    check('sample_evidence_same_milestone', all(events[e]['milestone_id'] == r['milestone_id'] for r in TABLES['decision_sample']['rows'] for e in r['evidence_event_ids'].split(';') if e), 'semicolon-separated ids')
    check('event_references', all(e['event_type'] == 'DISPUTE_RESOLVED' and events[e['reference_event_id']]['event_type'] == 'DISPUTE_OPENED' and events[e['reference_event_id']]['milestone_id'] == e['milestone_id'] for e in events.values() if e['reference_event_id']), '8 nonempty references')
    check('output_coverage', Counter(r['milestone_id'] for r in TABLES['submission_output_template']['rows']) == Counter(milestones.keys()), '405 rows, each milestone once')
    check('output_pending', all(not r[c] for r in TABLES['submission_output_template']['rows'] for c in FILES['submission_output_template.csv'][1][6:]), 'all 16 generated columns are blank in the source template')
    manifest = {r['file_name']: r for r in TABLES['dataset_manifest_final']['rows']}
    # The manifest does not list itself. Byte hashes can change with packaging/line endings,
    # so verify structural declarations and report actual source hashes separately.
    for filename, (path, columns, rows) in FILES.items():
        if filename in manifest:
            m = manifest[filename]
            check('manifest_schema:' + filename, int(m['row_count']) == len(rows) and int(m['column_count']) == len(columns) and m['columns'].split(';') == columns, f'{len(rows)} rows, {len(columns)} columns')
    failures = [c for c in checks if not c['passed']]
    if failures:
        raise ValueError(json.dumps(failures, ensure_ascii=False))
    return checks


def field_text(field):
    # Nullable is only asserted where supplied by the official dictionary.
    return field['type'] + ('?' if field['nullable'] == 'YES' else '')


def mermaid():
    lines = ['classDiagram', 'direction TB', '%% All 10 present CSVs; no invented tables.',
             '%% PK = dictionary; UK/CK = verified candidate keys; ? = dictionary nullable YES.',
             '%% Solid = row reference. Dashed = group join / list / generated output / metadata / comparison.']
    for name, t in TABLES.items():
        lines += [f'class {name} {{', f'  <<{t["group"]}>>']
        for f in t['fields']:
            # Standard Mermaid class attribute syntax; key tags are in comments and class notes.
            if f['marks']:
                lines.append(f'  %% {f["marks"]}')
            lines.append(f'  +{f["type"]} {f["name"]}')
        lines += ['}', f'note for {name} "{len(t["rows"])} rows / {len(t["fields"])} columns<br/>' + '<br/>'.join(t['foot']).replace('"', "'") + '"']
    for r in RELATIONS:
        connector = '--' if r['kind'] == 'FK' else '..'
        lines.append(f'{r["a"]} "{r["ca"]}" {connector} "{r["cb"]}" {r["b"]} : {r["id"]} {r["label"]}')
    return '\n'.join(lines) + '\n'


SVG = '{http://www.w3.org/2000/svg}'


def render_svg():
    ET.register_namespace('', SVG[1:-1])
    root = ET.Element(SVG + 'svg', width='3060', height='3160', viewBox='0 0 3060 3160', role='img')
    ET.SubElement(root, SVG + 'title').text = 'CodeCash — Data Pack class diagram: 10 CSV, 182 fields, 22 relationships'
    ET.SubElement(root, SVG + 'desc').text = 'All fields are transcribed from actual CSV headers. Solid associations are row references; dashed associations are group joins, lists, generated output, metadata or sample comparison. Types outside the dictionary are inferred.'
    ET.SubElement(root, SVG + 'style').text = '''text{font-family:"DejaVu Sans",Arial,sans-serif;fill:#172033} .mono{font-family:"DejaVu Sans Mono",monospace;font-size:12.5px} .edge-label{font-size:13px;paint-order:stroke;stroke:#f6f8fc;stroke-width:6;stroke-linejoin:round} .card{font-size:13px;font-weight:bold;paint-order:stroke;stroke:#f6f8fc;stroke-width:6}'''

    def rect(x, y, w, h, fill, **kw):
        return ET.SubElement(root, SVG + 'rect', x=str(x), y=str(y), width=str(w), height=str(h), fill=fill, **kw)

    def text(x, y, value, size=14, fill=None, **kw):
        el = ET.SubElement(root, SVG + 'text', x=str(x), y=str(y), **{'font-size': str(size), **kw})
        if fill:
            el.set('style', 'fill:' + fill)
        el.text = value
        return el

    rect(0, 0, 3060, 3160, '#f6f8fc')
    text(80, 80, 'DATAPACK · CLASS DIAGRAM', 38, **{'font-weight': 'bold'})
    text(80, 118, 'CASE 4 / Smart Contract Workflow · v1.0-final · snapshot 18/10/2026', 21, '#526179')
    text(80, 152, '10 CSV hiện có · 182 cột · 22 quan hệ · đối chiếu trực tiếp header, dictionary và dữ liệu', 19, '#526179')
    for x, y, title, color in [(80, 215, '01  DỮ LIỆU NGHIỆP VỤ', COLORS['CORE']),
                                (1540, 1105, '02  TEMPLATE KẾT QUẢ', COLORS['OUTPUT']),
                                (80, 2155, '03  NHÃN VÀ ĐÁP ÁN MẪU', COLORS['SAMPLE']),
                                (2330, 215, '04  METADATA', COLORS['META'])]:
        text(x, y, title, 18, color, **{'font-weight': 'bold'})

    for r in RELATIONS:
        color = '#526179' if r['kind'] == 'FK' else '#8b5caa' if r['kind'] == 'LIST' else '#9a6b26'
        attrs = dict(points=' '.join(f'{x},{y}' for x, y in r['points']), fill='none', stroke=color,
                     **{'stroke-width': '1.8', 'stroke-linejoin': 'round'})
        if r['kind'] != 'FK':
            attrs['stroke-dasharray'] = '8 5'
        ET.SubElement(root, SVG + 'polyline', **attrs)

    for name, t in TABLES.items():
        x, y, w, h = (t[k] for k in ('x', 'y', 'w', 'h'))
        color = COLORS[t['group']]
        rect(x, y, w, h, 'white', rx='9', stroke='#ccd5e3', **{'stroke-width': '1.4'})
        rect(x, y, w, 96, color, rx='8')
        rect(x, y + 82, w, 14, color)
        text(x + 18, y + 28, f'«{t["group"]}»   {len(t["rows"])} dòng / {len(t["fields"])} cột', 13, '#e5edff')
        text(x + 18, y + 56, name, 21 if len(name) < 27 else 19, 'white', **{'font-weight': 'bold'})
        text(x + 18, y + 80, t['path'].parent.name + '/' + t['path'].name, 11, '#e5edff')
        for i, f in enumerate(t['fields']):
            fy = y + 96 + 26 * i
            if i % 2 == 0:
                rect(x + 1, fy, w - 2, 26, '#f5f8fc')
            text(x + 12, fy + 18, f['marks'], 10, color, **{'font-weight': 'bold'})
            text(x + 65, fy + 18, f['name'], **{'class': 'mono'})
            text(x + w - 14, fy + 18, field_text(f), 12, '#68778e', **{'text-anchor': 'end'})
        foot_y = y + 96 + 26 * len(t['fields'])
        rect(x + 1, foot_y, w - 2, 89, '#edf2f8')
        notes = t['foot'] + (['Kiểu dữ liệu suy ra; dictionary không mô tả file này.'] if name in TYPES else ['? = nullable YES theo dictionary; không phải SQL DDL.'])
        for j, line in enumerate(notes):
            text(x + 14, foot_y + 23 + j * 22, line, 11.5, '#526179')

    for r in RELATIONS:
        text(*r['position'], r['id'] + ' · ' + r['label'], **{'class': 'edge-label', 'text-anchor': 'middle'})
        for point, neighbor, cardinal in [(r['points'][0], r['points'][1], r['ca']),
                                          (r['points'][-1], r['points'][-2], r['cb'])]:
            x, y = point
            nx, ny = neighbor
            dx, dy = (1 if nx > x else -1 if nx < x else 0), (1 if ny > y else -1 if ny < y else 0)
            text(x + dx * 27 + (16 if not dx else 0), y + dy * 26 - (9 if dx else 0), cardinal,
                 **{'class': 'card', 'text-anchor': 'middle'})

    rect(2330, 1850, 580, 1190, 'white', rx='9', stroke='#ccd5e3')
    text(2352, 1890, 'CÁCH ĐỌC & GIỚI HẠN', 21, **{'font-weight': 'bold'})
    paragraphs = [
        'Đường liền: tham chiếu giữa các dòng (FK logic trong CSV). CSV không có ràng buộc SQL tự thực thi.',
        'Đường đứt: JOIN theo nhóm, danh sách ID, tham chiếu kết quả sẽ sinh, metadata hoặc đối chiếu sample. Không coi mọi đường đứt là khóa ngoại.',
        'PK: được dictionary gọi rõ là khóa chính. UK: duy nhất được kiểm trong pack / quy ước một dòng kết quả mỗi mốc. CK: khóa ứng viên ghép, kiểm trên dữ liệu.',
        '1 = đúng một; 0..1 = có thể không có; 0..* = không hoặc nhiều. Bội số hai đầu đọc theo hai lớp được nối.',
        'R15 và R18 là 1:1 trong bộ file hiện tại. Milestone có thể không có sample. Không suy ra mọi bộ dữ liệu tương lai đều chỉ có một scenario/mốc.',
        'R09: rule_set_id lặp ở nhiều contract và nhiều rule. R10: release_rule_code lặp ở nhiều milestone và 8 rule/scope. Không có bảng rule_sets hoặc rule_scopes trong CSV.',
        'LIST: evidence_event_ids chứa các ID phân cách bằng dấu chấm phẩy. Quan hệ nhiều–nhiều được biểu diễn trong ô CSV; không có bảng nối vật lý.',
        'OUT: 16 cột chưa có giá trị trong template gốc. R19, R20 chỉ có giá trị tham chiếu sau khi engine sinh kết quả. audit_trace_id trỏ ra audit, không có bảng audit trong pack.',
        'Metadata: dictionary mô tả 131 cột của 7 CSV. Manifest kê khai 16 artifact, gồm cả tài liệu/script và file chỉ BTC giữ. Không có dòng manifest cho chính file manifest.',
        'Kiểu dữ liệu 7 file lấy từ dictionary. Kiểu của template và 2 file metadata được suy ra, chưa phải khai báo chính thức. Dấu ? chỉ dùng cho nullable=YES được dictionary xác nhận.',
        'Các trường workflow_template, contract_type, event_type, approval_role là mã/giá trị phân loại. Không tự tạo thêm bảng danh mục hay quan hệ FK chỉ vì cùng tên.',
        'Tên trường giữ nguyên toàn bộ header gốc. Xem Markdown đi kèm để đọc khóa, nullability, đơn vị, nguồn và danh mục quan hệ chi tiết.'
    ]
    yy = 1920
    for p in paragraphs:
        for line in textwrap.wrap(p, width=72):
            text(2352, yy, line, 13, '#526179')
            yy += 19
        yy += 15
    text(80, 3085, 'Nguồn: 5 CSV nghiệp vụ + 2 CSV sample + template + dictionary + manifest trong repository CodeCash.', 16, '#526179')
    text(80, 3115, 'Sơ đồ vật lý CSV: giữ dữ liệu lặp và danh sách trong ô; không thêm bảng chuẩn hóa hoặc bảng ứng dụng.', 16, '#526179')
    return ET.tostring(root, encoding='unicode', xml_declaration=True)


def render_drawio():
    root = ET.Element('mxfile', host='app.diagrams.net', type='device', version='24.7.17')
    diagram = ET.SubElement(root, 'diagram', id='datapack-full', name='Data Pack — đầy đủ 10 CSV')
    model = ET.SubElement(diagram, 'mxGraphModel', dx='3060', dy='3160', grid='1', gridSize='10',
                          guides='1', tooltips='1', connect='1', arrows='1', fold='1', page='1',
                          pageScale='1', pageWidth='3060', pageHeight='3160', math='0', shadow='0')
    graph = ET.SubElement(model, 'root')
    ET.SubElement(graph, 'mxCell', id='0')
    ET.SubElement(graph, 'mxCell', id='1', parent='0')

    def cell(id_, value, style, x, y, w, h, parent='1'):
        c = ET.SubElement(graph, 'mxCell', id=id_, value=value, style=style, vertex='1', parent=parent)
        ET.SubElement(c, 'mxGeometry', x=str(x), y=str(y), width=str(w), height=str(h), **{'as': 'geometry'})
        return c

    cell('title', '<b>DATAPACK · CLASS DIAGRAM</b><br>10 CSV · 182 cột · 22 quan hệ · v1.0-final / snapshot 18-10-2026',
         'text;html=1;align=left;verticalAlign=middle;fontSize=26;fontColor=#172033;whiteSpace=wrap;', 80, 35, 2100, 120)
    for name, t in TABLES.items():
        color = COLORS[t['group']]
        title = f'<b>{html.escape(name)}</b><br><font style="font-size:12px">«{t["group"]}» · {len(t["rows"])} dòng / {len(t["fields"])} cột<br>{html.escape(str(t["path"].relative_to(BASE)))}</font>'
        cell(name, title, f'swimlane;html=1;startSize=96;horizontal=1;rounded=1;arcSize=5;fillColor={color};swimlaneFillColor=#ffffff;strokeColor=#ccd5e3;fontColor=#ffffff;fontSize=20;align=left;spacingLeft=18;whiteSpace=wrap;collapsible=0;', t['x'], t['y'], t['w'], t['h'])
        for i, f in enumerate(t['fields']):
            value = f'<font color="{color}" style="font-size:10px">{html.escape(f["marks"]).ljust(5)}</font>  {html.escape(f["name"])} : <font color="#68778e">{html.escape(field_text(f))}</font>'
            cell(name + ':' + f['name'], value,
                 'text;html=1;align=left;verticalAlign=middle;fontFamily=DejaVu Sans Mono;fontSize=12;spacingLeft=12;whiteSpace=wrap;strokeColor=none;fillColor=' + ('#f5f8fc' if i % 2 == 0 else '#ffffff') + ';',
                 1, 96 + 26 * i, t['w'] - 2, 26, name)
        notes = t['foot'] + (['Kiểu suy ra; không có dictionary cho file này.'] if name in TYPES else ['? = nullable YES theo dictionary.'])
        cell(name + ':__footer', '<br>'.join(html.escape(s) for s in notes),
             'text;html=1;align=left;verticalAlign=middle;fontSize=11;spacingLeft=12;whiteSpace=wrap;fillColor=#edf2f8;strokeColor=none;fontColor=#526179;',
             1, 96 + 26 * len(t['fields']), t['w'] - 2, 89, name)
    for r in RELATIONS:
        a, b = TABLES[r['a']], TABLES[r['b']]
        sx, sy = r['points'][0]
        tx, ty = r['points'][-1]
        color = '#526179' if r['kind'] == 'FK' else '#8b5caa' if r['kind'] == 'LIST' else '#9a6b26'
        style = f'edgeStyle=segmentEdgeStyle;html=1;rounded=0;endArrow=none;startArrow=none;strokeColor={color};strokeWidth=1.5;fontSize=12;labelBackgroundColor=#ffffff;'
        style += f'exitX={(sx-a["x"])/a["w"]};exitY={(sy-a["y"])/a["h"]};entryX={(tx-b["x"])/b["w"]};entryY={(ty-b["y"])/b["h"]};'
        if r['kind'] != 'FK':
            style += 'dashed=1;'
        value = html.escape(f'{r["id"]} · {r["label"]}') + '<br>' + html.escape(f'{r["ca"]} — {r["cb"]}')
        c = ET.SubElement(graph, 'mxCell', id=r['id'], value=value, style=style, edge='1', parent='1', source=r['a'], target=r['b'])
        geometry = ET.SubElement(c, 'mxGeometry', relative='1', **{'as': 'geometry'})
        if len(r['points']) > 2:
            points = ET.SubElement(geometry, 'Array', **{'as': 'points'})
            for x, y in r['points'][1:-1]:
                ET.SubElement(points, 'mxPoint', x=str(x), y=str(y))
    legend = '''<b>CHÚ GIẢI</b><br><br>Đường liền: FK logic giữa các dòng CSV.<br>Đường đứt: JOIN nhóm / LIST / OUT / metadata / đối chiếu.<br><br>PK: dictionary khai báo.<br>UK: duy nhất đã kiểm / quy ước một dòng output/mốc.<br>CK: khóa ứng viên ghép đã kiểm.<br>?: nullable=YES theo dictionary.<br><br>R09 rule_set_id và R10 release_rule_code là JOIN nhóm N:M, không phải FK tới một rule.<br><br>R15 và R18: 1:1 trong pack hiện tại.<br>R19/R20: tham chiếu sau khi sinh kết quả; template để trống.<br>LIST: các event_id phân cách bằng dấu chấm phẩy.<br><br>Kiểu của template và metadata là suy ra.<br>Manifest kê khai cả artifact không có trong repository.<br>Không có bảng rule_sets, workflow_templates, documents hay audit trong datapack.<br><br>Xem Markdown đi kèm để đọc đầy đủ 22 quan hệ và mọi trường. Đầu trái/phải của nhãn bội số theo thứ tự lớp nguồn/đích của cạnh.'''
    cell('legend', legend, 'rounded=1;html=1;whiteSpace=wrap;align=left;verticalAlign=top;spacing=22;fontSize=16;fillColor=#ffffff;strokeColor=#ccd5e3;fontColor=#172033;', 2330, 1850, 580, 1100)
    return ET.tostring(root, encoding='unicode', xml_declaration=True)


def markdown(checks, mmd):
    lines = ['# Class diagram — toàn bộ bảng CSV trong Data Pack', '',
             'Sơ đồ đối chiếu trực tiếp **10 file CSV hiện có, 182 cột, 22 quan hệ** của Data Pack v1.0-final (snapshot 18/10/2026). Không thêm bảng ứng dụng hoặc bảng danh mục không có trong pack.', '',
             '[Mở SVG để phóng to](datapack-class-diagram.svg) · [Chỉnh sửa bằng draw.io](datapack-class-diagram.drawio) · [PDF vector](datapack-class-diagram.pdf) · [Ảnh PNG](datapack-class-diagram.png) · [Mermaid source](datapack-class-diagram.mmd) · [Schema và kiểm chứng JSON](datapack-class-diagram.validation.json)', '',
             '![Class diagram đầy đủ](datapack-class-diagram.svg)', '',
             '## Phạm vi và ký hiệu', '',
             '- Đây là mô hình các bản ghi CSV, không phải schema SQL có FK tự thực thi. Giữ nguyên tên bảng, thứ tự cột và trường dữ liệu lặp.',
             '- `PK`: dictionary gọi rõ là primary key. `UK`: tính duy nhất được kiểm trên pack hoặc quy ước một dòng output/mốc. `CK`: thành phần khóa ứng viên ghép, không tuyên bố là PK chính thức.',
             '- `FK`: tham chiếu đến khóa dòng; một số được xác nhận bằng đối chiếu dữ liệu thay vì dictionary khai báo rõ. `JOIN`: nối theo mã nhóm không duy nhất. `LIST`: nhiều ID nằm trong một ô, tách bằng `;`. `OUT`: dữ liệu chờ engine sinh.',
             '- Đường liền: quan hệ tham chiếu dòng. Đường đứt: JOIN nhóm, danh sách, tham chiếu output, liên kết metadata hoặc đối chiếu mẫu.',
             '- `?` chỉ biểu thị `nullable=YES` do dictionary xác nhận. Kiểu và nullability của template/metadata không được dictionary mô tả: kiểu trong sơ đồ là suy ra; số ô trống thực tế không tự trở thành ràng buộc nullable.',
             '- `0..*` là miền tổng quát cho số dòng con; không dùng số dòng quan sát để ép mọi contract luôn có đúng 3–5 milestone hoặc mọi milestone luôn có event. R15/R18 được ghi 1:1 trong các file hiện tại.',
             '- Cardinality quan hệ JOIN và LIST là liên kết giá trị, không ngụ ý có bảng nối vật lý. Các thuộc tính không có hàm/phương thức vì sơ đồ mô tả bảng dữ liệu.', '',
             '## Các bảng hiện có', '', '| Bảng | Nhóm | Dòng | Cột | Khóa |', '|---|---|---:|---:|---|']
    for name, t in TABLES.items():
        key = 'PK: ' + PRIMARY[name] if name in PRIMARY else {'decision_sample': 'UK quan sát: scenario_id', 'submission_output_template': 'UK: milestone_id trong một file nộp', 'data_dictionary': 'CK quan sát: (file_name, field_name)', 'dataset_manifest_final': 'UK quan sát: manifest_order; file_name'}[name]
        lines.append(f'| [{name}.csv](../../{t["path"].relative_to(ROOT)}) | {t["group"]} | {len(t["rows"])} | {len(t["fields"])} | {key} |')
    lines += ['', '## Danh mục quan hệ', '', '| Mã | Lớp A | Bội số A | Lớp B | Bội số B | Loại | Cách nối và điều kiện |', '|---|---|---|---|---|---|---|']
    for r in RELATIONS:
        lines.append(f'| {r["id"]} | `{r["a"]}` | {r["ca"]} | `{r["b"]}` | {r["cb"]} | {r["kind"]} | {r["detail"]} |')
    lines += ['', '## Những điểm cần đọc đúng', '',
              '1. **Milestone → rule không phải N:1.** `release_rule_code` không duy nhất trong payment_rules: có 16 mã, mỗi mã có 8 dòng. Mỗi milestone chọn một scope rồi engine chạy first-match theo priority. `rule_id_applied` trong output mới chỉ đến một rule thắng cụ thể.',
              '2. **Contract → rule_set là nối nhóm.** Có 4 rule_set_id, mỗi mã có 32 rule trong pack. Không có file rule_sets.csv hoặc rule_scopes.csv. `workflow_template`, `contract_type` và `applies_to_milestone_type` mô tả phạm vi áp dụng; không phải khóa dòng riêng.',
              '3. **Party có quan hệ với chính nó.** 30 APPROVER thuộc 10 BUYER, mỗi BUYER có 3 approver trong pack. 10 BUYER và 25 SUPPLIER không có parent. BUYER/SUPPLIER/APPROVER là giá trị của party_type, không phải ba bảng hay quan hệ kế thừa.',
              '4. **Event có quan hệ với chính nó.** 8 reference_event_id khác rỗng hiện đều nối DISPUTE_RESOLVED đến DISPUTE_OPENED cùng milestone. Một tham chiếu đúng khóa chưa đủ chứng minh resolve hợp lệ; còn cần trạng thái, thời gian và quyền actor.',
              '5. **Contract_id lặp là quan hệ cần kiểm tra.** Event, scenario, decision và output đều chứa cả contract_id và milestone_id. Mã hợp đồng trong từng dòng phải trùng hợp đồng của milestone. Decision còn phải khớp scenario_id về contract, milestone và scenario_type.',
              '6. **Danh sách không phải khóa ngoại vô hướng.** evidence_event_ids chứa nhiều event_id; required_event_types và allowed_event_types chứa mã loại event; required_approval_roles chứa mã vai trò. Không nối mã loại event đến event_id hoặc mã vai trò đến party_id.',
              '7. **Output gốc chưa có quyết định.** 405 dòng chỉ được điền 6 cột đầu. 16 cột còn lại rỗng. Quan hệ rule_id_applied/evidence_event_ids chỉ được điền sau khi sinh kết quả. audit_trace_id không có bảng đích trong datapack; document_id cũng không có documents.csv.',
              '8. **Sample và output là hai vai trò khác nhau.** 20 dòng sample là tham chiếu của BTC; 405 dòng template là chỗ nộp dự đoán. R22 chỉ là phép join đối chiếu theo milestone_id. Không dùng sample làm đầu vào quyết định và không suy ra ground truth cho 385 mốc còn lại.',
              '9. **Metadata mô tả file/cột.** Mỗi dòng dictionary mô tả một cột, mỗi dòng manifest mô tả một artifact. Không nối field_name trực tiếp tới các giá trị PK nghiệp vụ. Dictionary chỉ mô tả 7 CSV (131 cột); không mô tả template, dictionary hoặc manifest.', '',
              '## Tệp chỉ được kê khai trong manifest', '',
              'Các CSV dưới đây **không hiện diện** trong repository. Chỉ có danh sách cột/số dòng do manifest cung cấp; chưa thể kiểm chứng khóa, quan hệ hay dữ liệu. Không vẽ chúng như bảng đã có. Script evaluation_script_Case4.py và tài liệu README cũng là artifact, không phải bảng CSV.', '',
              '| File không có | Dòng khai báo | Cột khai báo | Header do manifest khai báo |', '|---|---:|---:|---|']
    for r in TABLES['dataset_manifest_final']['rows']:
        if r['file_format'] == 'CSV' and r['file_name'] not in FILES:
            lines.append(f'| `{r["file_name"]}` | {r["row_count"]} | {r["column_count"]} | {r["columns"].replace(";", ", ")} |')
    lines += ['', '## Chi tiết toàn bộ 182 cột', '',
              'Kiểu/nullable/đơn vị của 7 file nghiệp vụ và sample lấy nguyên từ dictionary. Với 3 file còn lại, nguồn được ghi là suy ra. `OUT` trong template vẫn là dữ liệu rỗng tại nguồn; kiểu được suy ra từ ý nghĩa trường và adapter hiện tại.', '']
    for name, t in TABLES.items():
        lines += [f'### {name}.csv', '', f'Nguồn: `{t["path"].relative_to(ROOT)}`. {len(t["rows"])} dòng, {len(t["fields"])} cột.', '',
                  '| # | Cột | Kiểu | Nhãn | Nullable chính thức | Ô trống | Đơn vị | Nguồn kiểu | Mô tả / định dạng / ghi chú |',
                  '|---:|---|---|---|---|---:|---|---|---|']
        for i, f in enumerate(t['fields'], 1):
            note = ' '.join(s for s in [f['description'], ('Format: ' + f['format']) if f['format'] else '', f['usage_note']] if s).replace('|', '\\|').replace('\n', ' ')
            lines.append(f'| {i} | `{f["name"]}` | {f["type"]} | {f["marks"]} | {f["nullable"] or "Không khai báo"} | {f["blank_count"]} | {f["unit"]} | {f["source"]} | {note} |')
        lines.append('')
    lines += ['## Mermaid class diagram', '',
              'Các class là 10 CSV thực tế. Mermaid hiển thị kiểu cơ bản; nhãn khóa nằm trong note/comment và bảng chi tiết. Dấu ?/nullable được đọc ở SVG và bảng cột để tránh phụ thuộc parser Mermaid.', '', '```mermaid', mmd.rstrip(), '```', '',
              '## Kiểm chứng và tái lập', '',
              f'Đã chạy {len(checks)} kiểm tra trực tiếp trên nguồn: đủ bảng/cột, dictionary/header, khóa duy nhất, tham chiếu, contract/milestone/scenario nhất quán, evidence cùng mốc, scope 8 rule và template đủ 405 mốc. Tất cả đạt. Không đánh giá hoặc suy đoán dữ liệu nội bộ chưa được cung cấp.', '',
              '```bash', 'python3 tools/generate_datapack_class_diagram.py', '```', '',
              'Script sinh lại Markdown, Mermaid, SVG, draw.io và JSON kiểm chứng. SVG giữ text/vector để phóng to; draw.io chỉnh sửa từng lớp, trường và đường nối. File JSON ghi SHA-256 thực tế của từng CSV để xác định đúng nguồn. Các giá trị nullable của dictionary là khai báo; các kiểm tra quan hệ là kết quả quan sát trên pack hiện tại.', '']
    return '\n'.join(lines)


def main():
    checks = verify()
    OUT.mkdir(parents=True, exist_ok=True)
    mmd = mermaid()
    (OUT / (STEM + '.mmd')).write_text(mmd, encoding='utf-8')
    (OUT / (STEM + '.svg')).write_text(render_svg(), encoding='utf-8')
    (OUT / (STEM + '.drawio')).write_text(render_drawio(), encoding='utf-8')
    (OUT / (STEM + '.md')).write_text(markdown(checks, mmd), encoding='utf-8')
    report = dict(dataset='CASE4_SMART_CONTRACT_WORKFLOW', version='1.0-final', snapshot='2026-10-18',
                  tableCount=len(TABLES), fieldCount=sum(len(t['fields']) for t in TABLES.values()),
                  relationshipCount=len(RELATIONS), checks=checks,
                  tables={n: dict(path=str(t['path'].relative_to(ROOT)), rows=len(t['rows']),
                                  sha256=hashlib.sha256(t['path'].read_bytes()).hexdigest(), fields=t['fields'])
                          for n, t in TABLES.items()},
                  relationships=[{k: v for k, v in r.items() if k not in ('points', 'position')} for r in RELATIONS])
    (OUT / (STEM + '.validation.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Generated {len(TABLES)} classes / {report["fieldCount"]} fields / {len(RELATIONS)} relations; {len(checks)} checks passed.')


if __name__ == '__main__':
    main()
