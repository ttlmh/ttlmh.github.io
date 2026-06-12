#!/usr/bin/env python3
"""Pack selected generated cases into web-friendly volumes for the project page.

Each case -> one gzip blob containing 4 modalities (CT, T1, T2, PET) as
contiguous uint8 volumes of shape (D, D, D), C-order (x, y, z).
Also renders a thumbnail and writes a manifest.json.
"""
import gzip
import json
from pathlib import Path

import numpy as np
import nibabel as nib
from PIL import Image

BASE = Path("outputs/generated_600_samples_guided/images")
OUT = Path("project_page/assets/volumes")
THUMB = Path("project_page/assets/img")
OUT.mkdir(parents=True, exist_ok=True)

MODS = ["CT", "T1", "T2", "PET"]
CASES = [0, 6, 9, 13, 16, 21, 24, 29, 33, 42]
D = 128  # output cube size


def block_mean(vol, factor):
    s = vol.shape[0] // factor
    vol = vol[: s * factor, : s * factor, : s * factor]
    vol = vol.reshape(s, factor, s, factor, s, factor)
    return vol.mean(axis=(1, 3, 5))


def load(case, mod):
    v = nib.load(str(BASE / f"sample_{case:04d}_{mod}.nii.gz")).get_fdata().astype(np.float32)
    v = np.clip(v, 0.0, 1.0)
    f = v.shape[0] // D
    if f > 1:
        v = block_mean(v, f)
    return np.ascontiguousarray(v)


def to_u8(v):
    return np.clip(v * 255.0, 0, 255).astype(np.uint8)


manifest = {"dim": D, "modalities": MODS, "cases": []}

for ci, case in enumerate(CASES):
    vols = {m: load(case, m) for m in MODS}
    blob = b"".join(to_u8(vols[m]).tobytes(order="C") for m in MODS)
    raw = gzip.compress(blob, compresslevel=9)
    name = f"case_{ci:02d}.bin.gz"
    (OUT / name).write_bytes(raw)

    # thumbnail: CT coronal mid with PET hot overlay
    ct = vols["CT"]
    pet = vols["PET"]
    yc = D // 2
    ct_s = np.rot90(ct[:, yc, :])
    pet_s = np.rot90(pet[:, yc, :])
    base = np.clip(ct_s * 1.05, 0, 1)
    rgb = np.stack([base, base, base], axis=-1)
    p = np.clip((pet_s - 0.12) / 0.88, 0, 1)  # suppress low background uptake
    hot = np.zeros_like(rgb)
    hot[..., 0] = np.clip(p * 2.4, 0, 1)
    hot[..., 1] = np.clip(p * 2.4 - 1.0, 0, 1)
    rgb = np.clip(rgb + hot * 0.55, 0, 1)
    im = Image.fromarray((rgb * 255).astype(np.uint8)).resize((220, 220), Image.LANCZOS)
    im.save(THUMB / f"thumb_{ci:02d}.jpg", quality=88)

    manifest["cases"].append(
        {"id": ci, "file": name, "label": f"Phantom #{ci + 1:02d}", "src": f"sample_{case:04d}", "bytes": len(raw)}
    )
    print(f"case {case} -> {name} ({len(raw)/1e6:.2f} MB gz)")

(Path("project_page/assets") / "manifest.json").write_text(json.dumps(manifest, indent=1))
total = sum(c["bytes"] for c in manifest["cases"]) / 1e6
print(f"total gz: {total:.1f} MB across {len(CASES)} cases")
