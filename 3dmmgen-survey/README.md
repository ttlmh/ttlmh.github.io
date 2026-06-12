# Project page — Quad-modal Digital Patient Phantoms

Static academic project page with an interactive, 3D-Slicer-like tri-planar
viewer of 10 generated quad-modal (CT / T1w / T2w / FDG-PET) phantoms.

## Run locally
Must be served over HTTP (the viewer uses `fetch` + gzip `DecompressionStream`;
opening `index.html` via `file://` will not load the volumes):

```bash
cd project_page
python3 -m http.server 8765
# open http://localhost:8765
```

## Deploy
Copy the `project_page/` folder to any static host (GitHub Pages, Netlify, S3, …).
No build step. Total payload ≈ 33 MB; each phantom (~3 MB gzip) is fetched lazily
when selected.

## Viewer
- Three linked panes (axial / coronal / sagittal). Drag on any pane to move the
  crosshair; use the slider under each pane to scroll slices.
- Toggle modalities to fuse them (multi-select, additive blend). Each has its own
  opacity slider — e.g. CT + FDG PET for a fusion view, or all four for alignment.
- Global brightness and crosshair toggles.

## Regenerate the volume data
Cases and resolution are defined in `pack_volumes.py` (`CASES`, `D`). Re-run from
the repo root:

```bash
python project_page/pack_volumes.py
```

This reads `outputs/generated_600_samples_guided/images/`, downsamples each
256³ volume to `D³` uint8, packs the four modalities into one gzip blob per case,
renders thumbnails, and writes `assets/manifest.json`.

## Notes
- The Paper / Code / arXiv links in the header are placeholders (`#`).
- The reader-study section is intentionally a "coming soon" placeholder.
- All phantoms shown are fully synthetic and contain no patient data.
