#!/usr/bin/env python3
"""把 pdftotext 從主規則書 PDF 抽出的文字接到 Drive 匯出文字的後面。

Drive 的文字匯出在【魔法】千面相 之後就被截斷。這支程式從 PDF 文字中
千面相 之後的第一個能力開始，把 PDF 的硬換行接回段落、把單獨一行的清單
符號併到下一行，整理成與 Drive 匯出相同的「一段一行」格式後接上。

用法:
    pdftotext 規則書.pdf part.txt   # 可給多個分割檔，依頁序排列
    python3 tools/merge_pdf_text.py part1.txt part2.txt
"""
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'tools/source/core-rulebook.txt'
CUT_AFTER = '【魔法】千面相(2000DP)'   # Drive 匯出的最後一個能力
WRAP_WIDTH = 80                        # PDF 版面一行約 90–100 個半形寬
TERMINAL = tuple('。！？：:；」』)）]】.')
BULLETS = set('•◦○▪') | {chr(c) for c in range(0xE000, 0xF900)}
HEADER = re.compile(r'^【\s*(通用|武力|靈敏|魔法|特殊|敏捷)\s*】.{1,40}?[(（]\s*\d+')


def width(s):
    return sum(2 if unicodedata.east_asian_width(c) in 'WF' else 1 for c in s)


def normalise(text):
    out, last_w, pending = [], 0, None
    for raw in text.replace('\f', '\n').split('\n'):
        line = raw.strip()
        if not line:
            continue
        if line in BULLETS:            # 清單符號自成一行，接到下一行文字前
            pending = line
            last_w = 0
            continue
        if pending:
            out.append(pending + ' ' + line)
            pending = None
        elif (out and last_w >= WRAP_WIDTH and not out[-1].endswith(TERMINAL)
              and not HEADER.match(line) and line[0] not in BULLETS):
            out[-1] += line            # PDF 硬換行，接回上一段
        else:
            out.append(line)
        last_w = width(raw.rstrip())
    return out


def main(parts):
    pdf = '\n'.join(Path(p).read_text(encoding='utf-8') for p in parts).replace('\f', '\n')
    start = pdf.index(CUT_AFTER)
    nxt = re.compile(HEADER.pattern, re.M).search(pdf, start + len(CUT_AFTER))
    tail = normalise(pdf[nxt.start():])

    base = SOURCE.read_text(encoding='utf-8').split('\n')
    idx = next(i for i, l in enumerate(base) if l.strip() == CUT_AFTER)
    j = idx + 1                       # 保留 千面相 的本文，去掉之後的殘留
    while j < len(base) and not base[j].startswith('[#') and not HEADER.match(base[j]):
        j += 1
    merged = base[:j] + tail
    SOURCE.write_text('\n'.join(merged).rstrip() + '\n', encoding='utf-8')
    print(f'保留 Drive 文字 {j} 行，接上 PDF 文字 {len(tail)} 行 → {SOURCE.relative_to(ROOT)}')


if __name__ == '__main__':
    main(sys.argv[1:])
