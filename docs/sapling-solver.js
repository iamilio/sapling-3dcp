/*
 * Sapling solver, JavaScript port of sapling.py 0.2.0
 *
 * Parametric model of Suiker (2018) for elastic buckling and plastic collapse
 * of a straight printed wall, with the extensions of Wolfs & Suiker (2019)
 * and Suiker et al. (2020). Same equations, same numerical scheme and same
 * step counts as the Python module, so the two give the same numbers.
 *
 * Copyright (C) 2026 Ali Akbarzadeh. License: GPL-3.0-or-later
 */
(function (root) {
  "use strict";
  var G = 9.81;

  // gamma: null -> linear; number -> exponential, E_inf/E0 = gamma;
  //        {quad: beta} -> quadratic, g = 1 + a + beta a^2
  function curing(Ebar, gamma) {
    if (gamma && typeof gamma === "object") {
      var be = gamma.quad;
      return [function (a) { return 1 + a + be * a * a; },
              function (a) { return -Ebar * (1 + 2 * be * a); },
              function () { return 2 * be * Ebar * Ebar; }];
    }
    if (gamma === null || gamma === undefined || gamma <= 0) {
      return [function (a) { return 1 + a; },
              function () { return -Ebar; },
              function () { return 0; }];
    }
    return [function (a) { return gamma + (1 - gamma) * Math.exp(-a); },
            function (a) { return (1 - gamma) * Ebar * Math.exp(-a); },
            function (a) { return (1 - gamma) * Ebar * Ebar * Math.exp(-a); }];
  }

  // Eqs. (37), (38), (57), (58)
  function nyOfKr(kr) { return 1.984 * (1 - Math.exp(-Math.pow(0.360 * kr + 0.430, 0.452))); }
  function cyOfKr(kr) { return 0.5 + 0.309 * Math.exp(-0.854 * kr) + 0.192 * Math.exp(-0.183 * kr); }
  function krInfRect(bOverD) {
    var r = Math.max(bOverD, 1.0);
    var n = 2.0 * r / (1.0 + r);
    if (n >= 1.984) return 1e9;
    var k = (Math.pow(-Math.log(1 - n / 1.984), 1 / 0.452) - 0.430) / 0.360;
    return Math.max(k, 0.0);
  }

  // Eq. (69)
  function F(psi) {
    if (psi < 1e-2) return 1.0;
    if (psi > 20.0) return 1.0 / psi;
    var e = Math.exp, s = Math.sin(psi), c = Math.cos(psi);
    var num = 4 * s * c * (e(psi) + e(-psi)) + 2 * c * (e(2 * psi) - e(-2 * psi))
            - 2 * s * (e(2 * psi) + e(-2 * psi)) - 4 * s
            - e(3 * psi) + e(-3 * psi) - e(psi) + e(-psi);
    var den = psi * (4 * c * c * (e(psi) + e(-psi)) - e(3 * psi) - e(-3 * psi)
            - 3 * (e(psi) + e(-psi)));
    return num / den;
  }

  function flex(sp, L, Ebar, gamma, m) {
    m = m || 40;
    var g = curing(Ebar, gamma)[0], hs = sp / (2 * m), tot = 0;
    for (var i = 0; i <= 2 * m; i++) {
      var s = i * hs;
      var wgt = (i === 0 || i === 2 * m) ? 1 : (i % 2 ? 4 : 2);
      tot += wgt * (sp - s) * (sp - s) / g(Ebar * (L - s));
    }
    return tot * hs / 3;
  }

  function rectProfile(L, Ebar, gamma, bbar, dbar, npts, scaling) {
    var krinf = krInfRect(bbar / dbar), g = curing(Ebar, gamma)[0], out = [];
    for (var i = 0; i <= npts; i++) {
      var sp = L * i / npts, kr;
      if (i === 0) {
        kr = 1e9;
      } else {
        var kt = 1.0 / flex(sp, L, Ebar, gamma), psi;
        if (scaling === "paper" && Ebar > 0) psi = Math.pow(kt / Math.pow(Ebar, 3) / 4.0, 0.25);
        else psi = dbar * Math.pow(kt / (4.0 * g(Ebar * (L - sp))), 0.25);
        kr = krinf / Math.max(F(psi), 1e-9);
      }
      out.push([nyOfKr(kr), cyOfKr(kr)]);
    }
    return out;
  }

  // Shooting determinant of Eqs. (49), (54), (55); lengths in units of L0.
  function det(L, Ebar, gamma, nu, Ky, bbar, prof, n, trace) {
    var cu = curing(Ebar, gamma), g = cu[0], dg = cu[1], d2g = cu[2];
    function coefC(j) {
      if (!prof) return [0, 0];
      var b2 = Math.pow(prof[j][0] * Math.PI / bbar, 2);
      return [prof[j][1] * b2, b2];
    }
    function f(s, j, y) {
      var w = y[0], wp = y[1], m = y[2], mp = y[3];
      var a = Ebar * (L - s), gs = g(a), gps = dg(a), gpps = d2g(a);
      var cb = coefC(j), c = cb[0], b2 = cb[1];
      var wpp = m / gs;
      var mpp = wp - (L - s) * wpp + 2 * c * (gps * wp + gs * wpp)
              - (c * b2 * gs - c * nu * gpps - c * Ky * (L - s)) * w;
      return [wp, wpp, mp, mpp];
    }
    function add(y, k, f1) { return [y[0] + f1 * k[0], y[1] + f1 * k[1], y[2] + f1 * k[2], y[3] + f1 * k[3]]; }
    var hs = L / n, out = [], starts = [[0, 0, 1, 0], [0, 0, 0, 1]];
    for (var p = 0; p < 2; p++) {
      var y = starts[p], s = 0, ws = [y[0]];
      for (var i = 0; i < n; i++) {
        var k1 = f(s, 2 * i, y);
        var k2 = f(s + hs / 2, 2 * i + 1, add(y, k1, hs / 2));
        var k3 = f(s + hs / 2, 2 * i + 1, add(y, k2, hs / 2));
        var k4 = f(s + hs, 2 * i + 2, add(y, k3, hs));
        y = [0, 1, 2, 3].map(function (q) { return y[q] + hs / 6 * (k1[q] + 2 * k2[q] + 2 * k3[q] + k4[q]); });
        s += hs;
        ws.push(y[0]);
      }
      var gs0 = g(0), gps0 = dg(0), c = coefC(2 * n)[0];
      var A = y[2] - c * nu * y[0];
      var B = y[3] - c * (nu * (gps0 * y[0] + gs0 * y[1]) + 2 * (1 - nu) * gs0 * y[1]);
      out.push([A, B]);
      if (trace) trace.push([ws, A, B]);
    }
    return out[0][0] * out[1][1] - out[0][1] * out[1][0];
  }

  function setup(L, Ebar, bbar, edge, gamma, dbar, scaling) {
    var n = Math.floor(Math.max(120, Math.min(600, 60 * L))), prof, i;
    if (edge === "free") prof = null;
    else if (edge === "simply") { prof = []; for (i = 0; i <= 2 * n; i++) prof.push([1.0, 1.0]); }
    else if (edge === "clamped") { prof = []; for (i = 0; i <= 2 * n; i++) prof.push([2.0, 0.5]); }
    else if (edge === "rect") prof = rectProfile(L, Ebar, gamma, bbar, dbar, 2 * n, scaling);
    else throw new Error("Edge must be free, simply, clamped or rect");
    return [n, prof];
  }

  function criticalLength(Ebar, o) {
    o = o || {};
    var edge = o.edge || "free", nu = o.nu === undefined ? 0.3 : o.nu;
    var gamma = o.gamma === undefined ? null : o.gamma;
    var Ky = (o.Ky === undefined || o.Ky === null) ? nu : o.Ky;
    var scaling = o.scaling || "paper", Lmax = o.Lmax === undefined ? 60.0 : o.Lmax;
    function D(L) {
      var st = setup(L, Ebar, o.bbar, edge, gamma, o.dbar, scaling);
      return det(L, Ebar, gamma, nu, Ky, o.bbar, st[1], st[0]);
    }
    var L0 = 0.3, d0 = D(L0);
    while (L0 < Lmax) {
      var L1 = Math.min(Lmax, L0 + Math.max(0.1, 0.03 * L0)), d1 = D(L1);
      if ((d0 > 0) !== (d1 > 0)) {
        for (var it = 0; it < 40; it++) {
          var Lm = 0.5 * (L0 + L1), dm = D(Lm);
          if ((dm > 0) === (d0 > 0)) { L0 = Lm; d0 = dm; } else { L1 = Lm; }
        }
        return 0.5 * (L0 + L1);
      }
      L0 = L1; d0 = d1;
    }
    return Infinity;
  }

  function modeShape(L, Ebar, o) {
    o = o || {};
    var edge = o.edge || "free", nu = o.nu === undefined ? 0.3 : o.nu;
    var gamma = o.gamma === undefined ? null : o.gamma;
    var Ky = (o.Ky === undefined || o.Ky === null) ? nu : o.Ky;
    var npts = o.npts || 20;
    var st = setup(L, Ebar, o.bbar, edge, gamma, o.dbar, o.scaling || "paper"), n = st[0];
    var trace = [];
    det(L, Ebar, gamma, nu, Ky, o.bbar, st[1], n, trace);
    var w1 = trace[0][0], a1 = trace[0][1], b1 = trace[0][2];
    var w2 = trace[1][0], a2 = trace[1][1], b2 = trace[1][2], c1, c2;
    if (Math.abs(a1) + Math.abs(a2) >= Math.abs(b1) + Math.abs(b2)) { c1 = a2; c2 = -a1; }
    else { c1 = b2; c2 = -b1; }
    var out = [], big = 0, k;
    for (k = 0; k <= npts; k++) {
      var x = k * n / npts, i = Math.min(n - 1, Math.floor(x));
      var wi = c1 * w1[i] + c2 * w2[i], wj = c1 * w1[i + 1] + c2 * w2[i + 1];
      var v = wi + (wj - wi) * (x - i);
      out.push(v); big = Math.max(big, Math.abs(v));
    }
    big = big || 1.0;
    var sign = out[npts] >= 0 ? 1 : -1;
    return out.map(function (v) { return sign * v / big; });
  }

  // SI units in, object out. p: {h, tl, Tl, rho, E0, nu, xiE, sig0, xiS,
  //   b, edge, gammaE, d, Ky, scaling, Lmax, betaE}
  function assess(p) {
    var gammaE = (p.gammaE === undefined) ? null : p.gammaE;
    if (p.betaE) gammaE = { quad: +p.betaE };
    var Lmax = p.Lmax === undefined ? 60.0 : p.Lmax;
    var edge = p.edge || "free", scaling = p.scaling || "paper";
    var ldot = p.tl / p.Tl;
    var D0 = p.E0 * Math.pow(p.h, 3) / (12 * (1 - p.nu * p.nu));
    var L0 = Math.pow(D0 / (p.rho * G * p.h), 1 / 3);
    var Ebar = L0 * p.xiE / ldot;
    var bbar = (p.b === undefined || p.b === null) ? null : p.b / L0;
    var dbar = (p.d === undefined || p.d === null) ? null : p.d / L0;
    var abar = p.sig0 * p.xiS / (p.rho * G * ldot);
    var lp = abar < 1 ? (p.sig0 / (p.rho * G)) / (1 - abar) : Infinity;
    var limit = lp === Infinity ? Lmax : Math.min(Lmax, 1.02 * lp / L0 + 0.5);
    var opt = { bbar: bbar, edge: edge, nu: p.nu, gamma: gammaE, Ky: p.Ky, dbar: dbar, scaling: scaling, Lmax: limit };
    var lcr = criticalLength(Ebar, opt) * L0;
    var H, mode, n;
    if (lcr === Infinity && lp === Infinity) { H = null; mode = "no failure predicted"; n = null; }
    else if (lcr < lp) { H = lcr; mode = "elastic buckling"; n = Math.ceil(lcr / p.tl); }
    else { H = lp; mode = "plastic collapse"; n = Math.ceil(lp / p.tl) + 1; }
    var shape = null;
    if (mode === "elastic buckling") shape = modeShape(lcr / L0, Ebar, opt);
    var warn = [];
    if (edge === "clamped" && Ebar > 0.5)
      warn.push("Clamped wall at a high curing rate: the model overestimates finite-element results by up to 15% (Wolfs & Suiker 2019, Sec. 3.2). 'Simply supported' is the safe bound.");
    if (H !== null && gammaE === null && H / ldot > 1200.0)
      warn.push("Failure after " + (H / ldot / 60).toFixed(0) + " min of printing: linear curing is calibrated for short sessions and underestimated long walls in Wolfs & Suiker 2019.");
    if (edge === "rect" && typeof gammaE === "number")
      warn.push("Rectangular layout with exponential curing is outside the published formulas (Eq. 67 is for linear curing).");
    return { ldot: ldot, D0: D0, L0: L0, Ebar: Ebar, bbar: bbar, abar: abar, lcr: lcr, lp: lp,
             H: H, mode: mode, n: n, limit: limit * L0, warnings: warn, shape: shape };
  }

  var api = { G: G, criticalLength: criticalLength, modeShape: modeShape, assess: assess,
              nyOfKr: nyOfKr, cyOfKr: cyOfKr, version: "0.2.0" };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SaplingSolver = api;
})(typeof self !== "undefined" ? self : this);
