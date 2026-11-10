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


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("ok   " + t.__name__)
    print("%d buckling lengths, %d failure-layer cases reproduced"
          % (len(LCR_CASES), len(LAYER_CASES)))
