#!/usr/bin/env python3
"""把《深淵的探索者》主規則書的文字匯出解析成維基用的資料檔 data/core.js。

用法:
    python3 tools/build_data.py [tools/source/core-rulebook.txt] [data/core.js]

來源文字是 PDF 透過 Google Drive 匯出的純文字(已去除 Markdown 跳脫符號與空行)。
補上「特殊類能力」章節後，只要把文字貼進來源檔重新執行即可。
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'tools/source/core-rulebook.txt'
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'data/core.js'

BRANCHES = ['通用', '武力', '靈敏', '魔法', '特殊']
SECTION_TITLES = [b + '類能力' for b in BRANCHES]

# 規則書內的明顯筆誤：先決條件引用名稱 -> 實際能力名稱
REF_ALIASES = {
    '靈動步伐': '靈動步法',
    '堅岩之鎧': '堅岩鎧',
    '光明火炬': '神力引導﹝光明火炬﹞',
    '光明之劍': '神力引導﹝光明之劍﹞',
    '圖騰精魂': '精魂圖騰',
    '聖甲蟲使徒': '聖甲蟲聖徒',
    '動物夥伴原初野獸': '動物夥伴-原初野獸',
    '動物夥伴龍獸看守': '動物夥伴-龍獸看守',
}


def fix_chars(s):
    """PDF 字型把部分漢字輸出成康熙部首(⿊、⼆、⽬…)，轉回一般漢字。"""
    s = s.replace('⻑', '長')
    return ''.join(unicodedata.normalize('NFKC', c) if 0x2E80 <= ord(c) <= 0x2FDF else c for c in s)


def tidy(s):
    """移除 PDF 換行留下的中文字間空白。"""
    # 「標記(詛咒)」這類括號註記與 #詛咒 同義
    s = re.sub(r'([（(])\s*詛咒\s*([)）])', r'\1#詛咒 \2', s)
    # 規則書用「#長休」這類標籤，標籤以空白結尾；先包成 {#長休} 以免空白被移除
    s = re.sub(r'#\s?([^\s#()（）\[\]［］{}，。、；：]+)', r'{#\1}', s)
    cjk = r'[　-〿一-鿿＀-￯「」『』（）{}]'
    s = re.sub(rf'(?<={cjk}) +(?={cjk})', '', s)
    # PDF 斷行把標籤切成兩段(#詛 咒)
    for a, b in (('詛', '咒'), ('盾', '牌'), ('刺', '劍'), ('敏捷', '豁免')):
        s = s.replace('{#%s}%s' % (a, b), '{#%s%s}' % (a, b))
    for a, b in (('長修', '長休'), ('短修', '短休')):  # 同義標籤
        s = s.replace('{#%s}' % a, '{#%s}' % b)
    return s.strip()


def norm(name):
    s = re.sub(r'\s+', '', name)
    s = re.sub(r'(?<=[^A-Za-z])III$', 'Ⅲ', re.sub(r'(?<=[^A-Za-z])II$', 'Ⅱ', s))
    return s.replace('〔', '﹝').replace('〕', '﹞')


raw = fix_chars(SRC.read_text(encoding='utf-8'))
raw = re.sub(r'\[#\d+\]\(#\d+\)', '', raw)  # 匯出時殘留的頁碼連結

# ---------------------------------------------------------------- 能力
start = raw.index('\n通用類能力\n')
body_src = raw[start:]

HDR = re.compile(r'(?<![\[［])【\s*(通用|武力|靈敏|魔法|特殊|敏捷)\s*】\s*([^\n【]{1,40}?)\s*[(（]\s*(\d+)\s*(?:DP|P)?\s*[)）]')


def take_groups(s, i):
    """讀取能力標題後面連續的 (…) 群組，例如先決條件與可重複購買。"""
    groups = []
    while True:
        j = i
        while j < len(s) and s[j] in ' \t':
            j += 1
        if j < len(s) and s[j] in '(（':
            depth, k = 0, j
            while k < len(s):
                if s[k] in '(（':
                    depth += 1
                elif s[k] in ')）':
                    depth -= 1
                    if depth == 0:
                        break
                elif s[k] == '\n':
                    break
                k += 1
            if k < len(s) and s[k] in ')）':
                groups.append(s[j + 1:k])
                i = k + 1
                continue
            # 原文少了右括號(如 巖龍途)：先決條件取到行尾
            if re.match(r'\s*需?先決條件', s[j + 1:k]):
                groups.append(s[j + 1:k])
                i = k
                continue
        return groups, i


# PDF 私有區字元當作清單符號：◆ 為選項標題，◇ 為其下的細項
PUA_TOP = ''
PUA_SUB = ''
PUA = re.compile(r'^[-]')
TERMINAL = tuple('。！？：:；」』)]】）')
MARKERS = ('•', '◦', '○', '▪', '【', '[')


def clean_body(text):
    lines = [l.strip() for l in text.split('\n')]
    lines = [l for l in lines if l and l not in SECTION_TITLES]
    out = []
    for l in lines:
        # PDF 斷行造成的半句，接回上一行
        if out and not PUA.match(l) and not l.startswith(MARKERS) \
                and PUA.match(out[-1]) and not out[-1].endswith(TERMINAL):
            out[-1] += l
        else:
            out.append(l)
    res = []
    for l in out:
        if l[0] in PUA_TOP:
            l = '◆ ' + l[1:].strip()
        elif l[0] in PUA_SUB:
            l = '◇ ' + l[1:].strip()
        elif PUA.match(l):
            l = '◆ ' + l[1:].strip()
        res.append(tidy(l))
    return res


REF = re.compile(r'(?:【|\[)\s*(通用|武力|靈敏|魔法|特殊|敏捷)\s*】\s*\]?\s*([^\]］【、]+)')


def find_refs(text, own_name):
    refs = []
    for b, n in REF.findall(text):
        n = norm(n)
        n = REF_ALIASES.get(n, n)
        if n == norm(own_name):  # 偷襲Ⅴ 的先決條件寫成自己，應為前一階
            n = '偷襲Ⅵ'
        b = '靈敏' if b == '敏捷' else b
        if not any(r['n'] == n for r in refs):
            refs.append({'b': b, 'n': n})
    return refs


def need_of(text, refs):
    m = re.search(r'其中的?\s*(\d)\s*個|中的\s*(\d)\s*個', text)
    if m:
        return int(m.group(1) or m.group(2))
    if re.search(r'其中的?[二兩]個|中的[二兩]項|中的兩個|其中[二兩]', text):
        return 2
    if re.search(r'中的一個|其中一個|其中一', text) or '或' in text:
        return 1
    return len(refs)


def parse_prereq(text, own_name):
    """回傳 (先決條件群組, 排除清單, 是否可由非能力條件滿足, 是否另有非能力條件)。

    群組全部滿足才算符合；每個群組是 {'r': [引用], 'k': 需要幾個}。
    """
    excl = []
    if '不具有' in text:
        text, rest = text.split('不具有', 1)
        excl = find_refs(rest, own_name)
    groups = []
    # 「A、B、C 中的一個及 D」：拆成兩組
    m = re.search(r'(中的一個|其中一個)\s*(及|和|且|與)', text)
    if m:
        first, second = text[:m.end(1)], text[m.end():]
        for part in (first, second):
            r = find_refs(part, own_name)
            if r:
                groups.append({'r': r, 'k': need_of(part, r)})
    else:
        r = find_refs(text, own_name)
        if r:
            groups.append({'r': r, 'k': need_of(text, r)})
    soft = bool(re.search(r'或角色具有', text))
    extra = bool(re.search(r'熟練|已知|數目', re.sub(r'或角色具有.*', '', text))) or (not groups and not soft)
    return groups, excl, soft, extra


hits = []
for m in HDR.finditer(body_src):
    groups, end = take_groups(body_src, m.end())
    hits.append((m, groups, end))

abilities = []
for idx, (m, groups, end) in enumerate(hits):
    nxt = hits[idx + 1][0].start() if idx + 1 < len(hits) else len(body_src)
    branch = '靈敏' if m.group(1) == '敏捷' else m.group(1)
    name = norm(m.group(2))
    a = {'id': f'm{idx + 1:03d}', 'b': branch, 'n': name, 'c': int(m.group(3))}
    for g in groups:
        g = tidy(g)
        if '重複購買' in g:
            a['rep'] = 1
        elif '先決條件' in g:
            text = re.sub(r'^需?先決條件\s*-?\s*', '', g).strip()
            groups, excl, soft, extra = parse_prereq(text, name)
            a['req'] = text
            if groups:
                a['groups'] = groups
            if excl:
                a['excl'] = excl
            if soft:
                a['soft'] = 1
            if extra:
                a['extra'] = 1
    a['t'] = clean_body(body_src[end:nxt])
    abilities.append(a)

# ---------------------------------------------------------------- 精通能力
SPECIALISTS = [
    '屬性值增加', '極限突破:力量', '極限突破:敏捷', '極限突破:體質', '極限突破:感知', '極限突破:智力',
    '極限突破:魅力', '生命結晶', '逐戰之財', '斬獲之財', '二重屬性豁免', '四類技能熟練', '二類技能專精',
    '外交官', '工具人', '目光如炬', '荒野之體', '動作如潮', '警覺', '氣運過人', '機會主義', '額外攻擊',
    '武器重擊', '鐵壁反震', '反射閃避', '鐵軀抗擊', '思維庇護', '預兆迴避', '魅力護壁', '捉摸不定',
    '偷襲技巧', '機動性', '多列思緒', '魔力之體', '法術倉庫', '術法學者', '邪魔韌性', '戰鬥施法者',
    '氣脈貫通', '不屈意志', '死線回魂', '同調超越', '額外能力',
]
spec_src = raw[raw.index('屬性值增加\n'):start].split('\n')
specialists, cur = [], None
names = list(SPECIALISTS)
for line in spec_src:
    line = line.strip()
    if not line:
        continue
    if names and line.startswith(names[0]):
        cur = {'n': names.pop(0), 't': []}
        specialists.append(cur)
        rest = line[len(cur['n']):].strip()
        # 「二重屬性豁免-(…)」這類標題後面帶有選項說明
        if rest.startswith('-'):
            cur['opt'] = tidy(rest[1:])
        elif rest:
            cur['t'].append(rest)
    elif cur:
        cur['t'].append(line)
for s in specialists:
    s['t'] = [tidy(l) for l in s['t'] if l != '(兩個不會變 1/4。)']
assert not names, f'找不到精通能力: {names}'

data = {'abilities': abilities, 'specialists': specialists}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text('/* 由 tools/build_data.py 自動產生，請勿手動編輯 */\nwindow.CORE = '
               + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')

counts = {b: sum(1 for a in abilities if a['b'] == b) for b in BRANCHES}
known = {a['n'] for a in abilities}
missing = sorted({r['n'] for a in abilities for g in a.get('groups', []) + [{'r': a.get('excl', [])}]
                  for r in g['r'] if r['n'] not in known})
print(f'能力 {len(abilities)} 個 {counts}；精通能力 {len(specialists)} 個')
print(f'引用但未收錄的能力 {len(missing)} 個: {"、".join(missing)}')
