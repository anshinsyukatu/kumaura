/*
 * クマうら 計算エンジン（JavaScript移植）
 *
 * Androidアプリ「クマうら」の Java 計算エンジン
 * (jp.kuma.uranai.ShichuEngine / AstroEngine / PrefTable / LuckCurve /
 *  TesouSelect の平滑化ヘルパー / GenderPolicy / PairGraph / WheelGeom)
 * を忠実に移植した単一ファイル。計算式・定数表は Java 版と一字一句
 * 同じ値を用いる。
 *
 * ブラウザでは window.UE（self.UE）、Node では module.exports として使う。
 */
(function (root) {
  "use strict";

  // ================================================================
  // TesouSelect の平滑化ヘルパー（Catmull-Rom 補間）
  // Java: TesouSelect.catmullRom / smoothLinePoints
  // ================================================================
  function catmullRom(pm, p0, p1, p2, t) {
    var t2 = t * t, t3 = t2 * t;
    var out = [0, 0];
    for (var a = 0; a < 2; a++) {
      out[a] = 0.5 * ((2 * p0[a])
        + (-pm[a] + p1[a]) * t
        + (2 * pm[a] - 5 * p0[a] + 4 * p1[a] - p2[a]) * t2
        + (-pm[a] + 3 * p0[a] - 3 * p1[a] + p2[a]) * t3);
    }
    return out;
  }

  function smoothLinePoints(pts, samplesPerSegment) {
    var n = pts.length;
    var out = new Array((n - 1) * samplesPerSegment + 1);
    var k = 0, i, s;
    for (i = 0; i < n - 1; i++) {
      var pm = pts[Math.max(0, i - 1)];
      var p0 = pts[i], p1 = pts[i + 1];
      var p2 = pts[Math.min(n - 1, i + 2)];
      for (s = 0; s < samplesPerSegment; s++) {
        out[k++] = catmullRom(pm, p0, p1, p2, s / samplesPerSegment);
      }
    }
    out[k] = [pts[n - 1][0], pts[n - 1][1]];
    return out;
  }

  // ================================================================
  // ShichuEngine（四柱推命エンジン）
  // ================================================================
  var KAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  var SHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  // 五行: 0=木 1=火 2=土 3=金 4=水
  var GOGYO_NAME = ["木", "火", "土", "金", "水"];
  var KAN_GOGYO = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4];
  function gogyoOfStem(stem) { return KAN_GOGYO[stem]; }
  var SHI_GOGYO = [4, 2, 0, 0, 2, 1, 1, 2, 3, 3, 2, 4];

  var TSUHEN = [
    "比肩", "劫財", "食神", "傷官", "偏財", "正財", "偏官", "正官", "偏印", "正印"
  ];
  var JUNIUN = [
    "長生", "沐浴", "冠帯", "建禄", "帝旺", "衰", "病", "死", "墓", "絶", "胎", "養"
  ];
  // 日干ごとの「長生」の地支インデックス
  var CHOSEI = [11, 6, 2, 9, 2, 9, 5, 0, 8, 3];

  // 12の「節」: 目標黄経と、その節から始まる月支
  var SETU_LON = [285, 315, 345, 15, 45, 75, 105, 135, 165, 195, 225, 255];
  var SETU_BRANCH = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0]; // 丑寅卯辰巳午未申酉戌亥子
  // 各節のおおよその日付（初期推定用、月×100＋日）
  var SETU_APPROX = [106, 204, 306, 405, 506, 606, 707, 808, 908, 1008, 1107, 1207];

  // Java の整数除算（0方向への切り捨て）
  function idiv(a, b) { return Math.trunc(a / b); }

  /** グレゴリオ暦 → ユリウス通日（JDN, 整数） */
  function jdn(y, m, d) {
    var a = idiv(14 - m, 12);
    var y2 = y + 4800 - a;
    var m2 = m + 12 * a - 3;
    return d + idiv(153 * m2 + 2, 5) + 365 * y2 + idiv(y2, 4) - idiv(y2, 100) + idiv(y2, 400) - 32045;
  }

  /** JSTの日時 → ユリウス日（JD, 実数） */
  function jdFromJst(y, mo, d, h, mi) {
    return jdn(y, mo, d) + (h - 21) / 24.0 + mi / 1440.0;
  }

  /** JDN → グレゴリオ暦 [年,月,日] */
  function civilFromJdn(j) {
    var a = j;
    if (j >= 2299161) {
      var alpha = Math.floor((j - 1867216.25) / 36524.25);
      a = j + 1 + alpha - idiv(alpha, 4);
    }
    var b = a + 1524, c = Math.floor((b - 122.1) / 365.25);
    var dd = Math.floor(365.25 * c);
    var e = Math.floor((b - dd) / 30.6001);
    var day = b - dd - Math.floor(30.6001 * e);
    var month = (e < 14 ? e - 1 : e - 13);
    var year = (month > 2 ? c - 4716 : c - 4715);
    return [year, month, day];
  }

  /** JD → JSTの日時 [年,月,日,時,分] */
  function jstFromJd(jd) {
    var j = jd + 9.0 / 24.0 + 0.5;
    var z = Math.floor(j);
    var f = j - z;
    var a = z;
    if (z >= 2299161) {
      var alpha = Math.floor((z - 1867216.25) / 36524.25);
      a = z + 1 + alpha - idiv(alpha, 4);
    }
    var b = a + 1524, c = Math.floor((b - 122.1) / 365.25);
    var dd = Math.floor(365.25 * c);
    var e = Math.floor((b - dd) / 30.6001);
    var day = b - dd - Math.floor(30.6001 * e);
    var month = (e < 14 ? e - 1 : e - 13);
    var year = (month > 2 ? c - 4716 : c - 4715);
    var mins = Math.round(f * 1440.0);
    if (mins >= 1440) { // 丸めで日を跨いだ場合は翌日0:00扱い
      mins -= 1440;
      var j2 = jdn(year, month, day) + 1;
      var nd = civilFromJdn(j2);
      year = nd[0]; month = nd[1]; day = nd[2];
    }
    return [year, month, day, idiv(mins, 60), mins % 60];
  }

  // ---------- 太陽視黄経（Meeus 簡易式、精度 約0.01°） ----------
  function sunApparentLongitude(jd) {
    var t = (jd - 2451545.0) / 36525.0;
    var l0 = 280.46646 + t * (36000.76983 + 0.0003032 * t);
    var m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
    var e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
    var mr = m * Math.PI / 180.0;
    var c = (1.914602 - t * (0.004817 + 0.000014 * t)) * Math.sin(mr)
      + (0.019993 - 0.000101 * t) * Math.sin(2 * mr)
      + 0.000289 * Math.sin(3 * mr);
    var trueLong = l0 + c;
    var omega = 125.04 - 1934.136 * t;
    var lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * Math.PI / 180.0);
    lambda %= 360.0;
    if (lambda < 0) lambda += 360.0;
    return lambda;
  }

  /** 黄経の符号付き差（target - current を -180..180 に正規化） */
  function lonDiff(target, current) {
    var d = (target - current) % 360.0;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }

  /**
   * 指定した年に起こる節（目標黄経）の瞬間を JD で返す。
   * 概算日から ±4日をブラケットに二分法で反解する（黄経は単調増加）。
   */
  function setuJd(year, setuIndex) {
    var approx = SETU_APPROX[setuIndex];
    var mo = idiv(approx, 100), dy = approx % 100;
    var center = jdFromJst(year, mo, dy, 12, 0);
    var target = SETU_LON[setuIndex];
    var lo = center - 4.0, hi = center + 4.0;
    // f(t) = lonDiff(target, λ(t))。λ増加で f は減少する。
    for (var i = 0; i < 80; i++) {
      var mid = (lo + hi) / 2.0;
      var f = lonDiff(target, sunApparentLongitude(mid));
      if (f > 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2.0;
  }

  /** 前後3年分の全節JDを時刻順に返す（月柱・大運判定用） */
  function setuSeries(centerYear) {
    var arr = new Array(36);
    var k = 0;
    for (var y = centerYear - 1; y <= centerYear + 1; y++)
      for (var s = 0; s < 12; s++) arr[k++] = setuJd(y, s);
    arr.sort(function (p, q) { return p - q; });
    return arr;
  }

  /** JDから節インデックスを逆引きする（最も近い節入りの黄経で判定） */
  function setuIndexOf(setuJdVal, approxYear) {
    var best = -1, bestDiff = 1e9;
    for (var y = approxYear - 1; y <= approxYear + 1; y++) {
      for (var s = 0; s < 12; s++) {
        var d = Math.abs(setuJd(y, s) - setuJdVal);
        if (d < bestDiff) { bestDiff = d; best = s; }
      }
    }
    return best;
  }

  // ---------- 干支の基本 ----------
  function kanjiOf(pillarIdx) {
    var p = ((pillarIdx % 60) + 60) % 60;
    return KAN[p % 10] + SHI[p % 12];
  }
  function stemOf(pillarIdx) { return ((pillarIdx % 60) + 60) % 60 % 10; }
  function branchOf(pillarIdx) { return ((pillarIdx % 60) + 60) % 60 % 12; }

  /** 日干から見た対象天干の通変星インデックス（0..9） */
  function tsuhenIndex(dayStem, targetStem) {
    var eD = KAN_GOGYO[dayStem], eT = KAN_GOGYO[targetStem];
    var sameYang = (dayStem % 2) === (targetStem % 2);
    var rel; // 0=同じ五行 1=日干が生む 2=日干が剋す 3=日干を剋す 4=日干を生む
    if (eT === eD) rel = 0;
    else if (eT === (eD + 1) % 5) rel = 1;
    else if (eT === (eD + 2) % 5) rel = 2;
    else if (eD === (eT + 2) % 5) rel = 3;
    else rel = 4; // eD == (eT+1)%5
    switch (rel) {
      case 0: return sameYang ? 0 : 1;  // 比肩 / 劫財
      case 1: return sameYang ? 2 : 3;  // 食神 / 傷官
      case 2: return sameYang ? 4 : 5;  // 偏財 / 正財
      case 3: return sameYang ? 6 : 7;  // 偏官 / 正官
      default: return sameYang ? 8 : 9; // 偏印 / 正印
    }
  }

  /** 日干×地支の十二運星インデックス（0..11） */
  function juniunIndex(dayStem, branch) {
    var chosei = CHOSEI[dayStem];
    var yang = (dayStem % 2) === 0;
    var pos = yang ? (branch - chosei + 12) % 12 : (chosei - branch + 12) % 12;
    return pos;
  }

  /** 経過年数（誕生日到来で加算する満年齢）。refDate は基準日。 */
  function ageAt(by, bm, bd, ry, rm, rd) {
    var age = ry - by;
    if (rm < bm || (rm === bm && rd < bd)) age--;
    return age;
  }

  var HOSHI_GROUP_NAME = ["土星", "金星", "火星", "天王星", "木星", "水星"];

  function pillarIndex(stem, branch) {
    for (var i = 0; i < 60; i++) if (i % 10 === stem && i % 12 === branch) return i;
    return 0;
  }

  function clampScore(v) {
    if (v < 0) v = 0;
    if (v > 10) v = 10;
    return Math.round(v * 10.0) / 10.0;
  }

  /** 傾向ラベル（仕様 §4.1）。レベル 6.0以上=好調、4.5以上=平穏、それ未満=注意。 */
  function levelLabel(level) {
    if (level >= 6.0) return "好調";
    if (level >= 4.5) return "平穏";
    return "注意";
  }

  /** 年運レベル（仕様 §4 の対応表＋補正）。大運の傾向判定にも同じ式を使う（§4.1）。 */
  function nenunLevel(juniunIdx, tsuhenIdx) {
    var base;
    switch (juniunIdx) {
      case 4: base = 9.0; break;  // 帝旺
      case 3: base = 8.5; break;  // 建禄
      case 0: base = 7.5; break;  // 長生
      case 2: base = 7.0; break;  // 冠帯
      case 11: base = 6.0; break; // 養
      case 1: base = 5.5; break;  // 沐浴
      case 10: base = 5.0; break; // 胎
      case 5: base = 4.5; break;  // 衰
      case 8: base = 4.0; break;  // 墓
      case 6: base = 3.5; break;  // 病
      case 7: base = 3.0; break;  // 死
      default: base = 2.5; break; // 絶
    }
    var corr;
    switch (tsuhenIdx) {
      case 7: corr = 0.5; break;  // 正官
      case 5: corr = 0.5; break;  // 正財
      case 4: corr = 0.3; break;  // 偏財
      case 2: corr = 0.4; break;  // 食神
      case 9: corr = 0.4; break;  // 正印
      case 0: corr = 0.0; break;  // 比肩
      case 8: corr = -0.2; break; // 偏印
      case 1: corr = -0.3; break; // 劫財
      case 3: corr = -0.4; break; // 傷官
      case 6: corr = -0.5; break; // 偏官
      default: corr = 0.0;
    }
    return clampScore(base + corr);
  }

  /**
   * 四柱推命の全計算。
   * by,bm,bd 出生年月日（JST） / hh,mi 出生時刻（JST）
   * male 性別（大運の順逆判定） / ry,rm,rd 基準日（鑑定日）
   */
  function shichuCompute(by, bm, bd, hh, mi, male, ry, rm, rd) {
    var r = {};
    var birthJd = jdFromJst(by, bm, bd, hh, mi);
    var setus = setuSeries(by);

    // --- 年柱（立春切替） ---
    var risshun = setuJd(by, 1); // 立春は index 1
    var effYear = (birthJd < risshun) ? by - 1 : by;
    r.yearIdx = ((effYear - 4) % 60 + 60) % 60;
    var yearStem = stemOf(r.yearIdx);

    // --- 月柱（節＋五虎遁） ---
    var prevSetu = -Infinity;
    for (var si = 0; si < setus.length; si++) {
      var sv = setus[si];
      if (sv <= birthJd && sv > prevSetu) prevSetu = sv;
    }
    var sIdx = setuIndexOf(prevSetu, by);
    var monthBranch = SETU_BRANCH[sIdx];
    // 五虎遁：年干 → 寅月の干
    var toraStem;
    switch (yearStem) {
      case 0: case 5: toraStem = 2; break;   // 甲・己 → 丙
      case 1: case 6: toraStem = 4; break;   // 乙・庚 → 戊
      case 2: case 7: toraStem = 6; break;   // 丙・辛 → 庚
      case 3: case 8: toraStem = 8; break;   // 丁・壬 → 壬
      default: toraStem = 0; break;          // 戊・癸 → 甲
    }
    var monthOffset = (monthBranch - 2 + 12) % 12;
    var monthStem = (toraStem + monthOffset) % 10;
    r.monthIdx = pillarIndex(monthStem, monthBranch);

    // --- 日柱（(JDN+49) mod 60） ---
    var dayJdn = jdn(by, bm, bd);
    r.dayIdx = (dayJdn + 49) % 60;
    r.dayStem = r.dayIdx % 10;

    // --- 時柱（五鼠遁） ---
    var hourBranch = idiv(hh + 1, 2) % 12;
    var neStem;
    switch (r.dayStem) {
      case 0: case 5: neStem = 0; break;  // 甲・己 → 甲
      case 1: case 6: neStem = 2; break;  // 乙・庚 → 丙
      case 2: case 7: neStem = 4; break;  // 丙・辛 → 戊
      case 3: case 8: neStem = 6; break;  // 丁・壬 → 庚
      default: neStem = 8; break;         // 戊・癸 → 壬
    }
    var hourOffset = hourBranch; // 子時が起点
    var hourStem = (neStem + hourOffset) % 10;
    r.hourIdx = pillarIndex(hourStem, hourBranch);

    var pillars = [r.yearIdx, r.monthIdx, r.dayIdx, r.hourIdx];

    // --- 通変星・十二運星 ---
    r.tsuhen = [0, 0, 0, 0];
    r.juniun = [0, 0, 0, 0];
    var i;
    for (i = 0; i < 4; i++) {
      r.tsuhen[i] = (i === 2) ? -1 : tsuhenIndex(r.dayStem, stemOf(pillars[i]));
      r.juniun[i] = juniunIndex(r.dayStem, branchOf(pillars[i]));
    }

    // --- 五行・通変星カウント（スコア用） ---
    r.gogyoCount = [0, 0, 0, 0, 0];
    r.tsuhenCount = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (i = 0; i < 4; i++) {
      r.gogyoCount[KAN_GOGYO[stemOf(pillars[i])]]++;
      r.gogyoCount[SHI_GOGYO[branchOf(pillars[i])]]++;
      if (i !== 2) r.tsuhenCount[r.tsuhen[i]]++;
    }

    // --- スコア（仕様 §6.3） ---
    var T = r.tsuhenCount;
    r.scoreWork = clampScore(5.0 + 1.1 * T[7] + 0.7 * T[6] + 0.6 * T[9] + 0.3 * T[8] + 0.3 * T[2] - 0.9 * T[3] - 0.4 * T[1]);
    r.scoreMoney = clampScore(5.0 + 1.1 * T[5] + 0.8 * T[4] + 0.4 * T[2] + 0.3 * T[3] - 0.7 * T[1] - 0.3 * T[0]);
    r.scoreLove = clampScore(5.0 + 0.7 * T[5] + 0.5 * T[4] + 0.5 * T[2] + 0.3 * T[7] - 0.6 * T[3] - 0.4 * T[1]);
    var gmax = 0, gmin = 8, g;
    for (g = 0; g < r.gogyoCount.length; g++) {
      var gv = r.gogyoCount[g];
      if (gv > gmax) gmax = gv;
      if (gv < gmin) gmin = gv;
    }
    r.scoreHealth = clampScore(10.0 - 1.1 * (gmax - gmin));
    var avg = (r.scoreWork + r.scoreMoney + r.scoreLove + r.scoreHealth) / 4.0;
    r.scoreTotal = Math.round(avg * 10.0) / 10.0;

    // --- 大運 ---
    var yangYear = (yearStem % 2) === 0;
    r.daiunForward = (yangYear === male);
    var targetSetu;
    if (r.daiunForward) {
      targetSetu = Infinity;
      for (si = 0; si < setus.length; si++) {
        sv = setus[si];
        if (sv > birthJd && sv < targetSetu) targetSetu = sv;
      }
    } else {
      targetSetu = prevSetu;
    }
    var days = Math.abs(targetSetu - birthJd);
    r.daiunStartMonths = Math.round(days * 4.0); // 3日=1年 → 日数×4=月数
    r.daiun = new Array(10);
    for (var k = 0; k < 10; k++) {
      var du = {};
      du.pillarIdx = r.daiunForward ? (r.monthIdx + k + 1) % 60
        : ((r.monthIdx - k - 1) % 60 + 60) % 60;
      du.startMonths = r.daiunStartMonths + k * 120;
      du.startYear = by + idiv(du.startMonths, 12);
      du.tsuhen = tsuhenIndex(r.dayStem, stemOf(du.pillarIdx));
      du.juniun = juniunIndex(r.dayStem, branchOf(du.pillarIdx));
      du.level = nenunLevel(du.juniun, du.tsuhen);
      r.daiun[k] = du;
    }

    // --- 年運（基準年の前後） ---
    r.nenun = new Array(9);
    for (i = 0; i < 9; i++) {
      var y = ry - 3 + i;
      var n = {};
      n.year = y;
      n.pillarIdx = ((y - 4) % 60 + 60) % 60;
      n.tsuhen = tsuhenIndex(r.dayStem, stemOf(n.pillarIdx));
      n.juniun = juniunIndex(r.dayStem, branchOf(n.pillarIdx));
      n.level = nenunLevel(n.juniun, n.tsuhen);
      r.nenun[i] = n;
    }

    // --- 星めぐり（星数＝日柱の干支番号） ---
    r.hoshiNumber = r.dayIdx + 1;
    r.hoshiGroup = idiv(r.hoshiNumber - 1, 10);
    var calYearBranch = ((by - 4) % 12 + 12) % 12; // 暦年基準（推奨デフォルト）
    r.hoshiPlus = (calYearBranch % 2) === 0; // 子寅辰午申戌 = 偶数インデックス = 陽

    // --- 年齢（満年齢・動的計算） ---
    r.age = ageAt(by, bm, bd, ry, rm, rd);
    return r;
  }

  // ================================================================
  // AstroEngine（西洋占星術エンジン、Schlyter法）
  // ================================================================
  var SUN = 0, MOON = 1, MERCURY = 2, VENUS = 3, MARS = 4,
    JUPITER = 5, SATURN = 6, URANUS = 7, NEPTUNE = 8, PLUTO = 9;
  var BODY_NAME = [
    "太陽", "月", "水星", "金星", "火星", "木星", "土星", "天王星", "海王星", "冥王星"
  ];
  var SIGNS = [
    "牡羊座", "牡牛座", "双子座", "蟹座", "獅子座", "乙女座",
    "天秤座", "蠍座", "射手座", "山羊座", "水瓶座", "魚座"
  ];

  // 軌道要素（Schlyter）。各要素は [値, 日あたりの変化率]。並びは N, i, w, a, e, M。
  // 冥王星は要素法を使わないため含めない。
  var ELEMENTS = [
    // 太陽
    [[0.0, 0.0], [0.0, 0.0], [282.9404, 4.70935e-5], [1.000000, 0.0], [0.016709, -1.151e-9], [356.0470, 0.9856002585]],
    // 月
    [[125.1228, -0.0529538083], [5.1454, 0.0], [318.0634, 0.1643573223], [60.2666, 0.0], [0.054900, 0.0], [115.3654, 13.0649929509]],
    // 水星
    [[48.3313, 3.24587e-5], [7.0047, 5.00e-8], [29.1241, 1.01444e-5], [0.387098, 0.0], [0.205635, 5.59e-10], [168.6562, 4.0923344368]],
    // 金星
    [[76.6799, 2.46590e-5], [3.3946, 2.75e-8], [54.8910, 1.38374e-5], [0.723330, 0.0], [0.006773, -1.302e-9], [48.0052, 1.6021302244]],
    // 火星
    [[49.5574, 2.11081e-5], [1.8497, -1.78e-8], [286.5016, 2.92961e-5], [1.523688, 0.0], [0.093405, 2.516e-9], [18.6021, 0.5240207766]],
    // 木星
    [[100.4542, 2.76854e-5], [1.3030, -1.557e-7], [273.8777, 1.64505e-5], [5.20256, 0.0], [0.048498, 4.469e-9], [19.8950, 0.0830853001]],
    // 土星
    [[113.6634, 2.38980e-5], [2.4886, -1.081e-7], [339.3939, 2.97661e-5], [9.55475, 0.0], [0.055546, -9.499e-9], [316.9670, 0.0334442282]],
    // 天王星
    [[74.0005, 1.3978e-5], [0.7733, 1.9e-8], [96.6612, 3.0565e-5], [19.18171, -1.55e-8], [0.047318, 7.45e-9], [142.5905, 0.011725806]],
    // 海王星
    [[131.7806, 3.0173e-5], [1.7700, -2.55e-7], [272.8461, -6.027e-6], [30.05826, 3.313e-8], [0.008606, 2.15e-9], [260.2471, 0.005995147]]
  ];
  var EL_N = 0, EL_I = 1, EL_W = 2, EL_A = 3, EL_E = 4, EL_M = 5;

  // ---------- 角度ユーティリティ ----------
  function rev(x) { return x - Math.floor(x / 360.0) * 360.0; }
  function sind(x) { return Math.sin(x * Math.PI / 180.0); }
  function cosd(x) { return Math.cos(x * Math.PI / 180.0); }
  function toDegrees(rad) { return rad * 180.0 / Math.PI; }
  function toRadians(deg) { return deg * Math.PI / 180.0; }

  /** 2つの黄経の最小の差（0〜180、絶対値） */
  function lonDiffAbs(a, b) {
    var d = Math.abs(rev(a) - rev(b)) % 360.0;
    return d > 180.0 ? 360.0 - d : d;
  }

  // ---------- タイムゾーン（夏時間分岐） ----------
  /** その月の第 n 土曜日の日（1始まり） */
  function nthSaturdayDay(year, month, n) {
    // Java Calendar: 日=1 .. 土=7。JS Date(UTC): 日=0 .. 土=6 なので +1 で合わせる。
    var dow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 1;
    var saturday = 7; // Calendar.SATURDAY
    var offset = (saturday - dow + 7) % 7;
    return 1 + offset + 7 * (n - 1);
  }

  /**
   * 日本の地方時に対する UTC オフセット（時間）。
   * 1948〜1951年の夏時間期間内は +10、それ以外は +9。
   */
  function jstOffsetHours(y, mo, d, h, mi) {
    if (y < 1948 || y > 1951) return 9.0;
    var startMonth = (y === 1949) ? 4 : 5;
    var startTotal = (jdn(y, startMonth, nthSaturdayDay(y, startMonth, 1)) + 1) * 1440;
    var endTotal = (jdn(y, 9, nthSaturdayDay(y, 9, 2)) + 1) * 1440;
    var localTotal = jdn(y, mo, d) * 1440 + h * 60 + mi;
    return (localTotal >= startTotal && localTotal < endTotal) ? 10.0 : 9.0;
  }

  // ---------- 軌道要素 → 座標 ----------
  function elAt(body, which, d) {
    var v = ELEMENTS[body][which];
    return v[0] + v[1] * d;
  }

  /** 軌道要素から黄道座標 [lon, lat, r, x, y, z] を返す。月は地心（a は地球半径）。 */
  function eclipticFromElements(body, d) {
    var N = elAt(body, EL_N, d), inc = elAt(body, EL_I, d), w = elAt(body, EL_W, d);
    var a = elAt(body, EL_A, d), e = elAt(body, EL_E, d), M = rev(elAt(body, EL_M, d));
    // 離心近点角 E（Newton 法、度単位）
    var E = M + toDegrees(e) * sind(M) * (1.0 + e * cosd(M));
    for (var k = 0; k < 50; k++) {
      var dE = (E - toDegrees(e) * sind(E) - M) / (1.0 - e * cosd(E));
      E -= dE;
      if (Math.abs(dE) < 1e-8) break;
    }
    var xv = a * (cosd(E) - e);
    var yv = a * (Math.sqrt(1.0 - e * e) * sind(E));
    var v = toDegrees(Math.atan2(yv, xv));
    var r = Math.hypot(xv, yv);
    var u = v + w; // 緯度の引数
    var xh = r * (cosd(N) * cosd(u) - sind(N) * sind(u) * cosd(inc));
    var yh = r * (sind(N) * cosd(u) + cosd(N) * sind(u) * cosd(inc));
    var zh = r * (sind(u) * sind(inc));
    var lon = rev(toDegrees(Math.atan2(yh, xh)));
    var lat = toDegrees(Math.atan2(zh, Math.hypot(xh, yh)));
    return [lon, lat, r, xh, yh, zh];
  }

  /** 摂動計算に使う平均黄経・平均近点角など [Ms, Mm, D, F, Mj, Msat, Mu] */
  function meanLongitudes(d) {
    var ms = rev(elAt(SUN, EL_M, d));
    var mm = rev(elAt(MOON, EL_M, d));
    var lm = rev(elAt(MOON, EL_M, d) + elAt(MOON, EL_W, d) + elAt(MOON, EL_N, d));
    var ls = rev(elAt(SUN, EL_M, d) + elAt(SUN, EL_W, d));
    var D = rev(lm - ls);
    var F = rev(lm - elAt(MOON, EL_N, d));
    var mj = rev(elAt(JUPITER, EL_M, d));
    var msat = rev(elAt(SATURN, EL_M, d));
    var mu = rev(elAt(URANUS, EL_M, d));
    return [ms, mm, D, F, mj, msat, mu];
  }

  /** Schlyter 第6章：月の主要摂動項 [黄経補正, 黄緯補正]（度） */
  function moonPerturbations(ml) {
    var ms = ml[0], mm = ml[1], D = ml[2], F = ml[3];
    var lonCorr =
      -1.274 * sind(mm - 2 * D)          // Evection
      + 0.658 * sind(2 * D)              // Variation
      - 0.186 * sind(ms)                 // Yearly Equation
      - 0.059 * sind(2 * mm - 2 * D)
      - 0.057 * sind(mm - 2 * D + ms)
      + 0.053 * sind(mm + 2 * D)
      + 0.046 * sind(2 * D - ms)
      + 0.041 * sind(mm - ms)
      - 0.035 * sind(D)                  // Parallactic Equation
      - 0.031 * sind(mm + ms)
      - 0.015 * sind(2 * F - 2 * D)
      + 0.011 * sind(mm - 4 * D);
    var latCorr =
      -0.173 * sind(F - 2 * D)
      - 0.055 * sind(mm - F - 2 * D)
      - 0.046 * sind(mm + F - 2 * D)
      + 0.033 * sind(F + 2 * D)
      + 0.017 * sind(2 * mm + F);
    return [lonCorr, latCorr];
  }

  /** Schlyter 第6章：木星・土星・天王星の主要摂動項（黄経補正、度） */
  function planetPerturbation(body, ml) {
    var mj = ml[4], msat = ml[5], mu = ml[6];
    switch (body) {
      case JUPITER:
        return -0.332 * sind(2 * mj - 5 * msat - 67.6)
          - 0.056 * sind(2 * mj - 2 * msat + 21.0)
          + 0.042 * sind(3 * mj - 5 * msat + 21.0)
          - 0.036 * sind(mj - 2 * msat)
          + 0.022 * cosd(mj - msat)
          + 0.023 * sind(2 * mj - 3 * msat + 52.0)
          - 0.016 * sind(mj - 5 * msat - 69.0);
      case SATURN:
        return +0.812 * sind(2 * mj - 5 * msat - 67.6)
          - 0.229 * cosd(2 * mj - 4 * msat - 2.0)
          + 0.119 * sind(2 * mj - 6 * msat - 3.0)
          + 0.046 * sind(2 * mj - 6 * msat - 42.0)
          + 0.014 * sind(2 * mj - 5 * msat + 52.0);
      case URANUS:
        return +0.040 * sind(msat - 2 * mu + 6.0)
          + 0.035 * sind(msat - 3 * mu + 33.0)
          - 0.015 * sind(mj - mu + 20.0);
      default:
        return 0.0;
    }
  }

  /** Schlyter 第14章：冥王星の日心 [lon, lat, r]（フーリエ fit、1800〜2100年有効） */
  function plutoHeliocentric(d) {
    var S = 50.03 + 0.033459652 * d;
    var P = 238.95 + 0.003968789 * d;
    var lon = 238.9508 + 0.00400703 * d
      - 19.799 * sind(P) + 19.848 * cosd(P)
      + 0.897 * sind(2 * P) - 4.956 * cosd(2 * P)
      + 0.610 * sind(3 * P) + 1.211 * cosd(3 * P)
      - 0.341 * sind(4 * P) - 0.190 * cosd(4 * P)
      + 0.128 * sind(5 * P) - 0.034 * cosd(5 * P)
      - 0.038 * sind(6 * P) + 0.031 * cosd(6 * P)
      + 0.020 * sind(S - P) - 0.010 * cosd(S - P);
    var lat = -3.9082
      - 5.453 * sind(P) - 14.975 * cosd(P)
      + 3.527 * sind(2 * P) + 1.673 * cosd(2 * P)
      - 1.051 * sind(3 * P) + 0.328 * cosd(3 * P)
      + 0.179 * sind(4 * P) - 0.292 * cosd(4 * P)
      + 0.019 * sind(5 * P) + 0.100 * cosd(5 * P)
      - 0.031 * sind(6 * P) - 0.026 * cosd(6 * P)
      + 0.011 * cosd(S - P);
    var r = 40.72
      + 6.68 * sind(P) + 6.90 * cosd(P)
      - 1.18 * sind(2 * P) - 0.03 * cosd(2 * P)
      + 0.15 * sind(3 * P) - 0.14 * cosd(3 * P);
    return [rev(lon), lat, r];
  }

  /** day number d（1999 Dec 31.0 UT = 0）における各地心黄経（度, 0..360） */
  function geocentricLongitudes(d) {
    var ml = meanLongitudes(d);
    var result = new Array(10);
    // 太陽：要素から得た黄経と直交座標がそのまま地心黄経・地心座標になる
    var sun = eclipticFromElements(SUN, d);
    result[SUN] = rev(sun[0]);
    var xs = sun[3], ys = sun[4];

    var moon = eclipticFromElements(MOON, d); // 月は要素から地心が直接出る
    var mp = moonPerturbations(ml);
    result[MOON] = rev(moon[0] + mp[0]);

    var planets = [MERCURY, VENUS, MARS, JUPITER, SATURN, URANUS, NEPTUNE];
    for (var pi = 0; pi < planets.length; pi++) {
      var body = planets[pi];
      var p = eclipticFromElements(body, d);
      var xg = p[3] + xs, yg = p[4] + ys;
      var lon = rev(toDegrees(Math.atan2(yg, xg)));
      result[body] = rev(lon + planetPerturbation(body, ml));
    }

    // 冥王星：フーリエ fit 式の日心座標 → 地心
    var pl = plutoHeliocentric(d);
    var px = pl[2] * cosd(pl[0]) * cosd(pl[1]);
    var py = pl[2] * sind(pl[0]) * cosd(pl[1]);
    result[PLUTO] = rev(toDegrees(Math.atan2(py + ys, px + xs)));
    return result;
  }

  // ---------- 恒星時・ASC・MC ----------
  /** Meeus の平均黄道傾斜角（度） */
  function meanObliquity(jd) {
    var T = (jd - 2451545.0) / 36525.0;
    var epsSec = 23 * 3600 + 26 * 60 + 21.448 - T * (46.815 + T * (0.00059 - T * 0.001813));
    return epsSec / 3600.0;
  }

  /** 仕様 §3.2 の式による GMST（度） */
  function gmstDeg(jd) {
    return rev(280.46061837 + 360.98564736629 * (jd - 2451545.0));
  }

  /**
   * 日本の地方時（壁時計時刻）と出生地の緯度・経度からチャート全体を計算する。
   * lat 緯度（北緯を正）、lonEast 東経
   */
  function astroCompute(by, bm, bd, hh, mi, lat, lonEast) {
    var offset = jstOffsetHours(by, bm, bd, hh, mi);
    // 地方時をそのまま JD 化してからオフセットを引く（UT 化）
    var jdLocal = jdn(by, bm, bd) - 0.5 + (hh + mi / 60.0) / 24.0;
    var jd = jdLocal - offset / 24.0;
    var d = jd - 2451543.5; // Schlyter の day number

    var c = {};
    c.jd = jd;
    c.utcOffset = offset;
    c.lon = geocentricLongitudes(d);

    var lst = rev(gmstDeg(jd) + lonEast);
    var ramc = lst;
    var eps = meanObliquity(jd);
    var mc = rev(toDegrees(Math.atan2(sind(ramc), cosd(ramc) * cosd(eps))));
    var asc = rev(toDegrees(Math.atan2(cosd(ramc),
      -(Math.tan(toRadians(lat)) * sind(eps) + sind(ramc) * cosd(eps)))));
    c.mc = mc;
    c.asc = asc;
    c.cusps = new Array(12);
    for (var k = 0; k < 12; k++) c.cusps[k] = rev(asc + 30.0 * k);
    return c;
  }

  // ---------- 表示ユーティリティ ----------
  /** 黄経 → 星座インデックス（0=牡羊座） */
  function signOf(lon) {
    var s = Math.floor(rev(lon) / 30.0);
    return Math.min(s, 11);
  }

  /** 黄経 → 「山羊座 9°51'」形式 */
  function formatLon(lon) {
    var l = rev(lon);
    var s = Math.floor(l / 30.0);
    var within = l - 30.0 * s;
    var deg = Math.floor(within);
    var minute = Math.round((within - deg) * 60.0);
    if (minute === 60) { deg += 1; minute = 0; }
    if (deg === 30) { deg = 0; s = (s + 1) % 12; }
    return SIGNS[s] + " " + deg + "°" + (minute < 10 ? "0" : "") + minute + "'";
  }

  // ================================================================
  // PrefTable（都道府県庁所在地の座標）
  // ================================================================
  var PREF_NAMES = [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
    "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
    "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
    "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
    "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
    "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
    "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
  ];
  var PREF_LAT = [
    43.064, 40.824, 39.702, 38.269, 39.719, 38.240, 37.750,
    36.342, 36.565, 36.390, 35.857, 35.605, 35.690, 35.448,
    37.902, 36.695, 36.594, 36.054, 35.664, 36.651, 35.391,
    34.977, 35.180, 34.730, 35.004, 35.021, 34.686, 34.692,
    34.685, 34.226, 35.501, 35.472, 34.662, 34.396, 34.186,
    34.066, 34.340, 33.842, 33.550, 33.607, 33.249, 32.750,
    32.790, 33.238, 31.911, 31.560, 26.212
  ];
  var PREF_LON = [
    141.347, 140.740, 141.155, 140.872, 140.102, 140.363, 140.468,
    140.447, 139.883, 139.060, 139.649, 140.123, 139.692, 139.643,
    139.023, 137.211, 136.626, 136.222, 138.568, 138.181, 136.722,
    138.383, 136.907, 136.509, 135.869, 135.756, 135.520, 135.183,
    135.833, 135.168, 134.235, 133.051, 133.935, 132.460, 131.470,
    134.559, 134.043, 132.766, 133.531, 130.418, 130.299, 129.868,
    130.742, 131.613, 131.420, 130.558, 127.681
  ];
  var PREF_TOKYO = 12;
  function prefIndexOf(name) {
    for (var i = 0; i < PREF_NAMES.length; i++) {
      if (PREF_NAMES[i] === name) return i;
    }
    return PREF_TOKYO;
  }

  // ================================================================
  // LuckCurve（年運カーブ）
  // ================================================================
  var LUCK_MAX_AGE = 90;

  function yearlyLevels(result, birthYear) {
    var lv = new Array(LUCK_MAX_AGE + 1);
    for (var a = 0; a <= LUCK_MAX_AGE; a++) {
      var y = birthYear + a;
      var p = ((y - 4) % 60 + 60) % 60;
      lv[a] = nenunLevel(
        juniunIndex(result.dayStem, branchOf(p)),
        tsuhenIndex(result.dayStem, stemOf(p)));
    }
    return lv;
  }

  function curvePoints(levels, samplesPerSegment) {
    var ctrl = new Array(levels.length);
    for (var i = 0; i < levels.length; i++) {
      ctrl[i] = [i, levels[i]];
    }
    var pts = smoothLinePoints(ctrl, samplesPerSegment);
    for (var q = 0; q < pts.length; q++) {
      if (pts[q][1] < -1) pts[q][1] = -1;
      if (pts[q][1] > 11) pts[q][1] = 11;
    }
    return pts;
  }

  // ================================================================
  // GenderPolicy（性別デフォルト）
  // ================================================================
  var FIRST_DEFAULT_MALE = false;
  function defaultMale(personIndex, firstMale) {
    if (personIndex === 0) return FIRST_DEFAULT_MALE;
    return !firstMale;
  }

  // ================================================================
  // PairGraph（相性グラフの色・平均）
  // ================================================================
  var COLOR_MALE = 0xFF1E88E5;
  var COLOR_FEMALE = 0xFFE53935;
  var COLOR_PAIR = 0xFFFFFFFF;
  function pairColorOf(male) {
    return male ? COLOR_MALE : COLOR_FEMALE;
  }
  function averageLevels(a, b) {
    var n = Math.min(a.length, b.length);
    var out = new Array(n);
    for (var i = 0; i < n; i++) out[i] = (a[i] + b[i]) / 2.0;
    return out;
  }

  // ================================================================
  // WheelGeom（ホロスコープ幾何）
  // ================================================================
  var SIGN_SHORT = [
    "牡羊", "牡牛", "双子", "蟹", "獅子", "乙女",
    "天秤", "蠍", "射手", "山羊", "水瓶", "魚"
  ];
  function wheelAngleDeg(lon, ascLon) {
    var a = (180.0 + (lon - ascLon)) % 360.0;
    if (a < 0) a += 360.0;
    return a;
  }
  function wheelPoint(cx, cy, r, lon, ascLon) {
    var rad = toRadians(wheelAngleDeg(lon, ascLon));
    return [
      cx + r * Math.cos(rad),
      cy - r * Math.sin(rad)
    ];
  }

  // ================================================================
  // 公開API
  // ================================================================
  root.UE = {
    Shichu: {
      KAN: KAN,
      SHI: SHI,
      GOGYO_NAME: GOGYO_NAME,
      TSUHEN: TSUHEN,
      JUNIUN: JUNIUN,
      HOSHI_GROUP_NAME: HOSHI_GROUP_NAME,
      jdn: jdn,
      jdFromJst: jdFromJst,
      jstFromJd: jstFromJd,
      civilFromJdn: civilFromJdn,
      sunApparentLongitude: sunApparentLongitude,
      setuJd: setuJd,
      kanjiOf: kanjiOf,
      stemOf: stemOf,
      branchOf: branchOf,
      tsuhenIndex: tsuhenIndex,
      juniunIndex: juniunIndex,
      gogyoOfStem: gogyoOfStem,
      ageAt: ageAt,
      compute: shichuCompute,
      levelLabel: levelLabel,
      nenunLevel: nenunLevel
    },
    Astro: {
      BODY_NAME: BODY_NAME,
      SIGNS: SIGNS,
      SUN: SUN, MOON: MOON, MERCURY: MERCURY, VENUS: VENUS, MARS: MARS,
      JUPITER: JUPITER, SATURN: SATURN, URANUS: URANUS, NEPTUNE: NEPTUNE, PLUTO: PLUTO,
      compute: astroCompute,
      signOf: signOf,
      formatLon: formatLon,
      jstOffsetHours: jstOffsetHours,
      lonDiffAbs: lonDiffAbs
    },
    Pref: {
      NAMES: PREF_NAMES,
      LAT: PREF_LAT,
      LON: PREF_LON,
      TOKYO: PREF_TOKYO,
      indexOf: prefIndexOf
    },
    LuckCurve: {
      MAX_AGE: LUCK_MAX_AGE,
      yearlyLevels: yearlyLevels,
      curvePoints: curvePoints
    },
    GenderPolicy: {
      FIRST_DEFAULT_MALE: FIRST_DEFAULT_MALE,
      defaultMale: defaultMale
    },
    PairGraph: {
      COLOR_MALE: COLOR_MALE,
      COLOR_FEMALE: COLOR_FEMALE,
      COLOR_PAIR: COLOR_PAIR,
      colorOf: pairColorOf,
      averageLevels: averageLevels
    },
    WheelGeom: {
      SIGN_SHORT: SIGN_SHORT,
      angleDeg: wheelAngleDeg,
      point: wheelPoint
    },
    Util: {
      catmullRom: catmullRom,
      smoothLinePoints: smoothLinePoints
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = root.UE;
})(typeof self !== "undefined" ? self : globalThis);
