from __future__ import annotations

import sys
from types import SimpleNamespace

import pytest

from app.services.documents.parser import DocumentParseError, ParsedDocument, parse_document


def test_pdf_text_keeps_page_metadata(tmp_path):
    fitz = pytest.importorskip("fitz")
    path = tmp_path / "lesson.pdf"
    document = fitz.open()
    document.new_page().insert_text((72, 72), "First page has enough searchable text")
    document.new_page().insert_text((72, 72), "Second page has more searchable text")
    document.save(path)
    document.close()
    parsed = parse_document(path)
    assert isinstance(parsed, ParsedDocument)
    assert [block.page_number for block in parsed.blocks] == [1, 2]
    assert "First page" in parsed and "Second page" in parsed


def test_blank_pdf_without_ocr_has_actionable_error(tmp_path, monkeypatch):
    fitz = pytest.importorskip("fitz")
    path = tmp_path / "scan.pdf"
    document = fitz.open(); document.new_page(); document.save(path); document.close()
    monkeypatch.setattr("app.services.documents.parser.get_settings", lambda: SimpleNamespace(pdf_text_min_chars=20, ocr_enabled=False))
    with pytest.raises(DocumentParseError, match="未检测到可提取文本.*未启用 OCR"):
        parse_document(path)


def test_blank_pdf_uses_ocr_when_enabled(tmp_path, monkeypatch):
    fitz = pytest.importorskip("fitz")
    path = tmp_path / "scan.pdf"
    document = fitz.open(); document.new_page(); document.save(path); document.close()
    monkeypatch.setattr("app.services.documents.parser.get_settings", lambda: SimpleNamespace(pdf_text_min_chars=20, ocr_enabled=True, ocr_language="chi_sim+eng"))
    monkeypatch.setitem(sys.modules, "pytesseract", SimpleNamespace(image_to_string=lambda image, lang: "OCR 识别文本"))
    assert "OCR 识别文本" in parse_document(path)


def test_docx_extracts_heading_paragraph_and_table(tmp_path):
    docx = pytest.importorskip("docx")
    path = tmp_path / "lesson.docx"
    document = docx.Document()
    document.add_heading("课程目标", level=1)
    document.add_paragraph("理解向量检索")
    table = document.add_table(rows=1, cols=2)
    table.cell(0, 0).text, table.cell(0, 1).text = "知识点", "向量检索"
    document.save(path)
    parsed = parse_document(path)
    assert parsed.blocks[1].heading_path == ["课程目标"]
    assert any(block.block_type == "table" for block in parsed.blocks)


def test_pptx_extracts_slide_metadata(tmp_path):
    pptx = pytest.importorskip("pptx")
    path = tmp_path / "slides.pptx"
    presentation = pptx.Presentation()
    presentation.slides.add_slide(presentation.slide_layouts[1]).shapes.title.text = "第一页标题"
    presentation.slides.add_slide(presentation.slide_layouts[1]).shapes.title.text = "第二页标题"
    presentation.save(path)
    parsed = parse_document(path)
    assert {block.slide_number for block in parsed.blocks} == {1, 2}


def test_xlsx_extracts_sheet_metadata(tmp_path):
    openpyxl = pytest.importorskip("openpyxl")
    path = tmp_path / "book.xlsx"
    workbook = openpyxl.Workbook()
    workbook.active.title = "课程"; workbook.active.append(["名称", "人工智能"])
    workbook.create_sheet("章节").append(["第一章", "检索增强"])
    workbook.save(path)
    parsed = parse_document(path)
    assert {block.sheet_name for block in parsed.blocks} == {"课程", "章节"}


def test_csv_gb18030_and_unsupported_format(tmp_path):
    csv_path = tmp_path / "课程.csv"
    csv_path.write_bytes("课程,教师\n人工智能,张老师".encode("gb18030"))
    assert "人工智能 | 张老师" in parse_document(csv_path)
    unsupported = tmp_path / "archive.zip"; unsupported.write_bytes(b"PK")
    with pytest.raises(DocumentParseError, match="不支持"):
        parse_document(unsupported)
