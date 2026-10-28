"""Independent check of one contract's decisions from a CodeCash verification bundle.

The bundle (CODECASH_VERIFICATION_V1, downloaded from a contract's smart contract tab) carries the
evaluator's input restricted to the contract, every stored decision and the hash the audit chain sealed
for it. This tool checks two things, without the API:

- seal: SHA-256(canonical(decision fields)) of each stored decision equals the hash the audit chain
  sealed for it (docs/NGHIEP_VU.md section 9.3), so the stored decision was not edited afterwards;
- re-run: the published evaluator (apps/engine/cli.py, WORKFLOW profile) run on the bundled input reaches
  the same decision, reason, rule, status and amounts. Paid and rejected milestones are frozen: a re-run
  may decide otherwise without any fault, so a difference there is reported, not counted as a failure.

    python3 tools/verify_decision.py bundle.json [--policy apps/engine/policy/case4_btc.json] [--no-rerun]

Exit code 0 when everything checks, 1 otherwise; the report is JSON on stdout.
"""
import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from verify_audit import canonical, sha256_hex  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / 'apps' / 'engine' / 'cli.py'
DEFAULT_POLICY = ROOT / 'apps' / 'engine' / 'policy' / 'case4_btc.json'
FORMAT = 'CODECASH_VERIFICATION_V1'
SEALED_FIELDS = ('milestoneId', 'contractId', 'runId', 'decision', 'reasonCode', 'ruleId', 'status',
                 'payableMillion', 'penaltyMillion', 'evidence')
# Stored evaluation field -> evaluator result field.
COMPARED = {'decision': 'decision', 'reasonCode': 'reason_code', 'ruleId': 'rule_id', 'status': 'status',
            'payableMillion': 'payable', 'penaltyMillion': 'penalty'}


def decision_hash(evaluation):
    return sha256_hex(canonical({key: evaluation.get(key) for key in SEALED_FIELDS if key in evaluation}))


def rerun(bundle, policy):
    """The evaluator's results for the bundled input, keyed by milestone."""
    with tempfile.TemporaryDirectory(prefix='codecash-verify-') as folder:
        for name, text in bundle['data'].items():
            if '/' in name or '\\' in name or not name.endswith('.csv'):
                raise ValueError(f'unexpected data file {name!r}')
            (Path(folder) / name).write_text(text, encoding='utf-8')
        done = subprocess.run(
            [sys.executable, str(CLI), '--data', folder, '--workflow', '--json', '--policy', str(policy)],
            capture_output=True, text=True, check=False, timeout=120,
        )
    if done.returncode != 0:
        raise ValueError(f'evaluator failed: {done.stderr.strip()}')
    return {trace['result']['milestone_id']: trace['result'] for trace in json.loads(done.stdout)['traces']}


def verify(bundle, policy=DEFAULT_POLICY, run=True):
    if bundle.get('format') != FORMAT:
        raise ValueError(f'not a {FORMAT} bundle')
    policy_sha = hashlib.sha256(Path(policy).read_bytes()).hexdigest()
    results = rerun(bundle, policy) if run else {}
    report, ok = [], True
    for item in bundle['decisions']:
        evaluation = item['evaluation']
        computed = decision_hash(evaluation)
        row = {
            'milestoneId': item['milestoneId'],
            'frozen': item['frozen'],
            # A missing seal means the decision predates sealing; only a mismatch is a failure.
            'seal': 'NOT_SEALED' if not item.get('sealedHash')
            else 'MATCH' if computed == item['sealedHash'] else 'MISMATCH',
        }
        ok &= row['seal'] != 'MISMATCH' and computed == item['storedHash']
        if run:
            result = results.get(item['milestoneId'])
            differences = {} if result else {'milestone': 'not evaluated'}
            for stored, field in COMPARED.items():
                if result and str(evaluation.get(stored)) != str(result.get(field)):
                    differences[stored] = {'stored': evaluation.get(stored), 'rerun': result.get(field)}
            row['rerun'] = 'MATCH' if not differences else 'FROZEN_DIFFERS' if item['frozen'] else 'DIFFERS'
            if differences:
                row['differences'] = differences
            ok &= row['rerun'] != 'DIFFERS'
        report.append(row)
    return {
        'ok': bool(ok),
        'contractId': bundle['contractId'],
        'policyMatches': policy_sha == bundle['engine']['policySha256'],
        'decisions': report,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('bundle', type=Path)
    parser.add_argument('--policy', type=Path, default=DEFAULT_POLICY)
    parser.add_argument('--no-rerun', action='store_true', help='only check the seals')
    args = parser.parse_args(argv)
    try:
        report = verify(json.loads(args.bundle.read_text(encoding='utf-8')), args.policy, not args.no_rerun)
    except (ValueError, KeyError) as error:
        print(json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=False))
        return 1
    # The evaluator that ran must be the one the bundle names.
    report['ok'] = report['ok'] and report['policyMatches']
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
