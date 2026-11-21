# Sapling

**[Watch the 1-minute demo](https://youtu.be/vBs35CAS1EA)**

**[Try it in the browser](https://iamilio.github.io/sapling-3dcp/)**: the same solver with a 3D print twin, no Rhino needed.

**How tall can your print grow?** Sapling is a buildability check for 3D concrete printing in Rhino Grasshopper. Given a wall, a material and a print speed, it predicts the height at which the fresh wall fails during printing, and whether it fails by **elastic buckling** or **plastic collapse**.

Sapling implements the parametric model for elastic buckling and plastic collapse during 3D printing developed by A.S.J. Suiker at Eindhoven University of Technology: the model formulation for linear and exponentially decaying curing in Suiker (2018), and for accelerated (power-law) curing in Suiker (2022). The model was validated experimentally in Suiker et al. (2020) and numerically with finite-element simulations in Wolfs and Suiker (2019), and Deetman and Suiker (2026) identify its material parameters from indentation tests. Sapling is an independent implementation and is not affiliated with or endorsed by the author.

## What it does

- Predicts the critical height, the failure layer and the failure mode of a straight printed wall.
- Supports four boundary conditions: free wall, simply supported, fully clamped, and rectangular layouts (two long walls restrained by two short walls).
- Supports four stiffness curing laws: linear, exponentially decaying, quadratic, and power-law (Suiker 2022).
- Reports "no failure predicted" when the wall can be printed to any height under the model.
- Warns when the model is used where the papers show it is less reliable.
- Runs in pure Python, with no numpy or scipy, in Rhino 7 and Rhino 8.

## Install

1. In Grasshopper, place a **Python 3 Script** component (Rhino 8) or a **GhPython Script** component (Rhino 7).
2. Open it and replace its content with the whole of `sapling.py`.
3. Add inputs and outputs with exactly the names below, and set the type hints.

## Inputs

| Name | Type | Unit | Meaning |
| --- | --- | --- | --- |
| `Path` | Curve | | One layer of the print path (optional) |
| `Speed` | float | mm/s | Nozzle speed, used with `Path` to get the layer time |
| `Tl` | float | s | Layer time, used when `Path` is empty |
| `h` | float | mm | Wall thickness (layer width) |
| `tl` | float | mm | Layer height |
| `rho` | float | kg/m3 | Density of the fresh material (default 2100) |
| `E0` | float | kPa | Initial Young's modulus |
| `xiE` | float | 1/min | Stiffness curing rate |
| `sig0` | float | kPa | Initial yield strength |
| `xiS` | float | 1/min | Strength curing rate |
| `nu` | float | | Poisson's ratio (default 0.3) |
| `b` | float | mm | Wall width between supports |
| `d` | float | mm | Width of the supporting wall (`Edge` = `rect`) |
| `Edge` | str | | `free`, `simply`, `clamped` or `rect` |
| `gammaE` | float | | Final over initial stiffness, for exponential curing (empty = linear) |
| `betaE` | float | | Curing acceleration, for quadratic curing (empty = 0) |
| `mE` | float | | Exponent of power-law stiffness curing, `E = E0 (1 + xiE t)^mE` (empty = 1) |
| `nS` | float | | Exponent of power-law strength curing, `sig = sig0 (1 + xiS t)^nS` (empty = 1) |
| `Ky` | float | | Coefficient of lateral stress (empty = `nu`) |
| `RectScaling` | str | | `paper` (default, the form of Eqs. 67 and 68) or `consistent`; see the notes in `sapling.py` |
| `BottomLayer` | bool | | Add one layer to plastic collapse for the constrained bottom layer (default true); an experimental observation of Suiker et al. (2020), not a model outcome |
| `Htarget` | float | mm | Intended height, used for the preview when no failure is predicted |

Use sliders with at least four decimals for the curing rates, or type the values in a panel. A curing rate rounded in the third decimal can move the result by a layer.

## Outputs

| Name | Meaning |
| --- | --- |
| `Height` | Critical height in mm (empty when no failure is predicted) |
| `Layers` | Number of layers at failure: ⌈`Height`/`tl`⌉ for buckling, ⌈`Height`/`tl`⌉ + 1 for plastic collapse, because the first layer sticks to the bed and hardly deforms (Suiker et al. 2020, Sec. 2.2). This extra layer is an experimental observation and can be switched off with `BottomLayer` |
| `Mode` | `elastic buckling`, `plastic collapse` or `no failure predicted` |
| `Report` | Text summary, including warnings |
| `Preview` | The path extruded to the critical height |
| `Shape` | Buckling mode along the height: 21 values from bottom to top, normalised to 1 (empty unless the wall buckles) |

## Quick check

The large square layout of Suiker et al. (2020):

`Tl` 19.2, `h` 55, `tl` 9.5, `rho` 2100, `E0` 48.564, `xiE` 0.0537, `sig0` 2.835, `xiS` 0.116, `nu` 0.3, `b` 500, `Edge` `simply`

Expected: elastic buckling at 247 mm, 26 layers. The paper predicts 27 and the two printed walls failed at 27 and 28.

## Examples

- `examples/sapling_square_500.gh`: the quick check above.
- `examples/sapling_preview.gh`: the quick check with the animated preview connected (see below).
- `examples/sapling_long_wall_quadratic.gh`: the 10.4 m free wall of Wolfs & Suiker (2019), with linear and quadratic curing side by side (24 and 48 layers; the printed wall failed at 46). The yield strength is set artificially high to isolate buckling, and the curing acceleration of 2.5 is the value the authors fitted to this wall.

## Animated preview

`examples/sapling_preview.py` is a second component that draws a gantry printer, the layers as they are printed, and the predicted failure. Connect its `Layers`, `Mode` and `Shape` inputs to the Sapling outputs of the same name, and drag a slider on `Step`.

Optional inputs: `Camera` (`story` or `orbit`) moves the camera of the active Rhino viewport with `Step`, for exporting an animation with the slider's Animate function; `Zoom` sets the camera distance; `Segments` sets the resolution along the path. In the 500 mm example, raising `h` above 62 mm changes the predicted failure from elastic buckling to plastic collapse.

The deformed shape it shows after failure is an illustration. For buckling it uses the mode shape along the height computed by Sapling, with an amplitude chosen for visibility, since a buckling mode has no defined amplitude. For plastic collapse it is a sketch of the mechanism described in Suiker et al. (2020). Do not read displacements off the preview.

## Web version

`docs/` holds a browser version of Sapling: the solver ported to JavaScript (`docs/sapling-solver.js`) and a 3D print twin with live inputs and a print timeline. It also shows where the printed walls of the papers failed, the result for material properties 10% lower and higher, the shortest safe time per layer for a target number of layers, and the critical height against wall thickness. The JavaScript solver uses the same equations, numerical scheme and step counts as `sapling.py` and gives the same buckling lengths for all published cases in the tests. The deformed shapes drawn after failure are illustrations, as in the Grasshopper preview.

## Verification

`tests/test_reproduction.py` reruns published values of the papers:

```
python -m pytest tests
```

- 26 dimensionless buckling lengths, including the cases compared with finite-element analysis in Wolfs & Suiker (2019).
- 10 failure-layer cases, covering the printed walls of the 2018, 2019 and 2020 papers.
- Power-law (accelerated) curing of Suiker (2022). The plastic collapse rule is Eq. (25) of that paper. With exponent 1 the law reproduces linear curing exactly, and with exponent 2 it reproduces the quadratic law exactly.
- An independent finite-element check (Hermite beam elements on the energy of the same plate-strip equations) agrees with the shooting solver to within 0.2% for free and simply supported walls, linear and power-law curing.

**Comparison with the exact curve data of Suiker.** Prof. Suiker kindly sent the numerical data behind Fig. 11 of the 2022 paper and Fig. 19 of the 2018 paper. An earlier version of this README compared against values read from the graph and reported 1 to 4% agreement; the exact data show a larger spread, so the full picture is given here. Differences are in the buckling length at the end of each curve; Sapling is lower in every case.

| Case | Largest difference |
|---|---|
| Fig. 11 (2022), free wall, exponent m = 1 / 1.2 / 1.5 | 0.5% / 1.1% / 2.5% |
| Fig. 11, m = 2 / 3 / 4 | 6.5% / 19% / 33% |
| Fig. 19 (2018), simply supported, b̄ = 20 / 50 / free wall | 0.9% / 0.5% / 0.5% |
| Fig. 19, b̄ = 3 to 10 | 4% to 23%, largest close to the vertical asymptotes |

The difference grows with the wall length and with the exponent. Prof. Suiker explained that the curves were computed with the polynomial solution of the 2018 paper, Eq. (96), with N = 6 terms. Rebuilding that six-term solution (clamped at the bed, natural conditions Eq. (55) at the top) reproduces his data to 0.1% for every case above, including m = 4 and b̄ = 3. With more terms it converges to the Sapling value. For example, at the last point of the m = 4 curve in Fig. 11 (ξ̄E = 0.3233), the dimensionless critical length l̄cr of Eq. (32)₁ is 10.24 with N = 6 (the published curve), 7.27 with N = 7, 6.95 with N = 8 and 6.88 with N = 12, against 6.88 from Sapling. Six terms are converged for linear curing and short walls (Fig. 12 of the 2018 paper), but not for long walls with steep curing, where the six-term solution is stiffer and gives a longer critical length. An independent finite-element solution agrees with Sapling to within 0.2%. The tests check all of this.

Sapling integrates the governing equation directly. It is therefore 1 to 3% below the closed-form free-wall design formula of the papers, which in a few cases shifts the predicted failure by one layer.

These tests show that the implementation matches the published model. They are **not** an independent validation: every comparison uses the material parameters and experiments of the original papers.

## Limitations

- **Geometry.** Straight, vertical walls of uniform thickness only. Curved or zigzag paths affect the result only through the layer time.
- **Long print sessions.** With linear curing the model underestimated walls printed for more than about 20 minutes (24 layers predicted against 46 observed for a 10.4 m wall). Sapling warns in this range.
- **Clamped walls.** At high curing rates the model exceeds finite-element results by up to 15%. Sapling warns; `simply` is the safe bound.
- **Imperfections** are not modelled.
- **Rectangular layouts, jumps.** Where two roots of the buckling determinant lie very close together, the root search can lose them and jump to a much larger critical height; Prof. Suiker met the same difficulty when solving the equations in 2018. A thicker wall cannot buckle at a lower height, so the web chart bridges such points with a dashed line that shows the expected trend, and Sapling warns for rectangular layouts.
- **Plastic collapse** uses linear or power-law strength curing. The effect of vertical layer deformations (Suiker 2022, Sec. 3) is not included.
- **Power-law curing** is checked for free walls. For exponents of 3 and higher the buckling length rises very steeply with the curing rate, so a small error in the measured rate moves the result a lot.
- **Rectangular layouts** require equal wall thickness and linear curing. The corner stiffness, Eq. (67) of Suiker (2018), is derived for linear curing, so Sapling refuses other curing laws for this layout.
- **Layer time from a path** ignores travel moves and acceleration.
- **Inputs matter.** The result is sensitive to wall width and to the measured material parameters, which carry a scatter of 10 to 20% in the source papers. Treat the failure layer as an estimate with a margin of a few layers.

Sapling is a research tool. Do not use it as the only basis for decisions that affect safety.

## References

- A.S.J. Suiker (2018). Mechanical performance of wall structures in 3D printing processes: theory, design tools and experiments. *International Journal of Mechanical Sciences* 137, 145-170. https://doi.org/10.1016/j.ijmecsci.2018.01.010
- R.J.M. Wolfs, A.S.J. Suiker (2019). Structural failure during extrusion-based 3D printing processes. *International Journal of Advanced Manufacturing Technology* 104, 565-584. https://doi.org/10.1007/s00170-019-03844-6
- A.S.J. Suiker, R.J.M. Wolfs, S.M. Lucas, T.A.M. Salet (2020). Elastic buckling and plastic collapse during 3D concrete printing. *Cement and Concrete Research* 135, 106016. https://doi.org/10.1016/j.cemconres.2020.106016

- A.S.J. Suiker (2022). Effect of accelerated curing and layer deformations on structural failure during extrusion-based 3D printing. *Cement and Concrete Research* 151, 106586. https://doi.org/10.1016/j.cemconres.2021.106586
- A.H. Deetman, A.S.J. Suiker (2026). Characterization of early-age elastic-plastic properties of 3D printed materials using indentation testing. *International Journal of Mechanical Sciences* 310, 111141. https://doi.org/10.1016/j.ijmecsci.2025.111141 (source of the accelerated mortar example in the web version)

If you use Sapling, please cite the papers above as the source of the model, and this repository for the implementation (see `CITATION.cff`).

## License

Copyright (C) 2026 Ali Akbarzadeh. GPL-3.0-or-later; see `LICENSE`.
