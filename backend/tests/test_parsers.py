"""Document Parser tests (หัวข้อ 40: Document Parser Test, Unsafe Filename, Invalid File Type)."""
import pytest

from app.core.errors import AppError
from app.services.engine.analysis import candidate_statements
from app.services.engine.parsers import decode_text, parse_document, sniff_type
from app.services.engine.text import blocks_to_sections, chunk_sections, normalize_text
from app.services.storage import LocalStorage, safe_filename
from tests.conftest import REPO

S = REPO / "samples"


def _secs(name):
    data = (S / name).read_bytes()
    r = parse_document(data, name.rsplit(".", 1)[1])
    return r, blocks_to_sections(r["blocks"], name)


def test_docx_paragraph_heading_table_image():
    r, secs = _secs("sample.docx")
    assert any(s["kind"] == "table" for s in secs)
    assert secs[0]["title"].startswith("1. Rule 7")
    assert len(r["images"]) == 1 and r["images"][0]["status"] == "NEEDS_VISUAL_REVIEW"
    assert secs[0]["image_ids"] == [r["images"][0]["id"]]
    assert sum(len(candidate_statements(s)) for s in secs) >= 3


def test_xlsx_sheet_and_comments():
    r, secs = _secs("sample.xlsx")
    assert secs[0]["title"].startswith("Worksheet: Requirements")
    assert candidate_statements(secs[0])


def test_csv_encoding_delimiter():
    r, secs = _secs("sample.csv")
    assert 'Delimiter: ","' in r["warnings"]
    assert secs[0]["kind"] == "table"


def test_pdf_pages_and_header_footer_removed():
    r, secs = _secs("sample.pdf")
    assert r["page_count"] == 3
    assert [s["page"] for s in secs] == [1, 2, 3]
    assert any("Header/Footer" in w for w in r["warnings"])


def test_corrupt_pdf():
    with pytest.raises(AppError) as e:
        parse_document((S / "bad.pdf").read_bytes(), "pdf")
    assert e.value.code in ("CORRUPT_FILE", "PDF_NO_TEXT")


def test_txt_encodings():
    th = "ระบบต้องแสดงยอด"
    assert decode_text(th.encode("utf-8"))[1] == "UTF-8"
    assert decode_text(b"\xef\xbb\xbf" + th.encode())[1] == "UTF-8 (BOM)"
    assert decode_text(th.encode("cp874"))[0] == th
    assert decode_text(b"\xff\xfe" + th.encode("utf-16-le"))[0] == th


def test_unsupported_and_sniff():
    with pytest.raises(AppError) as e:
        parse_document(b"x", "exe")
    assert e.value.code == "UNSUPPORTED_FILE"
    assert not sniff_type(b"MZ\x90\x00", "docx")
    assert not sniff_type(b"%PDF-1.4", "txt")
    assert sniff_type((S / "sample.pdf").read_bytes(), "pdf")


def test_safe_filename_and_traversal(tmp_path):
    assert safe_filename("../../etc/passwd") == "passwd"
    assert safe_filename("..\\..\\win.ini") == "win.ini"
    assert safe_filename('a<b>:"c|?*.docx') == "a_b___c___.docx"
    assert safe_filename("CON.txt") == "_CON.txt"
    st = LocalStorage(tmp_path)
    with pytest.raises(AppError) as e:
        st.write_bytes("../outside.txt", b"x")
    assert e.value.code == "PATH_TRAVERSAL"


def test_normalize_thai_and_chunk_never_splits_rows():
    assert normalize_text("กํา  ​ข") == "กำ ข"
    rows = [["h1", "h2"]] + [[str(i), "x"] for i in range(100)]
    parts = chunk_sections([{"id": "t", "seq": 1, "title": "T", "kind": "table", "rows": rows, "text": "", "original_text": ""}])
    assert len(parts) == 3 and all(p["rows"][0] == ["h1", "h2"] for p in parts)
    assert sum(len(p["rows"]) - 1 for p in parts) == 100
    long = "\n".join(f"บรรทัด {i} ระบบต้องแสดงผล" for i in range(800))
    tparts = chunk_sections([{"id": "x", "seq": 1, "title": "L", "kind": "text", "text": long, "original_text": long}])
    assert len(tparts) > 1 and tparts[1]["overlap"] is True
