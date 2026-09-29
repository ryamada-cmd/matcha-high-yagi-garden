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


SIMPLE_PROCESSING = r"""
--- PAGE 1 ---
令和8年8月10日

請求書

山岡清一

〒 610-0241
京都府綴喜郡宇治田原町南亥子78
合同会社リバーサイド様
TEL/FAX 0774-88-3687

御請求金額
30,000

| 日付品目 | | 数量世自 | | 金額 |
| --- | --- | --- | --- | --- |
| 2026/5/25 | 茶加工賃 | 21 | 1,300 | 27,300 |
| [振込先] JA京都やましろ 宇治田原町支店 | | 小計 | | 27,300 |
| | 総合口座 3613263 | 消費税 | | 2,730 |
| | 山岡清一(やまおか せいいち) | 値引き | | 30 |
| | | 合計 | | 30,000 |
"""

JA_PROCESSING = r"""
請求書

八木茶園 御中

発行日 2026年7月28日
請求番号 0000121
登録番号 T8130005008786

京都やましろ農業協同組合
京田辺支店 支店長 瀬川 善香
〒610-0331
住所: 京都府京田辺市田辺鳥本1-2
電話: 0774-62-1177

ご請求金額(税込) ¥1,061,841

| 日付 | 内容 | 軽減税率 | 数量 | 単位 | 単価 | 税率 | 金額 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | 田辺碾茶工場 加工料 | | | | | | |
| | 加工料 生葉 | | 2,299 | kg | 400 | 10% | 919,600 |
| | 梱包荷造料 仕上茶 | | 457.1 | kg | 100 | 10% | 45,710 |
| | | | | | | 小計 | 965,310 |
| | | | | | | 消費税10% | 96,531 |
| | | | | | | 合計 | 1,061,841 |

振込先 京都銀行 田辺支店 普通預金 5563
京都やましろ農業協同組合 京田辺支店
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



    def test_simple_processing_invoice_with_discount_and_person_vendor(self) -> None:
        parsed = parse_invoice_dococr(SIMPLE_PROCESSING)

        self.assertEqual(parsed["vendor"], "山岡清一")
        self.assertEqual(parsed["suggested_invoice_date"], "2026/8/10")
        self.assertEqual(parsed["invoice_date_source"], "document_header")
        self.assertEqual(parsed["subtotal_yen"], 27300)
        self.assertEqual(parsed["tax_yen"], 2730)
        self.assertEqual(parsed["discount_yen"], 30)
        self.assertEqual(parsed["total_yen"], 30000)
        self.assertEqual(len(parsed["items"]), 1)
        self.assertEqual(parsed["items"][0]["description"], "茶加工賃")
        self.assertEqual(parsed["items"][0]["quantity"], 21)
        self.assertEqual(parsed["items"][0]["unit_price_yen"], 1300)
        self.assertEqual(parsed["items"][0]["line_total_yen"], 27300)
        self.assertEqual(parsed["warnings"], [])
        self.assertEqual(parsed["confidence_score"], 98)

    def test_ja_processing_invoice_with_decimal_quantity(self) -> None:
        parsed = parse_invoice_dococr(JA_PROCESSING)

        self.assertEqual(parsed["vendor"], "京都やましろ農業協同組合")
        self.assertEqual(parsed["suggested_invoice_date"], "2026/7/28")
        self.assertEqual(parsed["invoice_date_source"], "explicit_invoice_date")
        self.assertEqual(parsed["subtotal_yen"], 965310)
        self.assertEqual(parsed["tax_yen"], 96531)
        self.assertEqual(parsed["discount_yen"], 0)
        self.assertEqual(parsed["total_yen"], 1061841)
        self.assertEqual(len(parsed["items"]), 2)
        self.assertEqual(
            [item["description"] for item in parsed["items"]],
            ["加工料 生葉", "梱包荷造料 仕上茶"],
        )
        self.assertEqual(
            [item["quantity"] for item in parsed["items"]],
            [2299, 457.1],
        )
        self.assertEqual(
            [item["unit_price_yen"] for item in parsed["items"]],
            [400, 100],
        )
        self.assertEqual(
            [item["line_total_yen"] for item in parsed["items"]],
            [919600, 45710],
        )
        self.assertEqual(parsed["warnings"], [])
        self.assertEqual(parsed["confidence_score"], 98)

if __name__ == "__main__":
    unittest.main()
