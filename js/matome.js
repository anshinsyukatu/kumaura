/*
 * matome.js — 「クマうら」Web版：まとめ（Matome）と相性（Aishou）の移植。
 * 移植元（Android版・純Java、一字一句そのまま移植）:
 *   jp.kuma.uranai.Matome / jp.kuma.uranai.Aishou
 *
 * 依存モジュール（あれば優先して使う。無ければ本ファイル内のフォールバック表・
 * ロジックで動作する。フォールバックは各 Java クラスの定義をそのまま写したもの）:
 *   root.UK         : Kaisetsu（kaisetsu.js。TSUHEN_PHRASE / strongestTsuhen /
 *                     labelIndex / outlookPattern）
 *   root.UT.Tesou   : Tesou（tesou.js。F_* 特徴ID / REP_FEATURE）
 *   root.UT.Sougou  : Sougou（tesou.js。Matome のギャップ判定と maxGogyo）
 *   root.UE.Shichu  : ShichuEngine（engine.js。KAN / GOGYO_NAME / TSUHEN /
 *                     gogyoOfStem / levelLabel。KAN_GOGYO は非公開のため
 *                     Aishou.relationType はフォールバック表を使う）
 *   root.UE.Astro   : AstroEngine（engine.js。SIGNS）
 *   root.US.Seiyo   : SeiyoKaisetsu（seiyo.js。SUN_ONE_LINE / signElement）
 * Node テストでは、依存ファイルがある場合は require して global（UK/UT/UE/US 等）に
 * 載せてから本ファイルを require すること。本ファイル単体でも動作する。
 */
(function (root) {
  "use strict";

  // ---------- 依存解決（呼び出し時に解決する。後から global に載っても拾える） ----------
  function getUK() { return root.UK || null; }
  function getUT() { // Tesou 本体（tesou.js は root.UT.Tesou に置く）
    if (root.UT && root.UT.Tesou) return root.UT.Tesou;
    return root.UT || null;
  }
  function getShichu() {
    if (root.UE && root.UE.Shichu) return root.UE.Shichu;
    return null;
  }
  function getAstro() { // AstroEngine（engine.js は root.UE.Astro に置く）
    if (root.UE && root.UE.Astro) return root.UE.Astro;
    return root.UA || root.UAstro || null;
  }
  function getSeiyo() { // SeiyoKaisetsu（seiyo.js は root.US.Seiyo に置く）
    if (root.US && root.US.Seiyo) return root.US.Seiyo;
    return root.USeiyo || null;
  }
  function getSougou() { // Sougou（tesou.js は root.UT.Sougou に置く）
    if (root.UT && root.UT.Sougou) return root.UT.Sougou;
    return root.USougou || null;
  }

  // ---------- フォールバック表（ShichuEngine / SeiyoKaisetsu / Kaisetsu から写し） ----------
  var FB_KAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  var FB_GOGYO_NAME = ["木", "火", "土", "金", "水"];
  var FB_KAN_GOGYO = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4];
  var FB_TSUHEN = ["比肩", "劫財", "食神", "傷官", "偏財", "正財", "偏官", "正官", "偏印", "正印"];
  var FB_TSUHEN_PHRASE = [
    "自立心と自分のペース",       // 比肩
    "負けず嫌いな行動力",         // 劫財
    "楽しみと表現の豊かさ",       // 食神
    "鋭い感受性と表現力",         // 傷官
    "人とのつながりと社交性",     // 偏財
    "堅実さと誠実な積み上げ",     // 正財
    "逆境に強い行動力",           // 偏官
    "責任感と社会的な信頼",       // 正官
    "独自の知性とひらめき",       // 偏印
    "学びと周りからの支援"        // 正印
  ];
  var FB_SIGNS = ["牡羊座", "牡牛座", "双子座", "蟹座", "獅子座", "乙女座",
    "天秤座", "蠍座", "射手座", "山羊座", "水瓶座", "魚座"];
  var FB_SUN_ONE_LINE = [
    "思い立ったらすぐ動く行動力",               // 牡羊座
    "自分のペースでじっくり味わう感性",         // 牡牛座
    "好奇心と軽やかなコミュニケーション力",     // 双子座
    "身近な人を大切にする情の深さ",             // 蟹座
    "自分らしさを堂々と表現する華やかさ",       // 獅子座
    "細やかな気配りと実務能力",                 // 乙女座
    "バランス感覚と社交性",                     // 天秤座
    "一つのことに深く集中する探求心",           // 蠍座
    "自由を求めて遠くを目指す行動力",           // 射手座
    "目標に向けてコツコツ積み上げる努力",       // 山羊座
    "常識にとらわれない独自の視点",             // 水瓶座
    "想像力と人の気持ちに寄り添う優しさ"        // 魚座
  ];
  // Tesou の特徴ID（フォールバック）
  var FB_F_SEIMEI_ARC = 1, FB_F_CHINO_SLOPE = 4, FB_F_KANJO_REACH = 6,
      FB_F_KANJO_DARK = 8, FB_F_UNMEI_DARK = 9;
  var FB_REP_FEATURE = [1, 4, 6, 9]; // [F_SEIMEI_ARC, F_CHINO_SLOPE, F_KANJO_REACH, F_UNMEI_DARK]

  function kan() { var s = getShichu(); return (s && s.KAN) || FB_KAN; }
  function gogyoName() { var s = getShichu(); return (s && s.GOGYO_NAME) || FB_GOGYO_NAME; }
  function kanGogyo() { var s = getShichu(); return (s && s.KAN_GOGYO) || FB_KAN_GOGYO; }
  function tsuhenNames() { var s = getShichu(); return (s && s.TSUHEN) || FB_TSUHEN; }
  function tsuhenPhrase() { var k = getUK(); return (k && k.TSUHEN_PHRASE) || FB_TSUHEN_PHRASE; }
  function signs() { var a = getAstro(); return (a && a.SIGNS) || FB_SIGNS; }
  function sunOneLine() { var y = getSeiyo(); return (y && y.SUN_ONE_LINE) || FB_SUN_ONE_LINE; }

  function gogyoOfStem(stem) {
    var s = getShichu();
    if (s && typeof s.gogyoOfStem === "function") return s.gogyoOfStem(stem);
    return kanGogyo()[stem];
  }
  function signElement(sign) {
    var y = getSeiyo();
    if (y && typeof y.signElement === "function") return y.signElement(sign);
    return sign % 4; // SeiyoKaisetsu.signElement と同一
  }
  function levelLabel(level) {
    var s = getShichu();
    if (s && typeof s.levelLabel === "function") return s.levelLabel(level);
    if (level >= 6.0) return "好調";
    if (level >= 4.5) return "平穏";
    return "注意";
  }
  // Kaisetsu.strongestTsuhen（同数なら年柱→月柱→時柱の順に優先）
  function strongestTsuhen(r) {
    var k = getUK();
    if (k && typeof k.strongestTsuhen === "function") return k.strongestTsuhen(r);
    var best = r.tsuhen[0];
    var order = [0, 1, 3];
    for (var oi = 0; oi < order.length; oi++) {
      var t = r.tsuhen[order[oi]];
      if (r.tsuhenCount[t] > r.tsuhenCount[best]) best = t;
    }
    return best;
  }
  // Kaisetsu.labelIndex（0=好調 / 1=平穏 / 2=注意）
  function labelIndex(level) {
    var k = getUK();
    if (k && typeof k.labelIndex === "function") return k.labelIndex(level);
    if (level >= 6.0) return 0;
    if (level >= 4.5) return 1;
    return 2;
  }
  // Kaisetsu.outlookPattern（0=後半上向き 1=前半山場 2=波あり 3=追い風多め 4=穏やか）
  function outlookPattern(five) {
    var k = getUK();
    if (k && typeof k.outlookPattern === "function") return k.outlookPattern(five);
    var firstAvg = (five[0].level + five[1].level) / 2.0;
    var secondAvg = (five[3].level + five[4].level) / 2.0;
    var good = 0, warn = 0;
    for (var i = 0; i < five.length; i++) {
      if (five[i].level >= 6.0) good++;
      else if (five[i].level < 4.5) warn++;
    }
    if (secondAvg - firstAvg >= 1.0) return 0;
    if (firstAvg - secondAvg >= 1.0) return 1;
    if (warn >= 3) return 2;
    if (good >= 3) return 3;
    return 4;
  }
  function fSeimeiArc() { var t = getUT(); return (t && typeof t.F_SEIMEI_ARC === "number") ? t.F_SEIMEI_ARC : FB_F_SEIMEI_ARC; }
  function fChinoSlope() { var t = getUT(); return (t && typeof t.F_CHINO_SLOPE === "number") ? t.F_CHINO_SLOPE : FB_F_CHINO_SLOPE; }
  function fKanjoReach() { var t = getUT(); return (t && typeof t.F_KANJO_REACH === "number") ? t.F_KANJO_REACH : FB_F_KANJO_REACH; }
  function fKanjoDark() { var t = getUT(); return (t && typeof t.F_KANJO_DARK === "number") ? t.F_KANJO_DARK : FB_F_KANJO_DARK; }
  function fUnmeiDark() { var t = getUT(); return (t && typeof t.F_UNMEI_DARK === "number") ? t.F_UNMEI_DARK : FB_F_UNMEI_DARK; }
  function repFeature() { var t = getUT(); return (t && t.REP_FEATURE) || FB_REP_FEATURE; }

  // ---------- Sougou のフォールバック（Matome が使う範囲：relations と maxGogyo） ----------
  // Sougou.java の分類ルールをそのまま写したもの。compute は代表特徴が
  // 1つでも未確定（-1 等）なら null を返す点も同一。
  var SG_AXIS_REP_FEATURE = [1, 4, 6, 9]; // F_SEIMEI_ARC, F_CHINO_SLOPE, F_KANJO_REACH, F_UNMEI_DARK
  var SG_JUNIUN_BASE = [7.5, 5.5, 7.0, 8.5, 9.0, 4.5, 3.5, 3.0, 4.0, 2.5, 5.0, 6.0];
  var SG_THINK_GROUP = [1, 2, 2, 2, 2, 0, 0, 0, 1, 1];
  var SG_FEEL_ELEMENT = [0, 1, 0, 2];
  var SG_WORK_GOGYO = [0, 0, 1, 0, 2];
  var SG_REL_GAP = 2;
  var SG_FEATURE_COUNT = 11;

  function sgMaxGogyo(r) {
    var max = -1, maxi = 0;
    for (var g = 0; g < 5; g++) {
      if (r.gogyoCount[g] > max) { max = r.gogyoCount[g]; maxi = g; }
    }
    return maxi;
  }
  function sgPalmType(axis, feat) {
    if (feat == null) return -1;
    var fid = SG_AXIS_REP_FEATURE[axis];
    if (fid >= feat.length) return -1;
    return feat[fid];
  }
  function sgBirthType(axis, r, sunSign, moonSign) {
    switch (axis) {
      case 0: { // エネルギー
        var base = SG_JUNIUN_BASE[r.juniun[2]];
        if (base >= 7.0) return 0;
        if (base >= 5.0) return 1;
        return 2;
      }
      case 1: // 考え方
        return SG_THINK_GROUP[strongestTsuhen(r)];
      case 2: // 気持ちの表し方
        return SG_FEEL_ELEMENT[signElement(moonSign)];
      case 3: // 仕事・自分の道
        return SG_WORK_GOGYO[sgMaxGogyo(r)];
      default:
        return -1;
    }
  }
  function sgRelationOf(palmType, birthType) {
    var d = Math.abs(palmType - birthType);
    if (d === 0) return 0; // REL_MATCH
    if (d === 1) return 1; // REL_COMPLEMENT
    return 2;              // REL_GAP
  }
  // Sougou.compute のうち Matome が使う結果（relations / null 判定）を返す。
  function sougouCompute(r, sunSign, moonSign, feat) {
    var ext = getSougou();
    if (ext && typeof ext.compute === "function") {
      return ext.compute(r, sunSign, moonSign, feat);
    }
    if (r == null || feat == null || feat.length < SG_FEATURE_COUNT) return null;
    var ax;
    for (ax = 0; ax < 4; ax++) {
      var pt = sgPalmType(ax, feat);
      if (pt < 0 || pt > 2) return null;
    }
    var relations = [0, 0, 0, 0];
    for (ax = 0; ax < 4; ax++) {
      var palm = sgPalmType(ax, feat);
      var birth = sgBirthType(ax, r, sunSign, moonSign);
      relations[ax] = sgRelationOf(palm, birth);
    }
    return { relations: relations };
  }
  function sougouMaxGogyo(r) {
    var ext = getSougou();
    if (ext && typeof ext.maxGogyo === "function") return ext.maxGogyo(r);
    return sgMaxGogyo(r);
  }

  // =====================================================================
  // Matome（まとめ：あなたの特性）— Matome.java の移植
  // =====================================================================
  var Matome = {};

  Matome.HEADING = "まとめ：あなたの特性";

  Matome.MATOME_MUCH = [
    "新しいことに挑む勢いが、そのまま強みになっています。", // 木
    "気持ちを表に出す明るさが、場を動かす力になっています。", // 火
    "着実に積み上げる粘り強さが、周りの信頼を集めています。", // 土
    "筋を通す意志の固さが、決めどころでの強みになっています。", // 金
    "場の流れを読む柔軟さが、学びや情報の扱いに活きています。"  // 水
  ];
  Matome.MATOME_WEAK = [
    "変化のきっかけをつかむのは、少しゆっくりめです。",       // 木
    "感情表現や自己アピールは、少し控えめになりがちです。",   // 火
    "気持ちの波が出やすく、落ち着くまでに少し時間がかかります。", // 土
    "決断や線引きは、少し後回しになりがちです。",             // 金
    "先を読むことや、やり方を変えるのは少し苦手寄りです。"    // 水
  ];
  Matome.MATOME_WEAK_HINT = [
    "小さな挑戦を一つ混ぜると、流れが変わります。",           // 木
    "お気に入りの楽しみを声に出して味わう時間が、気持ちをほぐします。", // 火
    "生活リズムを一つ固定すると、土台が安定します。",         // 土
    "やることの順番をメモに書き出すと、決断が軽くなります。", // 金
    "読書や学びの時間が、視野を広げてくれます。"              // 水
  ];
  Matome.MATOME_BALANCED_WEAK =
    "目立った偏りはなく、弱みらしい弱みは少なめです。ヒント：いちばん好きな分野を一つ深掘りすると、バランスの良さが武器になります。";
  Matome.MATOME_GAP = [
    "手相と生年月日では、エネルギーの出方に開きがあります。予定に余白を残す配分が、波をやわらげます。", // エネルギー
    "手相と生年月日では、考え方の角度に開きがあります。迷ったら書き出して眺めると、整理しやすくなります。", // 考え方
    "手相と生年月日では、気持ちの表し方に開きがあります。短いひと言から出し慣れていくと、少しずつ楽になります。", // 気持ちの表し方
    "手相と生年月日では、進み方の描き方に開きがあります。『小さく試して確かめる』進み方が、両方と折り合えます。"  // 仕事・自分の道
  ];
  Matome.MATOME_DAIUN = [
    "今の大運は追い風の時期です。大事な一歩は、この流れの中で踏み出すのがおすすめです。", // 好調
    "今の大運は土台固めの時期です。焦らず整えることが、次の追い風への準備になります。",   // 平穏
    "今の大運は、抱え込みすぎない配分が鍵になる時期です。守りを固める意識で過ごすのが合っています。" // 注意
  ];
  Matome.MATOME_DAIUN_PRE =
    "最初の大運までは準備期間です。好きなこと・得意なことを増やしておくと、後で動きやすくなります。";
  Matome.MATOME_PATTERN = [
    "年ごとの流れは後半に上向きます。今は種まきの時期として、準備を進めたいところです。", // 後半にかけて上向き
    "年ごとの流れは前半が山場です。勝負どころは早めに形にしておくと安心です。",           // 前半が山場
    "年ごとの波が大きめの流れです。攻める年と守る年で、力の入れ方を変えてみてください。",   // 注意の年が多めで波あり
    "年ごとの流れは明るめです。気になっていたことに挑戦する好機と見られます。",           // 追い風の年が多め
    "年ごとの流れは穏やかです。コツコツ続ける小さな習慣が、後から効いてきます。"          // 穏やか
  ];
  Matome.MATOME_END =
    "気になるところだけ拾って、明日からの過ごし方に活かしてみてください。";
  Matome.MATOME_PALM_PHRASE = [
    ["行動範囲をぐいっと広げるエネルギー", "力の出し入れが上手なバランス感覚", "蓄えた力を勝負どころで使う集中力"],       // 生命線（弧）
    ["地に足のついた現実的な思考", "理屈と感覚を両立させる思考", "ひらめきと独創性を大切にする感性"],                     // 頭脳線（下がり）
    ["素直でおおらかな感情表現", "情の深さと程よい距離感の両立", "表には出さない静かな思いの深さ"],                         // 感情線（到達位置）
    ["自力で進路を決める意志の固さ", "周りの流れと歩調を合わせるしなやかさ", "変化を受け入れるフットワークの軽さ"]        // 運命線（はっきり具合）
  ];
  Matome.MATOME_PALM_STRONG = [
    "手相でも、生命線の張り出しにエネルギーの強さが表れています。",   // 生命線（弧）
    "手相でも、頭脳線の傾きに考え方の持ち味が表れています。",         // 頭脳線（下がり）
    "手相でも、感情線の伸び方に気持ちの表し方が表れています。",       // 感情線（到達位置）
    "手相でも、運命線の濃さに歩み方の軸が表れています。"              // 運命線（はっきり具合）
  ];
  Matome.MATOME_PALM_ADVICE = [
    "手相の生命線が示す力の配分を、無理のないペースづくりに活かしていけそうです。",   // 生命線（弧）
    "手相の頭脳線が示す考え方のクセを、迷ったときの判断材料にしていけそうです。",     // 頭脳線（下がり）
    "手相の感情線が示す気持ちの動きを、人との関わりの中で活かしていけそうです。",     // 感情線（到達位置）
    "手相の運命線が示す歩み方の軸を、節目の判断で思い出していけそうです。"            // 運命線（はっきり具合）
  ];

  /** 手相の代表特徴のうち最もはっきり出たもの（レベル0優先、同点はアドバイスと同じ優先順位） */
  Matome.strongRep = function (feat) {
    var prio = [3, 0, 2, 1]; // 運命線→生命線→感情線→頭脳線（Tesou.ADVICE_PRIORITY と同じ）
    var repF = repFeature();
    var best = prio[0], bestLv = 3;
    for (var pi = 0; pi < prio.length; pi++) {
      var rep = prio[pi];
      var lv = feat[repF[rep]];
      if (lv >= 0 && lv < bestLv) { bestLv = lv; best = rep; }
    }
    return best;
  };

  /**
   * まとめの合成（決定的）。Matome.compute の移植。
   * @param r 四柱推命の結果 {dayStem, gogyoCount[5], tsuhen[4], tsuhenCount[10], juniun[4], ...}
   * @param sunSign 太陽星座（0〜11）、moonSign 月星座（0〜11）
   * @param curDaiun 今の大運（{level}。未開始なら null）
   * @param five これから5年の年運（{level} の配列・5件）
   * @param feat 手相の特徴配列（未実施・未確定なら null でよい）
   * @returns {tokusei, tsuyomi, yowami, advice, hasPalm}（Java Result と同形）
   */
  Matome.compute = function (r, sunSign, moonSign, curDaiun, five, feat) {
    var m = { tokusei: "", tsuyomi: "", yowami: "", advice: "", hasPalm: false };
    var sg = (feat != null) ? sougouCompute(r, sunSign, moonSign, feat) : null;
    m.hasPalm = sg != null;

    var KAN = kan(), GOGYO_NAME = gogyoName(), SIGNS = signs(),
        SUN_ONE_LINE = sunOneLine(), TSUHEN = tsuhenNames(), TSUHEN_PHRASE = tsuhenPhrase();

    // ---------- ① 特性 ----------
    var t = "";
    t += "日干は「" + KAN[r.dayStem] + "」で、五行は『"
      + GOGYO_NAME[gogyoOfStem(r.dayStem)] + "』の性質です。";
    t += "太陽星座は「" + SIGNS[sunSign] + "」で、"
      + SUN_ONE_LINE[sunSign] + "の持ち主でもあるとされます。";
    t += "月星座は「" + SIGNS[moonSign] + "」です。";
    if (m.hasPalm) {
      t += "手相では、"
        + Matome.MATOME_PALM_PHRASE[0][feat[fSeimeiArc()]] + "と"
        + Matome.MATOME_PALM_PHRASE[1][feat[fChinoSlope()]] + "が目立ち、"
        + "気持ちの面では" + Matome.MATOME_PALM_PHRASE[2][feat[fKanjoReach()]] + "、"
        + "歩みの面では" + Matome.MATOME_PALM_PHRASE[3][feat[fUnmeiDark()]]
        + "と出ています。";
    } else {
      t += "手相は未実施です。手相を登録すると、手相の要点もここに加わります。";
    }
    m.tokusei = t;

    // ---------- ② 強み ----------
    var maxi = sougouMaxGogyo(r);
    var t1 = strongestTsuhen(r);
    var s = "";
    s += "五行では「" + GOGYO_NAME[maxi] + "」の気が強めです。"
      + Matome.MATOME_MUCH[maxi];
    s += "通変星では「" + TSUHEN[t1] + "」の色が濃く、"
      + TSUHEN_PHRASE[t1] + "という面が表に出やすいとされます。";
    if (m.hasPalm) {
      var rep = Matome.strongRep(feat);
      s += Matome.MATOME_PALM_STRONG[rep];
    }
    m.tsuyomi = s;

    // ---------- ③ 弱み（補うヒント付き） ----------
    var max = -1, min = 99, mini = 0;
    for (var g = 0; g < 5; g++) {
      if (r.gogyoCount[g] > max) max = r.gogyoCount[g];
      if (r.gogyoCount[g] < min) { min = r.gogyoCount[g]; mini = g; }
    }
    var w = "";
    if (max - min <= 1) {
      w += Matome.MATOME_BALANCED_WEAK;
    } else {
      w += "五行では「" + GOGYO_NAME[mini] + "」の気が少なめです。"
        + Matome.MATOME_WEAK[mini]
        + "ヒント：" + Matome.MATOME_WEAK_HINT[mini];
    }
    if (sg != null) {
      for (var ax = 0; ax < 4; ax++) { // Sougou.AXIS_COUNT
        if (sg.relations[ax] === SG_REL_GAP) {
          w += Matome.MATOME_GAP[ax];
          break;
        }
      }
    }
    m.yowami = w;

    // ---------- ④ 今後のアドバイス ----------
    var a = "";
    if (curDaiun == null) {
      a += Matome.MATOME_DAIUN_PRE;
    } else {
      a += Matome.MATOME_DAIUN[labelIndex(curDaiun.level)];
    }
    a += Matome.MATOME_PATTERN[outlookPattern(five)];
    if (m.hasPalm) {
      var rep2 = Matome.strongRep(feat);
      a += Matome.MATOME_PALM_ADVICE[rep2];
    }
    a += Matome.MATOME_END;
    m.advice = a;
    return m;
  };

  // =====================================================================
  // Aishou（相性鑑定）— Aishou.java の移植
  // =====================================================================
  var Aishou = {};

  // ---------- 日干の関係 ----------
  Aishou.REL_SAME = 0;   // 同干
  Aishou.REL_HIWA = 1;   // 比和
  Aishou.REL_SOSEI = 2;  // 相生
  Aishou.REL_SOKOKU = 3; // 相剋
  Aishou.REL_NAME = ["同干", "比和", "相生", "相剋"];

  /** 2つの日干の関係（順序非依存）。stem は KAN の添字 */
  Aishou.relationType = function (stemA, stemB) {
    if (stemA === stemB) return Aishou.REL_SAME;
    var KG = kanGogyo();
    var eA = KG[stemA];
    var eB = KG[stemB];
    if (eA === eB) return Aishou.REL_HIWA;
    // 五行の生成順：木→火→土→金→水→木（添字 +1 mod 5 が「生む」相手）
    if (eB === (eA + 1) % 5 || eA === (eB + 1) % 5) return Aishou.REL_SOSEI;
    return Aishou.REL_SOKOKU;
  };

  Aishou.stemScore = function (stemA, stemB) {
    var rel = Aishou.relationType(stemA, stemB);
    var diffYinYang = (stemA % 2) !== (stemB % 2);
    switch (rel) {
      case Aishou.REL_SAME: return 8.5;
      case Aishou.REL_HIWA: return 7.5;
      case Aishou.REL_SOSEI: return 8.0 + (diffYinYang ? 0.5 : 0.0);
      default: return 5.5 + (diffYinYang ? 0.5 : 0.0); // 相剋
    }
  };

  // ---------- 五行バランスの補完度 ----------
  /** 2人の五行分布（各合計8）を合わせた偏りの小ささ。順序非依存 */
  Aishou.gogyoScore = function (ga, gb) {
    var dev = 0;
    for (var g = 0; g < 5; g++) {
      dev += Math.abs((ga[g] + gb[g]) - 3.2);
    }
    return 10.0 - dev * (10.0 / 25.6);
  };

  // ---------- エレメント相性（太陽・月共通） ----------
  // エレメント添字：0=火 1=地 2=風 3=水（SeiyoKaisetsu.signElement と対応）
  Aishou.ELEMENT_SCORE = [
    [8.0, 6.0, 9.0, 4.0], // 火
    [6.0, 8.0, 5.0, 9.0], // 地
    [9.0, 5.0, 8.0, 6.0], // 風
    [4.0, 9.0, 6.0, 8.0]  // 水
  ];
  Aishou.ELEMENT_NAME = ["火", "地", "風", "水"];
  Aishou.ECAT_SAME = 0;  // 同じエレメント
  Aishou.ECAT_PUSH = 1;  // 後押しし合う（火×風、地×水）
  Aishou.ECAT_SPIKE = 2; // 刺激的（火×水）
  Aishou.ECAT_TEMPO = 3; // 異なるテンポ（その他）

  Aishou.elementCategory = function (eA, eB) {
    if (eA === eB) return Aishou.ECAT_SAME;
    var lo = Math.min(eA, eB), hi = Math.max(eA, eB);
    if ((lo === 0 && hi === 2) || (lo === 1 && hi === 3)) return Aishou.ECAT_PUSH;
    if (lo === 0 && hi === 3) return Aishou.ECAT_SPIKE;
    return Aishou.ECAT_TEMPO;
  };

  Aishou.elementScore = function (eA, eB) {
    return Aishou.ELEMENT_SCORE[eA][eB];
  };

  // ---------- 星めぐりタイプの相性 ----------
  // 星グループ添字：0=土星 1=金星 2=火星 3=天王星 4=木星 5=水星
  Aishou.HOSHI_SCORE = [
    [8.0, 7.0, 5.0, 6.0, 6.0, 7.0], // 土星
    [7.0, 8.0, 9.0, 6.0, 8.0, 7.0], // 金星
    [5.0, 9.0, 8.0, 7.0, 8.0, 5.0], // 火星
    [6.0, 6.0, 7.0, 8.0, 8.0, 7.0], // 天王星
    [6.0, 8.0, 8.0, 8.0, 8.0, 6.0], // 木星
    [7.0, 7.0, 5.0, 7.0, 6.0, 8.0]  // 水星
  ];

  Aishou.hoshiScore = function (groupA, groupB) {
    return Aishou.HOSHI_SCORE[groupA][groupB];
  };

  // ---------- 帯（読み解きの出し分け） ----------
  Aishou.BAND_HIGH = 7.5;
  Aishou.BAND_LOW = 5.0;
  /** 0=高 1=中 2=低 */
  Aishou.bandOf = function (score) {
    if (score >= Aishou.BAND_HIGH) return 0;
    if (score >= Aishou.BAND_LOW) return 1;
    return 2;
  };

  // ---------- 総合・分野別（仕様 §6.5.2 の重み） ----------
  // 要素の並び：[日干, 五行, 太陽, 月, 星]
  Aishou.W_TOTAL = [0.30, 0.25, 0.20, 0.15, 0.10];
  Aishou.W_SEIKAKU = [0.40, 0.20, 0.25, 0.05, 0.10];
  Aishou.W_KIMOCHI = [0.15, 0.20, 0.10, 0.45, 0.10];
  Aishou.W_KYORYOKU = [0.30, 0.35, 0.10, 0.10, 0.15];
  Aishou.COMPONENT_NAME = ["日干の関係", "五行の補完", "太陽星座", "月星座", "星めぐりタイプ"];

  Aishou.weighted = function (comp, w) {
    var s = 0;
    for (var i = 0; i < 5; i++) s += comp[i] * w[i];
    var r = Math.round(s * 10.0) / 10.0;
    if (r < 0) r = 0;
    if (r > 10) r = 10;
    return r;
  };

  /**
   * 相性の全算出。引数の2人は入れ替えても同じ結果になる（対称）。
   * sunSign/moonSign は星座添字（0=牡羊座…）。
   * @returns {comp:[5], relation, sunCat, moonCat, total, seikaku, kimochi, kyoryoku}
   *          （Java Result のフィールドと同一）
   */
  Aishou.compute = function (ra, sunA, moonA, rb, sunB, moonB) {
    var r = { comp: [0, 0, 0, 0, 0], relation: 0, sunCat: 0, moonCat: 0,
              total: 0, seikaku: 0, kimochi: 0, kyoryoku: 0 };
    r.relation = Aishou.relationType(ra.dayStem, rb.dayStem);
    r.comp[0] = Aishou.stemScore(ra.dayStem, rb.dayStem);
    r.comp[1] = Aishou.gogyoScore(ra.gogyoCount, rb.gogyoCount);
    var esA = signElement(sunA), esB = signElement(sunB);
    var emA = signElement(moonA), emB = signElement(moonB);
    r.sunCat = Aishou.elementCategory(esA, esB);
    r.moonCat = Aishou.elementCategory(emA, emB);
    r.comp[2] = Aishou.elementScore(esA, esB);
    r.comp[3] = Aishou.elementScore(emA, emB);
    r.comp[4] = Aishou.hoshiScore(ra.hoshiGroup, rb.hoshiGroup);
    r.total = Aishou.weighted(r.comp, Aishou.W_TOTAL);
    r.seikaku = Aishou.weighted(r.comp, Aishou.W_SEIKAKU);
    r.kimochi = Aishou.weighted(r.comp, Aishou.W_KIMOCHI);
    r.kyoryoku = Aishou.weighted(r.comp, Aishou.W_KYORYOKU);
    return r;
  };

  Aishou.round1 = function (v) { return Math.round(v * 10.0) / 10.0; };
  /** %.1f 相当の整形（Java の String.format("%.1f") と同じ見た目） */
  Aishou.fmt1 = function (v) { return (Math.round(v * 10) / 10).toFixed(1); };

  // ---------- 読み解き文（すべて自作。Java から一字一句そのまま） ----------
  Aishou.RELATION_TEXT = [
    "日干がまったく同じ2人です。考え方や物事の進め方の「地」の部分がよく似ていて、説明しなくても通じ合える感覚があるとされます。似すぎて、同じところでつまずくこともあるかもしれません。得意なことも苦手なことも重なりやすいので、役割分担で補い合うより「一緒に楽しむ」場面で相性が活きそうです。", // 同干
    "日干の五行が同じ2人です。基本のテンポや価値観の方向が近く、並んで歩くような安定感があるとされます。ライバルのような関係にもなりやすく、張り合いがいい刺激になることも。似た者同士なので、意見がぶつかったときは「どちらが正しいか」より「どう分け合うか」で考えるとスムーズです。", // 比和
    "一方の五行がもう一方を生む（育てる）関係の2人です。片方の持ち味が、もう片方の力を自然に引き出す組み合わせとされます。支える・支えられるの役割が場面ごとに交代するような、流れのよい関係になりやすいでしょう。感謝を言葉にする習慣が、この相性をさらに育ててくれます。", // 相生
    "一方の五行がもう一方を抑える（剋す）関係の2人です。テンポや考え方が正反対に出やすく、最初は「合わないかも」と感じる場面もあるとされます。その代わり、自分にない視点を持ち寄れる組み合わせでもあります。違いを直す対象ではなく「そういう見方もある」と受け止められると、互いの世界が広がる関係になりそうです。" // 相剋
  ];

  Aishou.GOGYO_TEXT = [
    "2人の五行を合わせると、偏りが少なくバランスが整っています。一方が弱いところを、もう一方が自然にカバーし合える組み合わせとされます。足りないものを探すより、2人で広がる守備範囲の広さを楽しめる関係です。", // 高
    "2人の五行を合わせると、ところどころに偏りはあるものの、補い合える部分も見える組み合わせです。得意・不得意の出方が場面によって入れ替わるので、「ここは任せて」と言い合える関係になりやすいとされます。", // 中
    "2人の五行を合わせても偏りが残りやすい組み合わせです。似た強みが重なる分、同じ弱点も重なりやすいとされます。無理に補い合おうとするより、弱い部分は外の助けや仕組みに頼るのも上手な付き合い方です。偏りそのものは、2人の個性がはっきりしている証拠でもあります。" // 低
  ];

  Aishou.ELEMENT_TEXT = [
    "同じエレメント同士です。物事の感じ方や盛り上がるポイントが似ていて、言葉にしなくても伝わる安心感があるとされます。似ている分、同じ落とし穴に一緒にはまることも。たまに違うタイプの人の意見を聞くと、いい気分転換になります。", // 同じ
    "互いを後押しし合うとされるエレメントの組み合わせです。一方の勢いや持ち味が、もう一方の力を引き出しやすい関係。2人でいると物事が前に進みやすい、相乗効果タイプとされます。", // 後押しし合う
    "性質の違うエレメント同士で、刺激の強い組み合わせです。考え方や反応の仕方が正反対に出ることもありますが、その違いが互いの世界を広げてくれるとされます。ぶつかるのは関心がある証拠、と捉えると付き合いやすくなります。", // 刺激的
    "テンポの違うエレメント同士です。進め方や大事にするものが少しずつ違う分、役割分担がはっきりしやすい組み合わせとされます。相手のペースを「自分と違うだけ」と思えるかどうかが、長続きの鍵になりそうです。" // 異なるテンポ
  ];

  Aishou.HOSHI_TEXT = [
    "星めぐりのタイプ同士の相性も良好な組み合わせです。人生の節目の迎え方や、頑張りどき・休みどきの感覚が合いやすいとされます。", // 高
    "星めぐりのタイプ同士は、ほどよい距離感の組み合わせです。ペースの違いが出る場面もありますが、それが互いの刺激になりやすいとされます。", // 中
    "星めぐりのタイプ同士では、ペースの違いが目立ちやすい組み合わせです。頑張りどきと休みどきがずれても、それは相性の良し悪しではなく個性の違い。大事な予定は言葉で確認し合うと、すれ違いを減らせます。" // 低
  ];

  // ---------- 総評の合成 ----------
  Aishou.SUMMARY_HEAD = [
    "全体にバランスのよい、相性のよい組み合わせと出ました。",
    "よいところと、ちょっと工夫がいるところに分かれる、ほどよい相性の組み合わせと出ました。",
    "違いの目立つ組み合わせと出ました。ただ、違いは刺激や学びの元にもなります。"
  ];
  Aishou.STRONG_PHRASE = [
    "2人の基本の相性（日干の関係）がいちばんの強みです",
    "五行の補い合いがいちばんの強みです",
    "太陽星座のエレメントの合いがいちばんの強みです",
    "月星座のエレメントの合い、つまり素の状態での心地よさがいちばんの強みです",
    "星めぐりタイプの組み合わせがいちばんの強みです"
  ];
  Aishou.WEAK_PHRASE = [
    "日干の関係は正反対の色が出やすいので、考え方の違いを楽しむ余裕があるとよさそうです",
    "五行の面では似た偏りが重なりやすいので、弱い部分は2人で抱え込まず、外の助けに頼るのも手です",
    "太陽星座のエレメントはテンポが違いやすいので、進め方の違いを先に話しておくとスムーズです",
    "月星座のエレメントは素の反応が違いやすいので、気持ちは言葉にして伝えるのが安心です",
    "星めぐりタイプの面では頑張りどきのずれが出やすいので、大事な予定は言葉で確認し合いましょう"
  ];
  Aishou.SUMMARY_END =
    "どれも伝統的な占術の見方をもとにした本アプリ独自の目安です。実際の関係は日々の関わり方でいくらでも育っていきますので、軽い気持ちで楽しんでください。";

  /** 最も高い要素の添字（同点は固定順 [日干, 五行, 太陽, 月, 星] で先勝ち） */
  Aishou.strongestIndex = function (comp) {
    var best = 0;
    for (var i = 1; i < 5; i++) if (comp[i] > comp[best]) best = i;
    return best;
  };

  /** 最も低い要素の添字（同点は固定順で先勝ち） */
  Aishou.weakestIndex = function (comp) {
    var worst = 0;
    for (var i = 1; i < 5; i++) if (comp[i] < comp[worst]) worst = i;
    return worst;
  };

  Aishou.summaryText = function (r) {
    return Aishou.SUMMARY_HEAD[Aishou.bandOf(r.total)]
      + Aishou.STRONG_PHRASE[Aishou.strongestIndex(r.comp)] + "。"
      + Aishou.WEAK_PHRASE[Aishou.weakestIndex(r.comp)] + "。"
      + Aishou.SUMMARY_END;
  };

  // ---------- 手相からの相性コメント（スコアには含めない） ----------
  Aishou.TESOU_HEADING = "手相から見る2人";
  Aishou.TESOU_KANJO_TEXT = [
    "手相では、2人とも感情線の到達位置が同じタイプです。気持ちの表し方のペースが似ていて、「言わなくても分かる」場面が多そうな組み合わせとされます。", // 同じ
    "手相では、2人の感情線のタイプが近い組み合わせです。気持ちの表し方に大きなずれがなく、歩調を合わせやすいとされます。", // 近い
    "手相では、2人の感情線のタイプが対照的です。一方は表に出すタイプ、もう一方は内に秘めるタイプというように、表し方が正反対に出やすい組み合わせ。相手の表し方を「自分と違うだけ」と理解できると、すれ違いが減りそうです。" // 対照的
  ];
  Aishou.TESOU_DARK_TEXT = [
    "感情線の濃さも2人とも「濃い」タイプで、関係への向き合い方の本気度が似ているかもしれません。", // 両方濃い
    "感情線の濃さは2人で違いがあり、気持ちの表し方の強弱に差が出る場面もありそうです。", // 違いあり
    "感情線の濃さは2人とも「薄い」タイプで、さっぱりした距離感の付き合いが合いそうな組み合わせです。" // 両方薄い
  ];

  /**
   * 手相コメントの合成。両人の感情線（到達位置・濃さ）が確定している場合のみ文を返し、
   * そうでなければ null を返す。引数は各人の特徴レベル配列（特徴ID添字、未確定は -1）。
   */
  Aishou.tesouComment = function (featA, featB) {
    if (featA == null || featB == null) return null;
    var reachA = featA[fKanjoReach()], reachB = featB[fKanjoReach()];
    var darkA = featA[fKanjoDark()], darkB = featB[fKanjoDark()];
    if (reachA < 0 || reachB < 0 || darkA < 0 || darkB < 0) return null;
    var diff = Math.abs(reachA - reachB);
    var kanjoCat = diff === 0 ? 0 : (diff === 1 ? 1 : 2);
    var darkCat = (darkA === 0 && darkB === 0) ? 0 : (darkA === 2 && darkB === 2) ? 2 : 1;
    return Aishou.TESOU_KANJO_TEXT[kanjoCat] + Aishou.TESOU_DARK_TEXT[darkCat];
  };

  // ---------- 2人のこれから（予想とアドバイス） ----------
  Aishou.FUTURE_HEADING = "2人のこれから";

  /** 傾向ラベルの帯（0=好調 1=平穏 2=注意） */
  Aishou.bandOfLabel = function (label) {
    if ("好調" === label) return 0;
    if ("注意" === label) return 2;
    return 1;
  };

  Aishou.nenunOf = function (r, year) {
    if (r == null || r.nenun == null) return null;
    for (var i = 0; i < r.nenun.length; i++) {
      if (r.nenun[i].year === year) return r.nenun[i];
    }
    return null;
  };

  Aishou.yearPattern = function (bandA, bandB, nameA, nameB) {
    if (bandA === 0 && bandB === 0) {
      return "2人とも追い風の年です。一緒に新しいことを始めたり、計画を実行に移したりするのに向いています。";
    }
    if (bandA === 1 && bandB === 1) {
      return "2人とも穏やかな流れの年です。いつものペースを大切にして、日常を丁寧に重ねるのに向いています。";
    }
    if (bandA === 2 && bandB === 2) {
      return "2人ともペース配分が大事な年です。予定を詰め込みすぎず、休む時間も先に確保しておくと安心です。";
    }
    if (bandA !== 2 && bandB !== 2) { // 好調×平穏
      var hi = (bandA === 0 ? nameA : nameB) + "さん";
      var lo = (bandA === 0 ? nameB : nameA) + "さん";
      return hi + "が追い風、" + lo + "が穏やかな年です。勢いのある側が一歩先に進み、もう一方が土台を整える分担がはまりそうです。";
    }
    if (bandA === 0 || bandB === 0) { // 好調×注意
      var strong = (bandA === 0 ? nameA : nameB) + "さん";
      var care = (bandA === 0 ? nameB : nameA) + "さん";
      return care + "はペース配分が大事な年です。" + strong + "が支える側に回ると、2人のバランスが取りやすくなります。";
    }
    // 平穏×注意
    var calm = (bandA === 1 ? nameA : nameB) + "さん";
    var care2 = (bandA === 1 ? nameB : nameA) + "さん";
    return care2 + "は慎重にいきたい年、" + calm + "は穏やかな年です。急ぎの決めごとは避けて、様子を見ながら進めるのが合いそうです。";
  };

  /** 分野別スコア（性格・気持ち・協力）で最も低い軸への助言 */
  Aishou.axisAdvice = function (ar) {
    if (ar.seikaku <= ar.kimochi && ar.seikaku <= ar.kyoryoku) {
      return "考え方や進め方の違いが出やすい組み合わせです。「どちらが正しいか」より「どう分担するか」で話すと、すれ違いが減りそうです。";
    }
    if (ar.kimochi <= ar.kyoryoku) {
      return "気持ちは、察してもらうのを待つより、短い言葉で口に出すほうが伝わりやすい組み合わせです。節目のタイミングに、あらためて言葉にする機会を作ると助けになります。";
    }
    return "協力の場面では、役割をあいまいにしないことが鍵になります。お願いごとは最初に言葉で決めておくと、あとが楽になりそうです。";
  };

  /** 日干関係への助言（REL_* の並び） */
  Aishou.RELATION_ADVICE = [
    "同じ日干同士で、価値観や反応がよく似る組み合わせです。分かり合える速さが強みですが、遠慮がなくなりすぎないよう、感謝の言葉だけは意識して残しておくと安心です。", // 同干
    "日干の五行が同じで、似た者同士の安心感がある組み合わせです。似ている分、同じところで一緒に詰まることも。たまに第三者の意見を取り入れると、風通しがよくなります。", // 比和
    "日干は相生の関係で、片方の得意がもう片方を自然に助ける組み合わせです。頼ったり頼られたりを遠慮なく行き来させると、流れがよくなりそうです。", // 相生
    "日干は相剋の関係で、テンポが正反対に出ることもあります。その違いは、自分にない視点を持ち寄れるということでもあります。「そういう考え方もある」と受け止める余裕が、関係を広げてくれそうです。" // 相剋
  ];

  /** 月星座カテゴリへの助言（ECAT_* の並び） */
  Aishou.MOON_ADVICE = [
    "月星座のエレメントが同じで、素の状態の心地よさが強みです。その安心感を土台に、2人の「いつもの場所・いつもの時間」を大切にすると、関係が安定しやすいとされます。", // 同じ
    "月星座同士は後押しし合う組み合わせで、一緒にいると気持ちが前向きになりやすいとされます。楽しい予定を共有することが、そのまま関係の栄養になりそうです。", // 後押しし合う
    "月星座の組み合わせは刺激的で、感情の波が大きく出ることもあります。熱くなったときは、その場で結論を出さず、一晩おいてから話すルールが助けになります。", // 刺激的
    "月星座のテンポが違う組み合わせです。相手の「ちょうどいい速さ」は自分と違う、と知っておくだけで、すれ違いの多くは防げそうです。" // 異なるテンポ
  ];

  /**
   * 「2人のこれから」ブロックの本文（見出しは含まない）。
   * @param ar Aishou.compute の結果
   * @param ra/rb 2人の四柱推命の計算結果（年運の傾向を引くため。nenun 配列を使う）
   * @param startYear 鑑定年（流れの開始年）
   */
  Aishou.futureText = function (ar, ra, rb, nameA, nameB, startYear) {
    var sb = "";
    sb += "これからの流れ：\n";
    for (var k = 0; k < 3; k++) {
      var year = startYear + k;
      var na = Aishou.nenunOf(ra, year);
      var nb = Aishou.nenunOf(rb, year);
      if (na == null || nb == null) continue;
      var la = levelLabel(na.level);
      var lb = levelLabel(nb.level);
      sb += String(year) + "年："
        + nameA + "さんは「" + la + "」、"
        + nameB + "さんは「" + lb + "」。"
        + Aishou.yearPattern(Aishou.bandOfLabel(la), Aishou.bandOfLabel(lb), nameA, nameB)
        + "\n";
    }
    sb += "アドバイス：\n";
    sb += "・" + Aishou.axisAdvice(ar) + "\n";
    sb += "・" + Aishou.RELATION_ADVICE[ar.relation] + "\n";
    sb += "・" + Aishou.MOON_ADVICE[ar.moonCat];
    return sb;
  };

  root.UM = { Matome: Matome, Aishou: Aishou };
  if (typeof module !== "undefined" && module.exports) module.exports = root.UM;
})(typeof self !== "undefined" ? self : globalThis);
