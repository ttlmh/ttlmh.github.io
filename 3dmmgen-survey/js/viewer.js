/* Slicer-like tri-planar viewer with multi-modal overlay.
 * Volume blob layout: [CT, T1, T2, PET], each D^3 uint8, C-order idx=(x*D+y)*D+z. */

const MOD_ORDER = ["CT", "T1", "T2", "PET"];

// Per-modality display config. "gray" tints multiply a base colour; "hot" uses a ramp.
const MOD_CFG = {
  CT:  { type: "gray", color: [255, 255, 255], label: "CT" },
  T1:  { type: "gray", color: [255, 196, 92],  label: "T1w MRI" },
  T2:  { type: "gray", color: [86, 226, 178],  label: "T2w MRI" },
  PET: { type: "hot",  color: [255, 120, 40],  label: "FDG PET" },
};

class TriViewer {
  constructor(root) {
    this.root = root;
    this.D = 128;
    this.vols = null;           // {CT:Uint8Array, ...}
    this.active = { CT: true, T1: false, T2: false, PET: false };
    this.opacity = { CT: 1, T1: 1, T2: 1, PET: 0.85 };
    this.pos = { x: 64, y: 64, z: 64 };
    this.brightness = 1.0;
    this.showCross = true;

    this.views = {};            // name -> {wrap,img,cross,ictx,cctx,slider}
    ["axial", "coronal", "sagittal"].forEach((name) => this._buildView(name));
  }

  _buildView(name) {
    const wrap = this.root.querySelector(`.view[data-view="${name}"]`);
    const img = wrap.querySelector("canvas.img");
    const cross = wrap.querySelector("canvas.cross");
    const slider = wrap.querySelector("input[type=range]");
    const D = this.D;
    img.width = D; img.height = D;
    const ictx = img.getContext("2d");
    this.imgData = this.imgData || ictx.createImageData(D, D);

    const v = { wrap, img, cross, ictx, cctx: cross.getContext("2d"), slider };
    this.views[name] = v;

    slider.min = 0; slider.max = D - 1; slider.value = this.pos[this._axisOf(name)];
    slider.addEventListener("input", () => {
      this.pos[this._axisOf(name)] = parseInt(slider.value, 10);
      this.render();
    });

    const handle = (ev) => {
      const r = cross.getBoundingClientRect();
      const cx = (ev.clientX - r.left) / r.width;
      const cy = (ev.clientY - r.top) / r.height;
      if (cx < 0 || cx > 1 || cy < 0 || cy > 1) return;
      let col = Math.min(D - 1, Math.max(0, Math.floor(cx * D)));
      let row = Math.min(D - 1, Math.max(0, Math.floor(cy * D)));
      this._setFromClick(name, col, row);
      this.render();
      this._syncSliders();
    };
    let dragging = false;
    cross.addEventListener("pointerdown", (e) => { dragging = true; cross.setPointerCapture(e.pointerId); handle(e); });
    cross.addEventListener("pointermove", (e) => { if (dragging) handle(e); });
    cross.addEventListener("pointerup", () => { dragging = false; });
    cross.addEventListener("pointerleave", () => { dragging = false; });
  }

  _axisOf(name) { return name === "axial" ? "z" : name === "coronal" ? "y" : "x"; }

  _setFromClick(name, col, row) {
    const D = this.D;
    if (name === "axial")    { this.pos.x = col; this.pos.y = D - 1 - row; }
    if (name === "coronal")  { this.pos.x = col; this.pos.z = D - 1 - row; }
    if (name === "sagittal") { this.pos.y = col; this.pos.z = D - 1 - row; }
  }

  _syncSliders() {
    for (const [name, v] of Object.entries(this.views)) v.slider.value = this.pos[this._axisOf(name)];
  }

  setVolumes(vols) { this.vols = vols; this.render(); }

  toggleModality(mod, on) { this.active[mod] = on; this.render(); }
  setOpacity(mod, val) { this.opacity[mod] = val; this.render(); }
  setBrightness(val) { this.brightness = val; this.render(); }
  setCrosshair(on) { this.showCross = on; this.render(); }

  // index helpers for the three planes
  _idx(name, plane, row, col) {
    const D = this.D;
    let x, y, z;
    if (name === "axial")    { x = col; y = D - 1 - row; z = plane; }
    else if (name === "coronal") { x = col; y = plane; z = D - 1 - row; }
    else { x = plane; y = col; z = D - 1 - row; }
    return (x * D + y) * D + z;
  }

  render() {
    if (!this.vols) return;
    const D = this.D;
    const data = this.imgData.data;
    const planeOf = { axial: this.pos.z, coronal: this.pos.y, sagittal: this.pos.x };
    const activeMods = MOD_ORDER.filter((m) => this.active[m] && this.vols[m]);
    const br = this.brightness;

    for (const name of ["axial", "coronal", "sagittal"]) {
      const plane = planeOf[name];
      let p = 0;
      for (let row = 0; row < D; row++) {
        for (let col = 0; col < D; col++) {
          const idx = this._idx(name, plane, row, col);
          let r = 0, g = 0, b = 0;
          for (const m of activeMods) {
            const val = this.vols[m][idx] / 255;
            if (val <= 0) continue;
            const cfg = MOD_CFG[m];
            const op = this.opacity[m];
            if (cfg.type === "hot") {
              const t = val;
              r += Math.min(1, t * 2.5) * 255 * op;
              g += Math.min(1, Math.max(0, t * 2.5 - 1.0)) * 255 * op;
              b += Math.min(1, Math.max(0, t * 2.5 - 2.0)) * 255 * op;
            } else {
              r += cfg.color[0] / 255 * val * 255 * op;
              g += cfg.color[1] / 255 * val * 255 * op;
              b += cfg.color[2] / 255 * val * 255 * op;
            }
          }
          data[p++] = Math.min(255, r * br);
          data[p++] = Math.min(255, g * br);
          data[p++] = Math.min(255, b * br);
          data[p++] = 255;
        }
      }
      this.views[name].ictx.putImageData(this.imgData, 0, 0);
      this._drawCross(name);
    }
  }

  _drawCross(name) {
    const v = this.views[name];
    const c = v.cross;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = v.cctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!this.showCross) return;
    const D = this.D;
    let cc, rr;
    if (name === "axial")    { cc = this.pos.x; rr = D - 1 - this.pos.y; }
    else if (name === "coronal") { cc = this.pos.x; rr = D - 1 - this.pos.z; }
    else { cc = this.pos.y; rr = D - 1 - this.pos.z; }
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
