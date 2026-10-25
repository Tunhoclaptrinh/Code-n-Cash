import importlib.util
import io
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
module_spec = importlib.util.spec_from_file_location('sample_contract', ROOT / 'apps/engine/sample_contract.py')
sample = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(sample)

PLACEHOLDER = '……'


def partial_input(language='vi', **overrides):
    data = {
        'partial': True,
        'language': language,
        'documentBody': '',
        'title': PLACEHOLDER,
        'code': 'CT0101',
        'buyer': 'Buyer',
        'supplier': PLACEHOLDER,
        'valueMillion': PLACEHOLDER,
        'startDate': PLACEHOLDER,
        'endDate': PLACEHOLDER,
        'graceDays': PLACEHOLDER,
        'penaltyRatePct': PLACEHOLDER,
        'maxPenaltyPct': PLACEHOLDER,
        'approvalPolicy': None,
        'signers': [],
        'stages': [],
    }
    data.update(overrides)
    return data


def document_xml(docx):
    with zipfile.ZipFile(io.BytesIO(docx)) as bundle:
        assert bundle.testzip() is None
        return bundle.read('word/document.xml').decode('utf-8')


class PartialSampleContractTests(unittest.TestCase):
    def test_partial_without_signers_renders_placeholders_and_signer_notice(self):
        for language, notice in (('vi', 'Chưa chọn người ký'), ('en', 'Signers have not been chosen yet')):
            xml = document_xml(sample.build_document(partial_input(language)))
            self.assertIn(PLACEHOLDER, xml)
            self.assertGreaterEqual(xml.count(notice), 2, 'article 7 and the signature page both say so')
            self.assertNotIn('SIGNING AREA 01', xml)
            self.assertNotIn('VỊ TRÍ KÝ 01', xml)

    def test_placeholders_pass_through_format_and_custom_body(self):
        xml = document_xml(sample.build_document(partial_input(documentBody='Value {{valueMillion}} / {literal}')))
        self.assertIn(f'Value {PLACEHOLDER} / {{literal}}', xml)
        self.assertIn(f'{PLACEHOLDER} triệu VND', xml)

    def test_partial_keeps_provided_signers_and_stages(self):
        stage = {'name': 'Kickoff', 'paymentPercent': '10', 'dueDate': PLACEHOLDER, 'requiredEvents': 'CONTRACT_SIGNED'}
        xml = document_xml(sample.build_document(partial_input(
            signers=[{'party': 'BUYER', 'name': 'An Nguyen'}], stages=[stage])))
        self.assertIn('An Nguyen', xml)
        self.assertIn('Kickoff', xml)
        self.assertNotIn('Chưa chọn người ký', xml)

    def test_full_mode_still_requires_one_to_four_signers(self):
        for flag in (False, None, 'true', 1):
            with self.assertRaisesRegex(ValueError, 'SIGNER_COUNT'):
                sample.build_document(partial_input(partial=flag))
        data = partial_input()
        del data['partial']
        with self.assertRaisesRegex(ValueError, 'SIGNER_COUNT'):
            sample.build_document(data)

    def test_partial_still_rejects_more_than_four_signers(self):
        signers = [{'party': 'BUYER', 'name': f'Signer {index}'} for index in range(5)]
        with self.assertRaisesRegex(ValueError, 'SIGNER_COUNT'):
            sample.build_document(partial_input(signers=signers))


if __name__ == '__main__':
    unittest.main()
