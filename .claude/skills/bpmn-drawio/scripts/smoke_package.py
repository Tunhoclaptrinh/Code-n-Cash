"""Extract a candidate ZIP into a fresh folder and rerun its own checks from there.

Verifies archive/entry digests, refuses unsafe entries, runs the unit suite from
the extracted copy and, with --drawio-root, creates/renders/audits the demo.
"""
from pathlib import Path, PurePosixPath
from zipfile import ZipFile
import argparse
import hashlib
import json
import platform
import subprocess
import sys
import tempfile


def run(args, cwd):
    result = subprocess.run([sys.executable, '-B', *map(str, args)], cwd=cwd, capture_output=True, text=True)
    return {'command': [Path(str(a)).name if n == 0 else str(a) for n, a in enumerate(args)], 'returncode': result.returncode,
            'stderr_tail': result.stderr[-1500:]}


def extract(archive, target):
    with ZipFile(archive) as z:
        names = z.namelist()
        for name in names:
            path = PurePosixPath(name)
            if path.is_absolute() or '..' in path.parts or path.parts[0] != 'bpmn-drawio':
                raise ValueError('Unsafe or unexpected ZIP entry: ' + name)
        z.extractall(target)
        return names


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--drawio-root', type=Path)
    parser.add_argument('--source-manifest', type=Path)
    parser.add_argument('--chrome')
    parser.add_argument('--work-dir', type=Path, help='Empty folder for the extracted copy (default: new temporary folder)')
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    archive = args.archive.resolve()
    work = (args.work_dir or Path(tempfile.mkdtemp(prefix='bpmn-smoke-'))).resolve()
    work.mkdir(parents=True, exist_ok=True)
    if any(work.iterdir()): raise SystemExit('Work directory must be empty: ' + str(work))
    report = {'archive': archive.name, 'archiveSha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'work_dir': str(work),
              'python': sys.version.split()[0], 'platform': platform.platform(), 'steps': [], 'errors': []}
    outer = archive.parent / 'MANIFEST.json'
    if outer.is_file():
        expected = json.loads(outer.read_text(encoding='utf-8')).get('archiveSha256')
        report['outer_manifest_match'] = expected == report['archiveSha256']
        if not report['outer_manifest_match']: report['errors'].append('Archive digest differs from the adjacent MANIFEST.json')
    names = extract(archive, work)
    skill = work / 'bpmn-drawio'
    manifest = json.loads((skill / 'MANIFEST.json').read_text(encoding='utf-8'))
    listed = set(manifest['files'])
    actual = {n for n in names if not n.endswith('/')} - {'bpmn-drawio/MANIFEST.json'}
    if listed != actual: report['errors'].append('ZIP entries differ from the internal manifest')
    bad = [n for n in listed if hashlib.sha256((work / n).read_bytes()).hexdigest() != manifest['files'][n]]
    if bad: report['errors'].append('Entry digests differ: ' + ', '.join(sorted(bad)))
    report.update(files=len(listed), license_status=manifest.get('license_status'), packaged_tool=manifest.get('tool'))
    # Run from a neutral folder so nothing resolves against the development workspace.
    neutral = work / 'run'; neutral.mkdir()
    unit = run([skill / 'scripts/run_checks.py', '--report', neutral / 'unit.json'], neutral)
    report['steps'].append(unit)
    if unit['returncode'] == 0:
        data = json.loads((neutral / 'unit.json').read_text(encoding='utf-8'))
        report['unit_tests'], report['extracted_tool'] = data['unit_tests'], data['tool']
        if manifest.get('tool') and data['tool']['sha256'] != manifest['tool']['sha256']:
            report['errors'].append('Extracted tool fingerprint differs from the packaged fingerprint')
    else:
        report['errors'].append('Unit checks failed in the extracted copy')
    if args.drawio_root:
        # Steps run from a neutral folder, so caller-relative paths must be absolute.
        chrome = str(Path(args.chrome).resolve()) if args.chrome and Path(args.chrome).exists() else args.chrome
        extra = (['--chrome', chrome] if chrome else []) + (['--source-manifest', args.source_manifest.resolve()] if args.source_manifest else [])
        demo = neutral / 'answer'
        steps = [[skill / 'scripts/create_demo.py', '--output-dir', demo]]
        for name, theme, compare in (('Demo', 'monochrome', None), ('Demo_Co_mau', 'bizagi-inspired', demo / 'Demo.drawio')):
            steps.append([skill / 'scripts/render_drawio.py', demo / f'{name}.drawio', '--drawio-root', args.drawio_root.resolve(), '--output-dir', demo / name, '--text-mode', 'plain', '--pdf', *extra])
            audit = [skill / 'scripts/audit_drawio.py', demo / f'{name}.drawio', '--render-dir', demo / name, '--palette', theme, '--strict-layout', '--require-supported', '--report', demo / f'{name}.audit.json']
            steps.append(audit + (['--compare', compare] if compare else []))
        for step in steps:
            result = run(step, neutral); report['steps'].append(result)
            if result['returncode']:
                report['errors'].append('Render/audit step failed: ' + Path(str(step[0])).name); break
        report['render_audit_completed'] = not report['errors']
    else:
        report['render_audit_completed'] = None
        report['render_skip_reason'] = 'No --drawio-root supplied; rendering was not attempted'
    report['passed'] = not report['errors']
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: report.get(k) for k in ('archive', 'files', 'unit_tests', 'render_audit_completed', 'passed', 'errors')}, ensure_ascii=False))
    if not report['passed']: raise SystemExit(1)


if __name__ == '__main__':
    main()
