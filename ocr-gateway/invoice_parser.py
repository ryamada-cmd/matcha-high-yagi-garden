from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from typing import Any

_CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"

_REPLACEMENTS = {
    "請求期問": "請求期間",
    "お買上げ紙": "お買上げ額",
    "容最": "容量",
    "容景": "容量",
    "単佰": "単価",
    "伝裳日付": "伝票日付",
    "伝祟No.": "伝票No.",
    "小汁": "小計",
    "小3": "小計",
    "經態我高": "繰越残高",
    "枳越張高": "繰越残高",
    "登效番号": "登録番号",
    "益效番号": "登録番号",
}

_SUMMARY_ALIASES = {
    "subtotal": ["お買上げ額", "お買い上げ額", "小計"],
    "tax": ["消費税"],
    "total": ["今回請求金額", "今回御請求額", "今回ご請求額", "請求金額", "合計"],
}


def normalize_text(value: str) -> str:
    text = value or ""
    sentinels: dict[str, str] = {}
    for index, mark in enumerate(_CIRCLED):
        token = f"__CIRCLED_{index}__"
        sentinels[token] = mark
        text = text.replace(mark, token)

    text = unicodedata.normalize("NFKC", text)

    for token, mark in sentinels.items():
        text = text.replace(token, mark)

    for source, target in _REPLACEMENTS.items():
        text = text.replace(source, target)

    return text


def parse_money(value: str | None) -> int | None:
    if value is None:
        return None

    raw = (
        normalize_text(value)
        .replace(",", "")
        .replace("，", "")
        .replace("円", "")
        .replace("¥", "")
        .replace("￥", "")
        .strip()
    )
    if not re.fullmatch(r"\d+(?:\.\d+)?", raw):
        return None

    if "." in raw:
        whole, fraction = raw.split(".", 1)
        # Common OCR error in Japanese invoices: 49,400 -> 49.400
        if len(fraction) == 3:
            return int(whole) * 1000 + int(fraction)

    return int(round(float(raw)))


def _split_markdown_cells(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def _parse_markdown_tables(text: str) -> list[tuple[list[str], list[list[str]]]]:
    lines = text.splitlines()
    tables: list[tuple[list[str], list[list[str]]]] = []
    index = 0

    while index < len(lines) - 1:
        current = lines[index]
        next_line = lines[index + 1]
        if (
            current.lstrip().startswith("|")
            and next_line.lstrip().startswith("|")
            and re.search(r"---", next_line)
        ):
            header = [normalize_text(cell) for cell in _split_markdown_cells(current)]
            rows: list[list[str]] = []
            index += 2
            while index < len(lines) and lines[index].lstrip().startswith("|"):
                rows.append(_split_markdown_cells(lines[index]))
                index += 1
            tables.append((header, rows))
            continue

        index += 1

    return tables


def _parse_summary(
    text: str,
    tables: list[tuple[list[str], list[list[str]]]],
) -> dict[str, int | None]:
    summary: dict[str, int | None] = {
        "subtotal": None,
        "tax": None,
        "total": None,
    }

    for header, rows in tables:
        matches: list[tuple[int, str]] = []
        for column_index, cell in enumerate(header):
            for key, aliases in _SUMMARY_ALIASES.items():
                if any(alias in cell for alias in aliases):
                    matches.append((column_index, key))
                    break

        if len(matches) >= 2 and rows:
            values = rows[0]
            for column_index, key in matches:
                if column_index >= len(values):
                    continue
                parsed = parse_money(values[column_index])
                if parsed is not None:
                    summary[key] = parsed

    if all(summary[key] is not None for key in summary):
        return summary

    # docOCR sometimes outputs summary labels vertically and then the amounts vertically.
    # Only inspect the plain-text prefix before the first markdown table.
    prefix = text.split("|", 1)[0]
    plain_lines = [
        normalize_text(line.strip())
        for line in prefix.splitlines()
        if line.strip()
    ]

    positions: list[tuple[int, str]] = []
    for key, aliases in _SUMMARY_ALIASES.items():
        position = max(
            (
                index
                for index, line in enumerate(plain_lines)
                if any(alias in line for alias in aliases)
            ),
            default=-1,
        )
        positions.append((position, key))

    valid_positions = [position for position, _ in positions if position >= 0]
    if len(valid_positions) >= 2:
        last_label_position = max(valid_positions)
        amounts = [
            parsed
            for parsed in (
                parse_money(line)
                for line in plain_lines[last_label_position + 1 :]
            )
            if parsed is not None
        ]
        if len(amounts) >= 3:
            summary["subtotal"], summary["tax"], summary["total"] = amounts[-3:]

    return summary


def _clean_description(value: str) -> str:
    text = normalize_text(value).strip()
    text = re.sub(
        r"^20\d{2}/\d{1,2}/\d{1,2}\s*\d{5,}\s*",
        "",
        text,
    )
    text = re.sub(r"^\d{5,}\s*", "", text)
    return text.strip()


def _looks_like_description(value: str) -> bool:
    text = normalize_text(value).strip()
    if not text:
        return False
    if re.fullmatch(r"[\d,./\s-]+", text):
        return False
    if re.search(r"振込|振込み|消費税|合計|小計", text):
        return False
    return bool(re.search(r"[ぁ-んァ-ヶ一-龯A-Za-z]", text))


def _suggest_category(description: str) -> str:
    if re.search(
        r"農薬|乳剤|水和|フロアブル|プロアブル|\bSE|顆粒|ダニ|殺虫|殺菌",
        description,
        re.IGNORECASE,
    ):
        return "PESTICIDE"
    if re.search(r"肥料|化成|堆肥|窒素|リン酸|加里", description):
        return "FERTILIZER"
    return "OTHER"


def _find_vendor(text: str) -> str:
    for raw_line in text.splitlines():
        line = normalize_text(raw_line.strip())
        if not line:
            continue
        if "リバーサイド" in line:
            continue
        if re.search(r"銀行|農業協同組合", line):
            continue
        if re.search(r"株式会社|有限会社|合同会社|商店|商会|農園|茶園", line):
            return line
    return ""


def _find_billing_period(text: str) -> dict[str, str]:
    match = re.search(
        r"請求期間\s*(20\d{2}/\d{1,2}/\d{1,2})\s*[~〜～\-]\s*"
        r"(20\d{2}/\d{1,2}/\d{1,2})",
        text,
    )
    if not match:
        return {"start": "", "end": ""}
    return {"start": match.group(1), "end": match.group(2)}


def parse_invoice_dococr(text: str) -> dict[str, Any]:
    normalized = normalize_text(text)
    tables = _parse_markdown_tables(normalized)
    summary = _parse_summary(normalized, tables)

    detail_table = next(
        (
            (header, rows)
            for header, rows in tables
            if any("商品名" in cell for cell in header)
            and any("金額" in cell for cell in header)
        ),
        None,
    )

    items: list[dict[str, Any]] = []

    if detail_table:
        header, rows = detail_table

        def column_index(name: str) -> int | None:
            return next(
                (index for index, cell in enumerate(header) if name in cell),
                None,
            )

        indexes = {
            key: column_index(key)
            for key in ["商品名", "容量", "数量", "単位", "単価", "金額"]
        }
        description_index = indexes["商品名"]

        for row in rows:
            def cell(key: str) -> str:
                index = indexes[key]
                if index is None or index >= len(row):
                    return ""
                return row[index]

            description = _clean_description(cell("商品名"))

            # docOCR may shift a description one column left/right on a damaged row.
            if not description and description_index is not None:
                candidates: list[tuple[int, int, str]] = []
                skipped_indexes = {
                    index
                    for key in ["容量", "数量", "単価", "金額"]
                    if (index := indexes[key]) is not None
                }
                for index, value in enumerate(row):
                    if index in skipped_indexes:
                        continue
                    if _looks_like_description(value):
                        candidates.append(
                            (abs(index - description_index), index, value)
                        )
                if candidates:
                    description = _clean_description(sorted(candidates)[0][2])

            if not description:
                continue
            if re.search(
                r"振込|振込み|伝票消費税|小計|消費税|合計",
                description,
            ):
                continue

            quantity = parse_money(cell("数量"))
            unit_price = parse_money(cell("単価"))
            line_total = parse_money(cell("金額"))

            if not unit_price and not line_total:
                continue

            item = {
                "description": description,
                "capacity": normalize_text(cell("容量")),
                "quantity": quantity,
                "unit": normalize_text(cell("単位")),
                "unit_price_yen": unit_price,
                "line_total_yen": line_total,
                "suggested_category": _suggest_category(description),
                "corrections": [],
                "needs_review": False,
            }

            # Recover a missing quantity when amount / unit price is essentially an integer.
            if quantity is None and unit_price and line_total:
                ratio = line_total / unit_price
                candidate = round(ratio)
                if candidate >= 1 and abs(ratio - candidate) <= 0.02:
                    item["quantity"] = candidate
                    item["corrections"].append(
                        "quantity_inferred_from_amount_div_unit_price"
                    )

            items.append(item)

    subtotal = summary["subtotal"]

    # Repair a likely OCR-corrupted unit price when a nearly identical product/capacity
    # appears elsewhere and the current line amount equals that known unit price.
    for index, item in enumerate(items):
        if (
            item["quantity"] is not None
            or not item["line_total_yen"]
            or not item["unit_price_yen"]
        ):
            continue

        for other_index, other in enumerate(items):
            if index == other_index or not other["unit_price_yen"]:
                continue

            similarity = SequenceMatcher(
                None,
                item["description"],
                other["description"],
            ).ratio()
            same_capacity = bool(
                item["capacity"]
                and item["capacity"] == other["capacity"]
            )

            if (
                similarity >= 0.78
                and same_capacity
                and item["line_total_yen"] == other["unit_price_yen"]
            ):
                old_price = item["unit_price_yen"]
                item["unit_price_yen"] = other["unit_price_yen"]
                item["quantity"] = 1
                item["corrections"].append(
                    "unit_price_corrected_"
                    f"from_{old_price}_to_{other['unit_price_yen']}_"
                    "using_matching_item"
                )
                break

    # If the line amounts miss the document subtotal, repair only when exactly one
    # candidate is mathematically determined by subtotal and its unit price.
    if subtotal and items:
        current_total = sum(item["line_total_yen"] or 0 for item in items)

        if current_total != subtotal:
            candidates: list[tuple[int, int, int]] = []
            for index, item in enumerate(items):
                unit_price = item["unit_price_yen"]
                if not unit_price:
                    continue

                other_total = sum(
                    other["line_total_yen"] or 0
                    for other_index, other in enumerate(items)
                    if other_index != index
                )
                residual = subtotal - other_total
                if residual <= 0:
                    continue

                ratio = residual / unit_price
                candidate_quantity = round(ratio)
                if (
                    candidate_quantity >= 1
                    and abs(ratio - candidate_quantity) <= 0.02
                ):
                    candidates.append(
                        (index, residual, candidate_quantity)
                    )

            if len(candidates) == 1:
                item_index, corrected_total, corrected_quantity = candidates[0]
                item = items[item_index]
                old_total = item["line_total_yen"]

                if old_total != corrected_total:
                    item["line_total_yen"] = corrected_total
                    item["quantity"] = corrected_quantity
                    item["corrections"].append(
                        "line_total_corrected_"
                        f"from_{old_total}_to_{corrected_total}_using_subtotal"
                    )

    for item in items:
        quantity = item["quantity"]
        unit_price = item["unit_price_yen"]
        line_total = item["line_total_yen"]
        if (
            quantity is None
            or not unit_price
            or not line_total
            or quantity * unit_price != line_total
        ):
            item["needs_review"] = True

    warnings: list[str] = []

    if all(summary[key] is not None for key in summary):
        if summary["subtotal"] + summary["tax"] != summary["total"]:
            warnings.append("summary_mismatch")

    if subtotal is not None and items:
        item_total = sum(item["line_total_yen"] or 0 for item in items)
        if item_total != subtotal:
            warnings.append(
                f"item_sum_mismatch:{item_total}!={subtotal}"
            )

    if any(item["needs_review"] for item in items):
        warnings.append("one_or_more_items_need_review")

    period = _find_billing_period(normalized)

    return {
        "vendor": _find_vendor(normalized),
        "billing_period": period,
        "suggested_invoice_date": period["end"],
        "invoice_date_source": (
            "billing_period_end" if period["end"] else ""
        ),
        "subtotal_yen": summary["subtotal"],
        "tax_yen": summary["tax"],
        "total_yen": summary["total"],
        "items": items,
        "warnings": warnings,
        "is_consistent": not warnings,
    }
