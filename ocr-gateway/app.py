from __future__ import annotations

import hashlib
import hmac
import io
import os
import time
from typing import Any, Literal

import cv2
import pymupdf
import numpy as np
import requests
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from PIL import Image, ImageOps

from invoice_parser import parse_invoice_dococr
from iphone_discovery import IOSOCRLocator

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except Exception:
    pass

load_dotenv()

IOS_OCR_CONFIGURED_URL = os.getenv("IOS_OCR_BASE_URL", "http://192.168.1.50:8000").rstrip("/")
GATEWAY_API_KEY = os.getenv("GATEWAY_API_KEY", "").strip()
IOS_TIMEOUT_SECONDS = float(os.getenv("IOS_TIMEOUT_SECONDS", "90"))
IOS_OCR_AUTO_DISCOVERY = os.getenv("IOS_OCR_AUTO_DISCOVERY", "true").strip().lower() not in {"0", "false", "no", "off"}
IOS_OCR_DISCOVERY_TIMEOUT_SECONDS = float(os.getenv("IOS_OCR_DISCOVERY_TIMEOUT_SECONDS", "0.35"))
IOS_OCR_DISCOVERY_COOLDOWN_SECONDS = float(os.getenv("IOS_OCR_DISCOVERY_COOLDOWN_SECONDS", "20"))
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "25"))
MAX_PDF_PAGES = int(os.getenv("MAX_PDF_PAGES", "5"))
MAX_IMAGE_DIMENSION = int(os.getenv("MAX_IMAGE_DIMENSION", "3400"))

iphone_locator = IOSOCRLocator(
    IOS_OCR_CONFIGURED_URL,
    auto_discovery=IOS_OCR_AUTO_DISCOVERY,
    discovery_timeout=IOS_OCR_DISCOVERY_TIMEOUT_SECONDS,
    cooldown_seconds=IOS_OCR_DISCOVERY_COOLDOWN_SECONDS,
)

app = FastAPI(
    title="Yagi Garden OCR Gateway",
    version="0.2.0",
    description="Windows gateway between Yagi Garden Manager and iOS-OCR-Server.",
)


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    if not GATEWAY_API_KEY:
        return
    if not x_api_key or not hmac.compare_digest(x_api_key, GATEWAY_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid API key")


def _limit_image(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image).convert("RGB")
    longest = max(image.size)
    if longest > MAX_IMAGE_DIMENSION:
        scale = MAX_IMAGE_DIMENSION / longest
        image = image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.Resampling.LANCZOS,
        )
    return image


def _enhance_document(image: Image.Image) -> Image.Image:
    image = _limit_image(image)
    rgb = np.array(image)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)

    # Local contrast works well on slightly dim phone photos without forcing hard binarization.
    clahe = cv2.createCLAHE(clipLimit=1.8, tileGridSize=(8, 8))
    contrast = clahe.apply(gray)

    # Mild unsharp mask: enough to clarify small Japanese glyphs, avoiding halo artifacts.
    blur = cv2.GaussianBlur(contrast, (0, 0), sigmaX=1.0)
    sharpened = cv2.addWeighted(contrast, 1.35, blur, -0.35, 0)
    return Image.fromarray(cv2.cvtColor(sharpened, cv2.COLOR_GRAY2RGB))


def _jpeg_bytes(image: Image.Image) -> bytes:
    out = io.BytesIO()
    _limit_image(image).save(out, format="JPEG", quality=95, optimize=True, subsampling=0)
    return out.getvalue()


def _load_pages(data: bytes, filename: str, content_type: str | None) -> list[Image.Image]:
    is_pdf = content_type == "application/pdf" or filename.lower().endswith(".pdf")
    if is_pdf:
        try:
            doc = pymupdf.open(stream=data, filetype="pdf")
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"PDFを開けませんでした: {exc}") from exc

        if doc.page_count < 1:
            raise HTTPException(status_code=400, detail="PDFにページがありません")

        pages: list[Image.Image] = []
        for index in range(min(doc.page_count, MAX_PDF_PAGES)):
            page = doc.load_page(index)
            max_points = max(page.rect.width, page.rect.height)
            scale_300dpi = 300 / 72
            scale_to_cap = MAX_IMAGE_DIMENSION / max(1, max_points)
            scale = min(scale_300dpi, scale_to_cap)
            pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
            image = Image.open(io.BytesIO(pix.tobytes("png")))
            pages.append(_limit_image(image))
        doc.close()
        return pages

    try:
        image = Image.open(io.BytesIO(data))
        return [_limit_image(image)]
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="画像を開けませんでした。JPEG/PNG/WebP/HEIC/HEIF/PDFを使用してください。",
        ) from exc


def _post_ios(
    base_url: str,
    image_bytes: bytes,
    endpoint: Literal["upload", "docOCR"],
    page_index: int,
) -> requests.Response:
    return requests.post(
        f"{base_url.rstrip('/')}/{endpoint}",
        headers={"Accept": "application/json"},
        files={"file": (f"page-{page_index + 1}.jpg", image_bytes, "image/jpeg")},
        timeout=IOS_TIMEOUT_SECONDS,
    )


def _call_ios(image_bytes: bytes, endpoint: Literal["upload", "docOCR"], page_index: int) -> dict[str, Any]:
    base_url, _ = iphone_locator.resolve()
    started = time.perf_counter()
    try:
        response = _post_ios(base_url, image_bytes, endpoint, page_index)
    except requests.RequestException as first_exc:
        retry_url, discovered_now = iphone_locator.resolve(force_discovery=True)
        if retry_url != base_url or discovered_now:
            try:
                response = _post_ios(retry_url, image_bytes, endpoint, page_index)
                base_url = retry_url
            except requests.RequestException as retry_exc:
                raise HTTPException(
                    status_code=502,
                    detail=f"iPhone OCR Serverへ接続できません: {retry_exc}",
                ) from retry_exc
        else:
            raise HTTPException(
                status_code=502,
                detail=f"iPhone OCR Serverへ接続できません: {first_exc}",
            ) from first_exc

    elapsed_ms = round((time.perf_counter() - started) * 1000)
    try:
        payload = response.json()
    except ValueError:
        payload = {"raw_response": response.text[:1000]}

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "iPhone OCR Serverがエラーを返しました",
                "status": response.status_code,
                "response": payload,
            },
        )

    text = payload.get("ocr_result") if endpoint == "upload" else payload.get("ocr_text")
    return {
        "endpoint": endpoint,
        "iphone_url": base_url,
        "elapsed_ms": elapsed_ms,
        "text": str(text or ""),
        "image_width": payload.get("image_width"),
        "image_height": payload.get("image_height"),
        "ocr_boxes": payload.get("ocr_boxes", []) if endpoint == "upload" else [],
        "raw": payload,
    }


def _ocr_pages(
    pages: list[Image.Image],
    endpoint: Literal["upload", "docOCR"],
    preprocessing: Literal["original", "enhanced"],
) -> dict[str, Any]:
    started = time.perf_counter()
    results = []
    for page_index, page in enumerate(pages):
        selected = page if preprocessing == "original" else _enhance_document(page)
        result = _call_ios(_jpeg_bytes(selected), endpoint, page_index)
        result["page"] = page_index + 1
        results.append(result)

    combined = "\n\n".join(
        f"--- PAGE {item['page']} ---\n{item['text']}".strip() for item in results
    ).strip()
    payload = {
        "endpoint": endpoint,
        "preprocessing": preprocessing,
        "pages": results,
        "combined_text": combined,
        "elapsed_ms": round((time.perf_counter() - started) * 1000),
    }

    if endpoint == "docOCR":
        try:
            payload["structured_invoice"] = parse_invoice_dococr(combined)
            payload["parser_error"] = None
        except Exception as exc:
            payload["structured_invoice"] = None
            payload["parser_error"] = {
                "type": type(exc).__name__,
                "message": str(exc),
            }

    return payload


@app.get("/", dependencies=[Depends(require_api_key)])
def root() -> dict[str, Any]:
    discovery = iphone_locator.status()
    return {
        "service": "Yagi Garden OCR Gateway",
        "version": "0.2.0",
        "iphone": discovery.current_url,
        "iphone_configured_url": discovery.configured_url,
        "iphone_auto_discovery": discovery.auto_discovery,
        "docs": "/docs",
    }


@app.get("/health", dependencies=[Depends(require_api_key)])
def health() -> dict[str, Any]:
    iphone_reachable = False
    iphone_status: int | None = None
    error = ""
    started = time.perf_counter()
    base_url, discovered_now = iphone_locator.resolve()
    try:
        response = requests.get(base_url, timeout=3)
        iphone_status = response.status_code
        iphone_reachable = response.status_code < 500
    except requests.RequestException as exc:
        error = str(exc)

    discovery = iphone_locator.status()
    return {
        "ok": True,
        "iphone_reachable": iphone_reachable,
        "iphone_status": iphone_status,
        "iphone_url": discovery.current_url,
        "iphone_configured_url": discovery.configured_url,
        "iphone_auto_discovery": discovery.auto_discovery,
        "iphone_discovered": discovery.discovered,
        "iphone_discovered_now": discovered_now,
        "probe_ms": round((time.perf_counter() - started) * 1000),
        "error": error or discovery.last_error,
    }


@app.post("/ocr", dependencies=[Depends(require_api_key)])
async def ocr(
    file: UploadFile = File(...),
    mode: Literal["upload", "docOCR"] = Query("upload"),
    preprocessing: Literal["original", "enhanced"] = Query("original"),
) -> dict[str, Any]:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="空のファイルです")
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"最大{MAX_UPLOAD_MB}MBまでです")

    pages = _load_pages(data, file.filename or "document", file.content_type)
    result = _ocr_pages(pages, mode, preprocessing)
    return {
        "success": True,
        "filename": file.filename,
        "sha256": hashlib.sha256(data).hexdigest(),
        "page_count": len(pages),
        **result,
    }


@app.post("/invoice", dependencies=[Depends(require_api_key)])
async def invoice(file: UploadFile = File(...)) -> dict[str, Any]:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="空のファイルです")
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"最大{MAX_UPLOAD_MB}MBまでです")

    pages = _load_pages(data, file.filename or "document", file.content_type)

    doc_error: Any = None
    try:
        result = _ocr_pages(pages, "docOCR", "original")
        result["success"] = True
        result["selected_engine"] = "IOS_DOCOCR"
        return {
            "success": True,
            "filename": file.filename,
            "sha256": hashlib.sha256(data).hexdigest(),
            "page_count": len(pages),
            **result,
        }
    except HTTPException as exc:
        doc_error = exc.detail

    # Keep a deterministic fallback for iPhones/OS versions where docOCR is unavailable.
    fallback = _ocr_pages(pages, "upload", "original")
    fallback["success"] = True
    fallback["selected_engine"] = "IOS_UPLOAD"
    fallback["structured_invoice"] = None
    fallback["requires_existing_parser"] = True
    fallback["fallback_reason"] = doc_error

    return {
        "success": True,
        "filename": file.filename,
        "sha256": hashlib.sha256(data).hexdigest(),
        "page_count": len(pages),
        **fallback,
    }


@app.post("/compare", dependencies=[Depends(require_api_key)])
async def compare(file: UploadFile = File(...)) -> dict[str, Any]:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="空のファイルです")
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"最大{MAX_UPLOAD_MB}MBまでです")

    pages = _load_pages(data, file.filename or "document", file.content_type)

    candidates: list[dict[str, Any]] = []
    plans: list[tuple[Literal["upload", "docOCR"], Literal["original", "enhanced"]]] = [
        ("upload", "original"),
        ("upload", "enhanced"),
        ("docOCR", "original"),
    ]

    for endpoint, preprocessing in plans:
        try:
            candidate = _ocr_pages(pages, endpoint, preprocessing)
            candidate["success"] = True
        except HTTPException as exc:
            candidate = {
                "endpoint": endpoint,
                "preprocessing": preprocessing,
                "success": False,
                "error": exc.detail,
                "pages": [],
                "combined_text": "",
            }
        candidates.append(candidate)

    return {
        "success": True,
        "filename": file.filename,
        "sha256": hashlib.sha256(data).hexdigest(),
        "page_count": len(pages),
        "iphone_url": iphone_locator.status().current_url,
        "candidates": candidates,
    }
