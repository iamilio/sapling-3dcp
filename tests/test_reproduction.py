"""
Reproduction tests for Sapling.

Each test reruns a value published in one of the three TU/e papers:
  [S18]  Suiker (2018), Int. J. Mech. Sci. 137, 145-170
  [WS19] Wolfs & Suiker (2019), Int. J. Adv. Manuf. Technol. 104, 565-584
  [S20]  Suiker, Wolfs, Lucas, Salet (2020), Cem. Concr. Res. 135, 106016

Run with:   python -m pytest tests        (or)   python tests/test_reproduction.py

Tolerances reflect how the published number was obtained: exact results are
held to 0.1 %, closed-form fits and graph readings to the stated tolerance.
"""
import os

import pytest
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import sapling as sp  # noqa: E402

# ---- material / process sets (SI units) ------------------------------------
S18 = dict(h=0.0435, tl=0.0092, rho=2020.0, E0=78100.0, nu=0.3,
           xiE=2.6e-4, sig0=5984.0, xiS=4.1e-4)
S20 = dict(h=0.055, tl=0.0095, rho=2100.0, E0=48564.0, nu=0.3,
           xiE=8.954e-4, sig0=2835.0, xiS=1.934e-3)
S20_BATCH2 = dict(S20, E0=55000.0, xiE=7.0e-3)
WS19_EXP = dict(h=0.060, tl=0.0095, rho=2100.0, E0=39500.0, nu=0.3,
                xiE=7.2e-4, sig0=1e9, xiS=0.0)          # buckling only
WS19_L0 = (0.589 / (2020.0 * sp.G * 0.0435)) ** (1.0 / 3)  # Table 1 of [WS19]


def close(value, ref, tol):
    assert abs(value - ref) <= tol * abs(ref), \
        "got %.4f, published %.4f (tolerance %.1f %%)" % (value, ref, 100 * tol)


# ---- dimensionless buckling lengths -----------------------------------------
# (label, kwargs for critical_length, published value, relative tolerance)
LCR_CASES = [
    ("S18 free, no curing (Greenhill limit)", dict(Ebar=0.0), 1.98635, 0.001),
    ("S18 free, 0.024 (Eq. 112 fit)", dict(Ebar=0.024), 2.04, 0.02),
    ("S18 simply b=7, 0.052 (graph)", dict(Ebar=0.052, bbar=7.0, edge="simply"), 2.38, 0.01),
    ("S18 clamped b=7, 0.052 (graph)", dict(Ebar=0.052, bbar=7.0, edge="clamped"), 4.89, 0.03),
    ("S18 rectangle 625x250", dict(Ebar=0.052, bbar=7.10, edge="rect", dbar=7.10 / 2.5), 3.05, 0.02),
    ("WS19 free linear 0.02", dict(Ebar=0.02), 2.031, 0.02),
    ("WS19 free linear 0.5", dict(Ebar=0.5), 2.561, 0.035),
    ("WS19 free linear 2.0", dict(Ebar=2.0), 3.712, 0.01),
    ("WS19 free exponential 0.02", dict(Ebar=0.02, gamma=5.0), 2.065, 0.01),
    ("WS19 free exponential 0.5", dict(Ebar=0.5, gamma=5.0), 3.059, 0.01),
    ("WS19 free exponential 2.0", dict(Ebar=2.0, gamma=5.0), 3.392, 0.01),
    ("WS19 simply b=9.1, 0.02 (graph)", dict(Ebar=0.02, bbar=9.1, edge="simply"), 2.2, 0.03),
    ("WS19 simply b=9.1, 0.5 (graph)", dict(Ebar=0.5, bbar=9.1, edge="simply"), 2.8, 0.03),
    ("WS19 simply b=9.1, 2.0 (graph)", dict(Ebar=2.0, bbar=9.1, edge="simply"), 4.8, 0.03),
    ("WS19 clamped b=13, 0.02 (graph)", dict(Ebar=0.02, bbar=13.0, edge="clamped"), 2.2, 0.03),
    ("WS19 clamped b=13, 0.5 (graph)", dict(Ebar=0.5, bbar=13.0, edge="clamped"), 2.8, 0.03),
    ("WS19 clamped b=13, 2.0 (graph)", dict(Ebar=2.0, bbar=13.0, edge="clamped"), 5.2, 0.03),
    ("WS19 rectangle 800x300, 0.02 (graph)",
     dict(Ebar=0.02, bbar=0.8 / WS19_L0, edge="rect", dbar=0.3 / WS19_L0), 2.45, 0.03),
    ("WS19 rectangle 800x300, 0.5 (graph)",
     dict(Ebar=0.5, bbar=0.8 / WS19_L0, edge="rect", dbar=0.3 / WS19_L0), 2.95, 0.03),
    ("WS19 rectangle 800x300, 1.5 (graph)",
     dict(Ebar=1.5, bbar=0.8 / WS19_L0, edge="rect", dbar=0.3 / WS19_L0), 4.9, 0.03),
    ("WS19 free quadratic 0.062 (Eq. 47 fit)", dict(Ebar=0.062, gamma=("quad", 2.5)), 2.012, 0.03),
    ("WS19 free quadratic 0.312 (Eq. 47 fit)", dict(Ebar=0.312, gamma=("quad", 2.5)), 2.729, 0.03),
    ("WS19 free quadratic 0.650 (Eq. 47 fit)", dict(Ebar=0.650, gamma=("quad", 2.5)), 5.435, 0.05),
    ("S20 square 500, simply (graph)", dict(Ebar=0.1566, bbar=5.763, edge="simply"), 2.85, 0.01),
    ("S20 square 250, simply (graph, steep)", dict(Ebar=0.0783, bbar=2.882, edge="simply"), 8.60, 0.08),
    ("S20 free, 0.079 (Eq. 9 fit)", dict(Ebar=0.0783), 2.12, 0.03),
]


def test_buckling_lengths():
    for label, kw, ref, tol in LCR_CASES:
        try:
            close(sp.critical_length(**kw), ref, tol)
        except AssertionError as err:
            raise AssertionError(label + ": " + str(err))


# ---- plastic collapse --------------------------------------------------------
def test_plastic_collapse_lengths():
    r = sp.assess(Tl=21.0, b=0.625, edge="simply", **S18)
    close(r["lp"], 0.421, 0.005)                               # [S18] Sec. 5.2
    small = sp.assess(Tl=9.6, b=0.25, edge="simply", **S20)
    large = sp.assess(Tl=19.2, b=0.50, edge="simply", **S20)
    scale = S20["rho"] * sp.G / S20["sig0"]
    close(small["lp"] * scale, 1.37, 0.005)                    # [S20] Table 4
    close(large["lp"] * scale, 2.16, 0.005)
    # [WS19] Sec. 3.5: l_p = 1/(1 - xi_sigma) for 0.4 and 0.5
    for xi, ref in ((0.4, 1.67), (0.5, 2.00)):
        close(1.0 / (1.0 - xi), ref, 0.005)


# ---- failure layer and mode --------------------------------------------------
# (label, assess kwargs, expected mode, expected layers, published layers)
LAYER_CASES = [
    ("S18 free wall 800 mm", dict(Tl=9.6, **S18), "elastic buckling", 20, 20),
    ("S18 rectangle 625x250", dict(Tl=21.0, b=0.625, d=0.25, edge="rect", **S18),
     "elastic buckling", 29, 30),
    ("WS19 free wall 1.0 m", dict(Tl=9.6, **WS19_EXP), "elastic buckling", 19, 19),
    ("WS19 free wall 5.0 m, quadratic", dict(Tl=48.0, betaE=2.5, **WS19_EXP),
     "elastic buckling", 26, None),
    ("WS19 free wall 10.4 m, quadratic", dict(Tl=99.8, betaE=2.5, **WS19_EXP),
     "elastic buckling", 48, None),
    ("S20 square 250 mm", dict(Tl=9.6, b=0.25, edge="simply", **S20),
     "plastic collapse", 21, 21),
    ("S20 square 250 mm, 9.0 mm layers",
     dict(Tl=9.6, b=0.25, edge="simply", **dict(S20, tl=0.009)),
     "plastic collapse", 23, 23),
    ("S20 square 500 mm", dict(Tl=19.2, b=0.50, edge="simply", **S20),
     "elastic buckling", 26, 27),
    ("S20 free wall, no imperfection", dict(Tl=9.6, **S20), "elastic buckling", 19, 20),
    ("S20 picnic table wall 690 mm", dict(Tl=88.0, b=0.69, edge="simply", **S20_BATCH2),
     "no failure predicted", None, None),
]


def test_failure_layers():
    for label, kw, mode, layers, published in LAYER_CASES:
        r = sp.assess(**kw)
        assert r["mode"] == mode, "%s: mode %s" % (label, r["mode"])
        assert r["n"] == layers, "%s: %s layers, expected %s" % (label, r["n"], layers)
        if published is not None:      # never more than one layer from the paper
            assert abs(r["n"] - published) <= 1, label


def test_second_batch_free_walls_buckling_only():
    # [S20] second batch: yield parameters not used, buckling length only
    for Tl, published in ((9.6, 26), (24.0, 33), (48.0, 43)):
        r = sp.assess(Tl=Tl, **dict(S20_BATCH2, sig0=1e9, xiS=0.0))
        assert abs(r["n"] - published) <= 1


def test_warnings():
    long_wall = sp.assess(Tl=99.8, **WS19_EXP)
    assert long_wall["n"] == 24 and len(long_wall["warnings"]) == 1
    clamped = sp.assess(Tl=19.2, b=0.5, edge="clamped", **dict(S20, xiE=8e-3))
    assert any("clamped" in w for w in clamped["warnings"])


def test_mode_shape():
    # free wall without curing: clamped at the bottom, largest at the top,
    # increasing monotonically (Greenhill mode)
    w = sp.mode_shape(1.98635, 0.0)
    assert len(w) == 21 and abs(w[0]) < 1e-9 and abs(w[-1] - 1.0) < 1e-9
    assert all(w[i + 1] > w[i] for i in range(20))
    r = sp.assess(Tl=9.6, b=0.25, edge="simply", **S20)        # plastic collapse
    assert r["shape"] is None


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("ok   " + t.__name__)
    print("%d buckling lengths, %d failure-layer cases reproduced"
          % (len(LCR_CASES), len(LAYER_CASES)))


# ---- power-law (accelerated) curing, Suiker (2022) ---------------------------
# The plastic collapse rule is Eq. (25) of the paper. For buckling the paper
# gives no table, so the values below were read from the solid (numerical)
# curves of its Fig. 11; the reading is good to a few per cent.
def test_power_law_fig11():
    """Exact curve data of Suiker (2022) Fig. 11, sent by A.S.J. Suiker
    (Nov 2026): last point of each curve, (xi_bar, l_bar).
    Agreement is within 0.6% (m = 1), 1.2% (m = 1.2) and 2.5% (m = 1.5).
    For m = 2, 3, 4 Sapling is 6.5%, 19% and 33% lower at the end of the
    curve; the independent FE check below agrees with Sapling there, so these
    differences are listed in the README and explained by
    test_curve_data_is_six_term_solution."""
    close(sp.critical_length(10.0003, Lmax=12), 7.72078, 0.01)               # m = 1
    close(sp.critical_length(7.59413, gamma=("pow", 1.2), Lmax=12), 10.0749, 0.015)
    close(sp.critical_length(3.30989, gamma=("pow", 1.5), Lmax=12), 10.0638, 0.03)


def _fe_lcr(E, m, bbar=None, nu=0.3, Ky=0.3, ne=80):
    """Independent check: Hermite cubic beam FE on the plate-strip energy
    U = 1/2 int g [w''^2 - 2 nu c w w'' + c b2 w^2 + 2(1-nu) c w'^2] ds,
    W = 1/2 int (L-s) [w'^2 + c Ky w^2] ds (simply supported edges, n = 1),
    g = (1 + E (L-s))^m, clamped at the bed; buckling where the lowest
    eigenvalue of K v = mu G v equals 1."""
    import numpy as np
    la = pytest.importorskip("scipy.linalg")
    so = pytest.importorskip("scipy.optimize")
    gp, gw = np.polynomial.legendre.leggauss(6)
    b2 = (np.pi / bbar) ** 2 if bbar else 0.0
    c = b2

    def mu(L):
        nd = 2 * (ne + 1)
        K = np.zeros((nd, nd))
        G = np.zeros((nd, nd))
        h = L / ne
        for e in range(ne):
            ix = slice(2 * e, 2 * e + 4)
            for xg, wg in zip(gp, gw):
                x = (xg + 1) / 2
                s = (e + x) * h
                wt = wg * h / 2
                N0 = np.array([1 - 3 * x * x + 2 * x ** 3, h * (x - 2 * x * x + x ** 3),
                               3 * x * x - 2 * x ** 3, h * (-x * x + x ** 3)])
                N1 = np.array([-6 * x + 6 * x * x, h * (1 - 4 * x + 3 * x * x),
                               6 * x - 6 * x * x, h * (-2 * x + 3 * x * x)]) / h
                N2 = np.array([-6 + 12 * x, h * (-4 + 6 * x), 6 - 12 * x,
                               h * (-2 + 6 * x)]) / h ** 2
                g = (1 + E * (L - s)) ** m
                K[ix, ix] += wt * g * (np.outer(N2, N2) - nu * c * (np.outer(N0, N2) + np.outer(N2, N0))
                                       + c * b2 * np.outer(N0, N0) + 2 * (1 - nu) * c * np.outer(N1, N1))
                G[ix, ix] += wt * (L - s) * (np.outer(N1, N1) + c * Ky * np.outer(N0, N0))
        return la.eigh(K[2:, 2:], G[2:, 2:], eigvals_only=True, subset_by_index=[0, 0])[0]

    a, b = 1.2, 1.3
    while mu(b) > 1.0:
        a, b = b, b * 1.1
    return so.brentq(lambda L: mu(L) - 1.0, a, b, xtol=1e-8)


@pytest.mark.parametrize("E,m,bbar,edge", [
    (1.42611, 2.0, None, "free"), (0.55259, 3.0, None, "free"),
    (0.323261, 4.0, None, "free"), (0.0264, 1.0, 3.0, "simply"),
    (4.1281, 1.0, 10.0, "simply")])
def test_fe_cross_check(E, m, bbar, edge):
    """The shooting solver and an independent FE discretisation of the same
    equations agree, also where Fig. 11/19 data differ from Sapling."""
    gamma = None if m == 1.0 else ("pow", m)
    lsap = sp.critical_length(E, bbar=bbar, edge=edge, gamma=gamma, Lmax=20)
    close(lsap, _fe_lcr(E, m, bbar), 0.002)


def test_power_law_limits():
    # exponent 1 is linear curing
    for kw in (dict(Ebar=0.5), dict(Ebar=0.1566, bbar=5.763, edge="simply")):
        close(sp.critical_length(gamma=("pow", 1.0), **kw), sp.critical_length(**kw), 1e-9)
    # (1 + a/2)^2 = 1 + a + a^2/4: exponent 2 is quadratic curing with beta = 1/4
    close(sp.critical_length(0.2, gamma=("pow", 2.0)),
          sp.critical_length(0.4, gamma=("quad", 0.25)), 1e-9)
    # plastic collapse: exponent 1 is the closed form of [S18]
    close(sp.plastic_length_factor(0.538, 1.0), 1.0 / (1.0 - 0.538), 1e-12)
    x = sp.plastic_length_factor(0.05, 3.0)
    assert abs((1 + 0.05 * x) ** 3 - x) < 1e-9
    assert sp.plastic_length_factor(0.2, 3.0) == sp.INF     # strength stays ahead


def test_rect_continuous_in_exponent():
    """Rect lay-out of Suiker (2018): a curing exponent slightly above 1 must
    give a slightly longer wall, not a jump (reported by A.S.J. Suiker for
    0.3.1, where 1 -> 1.1 dropped the height from 267 to 230 mm)."""
    base = dict(h=.0435, tl=.0092, Tl=21, rho=2020, E0=78100, nu=.3,
                xiE=.0154 / 60, sig0=1e15, xiS=0, b=.625, d=.25, edge="rect",
                Lmax=20)
    l1 = sp.assess(**base)["lcr"]
    l11 = sp.assess(mE=1.1, **base)["lcr"]
    assert l1 < l11 < 1.02 * l1


def _ritz6(E, m, bbar=None, nu=0.3, Ky=0.3, N=6):
    """The truncated polynomial solution of Suiker (2018), Eq. (96):
    w = sum_{n=1..N} C_n X^(n-1) with N = 6, the clamped conditions at the
    bed and the natural conditions Eq. (55) at the top imposed on the
    coefficients, and the rest found from the energy. Returns l_cr."""
    import numpy as np
    la = pytest.importorskip("scipy.linalg")
    so = pytest.importorskip("scipy.optimize")
    gp, gw = np.polynomial.legendre.leggauss(40)
    b2 = (np.pi / bbar) ** 2 if bbar else 0.0
    c = b2

    def mu(L):
        A = np.zeros((4, N))
        A[0, 0] = A[1, 1] = 1.0
        dg = -E * m                                        # g'(s) at the top
        for k in range(N):
            w0 = L ** k
            w1 = k * L ** (k - 1) if k > 0 else 0.0
            w2 = k * (k - 1) * L ** (k - 2) if k > 1 else 0.0
            w3 = k * (k - 1) * (k - 2) * L ** (k - 3) if k > 2 else 0.0
            A[2, k] = w2 - c * nu * w0
            A[3, k] = dg * w2 + w3 - c * (nu * (dg * w0 + w1) + 2 * (1 - nu) * w1)
        B = la.null_space(A)
        s = (gp + 1) / 2 * L
        wt = gw * L / 2
        g = (1 + E * (L - s)) ** m
        P0 = np.array([s ** k for k in range(N)])
        P1 = np.array([k * s ** (k - 1) if k > 0 else 0 * s for k in range(N)])
        P2 = np.array([k * (k - 1) * s ** (k - 2) if k > 1 else 0 * s for k in range(N)])
        d0, d1, d2 = B.T @ P0, B.T @ P1, B.T @ P2
        K = ((d2 * g * wt) @ d2.T - nu * c * ((d0 * g * wt) @ d2.T + (d2 * g * wt) @ d0.T)
             + c * b2 * (d0 * g * wt) @ d0.T + 2 * (1 - nu) * c * (d1 * g * wt) @ d1.T)
        G = (d1 * (L - s) * wt) @ d1.T + c * Ky * (d0 * (L - s) * wt) @ d0.T
        return la.eigh(K, G, eigvals_only=True, subset_by_index=[0, 0])[0]

    a = 1.0
    while mu(a * 1.05) > 1.0:
        a *= 1.05
    return so.brentq(lambda L: mu(L) - 1.0, a, a * 1.05, xtol=1e-10)


@pytest.mark.parametrize("E,m,bbar,ref", [
    (10.0003, 1.0, None, 7.72078), (3.30989, 1.5, None, 10.0638),
    (1.42611, 2.0, None, 10.3147), (0.55259, 3.0, None, 10.1522),
    (0.323261, 4.0, None, 10.2394),                        # Fig. 11 (2022)
    (0.0264, 1.0, 3.0, 6.6317), (4.1281, 1.0, 10.0, 9.6874),
    (1.0643, 1.0, 9.0, 3.5055)])                           # Fig. 19 (2018)
def test_curve_data_is_six_term_solution(E, m, bbar, ref):
    """The exact curve data of Figs. 11 and 19 are the N = 6 polynomial
    solution. That explains the differences with Sapling: the six-term
    solution is stiffer for long walls and steep curing, and converges to
    the Sapling value as N grows (checked in test_fe_cross_check)."""
    close(_ritz6(E, m, bbar), ref, 0.001)


def test_bottom_layer_optional():
    kw = dict(h=.055, tl=.0095, Tl=19.2, rho=2100, E0=48564, nu=.3,
              xiE=.0537 / 60, sig0=2835, xiS=.116 / 60, b=.25, edge="simply")
    a = sp.assess(**kw)
    b = sp.assess(bottom_layer=False, **kw)
    if a["mode"] == "plastic collapse":
        assert a["n"] == b["n"] + 1
    else:
        assert a["n"] == b["n"]
