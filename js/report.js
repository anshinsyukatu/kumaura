/*
 * 鑑定レポート全文の生成（ReportText.java の JavaScript 移植）。
 * 元: ~/workspace/uranai-app/manual/src/main/java/jp/kuma/uranai/ReportText.java
 *
 * 並び（結果画面と共通）：
 * 1. 基本情報
 * 2. 総評（短縮版＝Kaisetsu.summaryShort）
 * 3. 四柱推命：四柱表（十二運星の意味は初出のみ）・本質・五行バランス・通変星の意味
 * 4. 手相（常に出す。読み取れた場合は読み解き、未実施・読み取り
 *    失敗の場合はその旨の案内文だけを置く）
 * 5. 総合診断（手相×生年月日）（手相が読み取れた場合のみ）
 * 6. 西洋占星術
 * 7. 星めぐり占い
 * 8. 大運・年運（データ行のみ）＋大運の流れの要約
 * 9. 今年の運勢・今の大運・これからの見通しとアドバイス
 * 10. スコア
 * 11. まとめ：あなたの特性（締め）
 *
 * 重複排除の方針：
 * - 十二運星の意味（JUNIUN_TEXT）は初出の柱でのみ付ける。
 * - 通変星の期間文（TSUHEN_PERIOD）の本拠地は「今年の運勢」「今の大運」だけ。
 * - まとめは各セクションの部品文を再掲せず、Matome 専用の短文で要約する。
 * 計算（四柱・天体・スコア等）は依存モジュールの結果をそのまま使い、
 * ここでは一切変えない。
 *
 * 依存モジュールはすべて global（root）に載っている前提で、呼び出し時に参照する：
 *   root.UE.Shichu / root.UE.Astro / root.UE.Pref
 *   root.UK（Kaisetsu）
 *   root.US.Seiyo / root.US.Hoshi
 *   root.UT.Tesou / root.UT.Sougou
 *   root.UM.Matome / root.UM.Aishou
 *
 * 注：見出しを囲む隅付き括弧（U+3010／U+3011）は、ソース上では
 * LB／RB 定数（ユニコードエスケープ）として定義し、各見出しで組み立てる。
 * 生成される文字列は Java 版と完全に同一である。
 */
(function (root) {
  "use strict";

  var LB = "\u3010"; // 見出しの開き隅付き括弧
  var RB = "\u3011"; // 見出しの閉じ隅付き括弧

  var COL_NAMES = ["年柱", "月柱", "日柱", "時柱"];

  // ---------- 手相の状態 ----------
  /** 手相は未実施（写真の登録なし） */
  var PALM_NONE = 0;
  /** 写真から手相を読み取れた（feat が有効） */
  var PALM_OK = 1;
  /** 写真は登録されたが、自動読み取りで読み取れなかった */
  var PALM_FAILED = 2;

  /** 手相・未実施のときに置く案内文（結果画面と共通） */
  var TESOU_NONE_TEXT =
    "手相は未実施です（入力画面で写真を登録すると読み取れます）";
  /** 手相・読み取り失敗のときに置く案内文（結果画面と共通） */
  var TESOU_FAIL_TEXT =
    "写真から手相を読み取れませんでした。明るい場所で手のひら全体を撮ると読み取りやすくなります";

  /** 全文コピーの締めの注記（個人鑑定の全文コピーの最後に付ける） */
  var CLOSING_NOTE =
    "※解釈は娯楽・参考情報です。将来を断定するものではありません。\n";

  // ---------- 書式ヘルパー（Java の String.format 相当） ----------
  // String.format(Locale.JAPAN, "%.1f", v)
  function fmt1(v) {
    return (Math.round(v * 10) / 10).toFixed(1);
  }
  // String.format(Locale.JAPAN, "%02d", v)
  function fmt02(v) {
    return String(v).padStart(2, "0");
  }
  // Java の整数除算（0 方向への切り捨て）
  function idiv(a, b) {
    return Math.trunc(a / b);
  }

  // 依存モジュールを呼び出し時に解決する（読み込み順に依存しないため）。
  function deps() {
    var UE = root.UE || {};
    var US = root.US || {};
    var UT = root.UT || {};
    var UM = root.UM || {};
    return {
      Shichu: UE.Shichu,
      Astro: UE.Astro,
      Pref: UE.Pref,
      Kaisetsu: root.UK,
      Seiyo: US.Seiyo,
      Hoshi: US.Hoshi,
      Tesou: UT.Tesou,
      Sougou: UT.Sougou,
      Matome: UM.Matome,
      Aishou: UM.Aishou
    };
  }

  /**
   * レベルの簡易文字バー。0〜10 を10マスで表し、
   * レベルを丸めた数だけ ■、残りを □ にする。
   */
  function levelBar(level) {
    var filled = Math.round(level);
    if (filled < 0) filled = 0;
    if (filled > 10) filled = 10;
    var b = "";
    for (var i = 0; i < 10; i++) b += i < filled ? "■" : "□";
    return b;
  }

  /**
   * 個人鑑定の全文（相性と締めの注記は含まない）。
   * @param feat 手相の特徴配列（palmStatus が PALM_OK の場合のみ有効。それ以外は null）
   * @param hand 手相の左右（0=右手 1=左手。feat が null のときは不使用）
   * @param palmStatus 手相の状態（PALM_NONE／PALM_OK／PALM_FAILED）
   */
  function buildPersonal(name, by, bm, bd, hh, mi, timeUnknown, male, pref,
                         ry, rm, rd, feat, hand, palmStatus) {
    var D = deps();
    var Shichu = D.Shichu, Astro = D.Astro, Pref = D.Pref, Kaisetsu = D.Kaisetsu;
    var Seiyo = D.Seiyo, Hoshi = D.Hoshi, Tesou = D.Tesou, Sougou = D.Sougou;
    var Matome = D.Matome;
    var SUN = Astro.SUN !== undefined ? Astro.SUN : 0;
    var MOON = Astro.MOON !== undefined ? Astro.MOON : 1;

    var r = Shichu.compute(by, bm, bd, hh, mi, male, ry, rm, rd);
    var ac = Astro.compute(by, bm, bd, hh, mi, Pref.LAT[pref], Pref.LON[pref]);
    var sunSign = Astro.signOf(ac.lon[SUN]);
    var moonSign = Astro.signOf(ac.lon[MOON]);
    var ascSign = Astro.signOf(ac.asc);
    var ageMonths = (ry - by) * 12 + (rm - bm) - (rd < bd ? 1 : 0);
    var curDaiun = Kaisetsu.currentDaiun(r, ageMonths);
    var five = Kaisetsu.fiveYears(r, ry);
    var pillars = [r.yearIdx, r.monthIdx, r.dayIdx, r.hourIdx];

    var sb = "";
    // ---------- 1. 基本情報 ----------
    sb += "この鑑定は娯楽・参考情報です。\n";
    sb += "鑑定日：" + ry + "年" + rm + "月" + rd + "日\n";
    sb += "対象者：" + name + "\n";
    sb += "生年月日：" + by + "年" + bm + "月" + bd + "日 " +
      (timeUnknown ? "12:00（時刻不明のため仮計算）"
                   : hh + "時" + fmt02(mi) + "分") +
      "、性別：" + (male ? "男性" : "女性") +
      "、出生地：" + Pref.NAMES[pref] +
      "、満年齢：" + r.age + "歳\n\n";

    // ---------- 2. 総評（短縮版） ----------
    sb += LB + "総評" + RB + "\n";
    sb += Kaisetsu.summaryShort(r, sunSign) + "\n\n";

    // ---------- 3. 四柱推命 ----------
    sb += LB + "四柱推命" + RB + "\n";
    var juniunShown = [];
    for (var u = 0; u < 12; u++) juniunShown.push(false);
    for (var i = 0; i < 4; i++) {
      var tsuhen = i === 2 ? "日主" : Shichu.TSUHEN[r.tsuhen[i]];
      sb += COL_NAMES[i] + "：" + Shichu.kanjiOf(pillars[i]) +
        "　通変星：" + tsuhen +
        "　十二運星：" + Shichu.JUNIUN[r.juniun[i]];
      if (i === 3 && timeUnknown) sb += "（参考値）";
      sb += "\n";
      sb += Kaisetsu.PILLAR_MEANING[i] + "\n";
      sb += "読み解き：" + Kaisetsu.pillarReading(r, i) + "\n";
      if (!juniunShown[r.juniun[i]]) {
        juniunShown[r.juniun[i]] = true;
        sb += "十二運星「" + Shichu.JUNIUN[r.juniun[i]] + "」の意味：" +
          Kaisetsu.JUNIUN_TEXT[r.juniun[i]] + "\n";
      }
    }
    sb += "日干（日主）：" + Shichu.KAN[r.dayStem] + "\n";
    sb += "■あなたの本質（日干）\n";
    sb += "日干「" + Shichu.KAN[r.dayStem] + "」は、" +
      Kaisetsu.STEM_CATCH[r.dayStem] + "にたとえられます。\n";
    sb += Kaisetsu.STEM_TEXT[r.dayStem] + "\n";
    sb += Kaisetsu.STEM_EXTRA[r.dayStem] + "\n";
    sb += "■五行バランス\n";
    sb += "命式8文字の五行の数：";
    for (var g = 0; g < 5; g++) {
      if (g > 0) sb += "・";
      sb += Shichu.GOGYO_NAME[g] + r.gogyoCount[g];
    }
    sb += "\n";
    sb += Kaisetsu.gogyoReading(r) + "\n";
    sb += "■通変星の意味\n";
    var shownT = [];
    for (var t0 = 0; t0 < 10; t0++) shownT.push(false);
    for (var i2 = 0; i2 < 4; i2++) {
      if (i2 === 2) continue;
      var t = r.tsuhen[i2];
      if (shownT[t]) continue;
      shownT[t] = true;
      var where = "";
      for (var j = 0; j < 4; j++) {
        if (j !== 2 && r.tsuhen[j] === t) {
          if (where.length > 0) where += "・";
          where += COL_NAMES[j];
        }
      }
      sb += LB + Shichu.TSUHEN[t] + RB + "（" + where + "）\n";
      sb += Kaisetsu.TSUHEN_TEXT[t] + "\n";
    }
    sb += "\n";

    // ---------- 4. 手相／5. 総合診断 ----------
    // 手相セクションは常に出す。読み取れた場合は読み解き＋総合診断、
    // 未実施・読み取り失敗の場合は案内文だけを置き、鑑定自体は止めない。
    var sg = (palmStatus === PALM_OK && feat != null)
      ? Sougou.compute(r, sunSign, moonSign, feat) : null;
    if (palmStatus === PALM_OK && feat != null) {
      sb += tesouText(feat, hand);
      if (sg != null) sb += sougouText(sg);
    } else if (palmStatus === PALM_FAILED) {
      sb += LB + "手相" + RB + "\n" + TESOU_FAIL_TEXT + "\n\n";
    } else {
      sb += LB + "手相" + RB + "\n" + TESOU_NONE_TEXT + "\n\n";
    }

    // ---------- 6. 西洋占星術 ----------
    sb += LB + "西洋占星術" + RB + "\n";
    if (timeUnknown) sb += "※出生時刻が不明なため12:00で仮計算しています。ASC・MC・ハウスは参考値です。\n";
    sb += "太陽星座：" + Astro.formatLon(ac.lon[SUN]) + "\n";
    sb += Seiyo.SUN_TEXT[sunSign] + "\n";
    sb += "日干×太陽星座の組み合わせ：\n";
    sb += Kaisetsu.stemSunCombo(r.dayStem, sunSign) + "\n";
    sb += "月星座：" + Astro.formatLon(ac.lon[MOON]) + "\n";
    sb += Seiyo.MOON_TEXT[moonSign] + "\n";
    sb += "ASC（上昇星座）：" + Astro.formatLon(ac.asc);
    if (timeUnknown) sb += "（参考値）";
    sb += "\n";
    sb += Seiyo.ASC_TEXT[ascSign] + "\n";
    sb += "MC：" + Astro.formatLon(ac.mc);
    if (timeUnknown) sb += "（参考値）";
    sb += "\n";
    sb += "天体の配置：\n";
    for (var b = 0; b < 10; b++) {
      var sgx = Astro.signOf(ac.lon[b]);
      sb += Astro.BODY_NAME[b] + "：" + Astro.formatLon(ac.lon[b]) + "\n";
      sb += Seiyo.bodySignText(b, sgx) + "\n";
    }
    sb += "ハウス（イコールハウス方式：ASCから30°ずつ区切ります）：\n";
    sb += Seiyo.HOUSE_INTRO + "\n";
    for (var k = 0; k < 12; k++) {
      sb += "第" + (k + 1) + "ハウス（" + Seiyo.HOUSE_THEME[k] +
        "）：" + Astro.formatLon(ac.cusps[k]);
      if (k === 0) sb += "（ASC）";
      if (timeUnknown) sb += "（参考値）";
      sb += "\n";
    }
    sb += "\n";

    // ---------- 7. 星めぐり占い ----------
    sb += LB + "星めぐり占い" + RB + "\n";
    sb += "星数：" + r.hoshiNumber + "\n";
    sb += "タイプ：" + Hoshi.typeName(r) + "\n";
    sb += "持ち味：" + Hoshi.GROUP_CATCH[r.hoshiGroup] + "\n";
    sb += Hoshi.reading(r) + "\n";
    sb += Hoshi.INTRO + "\n\n";

    // ---------- 8. 大運・年運（データのみ）＋大運の流れの要約 ----------
    var sm = r.daiunStartMonths;
    sb += LB + "大運" + RB + "\n";
    sb += "方向：" + (r.daiunForward ? "順行" : "逆行") +
      "　起運：約" + idiv(sm, 12) + "歳" + (sm % 12) + "か月\n";
    for (var d = 0; d < r.daiun.length; d++) {
      var du = r.daiun[d];
      sb += Shichu.kanjiOf(du.pillarIdx) +
        "（約" + idiv(du.startMonths, 12) + "歳〜、" + du.startYear + "年ごろ〜）" +
        "通変星：" + Shichu.TSUHEN[du.tsuhen] +
        "　十二運星：" + Shichu.JUNIUN[du.juniun] +
        "　傾向：" + Shichu.levelLabel(du.level) + "\n";
    }
    sb += "\n" + LB + "年運" + RB + "\n";
    for (var n = 0; n < r.nenun.length; n++) {
      var nn = r.nenun[n];
      sb += nn.year + "年 " + Shichu.kanjiOf(nn.pillarIdx) +
        "　通変星：" + Shichu.TSUHEN[nn.tsuhen] +
        "　十二運星：" + Shichu.JUNIUN[nn.juniun] +
        "　レベル：" + fmt1(nn.level) + " " + levelBar(nn.level) +
        "　傾向：" + Shichu.levelLabel(nn.level) + "\n";
    }
    sb += "■大運の流れの要約\n";
    sb += Kaisetsu.daiunSummary(r) + "\n";

    // ---------- 9. 今年の運勢／今の大運／見通しとアドバイス ----------
    sb += "\n" + LB + "今年の運勢" + RB + "\n";
    var curN = null;
    for (var n2 = 0; n2 < r.nenun.length; n2++) {
      if (r.nenun[n2].year === ry) curN = r.nenun[n2];
    }
    if (curN != null) {
      sb += curN.year + "年 " + Shichu.kanjiOf(curN.pillarIdx) +
        "　通変星：" + Shichu.TSUHEN[curN.tsuhen] +
        "　十二運星：" + Shichu.JUNIUN[curN.juniun] +
        "　レベル：" + fmt1(curN.level) + " " + levelBar(curN.level) +
        "　傾向：" + Shichu.levelLabel(curN.level) + "\n";
      sb += "読み解き：" + Kaisetsu.TSUHEN_PERIOD[curN.tsuhen] + "\n";
      sb += Kaisetsu.junYearLine(curN.juniun) + "\n";
      var yf = Kaisetsu.yearFields(curN);
      sb += "仕事：" + yf[0] + "\n";
      sb += "お金：" + yf[1] + "\n";
      sb += "対人・恋愛：" + yf[2] + "\n";
      sb += "生活リズム：" + yf[3] + "\n";
    }
    sb += "\n" + LB + "今の大運" + RB + "\n";
    if (curDaiun != null) {
      var remain = Math.max(0, Math.round((curDaiun.startMonths + 120 - ageMonths) / 12.0));
      sb += Shichu.kanjiOf(curDaiun.pillarIdx) +
        "（約" + idiv(curDaiun.startMonths, 12) + "歳〜約" +
        idiv(curDaiun.startMonths + 120, 12) + "歳、" +
        curDaiun.startYear + "年ごろ〜" + (curDaiun.startYear + 10) + "年ごろ）" +
        "通変星：" + Shichu.TSUHEN[curDaiun.tsuhen] +
        "　十二運星：" + Shichu.JUNIUN[curDaiun.juniun] +
        "　傾向：" + Shichu.levelLabel(curDaiun.level) + "\n";
      sb += "今はこの大運の途中で、残りは約" + remain + "年です。\n";
      sb += "読み解き：" + Kaisetsu.daiunReading(curDaiun) + "\n";
      sb += Kaisetsu.DAIUN_HINT[Kaisetsu.labelIndex(curDaiun.level)] + "\n";
    } else {
      sb += "大運はまだ始まっていません。最初の大運は " +
        Shichu.kanjiOf(r.daiun[0].pillarIdx) +
        "（約" + idiv(r.daiun[0].startMonths, 12) + "歳〜、" +
        r.daiun[0].startYear + "年ごろ〜）です。\n";
      sb += Kaisetsu.DAIUN_PRE_HINT + "\n";
    }
    sb += "\n" + LB + "これからの見通しとアドバイス" + RB + "\n";
    sb += "今後予想されること：\n";
    sb += Kaisetsu.outlookForecast(r, curDaiun, five) + "\n";
    sb += "アドバイス：\n";
    sb += Kaisetsu.outlookAdvice(r, curDaiun, five) + "\n";
    sb += "\n（本アプリ独自の指標です。「傾向」は一般的な目安であり、吉凶の断定ではありません）\n";

    // ---------- 10. スコア ----------
    sb += LB + "スコア" + RB + "\n";
    sb += "仕事運：" + fmt1(r.scoreWork) +
      "　金運：" + fmt1(r.scoreMoney) +
      "　恋愛・対人運：" + fmt1(r.scoreLove) +
      "　健康運（五行バランス）：" + fmt1(r.scoreHealth) +
      "　総合運：" + fmt1(r.scoreTotal) + "\n";
    sb += "※健康運は五行の偏りの小ささを指数化したもので、健康状態の判定・予測ではありません。\n\n";

    // ---------- 11. まとめ：あなたの特性（締め） ----------
    var mt = Matome.compute(r, sunSign, moonSign, curDaiun, five, feat);
    sb += LB + Matome.HEADING + RB + "\n";
    sb += "■特性\n" + mt.tokusei + "\n";
    sb += "■強み\n" + mt.tsuyomi + "\n";
    sb += "■弱み（補うヒント）\n" + mt.yowami + "\n";
    sb += "■今後のアドバイス\n" + mt.advice + "\n";
    return sb;
  }

  /** 手相の全文テキスト（特徴と読み解きのみ。写真は含めない） */
  function tesouText(feat, hand) {
    var Tesou = deps().Tesou;
    var sb = "";
    sb += LB + "手相" + RB + "（" + (hand === 1 ? "左手" : "右手") + "）\n";
    for (var li = 0; li < 4; li++) {
      sb += "■" + Tesou.LINE_NAME[li] + "\n";
      var fids = Tesou.LINE_FEATURES[li];
      for (var f = 0; f < fids.length; f++) {
        var fid = fids[f];
        var lv = feat[fid];
        if (lv < 0) continue;
        sb += Tesou.FEATURE_NAME[fid] + "：" + Tesou.FEATURE_LABEL[fid][lv] + "\n";
        sb += Tesou.FEATURE_TEXT[fid][lv] + "\n";
      }
    }
    sb += "■総合\n";
    sb += Tesou.summaryText(
      feat[Tesou.F_SEIMEI_ARC], feat[Tesou.F_CHINO_SLOPE],
      feat[Tesou.F_KANJO_REACH], feat[Tesou.F_UNMEI_DARK]) + "\n";
    sb += "■" + Tesou.ADVICE_HEADING + "\n";
    sb += Tesou.adviceText(
      feat[Tesou.F_SEIMEI_ARC], feat[Tesou.F_CHINO_SLOPE],
      feat[Tesou.F_KANJO_REACH], feat[Tesou.F_UNMEI_DARK]) + "\n\n";
    return sb;
  }

  /** 総合診断の全文テキスト（Sougou.compute の結果から） */
  function sougouText(sg) {
    var Sougou = deps().Sougou;
    var sb = "";
    sb += LB + "総合診断（手相×生年月日）" + RB + "\n";
    for (var ax = 0; ax < Sougou.AXIS_COUNT; ax++) {
      var a = sg.axes[ax];
      sb += "■" + Sougou.AXIS_NAME[ax] + "（" + Sougou.REL_NAME[a.relation] + "）\n";
      sb += "手相では（" + a.palmBasis + "）：" + a.palmText + "\n";
      sb += "生年月日では（" + a.birthBasis + "）：" + a.birthText + "\n";
      sb += "組み合わせ：" + a.comboText + "\n";
    }
    sb += "■まとめのアドバイス\n";
    sb += sg.advice + "\n\n";
    return sb;
  }

  /**
   * 相性コピーの最小ヘッダー。
   * 免責の一行・鑑定日・2人の名前と生年月日だけを置く（個人鑑定の各セクションは含めない）。
   */
  function aishouHeader(name0, by0, bm0, bd0, name1, by1, bm1, bd1, ry, rm, rd) {
    var sb = "";
    sb += "この鑑定は娯楽・参考情報です。\n";
    sb += "鑑定日：" + ry + "年" + rm + "月" + rd + "日\n";
    sb += name0 + " さん × " + name1 + " さん\n";
    sb += name0 + " さん：" + by0 + "年" + bm0 + "月" + bd0 + "日生まれ\n";
    sb += name1 + " さん：" + by1 + "年" + bm1 + "月" + bd1 + "日生まれ\n";
    return sb;
  }

  /**
   * 相性画面のコピー内容。
   * 最小ヘッダー＋相性セクションのみで、個人鑑定のセクションは含めない。
   * 末尾に個人全文と同じ締めの注記（CLOSING_NOTE）を付ける。
   * @param aishouHeader aishouHeader の結果
   * @param aishouText buildAishou の結果（先頭に改行＋相性見出しを含む）
   */
  function buildAishouCopy(aishouHeaderText, aishouText) {
    return aishouHeaderText + aishouText + CLOSING_NOTE;
  }

  /**
   * 相性の全文テキスト。
   * @param feat0 1人目の手相特徴（手相コメントを付ける場合のみ feat1 と両方 non-null）
   * @param feat1 2人目の手相特徴（同上）
   */
  function buildAishou(name0, by0, bm0, bd0, hh0, mi0, male0, pref0,
                       name1, by1, bm1, bd1, hh1, mi1, male1, pref1,
                       ry, rm, rd, feat0, feat1) {
    var D = deps();
    var Shichu = D.Shichu, Astro = D.Astro, Pref = D.Pref, Aishou = D.Aishou;
    var SUN = Astro.SUN !== undefined ? Astro.SUN : 0;
    var MOON = Astro.MOON !== undefined ? Astro.MOON : 1;

    var r0 = Shichu.compute(by0, bm0, bd0, hh0, mi0, male0, ry, rm, rd);
    var r1 = Shichu.compute(by1, bm1, bd1, hh1, mi1, male1, ry, rm, rd);
    var c0 = Astro.compute(by0, bm0, bd0, hh0, mi0, Pref.LAT[pref0], Pref.LON[pref0]);
    var c1 = Astro.compute(by1, bm1, bd1, hh1, mi1, Pref.LAT[pref1], Pref.LON[pref1]);
    var sun0 = Astro.signOf(c0.lon[SUN]);
    var moon0 = Astro.signOf(c0.lon[MOON]);
    var sun1 = Astro.signOf(c1.lon[SUN]);
    var moon1 = Astro.signOf(c1.lon[MOON]);
    var ar = Aishou.compute(r0, sun0, moon0, r1, sun1, moon1);

    var sb = "";
    sb += "\n" + LB + "相性" + RB + name0 + " さん × " + name1 + " さん\n";
    sb += "総合スコア：" + fmt1(ar.total) + " / 10.0\n";
    sb += "性格の合いやすさ：" + fmt1(ar.seikaku) +
      "　気持ちの通じやすさ：" + fmt1(ar.kimochi) +
      "　協力しやすさ：" + fmt1(ar.kyoryoku) + "\n";
    sb += "総評：" + Aishou.summaryText(ar) + "\n";
    sb += "日干の関係：" + Aishou.REL_NAME[ar.relation] + "\n";
    sb += Aishou.RELATION_TEXT[ar.relation] + "\n";
    sb += "五行の補完：\n" + Aishou.GOGYO_TEXT[Aishou.bandOf(ar.comp[1])] + "\n";
    sb += "太陽星座の相性：\n" + Aishou.ELEMENT_TEXT[ar.sunCat] + "\n";
    sb += "月星座の相性：\n" + Aishou.ELEMENT_TEXT[ar.moonCat] + "\n";
    sb += "星めぐりタイプの相性：\n" + Aishou.HOSHI_TEXT[Aishou.bandOf(ar.comp[4])] + "\n";
    // 手相からの相性コメント（2人とも手相が確定している場合のみ。呼び出し側が
    // 両方の特徴を渡したときだけ付ける）
    if (feat0 != null && feat1 != null) {
      var tc = Aishou.tesouComment(feat0, feat1);
      if (tc != null) {
        sb += Aishou.TESOU_HEADING + "：\n" + tc + "\n";
      }
    }
    // 2人のこれから（予想とアドバイス）。相性セクションの最後に置く。
    sb += "■" + Aishou.FUTURE_HEADING + "（予想とアドバイス）\n";
    sb += Aishou.futureText(ar, r0, r1, name0, name1, ry) + "\n";
    return sb;
  }

  root.UR = {
    PALM_NONE: PALM_NONE,
    PALM_OK: PALM_OK,
    PALM_FAILED: PALM_FAILED,
    TESOU_NONE_TEXT: TESOU_NONE_TEXT,
    TESOU_FAIL_TEXT: TESOU_FAIL_TEXT,
    CLOSING_NOTE: CLOSING_NOTE,
    levelBar: levelBar,
    buildPersonal: buildPersonal,
    tesouText: tesouText,
    sougouText: sougouText,
    aishouHeader: aishouHeader,
    buildAishouCopy: buildAishouCopy,
    buildAishou: buildAishou
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.UR;
})(typeof self !== "undefined" ? self : globalThis);
