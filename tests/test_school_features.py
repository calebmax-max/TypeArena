import unittest

from school_features import MAX_ASSIGNMENT_PASSAGE_LENGTH, _normalize_assignment_passage


class SchoolAssignmentPassageTests(unittest.TestCase):
    def test_normalizes_required_passage_whitespace(self):
        self.assertEqual(_normalize_assignment_passage('  Type this text.  '), 'Type this text.')

    def test_rejects_missing_or_whitespace_only_passage(self):
        for passage in (None, '', ' \n\t '):
            with self.subTest(passage=passage), self.assertRaisesRegex(ValueError, 'passage is required'):
                _normalize_assignment_passage(passage)

    def test_rejects_passage_over_limit(self):
        passage = 'x' * (MAX_ASSIGNMENT_PASSAGE_LENGTH + 1)
        with self.assertRaisesRegex(ValueError, 'cannot exceed'):
            _normalize_assignment_passage(passage)


if __name__ == '__main__':
    unittest.main()
