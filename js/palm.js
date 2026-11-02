(function (root) {
  "use strict";

  // 手相「写真からの自動読み取り」(PalmAuto.java、手相仕様 §12) の JavaScript 移植。
  // 処理はすべてメモリ上のみ。保存・送信は一切しない。
  // 数値（閾値・重み・探索範囲）は Java 版の値をそのまま使う。
  // Java の int 除算・(int) キャストは Math.trunc で再現する。

  // ---------- 画面に置く文言 (PalmAuto と一字一句同じ) ----------
  var AUTO_NOTE =
    "写真からの自動読み取りによる推定です。線の位置や濃さは目安で、実際の手相と違う場合があります。";
  var FAIL_MESSAGE =
    "手のひらが読み取れませんでした。明るい場所で、手のひら全体が写るように撮り直してください";
  var PHOTO_HINT =
    "指先を上に向け、手のひら全体が明るく写るように撮ってください。写真を取り込むと、そのまま自動で読み取ります。";

  // ---------- カノニカル格子 ----------
  var GW = 100; // u 方向（親指側=0 → 小指側=99）
  var GH = 130; // v 方向（指先=0 → 手首=129）

  // ---------- 線・特徴の添字 (Tesou と同じ) ----------
  var LINE_SEIMEI = 0, LINE_CHINO = 1, LINE_KANJO = 2, LINE_UNMEI = 3;
  var F_SEIMEI_LEN = 0, F_SEIMEI_ARC = 1, F_SEIMEI_DARK = 2;
  var F_CHINO_LEN = 3, F_CHINO_SLOPE = 4, F_CHINO_DARK = 5;
  var F_KANJO_REACH = 6, F_KANJO_CURVE = 7, F_KANJO_DARK = 8;
  var F_UNMEI_DARK = 9, F_UNMEI_LEN = 10;
  var FEATURE_COUNT = 11;

  // ---------- 線の標準形 (TesouSelect.BASE_POINTS と同じ) ----------
  var BASE_POINTS = [
    [[0.26, 0.385], [0.335, 0.52], [0.395, 0.68], [0.385, 0.86]], // 生命線
    [[0.25, 0.385], [0.445, 0.46], [0.585, 0.53], [0.74, 0.605]], // 頭脳線
    [[0.845, 0.465], [0.665, 0.44], [0.525, 0.40], [0.40, 0.33]], // 感情線
    [[0.513, 0.93], [0.511, 0.65], [0.508, 0.40]]                  // 運命線
  ];

  // ---------- 閾値（手相仕様 §12） ----------
  var MIN_AREA_RATIO = 0.05;
  var MAX_AREA_RATIO = 0.97;
  var LINE_MIN_SCORE = 0.12;
  var DARK_HI = 0.72;
  var DARK_LO = 0.42;
  var PRIOR_W = 0.5, PRIOR_SIGMA = 0.07;

  function guOf(u) { var g = Math.trunc(u * GW); return g < 0 ? 0 : (g >= GW ? GW - 1 : g); }
  function gvOf(v) { var g = Math.trunc(v * GH); return g < 0 ? 0 : (g >= GH ? GH - 1 : g); }

  function newGrid(fill) {
    var g = new Array(GH);
    for (var y = 0; y < GH; y++) { g[y] = new Array(GW); for (var x = 0; x < GW; x++) g[y][x] = fill; }
    return g;
  }

  function newResult() {
    return {
      handFound: false,
      linesFound: false,
      feat: null,
      linePaths: [null, null, null, null],
      lineScore: [0, 0, 0, 0],
      palmMask: newGrid(false),
      skinGrid: newGrid(false)
    };
  }

  function avgRuns(occ, b0, b1, nt) {
    var sum = 0;
    for (var b = b0; b < b1; b++) {
      var runs = 0, inRun = false;
      for (var t = 0; t < nt; t++) {
        if (occ[b][t] && !inRun) { runs++; inRun = true; }
        else if (!occ[b][t]) inRun = false;
      }
      sum += runs;
    }
    return sum / (b1 - b0);
  }

  function erode(inp) {
    var out = newGrid(false);
    for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) {
      if (!inp[y][x]) continue;
      var ok = true;
      for (var dy = -1; dy <= 1 && ok; dy++) for (var dx = -1; dx <= 1; dx++) {
        var nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= GW || ny < 0 || ny >= GH || !inp[ny][nx]) { ok = false; break; }
      }
      out[y][x] = ok;
    }
    return out;
  }

  function pathScore(crease, path) {
    if (path == null || path.length === 0) return 0;
    var s = 0;
    for (var i = 0; i < path.length; i++) s += crease[gvOf(path[i][1])][guOf(path[i][0])];
    return s / path.length;
  }

  function darkLevel(score, maxScore) {
    if (maxScore <= 0) return 2;
    var r = score / maxScore;
    return r >= DARK_HI ? 0 : (r >= DARK_LO ? 1 : 2);
  }

  function distToPolyline(u, v, poly) {
    var best = Infinity;
    for (var i = 0; i < poly.length - 1; i++) {
      var x1 = poly[i][0], y1 = poly[i][1], x2 = poly[i + 1][0], y2 = poly[i + 1][1];
      var dx = x2 - x1, dy = y2 - y1;
      var len2 = dx * dx + dy * dy;
      var t = len2 === 0 ? 0 : ((u - x1) * dx + (v - y1) * dy) / len2;
      if (t < 0) t = 0; if (t > 1) t = 1;
      var ex = x1 + t * dx - u, ey = y1 + t * dy - v;
      var d = Math.sqrt(ex * ex + ey * ey);
      if (d < best) best = d;
    }
    return best;
  }

  function priorGrid(line) {
    var poly = BASE_POINTS[line];
    var g = new Array(GH);
    for (var gv = 0; gv < GH; gv++) {
      var v = (gv + 0.5) / GH;
      var row = new Float32Array(GW);
      for (var gu = 0; gu < GW; gu++) {
        var u = (gu + 0.5) / GW;
        var d = distToPolyline(u, v, poly);
        row[gu] = PRIOR_W * Math.exp(-(d / PRIOR_SIGMA) * (d / PRIOR_SIGMA));
      }
      g[gv] = row;
    }
    return g;
  }

  function cellScore(crease, prior, gv, gu) {
    var pn = prior[gv][gu] / PRIOR_W; // 0..1
    return 2.0 * crease[gv][gu] * (0.25 + 0.75 * pn) + prior[gv][gu];
  }

  function dpVertical(crease, mask, prior, r0, r1, c0, c1, startC0, startC1, startBonus) {
    var rows = r1 - r0 + 1, cols = c1 - c0 + 1;
    if (rows < 4 || cols < 2) return null;
    var NEG = -1e9, LAMBDA = 0.22, BONUS = 0.8;
    var dp = [], par = [], i, c, pc;
    for (i = 0; i < rows; i++) { dp.push(new Float64Array(cols)); par.push(new Int32Array(cols)); }
    for (c = 0; c < cols; c++) {
      if (!mask[r0][c0 + c]) { dp[0][c] = NEG; par[0][c] = -1; continue; }
      dp[0][c] = cellScore(crease, prior, r0, c0 + c)
        + (startBonus && c0 + c >= startC0 && c0 + c <= startC1 ? BONUS : 0);
      par[0][c] = -1;
    }
    for (i = 1; i < rows; i++) {
      for (c = 0; c < cols; c++) {
        if (!mask[r0 + i][c0 + c]) { dp[i][c] = NEG; par[i][c] = -1; continue; }
        var best = NEG, bp = -1;
        for (pc = Math.max(0, c - 2); pc <= Math.min(cols - 1, c + 2); pc++) {
          if (dp[i - 1][pc] <= NEG / 2) continue;
          var val = dp[i - 1][pc] - LAMBDA * Math.abs(c - pc);
          if (val > best) { best = val; bp = pc; }
        }
        if (bp < 0) { dp[i][c] = NEG; par[i][c] = -1; continue; }
        dp[i][c] = best + cellScore(crease, prior, r0 + i, c0 + c);
        par[i][c] = bp;
      }
    }
    var bc = -1, bv = NEG;
    for (c = 0; c < cols; c++) if (dp[rows - 1][c] > bv) { bv = dp[rows - 1][c]; bc = c; }
    if (bc < 0 || bv <= NEG / 2) return null;
    var path = new Array(rows);
    var cc = bc;
    for (i = rows - 1; i >= 0; i--) {
      path[i] = [(c0 + cc + 0.5) / GW, (r0 + i + 0.5) / GH];
      cc = par[i][cc];
      if (cc < 0 && i > 0) return null;
    }
    return path;
  }

  function dpHorizontal(crease, mask, prior, c0, c1, r0, r1, startR0, startR1) {
    var cols = c1 - c0 + 1, rows = r1 - r0 + 1;
    if (cols < 4 || rows < 2) return null;
    var NEG = -1e9, LAMBDA = 0.22, BONUS = 0.8;
    var dp = [], par = [], i, r, pr;
    for (i = 0; i < cols; i++) { dp.push(new Float64Array(rows)); par.push(new Int32Array(rows)); }
    for (r = 0; r < rows; r++) {
      if (!mask[r0 + r][c0]) { dp[0][r] = NEG; par[0][r] = -1; continue; }
      dp[0][r] = cellScore(crease, prior, r0 + r, c0)
        + (startR0 >= 0 && r0 + r >= startR0 && r0 + r <= startR1 ? BONUS : 0);
      par[0][r] = -1;
    }
    for (i = 1; i < cols; i++) {
      for (r = 0; r < rows; r++) {
        if (!mask[r0 + r][c0 + i]) { dp[i][r] = NEG; par[i][r] = -1; continue; }
        var best = NEG, bp = -1;
        for (pr = Math.max(0, r - 2); pr <= Math.min(rows - 1, r + 2); pr++) {
          if (dp[i - 1][pr] <= NEG / 2) continue;
          var val = dp[i - 1][pr] - LAMBDA * Math.abs(r - pr);
          if (val > best) { best = val; bp = pr; }
        }
        if (bp < 0) { dp[i][r] = NEG; par[i][r] = -1; continue; }
        dp[i][r] = best + cellScore(crease, prior, r0 + r, c0 + i);
        par[i][r] = bp;
      }
    }
    var br = -1, bv = NEG;
    for (r = 0; r < rows; r++) if (dp[cols - 1][r] > bv) { bv = dp[cols - 1][r]; br = r; }
    if (br < 0 || bv <= NEG / 2) return null;
    var path = new Array(cols);
    var rr = br;
    for (i = cols - 1; i >= 0; i--) {
      path[i] = [(c0 + i + 0.5) / GW, (r0 + rr + 0.5) / GH];
      rr = par[i][rr];
      if (rr < 0 && i > 0) return null;
    }
    return path;
  }

  function isBadCell(p, crease, th, basePoly) {
    if (crease[gvOf(p[1])][guOf(p[0])] < th) return true;
    return distToPolyline(p[0], p[1], basePoly) > 0.09;
  }

  function trimEnds(path, crease, lineScore, basePoly, trimStart, trimEnd) {
    var th = 0.45 * lineScore;
    var start = 0, end = path.length;
    var half = Math.trunc(path.length / 2); // Java の int 除算
    if (trimStart) {
      while (end - start > half && isBadCell(path[start], crease, th, basePoly)) start++;
    }
    if (trimEnd) {
      while (end - start > half && isBadCell(path[end - 1], crease, th, basePoly)) end--;
    }
    return path.slice(start, end);
  }

  function refineEnd(path, basePoly, fromStart) {
    var i;
    if (fromStart) {
      for (i = 0; i < path.length; i++) {
        if (distToPolyline(path[i][0], path[i][1], basePoly) <= 0.05) return path[i];
      }
      return path[0];
    }
    for (i = path.length - 1; i >= 0; i--) {
      if (distToPolyline(path[i][0], path[i][1], basePoly) <= 0.05) return path[i];
    }
    return path[path.length - 1];
  }

  function uAtV(path, v) {
    var best = path[0], bd = Infinity;
    for (var i = 0; i < path.length; i++) {
      var d = Math.abs(path[i][1] - v);
      if (d < bd) { bd = d; best = path[i]; }
    }
    return best[0];
  }

  function vAtU(path, u) {
    var best = path[0], bd = Infinity;
    for (var i = 0; i < path.length; i++) {
      var d = Math.abs(path[i][0] - u);
      if (d < bd) { bd = d; best = path[i]; }
    }
    return best[1];
  }

  // ================================================================
  // メイン: analyze(rgba, w, h)
  // rgba は Uint8ClampedArray（Canvas の ImageData.data、RGBA 順、長さ w*h*4）
  // Java の analyze(int[] argb, w, h) と同じ処理。
  // ================================================================
  function analyze(rgba, w, h) {
    var res = newResult();
    if (rgba == null || w < 20 || h < 20 || rgba.length < w * h * 4) return res;
    var x, y, i;

    // ---- 1. サンプリング（長辺240px相当に間引く） ----
    var step = Math.max(1, Math.trunc((Math.max(w, h) + 239) / 240));
    var sw = Math.trunc((w + step - 1) / step), sh = Math.trunc((h + step - 1) / step);
    var lum = new Float64Array(sw * sh);
    var skin = new Uint8Array(sw * sh);
    for (y = 0; y < sh; y++) {
      for (x = 0; x < sw; x++) {
        var o = ((y * step) * w + x * step) * 4;
        var r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
        var yy = 0.299 * r + 0.587 * g + 0.114 * b;
        var cb = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b;
        var cr = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b;
        lum[y * sw + x] = yy;
        skin[y * sw + x] = (yy >= 45 && cb >= 70 && cb <= 140 && cr >= 125 && cr <= 185) ? 1 : 0;
      }
    }

    // ---- 2. 最大連結成分＝手の領域 ----
    var label = new Int32Array(sw * sh);
    var bestLabel = -1, bestCount = 0;
    var stack = new Int32Array(sw * sh);
    var cur = 0;
    for (i = 0; i < sw * sh; i++) {
      if (!skin[i] || label[i] !== 0) continue;
      cur++;
      var sp = 0, count = 0;
      stack[sp++] = i; label[i] = cur;
      while (sp > 0) {
        var p = stack[--sp]; count++;
        var px = p % sw, py = Math.trunc(p / sw);
        if (px > 0 && skin[p - 1] && label[p - 1] === 0) { label[p - 1] = cur; stack[sp++] = p - 1; }
        if (px < sw - 1 && skin[p + 1] && label[p + 1] === 0) { label[p + 1] = cur; stack[sp++] = p + 1; }
        if (py > 0 && skin[p - sw] && label[p - sw] === 0) { label[p - sw] = cur; stack[sp++] = p - sw; }
        if (py < sh - 1 && skin[p + sw] && label[p + sw] === 0) { label[p + sw] = cur; stack[sp++] = p + sw; }
      }
      if (count > bestCount) { bestCount = count; bestLabel = cur; }
    }
    var ratio = bestCount / (sw * sh);
    if (bestLabel < 0 || bestCount < 300 || ratio < MIN_AREA_RATIO || ratio > MAX_AREA_RATIO) {
      return res;
    }
    res.handFound = true;

    // ---- 3. 重心・主軸 ----
    var mx = 0, my = 0;
    for (y = 0; y < sh; y++) for (x = 0; x < sw; x++) {
      if (label[y * sw + x] === bestLabel) { mx += x; my += y; }
    }
    mx /= bestCount; my /= bestCount;
    var cxx = 0, cxy = 0, cyy = 0;
    for (y = 0; y < sh; y++) for (x = 0; x < sw; x++) {
      if (label[y * sw + x] !== bestLabel) continue;
      var dx = x - mx, dy = y - my;
      cxx += dx * dx; cxy += dx * dy; cyy += dy * dy;
    }
    var theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    var ax = Math.cos(theta), ay = Math.sin(theta);
    var qx = -ay, qy = ax; // Java の px, py（主軸に直交する方向）

    // ---- 4. 指先側の特定 ----
    var smin = Infinity, smax = -Infinity, tmin = Infinity, tmax = -Infinity;
    for (y = 0; y < sh; y++) for (x = 0; x < sw; x++) {
      if (label[y * sw + x] !== bestLabel) continue;
      var s = (x - mx) * ax + (y - my) * ay;
      var t = (x - mx) * qx + (y - my) * qy;
      if (s < smin) smin = s; if (s > smax) smax = s;
      if (t < tmin) tmin = t; if (t > tmax) tmax = t;
    }
    var NB = 24, NT = 24;
    var occ = [];
    for (i = 0; i < NB; i++) occ.push(new Array(NT).fill(false));
    for (y = 0; y < sh; y++) for (x = 0; x < sw; x++) {
      if (label[y * sw + x] !== bestLabel) continue;
      var s2 = (x - mx) * ax + (y - my) * ay;
      var t2 = (x - mx) * qx + (y - my) * qy;
      // Java: (int) キャスト。範囲が退化した (NaN) 場合は Java の (int)NaN=0 に合わせる
      var bi = Math.trunc((s2 - smin) / (smax - smin) * NB); if (isNaN(bi)) bi = 0;
      if (bi >= NB) bi = NB - 1; if (bi < 0) bi = 0;
      var ti = Math.trunc((t2 - tmin) / (tmax - tmin) * NT); if (isNaN(ti)) ti = 0;
      if (ti >= NT) ti = NT - 1; if (ti < 0) ti = 0;
      occ[bi][ti] = true;
    }
    var runsLo = avgRuns(occ, 0, 3, NT), runsHi = avgRuns(occ, NB - 3, NB, NT);
    var fingersAtSmin = runsLo >= runsHi;
    var sF = fingersAtSmin ? smin : smax;
    var sW = fingersAtSmin ? smax : smin;

    // ---- 5. 親指側の特定 ----
    var bandLoMin = Infinity, bandLoMax = -Infinity;
    var bandHiMin = Infinity, bandHiMax = -Infinity;
    var coreMin = Infinity, coreMax = -Infinity;
    for (y = 0; y < sh; y++) for (x = 0; x < sw; x++) {
      if (label[y * sw + x] !== bestLabel) continue;
      var s3 = (x - mx) * ax + (y - my) * ay;
      var t3 = (x - mx) * qx + (y - my) * qy;
      var v = (s3 - sF) / (sW - sF);
      if (v >= 0.30 && v < 0.45) { if (t3 < bandLoMin) bandLoMin = t3; if (t3 > bandLoMax) bandLoMax = t3; }
      if (v >= 0.45 && v < 0.55) { if (t3 < bandHiMin) bandHiMin = t3; if (t3 > bandHiMax) bandHiMax = t3; }
      if (v >= 0.58 && v < 0.78) { if (t3 < coreMin) coreMin = t3; if (t3 > coreMax) coreMax = t3; }
    }
    var upperMin = Math.min(bandLoMin, bandHiMin), upperMax = Math.max(bandLoMax, bandHiMax);
    var excessLowT = coreMin - upperMin;
    var excessHighT = upperMax - coreMax;
    var thumbAtLowT = excessLowT >= excessHighT;

    // ---- 6. シワスコア ----
    var ring = Math.max(2, Math.trunc(Math.min(sw, sh) / 50));
    var crease = new Float64Array(sw * sh);
    var axes = [[ring, 0], [0, ring], [ring, ring], [ring, -ring]];
    for (y = 0; y < sh; y++) for (x = 0; x < sw; x++) {
      if (label[y * sw + x] !== bestLabel) continue;
      var best = 0;
      for (var a = 0; a < axes.length; a++) {
        var x1 = x + axes[a][0], y1 = y + axes[a][1], x2 = x - axes[a][0], y2 = y - axes[a][1];
        if (x1 < 0 || x1 >= sw || y1 < 0 || y1 >= sh || x2 < 0 || x2 >= sw || y2 < 0 || y2 >= sh) continue;
        if (label[y1 * sw + x1] !== bestLabel || label[y2 * sw + x2] !== bestLabel) continue;
        var d = (lum[y1 * sw + x1] + lum[y2 * sw + x2]) / 2 - lum[y * sw + x];
        if (d > best) best = d;
      }
      crease[y * sw + x] = best <= 0 ? 0 : Math.min(1.0, best / 50.0);
    }

    // ---- 7. カノニカル格子への写像 ----
    var creaseGrid = [];
    for (i = 0; i < GH; i++) creaseGrid.push(new Float32Array(GW));
    for (var gv = 0; gv < GH; gv++) {
      var vv = (gv + 0.5) / GH;
      var ss = sF + vv * (sW - sF);
      for (var gu = 0; gu < GW; gu++) {
        var uu = (gu + 0.5) / GW;
        var tt = thumbAtLowT ? tmin + uu * (tmax - tmin) : tmax - uu * (tmax - tmin);
        var fx = mx + ax * ss + qx * tt;
        var fy = my + ay * ss + qy * tt;
        var ix = Math.round(fx), iy = Math.round(fy);
        if (ix < 0 || ix >= sw || iy < 0 || iy >= sh) continue;
        if (label[iy * sw + ix] !== bestLabel) continue;
        res.skinGrid[gv][gu] = true;
        creaseGrid[gv][gu] = crease[iy * sw + ix];
      }
    }
    var palm0 = newGrid(false);
    for (var gv2 = 0; gv2 < GH; gv2++) for (var gu2 = 0; gu2 < GW; gu2++) {
      palm0[gv2][gu2] = res.skinGrid[gv2][gu2] && (gv2 + 0.5) / GH >= 0.28;
    }
    var er = erode(erode(palm0));
    for (var gv3 = 0; gv3 < GH; gv3++) for (var gu3 = 0; gu3 < GW; gu3++) res.palmMask[gv3][gu3] = er[gv3][gu3];

    // ---- 8. 線の探索（帯域内DP） ----
    var life = dpVertical(creaseGrid, res.palmMask, priorGrid(LINE_SEIMEI),
      gvOf(0.36), gvOf(0.96), guOf(0.04), guOf(0.62), guOf(0.14), guOf(0.36), true);
    var head = dpHorizontal(creaseGrid, res.palmMask, priorGrid(LINE_CHINO),
      guOf(0.20), guOf(0.90), gvOf(0.30), gvOf(0.80), gvOf(0.34), gvOf(0.44));
    var heart = dpHorizontal(creaseGrid, res.palmMask, priorGrid(LINE_KANJO),
      guOf(0.26), guOf(0.92), gvOf(0.28), gvOf(0.62), -1, -1);
    var fate = dpVertical(creaseGrid, res.palmMask, priorGrid(LINE_UNMEI),
      gvOf(0.30), gvOf(0.96), guOf(0.38), guOf(0.64), -1, -1, false);

    res.linePaths[LINE_SEIMEI] = life;
    res.linePaths[LINE_CHINO] = head;
    res.linePaths[LINE_KANJO] = heart;
    res.lineScore[LINE_SEIMEI] = pathScore(creaseGrid, life);
    res.lineScore[LINE_CHINO] = pathScore(creaseGrid, head);
    res.lineScore[LINE_KANJO] = pathScore(creaseGrid, heart);
    res.lineScore[LINE_UNMEI] = pathScore(creaseGrid, fate);

    if (life == null || head == null || heart == null
        || res.lineScore[LINE_SEIMEI] < LINE_MIN_SCORE
        || res.lineScore[LINE_CHINO] < LINE_MIN_SCORE
        || res.lineScore[LINE_KANJO] < LINE_MIN_SCORE) {
      return res;
    }
    var fateFound = fate != null && res.lineScore[LINE_UNMEI] >= LINE_MIN_SCORE;
    res.linePaths[LINE_UNMEI] = fateFound ? fate : null;

    // ---- 9. 経路 → 特徴（3段階） ----
    var feat = new Array(FEATURE_COUNT).fill(-1);
    var maxScore = Math.max(res.lineScore[0],
      Math.max(res.lineScore[1], Math.max(res.lineScore[2],
        fateFound ? res.lineScore[3] : 0)));

    var lifeT = trimEnds(life, creaseGrid, res.lineScore[0], BASE_POINTS[LINE_SEIMEI], false, true);
    var lifeEndV = refineEnd(lifeT, BASE_POINTS[LINE_SEIMEI], false)[1];
    feat[F_SEIMEI_LEN] = lifeEndV >= 0.88 ? 0 : (lifeEndV >= 0.70 ? 1 : 2);
    var lifeArcU = uAtV(lifeT, 0.68);
    feat[F_SEIMEI_ARC] = lifeArcU >= 0.41 ? 0 : (lifeArcU >= 0.365 ? 1 : 2);
    feat[F_SEIMEI_DARK] = darkLevel(res.lineScore[0], maxScore);

    var headT = trimEnds(head, creaseGrid, res.lineScore[1], BASE_POINTS[LINE_CHINO], true, true);
    var headEndP = refineEnd(headT, BASE_POINTS[LINE_CHINO], false);
    var headStartP = refineEnd(headT, BASE_POINTS[LINE_CHINO], true);
    var headEndU = headEndP[0];
    feat[F_CHINO_LEN] = headEndU >= 0.79 ? 0 : (headEndU >= 0.60 ? 1 : 2);
    var slope = headEndP[1] - headStartP[1];
    feat[F_CHINO_SLOPE] = slope <= 0.14 ? 0 : (slope <= 0.27 ? 1 : 2);
    feat[F_CHINO_DARK] = darkLevel(res.lineScore[1], maxScore);

    var heartT = trimEnds(heart, creaseGrid, res.lineScore[2], BASE_POINTS[LINE_KANJO], true, true);
    var heartEndU = refineEnd(heartT, BASE_POINTS[LINE_KANJO], true)[0];
    feat[F_KANJO_REACH] = heartEndU <= 0.36 ? 0 : (heartEndU <= 0.46 ? 1 : 2);
    var startV = vAtU(heartT, 0.85);
    var midV = vAtU(heartT, Math.max(0.55, heartEndU + 0.05));
    var rise = startV - midV;
    feat[F_KANJO_CURVE] = rise >= 0.075 ? 0 : (rise >= 0.043 ? 1 : 2);
    feat[F_KANJO_DARK] = darkLevel(res.lineScore[2], maxScore);

    if (fateFound) {
      var dl = darkLevel(res.lineScore[3], maxScore);
      if (dl === 2) {
        feat[F_UNMEI_DARK] = 2;
        feat[F_UNMEI_LEN] = -1;
      } else {
        feat[F_UNMEI_DARK] = dl;
        var fateT = trimEnds(fate, creaseGrid, res.lineScore[3], BASE_POINTS[LINE_UNMEI], true, false);
        var fateTopV = refineEnd(fateT, BASE_POINTS[LINE_UNMEI], true)[1];
        feat[F_UNMEI_LEN] = fateTopV <= 0.36 ? 0 : (fateTopV <= 0.55 ? 1 : 2);
        res.linePaths[LINE_UNMEI] = fate;
      }
    } else {
      feat[F_UNMEI_DARK] = 2;
      feat[F_UNMEI_LEN] = -1;
    }

    res.feat = feat;
    res.linesFound = true;
    return res;
  }

  root.UP = {
    AUTO_NOTE: AUTO_NOTE,
    FAIL_MESSAGE: FAIL_MESSAGE,
    PHOTO_HINT: PHOTO_HINT,
    GW: GW,
    GH: GH,
    BASE_POINTS: BASE_POINTS,
    LINE_SEIMEI: LINE_SEIMEI, LINE_CHINO: LINE_CHINO,
    LINE_KANJO: LINE_KANJO, LINE_UNMEI: LINE_UNMEI,
    F_SEIMEI_LEN: F_SEIMEI_LEN, F_SEIMEI_ARC: F_SEIMEI_ARC, F_SEIMEI_DARK: F_SEIMEI_DARK,
    F_CHINO_LEN: F_CHINO_LEN, F_CHINO_SLOPE: F_CHINO_SLOPE, F_CHINO_DARK: F_CHINO_DARK,
    F_KANJO_REACH: F_KANJO_REACH, F_KANJO_CURVE: F_KANJO_CURVE, F_KANJO_DARK: F_KANJO_DARK,
    F_UNMEI_DARK: F_UNMEI_DARK, F_UNMEI_LEN: F_UNMEI_LEN,
    FEATURE_COUNT: FEATURE_COUNT,
    guOf: guOf,
    gvOf: gvOf,
    analyze: analyze
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.UP;
})(typeof self !== "undefined" ? self : globalThis);
