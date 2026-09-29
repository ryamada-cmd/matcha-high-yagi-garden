from __future__ import annotations

import unittest

from app import _invoice_candidate_rank, _needs_enhanced_invoice_pass


class InvoiceStrategyTests(unittest.TestCase):
    def test_good_original_skips_second_pass(self) -> None:
        candidate = {
            "structured_invoice": {
                "confidence_score": 98,
                "vendor": "京都やましろ農業協同組合",
                "suggested_invoice_date": "2026/7/28",
                "subtotal_yen": 965310,
                "tax_yen": 96531,
                "total_yen": 1061841,
                "items": [
                    {
                        "description": "加工料 生葉",
                        "line_total_yen": 919600,
                        "needs_review": False,
                    }
                ],
                "warnings": [],
            }
        }
        self.assertFalse(_needs_enhanced_invoice_pass(candidate))

    def test_weak_original_requests_enhanced_pass(self) -> None:
        candidate = {
            "structured_invoice": {
                "confidence_score": 64,
                "vendor": "株式会社テスト",
                "total_yen": 5500,
                "items": [],
                "warnings": [],
            }
        }
        self.assertTrue(_needs_enhanced_invoice_pass(candidate))

    def test_rank_prefers_more_complete_candidate(self) -> None:
        original = {
            "structured_invoice": {
                "confidence_score": 84,
                "vendor": "株式会社テスト",
                "suggested_invoice_date": "2026/9/1",
                "subtotal_yen": None,
                "tax_yen": None,
                "total_yen": 5500,
                "items": [],
                "warnings": [],
            }
        }
        enhanced = {
            "structured_invoice": {
                "confidence_score": 92,
                "vendor": "株式会社テスト",
                "suggested_invoice_date": "2026/9/1",
                "subtotal_yen": 5000,
                "tax_yen": 500,
                "total_yen": 5500,
                "items": [
                    {
                        "description": "資材",
                        "line_total_yen": 5000,
                        "needs_review": False,
                    }
                ],
                "warnings": [],
            }
        }
        self.assertGreater(
            _invoice_candidate_rank(enhanced),
            _invoice_candidate_rank(original),
        )


if __name__ == "__main__":
    unittest.main()
