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
    "subtotal": ["お買上げ額", "お買い上げ額", "税抜合計", "小計"],
    "tax": ["消費税額", "消費税10%", "消費税10％", "消費税", "税額"],
    "discount": ["値引き", "値引", "割引"],
    "total": [
        "今回請求金額",
        "今回御請求額",
        "今回ご請求額",
        "ご請求金額(税込)",
        "ご請求金額（税込）",
        "ご請求金額",
        "請求金額",
        "税込合計",
        "総合計",
        "合計",
    ],
}

_COLUMN_ALIASES = {
    "description": ["商品名", "品名", "内容", "品目"],
    "capacity": ["容量", "規格"],
    "quantity": ["数量", "qty"],
    "unit": ["単位", "unit"],
    "unit_price": ["単価", "price"],
    "amount": ["金額", "amount"],
}

_ORGANIZATION_RE = re.compile(
    r"株式会社|有限会社|合同会社|合資会社|合名会社|"
    r"一般社団法人|一般財団法人|農業協同組合|"
    r"商店|商会|農園|茶園|製茶|工場"
)
_BANK_CONTEXT_RE = re.compile(
    r"振込先|振込み先|銀行|信用金庫|信用組合|普通預金|当座預金|口座|支店コード"
)
_RECIPIENT_RE = re.compile(r"(?:御中|様)\s*$")
_GENERIC_NAME_EXCLUSIONS = {
    "請求書",
    "御請求金額",
    "ご請求金額",
    "下記の通りご請求申し上げます",
    "下記の通り、ご請求申し上げます",
    "備考",
    "発行日",
    "請求番号",
    "登録番号",
    "住所",
    "電話",
    "携帯",
    "合計",
    "小計",
    "消費税",
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


def parse_number(value: str | None) -> int | float | None:
    if value is None:
        return None
    raw = (
        normalize_text(value)
        .replace(",", "")
        .replace("，", "")
        .replace("kg", "")
        .replace("KG", "")
        .replace("㎏", "")
        .strip()
    )
    if not re.fullmatch(r"\d+(?:\.\d+)?", raw):
        return None
    number = float(raw)
    if number.is_integer():
        return int(number)
    return number


def _money_values(value: str) -> list[int]:
    values: list[int] = []
    normalized = normalize_text(value)
    normalized = re.sub(r"\d+(?:\.\d+)?\s*%", " ", normalized)
    for match in re.finditer(r"(?:[¥￥]\s*)?(\d[\d,，]*(?:\.\d+)?)\s*(?:円)?", normalized):
        parsed = parse_money(match.group(1))
        if parsed is not None:
            values.append(parsed)
    return values


def _standalone_money(value: str) -> int | None:
    normalized = normalize_text(value).strip()
    normalized = normalized.rstrip("|").strip()
    normalized = re.sub(r"^[·•・●]\s*", "", normalized)
    if re.fullmatch(
        r"(?:[¥￥]\s*)?\d[\d,，]*(?:\.\d+)?\s*(?:円)?",
        normalized,
    ):
        return parse_money(normalized)
    return None


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
                rows.append([normalize_text(cell) for cell in _split_markdown_cells(lines[index])])
                index += 1
            tables.append((header, rows))
            continue

        index += 1

    return tables


def _alias_in(value: str, aliases: list[str]) -> bool:
    compact = normalize_text(value).replace(" ", "").lower()
    return any(
        alias.replace(" ", "").lower() in compact
        for alias in aliases
    )


def _parse_summary(
    text: str,
    tables: list[tuple[list[str], list[list[str]]]],
) -> dict[str, int | None]:
    summary: dict[str, int | None] = {
        "subtotal": None,
        "tax": None,
        "discount": None,
        "total": None,
    }

    # Layout 1: labels in the table header and amounts in the first data row.
    for header, rows in tables:
        matches: list[tuple[int, str]] = []
        for column_index, cell in enumerate(header):
            for key, aliases in _SUMMARY_ALIASES.items():
                if _alias_in(cell, aliases):
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

    # Layout 2: labels such as 小計 / 消費税 / 値引き / 合計 are rows at
    # the bottom-right of the same detail table.
    for _header, rows in tables:
        for row in rows:
            for cell_index, cell in enumerate(row):
                for key, aliases in _SUMMARY_ALIASES.items():
                    if not _alias_in(cell, aliases):
                        continue

                    right_values: list[int] = []
                    for candidate in row[cell_index + 1 :]:
                        parsed = parse_money(candidate)
                        if parsed is not None:
                            right_values.append(parsed)

                    if right_values:
                        summary[key] = right_values[-1]
                        continue

                    row_values = [
                        parsed
                        for parsed in (parse_money(candidate) for candidate in row)
                        if parsed is not None
                    ]
                    if row_values:
                        summary[key] = row_values[-1]

    # Layout 3: ordinary lines. This also handles a label on one line and the
    # amount on the next line (e.g. 御請求金額 -> 30,000).
    plain_lines = [
        normalize_text(line.strip())
        for line in text.splitlines()
        if line.strip() and not re.match(r"^\s*\|", line)
    ]

    for line_index, line in enumerate(plain_lines):
        for key, aliases in _SUMMARY_ALIASES.items():
            if not _alias_in(line, aliases):
                continue

            values = _money_values(line)
            if values:
                summary[key] = values[-1]
                continue

            if summary[key] is not None:
                continue

            for next_index in range(line_index + 1, min(len(plain_lines), line_index + 5)):
                next_line = plain_lines[next_index]
                if any(
                    _alias_in(next_line, other_aliases)
                    for other_aliases in _SUMMARY_ALIASES.values()
                ):
                    break
                amount = _standalone_money(next_line)
                if amount is not None:
                    summary[key] = amount
                    break

    # Legacy vertical summary layout: several labels first, then their amounts.
    positions: list[tuple[int, str]] = []
    for key in ("subtotal", "tax", "total"):
        aliases = _SUMMARY_ALIASES[key]
        position = max(
            (
                index
                for index, line in enumerate(plain_lines)
                if _alias_in(line, aliases)
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
            # Only fill values that were not already recovered more precisely.
            for key, value in zip(("subtotal", "tax", "total"), amounts[-3:]):
                if summary[key] is None:
                    summary[key] = value

    if summary["discount"] is None:
        summary["discount"] = 0

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
    if re.fullmatch(r"[\d,./\s\-]+", text):
        return False
    if re.search(r"振込|振込み|消費税|合計|小計|値引き|請求金額", text):
        return False
    if re.fullmatch(r"20\d{2}/\d{1,2}/\d{1,2}", text):
        return False
    return bool(re.search(r"[ぁ-んァ-ヶ一-龯A-Za-z]", text))


def _suggest_category(description: str, document_text: str = "") -> str:
    if re.search(
        r"農薬|乳剤|水和|フロアブル|プロアブル|\bSE|顆粒|ダニ|殺虫|殺菌",
        description,
        re.IGNORECASE,
    ):
        return "PESTICIDE"
    if re.search(r"肥料|化成|堆肥|窒素|リン酸|加里", description):
        return "FERTILIZER"
    if re.search(r"梱包|荷造|包材|包装", description):
        return "PACKAGING"
    if re.search(r"碾茶|てん茶", description) and re.search(r"加工|工賃|加工料", description):
        return "TENCHA_PROCESSING"
    if re.search(r"加工|工賃|加工料", description):
        if re.search(r"碾茶工場|てん茶工場", document_text):
            return "TENCHA_PROCESSING"
        return "OUTSOURCING"
    if re.search(r"生葉", description):
        return "FRESH_LEAF"
    return "OTHER"


def _normalize_domain_description(description: str, document_text: str = "") -> tuple[str, list[str]]:
    text = normalize_text(description).strip()
    corrections: list[str] = []
    tea_context = bool(
        re.search(
            r"茶園|製茶|碾茶|てん茶|抹茶|玉露|煎茶|ほうじ茶|番茶|生葉|荒茶|仕上茶",
            document_text,
        )
    )
    if tea_context:
        replacements = {
            "生菜": "生葉",
            "碾荼": "碾茶",
            "てん荼": "てん茶",
            "抹荼": "抹茶",
            "荒荼": "荒茶",
            "加工貸": "加工賃",
            "加工貨": "加工賃",
            "荷造科": "荷造料",
            "仕上荼": "仕上茶",
        }
        for source, target in replacements.items():
            if source in text:
                text = text.replace(source, target)
                corrections.append(f"domain_term:{source}->{target}")
    text = re.sub(r"\s+", " ", text).strip()
    return text, corrections


def _find_vendor(text: str) -> str:
    lines = [
        normalize_text(raw_line.strip())
        for raw_line in text.splitlines()
        if raw_line.strip() and not raw_line.lstrip().startswith("|")
    ]

    organization_candidates: list[tuple[int, str]] = []
    for index, line in enumerate(lines):
        if _RECIPIENT_RE.search(line):
            continue
        if "リバーサイド" in line:
            continue
        if _BANK_CONTEXT_RE.search(line):
            continue
        if not _ORGANIZATION_RE.search(line):
            continue
        if re.search(r"請求書|登録番号|請求番号", line):
            continue

        score = 20
        if index < 25:
            score += 5
        if len(line) <= 40:
            score += 2
        if re.fullmatch(r"[^\d]{3,40}", line):
            score += 2
        organization_candidates.append((score, line))

    if organization_candidates:
        return sorted(organization_candidates, key=lambda item: (-item[0], len(item[1])))[0][1]

    # Individual businesses often issue simple invoices under a person's name.
    # Prefer a short kanji-only name that is followed by address/contact details.
    individual_candidates: list[tuple[int, str]] = []
    for index, line in enumerate(lines):
        if line in _GENERIC_NAME_EXCLUSIONS:
            continue
        if _RECIPIENT_RE.search(line):
            continue
        if _BANK_CONTEXT_RE.search(line):
            continue
        if not re.fullmatch(r"[一-龯々〆ヶ]{2,8}", line):
            continue

        nearby = " ".join(lines[index + 1 : index + 5])
        score = 5
        if re.search(r"〒|住所|TEL|FAX|電話|携帯|\d{2,4}-\d{2,4}-\d{3,4}", nearby, re.IGNORECASE):
            score += 20
        if index < 20:
            score += 5
        individual_candidates.append((score, line))

    if individual_candidates:
        return sorted(individual_candidates, key=lambda item: -item[0])[0][1]

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


def _date_candidates(value: str) -> list[str]:
    line = normalize_text(value)
    found: list[str] = []

    for match in re.finditer(r"(20\d{2})\s*[年/.\-]\s*(\d{1,2})\s*[月/.\-]\s*(\d{1,2})\s*日?", line):
        found.append(f"{int(match.group(1))}/{int(match.group(2))}/{int(match.group(3))}")

    era_patterns = [
        ("令和", 2018),
        ("平成", 1988),
    ]
    for era, offset in era_patterns:
        for match in re.finditer(
            rf"{era}\s*(元|\d{{1,2}})\s*年\s*(\d{{1,2}})\s*月\s*(\d{{1,2}})\s*日",
            line,
        ):
            era_year = 1 if match.group(1) == "元" else int(match.group(1))
            found.append(
                f"{offset + era_year}/{int(match.group(2))}/{int(match.group(3))}"
            )

    return list(dict.fromkeys(found))


def _find_invoice_date(text: str, period: dict[str, str]) -> tuple[str, str]:
    lines = [
        normalize_text(line.strip())
        for line in text.splitlines()
        if line.strip() and not line.lstrip().startswith("|")
    ]

    for line in lines:
        if not re.search(r"発行日|請求日|作成日|invoice\s*date", line, re.IGNORECASE):
            continue
        dates = _date_candidates(line)
        if dates:
            return dates[0], "explicit_invoice_date"

    if period.get("end"):
        return period["end"], "billing_period_end"

    # For simple paper invoices the issue date is often printed in the header
    # without a label (e.g. 令和8年8月10日). Search only before the first table.
    prefix = normalize_text(text).split("|", 1)[0]
    for line in prefix.splitlines()[:25]:
        dates = _date_candidates(line)
        if dates:
            return dates[0], "document_header"

    return "", ""


def _find_column_index(header: list[str], aliases: list[str]) -> int | None:
    for index, cell in enumerate(header):
        if _alias_in(cell, aliases):
            return index
    return None


def _plain_description_lines(lines: list[str], quantity_index: int) -> list[str]:
    candidates: list[str] = []
    for index in range(quantity_index - 1, max(-1, quantity_index - 5), -1):
        line = normalize_text(lines[index]).strip()
        if not line:
            continue
        if _standalone_money(line) is not None:
            break
        if re.fullmatch(r"\d+(?:\.\d+)?\s*%", line):
            break
        if re.search(
            r"^(?:日付|内容|品目|商品名|数量|単位|単価|税率|金額|軽減税率|備考)$",
            line,
        ):
            break
        if re.search(r"小計|消費税|合計|値引|ご請求金額|御請求金額", line):
            break
        if _BANK_CONTEXT_RE.search(line):
            break
        if _looks_like_description(line):
            candidates.append(line)

    candidates.reverse()
    if (
        len(candidates) >= 3
        and re.search(r"工場|センター|加工所", candidates[0])
        and re.search(r"加工|工賃|加工料", candidates[0])
    ):
        candidates = candidates[1:]

    return candidates[-2:]


def _parse_plain_items(normalized: str) -> list[dict[str, Any]]:
    lines = [
        normalize_text(line.strip())
        for line in normalized.splitlines()
        if line.strip() and not line.lstrip().startswith("|")
    ]

    items: list[dict[str, Any]] = []
    quantity_pattern = re.compile(
        r"^(\d[\d,，]*(?:\.\d+)?)\s*(kg|KG|㎏|g|G|ml|mL|ML|l|L|本|袋|個|箱|式|枚|缶|ケース|反|俵|束|台|回|件)$"
    )

    for index, line in enumerate(lines):
        match = quantity_pattern.fullmatch(line)
        if not match:
            continue

        quantity = parse_number(match.group(1))
        unit = normalize_text(match.group(2))
        if quantity is None:
            continue

        unit_price: int | None = None
        line_total: int | None = None

        for next_index in range(index + 1, min(len(lines), index + 6)):
            next_line = lines[next_index]
            if re.fullmatch(r"\d+(?:\.\d+)?\s*%", next_line):
                continue
            amount = _standalone_money(next_line)
            if amount is None:
                if _looks_like_description(next_line):
                    break
                continue
            if unit_price is None:
                unit_price = amount
            elif line_total is None:
                line_total = amount
                break

        if unit_price is None or line_total is None:
            continue

        if abs(float(quantity) * unit_price - line_total) > 1.0:
            continue

        description_parts = _plain_description_lines(lines, index)
        if not description_parts:
            continue
        description = " ".join(description_parts)
        description, domain_corrections = _normalize_domain_description(
            description,
            normalized,
        )

        items.append(
            {
                "description": description,
                "capacity": "",
                "quantity": quantity,
                "unit": unit,
                "unit_price_yen": unit_price,
                "line_total_yen": line_total,
                "suggested_category": _suggest_category(description, normalized),
                "corrections": domain_corrections,
                "needs_review": False,
            }
        )

    return items


def _item_from_row(
    row: list[str],
    indexes: dict[str, int | None],
    document_text: str,
) -> dict[str, Any] | None:
    row_text = " ".join(normalize_text(value) for value in row)
    if any(
        _alias_in(row_text, aliases)
        for aliases in _SUMMARY_ALIASES.values()
    ):
        return None
    if _BANK_CONTEXT_RE.search(row_text):
        return None

    def cell(key: str) -> str:
        index = indexes.get(key)
        if index is None or index >= len(row):
            return ""
        return row[index]

    description_index = indexes.get("description")
    description = _clean_description(cell("description"))
    if not _looks_like_description(description):
        description = ""

    skipped_indexes = {
        index
        for key in ("capacity", "quantity", "unit_price", "amount")
        if (index := indexes.get(key)) is not None
    }

    if not description:
        candidates: list[tuple[int, int, str]] = []
        for index, value in enumerate(row):
            if index in skipped_indexes:
                continue
            if not _looks_like_description(value):
                continue
            distance = abs(index - description_index) if description_index is not None else index
            candidates.append((distance, index, value))
        if candidates:
            description = _clean_description(sorted(candidates)[0][2])

    if not description:
        return None

    description, domain_corrections = _normalize_domain_description(
        description,
        document_text,
    )

    if re.search(
        r"振込|振込み|伝票消費税|小計|消費税|合計|値引き|請求金額",
        description,
    ):
        return None

    quantity = parse_number(cell("quantity"))
    unit_price = parse_money(cell("unit_price"))
    line_total = parse_money(cell("amount"))

    numeric_cells: list[tuple[int, int]] = []
    for index, value in enumerate(row):
        parsed = parse_money(value)
        if parsed is not None:
            numeric_cells.append((index, parsed))

    amount_index = indexes.get("amount")
    quantity_index = indexes.get("quantity")
    unit_price_index = indexes.get("unit_price")

    if line_total is None and numeric_cells:
        # The right-most money-like cell is normally the row amount.
        amount_index, line_total = numeric_cells[-1]

    if unit_price is None and line_total is not None:
        before_amount = [
            (index, value)
            for index, value in numeric_cells
            if (amount_index is None or index < amount_index)
            and index != quantity_index
        ]
        if before_amount:
            unit_price_index, unit_price = before_amount[-1]

    if quantity is None and unit_price_index is not None:
        quantity_candidates = [
            (index, parse_number(row[index]))
            for index in range(0, unit_price_index)
            if index < len(row)
        ]
        quantity_candidates = [
            (index, value)
            for index, value in quantity_candidates
            if value is not None and index != amount_index
        ]
        if quantity_candidates:
            quantity_index, quantity = quantity_candidates[-1]

    if not unit_price and not line_total:
        return None

    item = {
        "description": description,
        "capacity": normalize_text(cell("capacity")),
        "quantity": quantity,
        "unit": normalize_text(cell("unit")),
        "unit_price_yen": unit_price,
        "line_total_yen": line_total,
        "suggested_category": _suggest_category(description, document_text),
        "corrections": domain_corrections,
        "needs_review": False,
    }

    if quantity is None and unit_price and line_total:
        ratio = line_total / unit_price
        candidate = round(ratio)
        if candidate >= 1 and abs(ratio - candidate) <= 0.02:
            item["quantity"] = candidate
            item["corrections"].append(
                "quantity_inferred_from_amount_div_unit_price"
            )

    return item


def _parse_items(
    normalized: str,
    tables: list[tuple[list[str], list[list[str]]]],
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []

    for header, rows in tables:
        indexes = {
            key: _find_column_index(header, aliases)
            for key, aliases in _COLUMN_ALIASES.items()
        }

        has_description_header = indexes["description"] is not None
        has_amount_header = indexes["amount"] is not None
        if not (has_description_header or has_amount_header):
            # Allow a badly damaged header only when a row itself clearly looks
            # like an item row: description + at least two numeric cells.
            looks_item_like = False
            for row in rows:
                text_cells = [cell for cell in row if _looks_like_description(cell)]
                numeric_count = sum(parse_money(cell) is not None for cell in row)
                if text_cells and numeric_count >= 2:
                    looks_item_like = True
                    break
            if not looks_item_like:
                continue

        for row in rows:
            item = _item_from_row(row, indexes, normalized)
            if item is not None:
                items.append(item)

    if not items:
        items.extend(_parse_plain_items(normalized))

    # Deduplicate exact rows if docOCR emitted the same table twice.
    deduped: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    for item in items:
        key = (
            item["description"],
            item["quantity"],
            item["unit_price_yen"],
            item["line_total_yen"],
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    return deduped


def _amount_matches(quantity: int | float, unit_price: int, line_total: int) -> bool:
    return abs(float(quantity) * unit_price - line_total) <= 1.0


def _derive_summary(
    summary: dict[str, int | None],
    items: list[dict[str, Any]],
) -> list[str]:
    derived: list[str] = []
    discount = summary.get("discount") or 0

    valid_items = bool(items) and all(
        not item.get("needs_review")
        and (item.get("line_total_yen") or 0) > 0
        for item in items
    )
    if summary.get("subtotal") is None and valid_items:
        item_total = sum(int(item["line_total_yen"]) for item in items)
        if item_total > 0:
            summary["subtotal"] = item_total
            derived.append("subtotal_from_item_sum")

    subtotal = summary.get("subtotal")
    tax = summary.get("tax")
    total = summary.get("total")

    if total is None and subtotal is not None and tax is not None:
        candidate = subtotal + tax - discount
        if candidate >= 0:
            summary["total"] = candidate
            total = candidate
            derived.append("total_from_subtotal_tax_discount")

    if subtotal is None and total is not None and tax is not None:
        candidate = total + discount - tax
        if candidate >= 0:
            summary["subtotal"] = candidate
            subtotal = candidate
            derived.append("subtotal_from_total_tax_discount")

    if tax is None and subtotal is not None and total is not None and subtotal > 0:
        candidate = total + discount - subtotal
        rate = candidate / subtotal * 100 if candidate >= 0 else -1
        if candidate > 0 and (
            abs(rate - 10) <= 0.6
            or abs(rate - 8) <= 0.6
        ):
            summary["tax"] = candidate
            derived.append("tax_from_total_subtotal_discount")

    return derived


def _quality_flags(
    vendor: str,
    invoice_date: str,
    summary: dict[str, int | None],
    items: list[dict[str, Any]],
    warnings: list[str],
    derived_fields: list[str],
) -> list[str]:
    flags: list[str] = []
    if not vendor:
        flags.append("missing_vendor")
    if not invoice_date:
        flags.append("missing_invoice_date")
    if summary.get("total") is None:
        flags.append("missing_total")
    if summary.get("subtotal") is None:
        flags.append("missing_subtotal")
    if not items:
        flags.append("missing_items")
    if any(item.get("needs_review") for item in items):
        flags.append("item_math_needs_review")
    flags.extend(f"derived:{value}" for value in derived_fields)
    flags.extend(f"warning:{value}" for value in warnings)
    return list(dict.fromkeys(flags))


def _confidence_score(
    vendor: str,
    invoice_date: str,
    summary: dict[str, int | None],
    items: list[dict[str, Any]],
    warnings: list[str],
    derived_fields: list[str],
) -> int:
    score = 0
    if vendor:
        score += 18
    if invoice_date:
        score += 14
    if summary["total"] is not None:
        score += 20
    if summary["subtotal"] is not None:
        score += 10
    if summary["tax"] is not None:
        score += 6
    if items:
        score += 22
        if all(not item.get("needs_review") for item in items):
            score += 5
    if not warnings:
        score += 3

    score -= min(12, len(derived_fields) * 4)
    if any("summary_mismatch" in warning for warning in warnings):
        score -= 20
    if any("item_sum_mismatch" in warning for warning in warnings):
        score -= 15
    if any("need_review" in warning for warning in warnings):
        score -= 10

    return max(0, min(98, score))


def parse_invoice_dococr(text: str) -> dict[str, Any]:
    normalized = normalize_text(text)
    tables = _parse_markdown_tables(normalized)
    summary = _parse_summary(normalized, tables)
    items = _parse_items(normalized, tables)

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
            or not _amount_matches(quantity, unit_price, line_total)
        ):
            item["needs_review"] = True

    derived_fields = _derive_summary(summary, items)
    warnings: list[str] = []

    subtotal_value = summary["subtotal"]
    tax_value = summary["tax"]
    discount_value = summary["discount"] or 0
    total_value = summary["total"]

    if subtotal_value is not None and tax_value is not None and total_value is not None:
        if subtotal_value + tax_value - discount_value != total_value:
            warnings.append("summary_mismatch")

    if subtotal_value is not None and items:
        item_total = sum(item["line_total_yen"] or 0 for item in items)
        if item_total != subtotal_value:
            warnings.append(
                f"item_sum_mismatch:{item_total}!={subtotal_value}"
            )

    if any(item["needs_review"] for item in items):
        warnings.append("one_or_more_items_need_review")

    period = _find_billing_period(normalized)
    invoice_date, invoice_date_source = _find_invoice_date(normalized, period)
    vendor = _find_vendor(normalized)

    quality_flags = _quality_flags(
        vendor,
        invoice_date,
        summary,
        items,
        warnings,
        derived_fields,
    )

    return {
        "parser_version": "v3",
        "vendor": vendor,
        "billing_period": period,
        "suggested_invoice_date": invoice_date,
        "invoice_date_source": invoice_date_source,
        "subtotal_yen": summary["subtotal"],
        "tax_yen": summary["tax"],
        "discount_yen": summary["discount"],
        "total_yen": summary["total"],
        "items": items,
        "derived_fields": derived_fields,
        "quality_flags": quality_flags,
        "warnings": warnings,
        "is_consistent": not warnings,
        "confidence_score": _confidence_score(
            vendor,
            invoice_date,
            summary,
            items,
            warnings,
            derived_fields,
        ),
    }
