"""
Sapling preview - animated print preview for Grasshopper (GhPython, Rhino 7/8)

Draws a gantry concrete printer, the printed layers and the failure that
Sapling predicts. Drag a slider connected to Step (or use Play + a Trigger)
to run the print. When Step reaches the failure layer the wall turns red and,
over the next three steps, deforms:

  * elastic buckling : the wall bends out of plane. The shape along the
    height is the buckling mode computed by Sapling (input Shape). The shape
    along the path is a half sine between supports or corners, alternating in
    and out on neighbouring walls of a closed lay-out. Layers turn with the
    bent wall and the top comes down as it bends.
  * plastic collapse : the lowest fifth of the wall yields: it is squashed
    and spreads sideways, and the wall above settles, a little unevenly.

The deformation is an illustration. A buckling mode has no defined amplitude,
so the amplitude here is chosen for visibility, and the collapse shape is a
sketch of the mechanism described in Suiker et al. (2020), not a computed
result. Do not read displacements off this preview.

INPUTS (names and type hints):
    Path     : Curve   one layer of the print path, drawn at z = 0 [mm]
    h        : float   wall thickness / layer width [mm]
    tl       : float   layer height [mm]
    Step     : float   layers printed so far, e.g. 12.4 = 12 layers + 40 %
    Layers   : int     failure layer            (Sapling output Layers)
    Mode     : str     failure mode             (Sapling output Mode)
    Shape    : float, List Access   mode shape  (Sapling output Shape)
    Edge     : str     free | simply | clamped  (open paths only; default free)
    Segments : int     samples along the path (default 120)
    Play     : bool    automatic playback, used when Step is not connected
    Tick     : any     connect a Trigger component here for automatic playback
    Rate     : float   layers per tick in automatic playback (default 0.05)
    Camera   : str     optional. Moves the camera of the active Rhino viewport
                       with Step, for recording with the slider's Animate:
                         story  = top view of the first layers, slow descent
                                  around the print, then a view square to one
                                  side of the frame that holds still during
                                  the failure and rises to look down on it
                         orbit  = plain turntable, one turn over the print
                       Leave empty to control the camera yourself.
    Zoom     : float   optional camera distance factor (default 1.0;
                       1.3 = 30 % farther away, 0.8 = closer)
OUTPUTS:
    Printed  : Mesh    printed layers, coloured by age (red after failure)
    Nozzle   : Mesh    moving parts of the printer: bridge, carriage, column, nozzle
    Printer  : Mesh    fixed parts: frame and print bed
    Status   : str     short text for a panel

License: GPL-3.0-or-later. Copyright (C) 2026 Ali Akbarzadeh
"""
from __future__ import division
import math

FRESH = (95, 95, 100)        # just deposited: dark, wet
CURED = (200, 198, 190)      # oldest layers: light
FAILED = (205, 60, 50)
STEEL = (120, 126, 135)
ACCENT = (235, 130, 35)
DARK = (40, 40, 45)
BED = (225, 225, 220)
BUILD = 10                    # raise when the geometry code changes: stored
                             # meshes from an older build are then ignored
COLLAPSE_STEPS = 3.0         # slider steps over which the failure develops


# ----------------------------------------------------------- small helpers
def _lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def _interp(values, t):
    """Linear interpolation in a list for t in [0, 1]."""
    if not values:
        return t * t
    x = max(0.0, min(1.0, t)) * (len(values) - 1)
    i = min(len(values) - 2, int(x))
    return values[i] + (values[i + 1] - values[i]) * (x - i)


def _box(x0, x1, y0, y1, z0, z1, col, verts, faces, cols):
    b = len(verts)
    verts.extend([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                  (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)])
    for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
              (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        faces.append(tuple(b + k for k in f))
    cols.extend([col] * 8)


# ------------------------------------------------- shape along the path
def find_corners(normals):
    """Indices of corner centres of a closed path, from the turning of the
    normal between equidistant samples. Empty for smooth paths."""
    n = len(normals)
    turn = []
    for i in range(n):
        a, b = normals[i], normals[(i + 1) % n]
        turn.append(abs(math.atan2(a[0] * b[1] - a[1] * b[0],
                                   a[0] * b[0] + a[1] * b[1])))
    thr = 2.5 * (2 * math.pi / n)
    hot = [t > thr for t in turn]
    if all(hot) or not any(hot):
        return []
    start = next(i for i in range(n) if hot[i] and not hot[i - 1])
    corners, i, seen = [], start, 0
    while seen < n:
        if hot[i % n]:
            j, wsum, isum = i, 0.0, 0.0
            while hot[j % n] and j - i < n:
                wsum += turn[j % n]
                isum += turn[j % n] * (j + 0.5)
                j += 1
            corners.append(isum / wsum)
            seen += j - i
            i = j
        else:
            i += 1
            seen += 1
    return corners


def lateral_factors(normals, closed, edge="free"):
    """Out-of-plane factor in [-1, 1] at every sample."""
    n = len(normals)
    if not closed:
        if edge == "simply":
            return [math.sin(math.pi * i / (n - 1)) for i in range(n)]
        if edge == "clamped":
            return [0.5 * (1 - math.cos(2 * math.pi * i / (n - 1))) for i in range(n)]
        return [1.0] * n                                  # free wall leans
    corners = find_corners(normals)
    if len(corners) < 3:                                  # smooth loop
        return [math.cos(4 * math.pi * i / n) for i in range(n)]
    walls = []
    for k in range(len(corners)):
        a = corners[k]
        b = corners[(k + 1) % len(corners)]
        if b <= a:
            b += n
        walls.append((a, b))
    longest = max(b - a for a, b in walls)
    out = [0.0] * n
    for k, (a, b) in enumerate(walls):
        sign = 1.0 if k % 2 == 0 else -1.0
        scale = ((b - a) / longest) ** 2                  # short walls move less
        i = int(math.ceil(a))
        while i < b:
            out[i % n] = sign * scale * math.sin(math.pi * (i - a) / (b - a))
            i += 1
    return out


# ------------------------------------------------------------ the wall
class Deform(object):
    """Maps an undeformed point of the wall to its displayed position.

    Elastic buckling is drawn as bending of the wall: the centre line moves
    out of plane by w(z) = amplitude x path factor x mode shape, every layer
    turns with the slope dw/dz, and the wall gets lower by the amount that
    bending without stretching requires (the integral of w'^2 / 2).

    Plastic collapse is drawn as yielding of the base: the lowest fifth of
    the wall is squashed and spreads sideways, most near the bed, and the
    wall above rides down on it. The settlement is not the same everywhere
    along the path, so the wall above ends up leaning slightly.

    Amplitudes are chosen for visibility; see the note at the top."""

    N = 40

    def __init__(self, mode, amount, h, tl, height, shape):
        e = _smooth(amount)                       # slow start, then fast
        self.buckle = e if mode == "elastic buckling" else 0.0
        self.crush = e if mode == "plastic collapse" else 0.0
        self.h, self.tl, self.height = h, tl, max(height, 1e-9)
        n = self.N
        S = [_interp(shape, k / float(n)) for k in range(n + 1)]
        self.S = S
        self.dS = [(S[min(n, k + 1)] - S[max(0, k - 1)]) * n /
                   float(min(n, k + 1) - max(0, k - 1)) for k in range(n + 1)]
        self.I = [0.0]                            # integral of dS^2 / 2
        for k in range(n):
            self.I.append(self.I[-1] + 0.25 * (self.dS[k] ** 2 + self.dS[k + 1] ** 2) / n)

    def point(self, x, y, nx, ny, fac, side, z):
        hw = 0.5 * self.h
        off = 0.0
        if self.crush:
            zone = max(3.0 * self.tl, 0.2 * self.height)
            drop = 0.5 * self.crush * (1.0 + 0.3 * fac)       # uneven settlement
            t = min(1.0, z / zone)
            # widening: largest just above the bed (the bed holds the very
            # bottom in place), fading out at the top of the yielded zone
            spread = 1.5 * self.crush * (1.0 + 0.3 * fac) * (1 - t) ** 1.5 * (0.35 + 0.65 * min(1.0, 4 * t))
            hw *= 1.0 + spread
            if z < zone:
                # more squashing near the bed than at the top of the zone
                z = zone * t * (1 - drop * (1.3 - 0.3 * t))
            else:
                lean = 0.07 * self.crush * fac                 # about 4 degrees
                off = lean * (z - zone)
                z = z - drop * zone
        if self.buckle:
            a = 1.5 * self.h * self.buckle * fac
            t = max(0.0, min(1.0, z / self.height))
            off = a * _interp(self.S, t)
            slope = a * _interp(self.dS, t) / self.height
            z = max(0.0, z - a * a * _interp(self.I, t) / self.height - side * hw * slope)
        return (x + nx * (side * hw + off), y + ny * (side * hw + off), z)


def strip(samples, closed, frac, z0, z1, deform, verts, faces):
    """Append one layer (or the first `frac` of it) as a box strip.
    samples: list of (x, y, nx, ny, factor)."""
    n = len(samples)
    seg_total = n if closed else n - 1
    nseg = int(math.floor(seg_total * frac + 1e-9))
    if nseg < 1:
        return
    base = len(verts)
    for i in range(nseg + 1):
        x, y, nx, ny, fac = samples[i % n]
        verts.append(deform.point(x, y, nx, ny, fac, +1, z0))
        verts.append(deform.point(x, y, nx, ny, fac, -1, z0))
        verts.append(deform.point(x, y, nx, ny, fac, -1, z1))
        verts.append(deform.point(x, y, nx, ny, fac, +1, z1))
    for i in range(nseg):
        a, b = base + 4 * i, base + 4 * (i + 1)
        faces.append((a, a + 3, b + 3, b))          # outer side
        faces.append((a + 1, b + 1, b + 2, a + 2))  # inner side
        faces.append((a + 3, a + 2, b + 2, b + 3))  # top
        faces.append((a, b, b + 1, a + 1))          # bottom
    if not (closed and nseg == seg_total):           # end caps
        e = base + 4 * nseg
        faces.append((base, base + 1, base + 2, base + 3))
        faces.append((e, e + 3, e + 2, e + 1))


def build_wall(points, normals, closed, h, tl, step, fail_layer=None,
               mode=None, shape=None, edge="free"):
    """Returns verts, faces, colours, nozzle tip (x, y, z), failure amount 0..1."""
    amount = 0.0
    if fail_layer is not None and step >= fail_layer:
        amount = min(1.0, (step - fail_layer) / COLLAPSE_STEPS)
        failed, step = True, float(fail_layer)
    else:
        failed = False
    full = int(math.floor(step + 1e-9))
    part = step - full
    plastic = mode == "plastic collapse"
    if failed and plastic:
        # slow variation along the path, used for uneven settlement
        m = float(len(points) if closed else 2 * (len(points) - 1))
        fac = [math.sin(2 * math.pi * i / m + 0.9) for i in range(len(points))]
    elif failed:
        fac = lateral_factors(normals, closed, edge)
    else:
        fac = [0.0] * len(points)
    fwd = [(points[i][0], points[i][1], normals[i][0], normals[i][1], fac[i])
           for i in range(len(points))]
    # an open path is printed back and forth: odd layers run in reverse.
    # The normal is flipped (and the factor with it) to keep the mesh winding.
    back = [(x, y, -nx, -ny, f if plastic else -f) for (x, y, nx, ny, f) in reversed(fwd)]
    deform = Deform(mode, amount, h, tl, full * tl, shape)

    def run(i):
        return fwd if (closed or i % 2 == 0) else back

    verts, faces, cols = [], [], []
    for i in range(full):
        v0 = len(verts)
        strip(run(i), closed, 1.0, i * tl, (i + 1) * tl, deform, verts, faces)
        age = (full - 1 - i) / (full - 1.0) if full > 1 else 0.0
        c = _lerp(FRESH, CURED, min(1.0, age * 1.5))
        if failed:
            c = _lerp(c, FAILED, 0.35 + 0.45 * amount)
        if i % 2:                                        # visible layer lines
            c = _lerp(c, (0, 0, 0), 0.16)
        cols.extend([c] * (len(verts) - v0))
    n = len(points)
    seg_total = n if closed else n - 1
    if failed:
        x, y = run(full)[0][:2]
        tip = (x, y, full * tl + 0.5 * tl)               # lifted clear, stopped
    elif part > 1e-6:
        v0 = len(verts)
        strip(run(full), closed, part, full * tl, (full + 1) * tl, deform, verts, faces)
        cols.extend([FRESH] * (len(verts) - v0))
        k = int(math.floor(seg_total * part + 1e-9))
        x, y = run(full)[k % n][:2]
        tip = (x, y, (full + 1) * tl)
    else:
        x, y = run(full)[0][:2]
        tip = (x, y, (full + 1) * tl)
    return verts, faces, cols, tip, (amount if failed else None)


# ------------------------------------------------------------ the printer
def _nozzle(tip, size, verts, faces, cols, sides=20):
    x0, y0, z0 = tip
    r, hc, hb = 0.45 * size, 0.8 * size, 1.4 * size
    rings = [(0.12 * size, 0.0), (r, hc), (r, hc + hb)]
    base = len(verts)
    for rad, dz in rings:
        for j in range(sides):
            a = 2 * math.pi * j / sides
            verts.append((x0 + rad * math.cos(a), y0 + rad * math.sin(a), z0 + dz))
    for k in range(len(rings) - 1):
        for j in range(sides):
            a, b = base + k * sides + j, base + k * sides + (j + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    verts.append((x0, y0, z0))
    bot = len(verts) - 1
    for j in range(sides):
        faces.append((base + (j + 1) % sides, base + j, bot))
    cols.extend([DARK] * (len(verts) - base))
    return z0 + hc + hb


def frame_dims(points):
    """Beam size and clearance of the printer frame. They depend on the size
    of the print path only, so the printer does not change with the wall."""
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    span = max(max(xs) - min(xs), max(ys) - min(ys))
    return max(60.0, 0.12 * span), max(250.0, 0.5 * span), span


def build_printer(points, tip, h, rail_z):
    """Gantry printer around the path. Returns (moving, fixed), each a
    (verts, faces, cols) triple. rail_z is the height of the top of the rails."""
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    s, m, _ = frame_dims(points)                       # beam size, clearance
    x0, x1, y0, y1 = min(xs) - m, max(xs) + m, min(ys) - m, max(ys) + m
    tx, ty, _ = tip

    mv, mf, mc = [], [], []
    top = _nozzle(tip, 1.1 * s, mv, mf, mc)             # fixed size, like the frame
    _box(tx - 0.4 * s, tx + 0.4 * s, ty - 0.4 * s, ty + 0.4 * s,
         top, top + rail_z, STEEL, mv, mf, mc)                       # Z column
    _box(tx + 0.5 * s, tx + 1.5 * s, y0 - s, y1 + s,
         rail_z, rail_z + s, STEEL, mv, mf, mc)                      # bridge
    _box(tx - 0.7 * s, tx + 1.7 * s, ty - 0.9 * s, ty + 0.9 * s,
         rail_z - 0.3 * s, rail_z + 1.4 * s, ACCENT, mv, mf, mc)     # carriage

    fv, ff, fc = [], [], []
    for yy in (y0 - s, y1):
        _box(x0 - s, x1 + 2 * s, yy, yy + s, rail_z - s, rail_z, STEEL, fv, ff, fc)
        for xx in (x0 - s, x1 + s):
            _box(xx, xx + s, yy, yy + s, 0.0, rail_z - s, STEEL, fv, ff, fc)
    _box(x0, x1, y0 + s, y1 - s, -0.3 * s, 0.0, BED, fv, ff, fc)     # print bed
    return (mv, mf, mc), (fv, ff, fc)


# ------------------------------------------------------------ the camera
def _smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def camera_pose(step, fail, tl, centre, radius, style="story", zoom=1.0):
    """Camera target and location for a given Step.
    radius: half diagonal of the printer frame. Angles in degrees.
    Keys are (step, azimuth, elevation, distance / radius, target height)."""
    F = float(fail) if fail is not None else 40.0
    top = F * tl
    if style == "orbit":
        keys = [(0.0, -60.0, 28.0, 2.4, 0.4 * top),
                (F + COLLAPSE_STEPS + 3.0, 300.0, 28.0, 2.4, 0.4 * top)]
        ease = lambda t: max(0.0, min(1.0, t))           # constant speed
    else:
        a = min(2.5, 0.1 * F)                            # end of the top view
        b = max(a + 1.0, F - 5.0)                        # end of the descent
        keys = [(0.0, -90.0, 72.0, 2.1, 0.0),            # top view
                (a, -90.0, 72.0, 2.1, 0.0),
                (b, 120.0, 30.0, 2.5, 0.4 * top),        # descent around the print
                # From here the camera faces one side of the frame squarely
                # (azimuth 180: no rail on that side, posts left and right of
                # the print), so nothing passes in front of the failing wall.
                (F, 180.0, 22.0, 1.9, 0.6 * top),        # close-up
                (F + COLLAPSE_STEPS, 180.0, 22.0, 1.9, 0.6 * top),   # hold: failure
                (F + COLLAPSE_STEPS + 3.0, 180.0, 55.0, 2.2, 0.5 * top)]  # rise
        ease = _smooth
    k = keys[-1][1:]
    if step <= keys[0][0]:
        k = keys[0][1:]
    else:
        for k0, k1 in zip(keys, keys[1:]):
            s0, v0, s1, v1 = k0[0], k0[1:], k1[0], k1[1:]
            if step <= s1:
                t = ease((step - s0) / (s1 - s0)) if s1 > s0 else 1.0
                k = [v0[j] + (v1[j] - v0[j]) * t for j in range(4)]
                break
    az, el, dist, tz = math.radians(k[0]), math.radians(k[1]), k[2] * radius * 1.25 * zoom, k[3]
    target = (centre[0], centre[1], tz)
    loc = (centre[0] + dist * math.cos(el) * math.cos(az),
           centre[1] + dist * math.cos(el) * math.sin(az),
           tz + dist * math.sin(el))
    return target, loc


def _set_camera(rg, target, loc):
    import Rhino
    view = Rhino.RhinoDoc.ActiveDoc.Views.ActiveView
    if view is None:
        return
    view.ActiveViewport.SetCameraLocations(rg.Point3d(*target), rg.Point3d(*loc))


# ------------------------------------------------------- Grasshopper glue
LIGHT = (0.33, -0.47, 0.82)   # unit vector towards the light


def shaded(verts, faces, cols):
    """Give every face its own vertices and darken its colour by its
    orientation to a fixed light. Grasshopper draws vertex-coloured meshes
    without shading, so the shading is put into the colours here. The
    absolute value makes the result independent of the face winding."""
    V, F, C = [], [], []
    for f in faces:
        p0, p1, p2 = verts[f[0]], verts[f[1]], verts[f[-1]]
        ux, uy, uz = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
        vx, vy, vz = p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]
        nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
        ln = math.sqrt(nx * nx + ny * ny + nz * nz)
        if ln < 1e-12 and len(f) == 4:                   # degenerate corner
            p1 = verts[f[2]]
            ux, uy, uz = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
            nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
            ln = math.sqrt(nx * nx + ny * ny + nz * nz)
        lit = abs(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / ln if ln > 1e-12 else 0.5
        k = 0.50 + 0.50 * lit
        base = cols[f[0]]
        c = tuple(int(round(base[j] * k)) for j in range(3))
        b = len(V)
        for idx in f:
            V.append(verts[idx])
            C.append(c)
        F.append(tuple(range(b, b + len(f))))
    return V, F, C


def _to_mesh(rg, verts, faces, cols):
    import System.Drawing as sd
    verts, faces, cols = shaded(verts, faces, cols)
    m = rg.Mesh()
    for v in verts:
        m.Vertices.Add(float(v[0]), float(v[1]), float(v[2]))
    for f in faces:
        if len(f) == 4:
            m.Faces.AddFace(f[0], f[1], f[2], f[3])
        else:
            m.Faces.AddFace(f[0], f[1], f[2])
    for c in cols:
        m.VertexColors.Add(sd.Color.FromArgb(c[0], c[1], c[2]))
    m.Normals.ComputeNormals()
    m.Compact()
    return m


def _auto_step(g, last):
    """Playback counter kept between solutions (needs a Trigger on Tick)."""
    import scriptcontext as sc
    key = "sapling_preview_step"
    step = float(sc.sticky.get(key, 0.0))
    if g.get("Play"):
        step += float(g.get("Rate") or 0.05)
        if step > last:
            step = 0.0                                   # loop
    sc.sticky[key] = step
    return step


def _gh_main():
    import Rhino.Geometry as rg
    g = globals()
    path = g.get("Path")
    if path is None:
        return None, None, None, "Connect a curve to Path"
    h = float(g.get("h") or 50.0)
    tl = float(g.get("tl") or 10.0)
    fail = g.get("Layers")
    fail = None if fail is None else int(fail)
    mode = g.get("Mode")
    mode = None if mode is None else str(mode).strip().lower()
    shape = g.get("Shape")
    # Sapling gives no mode shape for plastic collapse: the list is then
    # empty or holds a single null.
    if shape is not None and not isinstance(shape, (list, tuple)):
        shape = list(shape) if hasattr(shape, "__iter__") else [shape]
    shape = [float(v) for v in (shape or []) if v is not None]
    shape = shape if len(shape) >= 2 else None
    edge = (g.get("Edge") or "free").strip().lower()
    nseg = int(g.get("Segments") or 120)

    closed = bool(path.IsClosed)
    points, normals = [], []
    for t in path.DivideByCount(nseg, True):
        p, tan = path.PointAt(t), path.TangentAt(t)
        ln = math.hypot(tan.X, tan.Y) or 1.0
        points.append((p.X, p.Y))
        normals.append((-tan.Y / ln, tan.X / ln))

    last = (fail + COLLAPSE_STEPS + 2.0) if fail is not None else 40.0
    step = g.get("Step")
    step = _auto_step(g, last) if step is None else max(0.0, float(step))

    # Meshes are kept per set of inputs, so going back to values that were
    # already shown (e.g. dragging a slider back and forth) is immediate.
    import scriptcontext as sc
    cache = sc.sticky.setdefault("sapling_preview_meshes", {})
    if any(k[0] != BUILD for k in cache):
        cache.clear()
    key = (BUILD, tuple(points), closed, h, tl, round(step, 4), fail, mode,
           tuple(shape) if shape else None, edge)
    if key not in cache:
        if len(cache) > 60:              # keeps memory use modest
            cache.clear()
        verts, faces, cols, tip, amount = build_wall(
            points, normals, closed, h, tl, step, fail, mode, shape, edge)
        wall = _to_mesh(rg, verts, faces, cols) if verts else None

        top_layer = fail if fail is not None else 40
        rail_z = max(1.6 * frame_dims(points)[2], top_layer * tl + 450.0)
        moving, fixed = build_printer(points, tip, h, rail_z)
        nozzle, printer = _to_mesh(rg, *moving), _to_mesh(rg, *fixed)
        cache[key] = (wall, nozzle, printer, amount)
    wall, nozzle, printer, amount = cache[key]

    cam = g.get("Camera")
    cam = str(cam).strip().lower() if cam else ""
    if cam in ("story", "orbit", "true"):
        xs, ys = [p[0] for p in points], [p[1] for p in points]
        s, m, _ = frame_dims(points)
        radius = math.hypot(0.5 * (max(xs) - min(xs)) + m + s,
                            0.5 * (max(ys) - min(ys)) + m + s)
        centre = (0.5 * (max(xs) + min(xs)), 0.5 * (max(ys) + min(ys)))
        _set_camera(rg, *camera_pose(step, fail, tl, centre, radius,
                                     "orbit" if cam == "orbit" else "story",
                                     float(g.get("Zoom") or 1.0)))

    if amount is not None:
        status = "FAILURE at layer %d: %s" % (fail, mode or "")
        if amount > 0:
            status += "\n(deformed shape is illustrative)"
    else:
        status = "Layer %d of %s, height %.0f mm" % (
            int(step) + 1, "?" if fail is None else str(fail), step * tl)
    return wall, nozzle, printer, status


try:
    import Rhino  # noqa: F401  (only inside Rhino)
    Printed, Nozzle, Printer, Status = _gh_main()
except ImportError:
    pass
