"""Check local rendering prerequisites without installing or downloading anything."""
from pathlib import Path
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from drawio_common import digest


def chrome_path(explicit=None):
    if explicit:
        path = shutil.which(str(explicit)) or str(Path(explicit).expanduser())
        if not Path(path).is_file(): raise ValueError('Chrome executable not found: '+path)
        return path
    for name in ('google-chrome', 'chromium', 'chromium-browser', 'chrome', 'msedge'):
        if shutil.which(name): return shutil.which(name)
    for path in ('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                 os.path.expandvars(r'$PROGRAMFILES/Google/Chrome/Application/chrome.exe')):
        if Path(path).is_file(): return path
    raise ValueError('Chrome/Chromium not found; supply --chrome PATH')


def viewer_info(root, manifest=None):
    root = Path(root).resolve()
    viewer = root/'src/main/webapp/js/viewer-static.min.js'
    if not viewer.is_file(): raise ValueError('Missing official viewer: '+str(viewer))
    actual = digest(viewer)
    commit = None
    if shutil.which('git') and (root/'.git').exists():
        run = subprocess.run(['git', '-C', str(root), 'rev-parse', 'HEAD'], capture_output=True, text=True)
        if run.returncode == 0: commit = run.stdout.strip()
    if manifest:
        record = json.loads(Path(manifest).read_text(encoding='utf-8'))
        if record.get('viewer_sha256') != actual:
            raise ValueError('Viewer digest differs from provenance manifest')
        if commit and record.get('commit') != commit:
            raise ValueError('Checkout commit differs from provenance manifest')
        commit = record.get('commit')
        if not isinstance(commit, str) or not commit:
            raise ValueError('Manifest must specify a commit')
    if not commit:
        raise ValueError('Source archive requires --source-manifest with commit and viewer_sha256')
    return {'viewer': str(viewer), 'drawioCommit': commit, 'viewerSha256': actual,
            'provenance': 'manifest' if manifest else 'git',
            'compatibility': 'Recorded version, not automatic compatibility certification'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--drawio-root', type=Path, required=True)
    parser.add_argument('--source-manifest', type=Path)
    parser.add_argument('--chrome')
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    report = {'python': sys.version.split()[0], 'platform': sys.platform, 'errors': [], 'checks': {}}
    try:
        if sys.version_info < (3, 10): raise ValueError('Python 3.10+ required')
        report.update(viewer_info(args.drawio_root, args.source_manifest))
        chrome = chrome_path(args.chrome)
        version = subprocess.run([chrome, '--version'], capture_output=True, text=True, check=True, timeout=15)
        report['chrome'] = version.stdout.strip()
        args.output_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryFile(dir=args.output_dir): pass
        report['checks']['output_writable'] = True
        fc = shutil.which('fc-match')
        if fc:
            report['font_substitution'] = subprocess.run([fc, 'Arial'], capture_output=True, text=True, check=True).stdout.strip()
        else:
            report['font_substitution'] = 'Not inspected; inspect Vietnamese labels in rendered previews'
        report['checks']['dependencies_found'] = True
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        report['errors'].append(str(error))
    report['passed'] = not report['errors']
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))
    if not report['passed']: raise SystemExit(1)


if __name__ == '__main__': main()
