"""Load an uploaded dataset (Data Pack layout, flat CSV files or zip archives) into a spec.Pack."""
import csv
import hashlib
import zipfile
from pathlib import Path

import codecash_engine as spec

# role -> file name in the official Data Pack, relative path there, required
FILES = {
    'contracts': ('contracts.csv', '01_data/contracts.csv', True),
    'parties': ('parties.csv', '01_data/parties.csv', True),
    'milestones': ('milestones.csv', '01_data/milestones.csv', True),
    'events': ('events.csv', '01_data/events.csv', True),
    'payment_rules': ('payment_rules.csv', '01_data/payment_rules.csv', True),
    'decision_sample': ('decision_sample.csv', '03_labels_sample/decision_sample.csv', False),
    'template': ('submission_output_template.csv', '04_output_templates/submission_output_template.csv', False),
}
# submission_output_template.csv; the engine fills every column after planned_payment_vnd_mn
TEMPLATE_COLUMNS = ['contract_id', 'milestone_id', 'contract_type', 'milestone_sequence', 'milestone_type',
                    'planned_payment_vnd_mn', 'predicted_decision', 'predicted_milestone_status', 'conditions_met',
                    'missing_conditions', 'payable_amount_vnd_mn', 'penalty_amount_vnd_mn', 'reason_code',
                    'decision_reason', 'evidence_event_ids', 'rule_id_applied', 'confidence_score',
                    'processing_time_ms', 'evaluated_at', 'engine_name', 'audit_trace_id', 'notes']
# Exception decisions approved by two controllers (BR-19): one event_id per row. Not part of the Data Pack.
VOIDED = 'voided_events.csv'
MAX_UNZIPPED = 200 * 1024 * 1024
UNZIPPED = '_unzipped'


def header(path):
    with open(path, encoding='utf-8-sig', newline='') as handle:
        return next(csv.reader(handle), [])


def expected_columns(role):
    """Columns of the official file; an upload must contain at least these."""
    official = spec.DEFAULT_DATA / FILES[role][1]
    return header(official) if official.exists() else []


def unzip(base):
    """Extract each uploaded zip once into _unzipped/<name>/, refusing unsafe paths and zip bombs."""
    for archive in sorted(p for p in base.glob('*.zip') if p.is_file()):
        target = base / UNZIPPED / archive.stem
        if target.exists():
            continue
        with zipfile.ZipFile(archive) as bundle:
            members = [m for m in bundle.infolist() if not m.is_dir()]
            if sum(m.file_size for m in members) > MAX_UNZIPPED:
                raise ValueError(f'ZIP_TOO_LARGE:{archive.name}')
            for member in members:
                path = Path(member.filename)
                if path.is_absolute() or '..' in path.parts:
                    raise ValueError(f'ZIP_UNSAFE_PATH:{member.filename}')
                if path.suffix.lower() != '.csv' or path.name.startswith('.') or '__MACOSX' in path.parts:
                    continue
                destination = target / path
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(bundle.read(member))


def locate(base):
    """Find each file by name anywhere under base; metadata, readme and unrelated files are ignored."""
    unzip(base)
    found = {}
    for path in sorted(base.rglob('*.csv')):
        found.setdefault(path.name.lower(), []).append(path)
    return found


def scope_files(found):
    """An optional list of milestone ids to score, e.g. hidden_test_ids_Case4.csv."""
    return [p for name, ps in found.items() if 'test_ids' in name or name.startswith('scope') for p in ps]


def inspect(base, apply_scope=False):
    base = Path(base)
    found = locate(base)
    files, ok = [], True
    for role, (name, _, required) in FILES.items():
        paths = found.get(name, [])
        entry = {'role': role, 'name': name, 'required': required, 'status': 'ok', 'path': None, 'rows': 0,
                 'missingColumns': []}
        if not paths:
            entry['status'] = 'missing' if required else 'optional'
        elif len(paths) > 1:
            entry['status'] = 'ambiguous'
            entry['path'] = ', '.join(str(p.relative_to(base)) for p in paths)
        else:
            path = paths[0]
            entry['path'] = str(path.relative_to(base))
            entry['missingColumns'] = [c for c in expected_columns(role) if c not in header(path)]
            entry['rows'] = len(spec.read(path.parent, path.name))
            if entry['missingColumns']:
                entry['status'] = 'invalid'
        ok = ok and entry['status'] in ('ok', 'optional')
        files.append(entry)
    scopes = scope_files(found)
    scope_entry = None
    if len(scopes) > 1:
        scope_entry = {'path': ', '.join(str(p.relative_to(base)) for p in scopes), 'rows': 0, 'status': 'ambiguous'}
    elif scopes:
        ids = [r.get('milestone_id', '') for r in spec.read(scopes[0].parent, scopes[0].name)]
        scope_entry = {'path': str(scopes[0].relative_to(base)), 'rows': len(ids),
                       'status': 'ok' if ids and all(ids) else 'invalid'}
    if scope_entry:
        scope_entry['applied'] = apply_scope
    ok = ok and (not apply_scope or not scope_entry or scope_entry['status'] == 'ok')
    return {'ok': ok, 'files': files, 'scope': scope_entry}


def load(base, *, apply_scope=False, workflow=False):
    """Build the pack; without a template the rows follow milestones.csv, as the official template does."""
    base = Path(base)
    report = inspect(base, apply_scope=apply_scope)
    if not report['ok']:
        problems = [f"{f['name']}:{f['status']}" for f in report['files'] if f['status'] not in ('ok', 'optional')]
        if report['scope'] and report['scope']['status'] != 'ok':
            problems.append(f"{report['scope']['path']}:{report['scope']['status']}")
        raise ValueError('DATASET_INVALID ' + ', '.join(problems))
    paths = {f['role']: base / f['path'] for f in report['files'] if f['status'] == 'ok'}
    rows = {role: spec.read(path.parent, path.name) for role, path in paths.items()}
    for role, key in [('contracts', 'contract_id'), ('parties', 'party_id'), ('milestones', 'milestone_id'), ('events', 'event_id'), ('payment_rules', 'rule_id')]:
        ids = [row.get(key, '') for row in rows[role]]
        if any(not value for value in ids) or len(ids) != len(set(ids)):
            raise ValueError(f'DATASET_INVALID {role}:duplicate_or_empty_id')
    milestones = rows['milestones']
    known = {m['milestone_id'] for m in milestones}
    contracts = {c['contract_id']: c for c in rows['contracts']}
    if 'template' in rows and not rows['template']:
        raise ValueError('TEMPLATE_EMPTY')
    template = rows.get('template') if 'template' in rows else [
        dict({key: '' for key in TEMPLATE_COLUMNS},
             contract_id=m['contract_id'], milestone_id=m['milestone_id'],
             contract_type=contracts.get(m['contract_id'], {}).get('contract_type', ''),
             milestone_sequence=m['milestone_sequence'], milestone_type=m['milestone_type'],
             planned_payment_vnd_mn=m['planned_payment_vnd_mn'])
        for m in milestones]
    unknown = sorted({t['milestone_id'] for t in template} - known)
    if unknown:
        raise ValueError('TEMPLATE_UNKNOWN_MILESTONES ' + ', '.join(unknown[:10]))
    ids = [row['milestone_id'] for row in template]
    if len(ids) != len(set(ids)):
        raise ValueError('TEMPLATE_DUPLICATE_MILESTONES')
    if set(ids) != known:
        raise ValueError('TEMPLATE_INCOMPLETE')
    generated = {m['milestone_id']: m for m in milestones}
    for row in template:
        milestone = generated[row['milestone_id']]
        contract = contracts.get(milestone['contract_id'], {})
        expected = {'contract_id': milestone['contract_id'], 'contract_type': contract.get('contract_type', ''),
                    'milestone_sequence': milestone['milestone_sequence'], 'milestone_type': milestone['milestone_type'],
                    'planned_payment_vnd_mn': milestone['planned_payment_vnd_mn']}
        if any(row[key] != value for key, value in expected.items()):
            raise ValueError(f"TEMPLATE_METADATA_MISMATCH {row['milestone_id']}")
    # A submission always uses the 22 official columns, even if an uploaded template has extras.
    template = [{key: row.get(key, '') for key in TEMPLATE_COLUMNS} for row in template]
    scope_ids, unknown_scope = None, []
    if apply_scope and report['scope']:
        scope = base / report['scope']['path']
        scope_ids = {r['milestone_id'] for r in spec.read(scope.parent, scope.name)}
        unknown_scope = sorted(scope_ids - known)
        template = [t for t in template if t['milestone_id'] in scope_ids]
    output_ids = {row['milestone_id'] for row in template}
    samples = [d for d in rows.get('decision_sample', []) if d['milestone_id'] in output_ids]
    voided_paths = locate(base).get(VOIDED, []) if workflow else []
    if len(voided_paths) > 1:
        raise ValueError(f'DATASET_INVALID {VOIDED}:ambiguous')
    voided = frozenset(r['event_id'] for p in voided_paths for r in spec.read(p.parent, p.name) if r.get('event_id'))
    pack = spec.Pack(rows['contracts'], rows['parties'], milestones, rows['events'], rows['payment_rules'],
                     samples, template, base)
    # The scoring list changes the output, so it is part of the run identity.
    hashed = [paths[role] for role in sorted(paths)] + ([base / report['scope']['path']] if apply_scope and report['scope'] else []) \
        + voided_paths
    digest = hashlib.sha256(''.join(hashlib.sha256(p.read_bytes()).hexdigest() for p in hashed).encode()).hexdigest()
    source = {'kind': 'dataset', 'files': {role: str(path.relative_to(base)) for role, path in paths.items()},
              'profile': 'WORKFLOW' if workflow else 'BTC_SUBMISSION',
              'outputScope': 'EXPLICIT_SUBSET' if apply_scope and report['scope'] else 'FULL_TEMPLATE',
              'scopeIgnored': bool(report['scope']) and not apply_scope,
              'generatedTemplate': 'template' not in paths, 'scopeRows': len(scope_ids) if scope_ids else None,
              'unknownScopeIds': unknown_scope[:50], 'voided': sorted(voided)}
    return pack, digest, source, voided

