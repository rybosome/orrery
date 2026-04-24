# Orrery

Minimal Vite + React + TypeScript app that renders a basic Three.js scene using an imperative `canvas` setup (no `@react-three/fiber`).

This standalone app is a renderer / Three.js viewer for tspice.

## Development

From repo root:

- `pnpm install`
- `pnpm run dev`

## NAIF kernels

This viewer ships a small set of **NAIF Generic Kernels** as static assets under `public/kernels/naif/`:

- `lsk/naif0012.tls` (LSK)
- `pck/pck00011.tpc` (PCK)
- `spk/planets/de432s.bsp` (SPK)

These kernel files are redistributed **unmodified**, consistent with NAIF's rules:
https://naif.jpl.nasa.gov/naif/rules.html

## Scripts

From repo root:

- `pnpm run format` (auto-format)
- `pnpm run format:check` (CI)
- `pnpm run lint`
- `pnpm run lint:fix`
- `pnpm run build`
- `pnpm run typecheck`
- `pnpm run test`

## Conventions

### Frames / world space

- Canonical world (inertial) frame: `J2000`.
- `x/y/z` axis mapping is **1:1** with Three.js world axes.
- Handedness: follow SPICE conventions for the requested frame (for `J2000`, treat it as a right-handed inertial frame).

### Time

- `et` is **ephemeris time** in **seconds past the J2000 epoch**.
- In this codebase we represent it as a plain `number` (`EtSeconds`).

> Note: The exact J2000 epoch in SPICE is `2000-01-01 12:00:00 TT`.

### Units

- Positions are expressed in **kilometers** (`positionKm`).
- Velocities are expressed in **kilometers per second** (`velocityKmPerSec`).
- Radii (for rendering) are expressed in **kilometers** (`radiusKm`).

### Scaling to renderer units

SPICE scales are huge for typical WebGL scenes.

A reasonable starting point is:

- `1 threeUnit = 1,000 km` (`kmToWorld = 1 / 1000`)

The current demo scene (`src/SceneCanvas.tsx`) uses a more aggressive scale:

- `1 threeUnit = 1,000,000 km` (`kmToWorld = 1 / 1_000_000`)

…and then applies a per-body visual `radiusScale` so planets are still visible.

Tune this depending on camera near/far planes, desired look, and precision.

## Precision strategy (Issue #68)

This viewer implements **Strategy A — focus-origin rebasing ("floating origin")**.

WebGL vertices end up in 32-bit float space; solar-system-scale positions (e.g. 1 AU in km) lose fine detail when used directly as world coordinates.

Implementation in `src/scene/precision.ts` + `src/SceneCanvas.tsx`:

- Query body positions in a stable inertial frame (`J2000`) relative to a stable observer (we use `SUN`).
- Pick a **focus target** (defaults to Earth).
- Each update, compute `rebasedKm = bodyPosKm - focusPosKm`.
- Convert `rebasedKm` into renderer units via `kmToWorld` and assign to Three.js object positions.

This keeps the camera and nearby bodies numerically close to the origin, improving effective precision.

### Debug/e2e query params (retained)

Scene sharing/state restoration should use snapshot paths (`/s/<payload>`). Query params are intentionally limited to explicit debug/e2e startup flags:

- `?logDepth=1` (or presence): opt-in to Three's logarithmic depth buffer.
  - This is **not** the primary precision strategy (it helps with depth range / z-fighting more than large-coordinate jitter), but it can be useful when experimenting with bigger far planes.
- `?e2e=1` (or presence): enable deterministic e2e mode.
- `?et=<number>`: e2e-only initial ET override.
- `?sunPostprocessMode=off|wholeFrame|sunIsolated`: e2e-only boot override for postprocess mode.
- `?sunToneMap=none|filmic|acesLike`: e2e-only boot override for tonemap selection.

## Viewer controls

In local dev (non-e2e), the viewer exposes a tiny overlay:

- ET slider + play/pause
- focus target selection (Sun/Earth/Moon)
- optional debug axes:
  - `J2000` axes at the origin
  - body-fixed axes at each body (Earth: `IAU_EARTH`, Moon: `IAU_MOON`)

### Frame transforms

`SpiceClient.getFrameTransform({ from, to, et })` returns a `Mat3` rotation matrix.

- Representation: a flat `number[9]` in **column-major** order to match Three.js `Matrix3`.
- Indexing:
  - `m = [
  m00, m10, m20,
  m01, m11, m21,
  m02, m12, m22
]`
  - This corresponds to columns `c0=(m00,m10,m20)`, `c1=(m01,m11,m21)`, `c2=(m02,m12,m22)`.

The transform is intended to be applied as:

- `v_to = M(from->to) * v_from`

## What’s included

- `src/spice/SpiceClient.ts`: a minimal renderer-facing interface
- `src/spice/createSpiceClient.ts`: viewer integration layer (WASM backend + default NAIF kernels)
- `src/spice/createCachedSpiceClient.ts`: single-entry (`et`-keyed) cache wrapper for viewer perf
- `src/scene/SceneModel.ts`: types describing bodies and render styling

## Visual regression testing

Playwright e2e tests live in `e2e`.

From repo root:

- `pnpm run e2e`
