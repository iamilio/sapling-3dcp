"""
Sapling 0.3.0 - buildability check for 3D concrete printing
GhPython component (Rhino 7 IronPython / Rhino 8 CPython) and plain module.

Implements the parametric model of Suiker (2018) for elastic buckling and
plastic collapse of a straight printed wall, with the extensions of
Wolfs & Suiker (2019), Suiker et al. (2020) and the power-law (accelerated)
curing of Suiker (2022). Pure Python, no numpy/scipy.

Use in Grasshopper: paste this whole file into a Python script component.
Use as a module:    import sapling; sapling.assess(...)   (SI units)

Scope: straight vertical walls of uniform thickness; free, simply supported,
clamped and rectangular lay-outs; linear, exponential, quadratic and power-law
stiffness curing; linear and power-law strength curing. See README.md for
limitations.

Copyright (C) 2026 Ali Akbarzadeh
License: GPL-3.0-or-later

INPUTS (set these names + type hints on the component):
    Path     : Curve   one layer of the print path (optional)
    Speed    : float   nozzle speed [mm/s]           (used with Path)
    Tl       : float   layer time [s]                (used if Path empty)
    h        : float   layer width / wall thickness [mm]
    tl       : float   layer height [mm]
    rho      : float   density [kg/m3]
    E0       : float   initial Young's modulus [kPa]
    xiE      : float   stiffness curing rate [1/min]
    sig0     : float   initial yield strength [kPa]
    xiS      : float   strength curing rate [1/min]
    nu       : float   Poisson ratio (default 0.3)
    b        : float   wall width between supports [mm]
    d        : float   width of the supporting wall [mm]   (Edge = 'rect')
    Edge     : str     'free' | 'simply' | 'clamped' | 'rect'
    gammaE   : float   E_inf/E0 for exponential curing (empty = linear)
    betaE    : float   curing acceleration for quadratic curing (empty = 0)
    mE       : float   exponent of power-law stiffness curing,
                       E = E0 (1 + xiE t)^mE (empty = 1, linear)
    nS       : float   exponent of power-law strength curing,
                       sig = sig0 (1 + xiS t)^nS (empty = 1, linear)
    Ky       : float   coefficient of lateral stress (empty = nu)
    RectScaling : str  'paper' | 'consistent'  (see note in rect_profile)
    Htarget  : float   intended print height [mm] (optional, for the report)
OUTPUTS:
    Height   : critical height [mm]   (empty if no failure predicted)
               (the same value is also assigned to H, the v1-v3 output name)
    Layers   : number of layers at failure (None if no failure predicted)
    Mode     : 'elastic buckling' | 'plastic collapse' | 'no failure predicted'
    Report   : text summary
    Preview  : extrusion of Path up to Height (or Htarget when no failure)
    Shape    : buckling mode along the height, 21 values from bottom to top,
               normalised to 1 (empty unless the wall buckles). Amplitude is
               arbitrary; used by sapling_preview.py to draw the buckled wall.
"""
from __future__ import division
import math

__version__ = "0.3.0"

G = 9.81
INF = float("inf")


# ------------------------------------------------------------ curing
def _curing(Ebar, gamma):
    """g(a), dg/ds, d2g/ds2 with a = Ebar*(L - s), s measured from the bottom.
    gamma: None -> linear; float -> exponential with E_inf/E0 = gamma;
           ("quad", beta) -> quadratic, g = 1 + a + beta*a^2;
           ("pow", m)     -> power law, g = (1 + a)^m (accelerated curing)."""
    if isinstance(gamma, tuple) and gamma[0] == "pow":
        m = float(gamma[1])
        return (lambda a: (1.0 + a) ** m,
                lambda a: -Ebar * m * (1.0 + a) ** (m - 1.0),
                lambda a: Ebar ** 2 * m * (m - 1.0) * (1.0 + a) ** (m - 2.0))
    if isinstance(gamma, tuple):
        be = gamma[1]
        return (lambda a: 1.0 + a + be * a * a,
                lambda a: -Ebar * (1.0 + 2.0 * be * a),
                lambda a: 2.0 * be * Ebar ** 2)
    if gamma is None or gamma <= 0:
        return (lambda a: 1.0 + a, lambda a: -Ebar, lambda a: 0.0)
    return (lambda a: gamma + (1 - gamma) * math.exp(-a),
            lambda a: (1 - gamma) * Ebar * math.exp(-a),
            lambda a: (1 - gamma) * Ebar ** 2 * math.exp(-a))


# ------------------------------------------- Eqs. (37), (38), (57), (58)
def ny_of_kr(kr):
    return 1.984 * (1 - math.exp(-(0.360 * kr + 0.430) ** 0.452))


def cy_of_kr(kr):
    return 0.5 + 0.309 * math.exp(-0.854 * kr) + 0.192 * math.exp(-0.183 * kr)


def kr_inf_rect(b_over_d):
    """Asymptotic rotational stiffness of a rectangular lay-out, D0s = D0."""
    r = max(b_over_d, 1.0)
    n = 2.0 * r / (1.0 + r)                                   # Eq. (57)
    if n >= 1.984:
        return 1e9
    k = ((-math.log(1 - n / 1.984)) ** (1 / 0.452) - 0.430) / 0.360  # Eq. (58)
    return max(k, 0.0)


def _F(psi):
    """Eq. (69). Equals theta/theta0 of a simply supported beam of length d on
    a Winkler foundation under end moments, with psi = beta*d."""
    if psi < 1e-2:
        return 1.0
    if psi > 20.0:
        return 1.0 / psi
    e = math.exp
    s, c = math.sin(psi), math.cos(psi)
    num = (4 * s * c * (e(psi) + e(-psi)) + 2 * c * (e(2 * psi) - e(-2 * psi))
           - 2 * s * (e(2 * psi) + e(-2 * psi)) - 4 * s
           - e(3 * psi) + e(-3 * psi) - e(psi) + e(-psi))
    den = psi * (4 * c * c * (e(psi) + e(-psi)) - e(3 * psi) - e(-3 * psi)
                 - 3 * (e(psi) + e(-psi)))
    return num / den


def _flex(sp, L, Ebar, gamma, m=40):
    """Tip flexibility of the graded cantilever strip s1: int (sp-s)^2/g ds."""
    g = _curing(Ebar, gamma)[0]
    hs = sp / (2 * m)
    tot = 0.0
    for i in range(2 * m + 1):                                  # Simpson
        s = i * hs
        wgt = 1 if i in (0, 2 * m) else (4 if i % 2 else 2)
        tot += wgt * (sp - s) ** 2 / g(Ebar * (L - s))
    return tot * hs / 3


def rect_profile(L, Ebar, gamma, bbar, dbar, npts, scaling="paper"):
    """(n_y, c_y) at npts+1 equidistant heights for a rectangular lay-out.

    scaling = 'paper'      : psi = (kt_bar/4)^(1/4) with kt_bar of Eq. (67),
                             i.e. taken literally from Eqs. (67)-(69). This
                             reproduces l_cr = 3.05 of Sec. 5.2 (we get 3.01).
    scaling = 'consistent' : psi = d*(kt/(4 D))^(1/4), the dimensionally
                             consistent beam-on-foundation parameter. Gives a
                             lower l_cr (2.58 for the same case). Which one is
                             intended is an open question for the author.
    """
    krinf = kr_inf_rect(bbar / dbar)
    g = _curing(Ebar, gamma)[0]
    out = []
    for i in range(npts + 1):
        sp = L * i / npts
        if i == 0:
            kr = 1e9                                           # clamped bottom
        else:
            kt = 1.0 / _flex(sp, L, Ebar, gamma)
            if scaling == "paper" and Ebar > 0:
                psi = (kt / Ebar ** 3 / 4.0) ** 0.25
            else:
                psi = dbar * (kt / (4.0 * g(Ebar * (L - sp)))) ** 0.25
            kr = krinf / max(_F(psi), 1e-9)                      # Eq. (66)
        out.append((ny_of_kr(kr), cy_of_kr(kr)))
    return out


# ------------------------------------------------------------ core solver
def _det(L, Ebar, gamma, nu, Ky, bbar, prof, n, trace=None):
    """Shooting determinant of Eqs. (49), (54), (55); lengths in units of L0.
    prof: list of (n_y, c_y) at 2n+1 equidistant heights, or None (free wall)."""
    g, dg, d2g = _curing(Ebar, gamma)

    def coef(j):
        if prof is None:
            return 0.0, 0.0
        ny, cy = prof[j]
        b2 = (ny * math.pi / bbar) ** 2
        return cy * b2, b2

    def f(s, j, y):
        w, wp, m, mp = y
        a = Ebar * (L - s)
        gs, gps, gpps = g(a), dg(a), d2g(a)
        c, b2 = coef(j)
        wpp = m / gs
        mpp = (wp - (L - s) * wpp + 2 * c * (gps * wp + gs * wpp)
               - (c * b2 * gs - c * nu * gpps - c * Ky * (L - s)) * w)
        return [wp, wpp, mp, mpp]

    hs = L / n
    out = []
    for y in ([0.0, 0.0, 1.0, 0.0], [0.0, 0.0, 0.0, 1.0]):
        s = 0.0
        ws = [y[0]]
        for i in range(n):                                       # classic RK4
            k1 = f(s, 2 * i, y)
            k2 = f(s + hs / 2, 2 * i + 1, [y[q] + hs / 2 * k1[q] for q in range(4)])
            k3 = f(s + hs / 2, 2 * i + 1, [y[q] + hs / 2 * k2[q] for q in range(4)])
            k4 = f(s + hs, 2 * i + 2, [y[q] + hs * k3[q] for q in range(4)])
            y = [y[q] + hs / 6 * (k1[q] + 2 * k2[q] + 2 * k3[q] + k4[q])
                 for q in range(4)]
            s += hs
            ws.append(y[0])
        w, wp, m, mp = y
        gs, gps = g(0.0), dg(0.0)
        c, _ = coef(2 * n)
        out.append((m - c * nu * w,
                    mp - c * (nu * (gps * w + gs * wp) + 2 * (1 - nu) * gs * wp)))
        if trace is not None:
            trace.append((ws, out[-1][0], out[-1][1]))
    (a1, b1), (a2, b2) = out
    return a1 * b2 - b1 * a2


def _setup(L, Ebar, bbar, edge, gamma, dbar, scaling):
    """Number of RK4 steps and the (n_y, c_y) profile for wall length L."""
    n = int(max(120, min(600, 60 * L)))
    if edge == "free":
        prof = None
    elif edge == "simply":
        prof = [(1.0, 1.0)] * (2 * n + 1)
    elif edge == "clamped":
        prof = [(2.0, 0.5)] * (2 * n + 1)
    elif edge == "rect":
        prof = rect_profile(L, Ebar, gamma, bbar, dbar, 2 * n, scaling)
    else:
        raise ValueError("Edge must be free, simply, clamped or rect")
    return n, prof


def critical_length(Ebar, bbar=None, edge="free", nu=0.3, gamma=None,
                    Ky=None, dbar=None, scaling="paper", Lmax=60.0):
    """Dimensionless critical buckling length (in units of L0).
    Returns inf if no bifurcation is found below Lmax."""
    Ky = nu if Ky is None else Ky

    def D(L):
        n, prof = _setup(L, Ebar, bbar, edge, gamma, dbar, scaling)
        return _det(L, Ebar, gamma, nu, Ky, bbar, prof, n)

    L0 = 0.3
    d0 = D(L0)
    while L0 < Lmax:
        L1 = min(Lmax, L0 + max(0.1, 0.03 * L0))
        d1 = D(L1)
        if (d0 > 0) != (d1 > 0):
            for _ in range(40):                                  # bisection
                Lm = 0.5 * (L0 + L1)
                dm = D(Lm)
                if (dm > 0) == (d0 > 0):
                    L0, d0 = Lm, dm
                else:
                    L1 = Lm
            return 0.5 * (L0 + L1)
        L0, d0 = L1, d1
    return INF


def mode_shape(L, Ebar, bbar=None, edge="free", nu=0.3, gamma=None,
               Ky=None, dbar=None, scaling="paper", npts=20):
    """Buckling mode along the wall height at the critical length L.
    Returns npts+1 deflections at equidistant heights (bottom to top),
    normalised to a maximum of 1. The amplitude of a bifurcation mode is
    arbitrary; only the shape has a meaning."""
    Ky = nu if Ky is None else Ky
    n, prof = _setup(L, Ebar, bbar, edge, gamma, dbar, scaling)
    trace = []
    _det(L, Ebar, gamma, nu, Ky, bbar, prof, n, trace)
    (w1, a1, b1), (w2, a2, b2) = trace
    if abs(a1) + abs(a2) >= abs(b1) + abs(b2):
        c1, c2 = a2, -a1
    else:
        c1, c2 = b2, -b1
    w = [c1 * w1[i] + c2 * w2[i] for i in range(n + 1)]
    out = []
    for k in range(npts + 1):
        x = k * n / float(npts)
        i = min(n - 1, int(x))
        out.append(w[i] + (w[i + 1] - w[i]) * (x - i))
    big = max(abs(v) for v in out) or 1.0
    sign = 1.0 if out[-1] >= 0 else -1.0
    return [sign * v / big for v in out]


def plastic_length_factor(abar, n=1.0):
    """Dimensionless plastic collapse length x = l_p rho g / sig0 for the
    strength law sig(t) = sig0 (1 + xiS t)^n: the smallest x > 0 at which the
    weight on the bottom layer equals its strength, x = (1 + abar x)^n, with
    abar = sig0 xiS / (rho g ldot). Returns inf if the strength always stays
    ahead of the load. n = 1 gives 1 / (1 - abar), Suiker (2018)."""
    if abs(n - 1.0) < 1e-12:
        return 1.0 / (1.0 - abar) if abar < 1 else INF
    if abar <= 0:
        return 1.0
    f = lambda x: (1.0 + abar * x) ** n - x
    if n > 1.0:
        # f starts at 1 and has one minimum; no root if the minimum is positive
        xm = ((1.0 / (n * abar)) ** (1.0 / (n - 1.0)) - 1.0) / abar
        if xm <= 0 or f(xm) > 0:
            return INF
        lo, hi = 0.0, xm
    else:
        lo, hi = 0.0, 1.0
        while f(hi) > 0:
            hi *= 2.0
            if hi > 1e12:
                return INF
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if f(mid) > 0:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def assess(h, tl, Tl, rho, E0, nu, xiE, sig0, xiS, b=None, edge="free",
           gammaE=None, d=None, Ky=None, scaling="paper", Lmax=60.0,
           betaE=None, mE=None, nS=None):
    """SI units in, dict out.
    mE: exponent of power-law stiffness curing, E = E0 (1 + xiE t)^mE.
    nS: exponent of power-law strength curing, sig = sig0 (1 + xiS t)^nS."""
    if betaE:
        gammaE = ("quad", float(betaE))
    if mE and abs(float(mE) - 1.0) > 1e-12:
        gammaE = ("pow", float(mE))
    ldot = tl / Tl
    D0 = E0 * h ** 3 / (12 * (1 - nu ** 2))
    L0 = (D0 / (rho * G * h)) ** (1.0 / 3)
    Ebar = L0 * xiE / ldot
    bbar = None if b is None else b / L0
    dbar = None if d is None else d / L0
    abar = sig0 * xiS / (rho * G * ldot)
    lp = (sig0 / (rho * G)) * plastic_length_factor(abar, float(nS) if nS else 1.0)
    # buckling beyond the plastic collapse length is irrelevant: bound the search
    limit = Lmax if lp == INF else min(Lmax, 1.02 * lp / L0 + 0.5)
    lcr = critical_length(Ebar, bbar, edge, nu, gammaE, Ky, dbar, scaling,
                          limit) * L0
    if lcr == INF and lp == INF:
        H, mode, n = None, "no failure predicted", None
    elif lcr < lp:
        H, mode, n = lcr, "elastic buckling", int(math.ceil(lcr / tl))
    else:  # +1 layer: constrained bottom layer (CCR 2020, Sec. 2.2)
        H, mode, n = lp, "plastic collapse", int(math.ceil(lp / tl)) + 1
    shape = None
    if mode == "elastic buckling":
        shape = mode_shape(lcr / L0, Ebar, bbar, edge, nu, gammaE, Ky, dbar,
                           scaling)
    warn = []
    if edge == "clamped" and Ebar > 0.5:
        warn.append("clamped wall at high curing rate: the model overestimates "
                    "FEM by up to 15% (Wolfs & Suiker 2019, Sec. 3.2); "
                    "'simply' is the safe bound")
    if H is not None and gammaE is None and H / ldot > 1200.0:
        warn.append("failure after %.0f min of printing: linear curing is "
                    "calibrated for short sessions and underestimated long "
                    "walls in Wolfs & Suiker 2019" % (H / ldot / 60.0))
    if edge == "rect" and isinstance(gammaE, float):
        warn.append("rectangular lay-out with exponential curing is outside "
                    "the published formulas (Eq. 67 is for linear curing)")
    if edge == "rect" and isinstance(gammaE, tuple) and gammaE[0] == "pow":
        warn.append("rectangular lay-out with power-law curing is outside "
                    "the published formulas (Eq. 67 is for linear curing)")
    return dict(ldot=ldot, D0=D0, L0=L0, Ebar=Ebar, bbar=bbar, abar=abar,
                lcr=lcr, lp=lp, H=H, mode=mode, n=n, limit=limit * L0,
                warnings=warn, shape=shape)


# ------------------------------------------------------- Grasshopper glue
def _gh_main():
    def val(name, default=None):
        v = globals().get(name)
        return default if v is None else v

    path, speed = val("Path"), val("Speed")
    if path is not None and speed:
        Tl_s = path.GetLength() / float(speed)
    else:
        Tl_s = float(val("Tl"))
    edge = (val("Edge", "free") or "free").strip().lower()
    bb, dd, tl_mm = val("b"), val("d"), val("tl")
    kw = dict(h=val("h") / 1000.0, tl=tl_mm / 1000.0, Tl=Tl_s,
              rho=val("rho", 2100.0), E0=val("E0") * 1000.0,
              nu=val("nu", 0.3), xiE=val("xiE") / 60.0,
              sig0=val("sig0") * 1000.0, xiS=val("xiS") / 60.0,
              b=None if bb is None else bb / 1000.0, edge=edge,
              gammaE=val("gammaE"),
              d=None if dd is None else dd / 1000.0, Ky=val("Ky"),
              scaling=(val("RectScaling", "paper") or "paper").strip().lower(),
              betaE=val("betaE"), mE=val("mE"), nS=val("nS"))
    # Results are kept per set of inputs, so returning to values that were
    # already solved (e.g. dragging a slider back) is immediate.
    try:
        import scriptcontext as sc
        cache = sc.sticky.setdefault("sapling_results", {})
    except ImportError:
        cache = {}
    key = tuple(sorted(kw.items()))
    if key not in cache:
        if len(cache) > 2000:
            cache.clear()
        cache[key] = assess(**kw)
    r = cache[key]

    def mm(x):
        return "none below %.0f mm" % (r["limit"] * 1000) if x == INF \
            else "%.0f mm (%.2f layers)" % (x * 1000, x * 1000 / tl_mm)

    lines = ["Layer time      : %.1f s" % Tl_s,
             "Wall growth     : %.3f mm/s" % (r["ldot"] * 1000),
             "Ebar / alpha    : %.3f / %.3f" % (r["Ebar"], r["abar"]),
             "Buckling length : " + mm(r["lcr"]),
             "Plastic length  : " + ("none (strength outgrows self-weight)"
                                     if r["lp"] == INF else mm(r["lp"]))]
    if r["H"] is None:
        lines.append("-> no failure predicted")
    else:
        lines.append("-> %s at %.0f mm (%d layers)"
                     % (r["mode"], r["H"] * 1000, r["n"]))
    for wmsg in r["warnings"]:
        lines.append("! " + wmsg)
    Hmm = None if r["H"] is None else r["H"] * 1000
    prev, top = None, Hmm if Hmm is not None else val("Htarget")
    if path is not None and top:
        import Rhino.Geometry as rg
        prev = rg.Surface.CreateExtrusion(path, rg.Vector3d(0, 0, top))
    return Hmm, r["n"], r["mode"], "\n".join(lines), prev, r["shape"]


try:
    import Rhino  # noqa: F401  (only inside Rhino)
    Height, Layers, Mode, Report, Preview, Shape = _gh_main()
    H = Height
except ImportError:
    pass
