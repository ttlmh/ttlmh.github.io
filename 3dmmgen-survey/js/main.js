(async function () {
  const MOD_META = [
    { id: "CT",  label: "CT",        swatch: "#ffffff" },
    { id: "T1",  label: "T1w MRI",   swatch: "#ffc45c" },
    { id: "T2",  label: "T2w MRI",   swatch: "#56e2b2" },
    { id: "PET", label: "FDG PET",   swatch: "#ff7a3c" },
  ];

  const root = document.getElementById("viewer");
  const viewer = new TriViewer(root);
  const loading = document.getElementById("loading");

  // --- manifest ---
  const manifest = await fetch("assets/manifest.json").then((r) => r.json());
  viewer.D = manifest.dim;

  // --- case selector ---
  const caseList = document.getElementById("caseList");
  let currentCase = -1;
  manifest.cases.forEach((c) => {
    const b = document.createElement("button");
    b.className = "case";
    b.innerHTML = `<img src="assets/img/thumb_${String(c.id).padStart(2, "0")}.jpg" alt="${c.label}" loading="lazy"/><span>${c.label}</span>`;
    b.addEventListener("click", () => selectCase(c.id));
    caseList.appendChild(b);
  });

  // --- modality chips with opacity ---
  const modsBox = document.getElementById("mods");
  MOD_META.forEach((m) => {
    const chip = document.createElement("div");
    chip.className = "chip" + (viewer.active[m.id] ? " on" : "");
    chip.innerHTML = `
      <button class="toggle" aria-pressed="${viewer.active[m.id]}">
        <i style="background:${m.swatch}"></i>${m.label}
      </button>
      <input type="range" class="op" min="0" max="1" step="0.05" value="${viewer.opacity[m.id]}" aria-label="${m.label} opacity"/>`;
    const tBtn = chip.querySelector(".toggle");
    const op = chip.querySelector(".op");
    tBtn.addEventListener("click", () => {
      const on = !viewer.active[m.id];
      viewer.toggleModality(m.id, on);
      chip.classList.toggle("on", on);
      tBtn.setAttribute("aria-pressed", on);
    });
    op.addEventListener("input", () => viewer.setOpacity(m.id, parseFloat(op.value)));
    modsBox.appendChild(chip);
  });

  document.getElementById("brightness").addEventListener("input", (e) =>
    viewer.setBrightness(parseFloat(e.target.value)));
  document.getElementById("crosshair").addEventListener("change", (e) =>
    viewer.setCrosshair(e.target.checked));

  async function selectCase(id) {
    if (id === currentCase) return;
    loading.hidden = false;
    [...caseList.children].forEach((el, i) => el.classList.toggle("active", i === id));
    try {
      const c = manifest.cases[id];
      const vols = await loadCase("assets/volumes/" + c.file, viewer.D);
      viewer.setVolumes(vols);
      currentCase = id;
    } catch (err) {
      loading.textContent = "Could not load phantom (serve over http, not file://).";
      console.error(err);
      return;
    }
    loading.hidden = true;
  }

  await selectCase(0);
})();
