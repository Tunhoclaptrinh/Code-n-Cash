import importlib.util
import io
import json
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


def full_input(language='vi', signers=2, **overrides):
    people = [('BUYER', 'Nguyen Van An'), ('SUPPLIER', 'Vu Thanh Ha'), ('BUYER', 'Le Quoc Dung'), ('SUPPLIER', 'Tran Thi Mai')]
    stages = [{'type': 'DELIVERY', 'name': 'Delivery', 'paymentPercent': '60', 'dueDate': '2026-06-15', 'requiredEvents': 'DELIVERY, INVOICE'},
              {'type': 'ACCEPTANCE', 'name': 'Acceptance', 'paymentPercent': '40', 'dueDate': '2026-09-15', 'requiredEvents': 'ACCEPTANCE'}]
    data = partial_input(language, partial=False, title='Equipment supply', supplier='Supplier Co', valueMillion='1250.50',
                         startDate='2026-03-01', endDate='2027-03-01', graceDays=5, penaltyRatePct='0.25', maxPenaltyPct='8.00',
                         approvalPolicy='FINANCE_PLUS_OWNER', stages=stages,
                         signers=[{'party': party, 'name': name} for party, name in people[:signers]])
    data.update(overrides)
    return data


def package_parts(docx):
    with zipfile.ZipFile(io.BytesIO(docx)) as bundle:
        return {name: bundle.read(name).decode('utf-8') for name in bundle.namelist()}


class TypesetLayoutTests(unittest.TestCase):
    def test_page_follows_the_administrative_document_layout(self):
        parts = package_parts(sample.build_document(full_input()))
        document, styles = parts['word/document.xml'], parts['word/styles.xml']
        self.assertIn('<w:pgSz w:w="11906" w:h="16838"/>', document)
        self.assertIn('w:top="1134" w:right="850" w:bottom="1134" w:left="1701"', document)
        self.assertIn('Times New Roman', styles)
        self.assertNotIn('DejaVu', document + styles)
        # Body: 13 pt, justified, 1 cm first-line indent, multiple 1.15, 6 pt after.
        normal = styles[styles.index('w:styleId="Normal"'):styles.index('w:styleId="NationalHeader"')]
        for part in ('w:val="26"', 'w:val="both"', 'w:firstLine="567"', 'w:line="276" w:lineRule="auto"', 'w:after="120"', 'w:before="0"'):
            self.assertIn(part, normal)
        self.assertNotIn('word/footer.xml', parts)
        self.assertNotIn('<w:footerReference', document)

    def test_header_block_and_notice(self):
        document = package_parts(sample.build_document(full_input(mode='original')))['word/document.xml']
        self.assertLess(document.index('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'), document.index('Độc lập - Tự do - Hạnh phúc'))
        self.assertLess(document.index('Độc lập - Tự do - Hạnh phúc'), document.index('HỢP ĐỒNG HÀNG HÓA / DỊCH VỤ'))
        self.assertIn('Số: CT0101', document)
        self.assertIn('Bản hợp đồng mô phỏng, lập từ dữ liệu hợp đồng của Ban tổ chức để xem và đối chiếu', document)
        self.assertIn('Căn cứ Bộ luật Dân sự số 91/2015/QH13;', document)
        self.assertIn('Căn cứ Luật Thương mại số 36/2005/QH11;', document)

    def test_no_en_or_em_dash_in_generated_text_or_templates(self):
        templates = (ROOT / 'apps/engine/templates')
        for path in templates.glob('sample-*.json'):
            self.assertNotRegex(path.read_text(encoding='utf-8'), '[–—]', path.name)
        for language in ('vi', 'en'):
            for mode in ('sample', 'original'):
                parts = package_parts(sample.build_document(full_input(language, 3, mode=mode)))
                self.assertNotRegex(parts['word/document.xml'], '[–—]')

    def test_vietnamese_and_english_templates_stay_in_sync(self):
        def shape(value):
            return {key: shape(item) for key, item in value.items()} if isinstance(value, dict) \
                else len(value) if isinstance(value, list) else None
        vi, en = (json.loads((ROOT / f'apps/engine/templates/sample-{language}.json').read_text(encoding='utf-8')) for language in ('vi', 'en'))
        self.assertEqual(shape(vi), shape(en))
        self.assertEqual(len(vi['sections']), len(en['sections']))

    def test_milestone_table_is_a_full_width_bordered_table_with_repeating_header(self):
        document = package_parts(sample.build_document(full_input()))['word/document.xml']
        milestones = document[document.rindex('<w:tbl>', 0, document.index('2026-06-15')):document.index('</w:tbl>', document.index('2026-06-15'))]
        self.assertIn('<w:tblW w:w="9355" w:type="dxa"/>', milestones)
        self.assertEqual(milestones.count('<w:tblHeader/>'), 1)
        self.assertEqual(milestones.count('<w:cantSplit/>'), 3)
        self.assertIn('w:fill="D9D9D9"', milestones)
        self.assertIn('w:sz="4"', milestones)

    def test_signature_blocks_keep_anchor_texts_and_signer_names(self):
        for count in (1, 2, 3, 4):
            document = package_parts(sample.build_document(full_input(signers=count)))['word/document.xml']
            for index in range(1, count + 1):
                self.assertIn(f'VỊ TRÍ KÝ 0{index}', document)
            self.assertNotIn(f'VỊ TRÍ KÝ 0{count + 1}', document)
            self.assertEqual(document.count('ĐẠI DIỆN BÊN MUA') + document.count('ĐẠI DIỆN NHÀ CUNG CẤP'), count)
            self.assertEqual(document.count('(Ký, ghi rõ họ tên và đóng dấu)'), count)
        english = package_parts(sample.build_document(full_input('en', 2)))['word/document.xml']
        self.assertIn('SIGNING AREA 02', english)

    def test_output_is_deterministic(self):
        first = sample.build_document(full_input('vi', 3, mode='original'))
        self.assertEqual(first, sample.build_document(full_input('vi', 3, mode='original')))

    def test_custom_document_body_lines_become_paragraphs(self):
        document = package_parts(sample.build_document(full_input(documentBody='First line {{title}}\nSecond {literal} line')))['word/document.xml']
        self.assertIn('First line Equipment supply</w:t></w:r></w:p>', document)
        self.assertIn('Second {literal} line', document)


if __name__ == '__main__':
    unittest.main()
