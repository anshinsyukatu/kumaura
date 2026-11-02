/*
 * クマうら Web版：画面構築・フロー制御（Android版 MainActivity の移植）。
 * 計算・文章は js/engine.js / kaisetsu.js / seiyo.js / tesou.js / matome.js /
 * palm.js / report.js に委ね、ここでは一切再計算・言い換えをしない。
 * 入力値と写真はメモリ上のみで保持し、保存は一切しない。
 */
(function () {
"use strict";

var UE = window.UE, UK = window.UK, US = window.US, UT = window.UT,
    UM = window.UM, UP = window.UP, UR = window.UR;
var Shichu = UE.Shichu, Astro = UE.Astro, Pref = UE.Pref;
var Seiyo = US.Seiyo, Hoshi = US.Hoshi;
var Tesou = UT.Tesou, Sougou = UT.Sougou;
var Matome = UM.Matome, Aishou = UM.Aishou;

/* ---------- MainActivity の定数文（Web向けに媒体表現だけ調整した免責は index.html 側） ---------- */
var SCORE_EXPLAIN =
"スコアは本アプリ独自の指標です。伝統的な占術に「正しいスコア計算式」は存在せず、" +
"占いの正しさを保証するものではありません。\n\n" +
"算出方法：基礎値5.0に、命式（四柱）の年柱・月柱・時柱の通変星の現れ方に応じた係数を加減し、" +
"0.0〜10.0に収めて小数第1位に丸めます。\n" +
"・仕事運：正官・偏官（責任・組織）と正印・偏印（支援・資格）を加点、傷官を大きく減点\n" +
"・金運：正財・偏財を加点、食神（財を生む）を加点、劫財・比肩（財を分ける）を減点\n" +
"・恋愛・対人運：正財・偏財・食神・正官を加点、傷官・劫財を減点（性別に依存しない定義に簡略化しています）\n" +
"・健康運：命式8文字の五行（木・火・土・金・水）の偏りの小ささを指数化したもので、健康状態の判定・予測ではありません\n" +
"・総合運：上記4分野の平均\n\n" +
"同じ入力では必ず同じ値になります。";

var AISHOU_EXPLAIN =
"相性スコアは本アプリ独自の指標です。伝統的な占術に「正しい相性の計算式」は存在せず、" +
"相性の良し悪しを保証するものではありません。\n\n" +
"算出方法：次の5つの要素をそれぞれ0.0〜10.0で数値化し、重み付きの平均を取ります。\n" +
"・日干の関係（30%）：2人の日干の五行関係（同干・比和・相生・相剋）と陰陽の組み合わせ\n" +
"・五行の補完（25%）：2人の命式の五行を合わせたときの偏りの小ささ\n" +
"・太陽星座（20%）：太陽星座のエレメント（火・地・風・水）の組み合わせ表\n" +
"・月星座（15%）：月星座のエレメントの組み合わせ表\n" +
"・星めぐりタイプ（10%）：星グループ同士の組み合わせ表\n\n" +
"分野別スコア（性格の合いやすさ／気持ちの通じやすさ／協力しやすさ）は、同じ5要素の重みを変えて算出します。\n" +
"どの要素も2人の順番に依存しない定義のため、A×BとB×Aで必ず同じ値になります。同じ入力では必ず同じ値になります。";

/* ---------- 色（MainActivity のパレット） ---------- */
function darkMode() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function cText() { return darkMode() ? "rgb(238,238,238)" : "rgb(33,33,33)"; }
function cSub() { return darkMode() ? "rgb(178,178,178)" : "rgb(96,96,96)"; }
function cBtnBg() { return darkMode() ? "rgb(56,56,56)" : "rgb(224,224,224)"; }
function argbToCss(c) {
  return "rgb(" + ((c >> 16) & 255) + "," + ((c >> 8) & 255) + "," + (c & 255) + ")";
}
function chipBg(label) {
  if (label === "好調") return "rgb(46,125,50)";
  if (label === "注意") return "rgb(198,40,40)";
  return "rgb(249,168,37)";
}
function chipClass(label) {
  return label === "好調" ? "good" : (label === "注意" ? "bad" : "mid");
}
var GOGYO_COLORS = ["rgb(67,160,71)", "rgb(229,57,53)", "rgb(192,138,45)",
                    "rgb(158,143,96)", "rgb(30,136,229)"];
var ACCENT = "rgb(216,67,54)";

function fmt1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
function fmt02(v) { return String(v).padStart(2, "0"); }

/* ---------- DOM ヘルパー ---------- */
function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function tv(parent, text, cls) {
  var p = el("p", cls || "text", text);
  parent.appendChild(p);
  return p;
}
function note(parent, text) { return tv(parent, text, "note"); }
function header(parent, text) {
  var h = el("h3", "section-header", text);
  parent.appendChild(h);
  return h;
}
function subhead(parent, text, size) {
  var p = el("p", size === 15 ? "subhead-15" : "subhead", text);
  parent.appendChild(p);
  return p;
}
function btn(parent, text, onClick, cls) {
  var b = el("button", "btn" + (cls ? " " + cls : ""), text);
  b.type = "button";
  b.addEventListener("click", onClick);
  parent.appendChild(b);
  return b;
}
function collapsible(parent, label) {
  var box = el("div", "collapsible");
  var head = el("button", "col-head", "🔻 " + label);
  head.type = "button";
  var body = el("div", "col-body hidden");
  head.addEventListener("click", function () {
    var open = body.classList.toggle("hidden") === false;
    head.textContent = (open ? "🔺 " : "🔻 ") + label;
  });
  box.appendChild(head);
  box.appendChild(body);
  parent.appendChild(box);
  return body;
}
function barEl(frac, color, heightClass) {
  var bar = el("div", "bar" + (heightClass ? " " + heightClass : ""));
  var fill = el("div", "bar-fill");
  var f = Math.max(0, Math.min(1, frac));
  fill.style.width = (f * 100) + "%";
  fill.style.background = color;
  bar.appendChild(fill);
  return bar;
}
function scoreRow(parent, label, v) {
  var row = el("div", "score-row");
  row.appendChild(el("span", "sr-label", label));
  row.appendChild(barEl(v / 10, chipBg(Shichu.levelLabel(v))));
  row.appendChild(el("span", "sr-value", fmt1(v)));
  parent.appendChild(row);
}
function toast(msg) {
  var t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function () { t.classList.add("hidden"); }, 2600);
}
function showExplain(title, body) {
  var d = document.getElementById("dlg-explain");
  document.getElementById("dlg-explain-title").textContent = title;
  document.getElementById("dlg-explain-body").textContent = body;
  if (typeof d.showModal === "function") d.showModal();
  else window.alert(title + "\n\n" + body);
}
document.getElementById("dlg-explain-close").addEventListener("click", function () {
  document.getElementById("dlg-explain").close();
});
function copyText(text, doneMsg) {
  function done() { toast(doneMsg); }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, function () { fallback(); });
  } else fallback();
  function fallback() {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); }
    catch (e) { toast("コピーできませんでした"); }
    document.body.removeChild(ta);
  }
}

/* ---------- 画面遷移 ---------- */
var VIEWS = ["view-consent", "view-mode", "view-input", "view-result", "view-aishou"];
function showView(id) {
  VIEWS.forEach(function (v) {
    document.getElementById(v).classList.toggle("hidden", v !== id);
  });
  window.scrollTo(0, 0);
}

/* ---------- 状態（メモリ上のみ） ---------- */
var MODE_ONE = 1, MODE_TWO = 2;
var mode = 0;
var persons = [null, null];
var personCount = 0;
var genderLinkGuard = false;
var gender2Manual = false;

var palms = [newPalm(), newPalm()];
function newPalm() {
  return { hand: Tesou.DEFAULT_HAND, file: null, url: null,
           feat: null, status: "none" }; // none | ok | failed
}

/* ---------- 入力フォーム ---------- */
var forms = [null, null];

function buildPersonForm(idx) {
  var box = el("div", "form-box");
  box.appendChild(el("h3", "section-header", idx === 0 ? "1人目" : "2人目"));
  var f = { box: box };

  // 性別はフォームの一番上（v3.18 と同じ並び。性別が2人目の連動デフォルトの起点）
  f.genderM = radio("gender" + idx, "男性");
  f.genderF = radio("gender" + idx, "女性");
  box.appendChild(labelRow("性別", radioGroup([f.genderM, f.genderF])));
  f.genderM.input.addEventListener("change", function () { onGenderChange(idx); });
  f.genderF.input.addEventListener("change", function () { onGenderChange(idx); });

  f.name = textInput("表示名（任意）");
  box.appendChild(labelRow("名前", f.name));

  f.year = numInput("年（西暦）"); f.month = numInput("月"); f.day = numInput("日");
  var df = el("div", "date-fields");
  df.appendChild(f.year); df.appendChild(f.month); df.appendChild(f.day);
  box.appendChild(labelRow("生年月日", df));

  f.hour = numInput("時"); f.minute = numInput("分");
  var tf = el("div", "time-fields");
  tf.appendChild(f.hour); tf.appendChild(f.minute);
  box.appendChild(labelRow("出生時刻", tf));

  var tuRow = el("div", "check-row");
  f.timeUnknown = document.createElement("input");
  f.timeUnknown.type = "checkbox";
  var tuLabel = el("label", null);
  tuLabel.appendChild(f.timeUnknown);
  tuLabel.appendChild(document.createTextNode("時刻が不明（12:00で仮計算し、時柱・ASCは参考値として表示します）"));
  tuRow.appendChild(tuLabel);
  box.appendChild(tuRow);

  f.pref = document.createElement("select");
  Pref.NAMES.forEach(function (n, i) {
    var o = el("option", null, n); o.value = i; f.pref.appendChild(o);
  });
  f.pref.value = Pref.TOKYO;
  box.appendChild(labelRow("出生地", f.pref));
  note(box, "出生地は西洋占星術（ASC・MC）計算に使います。都道府県庁所在地の座標で代表させています。");

  /* 手相（任意） */
  subhead(box, "手相（任意）", 15);
  note(box, "写真を登録しておくと、「鑑定する」を押したときに自動で読み取って、結果に手相と総合診断（手相×生年月日）が入ります。写真はなくても鑑定できます。");
  note(box, Tesou.HAND_GUIDE);
  f.handR = radio("hand" + idx, "右手の写真");
  f.handL = radio("hand" + idx, "左手の写真");
  box.appendChild(labelRow("見る手", radioGroup([f.handR, f.handL])));
  f.handR.input.addEventListener("change", function () { palms[idx].hand = 0; });
  f.handL.input.addEventListener("change", function () { palms[idx].hand = 1; });

  f.thumb = el("img", "palm-thumb hidden");
  f.thumb.alt = "手相の写真";
  box.appendChild(f.thumb);
  f.palmStatus = note(box, "手相：未登録です。");
  /* 写真の入口は2つ（Android版と同じ）：「カメラで撮る」は capture 付きの
     file input、「写真を選ぶ」は通常の file input を開く。input 自体は隠し、
     どちらで選ばれても onPalmFile の単一経路に合流させる。 */
  f.fileCam = document.createElement("input");
  f.fileCam.type = "file";
  f.fileCam.accept = "image/*";
  f.fileCam.setAttribute("capture", "environment");
  f.fileCam.classList.add("hidden");
  box.appendChild(f.fileCam);
  f.file = document.createElement("input");
  f.file.type = "file";
  f.file.accept = "image/*";
  f.file.classList.add("hidden");
  box.appendChild(f.file);
  var palmBtns = el("div", "btn-row");
  box.appendChild(palmBtns);
  btn(palmBtns, "カメラで撮る", function () { f.fileCam.click(); });
  btn(palmBtns, "写真を選ぶ", function () { f.file.click(); });
  note(box, UP.PHOTO_HINT);
  f.palmDel = btn(box, "手相の写真を消す", function () { clearPalmPhoto(idx); });
  f.palmDel.classList.add("hidden");
  f.fileCam.addEventListener("change", function () { onPalmFile(idx, f.fileCam); });
  f.file.addEventListener("change", function () { onPalmFile(idx, f.file); });

  forms[idx] = f;
  return box;
}
function radio(name, labelText) {
  var wrap = el("label", null);
  var input = document.createElement("input");
  input.type = "radio"; input.name = name;
  wrap.appendChild(input);
  wrap.appendChild(document.createTextNode(labelText));
  return { wrap: wrap, input: input };
}
function radioGroup(items) {
  var g = el("div", "radio-group");
  items.forEach(function (it) { g.appendChild(it.wrap); });
  return g;
}
function textInput(placeholder) {
  var i = document.createElement("input");
  i.type = "text"; i.placeholder = placeholder;
  return i;
}
function numInput(placeholder) {
  var i = document.createElement("input");
  i.type = "number"; i.inputMode = "numeric"; i.placeholder = placeholder;
  return i;
}
function labelRow(label, field) {
  var row = el("div", "label-row");
  row.appendChild(el("span", "flabel", label));
  field.classList.add("ffield");
  row.appendChild(field);
  return row;
}

/* 性別の連動デフォルト（GenderPolicy：1人目=女性、2人目=1人目の逆。
   2人目を手で変えたら連動を止める） */
function setGender(idx, male) {
  genderLinkGuard = true;
  forms[idx].genderM.input.checked = male;
  forms[idx].genderF.input.checked = !male;
  genderLinkGuard = false;
}
function getGenderMale(idx) { return forms[idx].genderM.input.checked; }
function onGenderChange(idx) {
  if (genderLinkGuard) return;
  if (idx === 0) {
    if (!gender2Manual) setGender(1, UE.GenderPolicy.defaultMale(1, getGenderMale(0)));
  } else {
    gender2Manual = true;
  }
}
function resetGenders() {
  gender2Manual = false;
  setGender(0, UE.GenderPolicy.defaultMale(0, false));
  setGender(1, UE.GenderPolicy.defaultMale(1, getGenderMale(0)));
}

function onPalmFile(idx, input) {
  var f = forms[idx];
  var file = input && input.files && input.files[0];
  if (!file) return;
  var pm = palms[idx];
  if (pm.url) URL.revokeObjectURL(pm.url);
  pm.file = file;
  pm.url = URL.createObjectURL(file);
  pm.feat = null; pm.status = "none";
  f.thumb.src = pm.url;
  f.thumb.classList.remove("hidden");
  f.palmDel.classList.remove("hidden");
  f.palmStatus.textContent = "手相：写真は登録済みです。「鑑定する」を押すと自動で読み取ります。";
}
function clearPalmPhoto(idx) {
  var f = forms[idx];
  var pm = palms[idx];
  if (pm.url) URL.revokeObjectURL(pm.url);
  pm.file = null; pm.url = null; pm.feat = null; pm.status = "none";
  f.file.value = "";
  f.fileCam.value = "";
  f.thumb.removeAttribute("src");
  f.thumb.classList.add("hidden");
  f.palmDel.classList.add("hidden");
  f.palmStatus.textContent = "手相：未登録です。";
}
function refreshPalmStatus(idx) {
  var f = forms[idx], pm = palms[idx];
  if (pm.status === "ok") {
    f.palmStatus.textContent = "手相：読み取り済み（" + (pm.hand === 1 ? "左手" : "右手") + "）です。写真を変えたら、次に「鑑定する」を押したときに読み直します。";
  } else if (pm.status === "failed") {
    f.palmStatus.textContent = "手相：前回、この写真からは読み取れませんでした。明るい場所で手のひら全体を撮り直すと読み取りやすくなります（「鑑定する」を押すと読み直します）。";
  } else if (pm.file) {
    f.palmStatus.textContent = "手相：写真は登録済みです。「鑑定する」を押すと自動で読み取ります。";
  } else {
    f.palmStatus.textContent = "手相：未登録です。";
  }
}

/* ---------- 入力の読み取り（readForm 相当） ---------- */
function daysIn(y, m) {
  var dm = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m === 2 && (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) return 29;
  return dm[m - 1];
}
function readForm(idx, required) {
  var f = forms[idx];
  var ys = f.year.value.trim(), ms = f.month.value.trim(), ds = f.day.value.trim();
  if (ys === "" || ms === "" || ds === "") {
    if (required) toast((idx + 1) + "人目の生年月日を入力してください");
    return null;
  }
  var p = {};
  p.by = parseInt(ys, 10); p.bm = parseInt(ms, 10); p.bd = parseInt(ds, 10);
  if (isNaN(p.by) || isNaN(p.bm) || isNaN(p.bd)) { toast("生年月日は数字で入力してください"); return null; }
  if (p.by < 1900 || p.by > 2100 || p.bm < 1 || p.bm > 12 || p.bd < 1 || p.bd > daysIn(p.by, p.bm)) {
    toast((idx + 1) + "人目の生年月日が正しくありません");
    return null;
  }
  p.timeUnknown = f.timeUnknown.checked;
  if (p.timeUnknown) { p.hh = 12; p.mi = 0; }
  else {
    var hs = f.hour.value.trim(), mis = f.minute.value.trim();
    if (hs === "" || mis === "") {
      toast((idx + 1) + "人目の出生時刻を入力するか、「時刻が不明」にチェックしてください");
      return null;
    }
    p.hh = parseInt(hs, 10); p.mi = parseInt(mis, 10);
    if (isNaN(p.hh) || isNaN(p.mi)) { toast("出生時刻は数字で入力してください"); return null; }
    if (p.hh < 0 || p.hh > 23 || p.mi < 0 || p.mi > 59) {
      toast((idx + 1) + "人目の出生時刻が正しくありません");
      return null;
    }
  }
  p.name = f.name.value.trim();
  if (p.name === "") p.name = (idx + 1) + "人目";
  p.male = getGenderMale(idx);
  var sel = parseInt(f.pref.value, 10);
  p.pref = (sel >= 0 && sel < Pref.NAMES.length) ? sel : Pref.TOKYO;
  return p;
}

/* ---------- 手相の自動読み取り（鑑定する時点） ---------- */
function analyzePhoto(file) {
  return new Promise(function (resolve) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      try {
        var w = img.naturalWidth, h = img.naturalHeight;
        var sc = Math.min(1, 320 / Math.max(w, h));
        var sw = Math.max(1, Math.round(w * sc)), sh = Math.max(1, Math.round(h * sc));
        var cv = document.createElement("canvas");
        cv.width = sw; cv.height = sh;
        var ctx = cv.getContext("2d");
        ctx.drawImage(img, 0, 0, sw, sh);
        var data = ctx.getImageData(0, 0, sw, sh);
        var res = UP.analyze(data.data, sw, sh);
        URL.revokeObjectURL(url);
        resolve(res && res.linesFound && res.feat ? res.feat : null);
      } catch (e) { URL.revokeObjectURL(url); resolve(null); }
    };
    img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/* ---------- 鑑定開始 ---------- */
function onStartReading() {
  var p1 = readForm(0, true);
  if (p1 == null) return;
  var p2 = null;
  if (mode === MODE_TWO) {
    p2 = readForm(1, true);
    if (p2 == null) return;
  }
  persons[0] = p1; persons[1] = p2;
  personCount = p2 == null ? 1 : 2;
  var jobs = [];
  for (var i = 0; i < personCount; i++) {
    (function (idx) {
      var pm = palms[idx];
      if (!pm.file) {
        pm.feat = null; pm.status = "none";
        jobs.push(Promise.resolve());
        return;
      }
      jobs.push(analyzePhoto(pm.file).then(function (feat) {
        if (feat) { pm.feat = feat; pm.status = "ok"; }
        else { pm.feat = null; pm.status = "failed"; }
      }));
    })(i);
  }
  Promise.all(jobs).then(function () {
    var palmFail = false;
    for (var i = 0; i < personCount; i++) if (palms[i].status === "failed") palmFail = true;
    if (palmFail) toast("写真から手相を読み取れませんでした（結果画面の手相の欄に案内を表示しています）");
    for (var j = 0; j < 2; j++) refreshPalmStatus(j);
    if (mode === MODE_TWO) { renderAishou(); showView("view-aishou"); }
    else { renderResult(0); showView("view-result"); }
  });
}

function clearAllInputs() {
  persons = [null, null]; personCount = 0;
  for (var i = 0; i < 2; i++) {
    var f = forms[i];
    f.name.value = ""; f.year.value = ""; f.month.value = ""; f.day.value = "";
    f.hour.value = ""; f.minute.value = ""; f.timeUnknown.checked = false;
    f.pref.value = Pref.TOKYO;
    palms[i].hand = Tesou.DEFAULT_HAND;
    forms[i].handL.input.checked = true; forms[i].handR.input.checked = false;
    clearPalmPhoto(i);
  }
  resetGenders();
}

/* ---------- Canvas 描画（WheelView / LuckGraphView / PairGraphView の移植） ---------- */
function setupCanvas(canvas, cssW, cssH) {
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  var ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function drawWheel(canvas, ac) {
  var size = Math.min(340, canvas.parentElement.clientWidth || 340);
  var ctx = setupCanvas(canvas, size, size);
  var cx = size / 2, cy = size / 2;
  var R = Math.min(size, size) / 2 - 6;
  var R2 = R * 0.80;
  var text = cText(), sub = cSub();
  ctx.strokeStyle = sub; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R2, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = text; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
  for (var s = 0; s < 12; s++) {
    var p0 = UE.WheelGeom.point(cx, cy, R2, s * 30, ac.asc);
    var p1 = UE.WheelGeom.point(cx, cy, R, s * 30, ac.asc);
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    var pm = UE.WheelGeom.point(cx, cy, (R + R2) / 2, s * 30 + 15, ac.asc);
    ctx.fillText(UE.WheelGeom.SIGN_SHORT[s], pm[0], pm[1] + 4);
  }
  var pa = UE.WheelGeom.point(cx, cy, R2, ac.asc, ac.asc);
  var pd = UE.WheelGeom.point(cx, cy, R2, ac.asc + 180, ac.asc);
  ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pd[0], pd[1]); ctx.stroke();
  var pmc = UE.WheelGeom.point(cx, cy, R2, ac.mc, ac.asc);
  ctx.strokeStyle = "rgb(30,136,229)";
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(pmc[0], pmc[1]); ctx.stroke();
  ctx.font = "bold 11px sans-serif"; ctx.textAlign = "left";
  ctx.fillStyle = ACCENT;
  ctx.fillText("ASC", pa[0] + 4, pa[1] - 5);
  ctx.fillStyle = "rgb(30,136,229)";
  var mcw = ctx.measureText("MC").width;
  ctx.fillText("MC", pmc[0] >= cx ? pmc[0] + 4 : pmc[0] - 4 - mcw, pmc[1] - 5);
  var order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  order.sort(function (a, b) {
    return UE.WheelGeom.angleDeg(ac.lon[a], ac.asc) - UE.WheelGeom.angleDeg(ac.lon[b], ac.asc);
  });
  var tierR = new Array(10), prevAng = -1e9, tier = 0;
  for (var k = 0; k < 10; k++) {
    var i2 = order[k];
    var ang = UE.WheelGeom.angleDeg(ac.lon[i2], ac.asc);
    if (ang - prevAng < 14.0) tier = (tier + 1) % 3; else tier = 0;
    prevAng = ang;
    tierR[i2] = R2 * (0.82 - 0.20 * tier);
  }
  ctx.fillStyle = text; ctx.font = "10.5px sans-serif"; ctx.textAlign = "center";
  for (var i = 0; i < 10; i++) {
    var pp = UE.WheelGeom.point(cx, cy, tierR[i], ac.lon[i], ac.asc);
    ctx.beginPath(); ctx.arc(pp[0], pp[1], 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillText(Astro.BODY_NAME[i], pp[0], pp[1] - 6);
  }
}

function graphX(age, left, right) { return left + age / UE.LuckCurve.MAX_AGE * (right - left); }
function graphY(level, top, bottom) { return top + (10.0 - level) / 10.0 * (bottom - top); }

function drawLuckGraph(canvas, r, birthYear, nowAge, nowYear) {
  var W = 34 + UE.LuckCurve.MAX_AGE * 11.5 + 10, H = 252;
  var ctx = setupCanvas(canvas, W, H);
  var left = 34, right = W - 10, top = 16, bottom = H - 38;
  var text = cText(), sub = cSub();
  var yearLevels = UE.LuckCurve.yearlyLevels(r, birthYear);
  // 大運の帯
  var dn = r.daiun.length;
  for (var k = 0; k <= dn; k++) {
    var a0 = k === 0 ? 0 : r.daiun[k - 1].startMonths / 12.0;
    var a1 = k < dn ? r.daiun[k].startMonths / 12.0 : UE.LuckCurve.MAX_AGE;
    if (a1 > UE.LuckCurve.MAX_AGE) a1 = UE.LuckCurve.MAX_AGE;
    if (a1 <= a0) continue;
    var x0 = graphX(a0, left, right), x1 = graphX(a1, left, right);
    ctx.fillStyle = text; ctx.globalAlpha = k % 2 === 0 ? 12 / 255 : 28 / 255;
    ctx.fillRect(x0, top, x1 - x0, bottom - top);
    ctx.globalAlpha = 1;
    if (k > 0) {
      ctx.strokeStyle = sub; ctx.globalAlpha = 70 / 255; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, top); ctx.lineTo(x0, bottom); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    var label = k === 0 ? "大運前" : Shichu.kanjiOf(r.daiun[k - 1].pillarIdx);
    if (x1 - x0 > 18) {
      ctx.fillStyle = sub; ctx.font = "10px sans-serif"; ctx.textAlign = "left";
      ctx.fillText(label, x0 + 3, top + 11);
    }
  }
  // 目安線と軸
  ctx.strokeStyle = sub; ctx.lineWidth = 1;
  ctx.globalAlpha = 110 / 255;
  [6.0, 4.5].forEach(function (lv) {
    var y = graphY(lv, top, bottom);
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
  });
  ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke();
  ctx.fillStyle = sub; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
  ctx.fillText("好調", 2, graphY(8.0, top, bottom) + 4);
  ctx.fillText("平穏", 2, graphY(5.2, top, bottom) + 4);
  ctx.fillText("注意", 2, graphY(2.0, top, bottom) + 4);
  // 曲線
  var pts = UE.LuckCurve.curvePoints(yearLevels, 4);
  ctx.strokeStyle = text; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.beginPath();
  for (var i = 0; i < pts.length; i++) {
    var x = graphX(pts[i][0], left, right), y = graphY(pts[i][1], top, bottom);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // 年ごとのドット
  ctx.fillStyle = text; ctx.globalAlpha = 150 / 255;
  for (var a = 0; a < yearLevels.length; a++) {
    ctx.beginPath();
    ctx.arc(graphX(a, left, right), graphY(yearLevels[a], top, bottom), 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 現在マーカー
  var na = Math.max(0, Math.min(UE.LuckCurve.MAX_AGE, nowAge));
  var nai = Math.round(na);
  if (nai > yearLevels.length - 1) nai = yearLevels.length - 1;
  var nx = graphX(na, left, right), ny = graphY(yearLevels[nai], top, bottom);
  ctx.strokeStyle = ACCENT; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(nx, top); ctx.lineTo(nx, bottom); ctx.stroke();
  ctx.fillStyle = ACCENT;
  ctx.beginPath(); ctx.arc(nx, ny, 4, 0, Math.PI * 2); ctx.fill();
  ctx.font = "11px sans-serif";
  var capText = "現在（" + Math.trunc(nowAge) + "歳・" + nowYear + "年）";
  var capW = ctx.measureText(capText).width;
  var tx = nx + 5;
  if (tx + capW > right) tx = nx - 5 - capW;
  ctx.fillText(capText, tx, top + 24);
  // 横軸ラベル
  ctx.fillStyle = sub; ctx.font = "9px sans-serif";
  for (var age = 0; age <= UE.LuckCurve.MAX_AGE; age += 10) {
    var gx = graphX(age, left, right);
    var s = age + "歳";
    var sw = ctx.measureText(s).width;
    var sx = gx - sw / 2; if (sx + sw > W) sx = W - sw;
    ctx.fillText(s, sx, bottom + 15);
    var ys = (birthYear + age) + "年";
    var yw = ctx.measureText(ys).width;
    var yx = gx - yw / 2; if (yx + yw > W) yx = W - yw;
    ctx.fillText(ys, yx, bottom + 29);
  }
  return { x: nx };
}

function drawPairGraph(canvas, lvA, colorA, nameA, ageA, lvB, colorB, nameB, ageB) {
  var W = 34 + UE.LuckCurve.MAX_AGE * 11.5 + 10, H = 266;
  var ctx = setupCanvas(canvas, W, H);
  var left = 34, right = W - 10, top = 16, bottom = H - 52;
  var lvAvg = UE.PairGraph.averageLevels(lvA, lvB);
  ctx.fillStyle = "rgb(33,37,43)";
  ctx.fillRect(0, 0, W, H);
  var grid = "rgb(158,158,158)";
  ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.globalAlpha = 110 / 255;
  [6.0, 4.5].forEach(function (lv) {
    var y = graphY(lv, top, bottom);
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
  });
  ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke();
  ctx.fillStyle = grid; ctx.font = "10px sans-serif"; ctx.textAlign = "left";
  ctx.fillText("好調", 2, graphY(8.0, top, bottom) + 4);
  ctx.fillText("平穏", 2, graphY(5.2, top, bottom) + 4);
  ctx.fillText("注意", 2, graphY(2.0, top, bottom) + 4);
  function curve(levels, color, width) {
    var pts = UE.LuckCurve.curvePoints(levels, 4);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var x = graphX(pts[i][0], left, right), y = graphY(pts[i][1], top, bottom);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  curve(lvA, colorA, 2);
  curve(lvB, colorB, 2);
  curve(lvAvg, argbToCss(UE.PairGraph.COLOR_PAIR), 2.4);
  [[ageA, lvA, colorA], [ageB, lvB, colorB]].forEach(function (t) {
    var a = Math.max(0, Math.min(UE.LuckCurve.MAX_AGE, t[0]));
    var ai = Math.round(a);
    if (ai > t[1].length - 1) ai = t[1].length - 1;
    var dx = graphX(a, left, right), dy = graphY(t[1][ai], top, bottom);
    ctx.fillStyle = t[2];
    ctx.beginPath(); ctx.arc(dx, dy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(dx, dy, 4, 0, Math.PI * 2); ctx.stroke();
  });
  ctx.fillStyle = grid; ctx.font = "9px sans-serif";
  for (var age = 0; age <= UE.LuckCurve.MAX_AGE; age += 10) {
    var gx = graphX(age, left, right);
    var s = age + "歳";
    var sw = ctx.measureText(s).width;
    var sx = gx - sw / 2; if (sx + sw > W) sx = W - sw;
    ctx.fillText(s, sx, bottom + 15);
  }
  var ly = H - 14, lx = left;
  ctx.font = "10.5px sans-serif";
  var labels = [nameA + " さん", nameB + " さん", "2人の相性（平均）"];
  var lcols = [colorA, colorB, argbToCss(UE.PairGraph.COLOR_PAIR)];
  for (var k = 0; k < 3; k++) {
    ctx.strokeStyle = lcols[k]; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(lx, ly - 3.5); ctx.lineTo(lx + 16, ly - 3.5); ctx.stroke();
    lx += 20;
    ctx.fillStyle = "rgb(238,238,238)";
    ctx.fillText(labels[k], lx, ly);
    lx += ctx.measureText(labels[k]).width + 14;
  }
  return { midX: graphX((ageA + ageB) / 2, left, right) };
}

function scrollGraphTo(scrollDiv, x) {
  requestAnimationFrame(function () {
    var target = x - scrollDiv.clientWidth / 2;
    var max = scrollDiv.scrollWidth - scrollDiv.clientWidth;
    if (max < 0) max = 0;
    if (target < 0) target = 0;
    if (target > max) target = max;
    scrollDiv.scrollLeft = target;
  });
}

/* ---------- 部品：チップ＋レベルバー、大運・年運行、命式カード ---------- */
function levelBlock(parent, level, label, marker) {
  var box = el("div", "fr-right");
  var chipLine = el("div", "chip-line");
  if (marker) chipLine.appendChild(el("span", "chip accent", marker));
  chipLine.appendChild(el("span", "chip " + chipClass(label), label));
  box.appendChild(chipLine);
  var line = el("div", "level-line");
  line.appendChild(barEl(level / 10, chipBg(label)));
  line.appendChild(el("span", "lv-num", " " + fmt1(level)));
  box.appendChild(line);
  parent.appendChild(box);
}
function daiunRow(parent, du, cur) {
  var row = el("div", "fortune-row" + (cur ? " current" : ""));
  var left = el("div", "fr-left");
  var age = el("div", "fr-age", "約" + Math.trunc(du.startMonths / 12) + "歳〜" + Math.trunc((du.startMonths + 120) / 12) + "歳");
  if (cur) age.classList.add("bold");
  left.appendChild(age);
  left.appendChild(el("div", "fr-year", du.startYear + "年ごろ〜"));
  row.appendChild(left);
  var mid = el("div", "fr-mid");
  mid.appendChild(el("div", "fr-kanji", Shichu.kanjiOf(du.pillarIdx)));
  mid.appendChild(el("div", "fr-note", Shichu.TSUHEN[du.tsuhen] + "・" + Shichu.JUNIUN[du.juniun]));
  row.appendChild(mid);
  levelBlock(row, du.level, Shichu.levelLabel(du.level), cur ? "今ここ" : null);
  parent.appendChild(row);
}
function nenunRow(parent, n, cur) {
  var row = el("div", "fortune-row" + (cur ? " current" : ""));
  var left = el("div", "fr-left");
  left.style.flexBasis = "112px";
  var line = el("span", null);
  var y = el("span", null, n.year + "年");
  if (cur) y.classList.add("bold");
  line.appendChild(y);
  var kj = el("span", "fr-kanji-17", " " + Shichu.kanjiOf(n.pillarIdx));
  line.appendChild(kj);
  left.appendChild(line);
  row.appendChild(left);
  var mid = el("div", "fr-mid");
  mid.appendChild(el("div", "fr-note", Shichu.TSUHEN[n.tsuhen] + "・" + Shichu.JUNIUN[n.juniun]));
  row.appendChild(mid);
  levelBlock(row, n.level, Shichu.levelLabel(n.level), cur ? "今年" : null);
  parent.appendChild(row);
}
function gogyoChart(parent, r) {
  for (var g = 0; g < 5; g++) {
    var row = el("div", "gogyo-row");
    row.appendChild(el("span", "g-label", Shichu.GOGYO_NAME[g]));
    row.appendChild(barEl(r.gogyoCount[g] / 8, GOGYO_COLORS[g], "h14"));
    row.appendChild(el("span", "g-count", String(r.gogyoCount[g])));
    parent.appendChild(row);
  }
}
function gogyoCompareChart(parent, ra, nameA, colorA, rb, nameB, colorB) {
  var rs = [ra, rb], names = [nameA, nameB], colors = [colorA, colorB];
  for (var g = 0; g < 5; g++) {
    tv(parent, Shichu.GOGYO_NAME[g], "text bold");
    for (var k = 0; k < 2; k++) {
      var row = el("div", "gogyo-row gogyo-cmp");
      row.style.paddingLeft = "10px";
      row.appendChild(el("span", "gogyo-cmp-name", names[k] + " さん"));
      row.appendChild(barEl(rs[k].gogyoCount[g] / 8, colors[k], "h11"));
      row.appendChild(el("span", "g-count", String(rs[k].gogyoCount[g])));
      parent.appendChild(row);
    }
  }
}

/* ---------- 全文コピー（MainActivity.buildFullText 相当） ---------- */
function palmStatusOf(idx) {
  return palms[idx].status === "ok" ? UR.PALM_OK
       : palms[idx].status === "failed" ? UR.PALM_FAILED : UR.PALM_NONE;
}
function buildAishouText(ry, rm, rd) {
  var p0 = persons[0], p1 = persons[1];
  var bothPalm = palms[0].status === "ok" && palms[1].status === "ok";
  return UR.buildAishou(
    p0.name, p0.by, p0.bm, p0.bd, p0.hh, p0.mi, p0.male, p0.pref,
    p1.name, p1.by, p1.bm, p1.bd, p1.hh, p1.mi, p1.male, p1.pref,
    ry, rm, rd, bothPalm ? palms[0].feat : null, bothPalm ? palms[1].feat : null);
}
function buildFullText(idx, ry, rm, rd) {
  var p = persons[idx];
  var text = UR.buildPersonal(p.name, p.by, p.bm, p.bd, p.hh, p.mi,
    p.timeUnknown, p.male, p.pref, ry, rm, rd,
    palms[idx].status === "ok" ? palms[idx].feat : null,
    palms[idx].hand, palmStatusOf(idx));
  if (personCount === 2) text += buildAishouText(ry, rm, rd);
  text += UR.CLOSING_NOTE;
  return text;
}

/* ---------- 個人結果画面（showResult の移植） ---------- */
function isSummerTimeEra(p) {
  return p.by >= 1948 && p.by <= 1951 && p.bm >= 4 && p.bm <= 9;
}
function appendTesouReading(parent, idx) {
  var pm = palms[idx], feat = pm.feat;
  note(parent, UP.AUTO_NOTE);
  for (var li = 0; li < 4; li++) {
    header(parent, Tesou.LINE_NAME[li]);
    Tesou.LINE_FEATURES[li].forEach(function (fid) {
      var lv = feat[fid];
      if (lv < 0) return;
      tv(parent, Tesou.FEATURE_NAME[fid] + "：" + Tesou.FEATURE_LABEL[fid][lv], "text-15 bold");
      tv(parent, Tesou.FEATURE_TEXT[fid][lv]);
    });
  }
  header(parent, "総合");
  tv(parent, Tesou.summaryText(feat[Tesou.F_SEIMEI_ARC], feat[Tesou.F_CHINO_SLOPE],
    feat[Tesou.F_KANJO_REACH], feat[Tesou.F_UNMEI_DARK]));
  header(parent, Tesou.ADVICE_HEADING);
  tv(parent, Tesou.adviceText(feat[Tesou.F_SEIMEI_ARC], feat[Tesou.F_CHINO_SLOPE],
    feat[Tesou.F_KANJO_REACH], feat[Tesou.F_UNMEI_DARK]));
  var noteBox = collapsible(parent, "手相について");
  note(noteBox, "手相の読み解きは、伝統的な手相の一般的な見方をもとに本アプリが自作した娯楽・参考情報です。" +
    "特徴は、写真からの自動読み取りで推定した内容にもとづきます（推定なので、実際の手相と違う場合があります）。" +
    "写真はこのブラウザの中だけで処理され、外部に送信されることはありません。");
}

function renderResult(idx) {
  var root = document.getElementById("result-body");
  root.innerHTML = "";
  var p = persons[idx];
  var now = new Date();
  var ry = now.getFullYear(), rm = now.getMonth() + 1, rd = now.getDate();
  var r = Shichu.compute(p.by, p.bm, p.bd, p.hh, p.mi, p.male, ry, rm, rd);
  var ac = Astro.compute(p.by, p.bm, p.bd, p.hh, p.mi, Pref.LAT[p.pref], Pref.LON[p.pref]);
  var colNames = ["年柱", "月柱", "日柱", "時柱"];
  var pillars = [r.yearIdx, r.monthIdx, r.dayIdx, r.hourIdx];
  var sunSign = Astro.signOf(ac.lon[Astro.SUN]);
  var moonSign = Astro.signOf(ac.lon[Astro.MOON]);
  var ascSign = Astro.signOf(ac.asc);
  var ageMonths = (ry - p.by) * 12 + (rm - p.bm) - (rd < p.bd ? 1 : 0);
  var curDaiun = UK.currentDaiun(r, ageMonths);

  /* ① 基本情報 */
  root.appendChild(el("h2", "page-title", p.name + " さんの鑑定"));
  tv(root, "鑑定日：" + ry + "年" + rm + "月" + rd + "日／満年齢：" + r.age + "歳");
  tv(root, "生年月日：" + p.by + "年" + p.bm + "月" + p.bd + "日 " +
    (p.timeUnknown ? "12:00（時刻不明のため仮計算）" : p.hh + "時" + fmt02(p.mi) + "分") +
    "、性別：" + (p.male ? "男性" : "女性") + "、出生地：" + Pref.NAMES[p.pref]);
  if (personCount === 2) {
    if (mode === MODE_TWO) {
      btn(root, "💞 2人の相性を見る", function () { renderAishou(); showView("view-aishou"); }, "btn-accent");
    }
    btn(root, (idx === 0 ? "2人目" : "1人目") + "の鑑定を見る", function () {
      renderResult(1 - idx); showView("view-result");
    });
    if (mode !== MODE_TWO) {
      btn(root, "2人の相性を見る", function () { renderAishou(); showView("view-aishou"); });
    }
  }

  /* ② 総評 */
  header(root, "総評");
  tv(root, UK.summaryShort(r, sunSign), "text-15");

  /* ③ 四柱推命 */
  header(root, "四柱推命");
  var meishiki = el("div", "meishiki");
  for (var i = 0; i < 4; i++) {
    var card = el("div", "pillar-card" + (i === 2 ? " day" : ""));
    card.appendChild(el("div", "pc-name", colNames[i]));
    card.appendChild(el("div", "pc-kanji", Shichu.kanjiOf(pillars[i])));
    if (i === 2) card.appendChild(el("div", "pc-daymark", "日干"));
    card.appendChild(el("div", "pc-sub", i === 2 ? "日主" : Shichu.TSUHEN[r.tsuhen[i]]));
    card.appendChild(el("div", "pc-sub", Shichu.JUNIUN[r.juniun[i]]));
    meishiki.appendChild(card);
  }
  root.appendChild(meishiki);
  if (p.timeUnknown) note(root, "※生まれた時刻が不明のため、時柱は正午（12:00）で計算した参考値です。");
  tv(root, "日干（日主）：" + Shichu.KAN[r.dayStem] + "　（生まれた日の干で、あなた自身の本質を表します）", "text-15 bold");
  subhead(root, "通変星の短い読み解き", 15);
  var shownP = {};
  for (var i1 = 0; i1 < 4; i1++) {
    if (i1 === 2) continue;
    var t = r.tsuhen[i1];
    if (shownP[t]) continue;
    shownP[t] = true;
    var where = [];
    for (var j = 0; j < 4; j++) if (j !== 2 && r.tsuhen[j] === t) where.push(colNames[j]);
    tv(root, "（" + where.join("・") + "）" + Shichu.TSUHEN[t] + "：" + UK.TSUHEN_PHRASE[t]);
  }
  subhead(root, "あなたの本質（日干）");
  tv(root, "日干「" + Shichu.KAN[r.dayStem] + "」は、" + UK.STEM_CATCH[r.dayStem] + "にたとえられます。", "text-15 bold");
  tv(root, UK.STEM_TEXT[r.dayStem]);
  tv(root, UK.STEM_EXTRA[r.dayStem]);
  subhead(root, "五行バランス");
  var gb = [];
  for (var g = 0; g < 5; g++) gb.push(Shichu.GOGYO_NAME[g] + r.gogyoCount[g]);
  tv(root, "命式8文字の五行の数：" + gb.join("・"), "text-15");
  gogyoChart(root, r);
  tv(root, UK.gogyoReading(r));
  var gogyoBox = collapsible(root, "五行とは");
  note(gogyoBox, "五行：木・火・土・金・水の5つの気のバランスで、その人の傾向を読む見方です。" +
    "多い気は「得意な方向」、少ない気は「ちょっと苦手な方向」として読むのが、このアプリでのざっくりした読み方です。");
  var pillarBox = collapsible(root, "各柱の読み解きと柱の意味（四柱推命）");
  var juniunShown = {};
  for (var i2 = 0; i2 < 4; i2++) {
    tv(pillarBox, colNames[i2] + "：" + Shichu.kanjiOf(pillars[i2]), "text-15 bold");
    tv(pillarBox, "読み解き：" + UK.pillarReading(r, i2));
    subhead(pillarBox, colNames[i2] + "の意味", 15);
    note(pillarBox, UK.PILLAR_MEANING[i2]);
    if (!juniunShown[r.juniun[i2]]) {
      juniunShown[r.juniun[i2]] = true;
      subhead(pillarBox, "十二運星「" + Shichu.JUNIUN[r.juniun[i2]] + "」の意味", 15);
      note(pillarBox, UK.JUNIUN_TEXT[r.juniun[i2]]);
    }
  }
  var tsuhenBox = collapsible(root, "通変星の意味（四柱推命）");
  var shownT = {};
  for (var i3 = 0; i3 < 4; i3++) {
    if (i3 === 2) continue;
    var t3 = r.tsuhen[i3];
    if (shownT[t3]) continue;
    shownT[t3] = true;
    var where3 = [];
    for (var j3 = 0; j3 < 4; j3++) if (j3 !== 2 && r.tsuhen[j3] === t3) where3.push(colNames[j3]);
    tv(tsuhenBox, Shichu.TSUHEN[t3] + "（" + where3.join("・") + "）", "text-15 bold");
    tv(tsuhenBox, UK.TSUHEN_TEXT[t3]);
  }

  /* ④ 手相 */
  header(root, "手相");
  if (palms[idx].status === "ok") {
    var tesouBox = collapsible(root, "手相の読み解き（" + (palms[idx].hand === 1 ? "左手" : "右手") + "）");
    appendTesouReading(tesouBox, idx);
  } else if (palms[idx].status === "failed") {
    tv(root, UR.TESOU_FAIL_TEXT);
  } else {
    tv(root, UR.TESOU_NONE_TEXT);
  }

  /* ⑤ 総合診断（手相×生年月日） */
  var sgRes = palms[idx].status === "ok" ? Sougou.compute(r, sunSign, moonSign, palms[idx].feat) : null;
  if (sgRes != null) {
    header(root, "総合診断（手相×生年月日）");
    for (var ax = 0; ax < Sougou.AXIS_COUNT; ax++) {
      var a = sgRes.axes[ax];
      tv(root, Sougou.AXIS_NAME[ax] + "：" + Sougou.REL_NAME[a.relation], "text-15 bold");
      tv(root, "手相では（" + a.palmBasis + "）", "text bold");
      tv(root, a.palmText);
      tv(root, "生年月日では（" + a.birthBasis + "）", "text bold");
      tv(root, a.birthText);
      tv(root, "組み合わせ：" + a.comboText);
    }
    subhead(root, "まとめのアドバイス", 15);
    tv(root, sgRes.advice);
  }

  /* ⑥ 西洋占星術 */
  header(root, "西洋占星術");
  tv(root, "太陽星座：" + Astro.formatLon(ac.lon[Astro.SUN]), "subhead");
  tv(root, Seiyo.SUN_TEXT[sunSign]);
  subhead(root, "日干×太陽星座の組み合わせ", 15);
  tv(root, UK.stemSunCombo(r.dayStem, sunSign));
  subhead(root, "ホロスコープ図", 15);
  var wheelWrap = el("div", "wheel-wrap");
  var wheelCanvas = document.createElement("canvas");
  wheelWrap.appendChild(wheelCanvas);
  root.appendChild(wheelWrap);
  note(root, "円の左端がASC（上昇点）で、外側の輪が12星座、その内側に10天体の位置を示しています。赤い横軸がASC、青い軸がMCです。" +
    (p.timeUnknown ? "出生時刻が不明なため12:00で仮計算しており、ASC・MCの位置は参考値です。" : ""));
  var moonAscBox = collapsible(root, "月星座・ASCの解釈（西洋占星術）");
  tv(moonAscBox, "月星座：" + Astro.formatLon(ac.lon[Astro.MOON]), "subhead");
  tv(moonAscBox, Seiyo.MOON_TEXT[moonSign]);
  tv(moonAscBox, "ASC（上昇星座）：" + Astro.formatLon(ac.asc) +
    (p.timeUnknown ? "（参考値）" : "") + "　MC：" + Astro.SIGNS[Astro.signOf(ac.mc)], "subhead");
  tv(moonAscBox, Seiyo.ASC_TEXT[ascSign]);
  var bodyBox = collapsible(root, "天体の配置（西洋占星術）");
  for (var bi = 0; bi < 10; bi++) {
    var sg = Astro.signOf(ac.lon[bi]);
    tv(bodyBox, Astro.BODY_NAME[bi] + "：" + Astro.formatLon(ac.lon[bi]), "text bold");
    tv(bodyBox, Seiyo.bodySignText(bi, sg));
  }
  var houseBox = collapsible(root, "ハウス（西洋占星術）");
  tv(houseBox, Seiyo.HOUSE_INTRO);
  for (var k = 0; k < 12; k++) {
    var line = "第" + (k + 1) + "ハウス（" + Seiyo.HOUSE_THEME[k] + "）：" + Astro.formatLon(ac.cusps[k]);
    if (k === 0) line += "（ASC）";
    if (p.timeUnknown) line += "（参考値）";
    tv(houseBox, line);
  }
  note(houseBox, "イコールハウス方式です：ASCを第1ハウスの始まりとして、30°ずつ区切っています。" +
    "出生地は都道府県庁所在地の座標で代表させているため、ASCやハウスには数度程度の誤差がありえます。");
  var notesBox = collapsible(root, "注記・用語の説明");
  note(notesBox, "この鑑定の解釈文は、伝統的な占術の一般的な見方をもとに本アプリが自作した娯楽・参考情報です。" +
    "注記や用語の説明などの小さい文字は、このような折りたたみの中に入れてあります。気になるところだけ開いて読んでください。");
  note(notesBox, "※解釈は娯楽・参考情報です。将来を断定するものではありません。");
  subhead(notesBox, "用語メモ", 15);
  note(notesBox, "日干：生まれた日の干で、自分自身を表します。" +
    "通変星：日干から見た、ほかの干との関係を表す星です。" +
    "十二運星：日干のエネルギーの強さを12段階の状態で表したものです。" +
    (p.timeUnknown ? "出生時刻が不明なため、時柱は12:00で仮計算した参考値です。" : ""));
  subhead(notesBox, "ASC・MCと計算について", 15);
  note(notesBox, "ASC（アセンダント）：生まれた瞬間に東の地平線にあった星座の位置です。外見や第一印象に関わるとされます。");
  note(notesBox, "MC：生まれた瞬間に南中していた点で、社会的な顔や目標の方向に関わるとされます。");
  note(notesBox, "天体の位置は天文計算の略算式で求めています。ハウスはイコールハウス方式です。" +
    (p.timeUnknown ? "出生時刻が不明なため12:00で仮計算しており、ASC・MC・ハウスは参考値です。" : ""));
  if (isSummerTimeEra(p)) {
    note(notesBox, "注意：1948〜1951年の夏時間実施期の生年月日です。西洋占星術では、当時の出生記録の時刻は夏時間で書かれている前提で、夏時間（UTC+10）として計算しています。");
  }

  /* ⑦ 星めぐり占い */
  header(root, "星めぐり占い");
  tv(root, "あなたのタイプ：" + Hoshi.typeName(r) + "　星数：" + r.hoshiNumber, "subhead");
  tv(root, "持ち味：" + Hoshi.GROUP_CATCH[r.hoshiGroup], "text-15 bold");
  tv(root, Hoshi.reading(r));
  var hoshiBox = collapsible(root, "星めぐり占いとは");
  note(hoshiBox, Hoshi.INTRO +
    "星数は生まれた日の干支（日柱「" + Shichu.kanjiOf(r.dayIdx) + "」）から決まります。" +
    "解釈文は伝統的な見方をもとに本アプリが自作した娯楽・参考情報です。");

  /* ⑧ 大運・年運 */
  header(root, "大運・年運");
  subhead(root, "大運（約10年ごとの運気の流れ）", 15);
  tv(root, "方向：" + (r.daiunForward ? "順行" : "逆行") + "　起運：約" +
    Math.trunc(r.daiunStartMonths / 12) + "歳" + (r.daiunStartMonths % 12) + "か月");
  r.daiun.forEach(function (du) {
    daiunRow(root, du, curDaiun != null && du === curDaiun);
  });
  subhead(root, "年運（1年ごとの流れ）", 15);
  r.nenun.forEach(function (n) { nenunRow(root, n, n.year === ry); });
  subhead(root, "大運の流れの要約", 15);
  tv(root, UK.daiunSummary(r));
  note(root, "大運は約10年ごとに切り替わる運気の大きな周期、年運は1年ごとの流れです。" +
    "「傾向」は通変星・十二運星から本アプリの対応表で換算した目安で、吉凶の断定ではありません。");
  subhead(root, "運気グラフ", 15);
  var graphScroll = el("div", "graph-scroll");
  var graphCanvas = document.createElement("canvas");
  graphScroll.appendChild(graphCanvas);
  root.appendChild(graphScroll);
  var marker = drawLuckGraph(graphCanvas, r, p.by, r.age, ry);
  scrollGraphTo(graphScroll, marker.x);
  tv(root, "年ごとの運気（年運）の流れを、滑らかな曲線にしたものです。背景の帯は大運（約10年ごとの大きな周期）の区切りで、上に干支を薄く表示しています。" +
    "赤い線が現在の位置です。横にスクロールすると、0歳から90歳までの流れが見られます。" +
    "線が上のほうにある時期は追い風、下のほうはペース配分が大事な時期、くらいの軽い気持ちで眺めてみてください。");

  /* ⑨ 今年の運勢 */
  header(root, "今年の運勢");
  var curNenun = null;
  r.nenun.forEach(function (n) { if (n.year === ry) curNenun = n; });
  if (curNenun != null) {
    tv(root, curNenun.year + "年 " + Shichu.kanjiOf(curNenun.pillarIdx) +
      "　通変星：" + Shichu.TSUHEN[curNenun.tsuhen] + "　十二運星：" + Shichu.JUNIUN[curNenun.juniun] +
      "　レベル：" + fmt1(curNenun.level) + "　傾向：" + Shichu.levelLabel(curNenun.level), "text-15");
    tv(root, "読み解き：" + UK.TSUHEN_PERIOD[curNenun.tsuhen]);
    tv(root, UK.junYearLine(curNenun.juniun));
    var yf = UK.yearFields(curNenun);
    subhead(root, "分野別のひとこと", 15);
    tv(root, "仕事：" + yf[0]);
    tv(root, "お金：" + yf[1]);
    tv(root, "対人・恋愛：" + yf[2]);
    tv(root, "生活リズム：" + yf[3]);
  }

  /* ⑩ 今の大運 */
  header(root, "今の大運");
  if (curDaiun != null) {
    var remainYears = Math.max(0, Math.round((curDaiun.startMonths + 120 - ageMonths) / 12));
    tv(root, Shichu.kanjiOf(curDaiun.pillarIdx) +
      "（約" + Math.trunc(curDaiun.startMonths / 12) + "歳〜約" + Math.trunc((curDaiun.startMonths + 120) / 12) + "歳、" +
      curDaiun.startYear + "年ごろ〜" + (curDaiun.startYear + 10) + "年ごろ）通変星：" +
      Shichu.TSUHEN[curDaiun.tsuhen] + "　十二運星：" + Shichu.JUNIUN[curDaiun.juniun] +
      "　傾向：" + Shichu.levelLabel(curDaiun.level), "text-15");
    tv(root, "今はこの大運の途中で、残りは約" + remainYears + "年です。");
    tv(root, "読み解き：" + UK.daiunReading(curDaiun));
    tv(root, UK.DAIUN_HINT[UK.labelIndex(curDaiun.level)]);
  } else {
    var firstDu = r.daiun[0];
    tv(root, "大運はまだ始まっていません。最初の大運は " + Shichu.kanjiOf(firstDu.pillarIdx) +
      "（約" + Math.trunc(firstDu.startMonths / 12) + "歳〜、" + firstDu.startYear + "年ごろ〜）です。", "text-15");
    tv(root, UK.DAIUN_PRE_HINT);
  }

  /* ⑪ これからの見通しとアドバイス */
  header(root, "これからの見通しとアドバイス");
  var five = UK.fiveYears(r, ry);
  subhead(root, "今後予想されること", 15);
  tv(root, UK.outlookForecast(r, curDaiun, five));
  subhead(root, "それへのアドバイス", 15);
  tv(root, UK.outlookAdvice(r, curDaiun, five));

  /* ⑫ スコア */
  header(root, "スコア（分野別）");
  scoreRow(root, "仕事運", r.scoreWork);
  scoreRow(root, "金運", r.scoreMoney);
  scoreRow(root, "恋愛・対人運", r.scoreLove);
  scoreRow(root, "健康運（五行バランス）", r.scoreHealth);
  scoreRow(root, "総合運", r.scoreTotal);
  var scoreBox = collapsible(root, "スコアについて");
  note(scoreBox, "スコアは本アプリ独自の指標であり、占いの正しさを保証するものではありません。" +
    "健康運は五行の偏りの小ささを指数化したもので、健康状態の判定・予測ではありません。");
  btn(root, "スコアの算出方法", function () { showExplain("スコアの算出方法", SCORE_EXPLAIN); });

  /* ⑬ まとめ */
  header(root, Matome.HEADING);
  var mtRes = Matome.compute(r, sunSign, moonSign, curDaiun, five,
    palms[idx].status === "ok" ? palms[idx].feat : null);
  subhead(root, "① 特性", 15); tv(root, mtRes.tokusei);
  subhead(root, "② 強み", 15); tv(root, mtRes.tsuyomi);
  subhead(root, "③ 弱み（補うヒント）", 15); tv(root, mtRes.yowami);
  subhead(root, "④ 今後のアドバイス", 15); tv(root, mtRes.advice);
  if (!mtRes.hasPalm) note(root, "手相は未実施のため、四柱推命と西洋占星術だけでまとめています。");

  /* 操作ボタン */
  btn(root, "全文をコピー", function () {
    copyText(buildFullText(idx, ry, rm, rd), "全文をコピーしました");
  });
  btn(root, "入力に戻る", function () { showView("view-input"); });
  btn(root, "別の人を占う（入力をクリア）", function () {
    if (window.confirm("入力内容と表示中の結果をクリアして、別の人を占います。よろしいですか？\n（手相の写真と特徴も削除されます）")) {
      clearAllInputs(); showView("view-input");
    }
  });
  btn(root, "モードを選び直す（最初から）", function () {
    if (window.confirm("入力内容と表示中の結果をクリアして、最初から選び直します。よろしいですか？")) {
      clearAllInputs(); showView("view-mode");
    }
  });

  drawWheel(wheelCanvas, ac);
}

/* ---------- 相性画面（showAishou の移植） ---------- */
function renderAishou() {
  var root = document.getElementById("aishou-body");
  root.innerHTML = "";
  var p0 = persons[0], p1 = persons[1];
  var now = new Date();
  var ry = now.getFullYear(), rm = now.getMonth() + 1, rd = now.getDate();
  var r0 = Shichu.compute(p0.by, p0.bm, p0.bd, p0.hh, p0.mi, p0.male, ry, rm, rd);
  var r1 = Shichu.compute(p1.by, p1.bm, p1.bd, p1.hh, p1.mi, p1.male, ry, rm, rd);
  var c0 = Astro.compute(p0.by, p0.bm, p0.bd, p0.hh, p0.mi, Pref.LAT[p0.pref], Pref.LON[p0.pref]);
  var c1 = Astro.compute(p1.by, p1.bm, p1.bd, p1.hh, p1.mi, Pref.LAT[p1.pref], Pref.LON[p1.pref]);
  var sun0 = Astro.signOf(c0.lon[Astro.SUN]), moon0 = Astro.signOf(c0.lon[Astro.MOON]);
  var sun1 = Astro.signOf(c1.lon[Astro.SUN]), moon1 = Astro.signOf(c1.lon[Astro.MOON]);
  var ar = Aishou.compute(r0, sun0, moon0, r1, sun1, moon1);

  root.appendChild(el("h2", "page-title", "2人の相性"));
  tv(root, p0.name + " さん × " + p1.name + " さん", "aishou-head-names");
  header(root, "総合スコア");
  tv(root, fmt1(ar.total) + " / 10.0", "total-score");
  root.appendChild(barEl(ar.total / 10, chipBg(Shichu.levelLabel(ar.total)), "h14"));
  header(root, "分野別スコア");
  scoreRow(root, "性格の合いやすさ", ar.seikaku);
  scoreRow(root, "気持ちの通じやすさ", ar.kimochi);
  scoreRow(root, "協力しやすさ", ar.kyoryoku);
  header(root, "総評");
  tv(root, Aishou.summaryText(ar));
  header(root, "要素ごとの読み解き");
  tv(root, "日干の関係：" + Aishou.REL_NAME[ar.relation] +
    "（" + Shichu.KAN[r0.dayStem] + " × " + Shichu.KAN[r1.dayStem] + "）　" + fmt1(Aishou.round1(ar.comp[0])), "text-15 bold");
  tv(root, Aishou.RELATION_TEXT[ar.relation]);
  tv(root, "五行の補完　" + fmt1(Aishou.round1(ar.comp[1])), "text-15 bold");
  tv(root, Aishou.GOGYO_TEXT[Aishou.bandOf(ar.comp[1])]);
  tv(root, "太陽星座：" + Astro.SIGNS[sun0] + " × " + Astro.SIGNS[sun1] + "　" + fmt1(Aishou.round1(ar.comp[2])), "text-15 bold");
  tv(root, Aishou.ELEMENT_TEXT[ar.sunCat]);
  tv(root, "月星座：" + Astro.SIGNS[moon0] + " × " + Astro.SIGNS[moon1] + "　" + fmt1(Aishou.round1(ar.comp[3])), "text-15 bold");
  tv(root, Aishou.ELEMENT_TEXT[ar.moonCat]);
  tv(root, "星めぐりタイプ：" + Shichu.HOSHI_GROUP_NAME[r0.hoshiGroup] + "タイプ × " +
    Shichu.HOSHI_GROUP_NAME[r1.hoshiGroup] + "タイプ　" + fmt1(Aishou.round1(ar.comp[4])), "text-15 bold");
  tv(root, Aishou.HOSHI_TEXT[Aishou.bandOf(ar.comp[4])]);

  header(root, "五行バランスの比較");
  gogyoCompareChart(root, r0, p0.name, argbToCss(UE.PairGraph.colorOf(p0.male)),
    r1, p1.name, argbToCss(UE.PairGraph.colorOf(p1.male)));
  note(root, "命式8文字に含まれる五行の数を、2人並べて比べたものです。片方に少なくてもう片方に多い気は、補い合える部分です。");

  header(root, "2人の運気推移グラフ");
  var pgScroll = el("div", "graph-scroll");
  var pgCanvas = document.createElement("canvas");
  pgScroll.appendChild(pgCanvas);
  root.appendChild(pgScroll);
  var lv0 = UE.LuckCurve.yearlyLevels(r0, p0.by);
  var lv1 = UE.LuckCurve.yearlyLevels(r1, p1.by);
  var marker = drawPairGraph(pgCanvas, lv0, argbToCss(UE.PairGraph.colorOf(p0.male)), p0.name, r0.age,
    lv1, argbToCss(UE.PairGraph.colorOf(p1.male)), p1.name, r1.age);
  scrollGraphTo(pgScroll, marker.midX);
  note(root, "2人の年運レベルの流れを重ねたものです（横軸はそれぞれの年齢、ドットが現在）。色は男性＝青、女性＝赤で、白い線は2人の平均です（このアプリ独自の目安）。横にスクロールすると0歳から90歳まで見られます。");

  header(root, Aishou.TESOU_HEADING);
  var bothPalm = palms[0].status === "ok" && palms[1].status === "ok";
  var tc = bothPalm ? Aishou.tesouComment(palms[0].feat, palms[1].feat) : null;
  if (tc != null) {
    tv(root, tc);
  } else {
    note(root, "2人とも手相の写真を登録すると、手相から見た2人の相性コメントもここに出ます。写真は入力画面の各人の欄で登録でき、「鑑定する」を押したときに自動で読み取ります。");
  }

  header(root, "2人のこれから（予想とアドバイス）");
  tv(root, Aishou.futureText(ar, r0, r1, p0.name, p1.name, ry));

  btn(root, "相性スコアの算出方法", function () { showExplain("相性スコアの算出方法", AISHOU_EXPLAIN); });
  btn(root, "相性をコピーする", function () {
    copyText(UR.buildAishouCopy(
      UR.aishouHeader(p0.name, p0.by, p0.bm, p0.bd, p1.name, p1.by, p1.bm, p1.bd, ry, rm, rd),
      buildAishouText(ry, rm, rd)), "相性をコピーしました");
  });
  btn(root, "鑑定結果に戻る", function () { renderResult(0); showView("view-result"); });
}

/* ---------- 初期化 ---------- */
function init() {
  var formsBox = document.getElementById("forms");
  formsBox.appendChild(buildPersonForm(0));
  formsBox.appendChild(buildPersonForm(1));
  resetGenders();
  palms[0].hand = Tesou.DEFAULT_HAND; palms[1].hand = Tesou.DEFAULT_HAND;
  forms[0].handL.input.checked = true; forms[1].handL.input.checked = true;

  document.getElementById("btn-consent-ok").addEventListener("click", function () {
    showView("view-mode");
  });
  document.getElementById("btn-consent-ng").addEventListener("click", function () {
    document.getElementById("consent-ng-note").classList.remove("hidden");
  });
  document.getElementById("btn-mode-one").addEventListener("click", function () { setMode(MODE_ONE); });
  document.getElementById("btn-mode-two").addEventListener("click", function () { setMode(MODE_TWO); });
  document.getElementById("btn-start").addEventListener("click", onStartReading);
  document.getElementById("btn-clear").addEventListener("click", function () {
    if (window.confirm("入力内容をクリアして、別の人を占います。よろしいですか？\n（手相の写真と特徴も削除されます）")) {
      clearAllInputs();
    }
  });
  document.getElementById("btn-show-consent").addEventListener("click", function () {
    showView("view-consent");
  });
}
function setMode(m) {
  mode = m;
  forms[1].box.classList.toggle("hidden", m === MODE_ONE);
  document.getElementById("input-mode-note").textContent = m === MODE_ONE
    ? "1人の生年月日を入力してください。手相は任意で、この画面の中で写真を登録しておくと、「鑑定する」を押したときに自動で読み取って結果に入ります。"
    : "2人とも入力が必要です。手相は任意で、それぞれの欄の中で写真を登録しておくと、「鑑定する」を押したときに自動で読み取ります。個人鑑定に加えて、2人の相性も見られます。";
  showView("view-input");
}
init();
})();
