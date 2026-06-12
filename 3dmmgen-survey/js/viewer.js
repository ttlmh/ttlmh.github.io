/* Slicer-like tri-planar viewer with multi-modal overlay.
 * Volume blob layout: [CT, T1, T2, PET], each D^3 uint8, C-order idx=(x*D+y)*D+z.
 *
 * Two display dimensions are user-controllable:
 *   - colorMode[mod] : "color" (modality colormap) | "gray" (pure grayscale)
 *   - layout         : "fuse" (tri-planar alpha overlay) | "grid" (2x2, one modality per cell) */

const MOD_ORDER = ["CT", "T1", "T2", "PET"];
const PLANES = ["axial", "coronal", "sagittal"];
const PLANE_LABEL = { axial: "Axial", coronal: "Coronal", sagittal: "Sagittal" };

// Per-modality colormap. "gray"/"tint" multiply a base colour; "hot" uses a ramp.
const MOD_CFG = {
  CT:  { type: "tint", color: [255, 255, 255], label: "CT" },
  T1:  { type: "tint", color: [255, 196, 92],  label: "T1w MRI" },
  T2:  { type: "tint", color: [86, 226, 178],  label: "T2w MRI" },
  PET: { type: "hot",  color: [255, 120, 40],  label: "FDG PET" },
};

class TriViewer {
  constructor(root) {
    this.root = root;
    this.D = 128;
    this.vols = null;           // {CT:Uint8Array, ...}
    this.active = { CT: true, T1: false, T2: false, PET: false };
    this.opacity = { CT: 1, T1: 1, T2: 1, PET: 0.85 };
    // default: CT grayscale (radiology convention), others use their colormap
    this.colorMode = { CT: "gray", T1: "color", T2: "color", PET: "color" };
    this.pos = { x: 64, y: 64, z: 64 };
    this.brightness = 1.0;
    this.showCross = true;

    this.layout = "fuse";       // "fuse" | "grid"
    this.gridPlane = "axial";   // active plane while in grid layout

    this.panes = [];            // active pane descriptors
    this.imgData = null;
    this.panesEl = root.querySelector(".panes");
    this.planebarEl = root.querySelector(".planebar");
    this.gridSlider = null;
  }

  // Call after D is known.
  init() {
    this.imgData = new ImageData(this.D, this.D);
    this.pos = { x: this.D >> 1, y: this.D >> 1, z: this.D >> 1 };
    this._buildPanes();
  }

  _axisOf(name) { return name === "axial" ? "z" : name === "coronal" ? "y" : "x"; }

  // ---- pane construction ----------------------------------------------------
  _buildPanes() {
    this.panes = [];
    this.panesEl.innerHTML = "";
    this.panesEl.classList.toggle("is-grid", this.layout === "grid");

    if (this.layout === "fuse") {
      if (this.planebarEl) { this.planebarEl.hidden = true; this.planebarEl.innerHTML = ""; }
      this.gridSlider = null;
      for (const plane of PLANES) {
        this.panes.push(this._makePane({
          kind: "plane", plane, label: PLANE_LABEL[plane], withSlider: true,
        }));
      }
    } else {
      for (const mod of MOD_ORDER) {
        this.panes.push(this._makePane({
          kind: "mod", mod, plane: this.gridPlane, label: MOD_CFG[mod].label, withSlider: false,
        }));
      }
      this._buildPlanebar();
      if (this.planebarEl) this.planebarEl.hidden = false;
    }
  }

  _makePane(opt) {
    const D = this.D;
    const view = document.createElement("div");
    view.className = "view";

    const tag = document.createElement("span");
    tag.className = "tag";
    if (opt.kind === "mod") {
      const sw = document.createElement("i");
      sw.className = "tag-swatch";
      const c = MOD_CFG[opt.mod].color;
      sw.style.background = this.colorMode[opt.mod] === "gray"
        ? "#cfd6df" : `rgb(${c[0]},${c[1]},${c[2]})`;
      tag.appendChild(sw);
      tag.appendChild(document.createTextNode(opt.label));
    } else {
      tag.textContent = opt.label;
    }

    const stack = document.createElement("div");
    stack.className = "canvas-stack";
    const img = document.createElement("canvas");
    img.className = "img"; img.width = D; img.height = D;
    const cross = document.createElement("canvas");
    cross.className = "cross";
    stack.appendChild(img); stack.appendChild(cross);

    view.appendChild(tag);
    view.appendChild(stack);

    const pane = {
      kind: opt.kind, plane: opt.plane, mod: opt.mod, view, tag,
      img, cross, ictx: img.getContext("2d"), cctx: cross.getContext("2d"), slider: null,
    };

    if (opt.withSlider) {
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = 0; slider.max = D - 1;
      slider.value = this.pos[this._axisOf(opt.plane)];
      slider.setAttribute("aria-label", opt.label + " slice");
      slider.addEventListener("input", () => {
        this.pos[this._axisOf(opt.plane)] = parseInt(slider.value, 10);
        this.render();
      });
      view.appendChild(slider);
      pane.slider = slider;
    }

    this._wirePointer(pane);
    this.panesEl.appendChild(view);
    return pane;
  }

  _buildPlanebar() {
    if (!this.planebarEl) return;
    this.planebarEl.innerHTML = "";

    const sel = document.createElement("div");
    sel.className = "plane-select";
    for (const plane of PLANES) {
      const b = document.createElement("button");
      b.className = "pl" + (plane === this.gridPlane ? " on" : "");
      b.dataset.plane = plane;
      b.textContent = PLANE_LABEL[plane];
      b.addEventListener("click", () => this.setGridPlane(plane));
      sel.appendChild(b);
    }

    const wrap = document.createElement("label");
    wrap.className = "grid-slice-wrap";
    wrap.appendChild(document.createTextNode("Slice"));
    const slider = document.createElement("input");
    slider.type = "range"; slider.className = "grid-slice";
    slider.min = 0; slider.max = this.D - 1;
    slider.value = this.pos[this._axisOf(this.gridPlane)];
    slider.setAttribute("aria-label", "Slice");
    slider.addEventListener("input", () => {
      this.pos[this._axisOf(this.gridPlane)] = parseInt(slider.value, 10);
      this.render();
    });
    wrap.appendChild(slider);
    this.gridSlider = slider;

    this.planebarEl.appendChild(sel);
    this.planebarEl.appendChild(wrap);
  }

  _wirePointer(pane) {
    const D = this.D;
    const handle = (ev) => {
      const r = pane.cross.getBoundingClientRect();
      const cx = (ev.clientX - r.left) / r.width;
      const cy = (ev.clientY - r.top) / r.height;
      if (cx < 0 || cx > 1 || cy < 0 || cy > 1) return;
      const col = Math.min(D - 1, Math.max(0, Math.floor(cx * D)));
      const row = Math.min(D - 1, Math.max(0, Math.floor(cy * D)));
      this._setFromClick(pane.plane, col, row);
      this.render();
      this._syncSliders();
    };
    let dragging = false;
    pane.cross.addEventListener("pointerdown", (e) => { dragging = true; pane.cross.setPointerCapture(e.pointerId); handle(e); });
    pane.cross.addEventListener("pointermove", (e) => { if (dragging) handle(e); });
    pane.cross.addEventListener("pointerup", () => { dragging = false; });
    pane.cross.addEventListener("pointerleave", () => { dragging = false; });
  }

  _setFromClick(plane, col, row) {
    const D = this.D;
    if (plane === "axial")    { this.pos.x = col; this.pos.y = D - 1 - row; }
    if (plane === "coronal")  { this.pos.x = col; this.pos.z = D - 1 - row; }
    if (plane === "sagittal") { this.pos.y = col; this.pos.z = D - 1 - row; }
  }

  _syncSliders() {
    for (const pane of this.panes) {
      if (pane.slider) pane.slider.value = this.pos[this._axisOf(pane.plane)];
    }
    if (this.gridSlider) this.gridSlider.value = this.pos[this._axisOf(this.gridPlane)];
  }

  // ---- public setters -------------------------------------------------------
  setVolumes(vols) { this.vols = vols; this.render(); }
  toggleModality(mod, on) { this.active[mod] = on; this.render(); }
  setOpacity(mod, val) { this.opacity[mod] = val; this.render(); }
  setBrightness(val) { this.brightness = val; this.render(); }
  setCrosshair(on) { this.showCross = on; this.render(); }

  setColorMode(mod, mode) {
    this.colorMode[mod] = mode;        // "color" | "gray"
    // refresh grid-cell swatch if present
    for (const pane of this.panes) {
      if (pane.kind === "mod" && pane.mod === mod) {
        const sw = pane.tag.querySelector(".tag-swatch");
        if (sw) {
          const c = MOD_CFG[mod].color;
          sw.style.background = mode === "gray" ? "#cfd6df" : `rgb(${c[0]},${c[1]},${c[2]})`;
        }
      }
    }
    this.render();
  }

  setLayout(mode) {
    if (this.layout === mode) return;
    this.layout = mode;
    this._buildPanes();
    this.render();
  }

  setGridPlane(plane) {
    this.gridPlane = plane;
    for (const pane of this.panes) pane.plane = plane;
    if (this.planebarEl) {
      this.planebarEl.querySelectorAll(".pl").forEach((b) =>
        b.classList.toggle("on", b.dataset.plane === plane));
    }
    if (this.gridSlider) this.gridSlider.value = this.pos[this._axisOf(plane)];
    this.render();
  }

  // ---- colour mapping -------------------------------------------------------
  // val in [0,1] -> [r,g,b] in 0..255 (pre-opacity, pre-brightness)
  _colorOf(mod, val) {
    if (this.colorMode[mod] === "gray") {
      const g = val * 255;
      return [g, g, g];
    }
    const cfg = MOD_CFG[mod];
    if (cfg.type === "hot") {
      const t = val;
      return [
        Math.min(1, t * 2.5) * 255,
        Math.min(1, Math.max(0, t * 2.5 - 1.0)) * 255,
        Math.min(1, Math.max(0, t * 2.5 - 2.0)) * 255,
      ];
    }
    return [cfg.color[0] / 255 * val * 255, cfg.color[1] / 255 * val * 255, cfg.color[2] / 255 * val * 255];
  }

  // global index of (plane, slice, row, col)
  _idx(plane, slice, row, col) {
    const D = this.D;
    let x, y, z;
    if (plane === "axial")        { x = col; y = D - 1 - row; z = slice; }
    else if (plane === "coronal") { x = col; y = slice; z = D - 1 - row; }
    else                          { x = slice; y = col; z = D - 1 - row; }
    return (x * D + y) * D + z;
  }

  // ---- rendering ------------------------------------------------------------
  render() {
    if (!this.vols || !this.imgData) return;
    for (const pane of this.panes) {
      this._renderPane(pane);
      this._drawCross(pane);
    }
  }

  _renderPane(pane) {
    const D = this.D;
    const data = this.imgData.data;
    const plane = pane.plane;
    const slice = this.pos[this._axisOf(plane)];
    const br = this.brightness;
    const mods = pane.kind === "plane"
      ? MOD_ORDER.filter((m) => this.active[m] && this.vols[m])
      : [pane.mod];

    let p = 0;
    for (let row = 0; row < D; row++) {
      for (let col = 0; col < D; col++) {
        const idx = this._idx(plane, slice, row, col);
        let r = 0, g = 0, b = 0;
        for (const m of mods) {
          const raw = this.vols[m] ? this.vols[m][idx] : 0;
          const val = raw / 255;
          if (val <= 0) continue;
          const op = this.opacity[m];
          const c = this._colorOf(m, val);
          r += c[0] * op; g += c[1] * op; b += c[2] * op;
        }
        data[p++] = Math.min(255, r * br);
        data[p++] = Math.min(255, g * br);
        data[p++] = Math.min(255, b * br);
        data[p++] = 255;
      }
    }
    pane.ictx.putImageData(this.imgData, 0, 0);
  }

  _drawCross(pane) {
    const c = pane.cross;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = pane.cctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!this.showCross) return;
    const D = this.D;
    const plane = pane.plane;
    let cc, rr;
    if (plane === "axial")        { cc = this.pos.x; rr = D - 1 - this.pos.y; }
    else if (plane === "coronal") { cc = this.pos.x; rr = D - 1 - this.pos.z; }
    else                          { cc = this.pos.y; rr = D - 1 - this.pos.z; }
    const X = (cc + 0.5) / D * w, Y = (rr + 0.5) / D * h;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(110, 231, 255, 0.55)";
    ctx.beginPath();
    ctx.moveTo(X, 0); ctx.lineTo(X, h);
    ctx.moveTo(0, Y); ctx.lineTo(w, Y);
    ctx.stroke();
    ctx.fillStyle = "rgba(110, 231, 255, 0.9)";
    ctx.beginPath(); ctx.arc(X, Y, 2.4, 0, Math.PI * 2); ctx.fill();
  }
}

// ---- data loading (gzip blob -> Uint8Array per modality) ----
async function loadCase(url, D) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("fetch failed: " + url);
  let buf;
  if (typeof DecompressionStream !== "undefined") {
    const ds = new DecompressionStream("gzip");
    const stream = resp.body.pipeThrough(ds);
    buf = new Uint8Array(await new Response(stream).arrayBuffer());
  } else {
    buf = pako.inflate(new Uint8Array(await resp.arrayBuffer())); // fallback if pako present
  }
  const n = D * D * D;
  const vols = {};
  MOD_ORDER.forEach((m, i) => { vols[m] = buf.subarray(i * n, (i + 1) * n); });
  return vols;
}

window.TriViewer = TriViewer;
window.loadCase = loadCase;
