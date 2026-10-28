"""Independent verifier of the CodeCash audit log, written without the API's code.

An auditor runs it on an exported log or on one entry's proof; it needs only Python's standard library.
The rules it checks are the published ones (docs/NGHIEP_VU.md section 9):

- canonical JSON: object keys sorted, no spaces, strings and numbers as JavaScript's JSON.stringify
  writes them, ``undefined`` fields absent;
- entry hash = SHA-256(canonical(entry without ``hash``)); entries are numbered 1..n without gaps;
  each ``prevHash`` is the previous entry's hash, the first one 64 zeros, or, after a demo reset,
  the archived head carried by the RESET_DEMO_DATA entry;
- Merkle tree (RFC 9162 section 2.1): leaf = SHA-256(0x00 || entry hash), node = SHA-256(0x01 || l || r);
- a proof exported to a platform role carries a digest of the entry (no content): its inclusion is checked
  from the hash it states, its content cannot be.

    python3 tools/verify_audit.py --records .data/records.json [--anchor SEQ:HASH]
    python3 tools/verify_audit.py --proof proof.json

Exit code 0 when everything checks, 1 otherwise; the report is JSON on stdout.
"""
import argparse
import hashlib
import json
import math
import sys

GENESIS = '0' * 64


def js_number(value):
    """A number as JavaScript's JSON.stringify writes it."""
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, int):
        return str(value)
    if not math.isfinite(value):
        return 'null'
    if value == int(value) and abs(value) < 1e21:
        return str(int(value))
    text = repr(value)
    if 'e' in text:
        mantissa, exponent = text.split('e')
        sign = '-' if exponent.startswith('-') else '+'
        text = f'{mantissa}e{sign}{int(exponent.lstrip("+-"))}'
    return text


def canonical(value):
    if isinstance(value, list):
        return '[' + ','.join(canonical(v) for v in value) + ']'
    if isinstance(value, dict):
        # JavaScript compares keys by UTF-16 code units.
        keys = sorted(value, key=lambda k: k.encode('utf-16-be'))
        return '{' + ','.join(json.dumps(k, ensure_ascii=False) + ':' + canonical(value[k]) for k in keys) + '}'
    if value is None:
        return 'null'
    if isinstance(value, (bool, int, float)):
        return js_number(value)
    return json.dumps(value, ensure_ascii=False)


def sha256_hex(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def entry_hash(entry):
    return sha256_hex(canonical({k: v for k, v in entry.items() if k != 'hash'}))


def chain_origin(first):
    if first and first.get('action') == 'RESET_DEMO_DATA' and isinstance(first.get('archivedHeadHash'), str):
        return first['archivedHeadHash']
    return GENESIS


def verify_chain(audit, anchor=None):
    sealed = sorted((e for e in audit if isinstance(e.get('hash'), str)), key=lambda e: int(e['seq']))
    previous, broken = chain_origin(sealed[0] if sealed else None), None
    for index, entry in enumerate(sealed):
        problem = ('SEQUENCE_GAP' if int(entry['seq']) != index + 1 else
                   'LINK_BROKEN' if entry.get('prevHash') != previous else
                   'CONTENT_CHANGED' if entry_hash(entry) != entry['hash'] else None)
        if problem:
            broken = {'seq': int(entry['seq']), 'id': entry.get('id'), 'problem': problem}
            break
        previous = entry['hash']
    report = {'ok': broken is None and len(sealed) == len(audit), 'sealed': len(sealed),
              'head': {'seq': int(sealed[-1]['seq']), 'hash': sealed[-1]['hash']} if sealed else None,
              'firstBroken': broken, 'merkleRoot': merkle_root([e['hash'] for e in sealed])}
    if anchor:
        seq, head = anchor
        found = next((e for e in sealed if int(e['seq']) == seq), None)
        report['anchor'] = 'NOT_FOUND' if found is None else 'MATCH' if found['hash'] == head else 'MISMATCH'
        report['ok'] = report['ok'] and report['anchor'] == 'MATCH'
    return report


def _leaf(hash_hex):
    return hashlib.sha256(b'\x00' + bytes.fromhex(hash_hex)).digest()


def _node(left, right):
    return hashlib.sha256(b'\x01' + left + right).digest()


def _root(leaves):
    if not leaves:
        return hashlib.sha256(b'').digest()
    if len(leaves) == 1:
        return leaves[0]
    k = 1
    while k * 2 < len(leaves):
        k *= 2
    return _node(_root(leaves[:k]), _root(leaves[k:]))


def merkle_root(hashes):
    return _root([_leaf(h) for h in hashes]).hex()


def verify_inclusion(hash_hex, index, size, path, root):
    """RFC 9162 section 2.1.3.2."""
    if not 0 <= index < size:
        return False
    fn, sn, r = index, size - 1, _leaf(hash_hex)
    for sibling in (bytes.fromhex(p) for p in path):
        if sn == 0:
            return False
        if fn % 2 == 1 or fn == sn:
            r = _node(sibling, r)
            while fn % 2 == 0 and fn != 0:
                fn >>= 1
                sn >>= 1
        else:
            r = _node(r, sibling)
        fn >>= 1
        sn >>= 1
    return sn == 0 and r.hex() == root


# What platform roles receive of an audit entry (apps/api/src/common/audit-chain.ts auditDigest): enough to
# place it in the chain, none of its content. Its own hash cannot be recomputed, its inclusion can.
DIGEST_FIELDS = {'id', 'seq', 'prevHash', 'hash', 'action', 'resource', 'recordId', 'createdAt'}


def verify_proof(proof):
    """Inclusion proof of one entry. A digest entry is checked by its stated hash (``entryHash`` is None)."""
    entry, payload = proof['entry'], proof['anchor']['payload']
    digest = set(entry) <= DIGEST_FIELDS
    recomputed = entry_hash(entry)
    leaf = entry.get('hash') if digest else recomputed
    checks = {
        'entryHash': None if digest else recomputed == entry.get('hash'),
        'position': proof['leafIndex'] == int(entry['seq']) - 1 and proof['treeSize'] == payload['sequence'],
        'inclusion': bool(payload.get('merkleRoot')) and isinstance(leaf, str) and verify_inclusion(
            leaf, proof['leafIndex'], proof['treeSize'], proof['path'], payload['merkleRoot']),
    }
    return {'ok': all(value is not False for value in checks.values()), 'checks': checks, 'digest': digest,
            'seq': int(entry['seq']), 'anchoredSequence': payload['sequence'], 'merkleRoot': payload.get('merkleRoot')}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--records', help='exported log: a JSON object with an "audit" list, or the list itself')
    parser.add_argument('--anchor', help='head saved elsewhere, as SEQ:HASH')
    parser.add_argument('--proof', help='proof of one entry from GET /trust/anchors/proof/:entryId')
    args = parser.parse_args(argv)
    if bool(args.records) == bool(args.proof):
        parser.error('give exactly one of --records and --proof')
    if args.records:
        with open(args.records, encoding='utf-8') as handle:
            data = json.load(handle)
        anchor = None
        if args.anchor:
            seq, _, head = args.anchor.partition(':')
            anchor = (int(seq), head)
        report = verify_chain(data['audit'] if isinstance(data, dict) else data, anchor)
    else:
        with open(args.proof, encoding='utf-8') as handle:
            report = verify_proof(json.load(handle))
    print(json.dumps(report, indent=1))
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
