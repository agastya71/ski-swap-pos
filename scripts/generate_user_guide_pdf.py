"""Render docs/user-guide.md to docs/user-guide.pdf using fpdf2.

Parses the small Markdown dialect used by the guide (H1/H2/H3 headings,
paragraphs, bullet lists, pipe tables, fenced code blocks, and horizontal
rules) and lays it out on A4 pages with page numbers. Run from anywhere:

    backend/.venv/bin/python scripts/generate_user_guide_pdf.py
"""

import re
import sys
from pathlib import Path

from fpdf import FPDF

MD_PATH = Path(__file__).resolve().parent.parent / "docs" / "user-guide.md"
PDF_PATH = Path(__file__).resolve().parent.parent / "docs" / "user-guide.pdf"

NAVY = (30, 58, 138)
SLATE = (71, 85, 105)
BLACK = (15, 23, 42)


class GuidePDF(FPDF):
    """FPDF with a page-number footer."""

    def footer(self):
        self.set_y(-14)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(148, 163, 184)
        self.cell(0, 8, f"Ski Swap POS - User Guide · page {self.page_no()}/{{nb}}", align="C")


def _safe(text: str) -> str:
    """Sanitise to Latin-1 for fpdf2 core fonts."""
    return text.encode("latin-1", errors="replace").decode("latin-1")


def _inline(text: str) -> str:
    """Strip inline Markdown emphasis from a line (the PDF keeps plain text)."""
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = text.replace("`", "")
    # Fold unicode punctuation into latin-1 equivalents for fpdf core fonts.
    for src_ch, dst_ch in [("\u2014", "-"), ("\u2019", "'"), ("\u201c", '"'), ("\u201d", '"')]:
        text = text.replace(src_ch, src_ch and src_ch.encode("utf-8").decode("latin-1", "replace") if False else src_ch)
    for a, b in [("\u2014", "-"), ("\u2019", "'"), ("\u201c", '"'), ("\u201d", '"')]:
        text = text.replace(a, b)
    return _safe(text)


def _table_cells(line: str) -> list[str]:
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    return [_inline(c) for c in cells]


def render(md_path: Path, pdf_path: Path) -> int:
    pdf = GuidePDF()
    pdf.alias_nb_pages()
    pdf.set_margins(18, 16, 18)
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    lines = md_path.read_text(encoding="utf-8").split("\n")
    in_code = False
    first_h1_seen = False

    def _h(text: str, size: int, color, space_before: float) -> None:
        if pdf.get_y() > 250:
            pdf.add_page()
        pdf.ln(space_before)
        pdf.set_font("Helvetica", "B", size)
        pdf.set_text_color(*NAVY)
        pdf.multi_cell(0, size * 0.55, _inline(text), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1.5)
        pdf.set_text_color(*BLACK)

    for line in lines:
        stripped = line.rstrip()

        if stripped.startswith("```"):
            if in_code:
                in_code = False
                pdf.ln(2)
            else:
                in_code = True
                if pdf.get_y() > 250:
                    pdf.add_page()
                pdf.set_font("Courier", "", 8)
                pdf.set_text_color(*SLATE)
            continue

        if in_code:
            pdf.set_x(pdf.l_margin + 4)
            pdf.cell(0, 3.4, _safe(stripped or " "))
            pdf.ln()
            continue

        if stripped.startswith("| ") or stripped.startswith("|-"):
            if stripped.startswith("|-"):
                continue  # separator row
            cells = _table_cells(stripped)
            pdf.set_font("Helvetica", "", 9)
            for text in cells:
                pdf.cell((190 - 12) / len(cells), 5.4, text, border=1)
            pdf.ln()
            continue

        if stripped == "---":
            pdf.ln(2)
            pdf.set_draw_color(203, 213, 225)
            pdf.line(pdf.l_margin, pdf.get_y(), 190 + pdf.l_margin, pdf.get_y())
            pdf.ln(3)
            continue

        if stripped.startswith("### "):
            _h(stripped[4:], 11, NAVY, 3)
            continue
        if stripped.startswith("## "):
            if pdf.get_y() > 240:
                pdf.add_page()
            _h(stripped[3:], 13, NAVY, 6)
            continue
        if stripped.startswith("# "):
            _h(stripped[2:], 19, NAVY, 2)
            continue

        if stripped.startswith("- "):
            pdf.set_font("Helvetica", "", 10)
            pdf.set_text_color(*BLACK)
            pdf.set_x(pdf.l_margin + 4)
            pdf.multi_cell(0, 4.6, "·  " + _inline(stripped[2:]), new_x="LMARGIN", new_y="NEXT")
            continue

        if stripped.startswith("* ") and stripped.endswith(".*"):
            pdf.ln(2)
            pdf.set_font("Helvetica", "I", 9)
            pdf.set_text_color(*SLATE)
            pdf.multi_cell(0, 4.5, _inline(stripped[2:]))
            pdf.set_text_color(*BLACK)
            continue

        if not stripped:
            pdf.ln(2.2)
            continue

        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(*BLACK)
        pdf.multi_cell(0, 5, _inline(stripped))
        pdf.ln(0.6)

    pdf.output(str(pdf_path))
    return pdf.page_no()


def main() -> None:
    md = Path(sys.argv[1]) if len(sys.argv) > 1 else MD_PATH
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else PDF_PATH
    pages_used = render(md, out)
    print(f"wrote {out} from {md}")


if __name__ == "__main__":
    main()