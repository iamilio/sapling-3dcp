# Sapling

**[Watch the 1-minute demo](https://youtu.be/vBs35CAS1EA)**

**[Try it in the browser](https://iamilio.github.io/sapling-3dcp/)**: the same solver with a 3D print twin, no Rhino needed.

**How tall can your print grow?** Sapling is a buildability check for 3D concrete printing in Rhino Grasshopper. Given a wall, a material and a print speed, it predicts the height at which the fresh wall fails during printing, and whether it fails by **elastic buckling** or **plastic collapse**.

Sapling implements the parametric model developed at Eindhoven University of Technology by A.S.J. Suiker and co-workers. It is an independent implementation and is not affiliated with or endorsed by the authors.

## What it does

- Predicts the critical height, the failure layer and the failure mode of a straight printed wall.
- Supports four boundary conditions: free wall, simply supported, fully clamped, and rectangular layouts (two long walls restrained by two short walls).
- Supports three stiffness curing laws: linear, exponentially decaying, and quadratic.
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
| `Ky` | float | | Coefficient of lateral stress (empty = `nu`) |
| `RectScaling` | str | | `paper` (default) or `consistent`; see the notes in `sapling.py` |
| `Htarget` | float | mm | Intended height, used for the preview when no failure is predicted |

Use sliders with at least four decimals for the curing rates, or type the values in a panel. A curing rate rounded in the third decimal can move the result by a layer.

## Outputs

| Name | Meaning |
| --- | --- |
| `Height` | Critical height in mm (empty when no failure is predicted) |
| `Layers` | Number of layers at failure |
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

`docs/` holds a browser version of Sapling: the solver ported to JavaScript (`docs/sapling-solver.js`) and a 3D print twin with live inputs and a print timeline. The JavaScript solver uses the same equations, numerical scheme and step counts as `sapling.py` and gives the same buckling lengths for all published cases in the tests. The deformed shapes drawn after failure are illustrations, as in the Grasshopper preview.

## Verification

`tests/test_reproduction.py` reruns the published values of the three papers:

```
python -m pytest tests
```

- 26 dimensionless buckling lengths, including the cases compared with finite-element analysis in Wolfs & Suiker (2019).
- 10 failure-layer cases, covering the printed walls of all three papers.

Sapling integrates the governing equation directly. It is therefore 1 to 3% below the closed-form free-wall design formula of the papers, which in a few cases shifts the predicted failure by one layer.

These tests show that the implementation matches the published model. They are **not** an independent validation: every comparison uses the material parameters and experiments of the original papers.

## Limitations

- **Geometry.** Straight, vertical walls of uniform thickness only. Curved or zigzag paths affect the result only through the layer time.
- **Long print sessions.** With linear curing the model underestimated walls printed for more than about 20 minutes (24 layers predicted against 46 observed for a 10.4 m wall). Sapling warns in this range.
- **Clamped walls.** At high curing rates the model exceeds finite-element results by up to 15%. Sapling warns; `simply` is the safe bound.
- **Imperfections** are not modelled.
- **Plastic collapse** uses linear strength curing only.
- **Rectangular layouts** require equal wall thickness and linear or quadratic stiffness curing.
- **Layer time from a path** ignores travel moves and acceleration.
- **Inputs matter.** The result is sensitive to wall width and to the measured material parameters, which carry a scatter of 10 to 20% in the source papers. Treat the failure layer as an estimate with a margin of a few layers.

Sapling is a research tool. Do not use it as the only basis for decisions that affect safety.

## References

- A.S.J. Suiker (2018). Mechanical performance of wall structures in 3D printing processes: theory, design tools and experiments. *International Journal of Mechanical Sciences* 137, 145-170. https://doi.org/10.1016/j.ijmecsci.2018.01.010
- R.J.M. Wolfs, A.S.J. Suiker (2019). Structural failure during extrusion-based 3D printing processes. *International Journal of Advanced Manufacturing Technology* 104, 565-584. https://doi.org/10.1007/s00170-019-03844-6
- A.S.J. Suiker, R.J.M. Wolfs, S.M. Lucas, T.A.M. Salet (2020). Elastic buckling and plastic collapse during 3D concrete printing. *Cement and Concrete Research* 135, 106016. https://doi.org/10.1016/j.cemconres.2020.106016

If you use Sapling, please cite the papers above as the source of the model, and this repository for the implementation (see `CITATION.cff`).

## License

Copyright (C) 2026 Ali Akbarzadeh. GPL-3.0-or-later; see `LICENSE`.
