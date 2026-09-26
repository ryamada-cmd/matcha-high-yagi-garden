# 2026 Inventory Reconciliation

Reviewed and imported: 2026-09-27

Source:
- 八木茶園 総合在庫管理表（最新）.xlsx のコピー.xlsx
- Exact Google Drive source verified before import.

## Normalization rules used

The spreadsheet contains historical helper IDs that became inconsistent over time. In particular, T001-T004 are reused for different product names in the sales sheet. The app import therefore treats the actual product name, source lot, date, quantity and unit price as authoritative instead of the legacy product ID.

S006, S007 and S008 appear in 加工記録 but do not exist as 加工在庫. Their quantities exactly match direct shipments. They were therefore interpreted as inventory-decrement helper rows rather than real manufacturing:
- S006 -> 上林春松本店 / やぶきた碾茶 109 kg
- S007 -> 上林春松本店 / おくみどり碾茶 87.1 kg
- S008 -> 杉本番茶 / やぶきた番茶 1,536 kg

Actual matcha manufacturing was normalized by combining the source rows:
- S002 + S003: やぶきた 24 kg -> 抹茶 21.86 kg
- S004 + S005: おくみどり 24.8 kg -> 抹茶 22.0 kg

This avoids impossible row-level yields such as 9 kg -> 10 kg while preserving the spreadsheet's combined input/output totals.

## First-flush raw inventory

Current app balance after manufacturing and direct tencha sales:

- 碾茶 葉（やぶきた）: 106.3 kg
- 碾茶 骨（やぶきた）: 21.3 kg
- 碾茶 葉（おくみどり）: 68.3 kg
- 碾茶 骨（おくみどり）: 16.3 kg

The former auto-generated PRIMARY_PROCESSING leaf lots were archived because they duplicated the detailed TEA_INVENTORY lots.

## Bulk inventory

- 抹茶バルク（やぶきた）: 10.74 kg
- 抹茶バルク（おくみどり）: 12.10 kg
- 玉露バルク（やぶきた）: 1.05 kg

Gyokuro normalization:
- Source R048: 105 kg
- Output: 21 kg
- The source sheet records processing on 2026-05-20 but the source lot is harvested/received on 2026-05-26.
- The app uses 2026-05-26 as the processing date and preserves the original conflicting date in the note.

## Product stock

Product IDs from the spreadsheet are not used. App SKUs are name-stable.

- MATCHA HIGH やぶきた 30g缶: 136 units
- MATCHA HIGH おくみどり 30g缶: 232 units
- MATCHA HIGH やぶきた 1kg アルミ袋: 5 units
- 玉露 50g袋: 207 units

The spreadsheet's 製品在庫 values differ because T001-T004 are reused for different products. For example, T004 is used both for a matcha 1 kg product and hojicha sales, which causes the spreadsheet to show a negative matcha 1 kg stock.

## Bancha

- 番茶（やぶきた）: 0 kg
- 番茶（おくみどり）: 2,646 kg

The yabu-kita bancha shipment to 杉本番茶 is recorded as:
- 1,536 kg inventory out
- JPY 346,080 total sales
- Original spreadsheet expresses it as one sale lot; the app records kg quantities so inventory remains auditable.

## Imported sales

Imported active sales records: 81

Included:
- 30 g matcha retail / wholesale / EC / sample history
- Gyokuro 50 g sales / sample history
- 上林春松本店 tencha wholesale
- 杉本番茶 bancha wholesale

Current imported sales amount: JPY 5,715,580

## Items intentionally not imported yet

### Hojicha

The sales sheet contains:
- ほうじ茶 200g袋: 50 units, JPY 54,000
- ほうじ茶 1kg袋: 1 unit, JPY 3,780

However, this workbook does not contain a corresponding raw-stock / manufacturing / packaging source chain for those products. Import is intentionally deferred rather than inventing stock.

### Sales accounting difference: sample rows

The spreadsheet's P&L only sums channels:
- 小売
- 卸
- EC

It excludes サンプル rows even when a non-zero unit price is entered.

Four sample rows contain non-zero prices, totaling JPY 12,920. The app currently preserves those entered prices as sales amounts. Decide later whether:
1. paid samples should count as revenue, or
2. all サンプル rows should be zero-revenue for P&L purposes.

This is why app sales totals should not yet be expected to equal the spreadsheet P&L exactly until the sample-accounting rule and hojicha source inventory are resolved.

## UI update

Harvest/processing UI now reads:
- JA lot number
- variety
- leaf output
- stem output
- total processing yield

Schema migration 0053 preserves these fields for imported historical data.
