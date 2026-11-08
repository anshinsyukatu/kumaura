/* クマうら「今日の一言」表示
 * 毎朝5時のプッシュ通知と同じ文面を、トップ（同意画面）にも表示する。
 * 計算式とフレーズは配信側（Cloudflare Worker）と同一。日付だけで決まるので、
 * サーバーに問い合わせず、この画面の中だけで組み立てる。 */
(function () {
  "use strict";

  var STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  var BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  var STEM_ELEMENTS = ["木", "木", "火", "火", "土", "土", "金", "金", "水", "水"];
  var WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

  var ELEMENT_PHRASES = {
    "木": [
      "新しい芽が伸びる日。小さな一歩を踏み出してみましょう",
      "伸びやかに過ごせる日。背筋を伸ばして深呼吸を",
      "育てることに向く日。続けてきたことが実を結び始めます",
    ],
    "火": [
      "気持ちが明るく燃える日。笑顔が運を呼びます",
      "情熱が湧く日。やりたいことを後回しにしないで",
      "灯りをともす日。周りの人へのひと言が温かく届きます",
    ],
    "土": [
      "足元を固める日。いつもの手順を丁寧にこなしましょう",
      "安心感が増す日。温かい飲み物でひと息ついて",
      "積み重ねが効く日。コツコツが一番の近道です",
    ],
    "金": [
      "研ぎ澄まされる日。身の回りを整えると気分もすっきり",
      "実りの日。これまでの努力が形になって見えてきます",
      "凛と過ごせる日。言葉を選ぶと信頼が深まります",
    ],
    "水": [
      "流れに乗れる日。力を抜くとうまく進みます",
      "潤いの日。水分補給と休息を忘れずに",
      "静かに考えがまとまる日。一人の時間が味方します",
    ],
  };

  var LUCKY_COLORS = [
    "赤", "青", "黄色", "緑", "白",
    "黒", "ピンク", "水色", "金色", "紫",
    "オレンジ", "茶色",
  ];

  var LUCKY_ITEMS = [
    "ハンカチ", "腕時計", "手帳", "温かいお茶", "本",
    "折りたたみ傘", "イヤホン", "マグカップ", "鍵", "植物",
    "靴", "エコバッグ",
  ];

  function julianDayNumber(year, month, day) {
    var a = Math.floor((14 - month) / 12);
    var y = year + 4800 - a;
    var m = month + 12 * a - 3;
    return (
      day +
      Math.floor((153 * m + 2) / 5) +
      365 * y +
      Math.floor(y / 4) -
      Math.floor(y / 100) +
      Math.floor(y / 400) -
      32045
    );
  }

  // 日本時間の「今日」で一言を組み立てる
  function buildText() {
    var jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    var year = jst.getUTCFullYear();
    var month = jst.getUTCMonth() + 1;
    var day = jst.getUTCDate();
    var weekday = WEEKDAYS[jst.getUTCDay()];

    var jdn = julianDayNumber(year, month, day);
    var dayIndex = ((jdn + 49) % 60 + 60) % 60;
    var stem = STEMS[dayIndex % 10];
    var branch = BRANCHES[dayIndex % 12];
    var element = STEM_ELEMENTS[dayIndex % 10];

    var phrases = ELEMENT_PHRASES[element];
    var phrase = phrases[jdn % phrases.length];
    var color = LUCKY_COLORS[(jdn * 7 + 3) % LUCKY_COLORS.length];
    var item = LUCKY_ITEMS[(jdn * 11 + 5) % LUCKY_ITEMS.length];

    return (
      month + "月" + day + "日（" + weekday + "） " +
      stem + branch + "・" + element + "の日。" +
      phrase + "。ラッキーカラーは" + color +
      "、ラッキーアイテムは" + item + "です。"
    );
  }

  function init() {
    var el = document.getElementById("hitokoto-text");
    if (el) el.textContent = buildText();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
