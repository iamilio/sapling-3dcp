# Changelog

## 0.3.3 (2026-11-22)

Changes after comments by Prof. A.S.J. Suiker.

### Changed
- Attribution: the model is credited to A.S.J. Suiker, with Suiker (2018) for linear and exponentially decaying curing and Suiker (2022) for accelerated curing. The other papers are listed with what they contribute: validation and parameter identification. This applies to the README, the module docstring and the web page.
- Rectangular layout: linear curing only, because the corner stiffness, Eq. (67) of Suiker (2018), is derived for linear curing. The web page disables the other curing laws for this layout, and the Python module raises an error.
- Web chart against wall thickness: where a thicker wall would give a lower buckling height, the root search has picked the wrong root. Those points are bridged by a dashed trend line instead of being drawn as spikes.
- Model values on the web page also cite Suiker (2018), Eqs. (51), (53), (75) and (91), where the dimensionless groups are derived.
- Accelerated mortar example: the note now states that the uniaxial yield strength of 5.5 kPa is converted from the cohesion (1.72 kPa) and friction angle (26°) with the Mohr–Coulomb relation, which is our assumption.
- The "Wall 690 mm" example is named and described as the picnic table wall of Suiker et al. (2020).
- README: clearer wording for the long-session limitation and for the exponent-2 limit of power-law curing.
- CITATION.cff lists Suiker (2022) and Deetman & Suiker (2026).

### Added
- `docs/comparison`: Fig. 19 of Suiker (2018) and Figs. 11 and 12 of Suiker (2022), redrawn with the converged solution next to the published curves.

## 0.3.2 (2026-11-18)

### Fixed
- Rectangular layout: reverted the 0.3.1 change of corner-stiffness scaling for non-linear curing. That change made the result jump at exponent 1 (from 267 to 230 mm for exponent 1.1).

### Added
- `BottomLayer` input (Grasshopper) and checkbox (web): the extra constrained bottom layer for plastic collapse is optional and on by default. It is an experimental observation of Suiker et al. (2020), not a model outcome.
- Tests: the exact curve data of Fig. 11 (2022) and Fig. 19 (2018) are reproduced to 0.1% by the six-term polynomial solution of Suiker (2018), Eq. (96). With more terms this solution converges to the Sapling value, which explains the differences.

## 0.3.1 (2026-11-17)

### Changed
- The report, the web page and the README state that plastic collapse fails at layer ⌈lp/tl⌉ + 1, because of the constrained bottom layer (Suiker et al. 2020, Sec. 2.2).
- The web page labels the model values with the symbols of Suiker (2022).
- README verification corrected with the exact curve data sent by Prof. Suiker. The earlier claim of "1 to 4%" agreement with Fig. 11 came from values read off the graph.

### Added
- Independent finite-element check of the solver in the tests (agreement within 0.2%).

### Note
- This version changed the corner-stiffness scaling of the rectangular layout for non-linear curing. That change was wrong and was reverted in 0.3.2.

## 0.3.0 (2026-11-14)

### Added
- Power-law (accelerated) curing for stiffness and strength, after Suiker (2022). Plastic collapse follows Eq. (25).
- Web version (`docs/`): JavaScript port of the solver, 3D print twin with a gantry printer, markers for the printed walls of the papers, shortest safe layer time for a target number of layers, a ±10% sensitivity band, a chart of height against wall thickness, and shareable settings links.

## 0.2.0 (2026-11-10)

### Added
- Buckling mode shape output (`Shape`).
- Animated print preview component (`examples/sapling_preview.py`) and example files.

## 0.1.0 (2026-11-10)

- First release: elastic buckling and plastic collapse of straight printed walls (free, simply supported, clamped and rectangular layouts; linear, exponential and quadratic curing), checked against published values of Suiker (2018), Wolfs & Suiker (2019) and Suiker et al. (2020).
