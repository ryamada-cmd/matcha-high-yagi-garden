from __future__ import annotations

import unittest

from invoice_parser import parse_invoice_dococr


AUGUST = r"""
請求書

古川末三郎商店

合同会社リバーサイド中

請求期問 2026/8/1～2026/8/25

|  | 入金額 |  | お買上げ紙 | 消費税 | 今回請求金額 |
| --- | --- | --- | --- | --- | --- |
| 834,119 | 834,119 |  | 71,740 | 7,174 | 78,914 |

| 伝裳日付 | 伝票No. | 商品名 | 容最 | 数量 | 単位 | 単佰 | 金額 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026/8/3 |  | 16223振込み |  |  |  |  | 834,119 |
|  |  | 2026/8/10 114902832 ダブルフェースプロアブル③ | 250ml |  |  | 5,180 | 25,900 |
|  |  | エクシレルSE③ | 500ml |  |  | 9,850 | 19,700 |
|  |  | スコア顆粒水和500③ | 500g | 2 |  | 5,430 | 10,860 |
|  | 2026/8/221149023853スコブ顆粒水和500 |  | 500g |  |  | 5,130 | 5,430 |
|  |  | エクシレルSE | 500ml |  |  | 9,850 | 9,850 |
"""

SEPTEMBER = r"""
請求書

古川末三郎商店

合同会社リバーサイド中

請求期問 2026/9/1～2026/9/28

前回繰越

入金額

經態我高

お買上げ紙

消費税

今回請求金額

78,914

78,914

49,400

4,940

54,340

| 伝裳日付 | 伝祟No. | 商品名 | 容最 | 数量 | 単位 | 単価 | 金額 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026/9/4 |  | 16337振込み |  |  |  |  | 78,914 |
|  |  | 2026/9/15 114902833 ダニゲッターフロアブル④ | 250ml |  |  | 4,600 | 23,000 |
|  |  | （劇）ハチハチ乳剤 500ml | 500ml |  |  | 5,280 | 26,100 |
|  |  | 伝票消費税 |  |  |  |  | 1,940 |
|  | 小汁 |  |  |  |  |  | 49.400 |
|  |  | 消費税 |  |  |  |  | 4,940 |
|  |  | 合計 |  | 10 |  |  | 54,340 |
"""


class InvoiceParserTests(unittest.TestCase):
    def test_august_invoice(self) -> None:
        parsed = parse_invoice_dococr(AUGUST)

        self.assertEqual(parsed["vendor"], "古川末三郎商店")
        self.assertEqual(parsed["subtotal_yen"], 71740)
        self.assertEqual(parsed["tax_yen"], 7174)
        self.assertEqual(parsed["total_yen"], 78914)
        self.assertEqual(parsed["suggested_invoice_date"], "2026/8/25")
        self.assertEqual(
            [item["quantity"] for item in parsed["items"]],
            [5, 2, 2, 1, 1],
        )
        self.assertEqual(
            [item["line_total_yen"] for item in parsed["items"]],
            [25900, 19700, 10860, 5430, 9850],
        )
        self.assertEqual(parsed["warnings"], [])
        self.assertTrue(parsed["is_consistent"])

    def test_september_invoice(self) -> None:
        parsed = parse_invoice_dococr(SEPTEMBER)

        self.assertEqual(parsed["vendor"], "古川末三郎商店")
        self.assertEqual(parsed["subtotal_yen"], 49400)
        self.assertEqual(parsed["tax_yen"], 4940)
        self.assertEqual(parsed["total_yen"], 54340)
        self.assertEqual(parsed["suggested_invoice_date"], "2026/9/28")
        self.assertEqual(
            [item["quantity"] for item in parsed["items"]],
            [5, 5],
        )
        self.assertEqual(
            [item["line_total_yen"] for item in parsed["items"]],
            [23000, 26400],
        )
        self.assertIn(
            "line_total_corrected_from_26100_to_26400_using_subtotal",
            parsed["items"][1]["corrections"],
        )
        self.assertEqual(parsed["warnings"], [])
        self.assertTrue(parsed["is_consistent"])


if __name__ == "__main__":
    unittest.main()
