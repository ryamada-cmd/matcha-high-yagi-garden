from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare iOS-OCR-Server modes through the local Windows gateway.")
    parser.add_argument("file", help="Invoice/receipt image or PDF")
    parser.add_argument("--gateway", default="http://127.0.0.1:8787", help="Gateway base URL")
    args = parser.parse_args()

    path = Path(args.file).expanduser().resolve()
    if not path.exists():
        raise SystemExit(f"File not found: {path}")

    headers = {"Accept": "application/json"}
    api_key = os.getenv("GATEWAY_API_KEY", "").strip()
    if api_key:
        headers["X-API-Key"] = api_key

    with path.open("rb") as f:
        response = requests.post(
            f"{args.gateway.rstrip('/')}/compare",
            headers=headers,
            files={"file": (path.name, f)},
            timeout=600,
        )

    if response.status_code != 200:
        print(response.text)
        raise SystemExit(response.status_code)

    data = response.json()
    out_dir = Path("results")
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / f"{path.stem}-ios-ocr-comparison.json"
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\nSaved: {out_path.resolve()}\n")
    for candidate in data.get("candidates", []):
        label = f"{candidate.get('endpoint')} / {candidate.get('preprocessing')}"
        print("=" * 72)
        print(label)
        print(f"success={candidate.get('success')} elapsed_ms={candidate.get('elapsed_ms', '-')}")
        if not candidate.get("success"):
            print("ERROR:", candidate.get("error"))
            continue
        text = candidate.get("combined_text", "")
        print(text[:3000])
        if len(text) > 3000:
            print("\n... (truncated on console; full result is in JSON)")

        parser_error = candidate.get("parser_error")
        if parser_error:
            print("\n--- PARSER ERROR ---")
            print(json.dumps(parser_error, ensure_ascii=False, indent=2))

        structured = candidate.get("structured_invoice")
        if structured:
            print("\n--- STRUCTURED INVOICE ---")
            print(json.dumps(structured, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
