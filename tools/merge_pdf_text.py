#!/usr/bin/env python3
"""把主規則書 PDF 的文字接到 Drive 匯出文字的後面。

Drive 的文字匯出在【魔法】千面相 之後就被截斷。這支程式從 PDF 中千面相之後的
第一個能力開始，依版面縮排還原清單層級、把 PDF 的硬換行接回段落，整理成與
Drive 匯出相同的「一段一行」格式後接上。

用法:
    python3 tools/merge_pdf_text.py 規則書-1.pdf 規則書-2.pdf   # 可給多個分割檔，依頁序排列
    (需要 poppler 的 pdftotext；也可以直接給 `pdftotext -layout -fixed 5` 抽好的文字檔)
"""
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'tools/source/core-rulebook.txt'
CUT_AFTER = '【魔法】千面相(2000DP)'   # Drive 匯出的最後一個能力
TERMINAL = tuple('。！？：:；」』)）]】.')
PUA_TOP = ''        # 原書當作「選項標題」的私有區清單符號
BULLET = re.compile(r'^([•◦▪○●■‣→➔➢➤-])\s*(.*)$')
HEADER = re.compile(r'^【\s*(通用|武力|靈敏|魔法|特殊|敏捷)\s*】.{1,40}?[(（]\s*\d+')
SECTION_TITLES = ('通用類能力', '武力類能力', '靈敏類能力', '魔法類能力', '特殊類能力')


def width(s):
    return sum(2 if unicodedata.east_asian_width(c) in 'WF' else 1 for c in s)


def normalise_layout(text):
    """從 `pdftotext -layout -fixed 5` 的文字依縮排還原清單層級與段落。

    - 欄位從頁面左緣起算，跨頁一致；清單符號的縮排決定層級，輸出 • ◦ ▪ ‣ 代表第 1–4 層；
    - 清單項目內縮排較深的行屬於該項目：前一行滿版就接回，否則以「¶N」另起段落；
    - 一般段落首行內縮、續行不內縮；
    - 前一句已結束、這一行很短又沒有標點時，視為小標題。
    """
    rows = []   # (縮排, 內容, 結尾欄位)
    for raw in text.replace('\f', '\n').split('\n'):
        if raw.strip():
            ind = len(raw) - len(raw.lstrip(' '))
            body = raw.strip()
            rows.append((ind, body, ind + width(body)))
    # 每個能力區塊最寬的一行，用來判斷「滿版」
    block_max, cur = [], []
    for _, body, end in rows:
        if HEADER.match(body) or body in SECTION_TITLES:
            block_max.extend([max(cur, default=0)] * len(cur))
            cur = []
            block_max.append(0)
        else:
            cur.append(end)
    block_max.extend([max(cur, default=0)] * len(cur))

    out, stack, unit = [], [], None   # stack: [(清單符號縮排, 符號)]

    def flush():
        nonlocal unit
        if unit:
            out.append(unit['prefix'] + unit['text'])
            unit = None

    for (ind, body, end), top in zip(rows, block_max):
        if HEADER.match(body) or body in SECTION_TITLES:
            flush()
            stack = []
            unit = {'prefix': '', 'text': body, 'end': end, 'ind': ind, 'level': 0, 'header': True}
            continue
        if unit and unit.get('header'):
            t = unit['text']
            if t.count('(') + t.count('（') > t.count(')') + t.count('）'):   # 標題括號未閉合
                unit['text'] += body
                continue

        def heading_after(u):
            return u['text'].endswith(('。', '：', ':')) and end < top * 0.6 and not body.endswith(TERMINAL)

        def cont_of(u):
            # 前一行滿版就是換行；沒有句末標點且接近滿版也算(行尾英文單字提早換行)
            if heading_after(u):
                return False
            return u['end'] >= top - 10 or (not u['text'].endswith(TERMINAL) and u['end'] >= top - 25)

        m = BULLET.match(body)
        if m:
            glyph, rest = m.group(1), m.group(2)
            g_ind = ind
            # 同一種特殊清單符號、縮排只差一點：視為同一層(原書偶有縮排不一致)
            snap = [i for i, (gi, gg) in enumerate(stack) if gg == glyph and glyph != '•' and abs(gi - g_ind) <= 4]
            if snap:
                del stack[snap[-1] + 1:]
                g_ind = stack[-1][0]
            while stack and stack[-1][0] > g_ind + 1:
                stack.pop()
            if stack and abs(stack[-1][0] - g_ind) <= 1:
                stack[-1] = (g_ind, glyph)
            else:
                stack.append((g_ind, glyph))
            flush()
            level = min(len(stack), 4)
            marker = '◆ ' if (glyph in PUA_TOP and level == 1) else '•◦▪‣'[level - 1] + ' '
            unit = {'prefix': marker, 'text': rest, 'end': end, 'ind': g_ind, 'level': level}
            continue

        while stack and ind <= stack[-1][0]:
            stack.pop()
        level = min(len(stack), 4)
        if unit and not unit.get('header') and unit['level'] == level:
            cont = cont_of(unit)
            if level == 0 and unit['prefix'] == '':
                if ind < unit['ind']:
                    cont = True       # 段落續行(首行內縮)
                elif ind > unit['ind']:
                    cont = False      # 新的內縮段落
            if heading_after(unit):
                cont = False
            if cont:
                unit['text'] += body
                unit['end'] = end
                continue
        flush()
        unit = {'prefix': ('¶%d ' % level) if level else '', 'text': body, 'end': end, 'ind': ind, 'level': level}
    flush()
    return out


def read_parts(parts):
    """接受 PDF(自動以 pdftotext -layout -fixed 5 抽字)或已抽好的同格式文字檔。"""
    texts = []
    for p in parts:
        if p.lower().endswith('.pdf'):
            # -fixed 讓欄位從頁面左緣起算；預設的 -layout 會逐頁去掉左邊界，跨頁縮排就對不上
            texts.append(subprocess.run(['pdftotext', '-layout', '-fixed', '5', p, '-'], check=True,
                                        capture_output=True, text=True).stdout)
        else:
            texts.append(Path(p).read_text(encoding='utf-8'))
    return '\f'.join(texts)


def main(parts):
    pdf = read_parts(parts)
    start = pdf.index(CUT_AFTER)
    nxt = re.compile(r'^\s*' + HEADER.pattern[1:], re.M).search(pdf, start + len(CUT_AFTER))
    tail = normalise_layout(pdf[nxt.start():])

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
