"""The independent audit verifier (tools/verify_audit.py) on its own rules."""
import hashlib
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
module_spec = importlib.util.spec_from_file_location('verify_audit', ROOT / 'tools/verify_audit.py')
verify = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(verify)


def chain(n, origin=verify.GENESIS):
    entries, previous = [], origin
    for seq in range(1, n + 1):
        entry = {'id': f'e{seq}', 'seq': seq, 'prevHash': previous, 'action': 'X', 'amount': seq / 4}
        entry['hash'] = verify.entry_hash(entry)
        entries.append(entry)
        previous = entry['hash']
    return entries


class CanonicalTests(unittest.TestCase):
    def test_numbers_and_keys_are_written_as_javascript_writes_them(self):
        self.assertEqual(verify.canonical({'b': 100.0, 'a': [1e-7, 1e21, 0.25, True, None, 'ă"']}),
                         '{"a":[1e-7,1e+21,0.25,true,null,"ă\\""],"b":100}')


class ChainTests(unittest.TestCase):
    def test_a_clean_chain_verifies_and_every_kind_of_edit_is_named(self):
        entries = chain(5)
        self.assertTrue(verify.verify_chain(entries)['ok'])
        edited = chain(5)
        edited[2]['action'] = 'Y'
        self.assertEqual(verify.verify_chain(edited)['firstBroken']['problem'], 'CONTENT_CHANGED')
        self.assertEqual(verify.verify_chain(entries[:2] + entries[3:])['firstBroken']['problem'], 'SEQUENCE_GAP')

    def test_a_cut_tail_is_found_against_a_saved_head(self):
        entries = chain(5)
        self.assertEqual(verify.verify_chain(entries, (5, entries[4]['hash']))['anchor'], 'MATCH')
        report = verify.verify_chain(entries[:3], (5, entries[4]['hash']))
        self.assertEqual((report['anchor'], report['ok']), ('NOT_FOUND', False))

    def test_a_reset_chain_continues_the_archived_head(self):
        archived = 'a' * 64
        first = {'id': 'r', 'seq': 1, 'prevHash': archived, 'action': 'RESET_DEMO_DATA', 'archivedHeadHash': archived}
        first['hash'] = verify.entry_hash(first)
        self.assertTrue(verify.verify_chain([first])['ok'])


class MerkleTests(unittest.TestCase):
    def test_every_entry_of_every_tree_size_has_a_valid_path_and_a_wrong_leaf_fails(self):
        self.assertEqual(verify.merkle_root([]), hashlib.sha256(b'').hexdigest())
        for size in range(1, 18):
            hashes = [hashlib.sha256(str(i).encode()).hexdigest() for i in range(size)]
            root = verify.merkle_root(hashes)
            for index in range(size):
                path = self.path(index, hashes)
                self.assertTrue(verify.verify_inclusion(hashes[index], index, size, path, root), (size, index))
                if size > 1:
                    wrong = hashes[(index + 1) % size]
                    self.assertFalse(verify.verify_inclusion(wrong, index, size, path, root))

    @staticmethod
    def path(index, hashes):
        """Audit path built directly from the tree definition (RFC 9162 section 2.1.3.1)."""
        leaves = [verify._leaf(h) for h in hashes]

        def walk(m, nodes):
            if len(nodes) <= 1:
                return []
            k = 1
            while k * 2 < len(nodes):
                k *= 2
            if m < k:
                return walk(m, nodes[:k]) + [verify._root(nodes[k:])]
            return walk(m - k, nodes[k:]) + [verify._root(nodes[:k])]
        return [p.hex() for p in walk(index, leaves)]


if __name__ == '__main__':
    unittest.main()
