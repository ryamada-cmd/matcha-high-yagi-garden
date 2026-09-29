from __future__ import annotations

import unittest

import pymupdf

from app import _load_pages


class PdfRenderTests(unittest.TestCase):
    def test_pdf_page_renders(self) -> None:
        doc = pymupdf.open()
        page = doc.new_page(width=595, height=842)
        page.insert_text((72, 72), "Invoice test")
        pdf_bytes = doc.tobytes()
        doc.close()

        pages = _load_pages(pdf_bytes, "test.pdf", "application/pdf")
        self.assertEqual(len(pages), 1)
        self.assertGreater(pages[0].width, 0)
        self.assertGreater(pages[0].height, 0)


if __name__ == "__main__":
    unittest.main()
