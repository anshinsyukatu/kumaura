/* クマうら BGM
 * 「同意して始める」が押されたら（＝利用者の操作なのでブラウザの自動再生制限に触れない）
 * bgm.mp3 をループ再生する。画面右上のボタンでいつでも止める／流すができる。
 * 再生できなくても鑑定機能には一切影響しない。 */
(function () {
  "use strict";
  var audio = null;
  var btn = null;
  var playing = false;

  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio("bgm.mp3");
    audio.loop = true;
    audio.volume = 0.8;
    audio.preload = "auto";
    audio.addEventListener("play", function () { playing = true; refresh(); });
    audio.addEventListener("pause", function () { playing = false; refresh(); });
    return audio;
  }

  function ensureButton() {
    if (btn) return btn;
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "bgm-toggle";
    btn.className = "bgm-toggle hidden";
    btn.addEventListener("click", toggle);
    document.body.appendChild(btn);
    return btn;
  }

  function refresh() {
    if (!btn) return;
    btn.textContent = playing ? "🔊 音を止める" : "🔇 音を流す";
  }

  function start() {
    var a = ensureAudio();
    ensureButton();
    btn.classList.remove("hidden");
    var p = a.play();
    if (p && p.catch) p.catch(function () { /* 再生失敗時は何もしない */ });
    playing = true;
    refresh();
  }

  function toggle() {
    if (!audio) { start(); return; }
    if (playing) {
      audio.pause();
    } else {
      var p = audio.play();
      if (p && p.catch) p.catch(function () { /* 同上 */ });
    }
  }

  function init() {
    var ok = document.getElementById("btn-consent-ok");
    if (ok) ok.addEventListener("click", start);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
