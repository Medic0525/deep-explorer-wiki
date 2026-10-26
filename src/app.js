(function () {
  'use strict';

  var CORE = window.CORE, FACTIONS = window.FACTIONS;
  var BRANCHES = ['通用', '武力', '靈敏', '魔法', '特殊'];
  var HP_GROWTH = { 通用: 4, 武力: 5, 靈敏: 3, 魔法: 1, 特殊: 2 };
  var MP_GROWTH = { 通用: 0, 武力: 0, 靈敏: 0, 魔法: 1, 特殊: 0 };
  var START_DP = 10000, ABILITY_CAP = 20;

  // 有固定數值加成、會影響規劃頁生命值／魔力的能力
  var FLAT = {
    '軍團基本訓練': { hp: 10 },
    '帝國突擊兵': { hp: 20 },
    '祕紋-魔力增幅': { mp: 4 },
    '魔力增加': { mp: 2 }
  };

  // 標籤分類：決定篩選選單的分組與順序，沒列到的歸入「其他」
  var TAG_SYN = { '長修': '長休', '短修': '短休' };
  var TAG_GROUPS = [
    ['狀態與效果', ['詛咒', '異常狀態', '疾病', '隱形', '死亡', '靈光', '抗性', '專注']],
    ['生物類型', ['不死生物', '邪魔', '構裝體', '巨型', '小型', '動物夥伴', '動物兵']],
    ['休息', ['長休', '短休']],
    ['豁免與檢定', ['豁免', '豁免檢定', '力量豁免', '敏捷豁免', '體質豁免', '智力豁免', '感知豁免', '魅力豁免',
                    '攻擊命中', '攻擊檢定', '力量檢定', '體質檢定', '感知檢定']],
    ['攻擊', ['攻擊', '武器攻擊', '近戰攻擊', '徒手打擊', '徒手攻擊', '射程', '傷害類型', 'AC']],
    ['武器', ['簡易武器', '軍用武器', '長劍', '短劍', '彎刀', '刺劍', '契約武器', '暴雷加農砲', '雙手', '可雙手',
              '輕型', '靈巧', '觸及', '雙武器', '再裝填', '彈藥', '爆彈']],
    ['防具', ['盾牌', '護甲', '中甲', '重甲', '護身符']],
    ['法術與施法', ['法術', '咒法系', '姿勢', '聲音', '材料', '奧術法器']],
    ['物品與工具', ['工具組', '藥劑', '毒藥', '消耗品']]
  ];

  var ORIGINS = [
    { id: '士兵', bonus: ['屬性值：力量 +2', '{#軍用武器} 熟練', '{#輕甲}、{#中甲}、{#重甲}、{#盾牌} 熟練'],
      traits: [['快速休整', '當你消耗 [生命骰] 回復 [生命值 Hit Point] 時，每顆生命骰額外回復 5 點生命值。']] },
    { id: '學者', bonus: ['屬性值：智力 +2', '語言：任選二種，可以說、讀、寫並了解其文字', '技能：任意 4 個智力、感知類技能熟練，或任意 2 個智力、感知類技能專精'],
      traits: [['可靠技藝', '進行具有熟練、專精的 [技能 Skills] 檢定時，增加 1d4 到檢定結果上。']] },
    { id: '貴族', bonus: ['屬性值：魅力 +2', '技能：任意 4 個技能熟練'],
      traits: [['高人一等', '進行魅力類 [技能 Skills] 檢定時具有優勢。']] },
    { id: '浪人', bonus: ['屬性值：敏捷 +2', '{#輕甲}、{#盾牌} 熟練', '技能：任意 3 個技能熟練', '工具組：任意一個工具組熟練'], traits: [] },
    { id: '奧秘', bonus: ['最大 [魔力 Magic Point (MP)] +5', '技能：任意 2 個智力、感知、魅力類技能熟練'],
      traits: [['自然魔力回復', '借由靜坐冥想並與自然溝通來回復一部分魔力。每次 {#短休} 結束時回復能力數目一半（向上取整）的 [魔力 Magic Point (MP)]。']] },
    { id: '先知', bonus: ['屬性值：感知 +2'],
      traits: [['先知直覺', '你的 [先攻 Initiative] 獲得你感知調整值的加值。'],
               ['預兆之勢', '進行 d20 檢定時，結果可以額外加上你的感知調整值。使用後直到完成一次 {#短修} 或 {#長修} 才回復。']] },
    { id: '特質', bonus: ['額外獲得一個 [精通能力 Specialist]'], traits: [] }
  ];

  // ------------------------------------------------------------------ 資料整理
  function norm(s) { return String(s).replace(/\s+/g, '').replace(/〔/g, '﹝').replace(/〕/g, '﹞'); }
  var ALL = [], BY_ID = {}, BY_NAME = {}, FBY = {};

  function add(a) {
    ALL.push(a); BY_ID[a.id] = a;
    var k = norm(a.n);
    if (!BY_NAME[k]) BY_NAME[k] = a;
  }
  CORE.abilities.forEach(function (a) { a.src = 'core'; add(a); });
  FACTIONS.forEach(function (f) {
    FBY[f.id] = f;
    f.abilities.forEach(function (a, i) {
      a.id = f.id + String(i + 1).padStart(2, '0');
      a.src = 'faction'; a.f = f.id;
      if (a.refs) a.groups = [{ r: a.refs, k: a.refs.length }];
      add(a);
    });
  });
  var stubCount = 0;
  function refsOf(a) {
    var out = (a.excl || []).slice();
    (a.groups || []).forEach(function (g) { out = out.concat(g.r); });
    return out;
  }
  ALL.slice().forEach(function (a) {
    refsOf(a).forEach(function (r) {
      if (!BY_NAME[norm(r.n)]) {
        stubCount++;
        add({ id: 'x' + String(stubCount).padStart(2, '0'), b: r.b, n: r.n, c: null, stub: true, t: [], src: 'stub' });
      }
    });
  });
  var UNLOCKS = {};
  function idOf(r) { return BY_NAME[norm(r.n)].id; }
  ALL.forEach(function (a) {
    a.groups = (a.groups || []).map(function (g) { return { ids: g.r.map(idOf), k: g.k }; });
    a.exclIds = (a.excl || []).map(idOf);
    a.refIds = [];
    a.groups.forEach(function (g) { g.ids.forEach(function (id) { if (a.refIds.indexOf(id) < 0) a.refIds.push(id); }); });
    a.refIds.forEach(function (id) { (UNLOCKS[id] = UNLOCKS[id] || []).push(a.id); });
    a.hay = (a.n + ' ' + (a.req || '') + ' ' + a.t.join(' ')).toLowerCase();
    a.tags = [];
    (a.t.join(' ') + ' ' + (a.req || '')).replace(/\{#([^}]+)\}/g, function (m, x) {
      x = TAG_SYN[x] || x;
      if (a.tags.indexOf(x) < 0) a.tags.push(x);
    });
  });
  var TAG_COUNT = {};
  ALL.forEach(function (a) { a.tags.forEach(function (x) { TAG_COUNT[x] = (TAG_COUNT[x] || 0) + 1; }); });
  function mentions(a, tag) { return a.tags.indexOf(tag) >= 0 || a.hay.indexOf(tag.toLowerCase()) >= 0; }

  // 體系標籤：以某個核心能力為根，凡是先決條件(任意層)連到它的能力都算該體系；
  // 「提及」則是說明文字用到該體系資源、但沒有列為先決條件的能力。要新增體系就在這裡加一列。
  var SYSTEMS = [
    { n: '吟遊激勵', root: '吟遊激勵', re: /吟[遊游]激勵/ },
    { n: '荒野形態', root: '荒野形態', re: /荒野[形型]態/ },
    { n: '氣', root: '氣', re: /\[氣\]|[點耗]\s*\d*\s*點?\s*氣(?![息味勢場候泡])|(?:花費|消耗)[^，。\d]{0,8}氣(?![息味泡元])|氣豁免|氣的(?:豁免|數量|\s*DC)|【特殊】\s*氣\]/ },
    { n: '神力引導', root: '神力引導', re: /神力引導/ }
  ];
  var SYS_COUNT = {}, SYS_WIDE_COUNT = {};
  SYSTEMS.forEach(function (sy) {
    var root = BY_NAME[norm(sy.root)], set = {};
    if (root) {
      set[root.id] = 1;
      var queue = [root.id];
      while (queue.length) {
        (UNLOCKS[queue.shift()] || []).forEach(function (u) { if (!set[u]) { set[u] = 1; queue.push(u); } });
      }
    }
    SYS_COUNT[sy.n] = 0; SYS_WIDE_COUNT[sy.n] = 0;
    ALL.forEach(function (a) {
      if (set[a.id]) { (a.sys = a.sys || []).push(sy.n); SYS_COUNT[sy.n]++; SYS_WIDE_COUNT[sy.n]++; }
      else if (sy.re.test(a.n + ' ' + a.t.join(' ') + ' ' + (a.req || ''))) { (a.sysMention = a.sysMention || []).push(sy.n); SYS_WIDE_COUNT[sy.n]++; }
    });
  });
  function tagMatch(a, tag, wide) {
    if (tag.indexOf('sys:') === 0) {
      var n = tag.slice(4);
      return (a.sys || []).indexOf(n) >= 0 || (wide && (a.sysMention || []).indexOf(n) >= 0);
    }
    return wide ? mentions(a, tag) : a.tags.indexOf(tag) >= 0;
  }
  function tagLabel(tag) { return tag.indexOf('sys:') === 0 ? tag.slice(4) + ' 體系' : '#' + tag; }
  function tagKnown(tag) { return tag.indexOf('sys:') === 0 ? SYS_COUNT[tag.slice(4)] != null : !!TAG_COUNT[tag]; }
  ALL.forEach(function (a) { a.order = ALL.indexOf(a); });

  var STATS = {
    all: ALL.filter(function (a) { return !a.stub; }).length,
    spec: CORE.specialists.length,
    stubs: stubCount
  };

  // ------------------------------------------------------------------ 工具
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtDP(c) { return c == null ? '未知' : c.toLocaleString('en-US'); }
  function store(key, val) {
    try {
      if (val === undefined) { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  var REF_RE = /[\[［]\s*【\s*(通用|武力|靈敏|魔法|特殊|敏捷)\s*】\s*([^\]］]+?)\s*[\]］]/g;
  function refLink(name, label) {
    var a = BY_NAME[norm(name)];
    if (!a) return '<span class="term">' + label + '</span>';
    return '<a class="aref' + (a.stub ? ' missing' : '') + '" data-b="' + a.b + '" href="#a-' + a.id + '">' + label + '</a>';
  }
  /** 把規則書的行內標記轉成 HTML：能力連結、[術語]、{#標籤}、『法術』與骰子。 */
  function fmt(text) {
    var s = esc(text);
    s = s.replace(/(^|[^A-Za-z0-9#-])(\d*[dD]\d+(?:\s*[+＋]\s*\d+)?)(?![A-Za-z0-9])/g, '$1<b class="dice">$2</b>');
    s = s.replace(REF_RE, function (m, b, n) { return refLink(n, '【' + (b === '敏捷' ? '靈敏' : b) + '】' + n.trim()); });
    s = s.replace(/\{#([^}]+)\}/g, function (m, x) {
      x = TAG_SYN[x] || x;
      return '<a class="tag" href="#abilities" data-tag="' + x + '" title="列出所有標有 #' + x + ' 的能力">#' + x + '</a>';
    });
    s = s.replace(/[\[［]([^\[\]［］<>]{1,40})[\]］]/g, '<span class="term">$1</span>');
    s = s.replace(/『([^』]+)』/g, '<span class="spell">『$1』</span>');
    return s;
  }
  // 清單層級：◆ 選項標題、◇ 選項內容、• ◦ ▪ ‣ 第一到四層；「¶N 」是第 N 層裡不加符號的段落
  function lineLevel(line) {
    var b = /^¶([1-4])\s*/.exec(line);
    if (b) return { lvl: +b[1], cls: 'bare', text: line.slice(b[0].length) };
    var m = /^(◆|◇|•|◦|○|▪|‣)\s*/.exec(line);
    if (!m) return { lvl: 0, text: line };
    var map = { '◆': [1, 'opt'], '◇': [2, ''], '•': [1, ''], '◦': [2, ''], '○': [2, ''], '▪': [3, ''], '‣': [4, ''] };
    return { lvl: map[m[1]][0], cls: map[m[1]][1], text: line.slice(m[0].length) };
  }
  function renderBody(lines) {
    var out = [], depth = 0, table = null;
    function closeTable() {
      if (!table) return;
      out.push('<div class="table-wrap"><table><thead><tr>' + table[0].map(function (c) { return '<th>' + fmt(c) + '</th>'; }).join('') +
        '</tr></thead><tbody>' + table.slice(1).map(function (r) {
          return '<tr>' + r.map(function (c) { return '<td>' + fmt(c) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>');
      table = null;
    }
    lines.forEach(function (raw) {
      // 表格列：「｜欄｜欄」
      if (raw.charAt(0) === '｜') {
        while (depth > 0) { out.push('</li></ul>'); depth--; }
        (table = table || []).push(raw.slice(1).split('｜').map(function (c) { return c.trim(); }));
        return;
      }
      closeTable();
      var p = lineLevel(raw);
      if (!p.lvl) {
        while (depth > 0) { out.push('</li></ul>'); depth--; }
        out.push('<p>' + fmt(p.text) + '</p>');
        return;
      }
      if (p.lvl > depth) {
        while (depth < p.lvl) {
          out.push('<ul>'); depth++;
          if (depth < p.lvl) out.push('<li style="list-style:none">');
        }
      } else {
        out.push('</li>');
        while (depth > p.lvl) { out.push('</ul></li>'); depth--; }
      }
      out.push('<li' + (p.cls ? ' class="' + p.cls + '"' : '') + '>' + fmt(p.text));
    });
    closeTable();
    while (depth > 0) { out.push('</li></ul>'); depth--; }
    return '<div class="rules-text">' + out.join('') + '</div>';
  }
  function branchChip(b) { return '<span class="chip branch" data-b="' + b + '">' + b + '</span>'; }
  function factionChip(fid, link) {
    var f = FBY[fid];
    var inner = f.name;
    return link
      ? '<a class="chip faction" data-f="' + fid + '" href="#f-' + fid + '" style="text-decoration:none">' + inner + '</a>'
      : '<span class="chip faction" data-f="' + fid + '">' + inner + '</span>';
  }
  function groupLabel(g) {
    if (g.ids.length < 2 || g.k >= g.ids.length) return g.ids.length > 1 ? '全部具備' : '';
    if (g.k === 1) return '任一即可';
    return '其中 ' + g.k + ' 項';
  }
  function groupText(g) {
    var names = g.ids.map(function (id) { return BY_ID[id].n; });
    if (g.k === 1 && names.length > 1) return names.join(' 或 ');
    return names.join('、') + (g.k < names.length ? '（其中 ' + g.k + ' 項）' : '');
  }
  function reqSummary(a) {
    var parts = a.groups.map(groupText);
    if (a.trait) parts.push('特性：' + a.req.replace(/^具有特性/, ''));
    if (!parts.length && a.req) parts.push(a.req);
    if (!parts.length) return '';
    return '需：' + parts.join('；') + (a.exclIds.length ? '；不可兼得：' + a.exclIds.map(function (id) { return BY_ID[id].n; }).join('、') : '');
  }

  // ------------------------------------------------------------------ 規劃狀態
  var ATTRS = ['力量', '敏捷', '體質', '智力', '感知', '魅力'];
  var ATTR_EN = { 力量: 'STR', 敏捷: 'DEX', 體質: 'CON', 智力: 'INT', 感知: 'WIS', 魅力: 'CHA' };
  var PB_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };   // D&D 5E 標準購點
  var PB_MIN = 8, PB_MAX = 15, ATTR_CAP = 20, FREE_PER_SPEC = 6;
  var ORIGIN_ATTR = { 士兵: '力量', 學者: '智力', 貴族: '魅力', 浪人: '敏捷', 先知: '感知' };
  var SPEC_BY = {};
  CORE.specialists.forEach(function (s) { SPEC_BY[s.n] = s; });
  // 有固定數值加成、會影響規劃頁數值的精通能力
  var SPEC_FLAT = { '生命結晶': { hp: 50 }, '魔力之體': { mp: 10 }, '法術倉庫': { slots: 10 } };

  function fill(v) { var o = {}; ATTRS.forEach(function (k) { o[k] = v; }); return o; }
  var saved = store('dex-plan') || {};
  var plan = Object.assign({ start: START_DP, origin: '', faction: '', budget: 27, picks: [], specs: [] }, saved);
  plan.base = Object.assign(fill(PB_MIN), saved.base || {});
  plan.free = Object.assign(fill(0), saved.free || {});
  // 舊版(C)存檔用的是連續編號 ID，轉成固定 ID；D 版移除的能力記下來提示使用者
  var LEGACY = window.LEGACY_IDS || {}, LEGACY_GONE = window.LEGACY_REMOVED || {}, droppedPicks = [];
  (plan.picks || []).forEach(function (p) {
    if (/^m\d{3}$/.test(p.id)) {
      if (LEGACY_GONE[p.id]) droppedPicks.push(LEGACY_GONE[p.id]);
      p.id = LEGACY[p.id] || p.id;
    }
  });
  plan.picks = (plan.picks || []).filter(function (p) { return BY_ID[p.id]; });
  plan.specs = (plan.specs || []).filter(function (s) { return SPEC_BY[s.n]; });
  function savePlan() { store('dex-plan', plan); }
  if (droppedPicks.length) savePlan();
  function pickOf(id) { for (var i = 0; i < plan.picks.length; i++) if (plan.picks[i].id === id) return plan.picks[i]; return null; }
  function addPick(id) {
    var a = BY_ID[id], p = pickOf(id);
    if (p) { if (a.rep) p.n++; } else plan.picks.push({ id: id, n: 1 });
    savePlan();
  }
  function removePick(id) { plan.picks = plan.picks.filter(function (p) { return p.id !== id; }); savePlan(); }
  function specCount(name) { return plan.specs.filter(function (s) { return s.n === name; }).length; }
  function modOf(v) { return Math.floor((v - 10) / 2); }
  function signed(n) { return (n >= 0 ? '+' : '−') + Math.abs(n); }

  /** 屬性：購點＋起源＋成長能力＋自由分配(上限 20)，再加極限突破(可超過 20)。 */
  function computeAttrs() {
    var growth = {}, breaks = {}, pool = specCount('屬性值增加') * FREE_PER_SPEC, used = 0, freeUsed = 0, out = {};
    plan.picks.forEach(function (p) {
      var a = BY_ID[p.id], m = /^(力量|敏捷|體質|智力|感知|魅力)成長$/.exec(a.n);
      if (m && a.src === 'core') growth[m[1]] = (growth[m[1]] || 0) + 2 * p.n;
    });
    plan.specs.forEach(function (s) {
      var m = /^極限突破:(.+)$/.exec(s.n);
      if (m) breaks[m[1]] = (breaks[m[1]] || 0) + 4;
    });
    ATTRS.forEach(function (k) {
      var base = plan.base[k], org = ORIGIN_ATTR[plan.origin] === k ? 2 : 0;
      var gr = growth[k] || 0, fr = plan.free[k] || 0, br = breaks[k] || 0;
      used += PB_COST[base]; freeUsed += fr;
      var pre = base + org + gr + fr, total = Math.min(pre, ATTR_CAP) + br;
      out[k] = { base: base, org: org, gr: gr, fr: fr, br: br, pre: pre, total: total, mod: modOf(total) };
    });
    return { a: out, used: used, pool: pool, freeUsed: freeUsed };
  }
  // 移除精通能力後，把超出名額的自由分配點與「額外能力」標記收回
  function trimToLimits() {
    var pool = specCount('屬性值增加') * FREE_PER_SPEC, used = 0;
    ATTRS.forEach(function (k) { used += plan.free[k]; });
    for (var i = ATTRS.length - 1; i >= 0 && used > pool; i--) {
      var k = ATTRS[i], cut = Math.min(plan.free[k], used - pool);
      plan.free[k] -= cut; used -= cut;
    }
    var viaLeft = specCount('額外能力') * 2;
    plan.picks.forEach(function (p) {
      if (!p.via) return;
      if (viaLeft >= p.n) viaLeft -= p.n; else p.via = false;
    });
  }

  function computePlan() {
    var at = computeAttrs();
    var con = at.a['體質'].mod;
    var cast = Math.max(at.a['智力'].mod, at.a['感知'].mod, at.a['魅力'].mod);
    var count = 0, spent = 0, unknown = 0, hp = 10 + con, mp = Math.max(0, cast), via = 0;
    plan.picks.forEach(function (p) {
      var a = BY_ID[p.id], fl = FLAT[a.n];
      if (fl) { hp += (fl.hp || 0) * p.n; mp += (fl.mp || 0) * p.n; }
      if (p.via) { via += p.n; return; }   // 以「額外能力」取得：不花 DP、不計能力數與成長
      count += p.n;
      if (a.c == null) unknown += p.n; else spent += a.c * p.n;
      hp += (HP_GROWTH[a.b] + con) * p.n;
      mp += MP_GROWTH[a.b] * p.n;
    });
    var slots = 3;
    plan.specs.forEach(function (s) {
      var fl = SPEC_FLAT[s.n];
      if (fl) { hp += fl.hp || 0; mp += fl.mp || 0; slots += fl.slots || 0; }
    });
    if (plan.origin === '奧秘') mp += 5;
    if (plan.faction === 'iron') hp += 20;
    if (plan.faction === 'arcane') { mp += 3; slots += 5; }
    var prof = count >= 17 ? 6 : count >= 13 ? 5 : count >= 9 ? 4 : count >= 5 ? 3 : 2;
    var spec = 1 + Math.floor(count / 10) + (plan.origin === '特質' ? 1 : 0);
    return { count: count, spent: spent, unknown: unknown, left: plan.start - spent, hp: hp, mp: mp, prof: prof,
             spec: spec, specUsed: plan.specs.length, slots: slots, con: con, cast: cast, attrs: at,
             via: via, viaLimit: specCount('額外能力') * 2, nextSpecAt: (Math.floor(count / 10) + 1) * 10 };
  }
  function pickMessages(a) {
    var msgs = [];
    if (a.stub) msgs.push(['warn', '規則書中找不到此能力，費用未計入。']);
    if (a.src === 'faction' && plan.faction !== a.f) msgs.push(['bad', '需加入「' + FBY[a.f].name + '」才能購買。']);
    if (a.trait && plan.faction !== a.f) msgs.push(['bad', '需具有' + a.req.replace(/^具有/, '') + '。']);
    a.groups.forEach(function (g) {
      var have = g.ids.filter(function (id) { return pickOf(id); });
      if (have.length >= g.k) return;
      var lack = g.ids.filter(function (id) { return !pickOf(id); }).map(function (id) { return BY_ID[id].n; });
      var txt = '缺少先決條件：' + lack.join(g.k === 1 ? ' 或 ' : '、') + (g.k > 1 && g.k < g.ids.length ? '（需其中 ' + g.k + ' 項）' : '');
      msgs.push([a.soft ? 'warn' : 'bad', a.soft ? txt + '，或角色本身已具有相應熟練。' : txt]);
    });
    var clash = a.exclIds.filter(function (id) { return pickOf(id); });
    if (clash.length) msgs.push(['bad', '不可與 ' + clash.map(function (id) { return BY_ID[id].n; }).join('、') + ' 同時具有。']);
    if (a.extra && !a.trait) msgs.push(['warn', '另需符合：' + a.req]);
    var m = /^(力量|敏捷|體質|智力|感知|魅力)成長$/.exec(a.n);
    if (m && a.src === 'core') {
      var at = computeAttrs().a[m[1]];
      if (at.pre > ATTR_CAP) msgs.push(['warn', m[1] + '已超過 20，超出的部分不計入（極限突破除外）。']);
    }
    return msgs;
  }

  // ------------------------------------------------------------------ 主題
  function applyTheme(t) {
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  applyTheme(store('dex-theme'));
  $('#theme-btn').addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme');
    if (!cur) cur = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next); store('dex-theme', next);
  });

  // ------------------------------------------------------------------ 靜態頁面補資料
  $$('[data-stat]').forEach(function (el) { el.textContent = STATS[el.getAttribute('data-stat')]; });
  if (!stubCount) $('#missing-notice').hidden = true;
  $('#branch-table').innerHTML = BRANCHES.map(function (b) {
    var n = ALL.filter(function (a) { return a.b === b && !a.stub; }).length;
    return '<tr><td>' + branchChip(b) + '</td><td class="num">' + (n || '—') + '</td><td>' + HP_GROWTH[b] + '＋體質調整值</td><td class="num">' + MP_GROWTH[b] + '</td></tr>';
  }).join('');
  $('#origin-cards').innerHTML = ORIGINS.map(function (o) {
    return '<div class="card"><h3>' + o.id + '起源</h3><ul class="plain-list">' +
      o.bonus.map(function (b) { return '<li>' + fmt(b) + '</li>'; }).join('') + '</ul>' +
      o.traits.map(function (t) { return '<p><strong>特性［' + t[0] + '］</strong>　' + fmt(t[1]) + '</p>'; }).join('') + '</div>';
  }).join('');
  (function () {
    var toc = $('#rules-toc');
    toc.innerHTML = $$('[data-page="rules"] section.block').map(function (s) {
      return '<button type="button" data-jump="' + s.id + '">' + esc($('h2', s).textContent) + '</button>';
    }).join('');
    toc.addEventListener('click', function (e) {
      var b = e.target.closest('[data-jump]');
      if (b) document.getElementById(b.getAttribute('data-jump')).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  })();

  // ------------------------------------------------------------------ 能力目錄
  var F_DEFAULT = { q: '', b: 'all', src: 'all', cost: 'all', entry: false, rep: false, sort: 'book', tag: '', tagWide: false };
  var F = Object.assign({}, F_DEFAULT, store('dex-filters') || {});
  if (F.tag && !tagKnown(F.tag)) F.tag = '';
  var listLimit = 150, catalogBuilt = false, selectedId = null;

  function costBucket(c) {
    if (c == null) return 'unknown';
    if (c <= 1000) return 'low';
    if (c <= 2000) return 'mid';
    return 'high';
  }
  function filtered() {
    var terms = F.q.toLowerCase().split(/\s+/).filter(Boolean);
    var res = ALL.filter(function (a) {
      if (F.b !== 'all' && a.b !== F.b) return false;
      if (F.src !== 'all' && a.src !== F.src) return false;
      if (F.cost !== 'all' && costBucket(a.c) !== F.cost) return false;
      if (F.entry && a.req) return false;
      if (F.rep && !a.rep) return false;
      if (F.tag && !tagMatch(a, F.tag, F.tagWide)) return false;
      for (var i = 0; i < terms.length; i++) if (a.hay.indexOf(terms[i]) < 0) return false;
      return true;
    });
    var q = F.q.trim().toLowerCase();
    var cmp = {
      book: function (x, y) { return x.order - y.order; },
      'cost-asc': function (x, y) { return (x.c == null ? 1e9 : x.c) - (y.c == null ? 1e9 : y.c) || x.order - y.order; },
      'cost-desc': function (x, y) { return (y.c == null ? -1 : y.c) - (x.c == null ? -1 : x.c) || x.order - y.order; },
      name: function (x, y) { return x.n.localeCompare(y.n, 'zh-Hant'); }
    }[F.sort];
    res.sort(function (x, y) {
      // 名稱命中的排前面
      if (q) {
        var nx = x.n.toLowerCase().indexOf(q) >= 0, ny = y.n.toLowerCase().indexOf(q) >= 0;
        if (nx !== ny) return nx ? -1 : 1;
      }
      return cmp(x, y);
    });
    return res;
  }
  function rowHTML(a) {
    var flags = '';
    if (a.src === 'faction') flags += factionChip(a.f);
    if (a.rep) flags += '<span class="chip flag">可重複</span>';
    if (a.stub) flags += '<span class="chip stub">待補</span>';
    var sub = reqSummary(a) || (a.t[0] || '');
    return '<li><a class="arow" data-b="' + a.b + '" href="#a-' + a.id + '" data-id="' + a.id + '"' +
      (a.id === selectedId ? ' aria-current="true"' : '') + '>' +
      '<span class="nm">' + esc(a.n) + flags + '</span>' +
      '<span class="cost' + (a.c == null ? ' unknown' : '') + '">' + (a.c == null ? '待補' : fmtDP(a.c)) + '</span>' +
      '<span class="sub">' + esc(sub.replace(/\{#([^}]+)\}/g, '#$1')) + '</span></a></li>';
  }
  function countBy(fn) {
    var o = {};
    ALL.forEach(function (a) { var k = fn(a); o[k] = (o[k] || 0) + 1; });
    return o;
  }
  function tagOptions() {
    var seen = {}, html = '<option value="">全部</option>' +
      '<optgroup label="體系（依先決條件串連）">' + SYSTEMS.map(function (sy) {
        return '<option value="sys:' + sy.n + '">' + sy.n + ' 體系（' + SYS_COUNT[sy.n] + '）</option>';
      }).join('') + '</optgroup>';
    function opt(x) { seen[x] = 1; return '<option value="' + x + '">#' + x + '（' + TAG_COUNT[x] + '）</option>'; }
    TAG_GROUPS.forEach(function (g) {
      var list = g[1].filter(function (x) { return TAG_COUNT[x]; });
      if (list.length) html += '<optgroup label="' + g[0] + '">' + list.map(opt).join('') + '</optgroup>';
    });
    var rest = Object.keys(TAG_COUNT).filter(function (x) { return !seen[x]; }).sort(function (x, y) { return TAG_COUNT[y] - TAG_COUNT[x]; });
    if (rest.length) html += '<optgroup label="其他">' + rest.map(opt).join('') + '</optgroup>';
    return html;
  }
  function syncControls() {
    $('#f-q').value = F.q; $('#f-src').value = F.src; $('#f-cost').value = F.cost; $('#f-sort').value = F.sort;
    $('#f-entry').checked = F.entry; $('#f-rep').checked = F.rep;
    $('#f-tag').value = F.tag; $('#f-tagwide').checked = F.tagWide;
    $('#f-tagwide-wrap').hidden = !F.tag;
  }
  function buildCatalog() {
    var page = $('[data-page="abilities"]');
    var bc = countBy(function (a) { return a.b; }), sc = countBy(function (a) { return a.src; });
    page.innerHTML =
      '<div class="page-head"><span class="eyebrow">購點能力</span><h1>能力目錄</h1>' +
      '<p class="lede">主規則書與四大勢力的全部可購買能力。點選能力看完整效果、先決條件與可以接續購買的能力。</p></div>' +
      '<div class="catalog" id="catalog"><div class="catalog-list filters">' +
      '<input class="search" id="f-q" type="search" placeholder="搜尋名稱或效果，例如：狂暴、反應、光耀傷害" autocomplete="off">' +
      '<div class="seg" id="f-b">' +
        '<button type="button" data-v="all">全部 <span class="num">' + ALL.length + '</span></button>' +
        BRANCHES.map(function (b) { return '<button type="button" data-v="' + b + '" data-b="' + b + '">' + b + ' <span class="num">' + (bc[b] || 0) + '</span></button>'; }).join('') +
      '</div>' +
      '<div class="filter-row">' +
        '<label>來源 <select id="f-src"><option value="all">全部</option><option value="core">主規則書 (' + (sc.core || 0) + ')</option><option value="faction">勢力專屬 (' + (sc.faction || 0) + ')</option><option value="stub">待補 (' + (sc.stub || 0) + ')</option></select></label>' +
        '<label>價格 <select id="f-cost"><option value="all">全部</option><option value="low">1,000 以下</option><option value="mid">1,500–2,000</option><option value="high">2,500 以上</option><option value="unknown">未知</option></select></label>' +
        '<label>排序 <select id="f-sort"><option value="book">規則書順序</option><option value="cost-asc">價格低→高</option><option value="cost-desc">價格高→低</option><option value="name">名稱</option></select></label>' +
      '</div><div class="filter-row">' +
        '<label>標籤 <select id="f-tag">' + tagOptions() + '</select></label>' +
        '<label id="f-tagwide-wrap"><input type="checkbox" id="f-tagwide"> 也列出說明中提到的</label>' +
      '</div><div class="filter-row">' +
        '<label><input type="checkbox" id="f-entry"> 只看無先決條件</label>' +
        '<label><input type="checkbox" id="f-rep"> 只看可重複購買</label>' +
        '<span class="result-count" id="f-count"></span>' +
      '</div>' +
      '<ul class="alist" id="alist"></ul></div>' +
      '<aside class="detail" id="detail" aria-live="polite"></aside></div>';

    syncControls();
    function changed() { listLimit = 150; store('dex-filters', F); renderList(); }
    $('#f-q').addEventListener('input', function (e) { F.q = e.target.value; changed(); });
    $('#f-b').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      F.b = b.getAttribute('data-v'); changed();
    });
    $('#f-tag').addEventListener('change', function (e) { F.tag = e.target.value; $('#f-tagwide-wrap').hidden = !F.tag; changed(); });
    $('#f-tagwide').addEventListener('change', function (e) { F.tagWide = e.target.checked; changed(); });
    ['src', 'cost', 'sort'].forEach(function (k) {
      $('#f-' + k).addEventListener('change', function (e) { F[k] = e.target.value; changed(); });
    });
    $('#f-entry').addEventListener('change', function (e) { F.entry = e.target.checked; changed(); });
    $('#f-rep').addEventListener('change', function (e) { F.rep = e.target.checked; changed(); });
    $('#alist').addEventListener('click', function (e) {
      if (e.target.closest('.more-btn')) { listLimit += 300; renderList(); }
    });
    $('#detail').addEventListener('click', onDetailClick);
    catalogBuilt = true;
  }
  function renderList() {
    $$('#f-b button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === F.b)); });
    var res = filtered();
    $('#f-count').textContent = '符合 ' + res.length + ' 個' + (F.tag ? '（' + tagLabel(F.tag) + (F.tagWide ? '，含說明中提到' : '') + '）' : '');
    var html = res.slice(0, listLimit).map(rowHTML).join('');
    if (!res.length) html = '<li class="empty">沒有符合的能力。試著清除搜尋字或放寬篩選。</li>';
    if (res.length > listLimit) html += '<li><button type="button" class="more-btn">再顯示 ' + Math.min(300, res.length - listLimit) + ' 個（共 ' + res.length + ' 個）</button></li>';
    $('#alist').innerHTML = html;
  }
  function detailHTML(a) {
    if (!a) {
      return '<div class="empty-detail"><h2 style="font-size:20px">選一個能力</h2>' +
        '<p>從左側列表點選能力，這裡會顯示完整效果、先決條件，以及以它為前置的後續能力。</p>' +
        '<p>想從零開始？勾選「只看無先決條件」，再依價格排序。</p></div>';
    }
    var chips = branchChip(a.b);
    if (a.src === 'faction') chips += factionChip(a.f, true);
    if (a.rep) chips += '<span class="chip flag">可重複購買</span>';
    if (a.stub) chips += '<span class="chip stub">待補</span>';
    (a.sys || []).forEach(function (n) {
      chips += '<a class="chip sys" href="#abilities" data-tag="sys:' + n + '" title="列出 ' + n + ' 體系的所有能力">' + n + ' 體系</a>';
    });
    (a.sysMention || []).forEach(function (n) {
      chips += '<a class="chip sys mention" href="#abilities" data-tag="sys:' + n + '" data-wide="1" title="說明中用到' + n + '，但不是先決條件">提及 ' + n + '</a>';
    });
    var p = pickOf(a.id);
    var addBtn = (p && !a.rep)
      ? '<a class="btn ghost small" href="#planner">已在購點規劃中</a>'
      : '<button class="btn small" type="button" data-add="' + a.id + '">加入購點規劃' + (p ? '（目前 ×' + p.n + '）' : '') + '</button>';
    var h = '<a class="back-link btn ghost small" href="#abilities">← 回到列表</a>' +
      '<div class="head"><div class="chips">' + chips + '</div><h2>' + esc(a.n) + '</h2>' +
      '<div class="price"><span class="dp">' + (a.c == null ? '價格待補' : fmtDP(a.c) + ' DP') + '</span>' + addBtn + '</div></div>';
    function refChip(id) {
      var r = BY_ID[id], ok = pickOf(id);
      return '<a class="chip branch' + (r.stub ? ' stub' : '') + '" data-b="' + r.b + '" href="#a-' + id + '" style="text-decoration:none">' +
        (ok ? '✓ ' : '') + '【' + r.b + '】' + esc(r.n) + '</a>';
    }
    if (a.req) {
      h += '<div class="req-box"><h4>先決條件</h4>';
      a.groups.forEach(function (g, i) {
        var lab = groupLabel(g);
        h += '<div class="refs">' + (a.groups.length > 1 ? '<span class="req-raw">' + (i ? '並且' : '') + '</span>' : '') +
          g.ids.map(refChip).join('') + (lab ? '<span class="req-raw">' + lab + '</span>' : '') + '</div>';
      });
      if (a.exclIds.length) h += '<div class="refs"><span class="req-raw">不可同時具有</span>' + a.exclIds.map(refChip).join('') + '</div>';
      h += '<p class="req-raw">原文：' + fmt(a.req) + '</p></div>';
    }
    if (a.stub) {
      h += '<div class="notice"><strong>內容待補</strong><p>這個能力被其他能力列為先決條件，但在規則書中找不到它的原文，所以沒有效果說明與價格。下方列出需要它的能力。</p></div>';
    } else {
      h += '<div><h4>效果</h4>' + renderBody(a.t) + '</div>';
    }
    if (a.src === 'faction') {
      var f = FBY[a.f];
      h += '<p class="req-raw">勢力專屬能力：必須是「' + f.name + '」成員才能購買' + (f.leave.fee ? '，退出勢力時移除' : '') + '。</p>';
    }
    var un = UNLOCKS[a.id] || [];
    if (un.length) {
      h += '<div><h4>以此為先決條件的能力（' + un.length + '）</h4><div class="unlocks">' + un.map(function (id) {
        var u = BY_ID[id];
        return '<a class="aref" data-b="' + u.b + '" href="#a-' + id + '">' + esc(u.n) + '</a><span class="dp" style="font-size:12px;color:var(--muted)">' + fmtDP(u.c) + '</span>';
      }).join('') + '</div></div>';
    }
    return h;
  }
  function onDetailClick(e) {
    var b = e.target.closest('[data-add]');
    if (!b) return;
    var id = b.getAttribute('data-add');
    addPick(id);
    $('#detail').innerHTML = detailHTML(BY_ID[id]) +
      '<p class="msg ok">已加入購點規劃，目前共 ' + computePlan().count + ' 個能力。</p>';
  }
  function showCatalog(id) {
    if (!catalogBuilt) buildCatalog();
    var prev = selectedId;
    selectedId = id && BY_ID[id] ? id : null;
    renderList();
    $('#detail').innerHTML = !selectedId && id && LEGACY_GONE[id]
      ? '<div class="notice"><strong>此能力已移除</strong><p>【通用】' + esc(LEGACY_GONE[id]) + ' 在 Ver.4.0_D 已移除，不能再用 DP 購買；同名的精通能力仍然保留。<a href="#specialists">看精通能力</a></p></div>'
      : detailHTML(selectedId ? BY_ID[selectedId] : null);
    $('#detail').setAttribute('data-b', selectedId ? BY_ID[selectedId].b : '');
    $('#detail').scrollTop = 0;
    $('#catalog').classList.toggle('has-sel', !!selectedId || !!(id && LEGACY_GONE[id]));
    if (selectedId) {
      document.title = BY_ID[selectedId].n + '｜深淵的探索者 維基';
      var row = $('.arow[data-id="' + selectedId + '"]');
      if (window.matchMedia('(max-width: 1100px)').matches) window.scrollTo(0, 0);
      else if (row && !prev) row.scrollIntoView({ block: 'nearest' });
    } else if (prev && window.matchMedia('(max-width: 1100px)').matches) {
      var back = $('.arow[data-id="' + prev + '"]');
      if (back) back.scrollIntoView({ block: 'center' });
    }
  }

  // ------------------------------------------------------------------ 精通能力
  function buildSpecialists() {
    var page = $('[data-page="specialists"]');
    page.innerHTML =
      '<div class="page-head"><span class="eyebrow">Specialist</span><h1>精通能力</h1>' +
      '<p class="lede">創角時獲得一個精通能力；能力總數每累積滿 10 個再獲得一個。可以擁有多個同名的精通能力。精通能力不花 DP。</p></div>' +
      '<input class="search" id="s-q" type="search" placeholder="搜尋精通能力" autocomplete="off">' +
      '<div class="spec-grid" id="spec-grid"></div>';
    function draw() {
      var q = $('#s-q').value.trim().toLowerCase();
      var list = CORE.specialists.filter(function (s) { return !q || (s.n + s.t.join('')).toLowerCase().indexOf(q) >= 0; });
      $('#spec-grid').innerHTML = list.map(function (s) {
        return '<div class="card spec"><h3>' + esc(s.n) + '</h3>' + (s.opt ? '<span class="opt">選擇：' + esc(s.opt) + '</span>' : '') + renderBody(s.t) + '</div>';
      }).join('') || '<p class="empty">沒有符合的精通能力。</p>';
    }
    $('#s-q').addEventListener('input', draw);
    draw();
  }

  // ------------------------------------------------------------------ 勢力
  var REL_LABEL = { hostile: '敵對', friendly: '友好', neutral: '中立' };
  function emblem(fid, cls) { return '<span class="emblem ' + (cls || '') + '" data-f="' + fid + '" style="--emblem: var(--emblem-' + fid + ')" aria-hidden="true"></span>'; }
  function relOf(a, b) {
    var r = FBY[a].relations;
    for (var k in r) if (r[k][0] === b) return k;
    return null;
  }
  function buildFactions() {
    var page = $('[data-page="factions"]');
    var head = '<tr><th></th>' + FACTIONS.map(function (f) { return '<th>' + f.name + '</th>'; }).join('') + '</tr>';
    var rows = FACTIONS.map(function (f) {
      return '<tr><td><a href="#f-' + f.id + '">' + f.name + '</a></td>' + FACTIONS.map(function (g) {
        if (f.id === g.id) return '<td>—</td>';
        var k = relOf(f.id, g.id);
        return '<td><span class="rel-dot ' + k + '">' + REL_LABEL[k] + '</span></td>';
      }).join('') + '</tr>';
    }).join('');
    page.innerHTML =
      '<div class="page-head"><span class="eyebrow">Factions</span><h1>四大勢力</h1>' +
      '<p class="lede">每個角色只能加入一個勢力，創角時入會免費。加入後獲得勢力特性，並可以購買該勢力的專屬能力、使用專屬商店。</p></div>' +
      '<div class="faction-grid">' + FACTIONS.map(function (f) {
        return '<a class="card faction-card" data-f="' + f.id + '" href="#f-' + f.id + '">' + emblem(f.id, 'sm') +
          '<div><h3>' + f.name + '</h3><span class="en">' + f.en + '</span></div>' +
          '<p class="meta">' + esc(f.motto) + '</p>' +
          '<p class="meta">陣營：' + esc(f.join.alignment) + '<br>特性：' + esc(f.trait.name) + '　專屬能力 ' + f.abilities.length + ' 個</p></a>';
      }).join('') + '</div>' +
      '<section class="block"><h2>勢力關係</h2><p class="prose">列為左側勢力對上方勢力的態度。</p>' +
      '<div class="table-wrap"><table class="matrix"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div></section>';
  }
  function buildFaction(fid) {
    var f = FBY[fid], page = $('[data-page="faction"]');
    page.setAttribute('data-f', fid);
    var rel = ['hostile', 'friendly', 'neutral'].map(function (k) {
      var r = f.relations[k], o = FBY[r[0]];
      return '<div class="rel ' + k + '"><span class="k">' + REL_LABEL[k] + '</span><a href="#f-' + o.id + '"><strong>' + o.name + '</strong></a><span>' + esc(r[1]) + '</span></div>';
    }).join('');
    var abil = f.abilities.map(function (a) {
      return '<a class="fab" data-f="' + fid + '" href="#a-' + a.id + '"><span class="nm">' + esc(a.n) + branchChip(a.b) + '</span>' +
        '<span class="dp">' + fmtDP(a.c) + ' DP</span><span class="sub">' + esc(reqSummary(a) || a.t[a.t.length > 1 ? 1 : 0].replace(/[\[\]]|\{#|\}/g, '')) + '</span></a>';
    }).join('');
    var shop = '<div class="table-wrap"><table><thead><tr><th>商品</th><th class="num">價格 (DP)</th><th>說明</th></tr></thead><tbody>' +
      f.shop.items.map(function (i) { return '<tr><td>' + esc(i[0]) + '</td><td class="num">' + esc(i[1]) + '</td><td>' + fmt(i[2]) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
    var extra = '';
    if (f.extra) {
      var x = f.extra;
      extra = '<section class="block"><h2>' + x.title + '</h2>' + renderBody(x.t) +
        '<div class="table-wrap"><table><thead><tr><th>改造</th><th class="num">DP</th><th>成功條件</th><th>附帶效果</th></tr></thead><tbody>' +
        x.tiers.map(function (t) { return '<tr><td>' + t[0] + '</td><td class="num">' + t[1] + '</td><td class="num">' + fmt(t[2]) + '</td><td>' + t[3] + '</td></tr>'; }).join('') +
        '</tbody></table></div><h3>改造方向</h3><dl class="kv">' +
        x.options.map(function (o) { return '<dt>' + o[0] + '</dt><dd>' + fmt(o[1]) + '</dd>'; }).join('') +
        '</dl><p class="prose">' + esc(x.outro) + '</p></section>';
    }
    page.innerHTML =
      '<div class="faction-hero">' + emblem(fid) + '<div class="page-head"><span class="eyebrow">' + f.en + '</span><h1>' + f.name + '</h1>' +
      '<p class="lede">' + esc(f.motto) + '</p></div></div>' +
      '<dl class="kv"><dt>目標</dt><dd>' + esc(f.goal) + '</dd><dt>特色</dt><dd>' + esc(f.traits) + '</dd></dl>' +
      '<section class="block"><h2>勢力關係</h2><div class="rel-grid">' + rel + '</div></section>' +
      '<section class="block"><h2>加入</h2><dl class="kv">' +
        '<dt>入會費</dt><dd>' + (f.join.fee ? '<span class="dp">' + fmtDP(f.join.fee) + '</span> DP（創建角色時免費）' : '無') + '</dd>' +
        '<dt>陣營限制</dt><dd>' + esc(f.join.alignment) + '</dd>' +
        '<dt>條件</dt><dd>' + esc(f.join.condition) + '每人只能有一個勢力。</dd></dl>' +
        '<div class="card"><h3>勢力特性［' + f.trait.name + '］</h3>' + renderBody(f.trait.t) + '</div>' +
        (f.items.length ? '<h3>加入獲得的物品</h3><dl class="kv">' + f.items.map(function (i) { return '<dt>' + esc(i[0]) + '</dt><dd>' + esc(i[1]) + '</dd>'; }).join('') + '</dl>' : '') +
      '</section>' +
      '<section class="block"><h2>退出與驅除</h2><dl class="kv">' +
        '<dt>退出</dt><dd>' + (f.leave.fee ? '退會費 <span class="dp">' + fmtDP(f.leave.fee) + '</span> DP。' : '') + esc(f.leave.text) + '</dd>' +
        '<dt>驅除</dt><dd>' + esc(f.expel) + '驅逐通常伴隨內部調查與審判，GM 可安排審判場景或秘密處置程序。驅逐生效時，角色被正式記錄為逐出者。</dd></dl></section>' +
      '<section class="block"><h2>專屬能力</h2><div class="fab-list">' + abil + '</div></section>' +
      '<section class="block"><h2>專屬商店：' + f.shop.name + '</h2><p class="prose">' + esc(f.shop.intro) + '</p>' + shop + '</section>' + extra;
  }

  // ------------------------------------------------------------------ 購點規劃
  var plannerBuilt = false, confirmClear = false;
  function buildPlanner() {
    var page = $('[data-page="planner"]');
    page.innerHTML =
      '<div class="page-head"><span class="eyebrow">角色創造工具</span><h1>購點規劃</h1>' +
      '<p class="lede">配置 27 點購點屬性、選擇精通能力、挑選要購買的能力，即時計算剩餘 DP、熟練加值、生命值與魔力，並檢查先決條件與勢力限制。規劃只存在這個瀏覽器中。</p></div>' +
      '<div class="planner"><div class="main-col" style="display:grid;gap:20px;min-width:0">' +
        '<section class="card" id="p-attrs" aria-label="屬性值"></section>' +
        '<section class="card" id="p-specs" aria-label="精通能力"></section>' +
        '<section class="block" aria-label="能力"><h2>能力</h2>' +
          '<div class="picker"><input class="search" id="p-q" type="search" placeholder="搜尋能力並加入，例如：額外攻擊" autocomplete="off"><ul class="picker-results" id="p-res" hidden></ul></div>' +
          '<div id="p-global"></div>' +
          '<ul class="plist" id="p-list"></ul></section>' +
        '<div class="filter-row"><button type="button" class="btn ghost small" id="p-copy">複製角色摘要</button><span id="p-clear-wrap"></span></div>' +
        '<textarea class="copy-out" id="p-out" hidden readonly></textarea>' +
      '</div><aside class="side">' +
        '<div class="tiles" id="p-tiles"></div>' +
        '<div class="card form-grid">' +
          '<div class="field-row"><label class="field">起始 DP<input id="p-start" type="number" step="500" min="0"></label>' +
          '<label class="field">起源<select id="p-origin"><option value="">未選</option>' + ORIGINS.map(function (o) { return '<option value="' + o.id + '">' + o.id + '</option>'; }).join('') + '</select></label></div>' +
          '<label class="field">勢力<select id="p-faction"><option value="">不加入</option>' + FACTIONS.map(function (f) { return '<option value="' + f.id + '">' + f.name + '</option>'; }).join('') + '</select></label>' +
          '<p class="req-raw" id="p-notes"></p>' +
        '</div></aside></div>';

    $('#p-start').value = plan.start; $('#p-origin').value = plan.origin; $('#p-faction').value = plan.faction;
    $('#p-start').addEventListener('input', function (e) { plan.start = parseInt(e.target.value, 10) || 0; savePlan(); renderPlanner(); });
    $('#p-origin').addEventListener('change', function (e) { plan.origin = e.target.value; savePlan(); renderPlanner(); });
    $('#p-faction').addEventListener('change', function (e) { plan.faction = e.target.value; savePlan(); renderPlanner(); });

    // 屬性：購點與自由分配的加減
    $('#p-attrs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-op]'); if (!b || b.disabled) return;
      var k = b.getAttribute('data-attr'), op = b.getAttribute('data-op');
      if (op === 'base+') plan.base[k] = Math.min(PB_MAX, plan.base[k] + 1);
      if (op === 'base-') plan.base[k] = Math.max(PB_MIN, plan.base[k] - 1);
      if (op === 'free+') plan.free[k]++;
      if (op === 'free-') plan.free[k] = Math.max(0, plan.free[k] - 1);
      if (op === 'reset') { plan.base = fill(PB_MIN); plan.free = fill(0); }
      savePlan(); renderPlanner();
    });
    $('#p-attrs').addEventListener('input', function (e) {
      if (e.target.id !== 'p-budget') return;
      plan.budget = Math.max(0, parseInt(e.target.value, 10) || 0); savePlan(); renderPlanner(true);
    });

    // 精通能力：選擇、移除、填寫選項
    $('#p-specs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-spec-act]'); if (!b || b.disabled) return;
      var act = b.getAttribute('data-spec-act');
      if (act === 'add') {
        var name = $('#p-spec-sel').value; if (!name) return;
        var k = plan.specs.reduce(function (m, s) { return Math.max(m, s.k || 0); }, 0) + 1;
        plan.specs.push({ k: k, n: name, c: '' });
      }
      if (act === 'rm') {
        var key = +b.getAttribute('data-k');
        plan.specs = plan.specs.filter(function (s) { return s.k !== key; });
        trimToLimits();
      }
      savePlan(); renderPlanner();
    });
    $('#p-specs').addEventListener('input', function (e) {
      var key = e.target.getAttribute('data-k'); if (!key) return;
      plan.specs.forEach(function (s) { if (s.k === +key) s.c = e.target.value; });
      savePlan();
    });

    var q = $('#p-q'), res = $('#p-res');
    function drawResults() {
      var t = q.value.trim().toLowerCase();
      if (!t) { res.hidden = true; return; }
      var list = ALL.filter(function (a) {
        if (pickOf(a.id) && !a.rep) return false;
        return a.n.toLowerCase().indexOf(t) >= 0;
      }).slice(0, 40);
      res.innerHTML = list.map(function (a) {
        return '<li><button type="button" data-add="' + a.id + '"><span>' + branchChip(a.b) + ' ' + esc(a.n) + (a.src === 'faction' ? ' ' + factionChip(a.f) : '') + '</span><span class="dp">' + (a.c == null ? '待補' : fmtDP(a.c)) + '</span></button></li>';
      }).join('') || '<li class="empty">找不到名稱符合的能力。</li>';
      res.hidden = false;
    }
    q.addEventListener('input', drawResults);
    res.addEventListener('click', function (e) {
      var b = e.target.closest('[data-add]'); if (!b) return;
      addPick(b.getAttribute('data-add'));
      q.value = ''; res.hidden = true; q.focus();
      renderPlanner();
    });
    $('#p-list').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
      var id = b.getAttribute('data-id'), p = pickOf(id), act = b.getAttribute('data-act');
      if (act === 'rm') removePick(id);
      if (act === 'inc' && p) p.n++;
      if (act === 'dec' && p) { p.n--; if (p.n <= 0) removePick(id); }
      if (act === 'via' && p) p.via = !p.via;
      trimToLimits(); savePlan();
      renderPlanner();
    });
    $('#p-copy').addEventListener('click', function () {
      var text = summaryText(), out = $('#p-out');
      out.value = text; out.hidden = false;
      var done = function () { $('#p-copy').textContent = '已複製摘要'; };
      var fail = function () { out.focus(); out.select(); $('#p-copy').textContent = '已選取摘要，請手動複製'; };
      try { navigator.clipboard.writeText(text).then(done, fail); } catch (err) { fail(); }
    });
    $('#p-clear-wrap').addEventListener('click', function (e) {
      var b = e.target.closest('[data-clear]'); if (!b) return;
      var v = b.getAttribute('data-clear');
      if (v === 'ask') confirmClear = true;
      if (v === 'no') confirmClear = false;
      if (v === 'yes') { plan.picks = []; plan.specs = []; plan.base = fill(PB_MIN); plan.free = fill(0); savePlan(); confirmClear = false; }
      renderPlanner();
    });
    plannerBuilt = true;
  }

  function stepper(k, op, val, canDec, canInc, label) {
    return '<span class="stepper">' +
      '<button class="icon-btn" type="button" data-attr="' + k + '" data-op="' + op + '-"' + (canDec ? '' : ' disabled') + ' aria-label="' + k + label + '減少">−</button>' +
      '<span class="num">' + val + '</span>' +
      '<button class="icon-btn" type="button" data-attr="' + k + '" data-op="' + op + '+"' + (canInc ? '' : ' disabled') + ' aria-label="' + k + label + '增加">＋</button></span>';
  }
  function renderAttrs(s, keepBudgetFocus) {
    var at = s.attrs, left = plan.budget - at.used, freeLeft = at.pool - at.freeUsed;
    var rows = ATTRS.map(function (k) {
      var x = at.a[k];
      var nextCost = x.base < PB_MAX ? PB_COST[x.base + 1] - PB_COST[x.base] : 0;
      return '<tr' + (x.pre > ATTR_CAP ? ' class="over"' : '') + '><th scope="row">' + k + ' <span class="en">' + ATTR_EN[k] + '</span></th>' +
        '<td class="num total">' + x.total + '</td>' +
        '<td class="num mod">' + signed(x.mod) + '</td>' +
        '<td>' + stepper(k, 'base', x.base, x.base > PB_MIN, x.base < PB_MAX && nextCost <= left, '購點') + '</td>' +
        '<td class="num muted">' + PB_COST[x.base] + '</td>' +
        '<td class="num">' + (x.org ? '+' + x.org : '—') + '</td>' +
        '<td class="num">' + (x.gr ? '+' + x.gr : '—') + '</td>' +
        (at.pool ? '<td>' + stepper(k, 'free', x.fr, x.fr > 0, freeLeft > 0 && x.pre < ATTR_CAP, '自由分配') + '</td>' : '') +
        '<td class="num">' + (x.br ? '+' + x.br : '—') + '</td></tr>';
    }).join('');
    var msgs = [];
    msgs.push([left < 0 ? 'bad' : left === 0 ? 'ok' : 'warn', '購點已用 ' + at.used + ' / ' + plan.budget + ' 點' + (left < 0 ? '，超出 ' + (-left) + ' 點。' : left === 0 ? '，剛好用完。' : '，還剩 ' + left + ' 點。')]);
    if (at.pool) msgs.push([freeLeft < 0 ? 'bad' : freeLeft === 0 ? 'ok' : 'warn', '屬性值增加：可自由分配 ' + at.pool + ' 點，已分配 ' + at.freeUsed + ' 點' + (freeLeft > 0 ? '，還剩 ' + freeLeft + ' 點。' : '。')]);
    ATTRS.forEach(function (k) { if (at.a[k].pre > ATTR_CAP) msgs.push(['warn', k + ' 在極限突破前為 ' + at.a[k].pre + '，超過 20 的部分不計入。']); });

    var budgetInput = $('#p-budget');
    var focused = keepBudgetFocus && budgetInput && document.activeElement === budgetInput;
    var html =
      '<div class="card-head"><h3>屬性值</h3><span class="inline-confirm">' +
        '<label class="field inline">購點總額 <input id="p-budget" type="number" min="0" max="99" value="' + plan.budget + '"></label>' +
        '<button class="btn ghost small" type="button" data-op="reset">重設</button></span></div>' +
      '<div class="table-wrap"><table class="attr-table"><thead><tr><th>屬性</th><th class="num">總值</th><th class="num">調整值</th><th>購點</th><th class="num">花費</th><th class="num">起源</th><th class="num">成長能力</th>' +
        (at.pool ? '<th>自由分配</th>' : '') + '<th class="num">極限突破</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="msgs-block">' + msgs.map(function (m) { return '<p class="msg ' + m[0] + '">' + esc(m[1]) + '</p>'; }).join('') + '</div>' +
      '<p class="req-raw">購點值 8–15，花費 8=0、9=1、10=2、11=3、12=4、13=5、14=7、15=9。起源、【通用】X成長 與精通能力「屬性值增加」合計最高到 20；「極限突破」可以超過 20。</p>';
    if (focused) {
      // 正在輸入購點總額時，只更新表格與訊息，不重建輸入框
      var tmp = document.createElement('div'); tmp.innerHTML = html;
      $('#p-attrs .table-wrap').replaceWith(tmp.querySelector('.table-wrap'));
      $('#p-attrs .msgs-block').replaceWith(tmp.querySelector('.msgs-block'));
    } else {
      $('#p-attrs').innerHTML = html;
    }
  }
  function renderSpecs(s) {
    var free = s.spec - s.specUsed;
    var rows = plan.specs.map(function (sp) {
      var def = SPEC_BY[sp.n];
      var effect = sp.n === '屬性值增加' ? '在上方屬性表的「自由分配」欄分配 6 點。'
        : /^極限突破/.test(sp.n) ? '已自動加到屬性表。'
        : sp.n === '額外能力' ? '在下方能力清單按「以額外能力取得」，最多 2 個。'
        : SPEC_FLAT[sp.n] ? '已計入右側數值。' : '';
      return '<li class="prow" data-b="特殊"><span class="nm">' + esc(sp.n) + '</span>' +
        '<span class="ctl"><button class="icon-btn" type="button" data-spec-act="rm" data-k="' + sp.k + '" aria-label="移除 ' + esc(sp.n) + '">✕</button></span>' +
        '<span class="msgs">' +
          (def.opt && sp.n !== '額外能力' ? '<input class="spec-choice" type="text" data-k="' + sp.k + '" value="' + esc(sp.c || '') + '" placeholder="選擇：' + esc(def.opt) + '" aria-label="' + esc(sp.n) + ' 的選擇">' : '') +
          '<span class="req-raw">' + fmt(def.t[0]) + (effect ? '　<strong>' + effect + '</strong>' : '') + '</span></span></li>';
    }).join('');
    var options = '<option value="">選擇精通能力…</option>' + CORE.specialists.map(function (sp) {
      var have = specCount(sp.n);
      return '<option value="' + esc(sp.n) + '">' + esc(sp.n) + (have ? '（已有 ' + have + '）' : '') + '</option>';
    }).join('');
    var hint = '創角 1 個，能力數每滿 10 個再 +1（目前 ' + s.count + ' 個能力）' + (plan.origin === '特質' ? '，特質起源 +1' : '') + '。';
    if (free <= 0) hint += ' 再購買 ' + (s.nextSpecAt - s.count) + ' 個能力可以再選一個。';
    $('#p-specs').innerHTML =
      '<div class="card-head"><h3>精通能力</h3><span class="tag-count' + (free < 0 ? ' bad' : '') + '">已選 ' + s.specUsed + ' / 可選 ' + s.spec + '</span></div>' +
      '<p class="req-raw">' + hint + ' 同名精通能力可以重複選擇。<a href="#specialists">看全部精通能力</a></p>' +
      (free < 0 ? '<p class="msg bad">精通能力超出名額 ' + (-free) + ' 個，請移除或購買更多能力。</p>' : '') +
      (rows ? '<ul class="plist">' + rows + '</ul>' : '') +
      '<div class="filter-row"><select id="p-spec-sel" aria-label="選擇精通能力"' + (free > 0 ? '' : ' disabled') + '>' + options + '</select>' +
      '<button class="btn small" type="button" data-spec-act="add"' + (free > 0 ? '' : ' disabled') + '>選擇</button>' +
      (free > 0 ? '<span class="msg ok">還可以選 ' + free + ' 個。</span>' : '') + '</div>';
  }
  function renderPlanner(keepBudgetFocus) {
    var s = computePlan();
    renderAttrs(s, keepBudgetFocus);
    renderSpecs(s);
    var cntCls = s.count > ABILITY_CAP ? ' bad' : '';
    $('#p-tiles').innerHTML =
      '<div class="tile ' + (s.left < 0 ? 'bad' : 'accent') + '"><span class="k">剩餘 DP</span><span class="v">' + fmtDP(s.left) + '</span>' +
        '<div class="meter' + (s.left < 0 ? ' over' : '') + '"><i style="width:' + Math.min(100, plan.start ? s.spent / plan.start * 100 : 0) + '%"></i></div></div>' +
      '<div class="tile' + cntCls + '"><span class="k">能力數</span><span class="v">' + s.count + '<small> / ' + ABILITY_CAP + '</small></span></div>' +
      '<div class="tile"><span class="k">熟練加值</span><span class="v">+' + s.prof + '</span></div>' +
      '<div class="tile' + (s.specUsed > s.spec ? ' bad' : '') + '"><span class="k">精通能力</span><span class="v">' + s.specUsed + '<small> / ' + s.spec + '</small></span></div>' +
      '<div class="tile"><span class="k">最大生命值</span><span class="v">' + s.hp + '</span></div>' +
      '<div class="tile"><span class="k">魔力 MP</span><span class="v">' + s.mp + '</span></div>' +
      '<div class="tile"><span class="k">生命骰</span><span class="v">' + s.count + '<small>d10</small></span></div>' +
      '<div class="tile"><span class="k">法術容量</span><span class="v">' + s.slots + '</span></div>';

    var g = [];
    if (s.left < 0) g.push(['bad', 'DP 超支 ' + fmtDP(-s.left) + '。']);
    if (s.count > ABILITY_CAP) g.push(['bad', '創角時最多購買 ' + ABILITY_CAP + ' 個能力，目前 ' + s.count + ' 個。']);
    if (s.unknown) g.push(['warn', '含 ' + s.unknown + ' 個價格待補的能力，DP 未計入。']);
    if (droppedPicks.length) g.push(['warn', '規則書更新到 D 版：已從規劃中移除不再能購買的 ' + droppedPicks.join('、') + '（現在只剩同名的精通能力）。']);
    if (s.via > s.viaLimit) g.push(['bad', '以「額外能力」取得的能力超過 ' + s.viaLimit + ' 個。']);
    var f = plan.faction && FBY[plan.faction];
    if (f) g.push(['ok', '已加入「' + f.name + '」：獲得特性［' + f.trait.name + '］' + (f.join.fee ? '，創角時免入會費 ' + fmtDP(f.join.fee) + ' DP' : '') + '。']);
    $('#p-global').innerHTML = g.map(function (m) { return '<p class="msg ' + m[0] + '">' + m[1] + '</p>'; }).join('');

    var notes = ['體質調整值 ' + signed(s.con) + '、施法調整值 ' + signed(s.cast) + '（取自屬性表）。',
                 '生命值＝10＋體質調整值＋各能力依分支成長（含體質調整值）；魔力＝施法調整值＋魔法類能力數。'];
    if (plan.origin === '奧秘') notes.push('奧秘起源：魔力 +5。');
    if (plan.faction === 'iron') notes.push('帝國烙印：最大生命值 +20；消耗魔力時會受到反噬傷害。');
    if (plan.faction === 'arcane') notes.push('秘術祕紋：魔力 +3、法術容量 +5。');
    if (pickOf(BY_NAME['龍之血脈'] && BY_NAME['龍之血脈'].id)) notes.push('龍之血脈：生命值 +1，之後每習得一個能力再 +1，未自動計入。');
    $('#p-notes').textContent = notes.join(' ');

    var viaLeft = s.viaLimit - s.via;
    var items = plan.picks.map(function (p) { return { p: p, a: BY_ID[p.id] }; });
    $('#p-list').innerHTML = items.length ? items.map(function (x) {
      var a = x.a, p = x.p, msgs = pickMessages(a);
      var ctl = a.rep
        ? '<button class="icon-btn" type="button" data-act="dec" data-id="' + a.id + '" aria-label="減少">−</button><span class="num">×' + p.n + '</span><button class="icon-btn" type="button" data-act="inc" data-id="' + a.id + '" aria-label="增加"' + (p.via && viaLeft <= 0 ? ' disabled' : '') + '>＋</button>'
        : '';
      var viaBtn = (s.viaLimit || p.via)
        ? '<button class="btn ghost small via" type="button" data-act="via" data-id="' + a.id + '" aria-pressed="' + !!p.via + '"' + (!p.via && viaLeft < p.n ? ' disabled' : '') + '>' + (p.via ? '✓ 額外能力' : '以額外能力取得') + '</button>'
        : '';
      if (p.via) msgs.unshift(['ok', '以精通能力「額外能力」取得：視為特性，不花 DP、不計入能力數與生命值／魔力成長。']);
      return '<li class="prow" data-b="' + a.b + '"><span class="nm"><a href="#a-' + a.id + '">' + esc(a.n) + '</a>' + branchChip(a.b) + (a.src === 'faction' ? factionChip(a.f) : '') + '</span>' +
        '<span class="ctl">' + viaBtn + '<span class="dp" style="color:var(--accent)">' + (p.via ? '特性' : a.c == null ? '待補' : fmtDP(a.c * p.n)) + '</span>' + ctl +
        '<button class="icon-btn" type="button" data-act="rm" data-id="' + a.id + '" aria-label="移除 ' + esc(a.n) + '">✕</button></span>' +
        (msgs.length ? '<span class="msgs">' + msgs.map(function (m) { return '<span class="msg ' + m[0] + '">' + esc(m[1]) + '</span>'; }).join('') + '</span>' : '') +
        '</li>';
    }).join('') : '<li class="empty">還沒有選擇能力。用上方搜尋框加入，或在<a href="#abilities">能力目錄</a>按「加入購點規劃」。</li>';

    var hasAny = items.length || plan.specs.length;
    $('#p-clear-wrap').innerHTML = !hasAny ? '' : confirmClear
      ? '<span class="inline-confirm">確定清空屬性、精通能力與全部 ' + items.length + ' 個能力？<button class="btn small" type="button" data-clear="yes">清空</button><button class="btn ghost small" type="button" data-clear="no">取消</button></span>'
      : '<button class="btn ghost small" type="button" data-clear="ask">清空規劃</button>';
  }
  function summaryText() {
    var s = computePlan(), lines = [];
    lines.push('【深淵的探索者 角色購點】');
    lines.push('起源：' + (plan.origin ? plan.origin + '起源' : '未選') + '　勢力：' + (plan.faction ? FBY[plan.faction].name : '無'));
    lines.push('屬性：' + ATTRS.map(function (k) { var x = s.attrs.a[k]; return k + ' ' + x.total + '(' + signed(x.mod) + ')'; }).join('　') +
               '　〔購點 ' + s.attrs.used + '/' + plan.budget + '〕');
    lines.push('DP：花費 ' + fmtDP(s.spent) + ' / ' + fmtDP(plan.start) + '（剩餘 ' + fmtDP(s.left) + '）');
    lines.push('能力數 ' + s.count + '　熟練加值 +' + s.prof + '　精通能力 ' + s.specUsed + '/' + s.spec);
    lines.push('最大生命值 ' + s.hp + '　魔力 ' + s.mp + '　生命骰 ' + s.count + 'd10　法術容量 ' + s.slots);
    if (plan.specs.length) {
      lines.push('');
      lines.push('〔精通能力〕');
      plan.specs.forEach(function (sp) {
        var extra = sp.c ? '：' + sp.c : '';
        if (sp.n === '屬性值增加') extra = '：' + ATTRS.filter(function (k) { return plan.free[k]; }).map(function (k) { return k + '+' + plan.free[k]; }).join('、');
        lines.push('・' + sp.n + extra);
      });
    }
    lines.push('');
    BRANCHES.forEach(function (b) {
      var list = plan.picks.filter(function (p) { return BY_ID[p.id].b === b; });
      if (!list.length) return;
      lines.push('〔' + b + '〕');
      list.forEach(function (p) {
        var a = BY_ID[p.id];
        lines.push('・' + a.n + (p.n > 1 ? ' ×' + p.n : '') + '（' + (p.via ? '額外能力' : a.c == null ? '價格待補' : fmtDP(a.c * p.n) + ' DP') + '）');
      });
    });
    return lines.join('\n');
  }

  // 點規則文字裡的 #標籤：清掉其他篩選，只列出該標籤的能力
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-tag]');
    if (!t) return;
    e.preventDefault();
    F = Object.assign({}, F_DEFAULT, { tag: t.getAttribute('data-tag'), tagWide: t.hasAttribute('data-wide'), sort: F.sort });
    store('dex-filters', F);
    listLimit = 150;
    if (catalogBuilt) syncControls();
    if (location.hash === '#abilities') { renderList(); window.scrollTo(0, 0); }
    else location.hash = 'abilities';
  });

  // ------------------------------------------------------------------ 路由
  var built = {};
  function setPage(name) {
    $$('[data-page]').forEach(function (el) { el.hidden = el.getAttribute('data-page') !== name; });
  }
  function setNav(key) {
    $$('[data-nav]').forEach(function (a) {
      if (a.getAttribute('data-nav') === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  var TITLES = { home: '總覽', create: '角色創造', rules: '規則', abilities: '能力目錄', specialists: '精通能力', factions: '四大勢力', planner: '購點規劃' };
  var lastPage = null;
  function route() {
    var h = decodeURIComponent(location.hash.slice(1)) || 'home';
    var legacy = /^a-(m\d{3})$/.exec(h);
    if (legacy && LEGACY[legacy[1]]) { location.replace('#a-' + LEGACY[legacy[1]]); return; }
    var page = h, nav = h;
    if (h.indexOf('a-') === 0) { page = 'abilities'; nav = 'abilities'; }
    else if (h.indexOf('f-') === 0 && FBY[h.slice(2)]) { page = 'faction'; }
    else if (!TITLES[h]) { page = 'home'; nav = 'home'; }

    setPage(page); setNav(nav);
    if (page === 'abilities') {
      showCatalog(h.indexOf('a-') === 0 ? h.slice(2) : null);
    } else {
      if (page === 'specialists' && !built.spec) { buildSpecialists(); built.spec = true; }
      if (page === 'factions' && !built.factions) { buildFactions(); built.factions = true; }
      if (page === 'faction') buildFaction(h.slice(2));
      if (page === 'planner') { if (!plannerBuilt) buildPlanner(); renderPlanner(); }
      document.title = (page === 'faction' ? FBY[h.slice(2)].name : TITLES[page]) + '｜深淵的探索者 維基';
    }
    if (page !== lastPage || page === 'faction') window.scrollTo(0, 0);
    lastPage = page;
  }
  window.addEventListener('hashchange', route);
  route();
})();
