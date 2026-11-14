/*
 * Sapling print twin: interface and 3D scene.
 * Copyright (C) 2026 Ali Akbarzadeh. License: GPL-3.0-or-later
 */
(function () {
  "use strict";
  var S = window.SaplingSolver;
  var $ = function (id) { return document.getElementById(id); };

  // ================================================================ inputs
  // Units as in the Grasshopper component: mm, s, kg/m3, kPa, 1/min.
  // paper: failure layer given by the model in the paper; observed: failure layers of the printed walls
  var BASE = { b: 500, d: 250, nu: 0.3, curing: "linear", betaE: 2.5, gammaE: 5, mE: 3, nS: 3 };
  var PRESETS = [
    { name: "Square wall 500 mm (Suiker et al. 2020)", layout: "square", b: 500, h: 55, tl: 9.5, Tl: 19.2,
      rho: 2100, E0: 48.564, xiE: 0.0537, sig0: 2.835, xiS: 0.116, paper: 27, observed: [27, 28],
      note: "Two walls were printed. Both buckled, at 27 and 28 layers." },
    { name: "Square wall 250 mm (Suiker et al. 2020)", layout: "square", b: 250, h: 55, tl: 9.5, Tl: 9.6,
      rho: 2100, E0: 48.564, xiE: 0.0537, sig0: 2.835, xiS: 0.116, paper: 21, observed: [23],
      note: "The printed walls collapsed plastically at 23 layers. The paper obtains 23 as well when it uses the slightly lower layer height that was measured." },
    { name: "Rectangle 625 × 250 mm (Suiker 2018)", layout: "rect", b: 625, d: 250, h: 43.5, tl: 9.2, Tl: 21,
      rho: 2020, E0: 78.1, xiE: 0.0156, sig0: 5.984, xiS: 0.0246, paper: 30, observed: [33],
      note: "The printed rectangle buckled at 33 layers. The paper notes a spread of 13 to 21% in the measured material properties." },
    { name: "Free wall 1.0 m (Wolfs & Suiker 2019)", layout: "free", h: 60, tl: 9.5, Tl: 9.6,
      rho: 2100, E0: 39.5, xiE: 0.0432, sig0: 1000000, xiS: 0, paper: 19, observed: [21],
      note: "The printed wall buckled at 21 layers. The yield strength is set very high here, so only buckling is checked." },
    { name: "Free wall 10.4 m, linear curing (Wolfs & Suiker 2019)", layout: "free", h: 60, tl: 9.5, Tl: 99.8,
      rho: 2100, E0: 39.5, xiE: 0.0432, sig0: 1000000, xiS: 0, paper: null, observed: [46],
      note: "The printed wall buckled at 46 layers. Linear curing predicts far fewer, because the material cures faster in a long session. One metre of the wall is drawn." },
    { name: "Free wall 10.4 m, quadratic curing (Wolfs & Suiker 2019)", layout: "free", h: 60, tl: 9.5, Tl: 99.8,
      rho: 2100, E0: 39.5, xiE: 0.0432, sig0: 1000000, xiS: 0, curing: "quadratic", paper: null, observed: [46],
      note: "The printed wall buckled at 46 layers. The coefficient 2.5 was fitted by the authors to this wall, so the match is a fit and not a prediction. One metre of the wall is drawn." },
    { name: "Accelerated mortar, square 500 mm (material of Deetman & Suiker 2025)", layout: "square", b: 500, h: 55, tl: 9.5, Tl: 19.2,
      rho: 2100, E0: 83, xiE: 0.024, sig0: 5.505, xiS: 0.02, curing: "power", mE: 3, nS: 3, paper: null, observed: [],
      note: "A prediction, not a reproduction: no wall was printed with this mortar in the paper. Stiffness and cohesion follow power laws with exponent 3, measured by indentation tests; the yield strength is the cohesion of 1.72 kPa at a friction angle of 26°. The density of 2100 kg/m³ is assumed, and the wall and print settings are those of the 500 mm example. Compression tests on the same mortar gave slower curing (0.020 and 0.015 per minute), which gives 46 layers." },
    { name: "Wall 690 mm, no failure (Suiker et al. 2020)", layout: "square", b: 690, h: 55, tl: 9.5, Tl: 88,
      rho: 2100, E0: 55, xiE: 0.42, sig0: 2.835, xiS: 0.116, paper: null, observed: [], layers: 80,
      note: "Second material batch of the paper, printed slowly. The real object was printed to 80 layers (760 mm) without failing. The wall is drawn here as a square." }
  ];

  var FIELDS = {
    layout: [
      { id: "b", label: "Wall width", unit: "mm", min: 150, max: 1000, step: 5, show: ["square", "rect"] },
      { id: "d", label: "Width of the short wall", unit: "mm", min: 100, max: 1000, step: 5, show: ["rect"] }
    ],
    print: [
      { id: "h", label: "Wall thickness", unit: "mm", min: 25, max: 100, step: 0.5 },
      { id: "tl", label: "Layer height", unit: "mm", min: 5, max: 20, step: 0.1 },
      { id: "Tl", label: "Time per layer", unit: "s", min: 5, max: 120, step: 0.1 }
    ],
    mat: [
      { id: "rho", label: "Density", unit: "kg/m³", min: 1800, max: 2500, step: 10 },
      { id: "E0", label: "Initial stiffness", unit: "kPa", min: 10, max: 200, step: 0.001 },
      { id: "xiE", label: "Stiffness curing rate", unit: "1/min", min: 0, max: 0.5, step: 0.0001 },
      { id: "sig0", label: "Initial yield strength", unit: "kPa", min: 0.5, max: 20, step: 0.001 },
      { id: "xiS", label: "Strength curing rate", unit: "1/min", min: 0, max: 1, step: 0.001 },
      { id: "nu", label: "Poisson ratio", unit: "", min: 0.1, max: 0.45, step: 0.01 },
      { id: "curing", label: "Stiffness curing law", select: [["linear", "Linear"], ["quadratic", "Quadratic (long sessions)"], ["exponential", "Exponential (levels off)"], ["power", "Power law (accelerated)"]] },
      { id: "mE", label: "Stiffness exponent", unit: "", min: 1, max: 4, step: 0.1, showCuring: "power" },
      { id: "nS", label: "Strength exponent", unit: "", min: 1, max: 4, step: 0.1, showCuring: "power" },
      { id: "betaE", label: "Curing acceleration", unit: "", min: 0.1, max: 6, step: 0.1, showCuring: "quadratic" },
      { id: "gammaE", label: "Final over initial stiffness", unit: "", min: 1.1, max: 20, step: 0.1, showCuring: "exponential" }
    ]
  };
  var LAYOUT_HINT = {
    free: "A straight wall with free ends. It buckles as a whole.",
    square: "Four equal walls. Each wall is held along its two corners (simply supported).",
    rect: "Long and short walls. The short walls hold the long ones with a stiffness that changes over the height."
  };

  var state = {};
  var result = null, geo = null;         // solver result; derived print geometry
  var step = 0, playing = false, speed = 1, atEnd = true, lastT = 0;

  function fmt(x, d) { return Number(x).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function clock(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function buildFields(hostId, list) {
    var host = $(hostId);
    list.forEach(function (f) {
      var row = document.createElement("div");
      row.className = "field"; row.id = "row-" + f.id;
      if (f.select) {
        row.innerHTML = '<label for="in-' + f.id + '"><span>' + f.label + "</span></label>" +
          '<select id="in-' + f.id + '">' + f.select.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + "</option>"; }).join("") + "</select>";
        host.appendChild(row);
        row.querySelector("select").addEventListener("change", function (e) { state[f.id] = e.target.value; changed(); });
        return;
      }
      row.innerHTML = '<label for="in-' + f.id + '"><span>' + f.label + "</span><small>" + f.unit + "</small></label>" +
        '<input type="range" id="rng-' + f.id + '" aria-label="' + f.label + '" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '">' +
        '<input type="number" id="in-' + f.id + '" min="0" step="' + f.step + '">';
      host.appendChild(row);
      var rng = row.querySelector('input[type="range"]'), num = row.querySelector('input[type="number"]');
      rng.addEventListener("input", function () { state[f.id] = +rng.value; num.value = rng.value; changed(); });
      num.addEventListener("change", function () {
        var v = parseFloat(num.value);
        if (!isFinite(v) || v < 0) { num.value = state[f.id]; return; }
        if (f.id !== "xiE" && f.id !== "xiS" && v === 0) { num.value = state[f.id]; return; }
        if ((f.id === "mE" || f.id === "nS") && v < 1) { num.value = state[f.id]; return; }
        state[f.id] = v; rng.value = v; changed();
      });
    });
  }

  function syncInputs() {
    Object.keys(FIELDS).forEach(function (k) {
      FIELDS[k].forEach(function (f) {
        var el = $("in-" + f.id); if (!el) return;
        el.value = state[f.id];
        var r = $("rng-" + f.id); if (r) r.value = state[f.id];
        var show = (!f.show || f.show.indexOf(state.layout) >= 0) && (!f.showCuring || f.showCuring === state.curing);
        $("row-" + f.id).style.display = show ? "" : "none";
      });
    });
    Array.prototype.forEach.call($("layout").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === state.layout)); });
    $("layoutHint").textContent = LAYOUT_HINT[state.layout];
    var lab = document.querySelector('#row-b label span');
    if (lab) lab.textContent = state.layout === "rect" ? "Width of the long wall" : "Wall width";
  }

  function loadPreset(i) {
    var p = PRESETS[i], keep = state.target || 40;
    Object.keys(BASE).forEach(function (k) { state[k] = BASE[k]; });
    Object.keys(p).forEach(function (k) { if (k !== "name" && k !== "note" && k !== "paper" && k !== "observed" && k !== "layers") state[k] = p[k]; });
    state.target = keep; state.presetNote = p.note; state.presetIndex = i; state.preset = p; $("preset").value = String(i);
    syncInputs(); atEnd = true; compute();
  }
  function changed() {
    if (state.preset) { state.presetNote = null; state.preset = null; $("preset").value = "custom"; }
    syncInputs(); scheduleCompute();
  }
  var pending = false;
  function scheduleCompute() {
    if (pending) return; pending = true;
    requestAnimationFrame(function () { pending = false; compute(); });
  }

  // ================================================================ solve
  var NO_FAIL_LAYERS = 45, COLLAPSE = 3.0, HOLD = 1.5;

  function params(over) {
    var p = { h: state.h / 1000, tl: state.tl / 1000, Tl: state.Tl, rho: state.rho, E0: state.E0 * 1000, nu: state.nu,
              xiE: state.xiE / 60, sig0: state.sig0 * 1000, xiS: state.xiS / 60 };
    if (state.layout === "free") p.edge = "free";
    else if (state.layout === "square") { p.edge = "simply"; p.b = state.b / 1000; }
    else { p.edge = "rect"; p.b = Math.max(state.b, state.d) / 1000; p.d = Math.min(state.b, state.d) / 1000; }
    if (state.curing === "quadratic") p.betaE = state.betaE;
    if (state.curing === "exponential") p.gammaE = state.gammaE;
    if (state.curing === "power") { p.mE = state.mE; p.nS = state.nS; }
    if (over) Object.keys(over).forEach(function (k) { p[k] = over[k]; });
    return p;
  }
  function pathLength() {            // length of one layer, mm (not defined for the free wall: its real length is not an input)
    if (state.layout === "free") return null;
    var W = state.layout === "square" ? state.b : Math.max(state.b, state.d), D = state.layout === "square" ? state.b : Math.min(state.b, state.d);
    var rc = Math.min(50, 0.14 * Math.min(W, D));
    return 2 * (W + D) - 8 * rc + 2 * Math.PI * rc;
  }

  var band = null, jobs = 0;
  function compute() {
    var p = params();
    try { result = S.assess(p); } catch (err) { result = null; }
    if (!result) return;
    // the same wall with initial stiffness and strength 10% lower and 10% higher
    try {
      band = { lo: S.assess(params({ E0: p.E0 * 0.9, sig0: p.sig0 * 0.9 })).n, hi: S.assess(params({ E0: p.E0 * 1.1, sig0: p.sig0 * 1.1 })).n };
    } catch (err2) { band = null; }
    var pre = state.preset, fail = result.n, layers = fail === null ? ((pre && pre.layers) || NO_FAIL_LAYERS) : fail;
    var total = fail === null ? layers : fail + COLLAPSE + HOLD, scale = total;
    if (pre) pre.observed.concat(pre.paper ? [pre.paper] : []).forEach(function (n) { scale = Math.max(scale, n + 1.5); });
    if (band && fail !== null && band.hi !== null) scale = Math.max(scale, Math.min(band.hi + 1.5, total * 1.6));
    geo = {
      fail: fail, layers: layers, total: total, scale: scale,
      mode: result.mode, shape: result.shape, h: state.h, tl: state.tl,
      W: state.layout === "free" ? 1000 : (state.layout === "square" ? state.b : Math.max(state.b, state.d)),
      D: state.layout === "free" ? 0 : (state.layout === "square" ? state.b : Math.min(state.b, state.d)),
      closed: state.layout !== "free"
    };
    step = atEnd ? geo.total : Math.min(step, geo.total);
    renderReport(); renderTimeline();
    if (scene3d) { scene3d.setPrint(geo); }
    renderStep(); writeHash();
    // the slower questions run after the page has been redrawn
    var job = ++jobs;
    $("askOut").textContent = "Calculating…"; $("askUse").disabled = true;
    setTimeout(function () { if (job === jobs) solveTarget(job); }, 160);
    setTimeout(function () { if (job === jobs) sweep(job); }, 260);
  }

  // ================================================================ how fast can I print?
  var askTl = null;
  function solveTarget(job) {
    var N = Math.max(2, Math.round(state.target || 40));
    function safe(Tl) { var r = S.assess(params({ Tl: Tl })); return r.n === null || r.n > N; }
    var lo = 1, hi = 2, phase = 0, out = $("askOut");
    function done(html, tl) { if (job !== jobs) return; out.innerHTML = html; askTl = tl; $("askUse").disabled = tl === null || Math.abs(tl - state.Tl) < 0.05; }
    function stepSearch() {
      if (job !== jobs) return;
      try {
        if (phase === 0) {
          if (safe(lo)) return done("Safe at any speed: " + N + " layers hold even at 1 s per layer.", null);
          phase = 1;
        } else if (phase === 1) {
          if (safe(hi)) phase = 2; else { lo = hi; hi *= 2; if (hi > 14400) return done("Printing slower does not help: " + N + " layers are out of reach for this wall and material.", null); }
        } else {
          for (var i = 0; i < 3 && hi - lo > 0.05; i++) { var mid = 0.5 * (lo + hi); if (safe(mid)) hi = mid; else lo = mid; }
          if (hi - lo <= 0.05) {
            var tl = Math.ceil(hi * 10) / 10, len = pathLength();
            return done("Shortest time per layer: <strong>" + fmt(tl, 1) + " s</strong>" +
              (len ? ", a nozzle speed of " + fmt(len / tl, 0) + " mm/s on this path" : "") + ". " + N + " layers then take " + clock(N * tl) +
              ". No safety margin is included.", tl);
          }
        }
      } catch (err) { return done("Could not be calculated for these inputs.", null); }
      setTimeout(stepSearch, 0);
    }
    stepSearch();
  }

  // ================================================================ height against wall thickness
  var chartData = null;
  function sweep(job) {
    var xs = [], i; for (i = 25; i <= 100; i += 2.5) xs.push(i);
    var pts = [], k = 0, host = $("chart");
    if (!chartData) host.innerHTML = '<p class="hint">Calculating…</p>';
    function chunk() {
      if (job !== jobs) return;
      for (var c = 0; c < 3 && k < xs.length; c++, k++) {
        var r; try { r = S.assess(params({ h: xs[k] / 1000, sig0: 1e15, xiS: 0, Lmax: 20 })); } catch (e) { r = null; }
        pts.push({ h: xs[k], lcr: r && r.lcr !== Infinity ? r.lcr * 1000 : null });
      }
      if (k < xs.length) { setTimeout(chunk, 0); return; }
      chartData = { pts: pts, lp: result.lp === Infinity ? null : result.lp * 1000 };
      drawChart();
    }
    chunk();
  }
  function drawChart() {
    var d = chartData, host = $("chart"); if (!d) return;
    var W = 284, H = 190, L = 38, R = 10, T = 12, B = 30, lp = d.lp;
    var known = d.pts.filter(function (q) { return q.lcr !== null; });
    var top = Math.max.apply(null, known.map(function (q) { return q.lcr; }).concat(lp ? [lp] : [0]));
    if (lp) top = Math.min(top, lp * 2.1);
    if (!(top > 0)) { host.innerHTML = '<p class="hint">No failure is predicted for any wall thickness between 25 and 100 mm.</p>'; return; }
    top *= 1.08;
    var niceStep = [50, 100, 200, 250, 500, 1000, 2000, 5000].filter(function (v) { return top / v <= 4.5; })[0] || 10000;
    function X(h) { return L + (W - L - R) * (h - 25) / 75; }
    function Y(v) { return T + (H - T - B) * (1 - Math.min(v, top) / top); }
    var gov = function (q) { var a = q.lcr === null ? Infinity : q.lcr, b = lp === null ? Infinity : lp; return Math.min(a, b); };
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Critical height against wall thickness">';
    for (var v = 0; v <= top; v += niceStep) svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="var(--line)" stroke-width="1"/><text x="' + (L - 5) + '" y="' + (Y(v) + 3.5) + '" text-anchor="end">' + v + "</text>";
    [25, 50, 75, 100].forEach(function (hx) { svg += '<text x="' + X(hx) + '" y="' + (H - B + 14) + '" text-anchor="middle">' + hx + "</text>"; });
    svg += '<text x="' + (L + (W - L - R) / 2) + '" y="' + (H - 3) + '" text-anchor="middle">wall thickness, mm</text><text x="4" y="' + (T - 2) + '">mm</text>';
    // printable height: below both lines
    var area = "M" + X(25) + "," + Y(0);
    d.pts.forEach(function (q) { var g = gov(q); area += " L" + X(q.h).toFixed(1) + "," + Y(g === Infinity ? top : g).toFixed(1); });
    svg += '<path d="' + area + " L" + X(100) + "," + Y(0) + ' Z" fill="var(--accent-soft)"/>';
    if (lp && lp <= top) svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(lp) + '" y2="' + Y(lp) + '" stroke="var(--s2)" stroke-width="2" stroke-dasharray="6 4"/>';
    var line = "", pen = false;
    d.pts.forEach(function (q) { if (q.lcr === null || q.lcr > top) { pen = false; return; } line += (pen ? " L" : " M") + X(q.h).toFixed(1) + "," + Y(q.lcr).toFixed(1); pen = true; });
    svg += '<path d="' + line + '" fill="none" stroke="var(--s1)" stroke-width="2" stroke-linejoin="round"/>';
    // where buckling hands over to plastic collapse
    var cross = null;
    if (lp) for (var i = 1; i < d.pts.length; i++) {
      var a = d.pts[i - 1], b = d.pts[i]; if (a.lcr === null || b.lcr === null) continue;
      if ((a.lcr - lp) * (b.lcr - lp) <= 0 && a.lcr !== b.lcr) { cross = a.h + (b.h - a.h) * (lp - a.lcr) / (b.lcr - a.lcr); break; }
    }
    if (cross !== null) {
      svg += '<circle cx="' + X(cross) + '" cy="' + Y(lp) + '" r="4.5" fill="var(--panel)" stroke="var(--ink)" stroke-width="1.5"/>';
      var right = cross < 70;
      svg += '<text class="lab" x="' + (X(cross) + (right ? 8 : -8)) + '" y="' + (Y(lp) + 15) + '" text-anchor="' + (right ? "start" : "end") + '">switch at ' + fmt(cross, 0) + " mm</text>";
    }
    var cur = Math.max(25, Math.min(100, state.h)), gh = result.H === null ? null : result.H * 1000;
    svg += '<line x1="' + X(cur) + '" x2="' + X(cur) + '" y1="' + T + '" y2="' + (H - B) + '" stroke="var(--ink)" stroke-width="1" stroke-dasharray="2 3"/>';
    if (gh !== null && gh <= top) svg += '<circle cx="' + X(cur) + '" cy="' + Y(gh) + '" r="4.5" fill="var(--fail)" stroke="var(--panel)" stroke-width="2"/>';
    svg += '<line id="chartHover" x1="0" x2="0" y1="' + T + '" y2="' + (H - B) + '" stroke="var(--muted)" stroke-width="1" visibility="hidden"/></svg>';
    var def = "This wall: " + fmt(state.h, 1) + " mm thick" + (gh === null ? ", no failure predicted." : ", fails at " + fmt(gh, 0) + " mm.") + " Point at the chart to read other thicknesses; click to use one.";
    host.innerHTML = '<p class="key"><span><i></i>Elastic buckling</span><span><i class="p"></i>Plastic collapse</span><span><i class="a"></i>Printable</span></p>' + svg + '<p class="read hint" id="chartRead">' + def + "</p>";
    var el = host.querySelector("svg"), hov = el.querySelector("#chartHover");
    function hAt(e) { var r = el.getBoundingClientRect(); var hx = 25 + 75 * ((e.clientX - r.left) / r.width * W - L) / (W - L - R); return Math.max(25, Math.min(100, Math.round(hx / 2.5) * 2.5)); }
    el.addEventListener("pointermove", function (e) {
      var hx = hAt(e), q = d.pts[Math.round((hx - 25) / 2.5)]; if (!q) return;
      hov.setAttribute("x1", X(hx)); hov.setAttribute("x2", X(hx)); hov.setAttribute("visibility", "visible");
      var g = gov(q);
      $("chartRead").textContent = fmt(hx, 1) + " mm thick: buckling at " + (q.lcr === null ? "more than " + fmt(20 * result.L0 * 1000, 0) : fmt(q.lcr, 0)) + " mm, plastic collapse at " +
        (lp === null ? "no height" : fmt(lp, 0) + " mm") + ". " + (g === Infinity ? "No failure." : (q.lcr !== null && (lp === null || q.lcr < lp) ? "Buckling decides." : "Plastic collapse decides."));
    });
    el.addEventListener("pointerleave", function () { hov.setAttribute("visibility", "hidden"); $("chartRead").textContent = def; });
    el.addEventListener("click", function (e) { state.h = hAt(e); changed(); });
  }

  // ================================================================ link to these settings
  var ORDER = [["b", 1], ["d", 1], ["h", 10], ["tl", 10], ["Tl", 10], ["rho", 1], ["E0", 1000], ["xiE", 10000], ["sig0", 1000], ["xiS", 1000], ["nu", 100], ["betaE", 10], ["gammaE", 10], ["target", 1], ["mE", 10], ["nS", 10]];
  function encodeState() {
    if (state.preset) return "example-" + (state.presetIndex + 1);
    return "s2-" + state.layout.charAt(0) + state.curing.charAt(0) + "-" + ORDER.map(function (o) { return Math.round(state[o[0]] * o[1]); }).join("-");
  }
  function decodeState(hash) {
    var m = /^example-(\d+)$/.exec(hash);
    if (m && PRESETS[+m[1] - 1]) return { preset: +m[1] - 1 };
    var parts = hash.split("-");
    var count = parts[0] === "s2" ? ORDER.length : (parts[0] === "s1" ? ORDER.length - 2 : -1);     // s1 links have no exponents
    if (count < 0 || parts.length !== count + 2 || !/^[fsr][lqep]$/.test(parts[1])) return null;
    var o = { layout: { f: "free", s: "square", r: "rect" }[parts[1].charAt(0)], curing: { l: "linear", q: "quadratic", e: "exponential", p: "power" }[parts[1].charAt(1)], mE: 3, nS: 3 };
    for (var i = 0; i < count; i++) { var v = parseInt(parts[i + 2], 10); if (!isFinite(v) || v < 0) return null; o[ORDER[i][0]] = v / ORDER[i][1]; }
    if (!(o.h > 0 && o.tl > 0 && o.Tl > 0 && o.rho > 0 && o.E0 > 0 && o.sig0 > 0 && o.b > 0 && o.d > 0 && o.nu > 0 && o.nu < 0.5 && o.mE >= 1 && o.nS >= 1)) return null;
    return { state: o };
  }
  function writeHash() {
    try { history.replaceState(null, "", "#" + encodeState()); } catch (err) { /* not allowed in this frame: the page works without it */ }
  }

  // ================================================================ report
  function renderReport() {
    var r = result, tl = state.tl, v = $("verdict"), mm = function (x) { return fmt(x * 1000, 0); };
    if (r.H === null) {
      v.dataset.mode = "none";
      v.innerHTML = '<span class="pill">No failure predicted</span><h3>The wall keeps standing</h3>' +
        "<p>Stiffness and strength grow faster than the load. No buckling was found below " + mm(r.limit) + " mm.</p>";
    } else {
      var buck = r.mode === "elastic buckling";
      v.dataset.mode = buck ? "buckling" : "plastic";
      v.innerHTML = '<span class="pill">' + (buck ? "Elastic buckling" : "Plastic collapse") + "</span>" +
        "<h3>Fails at layer " + r.n + "</h3>" +
        "<p>Critical height " + mm(r.H) + " mm, reached after " + clock(r.H / r.ldot) + " of printing. " +
        (buck ? "The wall is too slender for its weight and bends sideways." : "The bottom layer yields under the weight above it.") + "</p>";
    }
    if (band) {
      var nm = function (n) { return n === null ? "no failure" : "layer " + n; }, same = band.lo === band.hi && band.lo === r.n;
      v.innerHTML += '<p style="margin-top:8px">With initial stiffness and strength 10% lower or higher: ' +
        (same ? "the same result." : "<b>" + nm(band.lo) + " to " + nm(band.hi) + "</b>.") + "</p>";
    }
    var fin = function (x) { return x !== Infinity && x !== null; };
    var top = Math.max(fin(r.lcr) ? r.lcr : 0, fin(r.lp) ? r.lp : 0, r.limit * 0.5) || 1;
    if (fin(r.lp) && fin(r.lcr)) top = Math.max(r.lcr, Math.min(r.lp, r.lcr * 3));
    function row(name, x, gov, none) {
      if (fin(x) && x > 100) { x = Infinity; none = "above 100 m, does not decide"; }
      var w = fin(x) ? Math.min(100, 100 * x / top) : 100;
      return '<div class="barrow' + (gov ? " gov" : "") + '"><div><span>' + name + '</span><span class="num">' +
        (fin(x) ? mm(x) + " mm · " + fmt(x * 1000 / tl, 2) + " layers" : none) + "</span></div>" +
        '<div class="lane"><span style="width:' + (fin(x) ? w : 0) + '%"></span></div></div>';
    }
    $("bars").innerHTML =
      row("Elastic buckling", r.lcr, r.mode === "elastic buckling", "none below " + mm(r.limit) + " mm") +
      row("Plastic collapse", r.lp, r.mode === "plastic collapse", "never: strength outgrows the load") +
      '<p class="hint">The shorter of the two heights decides.</p>';

    $("shapeWrap").style.display = r.shape ? "" : "none";
    if (r.shape) {
      var pts = r.shape.map(function (s, i) { return (14 + 68 * s).toFixed(1) + "," + (86 - 76 * i / (r.shape.length - 1)).toFixed(1); }).join(" ");
      $("shape").innerHTML = '<svg viewBox="0 0 96 96" role="img" aria-label="Sideways deflection over the wall height">' +
        '<line x1="14" y1="10" x2="14" y2="86" stroke="var(--line)" stroke-width="1.5" stroke-dasharray="3 3"/>' +
        '<line x1="6" y1="86" x2="90" y2="86" stroke="var(--muted)" stroke-width="1.5"/>' +
        '<polyline points="' + pts + '" fill="none" stroke="var(--fail)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>' +
        '<p class="hint">Sideways deflection over the height at the moment of buckling, from the bed (bottom) to the top layer. Only the shape is known; the size is not.</p>';
    }
    $("kv").innerHTML = [
      ["Wall growth", fmt(r.ldot * 1000, 3) + " mm/s"],
      ["Length scale L₀", fmt(r.L0 * 1000, 1) + " mm"],
      ["Curing rate Ē", fmt(r.Ebar, 3)],
      ["Strength ratio α", fmt(r.abar, 3)],
      ["Wall width b / L₀", r.bbar === null ? "free" : fmt(r.bbar, 2)]
    ].map(function (a) { return "<dt>" + a[0] + "</dt><dd>" + a[1] + "</dd>"; }).join("");

    var notes = r.warnings.map(function (w) { return '<div class="callout">' + esc(w) + "</div>"; });
    if (state.presetNote) notes.push('<div class="callout ref">' + esc(state.presetNote) + "</div>");
    $("notes").innerHTML = notes.join("");
    $("notes").style.display = notes.length ? "" : "none";
  }

  // ================================================================ timeline
  function renderTimeline() {
    var g = geo, rail = $("rail"), pre = state.preset, pc = function (n) { return (100 * n / g.scale) + "%"; };
    rail.style.setProperty("--n", g.scale);
    var zone = $("zone");
    if (g.fail === null) zone.style.display = "none";
    else { zone.style.display = ""; zone.style.left = pc(g.fail); }
    var bd = $("band"), showBand = band && g.fail !== null && !(band.lo === band.hi && band.lo === g.fail);
    if (showBand) {
      var lo = band.lo === null ? g.scale : Math.min(band.lo, g.scale), hi = band.hi === null ? g.scale : Math.min(band.hi, g.scale);
      bd.style.display = ""; bd.style.left = pc(Math.min(lo, hi)); bd.style.width = pc(Math.abs(hi - lo));
    } else bd.style.display = "none";
    var marks = "", taken = {};
    if (pre) {
      pre.observed.forEach(function (n) { marks += '<span class="mk" style="left:' + pc(n) + '" title="A printed wall failed at layer ' + n + '"></span>'; taken[n] = 1; });
      if (pre.paper && !taken[pre.paper]) marks += '<span class="mk paper" style="left:' + pc(pre.paper) + '" title="Model value in the paper: layer ' + pre.paper + '"></span>';
    }
    $("marks").innerHTML = marks;
    var t = "", every = g.scale > 60 ? 10 : 5;
    for (var i = 0; i <= g.scale - 1; i += every) {
      if (g.fail !== null && Math.abs(g.fail - i) < every * 0.6 && i !== g.fail) continue;
      t += '<span style="left:' + pc(i) + '">' + i + "</span>";
    }
    if (g.fail !== null) t += '<span class="f" style="left:' + pc(g.fail) + '">' + g.fail + "</span>";
    $("ticks").innerHTML = t;
    var lg = [];
    lg.push('<span><i class="k-pred"></i>Sapling: <b>' + (g.fail === null ? "no failure" : "layer " + g.fail) + "</b></span>");
    if (showBand) lg.push('<span><i class="k-band"></i>Material ±10%: <b>' + (band.lo === null ? "no failure" : band.lo) + " to " + (band.hi === null ? "no failure" : band.hi) + "</b></span>");
    if (pre && pre.paper) lg.push('<span><i class="k-paper"></i>Model in the paper: <b>' + pre.paper + "</b></span>");
    if (pre && pre.observed.length) lg.push('<span><i class="k-obs"></i>Printed walls: <b>' + pre.observed.join(", ") + "</b></span>");
    if (pre && pre.layers) lg.push("<span>Printed for real: <b>" + pre.layers + " layers, no failure</b></span>");
    $("legend").innerHTML = lg.join("");
  }

  function renderStep() {
    var g = geo; if (!g) return;
    var failed = g.fail !== null && step >= g.fail;
    var printed = failed ? g.fail : Math.min(step, g.layers);
    var done = g.fail === null && step >= g.layers;
    var pct = 100 * step / g.scale;
    $("fill").style.width = pct + "%"; $("fill").className = "fill" + (failed ? " failed" : "");
    $("head").style.left = pct + "%";
    $("track").setAttribute("aria-valuenow", (step / g.total).toFixed(3));
    $("track").setAttribute("aria-valuetext", "Layer " + Math.ceil(printed) + " of " + g.layers);
    var live = $("live");
    live.dataset.state = failed ? "fail" : (done ? "done" : "print");
    $("liveState").textContent = failed ? (g.mode === "elastic buckling" ? "Elastic buckling at layer " : "Plastic collapse at layer ") + g.fail
      : (done ? "Finished " + g.layers + " layers, no failure predicted" : "Printing layer " + Math.min(g.layers, Math.floor(printed) + 1));
    $("liveLayer").textContent = failed ? g.fail : Math.min(g.layers, Math.floor(printed) + (done ? 0 : 1));
    $("liveH").innerHTML = fmt(printed * g.tl, 0) + "<small> mm</small>";
    $("liveT").textContent = clock(printed * state.Tl);
    var meter = $("meter");
    if (result.H === null) { meter.style.display = "none"; }
    else {
      meter.style.display = "";
      var share = Math.min(1, printed * g.tl / (result.H * 1000));
      if (failed) share = 1;
      $("meterFill").style.width = (100 * share) + "%";
      $("meterPct").textContent = Math.round(100 * share) + "%";
      meter.dataset.level = share >= 1 ? "fail" : (share > 0.85 ? "warn" : "ok");
    }
    $("clock").textContent = "Layer " + ($("liveLayer").textContent) + " / " + g.layers + " · " + clock(printed * state.Tl);
    if (scene3d) scene3d.setStep(step);
  }

  function setPlaying(on) {
    playing = on;
    $("playIcon").innerHTML = on ? '<path d="M2.5 1.5h3v11h-3zM8.5 1.5h3v11h-3z"/>' : '<path d="M3 1.5v11l9-5.5z"/>';
    $("play").setAttribute("aria-label", on ? "Pause" : "Play");
    if (on) { lastT = 0; requestAnimationFrame(tick); }
  }
  function tick(t) {
    if (!playing) return;
    if (lastT) {
      var dt = Math.min(0.1, (t - lastT) / 1000);
      var rate = 1.4 * speed;
      if (geo.fail !== null && step >= geo.fail) rate = Math.min(rate, 1.4);    // the failure always plays at 1x
      step = Math.min(geo.total, step + dt * rate);
      atEnd = step >= geo.total;
      renderStep();
      if (atEnd) { setPlaying(false); return; }
    }
    lastT = t; requestAnimationFrame(tick);
  }

  // ================================================================ 3D scene
  var scene3d = null;

  function makeScene(canvas) {
    var T = window.THREE;
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.LinearToneMapping;
    renderer.toneMappingExposure = 0.8;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;

    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(32, 1, 20, 40000);
    function C(hex) { return new T.Color(hex).convertSRGBToLinear(); }

    // ---- soft studio light for the metal parts
    (function () {
      var env = new T.Scene(), g = new T.BoxGeometry(1, 1, 1);
      var room = new T.Mesh(g, new T.MeshBasicMaterial({ color: C("#6b716d"), side: T.BackSide })); room.scale.set(40, 30, 40); env.add(room);
      [[0, 14.5, 0, 26, 0.4, 26, "#e4e6e4"], [-19.5, 4, 0, 0.4, 14, 22, "#b9c1c8"], [19.5, 4, 6, 0.4, 10, 12, "#cfc6b6"], [0, 3, -19.5, 22, 9, 0.4, "#d2d4d2"]]
        .forEach(function (p) { var m = new T.Mesh(g, new T.MeshBasicMaterial({ color: C(p[6]) })); m.position.set(p[0], p[1], p[2]); m.scale.set(p[3], p[4], p[5]); env.add(m); });
      var floor = new T.Mesh(g, new T.MeshBasicMaterial({ color: C("#4c524e") })); floor.position.y = -14.5; floor.scale.set(40, 0.4, 40); env.add(floor);
      var pm = new T.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(env, 0.03).texture;
      pm.dispose();
    })();

    var hemi = new T.HemisphereLight(0xffffff, 0x8a8f8b, 0.35); scene.add(hemi);
    var sun = new T.DirectionalLight(0xffffff, 1.25);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 3.5; sun.shadow.radius = 4;
    scene.add(sun); scene.add(sun.target);

    // ---- materials
    function std(hex, metal, rough, extra) {
      var o = { color: C(hex), metalness: metal, roughness: rough };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      return new T.MeshStandardMaterial(o);
    }
    var M = {
      alu: std("#c6cbce", 0.9, 0.36), anod: std("#2b3034", 0.7, 0.45), steel: std("#a9b0b5", 1.0, 0.22),
      stainless: std("#d9dcde", 1.0, 0.27), black: std("#16181a", 0.05, 0.62), rubber: std("#22262a", 0.0, 0.85),
      orange: std("#e2701f", 0.25, 0.48), base: std("#454c52", 0.55, 0.55), paint: std("#d3d7d2", 0.1, 0.55),
      blue: std("#35607f", 0.35, 0.5), wood: std("#bfa57c", 0, 0.85), bag: std("#d8d0bd", 0, 0.9), hazard: std("#e3ad12", 0, 0.8),
      green: std("#2c7a4d", 0.15, 0.5), red: std("#c5281c", 0.1, 0.45), yellow: std("#e8b414", 0.1, 0.5),
      screen: new T.MeshStandardMaterial({ color: C("#0c1512"), emissive: C("#3fd08a"), emissiveIntensity: 0.55, roughness: 0.3, metalness: 0 })
    };
    function gridTexture(bg, line, cells, px) {
      var c = document.createElement("canvas"); c.width = c.height = px;
      var x = c.getContext("2d"); x.fillStyle = bg; x.fillRect(0, 0, px, px);
      x.strokeStyle = line; x.lineWidth = Math.max(1, px / 256);
      for (var i = 0; i <= cells; i++) { var p = Math.round(i * px / cells) + 0.5; x.beginPath(); x.moveTo(p, 0); x.lineTo(p, px); x.moveTo(0, p); x.lineTo(px, p); x.stroke(); }
      var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.encoding = T.sRGBEncoding; t.anisotropy = 8; return t;
    }
    var boardMat = new T.MeshStandardMaterial({ map: gridTexture("#cdb78e", "#b8a076", 2, 256), metalness: 0, roughness: 0.82 });
    var floorMat = new T.MeshStandardMaterial({ color: 0xffffff, metalness: 0, roughness: 0.95, envMapIntensity: 0.5 });
    var floorTex = { light: gridTexture("#cdd2cc", "#bfc5be", 1, 256), dark: gridTexture("#1c211e", "#262d28", 1, 256) };

    // ---- the concrete
    var wallU = { uStep: { value: 0 }, uFail: { value: 0 }, uFresh: { value: C("#6f7570") }, uCured: { value: C("#aeb2ab") }, uFailCol: { value: C("#a93220") } };
    var wallMat = new T.MeshStandardMaterial({ color: 0xffffff, metalness: 0, roughness: 0.93, side: T.DoubleSide, shadowSide: T.BackSide });
    wallMat.onBeforeCompile = function (sh) {
      Object.keys(wallU).forEach(function (k) { sh.uniforms[k] = wallU[k]; });
      sh.vertexShader = "attribute float aT;\nvarying float vT;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvT = aT;");
      sh.fragmentShader = "uniform float uStep;\nuniform float uFail;\nuniform vec3 uFresh;\nuniform vec3 uCured;\nuniform vec3 uFailCol;\nvarying float vT;\n" +
        sh.fragmentShader.replace("#include <color_fragment>",
          "#include <color_fragment>\nfloat age = clamp((uStep - vT) / 7.0, 0.0, 1.0);\ndiffuseColor.rgb = mix(uFresh, uCured, age);\ndiffuseColor.rgb = mix(diffuseColor.rgb, uFailCol, uFail);");
    };

    // ---- small builders
    var world = new T.Group(); scene.add(world);
    var beadMat = std("#6f7570", 0, 0.9);
    var bead = new T.Mesh(new T.BoxGeometry(1, 1, 1), beadMat); bead.visible = false; world.add(bead);
    var printer = null, wall = null;
    function shadow(m, cast, recv) { m.castShadow = cast !== false; m.receiveShadow = recv !== false; return m; }
    function box(parent, w, h, d, mat, x, y, z) { var m = shadow(new T.Mesh(new T.BoxGeometry(w, h, d), mat)); m.position.set(x, y, z); parent.add(m); return m; }
    function cyl(parent, r1, r2, len, mat, x, y, z, axis, seg) {
      var m = shadow(new T.Mesh(new T.CylinderGeometry(r1, r2, len, seg || 28), mat)); m.position.set(x, y, z);
      if (axis === "x") m.rotation.z = Math.PI / 2; if (axis === "z") m.rotation.x = Math.PI / 2;
      parent.add(m); return m;
    }
    // steel member between two points
    function strut(parent, ax, ay, az, bx, by, bz, size, mat) {
      var a = new T.Vector3(ax, ay, az), b = new T.Vector3(bx, by, bz), d = b.clone().sub(a), len = d.length();
      var m = shadow(new T.Mesh(new T.BoxGeometry(size, size, len), mat));
      m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), d.normalize());
      parent.add(m); return m;
    }
    // servo drive with gearbox
    function servo(parent, x, y, z, axis) {
      var g = new T.Group(); g.position.set(x, y, z);
      box(g, 96, 96, 70, M.alu, 0, 0, 0); cyl(g, 44, 44, 150, M.black, 0, 0, 110, "z", 24); cyl(g, 46, 46, 14, M.orange, 0, 0, 190, "z", 24);
      box(g, 40, 30, 50, M.black, 0, 52, 120);
      if (axis === "x") g.rotation.y = Math.PI / 2; if (axis === "-x") g.rotation.y = -Math.PI / 2;
      if (axis === "y") g.rotation.x = -Math.PI / 2; if (axis === "-z") g.rotation.y = Math.PI;
      parent.add(g); return g;
    }
    // box that tapers from a top rectangle to a bottom rectangle (the nozzle)
    function frustumGeometry(a1, b1, a0, b0, y1, y0) {
      var v = [[-a1, y1, -b1], [a1, y1, -b1], [a1, y1, b1], [-a1, y1, b1], [-a0, y0, -b0], [a0, y0, -b0], [a0, y0, b0], [-a0, y0, b0]].map(function (p) { return [p[0] / 2, p[1], p[2] / 2]; });
      var faces = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [3, 2, 1, 0], [4, 5, 6, 7]], pos = [];
      faces.forEach(function (f) { [f[0], f[1], f[2], f[0], f[2], f[3]].forEach(function (i) { pos.push(v[i][0], v[i][1], v[i][2]); }); });
      var g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
    }
    function tube(points, radius, mat, seg) {
      var curve = new T.CatmullRomCurve3(points, false, "centripetal");
      return shadow(new T.Mesh(new T.TubeGeometry(curve, seg || 48, radius, 10, false), mat));
    }
    function dispose(obj) { obj.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); if (obj.parent) obj.parent.remove(obj); }

    // ================================================== the printer
    // A gantry concrete printer: a portal on floor rails carries a truss bridge,
    // a trolley on the bridge carries a vertical mast, and the mast carries a
    // turning nozzle fed by a hose from a mixer-pump.
    var FLOOR = -60, TH = 260, TW = 180, ZAX = TW / 2 + 150, HEAD = 300;
    function frameHeight(maxWall) { return Math.max(1150, Math.ceil((maxWall + 650) / 50) * 50); }
    function buildPrinter(W, D, maxWall) {
      var X0 = W / 2 + 520, Hr = frameHeight(maxWall), zmin = -D / 2 - ZAX - 560, zmax = D / 2 - ZAX + 560, zc = (zmin + zmax) / 2, RL = zmax - zmin + 300;
      var g = new T.Group(), k, sx, sz;
      var out = { group: g, X0: X0, Hr: Hr, zmin: zmin, zmax: zmax };

      // floor, with the safety line around the cell
      var fl = new T.Mesh(new T.CircleGeometry(11000, 72), floorMat); fl.rotation.x = -Math.PI / 2; fl.position.y = FLOOR; fl.receiveShadow = true; g.add(fl);
      var hx = X0 + 430, hz0 = zmin - 330, hz1 = zmax + 330;
      [[0, hz0, 2 * hx + 60, 60], [0, hz1, 2 * hx + 60, 60], [-hx, (hz0 + hz1) / 2, 60, hz1 - hz0], [hx, (hz0 + hz1) / 2, 60, hz1 - hz0]].forEach(function (q) {
        var m = new T.Mesh(new T.BoxGeometry(q[2], 1.2, q[3]), M.hazard); m.position.set(q[0], FLOOR + 0.7, q[1]); m.receiveShadow = true; g.add(m);
      });

      // print board on battens
      var bw = W + 560, bd = D + 560;
      box(g, bw, 36, bd, boardMat, 0, -18, 0); boardMat.map.repeat.set(bw / 200, bd / 200);
      [-1, 0, 1].forEach(function (a) { box(g, bw - 40, 24, 90, M.wood, 0, -48, a * (bd / 2 - 70)); });

      // floor rails
      for (sx = -1; sx <= 1; sx += 2) {
        box(g, 80, 42, RL, M.steel, sx * X0, FLOOR + 21, zc); box(g, 44, 18, RL, M.steel, sx * X0, FLOOR + 51, zc);
        box(g, 16, 22, RL - 80, M.black, sx * (X0 - 62), FLOOR + 32, zc);                               // rack
        for (k = zmin - 100; k <= zmax + 100; k += 420) { box(g, 230, 8, 150, M.anod, sx * X0, FLOOR + 4, k); cyl(g, 9, 9, 10, M.steel, sx * X0 + 90, FLOOR + 12, k, "y", 6); cyl(g, 9, 9, 10, M.steel, sx * X0 - 90, FLOOR + 12, k, "y", 6); }
        [zmin - 130, zmax + 130].forEach(function (ze, i) { box(g, 120, 170, 70, M.yellow, sx * X0, FLOOR + 85, ze); cyl(g, 34, 34, 36, M.rubber, sx * X0, FLOOR + 125, ze + (i ? -52 : 52), "z", 20); });
      }

      // ---- portal: runs on the rails
      var bridge = new T.Group(); g.add(bridge); out.bridge = bridge;
      for (sx = -1; sx <= 1; sx += 2) {
        [-270, 270].forEach(function (wz) { cyl(bridge, 70, 70, 56, M.steel, sx * X0, 70, wz, "x", 28); cyl(bridge, 30, 30, 64, M.anod, sx * X0, 70, wz, "x", 16); });
        box(bridge, 200, 150, 800, M.blue, sx * X0, 140, 0);
        box(bridge, 16, 190, 760, M.blue, sx * (X0 + 108), 120, 0); box(bridge, 16, 190, 760, M.blue, sx * (X0 - 108), 120, 0);
        servo(bridge, sx * (X0 + 60), 150, 250, sx > 0 ? "x" : "-x");
        box(bridge, 150, Hr - 215, 150, M.blue, sx * X0, (Hr + 215) / 2, 0);                               // column
        strut(bridge, sx * X0, 215, 350, sx * X0, Hr - 140, 50, 80, M.blue); strut(bridge, sx * X0, 215, -350, sx * X0, Hr - 140, -50, 80, M.blue);
        box(bridge, 230, 30, 300, M.anod, sx * X0, Hr - 15, 0);
        box(bridge, 20, TH + 30, TW + 90, M.anod, sx * (X0 + 160), Hr + TH / 2, 0);
      }
      // truss bridge
      var n = Math.max(4, 2 * Math.round(X0 / 300)), dxn = 2 * X0 / n;
      for (sz = -1; sz <= 1; sz += 2) {
        var zt = sz * TW / 2;
        box(bridge, 2 * X0 + 300, 70, 70, M.blue, 0, Hr + 35, zt); box(bridge, 2 * X0 + 300, 70, 70, M.blue, 0, Hr + TH - 35, zt);
        for (k = 0; k <= n; k++) {
          var xn = -X0 + k * dxn;
          strut(bridge, xn, Hr + 70, zt, xn, Hr + TH - 70, zt, 46, M.blue);
          if (k < n) { if (k % 2) strut(bridge, xn, Hr + TH - 70, zt, xn + dxn, Hr + 70, zt, 40, M.blue); else strut(bridge, xn, Hr + 70, zt, xn + dxn, Hr + TH - 70, zt, 40, M.blue); }
        }
        box(bridge, 2 * X0 + 220, 14, 26, M.steel, 0, Hr + TH + 7, zt);                                   // trolley rails
      }
      for (k = 0; k <= n; k++) { box(bridge, 46, 46, TW - 70, M.blue, -X0 + k * dxn, Hr + 35, 0); box(bridge, 46, 46, TW - 70, M.blue, -X0 + k * dxn, Hr + TH - 35, 0); }
      box(bridge, 2 * X0 + 200, 16, 12, M.black, 0, Hr + TH - 12, TW / 2 + 41);                           // rack for the trolley
      // signal light on the left leg
      cyl(bridge, 10, 10, 150, M.steel, -X0, Hr + TH + 90, -110, "y", 10);
      [["#c5281c", 0], ["#e8a614", 1], ["#2c9a55", 2]].forEach(function (c) {
        cyl(bridge, 24, 24, 34, new T.MeshStandardMaterial({ color: C(c[0]), emissive: C(c[0]), emissiveIntensity: c[1] === 2 ? 0.9 : 0.12, roughness: 0.4 }), -X0, Hr + TH + 240 - c[1] * 36, -110, "y", 18).castShadow = false;
      });

      // ---- trolley: runs along the bridge
      var car = new T.Group(); bridge.add(car); out.carriage = car;
      box(car, 280, 24, TW + 100, M.orange, 0, Hr + TH + 40, 0);
      [[-95, 1], [95, 1], [-95, -1], [95, -1]].forEach(function (q) { box(car, 80, 26, 56, M.steel, q[0], Hr + TH + 27, q[1] * TW / 2); });
      box(car, 280, TH + 100, 18, M.orange, 0, Hr + TH / 2, TW / 2 + 52);
      box(car, 200, TH + 40, 160, M.anod, 0, Hr + TH / 2, ZAX);                                           // guide of the mast
      box(car, 214, 26, 174, M.orange, 0, Hr + TH + 8, ZAX); box(car, 214, 26, 174, M.orange, 0, Hr - 8, ZAX);
      [-1, 1].forEach(function (s) { cyl(car, 20, 20, 36, M.steel, s * 78, Hr + TH + 34, ZAX + 62, "x", 16); cyl(car, 20, 20, 36, M.steel, s * 78, Hr - 34, ZAX + 62, "x", 16); });
      servo(car, 0, Hr + TH + 100, -30, "-z"); servo(car, 100, Hr + TH / 2, ZAX, "x");

      // ---- mast and print head: move up with the wall
      var mast = new T.Group(); car.add(mast); out.mast = mast;
      var Lz = Hr + TH + 160 - HEAD; out.Lz = Lz; out.topY = HEAD + Lz + maxWall + 150;
      box(mast, 100, Lz, 100, M.anod, 0, HEAD + Lz / 2, ZAX); box(mast, 14, Lz - 80, 22, M.steel, 57, HEAD + Lz / 2, ZAX);
      box(mast, 110, 12, 110, M.black, 0, HEAD + Lz + 6, ZAX);
      // hose down the back of the mast into the head
      var zb = ZAX - 80;
      mast.add(tube([new T.Vector3(0, HEAD + Lz - 70, zb), new T.Vector3(0, HEAD + Lz * 0.6, zb), new T.Vector3(0, HEAD + 120, zb), new T.Vector3(0, HEAD + 10, zb + 8),
        new T.Vector3(0, HEAD - 70, zb + 40), new T.Vector3(0, HEAD - 104, ZAX - 2), new T.Vector3(0, HEAD - 130, ZAX)], 26, M.rubber, 60));
      for (k = 0; k < 4; k++) box(mast, 76, 26, 34, M.black, 0, HEAD + 110 + k * (Lz - 220) / 3, zb + 14);
      box(mast, 160, 14, 160, M.anod, 0, HEAD - 7, ZAX);
      cyl(mast, 62, 62, 56, M.black, 0, HEAD - 42, ZAX, "y", 32); cyl(mast, 68, 68, 8, M.orange, 0, HEAD - 74, ZAX, "y", 32);     // turning unit
      var headRot = new T.Group(); headRot.position.set(0, 0, ZAX); mast.add(headRot); out.headRot = headRot;
      cyl(headRot, 36, 36, 96, M.stainless, 0, HEAD - 126, 0, "y", 28); cyl(headRot, 44, 44, 10, M.anod, 0, HEAD - 176, 0, "y", 28);
      box(headRot, 30, 40, 60, M.black, 52, HEAD - 130, 0);
      out.nozzle = shadow(new T.Mesh(new T.BufferGeometry(), std("#d9dcde", 1.0, 0.27, { side: T.DoubleSide }))); headRot.add(out.nozzle);
      out.lip = shadow(new T.Mesh(new T.BoxGeometry(1, 1, 1), M.rubber)); headRot.add(out.lip);

      // ---- hose boom behind the cell
      var Hb = Hr + TH + 520, pz = zmin - 430, S0 = new T.Vector3(0, Hb - 70, -D / 2 - 430); out.S0 = S0;
      box(g, 320, 14, 320, M.anod, 0, FLOOR + 7, pz); box(g, 120, Hb - FLOOR, 120, M.blue, 0, (Hb + FLOOR) / 2, pz);
      box(g, 90, 90, S0.z - pz + 120, M.blue, 0, Hb, (S0.z + pz) / 2 + 30);
      strut(g, 0, Hb - 320, pz, 0, Hb - 30, pz + 330, 60, M.blue);
      var ring = shadow(new T.Mesh(new T.TorusGeometry(38, 8, 10, 28), M.orange)); ring.rotation.x = Math.PI / 2; ring.position.copy(S0); g.add(ring);
      box(g, 16, 60, 16, M.steel, 0, Hb - 40, S0.z);

      // ---- mixer-pump and mortar bags
      var pump = new T.Group(); pump.position.set(640, FLOOR, pz - 60); pump.rotation.y = Math.PI; g.add(pump);
      box(pump, 620, 300, 380, M.paint, 0, 250, 0); box(pump, 624, 26, 384, M.orange, 0, 180, 0); box(pump, 660, 40, 420, M.base, 0, 80, 0);
      [[-240, -210], [240, -210], [-240, 210], [240, 210]].forEach(function (w) { cyl(pump, 60, 60, 44, M.rubber, w[0], 60, w[1], "z", 28); cyl(pump, 26, 26, 48, M.steel, w[0], 60, w[1], "z", 16); });
      var hop = shadow(new T.Mesh(new T.CylinderGeometry(230, 110, 230, 40, 1, true), std("#d9dcde", 1.0, 0.3, { side: T.DoubleSide }))); hop.position.set(-110, 515, 0); pump.add(hop);
      var tor = shadow(new T.Mesh(new T.TorusGeometry(230, 9, 10, 48), M.stainless)); tor.rotation.x = Math.PI / 2; tor.position.set(-110, 630, 0); pump.add(tor);
      var mixc = new T.Mesh(new T.CircleGeometry(196, 40), std("#7b807b", 0, 0.95)); mixc.rotation.x = -Math.PI / 2; mixc.position.set(-110, 585, 0); pump.add(mixc);
      for (k = -2; k <= 2; k++) { box(pump, 8, 8, 2 * Math.sqrt(230 * 230 - 80 * 80 * k * k) - 10, M.steel, -110 + 80 * k, 632, 0); }
      box(pump, 150, 190, 230, M.anod, 215, 495, 0); box(pump, 4, 70, 110, M.screen, 291, 520, 0).castShadow = false;
      cyl(pump, 70, 70, 220, M.base, 150, 250, -235, "x", 28); cyl(pump, 42, 42, 90, M.stainless, 345, 170, 0, "x", 24);
      strut(pump, 60, 380, 120, 300, 300, 120, 90, M.stainless);                                           // mixing tube
      box(pump, 30, 170, 30, M.steel, -330, 470, 150); box(pump, 30, 170, 30, M.steel, -330, 470, -150); cyl(pump, 13, 13, 330, M.steel, -330, 560, 0, "z", 14);
      pump.updateMatrixWorld(true);
      var outlet = new T.Vector3(390, 170, 0).applyMatrix4(pump.matrixWorld);
      g.add(tube([outlet, new T.Vector3(outlet.x - 150, FLOOR + 70, outlet.z + 20), new T.Vector3(outlet.x - 200, FLOOR + 30, outlet.z + 190),
        new T.Vector3(110, FLOOR + 30, pz + 150), new T.Vector3(72, FLOOR + 150, pz + 74), new T.Vector3(70, Hb * 0.5, pz + 70), new T.Vector3(66, Hb - 150, pz + 72),
        new T.Vector3(30, Hb - 78, pz + 170), new T.Vector3(0, Hb - 70, (pz + S0.z) / 2), S0.clone()], 26, M.rubber, 130));
      [0.3, 0.6].forEach(function (f) { box(g, 60, 26, 60, M.black, 80, FLOOR + (Hb - FLOOR) * f, pz + 62); });
      box(g, 60, 26, 40, M.black, 0, Hb - 58, (pz + S0.z) / 2);
      var pal = new T.Group(); pal.position.set(1500, FLOOR, pz - 40); pal.rotation.y = 0.2; g.add(pal);
      box(pal, 800, 22, 600, M.wood, 0, 133, 0); [-1, 0, 1].forEach(function (a) { box(pal, 800, 100, 90, M.wood, 0, 72, a * 250); }); box(pal, 800, 22, 600, M.wood, 0, 11, 0);
      for (k = 0; k < 4; k++) [[-195, -140], [195, -140], [-195, 140], [195, 140]].forEach(function (q, i) {
        if (k === 3 && i > 1) return;
        var b = box(pal, 370, 96, 262, M.bag, q[0] + (k % 2 ? 8 : -8), 196 + k * 100, q[1]); b.rotation.y = (k % 2 ? 0.03 : -0.03);
      });

      // ---- control cabinet at the front left
      var cab = new T.Group(); cab.position.set(-X0 - 620, FLOOR, zmax - 150); cab.rotation.y = Math.PI / 2 - 0.25; g.add(cab);
      box(cab, 300, 1150, 560, M.paint, 0, 615, 0); box(cab, 320, 40, 580, M.base, 0, 20, 0); box(cab, 4, 1080, 500, M.paint, -152, 615, 0);
      box(cab, 3, 190, 280, M.screen, -155, 940, 0).castShadow = false; box(cab, 3, 10, 280, M.orange, -155, 810, 0);
      cyl(cab, 34, 34, 6, M.yellow, -155, 690, -150, "x", 24); cyl(cab, 22, 26, 22, M.red, -168, 690, -150, "x", 24);
      cyl(cab, 12, 12, 10, M.green, -157, 690, -30, "x", 16); cyl(cab, 12, 12, 10, M.black, -157, 690, 30, "x", 16); cyl(cab, 26, 26, 12, M.black, -157, 690, 150, "x", 20);
      box(cab, 6, 60, 12, M.black, -156, 500, 220);

      // ---- cable chain on the floor beside the left rail
      var CH = { r: 62, pitch: 34, x: -X0 - 210, y0: FLOOR + 12, zA: zmin - 40 };
      box(g, 90, 6, RL, M.anod, CH.x, FLOOR + 3, zc); box(g, 5, 40, RL, M.anod, CH.x - 46, FLOOR + 20, zc); box(g, 5, 40, RL, M.anod, CH.x + 46, FLOOR + 20, zc);
      CH.zMax = zmax; CH.len = Math.PI * CH.r + (CH.zMax - CH.zA) + 120; CH.n = Math.ceil(CH.len / CH.pitch);
      var links = new T.InstancedMesh(new T.BoxGeometry(70, 24, CH.pitch - 4), M.black, CH.n); links.castShadow = true; g.add(links);
      box(bridge, 110, 14, 70, M.anod, -X0 - 160, CH.y0 + 2 * CH.r + 30, 0);

      var dummy = new T.Object3D(), nozzleFor = -1;
      out.hose = null;
      out.update = function (tip, wallh, yaw) {
        bridge.position.z = tip.z - ZAX; car.position.x = tip.x; mast.position.y = tip.y; headRot.rotation.y = yaw;
        if (wallh !== nozzleFor) {                       // the nozzle opening is as wide as the layer
          nozzleFor = wallh; var ow = Math.max(24, wallh * 0.92);
          out.nozzle.geometry.dispose(); out.nozzle.geometry = frustumGeometry(84, 84, ow, 36, HEAD - 181, 16);
          out.lip.scale.set(ow + 8, 16, 44); out.lip.position.set(0, 8, 0);
        }
        var zB = Math.min(CH.zMax, Math.max(CH.zA + 20, bridge.position.z));
        var zL = (CH.len - Math.PI * CH.r + CH.zA + zB) / 2, a = zL - CH.zA;
        for (var i = 0; i < CH.n; i++) {
          var sA = i * CH.pitch + CH.pitch / 2;
          if (sA < a) { dummy.position.set(CH.x, CH.y0 + 12, CH.zA + sA); dummy.rotation.set(0, 0, 0); }
          else if (sA < a + Math.PI * CH.r) { var th = (sA - a) / CH.r; dummy.position.set(CH.x, CH.y0 + 12 + CH.r * (1 - Math.cos(th)), zL + CH.r * Math.sin(th)); dummy.rotation.set(-th, 0, 0); }
          else { dummy.position.set(CH.x, CH.y0 + 12 + 2 * CH.r, zL - (sA - a - Math.PI * CH.r)); dummy.rotation.set(Math.PI, 0, 0); }
          dummy.updateMatrix(); links.setMatrixAt(i, dummy.matrix);
        }
        links.instanceMatrix.needsUpdate = true;
        // hose: hangs from the boom and runs to the clamp at the top of the mast
        var E = new T.Vector3(tip.x, tip.y + HEAD + Lz - 70, tip.z - 80), dist = S0.distanceTo(E);
        var mid = S0.clone().lerp(E, 0.5); mid.y = Math.min(S0.y, E.y) - 150 - 0.3 * Math.max(0, 1100 - dist);
        var hp = [S0.clone(), new T.Vector3(S0.x + (E.x - S0.x) * 0.06, S0.y - 150, S0.z + 70), mid,
                  new T.Vector3(E.x - (E.x - S0.x) * 0.05, E.y + 210, E.z - 90), new T.Vector3(E.x, E.y + 90, E.z - 14), E];
        if (out.hose) { out.hose.geometry.dispose(); g.remove(out.hose); }
        out.hose = tube(hp, 26, M.rubber, 44); g.add(out.hose);
      };
      return out;
    }

    // ================================================== the print path
    function makePath(W, D, closed) {
      var pts = [], i, n;
      if (!closed) {
        n = 120;
        for (i = 0; i <= n; i++) pts.push({ x: -W / 2 + W * i / n, z: 0, nx: 0, nz: 1, fac: 1, vr: Math.sin(2 * Math.PI * i / (2 * n) + 0.9) });
        return { pts: pts, closed: false, rings: n + 1, segs: n };
      }
      var rc = Math.min(50, 0.14 * Math.min(W, D)), sx = W - 2 * rc, sz = D - 2 * rc, arc = Math.PI * rc / 2;
      var per = 2 * sx + 2 * sz + 4 * arc; n = Math.max(120, Math.min(320, Math.round(per / 9)));
      var longest = Math.max(W, D);
      // sides in order: front (+x), right (+z), back (-x), left (-z); each followed by its corner
      var sides = [{ l: sx, o: [-sx / 2, -D / 2], t: [1, 0], w: W }, { l: sz, o: [W / 2, -sz / 2], t: [0, 1], w: D },
                   { l: sx, o: [sx / 2, D / 2], t: [-1, 0], w: W }, { l: sz, o: [-W / 2, sz / 2], t: [0, -1], w: D }];
      function sideFac(k, u) { return (k % 2 ? -1 : 1) * Math.sin(Math.PI * u) * Math.pow(sides[k].w / longest, 2); }
      for (i = 0; i < n; i++) {
        var s = per * i / n, k = 0, p = null;
        while (k < 4) {
          var sd = sides[k];
          if (s <= sd.l) {
            p = { x: sd.o[0] + sd.t[0] * s, z: sd.o[1] + sd.t[1] * s, nx: sd.t[1], nz: -sd.t[0], fac: sideFac(k, (s + rc) / (sd.l + 2 * rc)) };
            break;
          }
          s -= sd.l;
          if (s <= arc) {
            var a = s / rc, ex = sd.o[0] + sd.t[0] * sd.l, ez = sd.o[1] + sd.t[1] * sd.l;
            var cx = ex - sd.t[1] * rc, cz = ez + sd.t[0] * rc;            // corner centre, towards the inside
            var ox = sd.t[1], oz = -sd.t[0];                               // outward normal at the start of the arc
            var nx = ox * Math.cos(a) + sd.t[0] * Math.sin(a), nz = oz * Math.cos(a) + sd.t[1] * Math.sin(a);
            // in a corner both neighbouring walls contribute, each along its own normal
            var nk = sides[(k + 1) % 4];
            p = { x: cx + nx * rc, z: cz + nz * rc, nx: nx, nz: nz,
                  fac: sideFac(k, (rc + sd.l + rc * Math.sin(a)) / (sd.l + 2 * rc)) * Math.cos(a) +
                       sideFac((k + 1) % 4, (rc - rc * Math.cos(a)) / (nk.l + 2 * rc)) * Math.sin(a) };
            break;
          }
          s -= arc; k++;
        }
        if (!p) p = { x: -sx / 2, z: -D / 2, nx: 0, nz: -1, fac: 0 };
        p.vr = Math.sin(2 * Math.PI * i / n + 0.9);
        pts.push(p);
      }
      return { pts: pts, closed: true, rings: n, segs: n };
    }

    // ================================================== the deformed shape
    function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
    function interp(a, t) { var x = t * (a.length - 1), i = Math.min(a.length - 2, Math.floor(x)); return a[i] + (a[i + 1] - a[i]) * (x - i); }
    function makeDeform(mode, amount, h, tl, height, shape) {
      var e = smooth(amount), buckle = mode === "elastic buckling" ? e : 0, crush = mode === "plastic collapse" ? e : 0;
      var N = 40, Sv = [], dS = [], I = [0], k;
      for (k = 0; k <= N; k++) Sv.push(shape ? interp(shape, k / N) : (k / N) * (k / N));
      for (k = 0; k <= N; k++) { var a = Math.min(N, k + 1), b = Math.max(0, k - 1); dS.push((Sv[a] - Sv[b]) * N / (a - b)); }
      for (k = 0; k < N; k++) I.push(I[k] + 0.25 * (dS[k] * dS[k] + dS[k + 1] * dS[k + 1]) / N);
      height = Math.max(height, 1e-6);
      // o: sideways position inside the wall section; returns [offset along the normal, height]
      return function (o, z, fac, vr) {
        var off = 0, t;
        if (crush) {
          var zone = Math.max(3 * tl, 0.2 * height), drop = 0.5 * crush * (1 + 0.3 * vr);
          t = Math.min(1, z / zone);
          o *= 1 + 1.5 * crush * (1 + 0.3 * vr) * Math.pow(1 - t, 1.5) * (0.35 + 0.65 * Math.min(1, 4 * t));
          if (z < zone) z = zone * t * (1 - drop * (1.3 - 0.3 * t));
          else { off = 0.07 * crush * vr * (z - zone); z = z - drop * zone; }
        }
        if (buckle) {
          var am = 1.5 * h * buckle * fac; t = Math.max(0, Math.min(1, z / height));
          off = am * interp(Sv, t);
          z = Math.max(0, z - am * am * interp(I, t) / height - o * am * interp(dS, t) / height);
        }
        return [o + off, z];
      };
    }

    // ================================================== the wall
    var PR = 10;                                          // points around one filament
    function buildWall(g) {
      var path = makePath(g.W, g.D, g.closed), R = path.rings, NS = path.segs, NL = g.layers;
      var nv = NL * R * PR, pos = new Float32Array(nv * 3), aT = new Float32Array(nv), idx = new Uint32Array(NL * NS * PR * 6);
      var hw = g.h / 2, ro = Math.min(g.tl * 0.3, hw * 0.4), rz = g.tl / 2, prof = [], k, a;   // shallow grooves between the layers
      for (k = 0; k < 5; k++) { a = -Math.PI / 2 + k * Math.PI / 4; prof.push([hw - ro + ro * Math.cos(a), rz + rz * 0.96 * Math.sin(a)]); }
      for (k = 0; k < 5; k++) { a = Math.PI / 2 + k * Math.PI / 4; prof.push([-(hw - ro) + ro * Math.cos(a), rz + rz * 0.96 * Math.sin(a)]); }
      var L, i, w = 0;
      for (L = 0; L < NL; L++) {
        var rev = !g.closed && (L % 2 === 1);
        for (i = 0; i < R; i++) {
          var fr = g.closed ? i / R : (rev ? (NS - i) / NS : i / NS);
          for (k = 0; k < PR; k++) aT[(L * R + i) * PR + k] = L + 0.999 * fr;
        }
        for (var j = 0; j < NS; j++) {
          var seg = rev ? NS - 1 - j : j, r0 = L * R + seg, r1 = L * R + (g.closed ? (seg + 1) % R : seg + 1);
          for (k = 0; k < PR; k++) {
            var k2 = (k + 1) % PR, A = r0 * PR + k, B = r0 * PR + k2, Cc = r1 * PR + k, Dd = r1 * PR + k2;
            idx[w++] = A; idx[w++] = Cc; idx[w++] = B; idx[w++] = B; idx[w++] = Cc; idx[w++] = Dd;
          }
        }
      }
      // the triangles must face outwards; this depends on the direction of the path
      (function () {
        var p0 = path.pts[0], p1 = path.pts[1], ax = p1.x - p0.x, az = p1.z - p0.z;
        // edge A->C runs along the path, A->B up the outer face: normal = AC x AB = (0, 0, az|ax) x (0, 1, 0)
        var nxw = -az, nzw = ax;                                  // (ax,0,az) x (0,1,0) = (-az, 0, ax)
        if (nxw * p0.nx + nzw * p0.nz < 0) return;
        for (var q = 0; q < idx.length; q += 3) { var tmp = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = tmp; }
      })();
      var geom = new T.BufferGeometry();
      geom.setAttribute("position", new T.BufferAttribute(pos, 3));
      geom.setAttribute("aT", new T.BufferAttribute(aT, 1));
      geom.setIndex(new T.BufferAttribute(idx, 1));
      var mesh = shadow(new T.Mesh(geom, wallMat)); mesh.frustumCulled = false;
      var out = { mesh: mesh, path: path, amount: -1 };
      out.shape = function (amount) {
        if (amount === out.amount) return; out.amount = amount;
        var df = makeDeform(g.mode, amount, g.h, g.tl, NL * g.tl, g.shape), v = 0, pts = path.pts;
        for (L = 0; L < NL; L++) for (i = 0; i < R; i++) {
          var p = pts[i];
          for (k = 0; k < PR; k++) {
            var q = df(prof[k][0], L * g.tl + prof[k][1], g.mode === "plastic collapse" ? 0 : p.fac, p.vr);
            pos[v++] = p.x + p.nx * q[0]; pos[v++] = q[1]; pos[v++] = p.z + p.nz * q[0];
          }
        }
        geom.attributes.position.needsUpdate = true; geom.computeVertexNormals();
      };
      out.shape(0);
      out.reveal = function (full, part) { geom.setDrawRange(0, (full * NS + Math.round(part * NS)) * PR * 6); };
      out.tipAt = function (full, part) {
        var pts = path.pts, rev = !g.closed && (full % 2 === 1), n = pts.length, x = part * NS, p0, p1, f;
        if (g.closed) { var i0 = Math.floor(x) % n; p0 = pts[i0]; p1 = pts[(i0 + 1) % n]; f = x - Math.floor(x); }
        else { var xi = rev ? NS - x : x, i1 = Math.min(NS - 1, Math.max(0, Math.floor(xi))); p0 = pts[i1]; p1 = pts[i1 + 1]; f = xi - i1; }
        var tx = p1.x - p0.x, tz = p1.z - p0.z; out.yaw = Math.atan2(rev ? -tx : tx, rev ? -tz : tz);   // direction of travel
        return new T.Vector3(p0.x + (p1.x - p0.x) * f, (full + 1) * g.tl, p0.z + (p1.z - p0.z) * f);
      };
      return out;
    }

    // ================================================== camera
    var cam = { az: 0.66, el: 0.36, dist: 4000, tx: 0, ty: 300, tz: 0 }, camTo = null, dirty = true;
    // until someone takes the camera, the view turns slowly around the printer
    var touched = false, born = (window.performance && performance.now()) || 0;
    var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function applyCam() {
      var ce = Math.cos(cam.el);
      camera.position.set(cam.tx + cam.dist * ce * Math.sin(cam.az), cam.ty + cam.dist * Math.sin(cam.el), cam.tz + cam.dist * ce * Math.cos(cam.az));
      camera.lookAt(cam.tx, cam.ty, cam.tz); dirty = true;
    }
    var fitR = 1500, fitY = 400, fitZ = 0, wallFit = { r: 700, y: 120 };
    function viewPreset(name, instant) {
      var v = { iso: [0.66, 0.33], wall: [0.7, 0.42], front: [0, 0.12], side: [Math.PI / 2, 0.12], top: [0.0001, 1.5] }[name];
      var aspect = camera.aspect || 1.5, half = T.MathUtils.degToRad(camera.fov / 2);
      var close = name === "wall", d = (close ? wallFit.r : fitR) / Math.sin(Math.min(half, Math.atan(Math.tan(half) * aspect)));
      var to = { az: v[0], el: v[1], dist: d, tx: 0, ty: close ? wallFit.y : fitY, tz: close ? 0 : fitZ };
      if (instant) { Object.keys(to).forEach(function (k) { cam[k] = to[k]; }); applyCam(); return; }
      var da = to.az - cam.az; da = Math.atan2(Math.sin(da), Math.cos(da)); to.az = cam.az + da;
      camTo = { from: Object.assign({}, cam), to: to, t: 0 };
    }
    (function controls() {
      var ptrs = {}, last = null, pinch = 0;
      function unpress() { Array.prototype.forEach.call($("views").children, function (b) { b.setAttribute("aria-pressed", "false"); }); }
      canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      canvas.addEventListener("pointerdown", function () { touched = true; });
      canvas.addEventListener("wheel", function () { touched = true; }, { passive: true });
      canvas.addEventListener("pointerdown", function (e) { canvas.setPointerCapture(e.pointerId); ptrs[e.pointerId] = { x: e.clientX, y: e.clientY, b: e.button, sh: e.shiftKey }; last = null; pinch = 0; camTo = null; });
      canvas.addEventListener("pointermove", function (e) {
        var p = ptrs[e.pointerId]; if (!p) return;
        var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
        var ids = Object.keys(ptrs);
        if (ids.length === 2) {
          var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch) cam.dist = Math.max(600, Math.min(20000, cam.dist * pinch / d));
          pinch = d; pan(dx / 2, dy / 2);
        } else if (p.b === 2 || p.sh) pan(dx, dy);
        else { cam.az -= dx * 0.006; cam.el = Math.max(-0.05, Math.min(1.52, cam.el + dy * 0.005)); }
        unpress(); applyCam();
      });
      function up(e) { delete ptrs[e.pointerId]; pinch = 0; }
      canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
      canvas.addEventListener("wheel", function (e) { e.preventDefault(); camTo = null; cam.dist = Math.max(600, Math.min(20000, cam.dist * Math.exp(e.deltaY * 0.0011))); unpress(); applyCam(); }, { passive: false });
      function pan(dx, dy) {
        var k = cam.dist * 0.0011, sa = Math.sin(cam.az), ca = Math.cos(cam.az);
        cam.tx -= dx * k * ca; cam.tz += dx * k * sa; cam.ty = Math.max(-100, cam.ty + dy * k);
      }
    })();

    function resize() {
      var r = canvas.parentElement.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
      // render at twice the screen resolution where affordable: the layer lines are finer than a pixel from far away
      var pr = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
      pr = Math.min(pr, Math.sqrt(6.5e6 / (r.width * r.height)));
      renderer.setPixelRatio(Math.max(1, pr));
      renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); dirty = true;
    }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas.parentElement); else window.addEventListener("resize", resize);

    function theme() {
      var el = document.documentElement, t = el.getAttribute("data-theme");
      var dark = t ? t === "dark" : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
      var bg = C(dark ? "#171c19" : "#e3e7e1");
      scene.background = bg; scene.fog = new T.Fog(bg, 7000, 16000);
      floorMat.map = dark ? floorTex.dark : floorTex.light; floorMat.map.repeat.set(18, 18); floorMat.needsUpdate = true;
      sun.intensity = dark ? 0.9 : 1.1; hemi.intensity = dark ? 0.1 : 0.2; renderer.toneMappingExposure = dark ? 0.7 : 0.8;
      dirty = true;
    }
    theme();
    if (window.MutationObserver) new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    if (window.matchMedia) { var mq = window.matchMedia("(prefers-color-scheme: dark)"); if (mq.addEventListener) mq.addEventListener("change", theme); }

    // ================================================== api
    var cur = null, key = "";
    var api = {
      setPrint: function (g) {
        var maxWall = g.layers * g.tl, k = [g.W, g.D, frameHeight(maxWall)].join("|");
        if (k !== key) {
          if (printer) dispose(printer.group);
          printer = buildPrinter(g.W, g.D, maxWall); world.add(printer.group);
          var first = key === ""; key = k;
          var halfZ = (printer.zmax - printer.zmin) / 2; fitZ = (printer.zmin + printer.zmax) / 2 - 120;
          fitY = printer.Hr * 0.55; fitR = Math.hypot(printer.X0 + 330, halfZ + 420, printer.Hr * 0.95) * 0.86;
          wallFit = { r: Math.hypot(g.W / 2 + 260, g.D / 2 + 260, maxWall * 0.6 + 120), y: Math.min(maxWall, 420) * 0.5 };
          sun.position.set(-1900, printer.topY + 2600, 2500); sun.target.position.set(0, 200, fitZ);
          var sc = sun.shadow.camera, ext = Math.max(printer.X0, halfZ) + 1700;
          sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 200; sc.far = printer.topY + 6500; sc.updateProjectionMatrix();
          if (first) viewPreset("iso", true); else { cam.ty = fitY; applyCam(); }
        }
        if (wall) { wall.mesh.geometry.dispose(); world.remove(wall.mesh); }
        wall = buildWall(g); world.add(wall.mesh); cur = g; dirty = true;
      },
      setStep: function (s) {
        if (!cur || !wall) return;
        var g = cur, failed = g.fail !== null && s >= g.fail, amount = failed ? Math.min(1, (s - g.fail) / COLLAPSE) : 0;
        var full, part;
        if (failed) { full = g.fail; part = 0; } else { var c = Math.min(s, g.layers); full = Math.floor(c); part = c - full; if (full >= g.layers) { full = g.layers; part = 0; } }
        wall.shape(amount); wall.reveal(full, part);
        wallU.uStep.value = Math.min(s, g.layers); wallU.uFail.value = failed ? 0.25 + 0.55 * smooth(amount) : 0;
        var tip;
        if (failed) { tip = wall.tipAt(g.fail, 0); tip.y = g.fail * g.tl + 14 + 90 * smooth(Math.min(1, amount * 2.5)); }
        else if (full >= g.layers) { tip = wall.tipAt(g.layers, 0); tip.y = g.layers * g.tl + 100; }
        else tip = wall.tipAt(full, part);
        printer.update(tip, g.h, wall.yaw || 0);
        // fresh material leaving the nozzle
        bead.visible = !failed && full < g.layers && s > 0;
        if (bead.visible) { bead.scale.set(g.h * 0.9, g.tl + 2, 30); bead.position.set(tip.x, tip.y - g.tl / 2 + 1, tip.z); bead.rotation.y = wall.yaw || 0; }
        dirty = true;
      },
      view: function (name) { touched = true; viewPreset(name); },
      look: function (o) { camTo = null; Object.keys(o).forEach(function (k) { cam[k] = o[k]; }); applyCam(); }
    };

    resize();
    var prev = 0;
    (function loop(t) {
      requestAnimationFrame(loop);
      if (camTo) {
        camTo.t = Math.min(1, camTo.t + Math.min(0.05, (t - prev) / 1000) / 0.55); var e = smooth(camTo.t);
        Object.keys(camTo.to).forEach(function (k) { cam[k] = camTo.from[k] + (camTo.to[k] - camTo.from[k]) * e; });
        if (camTo.t >= 1) camTo = null; applyCam();
      }
      if (!touched && !calm && !camTo && t - born > 7000 && !document.hidden) { cam.az += Math.min(0.05, (t - prev) / 1000) * 0.07; applyCam(); }
      prev = t;
      if (dirty) { dirty = false; renderer.render(scene, camera); }
    })(0);
    return api;
  }

  // ================================================================ wiring
  buildFields("fieldsLayout", FIELDS.layout); buildFields("fieldsPrint", FIELDS.print); buildFields("fieldsMat", FIELDS.mat);
  var sel = $("preset");
  PRESETS.forEach(function (p, i) { var o = document.createElement("option"); o.value = i; o.textContent = p.name; sel.appendChild(o); });
  var oc = document.createElement("option"); oc.value = "custom"; oc.textContent = "Your own values"; sel.appendChild(oc);
  sel.addEventListener("change", function () { if (sel.value !== "custom") loadPreset(+sel.value); });

  $("layout").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; state.layout = b.dataset.v; changed(); });
  $("speed").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return; speed = +b.dataset.v;
    Array.prototype.forEach.call($("speed").children, function (x) { x.setAttribute("aria-pressed", String(x === b)); });
  });
  $("views").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b || !scene3d) return; scene3d.view(b.dataset.v);
    Array.prototype.forEach.call($("views").children, function (x) { x.setAttribute("aria-pressed", String(x === b)); });
  });
  $("play").addEventListener("click", function () {
    if (!geo) return;
    if (!playing && step >= geo.total - 1e-6) { step = 0; atEnd = false; renderStep(); }
    setPlaying(!playing);
  });
  $("restart").addEventListener("click", function () { setPlaying(false); step = 0; atEnd = false; renderStep(); });

  (function scrub() {
    var tr = $("track"), down = false;
    function at(e) { var r = tr.getBoundingClientRect(); step = Math.min(geo.total, geo.scale * Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))); atEnd = step >= geo.total - 1e-6; renderStep(); }
    tr.addEventListener("pointerdown", function (e) { if (!geo) return; down = true; tr.setPointerCapture(e.pointerId); setPlaying(false); at(e); });
    tr.addEventListener("pointermove", function (e) { if (down) at(e); });
    tr.addEventListener("pointerup", function () { down = false; }); tr.addEventListener("pointercancel", function () { down = false; });
    tr.addEventListener("keydown", function (e) {
      if (!geo) return; var d = e.key === "ArrowRight" ? 1 : (e.key === "ArrowLeft" ? -1 : 0); if (!d) return;
      e.preventDefault(); setPlaying(false); step = Math.max(0, Math.min(geo.total, step + d * (e.shiftKey ? 5 : 0.25))); atEnd = step >= geo.total - 1e-6; renderStep();
    });
  })();
  document.addEventListener("keydown", function (e) {
    if (e.code !== "Space" || /INPUT|SELECT|BUTTON|TEXTAREA/.test(e.target.tagName)) return;
    e.preventDefault(); $("play").click();
  });

  $("target").addEventListener("change", function () {
    var v = Math.round(parseFloat($("target").value)); if (!isFinite(v) || v < 2) v = 40; v = Math.min(400, v);
    $("target").value = v; state.target = v; writeHash();
    var job = ++jobs; $("askOut").textContent = "Calculating…"; $("askUse").disabled = true;
    setTimeout(function () { if (job === jobs) { solveTarget(job); if (!chartData) sweep(job); } }, 60);
  });
  $("askUse").addEventListener("click", function () { if (askTl === null) return; state.Tl = askTl; changed(); });
  var framed = false; try { framed = window.top !== window.self; } catch (errF) { framed = true; }
  if (!framed && navigator.clipboard) {
    $("copy").hidden = false;
    $("copy").addEventListener("click", function () {
      var b = $("copy"), old = "Copy link to these settings";
      navigator.clipboard.writeText(location.href).then(function () { b.textContent = "Link copied"; }, function () { b.textContent = "Copy the address from the address bar"; });
      setTimeout(function () { b.textContent = old; }, 2200);
    });
  }

  try {
    if (!window.THREE) throw new Error("three.js did not load");
    scene3d = makeScene($("gl")); window.SaplingTwin = scene3d;
  } catch (err) {
    scene3d = null; $("nogl").style.display = "flex"; $("gl").style.display = "none";
    if (window.console) console.error(err);
  }
  state.target = 40;
  var start = decodeState((location.hash || "").replace(/^#/, ""));
  if (start && start.state) {
    loadPreset(0); Object.keys(start.state).forEach(function (k) { state[k] = start.state[k]; });
    state.preset = null; state.presetNote = null; $("preset").value = "custom"; $("target").value = state.target;
    syncInputs(); compute();
  } else loadPreset(start ? start.preset : 0);
  window.addEventListener("hashchange", function () {
    var h2 = (location.hash || "").replace(/^#/, ""); if (h2 === encodeState()) return;
    var d2 = decodeState(h2); if (!d2) return;
    if (d2.state) { Object.keys(d2.state).forEach(function (k) { state[k] = d2.state[k]; }); state.preset = null; state.presetNote = null; $("preset").value = "custom"; $("target").value = state.target; syncInputs(); compute(); }
    else loadPreset(d2.preset);
  });
})();
