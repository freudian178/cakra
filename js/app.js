/* =====================================================
   CAKRA — INTELLIGENT MANUFACTURING HUB
   Single-file interactive prototype
   Design: Corporate / DESIGN.md
   ===================================================== */

const C = {
  equipment: {},
  production: {},
  incidents: [],
  rca: {},
  role: null,
  user: null,
  plant: "ARP",
  tag: "PU-2101B",
  page: "dashboard",
  month: "all",
  tasks: [],
  key: "cakra-actions-v5",
  selectedTrendParam: null,
  assigningPlan: false,
  diagSel: {},
  cases: [],
  caseKey: "cakra-cases-v1",
};

const $ = (s) => document.querySelector(s);
const num = (v) => Number(v) || 0;
const usd = (v) =>
  "$" +
  num(v).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[x],
  );

/*
  Threshold configuration per equipment tag.
  Direction is "high" when trip > alarm (rising value is bad),
  "low" when trip < alarm (dropping value is bad).
  The baseline is computed at runtime from historical NORMAL readings.
*/
const param = (key, label, unit, alarm, trip) => ({
  key,
  label,
  unit,
  alarm,
  trip,
  direction: trip > alarm ? "high" : "low",
  jsonKey: key,
  base: null,
});

const machines = {
  "PU-2101B": {
    params: [
      param("Overall Vibration (mm/s)", "Overall Vibration", "mm/s", 7, 11),
      param("Seal Flush Flow (L/min)", "Seal Flush Flow", "L/min", 5, 4),
      param("Discharge Pressure (barg)", "Discharge Pressure", "barg", 8.5, 7.5),
      param("Bearing Temp (°C)", "Bearing Temperature", "°C", 80, 95),
    ],
  },
  "KO-3201": {
    params: [
      param("DE Radial Vibration (micron)", "DE Radial Vibration", "micron", 45, 75),
      param("Lube Oil Water Content (ppm)", "Lube Oil Water Content", "ppm", 500, 1500),
      param("Lube Oil Supply Press (barg)", "Lube Oil Supply Pressure", "barg", 1.4, 1.1),
      param("Bearing Metal Temp (°C)", "Bearing Metal Temperature", "°C", 95, 110),
    ],
  },
  "PM-4405B": {
    params: [
      param("Motor DE Bearing Temp (°C)", "Motor DE Bearing Temp", "°C", 75, 90),
      param("Motor Vibration (mm/s)", "Motor Vibration", "mm/s", 5, 8),
      param("Motor Ampere (A)", "Motor Ampere", "A", 150, 165),
      param("Winding Temp (°C)", "Winding Temperature", "°C", 120, 140),
    ],
  },
  "HE-3301": {
    params: [
      param("Tube-side dP (bar)", "Tube-side dP", "bar", 0.6, 0.9),
      param("Heat Duty (% design)", "Heat Duty", "%", 90, 70),
      param("Cold Outlet Temp (°C)", "Cold Outlet Temp", "°C", 110, 95),
      param("Feed Heavy-ends (%)", "Feed Heavy Ends", "%", 1.5, 2.4),
    ],
  },
  "BL-5702": {
    params: [
      param("Overall Vibration (mm/s)", "Overall Vibration", "mm/s", 7, 11),
      param("2X Harmonic (mm/s)", "2X Harmonic", "mm/s", 3, 5),
      param("Coupling Offset (mm)", "Coupling Offset", "mm", 0.05, 0.3),
      param("Bearing Temp (°C)", "Bearing Temperature", "°C", 80, 95),
    ],
  },
};

/*
  Other equipment has genuine measurements, but its
  individual alarm/trip limits are not hardcoded here.
  Those limits must be verified before a gauge is shown.
*/

const USERS = [
  { id: "ROT-01", role: "staff", password: "demo123" },
  { id: "REL-05", role: "staff", password: "demo123" },
  { id: "REL-02", role: "staff", password: "demo123" },
  { id: "STA-02", role: "staff", password: "demo123" },
];

/* ---------------- DATA LOADING ---------------- */

async function load(path) {
  const r = await fetch(path);
  if (!r.ok) throw Error("Failed to load " + path);
  return r.json();
}

/* ---------------- HEALTH CALCULATION ---------------- */

// Health score 0-100 (100 = at baseline, 50 = alarm, 0 = trip).
// Returns null when the baseline/alarm/trip combination is invalid.
function health(v, base, alarm, trip) {
  const dir = trip > alarm ? 1 : -1;
  const d = dir * (v - base);
  const a = dir * (alarm - base);
  const t = dir * (trip - base);
  if (a <= 0 || t <= a) return null;

  const idx = d <= a ? (d / a) * 50 : 50 + ((d - a) / (t - a)) * 50;
  return 100 - Math.max(0, Math.min(100, idx));
}

function parameterStatus(v, alarm, trip) {
  const rising = trip > alarm;
  if (rising ? v >= trip : v <= trip) return "TRIP";
  if (rising ? v >= alarm : v <= alarm) return "ALARM";
  return "NORMAL";
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Baseline = median of historical readings that were in NORMAL state.
// Falls back to a fraction of the alarm limit when no normal data exists.
function baselineFor(p, history) {
  if (p.base !== null) return p.base;

  const normal = history
    .map((row) => Number(row[p.jsonKey]))
    .filter((v) => Number.isFinite(v) && parameterStatus(v, p.alarm, p.trip) === "NORMAL");

  if (normal.length) return median(normal);
  return p.direction === "high" ? p.alarm * 0.5 : p.alarm * 1.5;
}

function machineStatus(score) {
  if (score <= 0) return "TRIP";
  if (score <= 50) return "ALARM";
  return "NORMAL";
}

function calculateMachineHealth(tag) {
  const config = machines[tag];
  if (!config) return null;

  const history = C.equipment[tag]?.history || [];
  const latest = history[history.length - 1];
  if (!latest) return null;

  const results = [];
  config.params.forEach((p) => {
    const value = Number(latest[p.jsonKey]);
    if (!Number.isFinite(value)) return;

    results.push({
      label: p.label,
      value,
      unit: p.unit,
      alarm: p.alarm,
      trip: p.trip,
      health: health(value, baselineFor(p, history), p.alarm, p.trip),
      state: parameterStatus(value, p.alarm, p.trip),
    });
  });
  if (!results.length) return null;

  // A parameter whose health cannot be computed counts as 0 (worst case).
  const score = (r) => r.health ?? 0;
  const machineHealth = Math.min(...results.map(score));
  const governing = results.reduce((a, b) => (score(a) < score(b) ? a : b));

  return {
    health: Math.round(machineHealth),
    status: machineStatus(machineHealth),
    governing,
    parameters: results,
  };
}

/* ---------------- INCIDENT PARSING ---------------- */

const PLANT_KEYS = ["Plant", "Plant / Unit", "PLANT"];

function plantOf(row) {
  const key = PLANT_KEYS.find((k) => row[k]);
  return key ? String(row[key]).trim() : "";
}

// The Excel-exported JSON keeps the real column names in one "header" row,
// stored under generic keys ("Unnamed: 0", "Unnamed: 1", ...).
function findHeaderRow(rows) {
  return rows.find((r) => {
    if (!r || typeof r !== "object") return false;
    const values = Object.values(r);
    return values.includes("AR No.") && values.includes("Tag Number");
  });
}

function rowsFromHeader(rows, header) {
  const columns = Object.entries(header).map(([key, name]) => [
    key,
    String(name).replace("Unnamed: ", "").trim(),
  ]);

  return rows
    .slice(rows.indexOf(header) + 1)
    .map((row) => Object.fromEntries(columns.map(([key, name]) => [name, row[key]])))
    .filter((r) => r["AR No."] || r["Tag Number"]);
}

function normalizeIncidents(rows) {
  if (!Array.isArray(rows)) return [];

  const header = findHeaderRow(rows);
  const records = header ? rowsFromHeader(rows, header) : rows;

  return records.map((r) => ({ ...r, Plant: plantOf(r) }));
}

/* ---------------- BOOT & STORAGE ---------------- */

function loadTasks() {
  try {
    const tasks = JSON.parse(localStorage.getItem(C.key) || "[]");
    return Array.isArray(tasks) ? tasks : [];
  } catch (err) {
    console.warn("Saved tasks could not be read, starting empty.", err);
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(C.key, JSON.stringify(C.tasks));
  } catch (err) {
    console.warn("Tasks could not be saved.", err);
  }
}

async function boot() {
  try {
    const [equipment, production, incidentRows, rca] = await Promise.all([
      load("data/equipment-performance.json"),
      load("data/production-data.json"),
      load("data/incident-summary.json"),
      load("data/rca-details.json"),
    ]);
    C.equipment = equipment;
    C.production = production;
    C.incidents = normalizeIncidents(incidentRows);
    C.rca = rca;
    C.tasks = loadTasks();
    C.cases = loadCases();
    syncCases();
    installStyles();
    render();
  } catch (err) {
    document.body.textContent = "CAKRA error: " + err.message;
    console.error(err);
  }
}

function getPlant(row) {
  return plantOf(row).toUpperCase();
}

function incidents(plant = C.plant) {
  return C.incidents.filter((x) => getPlant(x) === String(plant).trim().toUpperCase());
}

function selectedIncidents() {
  return incidents().filter((x) => x["Tag Number"] === C.tag);
}

function selectedEquipment() {
  return C.equipment[C.tag] || null;
}

function selectedRCA() {
  return C.rca[C.tag] || null;
}

function tagsForPlant() {
  const actual = Object.keys(C.equipment).filter((tag) =>
    (C.equipment[tag]?.info?.["Plant / Unit"] || "").includes("(" + C.plant + ")"),
  );
  const historical = incidents()
    .map((x) => x["Tag Number"])
    .filter(Boolean);
  return [...new Set([...actual, ...historical])].sort((a, b) =>
    a === "PU-2101B" ? -1 : b === "PU-2101B" ? 1 : a.localeCompare(b),
  );
}

function latestHistory(tag = C.tag) {
  const h = C.equipment[tag]?.history || [];
  return h.length ? h[h.length - 1] : null;
}

function limitStatus(value, limit) {
  if (!Number.isFinite(Number(value))) return "UNKNOWN";
  const x = Number(value);
  if (limit.direction === "high")
    return x >= limit.trip ? "TRIP" : x >= limit.alarm ? "ALARM" : "NORMAL";
  return x <= limit.trip ? "TRIP" : x <= limit.alarm ? "ALARM" : "NORMAL";
}

function gauge(value, limit) {
  if (!Number.isFinite(Number(value))) return null;
  const x = Number(value);
  const severity =
    limit.direction === "high"
      ? (x - limit.alarm) / (limit.trip - limit.alarm)
      : (limit.alarm - x) / (limit.alarm - limit.trip);

  /*
    Alarm is displayed at 70%; trip at 100%.
    The percentage is a visualization of proximity
    to trip, NOT an equipment health probability.
    Normal values are deliberately not assigned a
    percentage without a validated normal baseline.
  */
  if (severity < 0) return null;
  return Math.min(100, Math.max(70, 70 + 30 * severity));
}

/* ---------------- AUTH ---------------- */

function login() {
  const id = $("#login-id").value.trim().toUpperCase();
  const pw = $("#login-pass").value;
  const u = USERS.find((x) => x.id === id && x.password === pw);
  if (!u) {
    $("#login-error").textContent = "Invalid demo credentials.";
    return;
  }
  C.user = u.id;
  C.role = u.role;
  C.page = "selection";
  render();
}

function logout() {
  C.user = null;
  C.role = null;
  render();
}

function renderLogin() {
  return `
    <div class="login-page">
      <div class="login-card">
        <div class="logo">
          <img src="img/cakra.png" alt="CAKRA">
        </div>
        <h1>Welcome back</h1>
        <p class="muted">Sign in to your manufacturing workspace.</p>
        <label>User ID</label>
        <input id="login-id" placeholder="MGR-01 / ROT-01">
        <label>Password</label>
        <input id="login-pass" type="password" placeholder="Password">
        <p id="login-error" class="danger-text"></p>
        <button class="btn full" onclick="login()">Sign In →</button>
        <small class="muted">
          Prototype-only login. Not secure authentication.
        </small>
      </div>
    </div>`;
}

/* ---------------- NAVIGATION ---------------- */

function pageLabel(page) {
  return (
    {
      selection: "plant selection",
      "plant-performance": "plant performance",
      "equipment-performance": "equipment performance",
      incidents: "incident center",
      diagnostics: "ai diagnostics",
      tasks: "action hub",
    }[page] || page
  );
}
function go(page) {
  C.page = page;
  C.assigningPlan = false;
  render();
  window.scrollTo(0, 0);
}
function choosePlant(p) {
  C.plant = p;
  C.tag = tagsForPlant()[0] || "";
  C.selectedTrendParam = null;
  go("plant-performance");
}
function chooseTag(tag) {
  console.log("TAG DIPILIH:", tag);
  C.tag = tag;
  C.selectedTrendParam = null;
  C.assigningPlan = false;
  render();
}
function openDiagnostics(tag = C.tag) {
  if (tag) C.tag = tag;
  C.assigningPlan = false;
  go("diagnostics");
}
function navButton(page, title) {
  return `<button class="nav ${C.page === page ? "active" : ""}"
    onclick="go('${page}')">${title}</button>`;
}
function shell(content) {
  return `
    <div class="shell">
      <aside class="sidebar">
        <div class="logo">
          <img src="img/cakra.png" alt="CAKRA">
      </div>
        <p class="side-caption">INTELLIGENT MANUFACTURING</p>
        ${navButton("selection", "▦  Plant Selection")}
        ${navButton("plant-performance", "◫  Plant Performance")}
        ${navButton("equipment-performance", "◈  Equipment Performance")}
        ${navButton("incidents", "⚑  Incident Center")}
        ${navButton("diagnostics", "◇  AI Diagnostics")}
        ${navButton("tasks", "☷  Action Hub")}
      </aside>
      <div class="main">
        <header class="topbar">
          <div><strong>${esc(C.plant)} Workspace</strong>
            <span class="muted"> / ${esc(pageLabel(C.page))}</span></div>
          <div class="user-area">
            <span class="role-badge">${esc(C.role.toUpperCase())}</span>
            <strong>${esc(C.user)}</strong>
            <button class="btn outline" onclick="logout()">Log out</button>
          </div>
        </header>
        <main class="content">${content}</main>
      </div>
    </div>`;
}
function renderSelection() {
  const plants = [...new Set(C.incidents.map((x) => x.Plant).filter(Boolean))].sort();

  return `
    <div class="eyebrow">MANUFACTURING WORKSPACE</div>
    <h1>Select Plant</h1>
    <p class="muted">Choose the plant you want to monitor.</p>
    <div class="plant-grid">
      ${plants
        .map(
          (p) => `
        <button class="plant-card" onclick="choosePlant('${esc(p)}')">
          <div class="plant-icon">▦</div>
          <h2>${esc(p)}</h2>
          <p>${incidents(p).length} historical incidents</p>
          <span>Open workspace →</span>
        </button>`,
        )
        .join("")}
    </div>`;
}

/* ---------------- DASHBOARD ---------------- */

function card(label, value, detail = "") {
  return `<div class="card kpi">
    <div class="big-number">${esc(value)}</div>
    <p class="muted">${esc(label)}</p>
    <small class="muted">${esc(detail)}</small>
  </div>`;
}

function renderGauge(machine) {
  const value = machine.health;
  const color = value <= 0 ? "#DC2626" : value <= 50 ? "#D97706" : "#16A34A";
  const angle = Math.PI * (1 - value / 100);
  const needleX = 120 + 70 * Math.cos(angle);
  const needleY = 120 - 70 * Math.sin(angle);

  return `
    <div class="gauge-box">
      <svg viewBox="0 0 240 150">
        <path d="M30 120 A90 90 0 0 1 210 120"
          stroke="#E5E7EB" stroke-width="20" fill="none" />
        <path d="M30 120 A90 90 0 0 1 210 120"
          stroke="${color}" stroke-width="20" fill="none"
          pathLength="100" stroke-dasharray="${value} 100" />
        <line x1="120" y1="120" x2="${needleX}" y2="${needleY}"
          stroke="#111827" stroke-width="4" />
        <circle cx="120" cy="120" r="7" fill="#111827" />
        <text x="120" y="95" text-anchor="middle" font-size="32" font-weight="700">
          ${Math.round(value)}%
        </text>
        <text x="120" y="150" text-anchor="middle" font-size="14" font-weight="500" fill="#111827">
          ${esc(machine.status)}
        </text>
      </svg>
    </div>`;
}

function renderEquipment() {
  const e = selectedEquipment();
  if (!e) {
    return `
    <div class="card">
      <h3>Equipment Monitoring</h3>
      <span class="badge warning">DATA UNAVAILABLE</span>
      <p class="muted">
        This equipment has a historical incident record,
        but no telemetry dataset was provided.
      </p>
      <p>Historical incidents remain accessible below.</p>
    </div>`;
  }

  const machine = calculateMachineHealth(C.tag);
  const latest = latestHistory();
  if (!machine) {
    return `
        <div class="card">
            <h3>${esc(C.tag)}</h3>
            <p class="muted"> No validated telemetry available.</p>
        </div>`;
  }

  return `
    <div class="card">
      <div class="card-heading">
        <div>
          <p class="eyebrow">EQUIPMENT HEALTH</p>
          <h3>${esc(C.tag)} — Threshold Monitoring</h3>
          <p class="muted">Latest historical reading:
            ${esc(latest?.Date || "N/A")}</p>
        </div>
      </div>
      <div class="equipment-grid">
        <div class="gauge-panel">
          ${renderGauge(machine)}
        </div>
        <div class="parameter-grid">
        ${machine.parameters
          .map(
            (p) => `
            <div class="parameter">

    <div class="parameter-title">
        ${esc(p.label)}
    </div>

    <div class="parameter-value">
        <strong>${esc(p.value)}</strong>
        <span class="parameter-unit">
            ${esc(p.unit)}
        </span>
    </div>

    <div class="limit-text">
        Alarm:
        <b>${esc(p.alarm)}</b>
        &nbsp; / &nbsp;
        Trip:
        <b>${esc(p.trip)}</b>
    </div>

    <span class="badge ${p.state.toLowerCase()}">
        ${esc(p.state)}
    </span>

</div>


            `,
          )
          .join("")}
        </div>
      </div>
    </div>`;
}

/* ---------------- SVG CHARTS ---------------- */

function lineChart(points, thresholds = []) {
  if (!points.length) return `<p class="muted">No data available.</p>`;

  const w = 720,
    h = 260,
    left = 55,
    right = 25,
    top = 25,
    bottom = 45;

  const values = points.map((p) => num(p.y));

  const all = [...values, ...thresholds.map((t) => t.value)];

  let min = Math.min(...all);
  let max = Math.max(...all);

  if (min === max) {
    min -= 1;
    max += 1;
  }

  const pad = (max - min) * 0.15;

  min -= pad;
  max += pad;

  const X = (i) => left + (i * (w - left - right)) / Math.max(1, points.length - 1);

  const Y = (v) => top + ((max - v) * (h - top - bottom)) / (max - min);

  const path = points
    .map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`)
    .join(" ");

  return `

<svg viewBox="0 0 ${w} ${h}" 
class="chart-svg"
role="img">


<!-- GRID + Y AXIS -->

${[0, 0.25, 0.5, 0.75, 1]
  .map((f) => {
    const y = top + f * (h - top - bottom);

    return `

<line 
x1="${left}" 
y1="${y}"
x2="${w - right}"
y2="${y}"
stroke="rgba(15,23,42,0.25)"
stroke-width="1.5"
/>


<text 
x="10"
y="${y + 5}"
font-size="12"
font-weight="600"
fill="#0F172A">

${(max - f * (max - min)).toFixed(1)}

</text>

`;
  })
  .join("")}



<!-- ALARM / TRIP LINE -->

${thresholds
  .map(
    (t) => `

<line

x1="${left}"

x2="${w - right}"

y1="${Y(t.value)}"

y2="${Y(t.value)}"

stroke="${t.color}"

stroke-width="2.5"

stroke-dasharray="8 6"

/>


<text

x="${w - right - 5}"

y="${Y(t.value) - 8}"

text-anchor="end"

font-size="12"

font-weight="700"

fill="${t.color}"

>

${esc(t.name)}

</text>


`,
  )
  .join("")}



<!-- MAIN TREND -->

<path

d="${path}"

stroke="#1D4ED8"

stroke-width="4"

fill="none"

/>



${points
  .map(
    (p, i) => `

<circle

cx="${X(i)}"

cy="${Y(p.y)}"

r="4"

fill="#1D4ED8">


<title>

${esc(p.label)} : ${esc(p.y)}

</title>


</circle>


`,
  )
  .join("")}




<!-- MONTH LABEL -->

${points
  .map((p, i) => {
    const date = new Date(p.label);

    const prev = i > 0 ? new Date(points[i - 1].label) : null;

    const changed = !prev || date.getMonth() !== prev.getMonth() || i === points.length - 1;

    if (changed) {
      return `

<text

x="${X(i)}"

y="${h - 10}"

font-size="12"

font-weight="600"

text-anchor="middle"

fill="#0F172A">

${date.toLocaleDateString("en-US", {
  month: "short",
  year: "numeric",
})}

</text>

`;
    }

    return "";
  })
  .join("")}



</svg>

`;
}
function renderTrend() {
  const e = selectedEquipment();

  if (!e) {
    return `
    <div class="card">
      <h3>Historical Trend</h3>
      <p class="muted">
      No equipment selected.
      </p>
    </div>`;
  }

  const params = machines[C.tag]?.params || [];

  if (!params.length) {
    return `
    <div class="card">
      <h3>Historical Trend</h3>
      <p class="muted">
      No threshold configuration is available for ${esc(C.tag)}, so no trend is shown.
      </p>
    </div>`;
  }

  const selectedKey = C.selectedTrendParam || params[0]?.jsonKey;

  const param = params.find((p) => p.jsonKey === selectedKey) || params[0];

  const points = (e.history || [])
    .filter((x) => Number.isFinite(Number(x[param.jsonKey])))
    .map((x) => ({
      label: x.Date,
      y: Number(x[param.jsonKey]),
    }));

  return `

  <div class="card">


    <div class="trend-header">

      <div>

      <p class="eyebrow">
      HISTORICAL TREND
      </p>


      <h3>
      ${esc(param.label)}
      </h3>


      </div>


      <div>

      <label>
      Parameter
      </label>


      <select 
      onchange="changeTrendParameter(this.value)"
      >

      ${params
        .map(
          (p) => `

      <option
      value="${esc(p.jsonKey)}"
      ${p.jsonKey === selectedKey ? "selected" : ""}
      >
      ${esc(p.label)}
      </option>

      `,
        )
        .join("")}


      </select>

      </div>


    </div>



    <div>

    ${lineChart(points, [
      {
        name: "Alarm",
        value: param.alarm,
        color: "#D97706",
      },
      {
        name: "Trip",
        value: param.trip,
        color: "#DC2626",
      },
    ])}

    </div>



    <div class="trend-limit">

      Alarm:
      <b>${param.alarm} ${param.unit}</b>

      &nbsp;&nbsp;

      Trip:
      <b>${param.trip} ${param.unit}</b>


    </div>



  </div>

  `;
}

function changeTrendParameter(key) {
  C.selectedTrendParam = key;
  render();
}

function updateTrendChart() {
  const checked = [...document.querySelectorAll("[data-trend]:checked")].map((x) =>
    Number(x.dataset.trend),
  );

  const params = machines[C.tag]?.params || [];

  const e = selectedEquipment();

  const datasets = params
    .map((p, i) => ({
      id: i,

      label: p.label,

      points: e.history
        .filter((x) => Number.isFinite(Number(x[p.jsonKey])))
        .map((x) => ({
          label: x.Date,
          y: Number(x[p.jsonKey]),
        })),

      alarm: p.alarm,
      trip: p.trip,
    }))
    .filter((x) => checked.includes(x.id));

  document.querySelector("#trend-chart").innerHTML = lineChartMulti(datasets, checked);
}
function lineChartMulti(datasets) {
  if (!datasets.length) return `<p class="muted">Select parameter.</p>`;

  const w = 720,
    h = 260;

  const allValues = datasets.flatMap((d) => d.points.map((p) => p.y));

  let min = Math.min(...allValues);
  let max = Math.max(...allValues);

  if (min === max) {
    min -= 1;
    max += 1;
  }

  const left = 50;
  const right = 20;
  const top = 20;
  const bottom = 40;

  const X = (i) => left + (i * (w - left - right)) / Math.max(1, datasets[0].points.length - 1);

  const Y = (v) => top + ((max - v) * (h - top - bottom)) / (max - min);

  const colors = ["#2563EB", "#16A34A", "#D97706", "#DC2626"];

  return `

<svg viewBox="0 0 ${w} ${h}"
class="chart-svg">


${datasets
  .map((d, idx) => {
    const path = d.points.map((p, i) => `${i ? "L" : "M"}${X(i)},${Y(p.y)}`).join(" ");

    return `


<path 
d="${path}"
stroke="${colors[idx]}"
stroke-width="3"
fill="none"
/>


${d.points
  .map(
    (p, i) => `

<circle
cx="${X(i)}"
cy="${Y(p.y)}"
r="3"
fill="${colors[idx]}">

<title>
${d.label}: ${p.y}
</title>

</circle>

`,
  )
  .join("")}


`;
  })
  .join("")}


</svg>

`;
}

function equipmentType() {
  const row = selectedIncidents()[0];
  if (row?.["Eq. Type"]) return row["Eq. Type"];
  return C.tag.split("-")[0];
}

function renderCrossPlant() {
  const type = equipmentType();
  const rows = C.incidents.filter((x) => x["Eq. Type"] === type && x.Plant !== C.plant);
  const counts = {};
  rows.forEach((x) => (counts[x.Plant] = (counts[x.Plant] || 0) + 1));
  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const max = Math.max(1, ...sorted.map((x) => x[1]));

  return `<div class="card">
    <p class="eyebrow">CROSS-PLANT BENCHMARK</p>
    <h3>Same Equipment Type Incidents</h3>
    <p class="muted">Equipment type: ${esc(type)} · Other plants</p>
    ${
      sorted.length
        ? sorted
            .map(
              ([plant, n]) => `
      <div class="bar-row">
        <span>${esc(plant)}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width:${(100 * n) / max}%"></div>
        </div>
        <strong>${n}</strong>
      </div>`,
            )
            .join("")
        : `<p class="muted">No matching incidents in other plants.</p>`
    }
    <p class="muted">Counts from historical incident records.
      Same equipment type does not necessarily mean same failure mode.</p>
  </div>`;
}

function renderFinancial() {
  const rows = incidents();
  const monthly = {};
  rows.forEach((x) => {
    const date = String(x["Date of Occur."] || "");
    const month = date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    monthly[month] ??= { actual: 0, potential: 0 };
    monthly[month].actual += num(x["Act. Loss (k US$)"]);
    monthly[month].potential += num(x["Pot. Loss (k US$)"]);
  });
  const months = Object.keys(monthly).sort();
  const max = Math.max(1, ...months.map((m) => monthly[m].actual + monthly[m].potential));

  return `<div class="card">
    <p class="eyebrow">FINANCIAL ANALYTICS</p>
    <h3>Monthly Financial Impact</h3>
    <p class="muted">US$ thousands · Historical plant incidents</p>
    <div class="legend">
      <span><i style="background:#3B82F6"></i>Actual Loss</span>
      <span><i style="background:#8B5CF6"></i>Potential Loss</span>
    </div>
    <div class="financial-chart">
      ${months
        .map((m) => {
          const a = monthly[m].actual,
            p = monthly[m].potential;
          return `<div class="financial-column">
          <div class="financial-bars" title="${esc(m)}
            Actual: ${a.toFixed(1)}k; Potential: ${p.toFixed(1)}k">
            <div style="height:${(a / max) * 100}%;background:#3B82F6"></div>
            <div style="height:${(p / max) * 100}%;background:#8B5CF6"></div>
          </div>
          <small>${esc(m.slice(5))}</small>
        </div>`;
        })
        .join("")}
    </div>
    <p class="muted">
      Actual and potential loss are separate historical categories.
      This chart does not represent an AI prediction.
    </p>
  </div>`;
}

function renderPlantPerformance() {
  const rows = incidents();
  const downtime = rows.reduce((s, x) => s + num(x["Downtime (hrs)"]), 0);
  const actual = rows.reduce((s, x) => s + num(x["Act. Loss (k US$)"]), 0);
  const open = rows.filter(
    (x) => !/CLOSED|COMPLETE/i.test(String(x["Overall Status"] || "")),
  ).length;
  return `
    <div class="page-header">
      <div>
        <p class="eyebrow">SENSE / PLANT PERFORMANCE</p>
        <h1>Plant Performance</h1>
        <p class="muted">Plant-level operational visibility, incident records and financial impact</p>
      </div>
    </div>
    <div class="kpi-grid">
      ${card("Historical Incidents", rows.length)}
      ${card("Recorded Downtime", downtime.toFixed(1) + " h")}
      ${card("Actual Financial Loss", usd(actual * 1000))}
      ${card("Open Incident Records", open)}
    </div>
    <div class="dashboard-grid">
      ${renderFinancial()}
      <div class="card">
        <div class="card-heading">
          <div>
            <p class="eyebrow">EQUIPMENT WORKSPACE</p>
            <h3>Move from Plant to Equipment Performance</h3>
            <p class="muted">Select an equipment tag to review health, historical trends and cross-plant benchmark.</p>
          </div>
          <button class="btn" onclick="go('equipment-performance')">Open Equipment Performance →</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-heading">
        <div>
          <p class="eyebrow">INCIDENT RECORDS</p>
          <h3>${esc(C.plant)} — Historical Incident Register</h3>
        </div>
        <button class="btn outline" onclick="go('incidents')">Open Incident Center →</button>
      </div>
      ${incidentTable(rows)}
    </div>`;
}
function getEquipmentAlert(machine) {
  if (!machine || !machine.parameters?.length) return null;
  const trip = machine.parameters.filter((p) => p.state === "TRIP");
  const alarm = machine.parameters.filter((p) => p.state === "ALARM");
  if (trip.length) {
    return {
      level: "TRIP",
      title: "Trip condition detected",
      text: `${trip.map((p) => p.label).join(", ")} has crossed its trip threshold. Immediate diagnostic review is recommended.`,
      parameters: trip,
    };
  }
  if (alarm.length) {
    return {
      level: "EARLY WARNING",
      title: "Early warning — threshold deviation",
      text: `${alarm.map((p) => p.label).join(", ")} has reached an alarm condition. Review the equipment trend and diagnostics before the condition escalates.`,
      parameters: alarm,
    };
  }
  return null;
}
function renderEquipmentAlert(machine) {
  const alert = getEquipmentAlert(machine);
  if (!alert) {
    return `
      <div class="card">
        <div class="card-heading">
          <div>
            <p class="eyebrow">MONITORING STATUS</p>
            <h3>No Active Equipment Alert</h3>
            <p class="muted">Latest validated readings are within the configured alarm/trip thresholds.</p>
          </div>
          <span class="badge normal">NORMAL</span>
        </div>
      </div>`;
  }
  const badgeClass = alert.level === "TRIP" ? "trip" : "alarm";
  return `
    <div class="card">
      <div class="card-heading">
        <div>
          <p class="eyebrow">DECIDE / ALERT</p>
          <h3>${esc(alert.title)}</h3>
          <p class="muted">${esc(alert.text)}</p>
        </div>
        <span class="badge ${badgeClass}">${esc(alert.level)}</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Parameter</th><th>Current</th><th>Alarm</th><th>Trip</th><th>Status</th></tr></thead>
          <tbody>${alert.parameters
            .map(
              (p) => `
            <tr>
              <td>${esc(p.label)}</td>
              <td>${esc(p.value)} ${esc(p.unit)}</td>
              <td>${esc(p.alarm)}</td>
              <td>${esc(p.trip)}</td>
              <td><span class="badge ${p.state.toLowerCase()}">${esc(p.state)}</span></td>
            </tr>`,
            )
            .join("")}</tbody>
        </table>
      </div>
      <div class="card-heading" style="margin-top:16px;margin-bottom:0">
        <span class="muted">Diagnostics will connect this alert to relevant incident/RCA evidence and recommended actions.</span>
        <button class="btn" onclick="openDiagnostics('${esc(C.tag)}')">Open Diagnostics →</button>
      </div>
    </div>`;
}
function renderEquipmentPerformance() {
  const tagOptions = tagsForPlant();
  if (!tagOptions.includes(C.tag)) C.tag = tagOptions[0] || "";
  const machine = calculateMachineHealth(C.tag);
  return `
    <div class="page-header">
      <div>
        <p class="eyebrow">SENSE / EQUIPMENT PERFORMANCE</p>
        <h1>Equipment Performance</h1>
        <p class="muted">Equipment condition, parameter trends and cross-plant reliability context</p>
      </div>
      <div class="filter-box">
        <label>Equipment Tag</label>
        <select onchange="chooseTag(this.value)">
          ${tagOptions
            .map(
              (t) => `
            <option value="${esc(t)}" ${t === C.tag ? "selected" : ""}>
              ${esc(t)} ${C.equipment[t] ? "(Available)" : ""}
            </option>`,
            )
            .join("")}
        </select>
      </div>
    </div>
    <div class="equipment-section">
      ${renderEquipment()}
      ${machine ? renderEquipmentAlert(machine) : `<div class="card"><p class="muted">No validated telemetry is available for ${esc(C.tag)}. Historical incidents remain accessible in Incident Center.</p></div>`}
    </div>
    <div class="dashboard-grid">
      ${renderTrend()}
      ${renderCrossPlant()}
    </div>`;
}
function renderDashboard() {
  return renderPlantPerformance();
}
/* ---------------- INCIDENTS ---------------- */

function incidentTable(rows) {
  if (!rows.length) return `<p class="muted">No incidents found.</p>`;
  return `<div class="table-wrap"><table>
    <thead><tr><th>AR Number</th><th>Tag</th><th>Title</th>
      <th>Downtime</th><th>Actual Loss</th><th>Status</th></tr></thead>
    <tbody>${rows
      .map(
        (x) => `
      <tr>
        <td>${esc(x["AR No."])}</td>
        <td>${esc(x["Tag Number"])}</td>
        <td>${esc(x["Risk Case Title"])}</td>
        <td>${esc(x["Downtime (hrs)"])} h</td>
        <td>${usd(num(x["Act. Loss (k US$)"]) * 1000)}</td>
        <td>${esc(x["Overall Status"])}</td>
      </tr>`,
      )
      .join("")}</tbody></table></div>`;
}

function renderIncidents() {
  return `<p class="eyebrow">SENSE / INCIDENT REGISTER</p>
    <h1>Incident Center</h1>
    <div class="diag-stack">
      ${
        C.cases.length
          ? `<div class="card">
        <p class="eyebrow">LIVE CASES</p>
        <h3>Cases Registered from Equipment Trips</h3>
        <p class="muted">A trip on the latest equipment reading is registered here automatically as NEW REGISTERED.</p>
        ${caseRegisterTable(C.cases)}
      </div>`
          : ""
      }
      <div class="card"><p class="eyebrow">HISTORICAL INCIDENTS</p><h3>Incident Database</h3>${incidentTable(incidents())}</div>
    </div>`;
}

/* ---------------- AI DIAGNOSTICS ----------------
   Decision-support layer, NOT a root-cause oracle.
   Flow: condition -> similar historical incidents -> historical RCA (reference)
         -> possible causes -> recommended actions -> user selection
         -> (optional) RCA Analysis -> assignment -> Action Hub.
   The logic is generic: it works from incident-register fields, RCA records and
   equipment thresholds only. There are no per-tag branches.
*/

// Generic failure-domain vocabulary used to relate parameters and incident titles.
const DOMAIN_TERMS = {
  seal: ["seal", "flush", "leak", "weep"],
  vibration: ["vibration", "misalign", "coupling", "soft-foot", "softfoot", "unbalance", "imbalance", "resonance", "harmonic", "offset"],
  bearing: ["bearing", "babbitt", "journal", "lube", "lubric", "grease", "greasing", "oil", "thrust", "water", "contamination"],
  thermal: ["temp", "overheat", "thermal", "winding"],
  fouling: ["fouling", "foul", "scaling", "coke", "polymer", "plugging", "choke", "dp", "duty", "heavy"],
  cavitation: ["cavitation", "npsh", "suction"],
  electrical: ["motor", "ampere", "electrical"],
  pressure: ["pressure", "discharge"],
};

const GENERIC_COMPONENT_WORDS = ["system", "unit", "assembly", "other", "general", "equipment"];

const weeksBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 604800000);

function domainsOf(text) {
  const tokens = String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter(Boolean);
  const found = new Set();
  Object.entries(DOMAIN_TERMS).forEach(([domain, terms]) => {
    if (tokens.some((tk) => terms.some((term) => tk === term || (term.length >= 4 && tk.startsWith(term))))) {
      found.add(domain);
    }
  });
  return found;
}

function rcaByAR(ar) {
  return Object.values(C.rca || {}).find((r) => r.ar_number === ar) || null;
}

function latestRecordForTag(tag) {
  return (
    C.incidents
      .filter((x) => x["Tag Number"] === tag)
      .sort((a, b) => String(b["Date of Occur."] || "").localeCompare(String(a["Date of Occur."] || "")))[0] || null
  );
}

/* ---- condition detection (from equipment thresholds) ---- */

function rowAssessment(tag, row) {
  const config = machines[tag];
  const abnormal = [];
  let worst = "NORMAL";
  (config?.params || []).forEach((p) => {
    const value = Number(row[p.jsonKey]);
    if (!Number.isFinite(value)) return;
    const state = parameterStatus(value, p.alarm, p.trip);
    if (state === "NORMAL") return;
    abnormal.push({ label: p.label, value, unit: p.unit, alarm: p.alarm, trip: p.trip, state });
    if (state === "TRIP") worst = "TRIP";
    else if (worst !== "TRIP") worst = "ALARM";
  });
  return { state: worst, abnormal };
}

// Contiguous non-normal runs in the weekly history (threshold based, same rule as the gauges).
/* ---- case engine: trip -> incident case ---- */

const CASE_STEPS = ["NEW REGISTERED", "RCA PROCESS", "CA/PA EXECUTION", "RISK CLOSED"];
const CASE_CLASS = {
  "NEW REGISTERED": "s-new",
  "RCA PROCESS": "s-rca",
  "CA/PA EXECUTION": "s-exec",
  "RISK CLOSED": "s-closed",
};

/*
  Demo clock. null = use the real current time.
  Set a fixed ISO string (e.g. "2026-08-14T08:00:00") to freeze "now" for a demo,
  so downtime and potential loss are counted against that moment.
*/
const DIAG_CLOCK = null;
const nowMs = () => (DIAG_CLOCK ? new Date(DIAG_CLOCK).getTime() : Date.now());
const nowIso = () => new Date(nowMs()).toISOString();

function loadCases() {
  try {
    const v = JSON.parse(localStorage.getItem(C.caseKey) || "[]");
    return Array.isArray(v) ? v : [];
  } catch (err) {
    console.warn("Saved cases could not be read, starting empty.", err);
    return [];
  }
}

function saveCases() {
  try {
    localStorage.setItem(C.caseKey, JSON.stringify(C.cases));
  } catch (err) {
    console.warn("Cases could not be saved.", err);
  }
}

function activeCase(tag = C.tag) {
  return (
    C.cases
      .filter((c) => c.tag === tag)
      .sort(
        (a, b) =>
          String(b.tripDate).localeCompare(String(a.tripDate)) ||
          String(b.registeredAt).localeCompare(String(a.registeredAt)),
      )[0] || null
  );
}

function caseById(id) {
  return C.cases.find((c) => c.id === id) || null;
}

function plantCodeOf(tag) {
  const unit = C.equipment[tag]?.info?.["Plant / Unit"] || "";
  const m = unit.match(/\(([^)]+)\)/);
  return m ? m[1] : latestRecordForTag(tag)?.Plant || "";
}

// RCA owner comes from the incident data (PIC (RCA)); falls back to the most common PIC of the same discipline.
function ownerFor(tag) {
  const rec = latestRecordForTag(tag);
  if (rec?.["PIC (RCA)"]) return String(rec["PIC (RCA)"]);
  const disc = C.equipment[tag]?.info?.Discipline;
  if (disc) {
    const counts = {};
    C.incidents
      .filter((x) => x.Discipline === disc && x["PIC (RCA)"])
      .forEach((x) => (counts[x["PIC (RCA)"]] = (counts[x["PIC (RCA)"]] || 0) + 1));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (top) return top[0];
  }
  return "UNASSIGNED";
}

// A tag is "tripped" only when its LATEST telemetry record crosses a trip threshold.
function tripSnapshot(tag) {
  const history = C.equipment[tag]?.history || [];
  const row = history[history.length - 1];
  if (!row || !machines[tag]) return null;
  const a = rowAssessment(tag, row);
  return a.state === "TRIP" ? { row, abnormal: a.abnormal } : null;
}

// Trip on the latest record -> automatically registered as an incident case (NEW REGISTERED).
function syncCases() {
  let changed = false;
  Object.keys(machines).forEach((tag) => {
    const snap = tripSnapshot(tag);
    if (!snap) return;
    const id = "CASE-" + tag + "-" + snap.row.Date;
    if (C.cases.some((c) => c.id === id)) return;
    const info = C.equipment[tag]?.info || {};
    const at = nowIso();
    C.cases.push({
      id,
      tag,
      plant: plantCodeOf(tag),
      name: info["Equipment Name"] || tag,
      discipline: info.Discipline || latestRecordForTag(tag)?.Discipline || "",
      owner: ownerFor(tag),
      tripDate: snap.row.Date,
      tripWeek: snap.row.Week,
      tripRemark: snap.row.Remark || "",
      abnormal: snap.abnormal,
      status: "NEW REGISTERED",
      registeredAt: at,
      closedAt: "",
      history: [{ status: "NEW REGISTERED", by: "SYSTEM (auto-registered on trip)", at }],
      rca: { problem: "", evidence: "", findings: "", rootCause: "", confirmedBy: "", confirmedAt: "", actions: [] },
    });
    changed = true;
  });
  if (changed) saveCases();
}

function setCaseStatus(c, status) {
  c.status = status;
  const at = nowIso();
  if (status === "RISK CLOSED") c.closedAt = at;
  c.history.push({ status, by: C.user || "SYSTEM", at });
  saveCases();
}

const canRca = (c) => !!c && (C.role === "manager" || C.user === c.owner);

// RCA CA/PA Execution -> Risk Closed once every assigned action is verified by the RCA owner.
function syncCaseClosure(caseId) {
  const c = caseById(caseId);
  if (!c || c.status !== "CA/PA EXECUTION") return;
  const tasks = C.tasks.filter((t) => t.caseId === c.id);
  if (tasks.length && tasks.every((t) => t.status === "VERIFIED")) setCaseStatus(c, "RISK CLOSED");
}

/* ---- case metrics: downtime since trip, potential loss per day ---- */

/*
  Potential loss = 24 h x Plant Rate (T/H) x Product Price ($/ton).
  Plant rate: median PLANT_RATE of the tag's ON hours in the Production Data.
  Product price: calibrated from the tag's own last incident (Act. Loss / (Downtime x Plant Rate)).
  Tags with no incident of their own use the median hourly loss of incidents in the same plant.
*/
function lossModel(tag) {
  const hourly = (x) => (num(x["Downtime (hrs)"]) > 0 && num(x["Act. Loss (k US$)"]) > 0 ? (num(x["Act. Loss (k US$)"]) * 1000) / num(x["Downtime (hrs)"]) : null);
  const own = C.incidents
    .filter((x) => x["Tag Number"] === tag && hourly(x) !== null)
    .sort((a, b) => String(b["Date of Occur."] || "").localeCompare(String(a["Date of Occur."] || "")))[0];
  const rates = (C.production[tag]?.time_series || [])
    .filter((r) => String(r.RUN_STATUS).toUpperCase() === "ON")
    .map((r) => Number(r.PLANT_RATE))
    .filter(Number.isFinite);
  const rate = rates.length ? median(rates) : null;
  let perHour = null;
  let basis = "";
  if (own) {
    perHour = hourly(own);
    basis = own["AR No."];
  } else {
    const plant = plantCodeOf(tag).toUpperCase();
    const pool = C.incidents.filter((x) => getPlant(x) === plant && hourly(x) !== null).map(hourly);
    if (pool.length) {
      perHour = median(pool);
      basis = "median of " + plant + " incidents";
    }
  }
  const price = rate && perHour ? perHour / rate : null;
  return { perHour, perDay: perHour === null ? null : perHour * 24, rate, price, basis };
}

function caseMetrics(c) {
  const start = new Date(c.tripDate + "T00:00:00").getTime();
  const end = c.closedAt ? new Date(c.closedAt).getTime() : nowMs();
  const hours = Math.max(0, (end - start) / 3600000);
  const model = lossModel(c.tag);
  return { hours, model, perDay: model.perDay, accrued: model.perHour === null ? null : model.perHour * hours };
}

const fmtHours = (h) => Math.round(h).toLocaleString("en-US") + " h";
const fmtDuration = (h) => Math.floor(h / 24) + " d " + Math.round(h % 24) + " h";

function diagContext(c) {
  // The latest incident on this tag is only a matching hint (component/discipline); it is not this case.
  return { c, record: latestRecordForTag(c.tag), abnormal: c.abnormal, level: "TRIP", mode: "CASE" };
}


/* ---- similar incident retrieval ---- */

function buildSubject(tag, ctx) {
  const record = ctx.record;
  const info = C.equipment[tag]?.info || {};
  const text = [ctx.abnormal.map((p) => p.label).join(" "), record?.["Risk Case Title"], record?.Component].join(" ");
  return {
    tag,
    plant: record?.Plant || C.plant,
    name: info["Equipment Name"] || record?.["Risk Case Title"] || tag,
    eqType: record?.["Eq. Type"] || tag.split("-")[0],
    component: String(record?.Component || ""),
    discipline: record?.Discipline || info.Discipline || "",
    domains: domainsOf(text),
  };
}

function componentOverlap(a, b) {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  if (!x || !y) return 0;
  if (x === y) return 1;
  const words = (s) => s.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !GENERIC_COMPONENT_WORDS.includes(w));
  const wb = words(y);
  return words(x).some((w) => wb.includes(w)) ? 0.5 : 0;
}

function scoreCandidate(subject, c) {
  const reasons = [];
  let score = 0;
  if (c["Tag Number"] === subject.tag) {
    score += 15;
    reasons.push("Same equipment tag");
  }
  if (subject.eqType && c["Eq. Type"] === subject.eqType) {
    score += 25;
    reasons.push("Same equipment type (" + subject.eqType + ")");
  }
  const comp = componentOverlap(subject.component, String(c.Component || ""));
  if (comp) {
    score += 20 * comp;
    reasons.push((comp === 1 ? "Same component: " : "Related component: ") + c.Component);
  }
  if (subject.discipline && c.Discipline === subject.discipline) {
    score += 5;
    reasons.push("Same discipline (" + subject.discipline + ")");
  }
  const candDomains = domainsOf([c["Risk Case Title"], c.Component].join(" "));
  const shared = [...subject.domains].filter((d) => candDomains.has(d));
  if (shared.length) {
    score += 35 * Math.min(1, shared.length / Math.max(1, Math.min(subject.domains.size, candDomains.size)));
    reasons.push("Related failure domain: " + shared.join(", "));
  }
  return { score, reasons };
}

function findSimilarIncidents(subject, ctx) {
  const ownAR = ctx.mode === "REGISTER" ? ctx.record?.["AR No."] : null;
  return C.incidents
    .filter((x) => x["Tag Number"] && !/CANCEL/i.test(String(x["Overall Status"] || "")) && x["AR No."] !== ownAR)
    .map((row) => ({ row, ...scoreCandidate(subject, row) }))
    .filter((m) => m.score >= 45)
    .sort((a, b) => b.score - a.score || num(b.row["Total Loss (k US$)"]) - num(a.row["Total Loss (k US$)"]))
    .slice(0, 6)
    .map((m) => ({
      ...m,
      label: m.score >= 75 ? "HIGH" : m.score >= 55 ? "MEDIUM" : "LOW",
      rca: rcaByAR(m.row["AR No."]),
      relation:
        m.row["Tag Number"] === subject.tag
          ? "Previous incident on this equipment"
          : m.row.Plant !== subject.plant
            ? "Other plant (" + m.row.Plant + ")"
            : "Same plant",
    }));
}

/* ---- possible causes & recommended actions ---- */

function buildPossibleCauses(matches) {
  const causes = [];
  const seen = new Set();
  matches.forEach((m) => {
    if (!m.rca?.root_cause || seen.has(m.rca.root_cause)) return;
    seen.add(m.rca.root_cause);
    causes.push({
      text: m.rca.root_cause,
      source: "Historical RCA · " + m.row["Tag Number"] + " · " + m.row["AR No."],
    });
  });
  const counts = {};
  matches.forEach((m) => {
    const comp = String(m.row.Component || "").trim();
    if (comp) counts[comp] = (counts[comp] || 0) + 1;
  });
  Object.entries(counts)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .forEach(([comp, n]) =>
      causes.push({
        text: comp + " degradation — recurring component in similar incidents",
        source: n + " of " + matches.length + " similar incidents",
      }),
    );
  return causes;
}

function classifyAction(text) {
  return /^(replace|repair|rebuild|restore|re-?align|clean|hydro|overhaul|plug|fix|renew|rectify)\b/i.test(text.trim())
    ? "Corrective"
    : "Preventive";
}

function buildRecommendedActions(subject, matches, c) {
  const out = [];
  const seen = new Set();
  matches.forEach((m) => {
    (m.rca?.corrective_actions || []).forEach((a) => {
      const text = String(a.action || "").split(m.row["Tag Number"]).join(subject.tag);
      const key = text.toLowerCase();
      if (!text || seen.has(key)) return;
      seen.add(key);
      out.push({
        text,
        type: classifyAction(text),
        pic: a.pic || "",
        histStatus: a.status || "",
        source: "Recommended based on similar historical cases",
        ref: m.row["Tag Number"] + " · " + m.row["AR No."],
        sourceAR: m.row["AR No."],
      });
    });
  });
  (c?.rca?.actions || []).forEach((a) => {
    if (seen.has(a.text.toLowerCase())) return;
    seen.add(a.text.toLowerCase());
    out.push({
      text: a.text,
      type: a.type,
      pic: "",
      histStatus: "",
      source: "Defined during RCA Analysis",
      ref: "User-defined",
      sourceAR: "",
    });
  });
  return out;
}

function runDiagnostics(c) {
  const ctx = diagContext(c);
  const subject = buildSubject(c.tag, ctx);
  const matches = findSimilarIncidents(subject, ctx);
  return { c, ctx, subject, matches, causes: buildPossibleCauses(matches), actions: buildRecommendedActions(subject, matches, c) };
}

function actionAlreadyAssigned(c, action) {
  return C.tasks.find((t) => t.caseId === c.id && t.action === action.text);
}

function rerender() {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}

/* ---- render ---- */

const statusClass = (s) => CASE_CLASS[s] || "";

function caseKpi(label, valueHtml, detail = "") {
  return `<div class="card kpi diag-kpi">
    <p class="kpi-label">${esc(label)}</p>
    <div class="big-number">${valueHtml}</div>
    <small class="muted">${esc(detail)}</small>
  </div>`;
}

function renderStepper(c) {
  const idx = CASE_STEPS.indexOf(c.status);
  const closed = c.status === "RISK CLOSED";
  return `<div class="stepper">${CASE_STEPS.map((s, i) => {
    const cls = closed || i < idx ? "done" : i === idx ? "current" : "";
    return `<div class="step ${cls}"><span class="dot">${cls === "done" ? "✓" : i + 1}</span><span class="step-label">${esc(s)}</span></div>`;
  }).join("")}</div>`;
}

function caseRegisterTable(cases) {
  return `<div class="table-wrap"><table>
    <thead><tr><th>Case</th><th>Equipment</th><th>Trip Date</th><th>Owner</th><th>Downtime</th><th>Status</th><th></th></tr></thead>
    <tbody>${cases
      .map((c) => {
        const m = caseMetrics(c);
        return `<tr>
          <td>${esc(c.id)}</td>
          <td><strong>${esc(c.tag)}</strong><br><small class="muted">${esc(c.name)}</small></td>
          <td>${esc(c.tripDate)}</td>
          <td>${esc(c.owner)}</td>
          <td>${esc(fmtHours(m.hours))}</td>
          <td><span class="badge ${statusClass(c.status)}">${esc(c.status)}</span></td>
          <td><button class="btn outline" onclick="openCase('${esc(c.id)}')">Open</button></td>
        </tr>`;
      })
      .join("")}</tbody></table></div>`;
}

function renderNoCase(tag) {
  const machine = calculateMachineHealth(tag);
  const text = machine
    ? `The latest reading is <strong>${esc(machine.status)}</strong> (health ${esc(machine.health)}). A case is registered automatically when the latest equipment reading crosses a trip threshold.`
    : "No threshold telemetry is configured for this tag, so no case can be triggered automatically.";
  return `<div class="card">
    <p class="eyebrow">NO ACTIVE CASE</p>
    <h3>${esc(tag)} is not in a trip condition</h3>
    <p class="muted">${text}</p>
  </div>`;
}

function renderDiagnostics() {
  const tagOptions = tagsForPlant();
  if (!tagOptions.includes(C.tag)) C.tag = tagOptions[0] || "";
  const c = activeCase(C.tag);

  const header = `
    <div class="page-header">
      <div>
        <p class="eyebrow">DECIDE / DIAGNOSTICS</p>
        <h1>${esc(C.tag)} — AI-Assisted Diagnostics</h1>
        <p class="muted">Trip → incident case → RCA → corrective / preventive actions → risk closed. Historical incidents are used only as reference.</p>
      </div>
      <div class="filter-box">
        <label>Equipment Tag</label>
        <select onchange="chooseTag(this.value)">
          ${tagOptions
            .map((t) => {
              const tc = activeCase(t);
              return `<option value="${esc(t)}" ${t === C.tag ? "selected" : ""}>${esc(t)}${tc ? " · " + esc(tc.status) : ""}</option>`;
            })
            .join("")}
        </select>
      </div>
    </div>`;

  if (!c) {
    return `${header}<div class="diag-stack">
      ${renderNoCase(C.tag)}
      ${C.cases.length ? `<div class="card"><p class="eyebrow">CASE REGISTER</p><h3>All Registered Cases</h3>${caseRegisterTable(C.cases)}</div>` : ""}
    </div>`;
  }

  const d = runDiagnostics(c);
  const { subject, matches, causes, actions } = d;
  const mt = caseMetrics(c);
  const s = c.rca;
  const owner = canRca(c);
  const sel = new Set(C.diagSel[c.id] || []);
  const caseTasks = C.tasks.filter((t) => t.caseId === c.id);

  /* 1. case overview */
  const tripTable = `<div class="table-wrap"><table>
    <thead><tr><th>Parameter</th><th>Reading at Trip</th><th>Alarm Threshold</th><th>Trip Threshold</th><th>Status</th></tr></thead>
    <tbody>${c.abnormal
      .map(
        (p) => `<tr>
        <td>${esc(p.label)}</td>
        <td>${esc(p.value)} ${esc(p.unit)}</td>
        <td>${esc(p.alarm)}</td>
        <td>${esc(p.trip)}</td>
        <td><span class="badge ${p.state.toLowerCase()}">${esc(p.state)}</span></td>
      </tr>`,
      )
      .join("")}</tbody></table></div>`;

  const m = mt.model;
  const lossNote =
    m.perDay === null
      ? "No loss basis is available for this equipment."
      : m.rate && m.price
        ? `Loss model: 24 h × ${m.rate.toFixed(1)} T/H plant rate × ${usd(m.price)}/ton (price calibrated from ${m.basis}).`
        : `Loss model: hourly loss from ${m.basis} × 24 h.`;

  const overview = `
    <div class="card">
      <div class="card-heading">
        <div>
          <p class="eyebrow">${esc(c.id)}</p>
          <h3>${esc(subject.name)}</h3>
          <p class="muted">Trip detected on ${esc(c.tripDate)} (Week ${esc(c.tripWeek)}): ${esc(c.abnormal.map((p) => p.label).join(", "))} crossed the trip threshold.${c.tripRemark ? " " + esc(c.tripRemark) : ""}</p>
        </div>
        <span class="badge badge-lg ${statusClass(c.status)}">${esc(c.status)}</span>
      </div>
      ${renderStepper(c)}
      ${tripTable}
    </div>
    <div class="kpi-grid diag-kpis">
      ${caseKpi("Case Status", `<span class="badge badge-lg ${statusClass(c.status)}">${esc(c.status)}</span>`, c.closedAt ? "Closed " + c.closedAt.slice(0, 10) : "Registered " + c.registeredAt.slice(0, 10))}
      ${caseKpi("Discipline Owner", esc(c.owner), (c.discipline || "—") + " · RCA owner")}
      ${caseKpi("Total Downtime", esc(fmtHours(mt.hours)), fmtDuration(mt.hours) + " since trip " + c.tripDate + (c.closedAt ? " (frozen at closure)" : ""))}
      ${caseKpi("Potential Loss / Day", mt.perDay === null ? "—" : esc(usd(mt.perDay)), mt.accrued === null ? "No loss basis" : "Accrued " + usd(mt.accrued) + " so far")}
    </div>
    <p class="muted loss-note">${esc(lossNote)}</p>`;

  /* 2. similar incidents + historical RCA + causes (analysis stage) */
  const rcaCount = matches.filter((x) => x.rca).length;
  const plantCount = new Set(matches.map((x) => x.row.Plant)).size;
  const similar = `
    <div class="card">
      <p class="eyebrow">SIMILAR HISTORICAL INCIDENTS</p>
      <h3>${matches.length ? matches.length + " Similar Incidents Found" : "No matching historical incident found."}</h3>
      ${
        matches.length
          ? `<p class="muted">Rule-based retrieval across all plants: equipment tag and type, component, discipline and related failure domain. Cancelled risks are excluded.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Relevance</th><th>Incident</th><th>Why it matched</th><th>Historical RCA</th></tr></thead>
          <tbody>${matches
            .map(
              (x) => `<tr>
            <td><span class="badge">${esc(x.label)}</span></td>
            <td><strong>${esc(x.row["Tag Number"])}</strong> · ${esc(x.row["AR No."])}<br>
              ${esc(x.row["Risk Case Title"])}<br><small class="muted">${esc(x.relation)} · ${esc(x.row["Overall Status"])}</small></td>
            <td>${x.reasons.map((r) => esc(r)).join("<br>")}</td>
            <td>${x.rca ? "Available" : "Not available"}</td>
          </tr>`,
            )
            .join("")}</tbody></table></div>`
          : `<p class="muted">The diagnostic can only reference incidents that exist in the Incident Database.</p>`
      }
    </div>`;

  const rcaMatches = matches.filter((x) => x.rca).slice(0, 3);
  const rcaRef = matches.length
    ? `<div class="card">
        <p class="eyebrow">HISTORICAL RCA REFERENCE</p>
        <h3>Reference from Similar Cases</h3>
        ${
          rcaMatches.length
            ? `<p class="muted">Historical RCA is evidence, not the RCA of this case. The root cause of this case is confirmed only through RCA Analysis.</p>
          ${rcaMatches
            .map(
              (x) => `<div class="hint">
            <strong>Similar case: ${esc(x.row["Tag Number"])} — ${esc(x.row["AR No."])}</strong>
            <small class="muted"> · ${esc(x.relation)}</small>
            <p><strong>Historical root cause:</strong> ${esc(x.rca.root_cause)}</p>
            <p><strong>Historical corrective / preventive actions:</strong></p>
            ${(x.rca.corrective_actions || []).map((a) => `<div class="timeline">${esc(a.action)}</div>`).join("")}
          </div>`,
            )
            .join("")}`
            : `<p class="muted"><strong>Similar Historical Incident Found.</strong> No historical RCA available for this case.</p>`
        }
      </div>`
    : "";

  const causesCard = `
    <div class="card">
      <p class="eyebrow">POSSIBLE CAUSES</p>
      <h3>Hypotheses from Evidence</h3>
      ${
        causes.length
          ? `<p class="muted">Possible causes drawn from similar cases, not confirmed root causes.</p>
        ${causes.map((x) => `<div class="timeline"><strong>Possible cause:</strong> ${esc(x.text)}<br><small class="muted">${esc(x.source)}</small></div>`).join("")}`
          : `<p class="muted">Insufficient evidence to determine a likely cause. Further inspection is recommended.</p>`
      }
    </div>`;
  const evidenceCard = `
    <div class="card">
      <p class="eyebrow">EVIDENCE BASE</p>
      <h3>What this view is based on</h3>
      <div class="timeline">${c.abnormal.length} tripped parameter(s) on ${esc(c.tripDate)}</div>
      <div class="timeline">${matches.length} similar incident(s) across ${plantCount} plant(s)</div>
      <div class="timeline">${rcaCount} of ${matches.length} similar incident(s) have a historical RCA</div>
      <div class="timeline">${d.ctx.record ? "Previous incident on this tag: " + esc(d.ctx.record["AR No."]) : "No previous incident on this tag"}</div>
    </div>`;
  const analysis = `${similar}${rcaRef}<div class="dashboard-grid">${causesCard}${evidenceCard}</div>`;

  /* 3. stage-specific panels */
  const nextStep = `
    <div class="card">
      <div class="card-heading" style="margin-bottom:0">
        <div>
          <p class="eyebrow">NEXT STEP</p>
          <h3>Start RCA Analysis</h3>
          <p class="muted" style="margin-bottom:0">Review the similar incidents below, then open the RCA workspace. The case moves to RCA PROCESS.</p>
        </div>
        ${owner ? `<button class="btn" onclick="startRca()">Start RCA Analysis</button>` : `<span class="muted" style="margin:0">Waiting for RCA owner ${esc(c.owner)}</span>`}
      </div>
    </div>`;

  const groupRows = (type) =>
    actions
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => a.type === type)
      .map(({ a, i }) => {
        const task = actionAlreadyAssigned(c, a);
        return `<tr>
          <td style="width:34px">${
            owner && !task && s.confirmedAt
              ? `<input type="checkbox" style="width:auto;margin:0;padding:0" ${sel.has(a.text) ? "checked" : ""} onchange="toggleDiagAction(${i})">`
              : ""
          }</td>
          <td>${esc(a.text)}<br><small class="muted">${esc(a.source)} · ${esc(a.ref)}</small></td>
          <td>${esc(a.pic || "—")}</td>
          <td>${esc(a.histStatus || "—")}</td>
          <td>${task ? `<span class="badge">${esc(task.status)}</span>` : ""}</td>
        </tr>`;
      })
      .join("");
  const actionGroup = (title, note, type) => {
    const rows = groupRows(type);
    if (!rows) return "";
    return `<h3 style="margin-top:18px">${title}</h3>
      <p class="muted">${note}</p>
      <div class="table-wrap"><table>
        <thead><tr><th></th><th>Action</th><th>Historical PIC</th><th>Historical Status</th><th>Assignment</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
  };
  const actionsCard = `
    <div class="card">
      <div class="card-heading">
        <div>
          <p class="eyebrow">DECIDE / RECOMMENDATION</p>
          <h3>Recommended Actions</h3>
          <p class="muted">${
            s.confirmedAt
              ? "Select the actions to carry forward and assign a PIC. Assigning moves the case to CA/PA EXECUTION."
              : "Confirm the root cause in the RCA workspace first. Actions can be selected and assigned only after that."
          }</p>
        </div>
        ${
          owner
            ? `<button class="btn" ${sel.size && s.confirmedAt ? "" : `disabled style="opacity:.5;cursor:not-allowed"`} onclick="openActionPlan()">Create Action Plan (${sel.size})</button>`
            : ""
        }
      </div>
      ${
        actions.length
          ? actionGroup("A. Immediate Corrective Action", "For the trip that needs prompt action.", "Corrective") +
            actionGroup("B. Preventive / Pro-active Action", "To prevent recurrence or reduce risk.", "Preventive") +
            (owner ? "" : `<p class="muted" style="margin-top:14px">Only the RCA owner (${esc(c.owner)}) or a manager can select and assign actions.</p>`)
          : `<p class="muted">${
              matches.length
                ? "No historical RCA or CAPA is available for the similar incidents, so no actions can be recommended."
                : "No matching historical incident found, so no actions can be recommended."
            } Add actions defined by your investigation in the RCA workspace.</p>`
      }
    </div>`;

  const executionCard = `
    <div class="card">
      <div class="card-heading">
        <div>
          <p class="eyebrow">${c.status === "RISK CLOSED" ? "RISK CLOSED" : "CA/PA EXECUTION"}</p>
          <h3>${c.status === "RISK CLOSED" ? "All actions verified — risk closed" : "Actions in execution"}</h3>
          <p class="muted">${
            c.status === "RISK CLOSED"
              ? "Closed on " + esc(c.closedAt.slice(0, 10)) + ". Downtime and the accrued loss stopped counting at closure."
              : "Each action is worked by its PIC and verified by the RCA owner (" + esc(c.owner) + "). The case closes when every action is verified."
          }</p>
        </div>
        <button class="btn outline" onclick="go('tasks')">Open Action Hub →</button>
      </div>
      <div class="hint" style="margin-top:0">
        <strong>Confirmed root cause</strong>
        <p>${esc(s.rootCause)}</p>
        <small class="muted">Confirmed by ${esc(s.confirmedBy)} on ${esc((s.confirmedAt || "").slice(0, 10))}</small>
      </div>
      <p class="muted"><strong>${caseTasks.filter((t) => t.status === "VERIFIED").length} of ${caseTasks.length}</strong> actions verified</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Action</th><th>Type</th><th>PIC</th><th>Due</th><th>Status</th></tr></thead>
        <tbody>${caseTasks
          .map(
            (t) => `<tr>
          <td>${esc(t.action)}</td>
          <td>${esc(t.type || "—")}</td>
          <td>${esc(t.pic)}</td>
          <td>${esc(t.due)}</td>
          <td><span class="badge">${esc(t.status)}</span>${isOverdue(t) ? ` <span class="badge trip">OVERDUE</span>` : ""}</td>
        </tr>`,
          )
          .join("")}</tbody></table></div>
    </div>`;

  let stage;
  if (c.status === "NEW REGISTERED") stage = `${nextStep}${analysis}`;
  else if (c.status === "RCA PROCESS") stage = `${analysis}${renderRcaAnalysis(d)}${actionsCard}${C.assigningPlan ? renderAssignModal(d) : ""}`;
  else stage = executionCard;

  return `${header}<div class="diag-stack">${overview}${stage}</div>`;
}

function renderRcaAnalysis(d) {
  const { c, matches, causes } = d;
  const s = c.rca;
  const defaultProblem =
    c.tag + " tripped on " + c.tripDate + ": " + c.abnormal.map((p) => p.label + " " + p.value + " " + p.unit).join(", ");
  const chronology = [
    "Week " + c.tripWeek + " · " + c.tripDate + ": " + (c.tripRemark || "trip recorded."),
    "Case " + c.id + " registered automatically (NEW REGISTERED).",
    "RCA Analysis started (RCA PROCESS).",
  ];
  const confirmed = !!s.confirmedAt;
  const assigned = C.tasks.some((t) => t.caseId === c.id);
  const owner = canRca(c);
  const dis = owner ? "" : "disabled";
  return `
    <div class="card" id="rca-analysis">
      <div class="card-heading">
        <div>
          <p class="eyebrow">RCA ANALYSIS</p>
          <h3>${esc(c.tag)} — Root Cause Investigation</h3>
          <p class="muted">Investigation workspace. The confirmed root cause is written by the investigator, never taken from historical RCA.</p>
        </div>
        <span class="badge ${confirmed ? "normal" : "alarm"}">${confirmed ? "ROOT CAUSE CONFIRMED" : "INVESTIGATION OPEN"}</span>
      </div>

      <div class="rca-field"><label>Problem Statement</label>
        <textarea rows="3" style="width:100%" ${dis} oninput="rcaInput('problem',this.value)">${esc(s.problem || defaultProblem)}</textarea></div>

      <div class="rca-field"><label>Incident Chronology</label>
        ${chronology.map((x) => `<div class="timeline">${esc(x)}</div>`).join("")}</div>

      <div class="rca-field"><label>Evidence</label>
        ${c.abnormal.map((p) => `<div class="timeline">${esc(p.label)}: ${esc(p.value)} ${esc(p.unit)} (${esc(p.state)}; alarm ${esc(p.alarm)}, trip ${esc(p.trip)})</div>`).join("")}
        <textarea rows="3" style="width:100%" ${dis} placeholder="Add inspection findings, photo references, field observations" oninput="rcaInput('evidence',this.value)">${esc(s.evidence)}</textarea></div>

      <div class="rca-field"><label>Similar Historical Cases</label>
        ${matches.length ? matches.map((x) => `<div class="timeline">${esc(x.row["Tag Number"])} · ${esc(x.row["AR No."])} — ${esc(x.row["Risk Case Title"])}${x.rca ? " (RCA available)" : ""}</div>`).join("") : `<p class="muted">No matching historical incident found.</p>`}</div>

      <div class="rca-field"><label>Possible Causes</label>
        ${causes.length ? causes.map((x) => `<div class="timeline">${esc(x.text)}</div>`).join("") : `<p class="muted">Insufficient evidence to determine a likely cause.</p>`}</div>

      <div class="rca-field"><label>Investigation Findings</label>
        <textarea rows="4" style="width:100%" ${dis} placeholder="What did the investigation find?" oninput="rcaInput('findings',this.value)">${esc(s.findings)}</textarea></div>

      <div class="rca-field"><label>Confirmed Root Cause</label>
        ${
          confirmed
            ? `<div class="hint" style="margin-top:0"><strong>${esc(s.rootCause)}</strong>
                <p class="muted" style="margin-bottom:0">Confirmed by ${esc(s.confirmedBy)} on ${esc(s.confirmedAt.slice(0, 10))}</p></div>
              ${owner && !assigned ? `<button class="btn outline" onclick="reopenRca()">Reopen Investigation</button>` : ""}`
            : `<p class="muted">Not yet determined</p>
              <textarea rows="3" style="width:100%" ${dis} placeholder="State the root cause supported by your findings" oninput="rcaInput('rootCause',this.value)">${esc(s.rootCause)}</textarea>
              ${owner ? `<button class="btn" onclick="confirmRootCause()">Confirm Root Cause</button>` : `<p class="muted">Only RCA owner ${esc(c.owner)} or a manager can confirm.</p>`}`
        }</div>

      <div class="rca-field"><label>Corrective &amp; Preventive Actions</label>
        <p class="muted">Select from the Recommended Actions below, or add an action defined by this investigation.</p>
        ${
          owner
            ? `<div style="display:flex;gap:10px;flex-wrap:wrap">
          <input id="rca-new-action" placeholder="New action" style="flex:1;min-width:220px">
          <select id="rca-new-type"><option>Corrective</option><option>Preventive</option></select>
          <button class="btn outline" onclick="addRcaAction()">Add Action</button>
        </div>`
            : ""
        }</div>
    </div>`;
}

function renderAssignModal(d) {
  const { c } = d;
  const chosen = (C.diagSel[c.id] || []).map((text) => d.actions.find((a) => a.text === text)).filter(Boolean);
  if (!chosen.length) return "";
  const staff = USERS.filter((u) => u.role === "staff").map((u) => u.id);
  const today = nowIso().slice(0, 10);
  return `
    <div id="assign-modal" style="position:fixed;inset:0;background:rgba(15,23,42,.35);backdrop-filter:blur(5px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px">
      <div class="card" style="width:min(860px,100%);max-height:90vh;overflow:auto;box-shadow:0 24px 60px rgba(15,23,42,.22)">
        <div class="card-heading">
          <div>
            <p class="eyebrow">ACTION ASSIGNMENT</p>
            <h3>Assign ${chosen.length} Selected Action${chosen.length > 1 ? "s" : ""}</h3>
            <p class="muted">Deadline is required. PIC is pre-filled from the historical RCA when available. The case moves to CA/PA EXECUTION once assigned.</p>
          </div>
          <button class="btn outline" onclick="closeAssignModal()">Cancel</button>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Action</th><th>Type</th><th>PIC</th><th>Priority</th><th>Deadline</th></tr></thead>
          <tbody>${chosen
            .map((a, i) => {
              const pics = a.pic && !staff.includes(a.pic) ? [a.pic, ...staff] : staff;
              return `<tr>
              <td>${esc(a.text)}</td>
              <td><span class="badge">${esc(a.type)}</span></td>
              <td><select id="as-pic-${i}">
                <option value="">Select PIC</option>
                ${pics.map((p) => `<option value="${esc(p)}" ${p === a.pic ? "selected" : ""}>${esc(p)}</option>`).join("")}
              </select></td>
              <td><select id="as-pri-${i}">
                ${["High", "Medium", "Low"].map((p) => `<option ${p === "High" ? "selected" : ""}>${p}</option>`).join("")}
              </select></td>
              <td><input id="as-due-${i}" type="date" min="${today}"></td>
            </tr>`;
            })
            .join("")}</tbody></table></div>
        <div class="card-heading" style="margin-top:18px;margin-bottom:0">
          <span class="muted">Assigned actions move to the Action Hub with status ASSIGNED.</span>
          <button class="btn" onclick="confirmAssign()">Assign</button>
        </div>
      </div>
    </div>`;
}

/* ---- handlers ---- */

function openCase(id) {
  const c = caseById(id);
  if (!c) return;
  C.plant = c.plant || C.plant;
  C.tag = c.tag;
  C.assigningPlan = false;
  go("diagnostics");
}

function toggleDiagAction(index) {
  const c = activeCase();
  if (!canRca(c) || !c.rca.confirmedAt) return;
  const action = runDiagnostics(c).actions[index];
  if (!action) return;
  const sel = new Set(C.diagSel[c.id] || []);
  if (sel.has(action.text)) sel.delete(action.text);
  else sel.add(action.text);
  C.diagSel[c.id] = [...sel];
  rerender();
}

function openActionPlan() {
  const c = activeCase();
  if (!canRca(c)) return;
  if (!c.rca.confirmedAt) return alert("Confirm the root cause first.");
  if (!(C.diagSel[c.id] || []).length) return;
  C.assigningPlan = true;
  rerender();
}

function closeAssignModal() {
  C.assigningPlan = false;
  rerender();
}

function confirmAssign() {
  const c = activeCase();
  if (!canRca(c) || c.status !== "RCA PROCESS") return;
  if (!c.rca.confirmedAt) return alert("Confirm the root cause first.");
  const d = runDiagnostics(c);
  const chosen = (C.diagSel[c.id] || []).map((text) => d.actions.find((a) => a.text === text)).filter(Boolean);
  if (!chosen.length) return alert("No action selected.");

  const rows = chosen.map((a, i) => ({
    a,
    pic: document.getElementById("as-pic-" + i)?.value || "",
    priority: document.getElementById("as-pri-" + i)?.value || "High",
    due: document.getElementById("as-due-" + i)?.value || "",
  }));
  if (rows.some((r) => !r.due)) return alert("Please enter a deadline for every action.");
  if (rows.some((r) => !r.pic)) return alert("Please select a PIC for every action.");

  const stamp = Date.now();
  rows.forEach((r, i) => {
    C.tasks.push({
      id: "TASK-" + stamp + "-" + i,
      caseId: c.id,
      ar: c.id,
      tag: c.tag,
      plant: c.plant,
      action: r.a.text,
      type: r.a.type,
      priority: r.priority,
      source: r.a.source + " (" + r.a.ref + ")",
      pic: r.pic,
      due: r.due,
      status: "ASSIGNED",
      evidence: "",
      history: [{ by: C.user, status: "ASSIGNED", at: nowIso() }],
    });
  });
  save();
  C.diagSel[c.id] = [];
  C.assigningPlan = false;
  setCaseStatus(c, "CA/PA EXECUTION");
  rerender();
}

function startRca() {
  const c = activeCase();
  if (!canRca(c) || c.status !== "NEW REGISTERED") return;
  setCaseStatus(c, "RCA PROCESS");
  rerender();
  document.getElementById("rca-analysis")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function rcaInput(field, value) {
  const c = activeCase();
  if (!canRca(c) || c.status !== "RCA PROCESS") return;
  c.rca[field] = value;
  saveCases();
}

function confirmRootCause() {
  const c = activeCase();
  if (!canRca(c) || c.status !== "RCA PROCESS") return;
  if (!c.rca.findings.trim()) return alert("Please record the investigation findings first.");
  if (!c.rca.rootCause.trim()) return alert("Please state the confirmed root cause.");
  c.rca.confirmedBy = C.user;
  c.rca.confirmedAt = nowIso();
  saveCases();
  rerender();
}

function reopenRca() {
  const c = activeCase();
  if (!canRca(c) || c.status !== "RCA PROCESS" || C.tasks.some((t) => t.caseId === c.id)) return;
  c.rca.confirmedBy = "";
  c.rca.confirmedAt = "";
  saveCases();
  rerender();
}

function addRcaAction() {
  const c = activeCase();
  if (!canRca(c) || c.status !== "RCA PROCESS") return;
  const text = document.getElementById("rca-new-action")?.value.trim();
  const type = document.getElementById("rca-new-type")?.value || "Corrective";
  if (!text) return alert("Please describe the action.");
  c.rca.actions.push({ text, type });
  saveCases();
  rerender();
}


/* ---------------- TASKS ---------------- */

const caseOwnerOf = (t) => caseById(t.caseId)?.owner || "";
// Verification belongs to the RCA owner of the case (a manager can also verify).
const canVerify = (t) => C.role === "manager" || (!!C.user && C.user === caseOwnerOf(t));

function updateTask(id, next, evidence = "") {
  const t = C.tasks.find((x) => x.id === id);
  if (!t) return;
  const pic = C.role === "staff" && t.pic === C.user;

  const allowed =
    (pic && t.status === "ASSIGNED" && next === "IN_PROGRESS") ||
    (pic && t.status === "IN_PROGRESS" && next === "PENDING_VERIFICATION" && evidence.trim()) ||
    (canVerify(t) && t.status === "PENDING_VERIFICATION" && ["VERIFIED", "IN_PROGRESS"].includes(next));

  if (!allowed) return alert("Action not permitted.");

  t.status = next;
  if (evidence) t.evidence = evidence;
  t.history.push({
    by: C.user,
    status: next,
    at: nowIso(),
  });
  save();
  if (next === "VERIFIED") syncCaseClosure(t.caseId);
  render();
}

function submitTask(id) {
  const text = document.getElementById("evidence-" + id)?.value.trim();
  if (!text) return alert("Please provide completion evidence.");
  updateTask(id, "PENDING_VERIFICATION", text);
}

function resetTasks() {
  if (C.role !== "manager") return;
  if (!confirm("Reset all demo tasks and cases?")) return;
  C.tasks = [];
  C.cases = [];
  C.diagSel = {};
  save();
  saveCases();
  syncCases();
  render();
}

function isOverdue(t) {
  return t.status !== "VERIFIED" && String(t.due || "") < nowIso().slice(0, 10);
}

function renderTasks() {
  const rows =
    C.role === "manager" ? C.tasks : C.tasks.filter((x) => x.pic === C.user || caseOwnerOf(x) === C.user);

  return `
    <div class="page-header">
      <div>
        <p class="eyebrow">ACT / WORK ORDER MANAGEMENT</p>
        <h1>Action Hub</h1>
        <p class="muted">
          ${C.role === "manager" ? "All assigned tasks" : "My tasks and tasks awaiting my verification as RCA owner"}
        </p>
      </div>
      ${
        C.role === "manager"
          ? `
        <button class="btn outline" onclick="resetTasks()">
          Reset Demo
        </button>`
          : ""
      }
    </div>
    <div class="diag-stack">${
      rows.length
        ? rows
            .map((t) => {
              const cs = caseById(t.caseId);
              return `
      <div class="card task-card">
        <div class="card-heading">
          <div>
            <p class="eyebrow">${esc(t.id)}</p>
            <h3>${esc(t.tag)} — ${esc(t.action)}</h3>
          </div>
          <span>
            ${isOverdue(t) ? `<span class="badge trip">OVERDUE</span>` : ""}
            <span class="badge">${esc(t.status)}</span>
          </span>
        </div>
        <p class="muted">
          ${esc(t.ar)} · PIC ${esc(t.pic)}${cs ? " · RCA owner " + esc(cs.owner) : ""} · Due ${esc(t.due)}${t.type ? " · " + esc(t.type) : ""}${t.priority ? " · " + esc(t.priority) + " priority" : ""}
        </p>
        ${cs ? `<p class="muted"><small>Case status: <span class="badge ${statusClass(cs.status)}">${esc(cs.status)}</span></small></p>` : ""}
        ${t.source ? `<p class="muted"><small>${esc(t.source)}</small></p>` : ""}
        ${
          t.evidence
            ? `
          <div class="hint"><strong>Submitted Evidence</strong>
            <p>${esc(t.evidence)}</p></div>`
            : ""
        }
        ${
          C.user === t.pic && t.status === "ASSIGNED"
            ? `
          <button class="btn"
            onclick="updateTask('${t.id}','IN_PROGRESS')">
            Accept Task
          </button>`
            : ""
        }
        ${
          C.user === t.pic && t.status === "IN_PROGRESS"
            ? `
          <label>Completion Evidence</label>
          <textarea id="evidence-${t.id}" rows="3"
            placeholder="Describe completed work and evidence reference"></textarea>
          <button class="btn" onclick="submitTask('${t.id}')">
            Submit for Verification
          </button>`
            : ""
        }
        ${
          canVerify(t) && t.status === "PENDING_VERIFICATION"
            ? `
          <button class="btn"
            onclick="updateTask('${t.id}','VERIFIED')">
            Verify Completion
          </button>
          <button class="btn outline"
            onclick="updateTask('${t.id}','IN_PROGRESS')">
            Return to PIC
          </button>`
            : ""
        }
        ${
          t.status === "VERIFIED"
            ? `
          <p class="success-text">
            Task verified by the RCA owner.${cs?.status === "RISK CLOSED" ? " All actions verified — case is RISK CLOSED." : ""}
          </p>`
            : ""
        }
      </div>`;
            })
            .join("")
        : `<div class="card"><p class="muted">
        No tasks available for this account.
      </p></div>`
    }</div>`;
}


/* ---------------- STYLES ---------------- */

/* ---------------- STYLES REVISION ---------------- */

function installStyles() {
  const css = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Open+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');

  :root{
    --blue:#0F4C81;
    --purple:#2563EB;
    --green:#16A34A;
    --orange:#D97706;
    --red:#DC2626;

    --text:#0F172A;
    --muted:#334155;
    --border:rgba(255, 255, 255, 0.45);
  }

  *{box-sizing:border-box}

  body{
    margin:0;
    color:var(--text);
    font-family:"Open Sans",sans-serif;
    background:
      linear-gradient(
        rgba(15, 23, 42, 0.25),
        rgba(15, 23, 42, 0.25)
      ),
      url("img/petro.png");
    background-size:cover;
    background-position:center;
    background-attachment:fixed;
  }

  /* TYPOGRAPHY ENHANCEMENT */
  h1,h2,h3{font-family:Poppins,sans-serif;margin:0 0 12px;color:#0F172A;letter-spacing:-0.3px}
  h1{font-size:30px;font-weight:700}
  h2{font-size:21px;font-weight:600}
  h3{font-size:17px;font-weight:600}
  p{line-height:1.65}
  button,input,select,textarea{font:inherit}
  button{cursor:pointer}

  label{
    display:block;font-size:11px;font-weight:700;
    margin:16px 0 8px;color:#1E293B;text-transform:uppercase;letter-spacing:.6px
  }

  input,select,textarea{
    padding:11px 12px;
    border:1px solid rgba(255,255,255,0.7);
    border-radius:10px;
    background:rgba(255,255,255,0.7);
    backdrop-filter:blur(10px);
    -webkit-backdrop-filter:blur(10px);
    color:var(--text);
    max-width:100%;
    box-shadow:inset 0 1px 2px rgba(255,255,255,0.5);
  }

  /* MENINGKATKAN KONTRAS MUTED TEXT SANGAT DIBUTUHKAN DI GLASS CARD */
  .muted{color:#1E293B;font-size:13px;font-weight:500;margin:0 0 12px;line-height:1.5}

  .eyebrow{
    font:600 11px "IBM Plex Mono",monospace;
    letter-spacing:1.2px;color:#0284C7;margin-bottom:8px;text-transform:uppercase
  }

  .btn{
    border:1px solid rgba(255,255,255,0.4);
    border-radius:10px;
    background:rgba(15, 76, 129, 0.9);
    backdrop-filter:blur(8px);
    -webkit-backdrop-filter:blur(8px);
    color:white;
    padding:11px 17px;
    font-weight:600;
    box-shadow:0 4px 15px rgba(15,76,129,0.25), inset 0 1px 1px rgba(255,255,255,0.4);
    transition:all 0.2s ease;
  }

  .btn:hover{
    background:rgba(15, 76, 129, 1);
    box-shadow:0 6px 20px rgba(15,76,129,0.35);
  }

  .btn.outline{
    background:rgba(255,255,255,0.65);
    color:var(--blue);
    border:1px solid rgba(15,76,129,0.4);
    font-weight:700;
  }

  .btn.full{width:100%;margin-top:18px}

  .logo{
    display:flex;
    align-items:center;
    margin-bottom:8px;
  }

  .logo img{
    width:120px;
    height:auto;
    display:block;
    object-fit:contain;
  }
  
  .login-card .logo{
    justify-content:center;
  }
  .logo span{color:var(--blue)}

  .login-page{
    min-height:100vh;display:grid;place-items:center;
    padding:24px;background:linear-gradient(135deg,rgba(239,246,255,0.8),rgba(248,250,252,0.8))
  }

  .trend-header{
    display:flex;
    justify-content:space-between;
    align-items:flex-end;
    gap:20px;
    margin-bottom:20px;
  }

  .trend-header label{
    margin:0 0 6px;
    font-size:11px;
    font-weight:700;
  }

  .trend-header select{
    min-width:220px;
  }

  .trend-limit{
    margin-top:15px;
    font-size:13px;
    color:#334155;
    font-weight:600;
  }

  /* GLASS CARD STYLING */
  .login-card, .card, .plant-card, .filter-box {
    background: rgba(255, 255, 255, 0.52) !important;
    backdrop-filter: blur(24px) saturate(160%) !important;
    -webkit-backdrop-filter: blur(24px) saturate(160%) !important;
    border: 1px solid rgba(255, 255, 255, 0.7) !important;
    border-top: 1px solid rgba(255, 255, 255, 0.9) !important;
    border-left: 1px solid rgba(255, 255, 255, 0.8) !important;
    border-radius: 20px !important;
    box-shadow: 
      0 20px 40px rgba(15, 23, 42, 0.08),
      inset 0 1px 2px rgba(255, 255, 255, 0.7) !important;
    padding: 22px;
    min-width: 0;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .login-card input{width:100%}

  .hint{
    background:rgba(239,246,255,0.65);
    border:1px solid rgba(255,255,255,0.7);
    border-radius:12px;
    padding:15px;font-size:13px;margin:20px 0;
    color:#0F172A;
  }

  .danger-text{color:var(--red);font-size:12px}
  .success-text{color:var(--green);font-weight:700}

  /* 1. PERBAIKAN SIDEBAR STICKY (TIDAK IKUT SCROLL) */
  .shell{display:flex;min-height:100vh;align-items:stretch}

  .sidebar{
    width:245px;
    flex-shrink:0;
    background:rgba(15, 23, 42, 0.88);
    backdrop-filter:blur(25px);
    -webkit-backdrop-filter:blur(25px);
    border-right:1px solid rgba(255,255,255,0.12);
    color:white;
    padding:28px 18px;
    position:sticky;
    top:0;
    height:100vh;
    overflow-y:auto;
    z-index:100;
  }

  .side-caption{font-size:10px;color:#94A3B8;margin-bottom:35px;font-family:"IBM Plex Mono",monospace;letter-spacing:0.5px}
  .side-footer{font-size:10px;color:#94A3B8;margin-top:45px;font-family:"IBM Plex Mono",monospace}

  .nav{
    display:block;width:100%;border:0;border-radius:10px;
    text-align:left;padding:13px;color:#CBD5E1;
    background:transparent;margin:5px 0;font-size:13px;
    font-weight:500;
    transition:all 0.2s ease;
  }

  .nav:hover,.nav.active{
    background:rgba(37, 99, 235, 0.85);
    backdrop-filter:blur(10px);
    color:white;
    font-weight:600;
    box-shadow:0 4px 12px rgba(37, 99, 235, 0.35);
  }

  .main{flex:1;min-width:0}

  .topbar{
    background:rgba(255,255,255,0.45);
    backdrop-filter:blur(20px) saturate(180%);
    -webkit-backdrop-filter:blur(20px) saturate(180%);
    border-bottom:1px solid rgba(255,255,255,0.6);
    padding:17px 28px;display:flex;justify-content:space-between;
    align-items:center;gap:12px;flex-wrap:wrap
  }

  .user-area{display:flex;align-items:center;gap:12px;font-size:13px}

  .role-badge{
    background:rgba(239,246,255,0.8);
    color:#2563EB;
    border:1px solid rgba(37,99,235,0.3);
    padding:6px 9px;border-radius:6px;font-size:10px;font-weight:700
  }

  .content{padding:30px;max-width:1600px;margin:auto}

  .page-header,.card-heading{
    display:flex;align-items:center;
    justify-content:space-between;gap:16px;flex-wrap:wrap;
    margin-bottom:20px
  }

  .filter-box{padding:12px 18px}
  .filter-box label{margin:0 0 6px;font-family:"Open Sans"}
  .filter-box select{min-width:210px}

  .kpi-grid{
    display:grid;grid-template-columns:repeat(4,minmax(0,1fr));
    gap:16px;margin:22px 0
  }

  /* 1. KPI UTAMA DASHBOARD (Center-aligned & Proporsional) */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    margin: 22px 0;
  }
  .kpi:not(.diag-kpi) {
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
    align-items: center !important;
    text-align: center !important;
    padding: 28px 16px !important;
    min-height: 140px !important;
  }

  .kpi:not(.diag-kpi) .big-number {
    font: 800 36px/1.1 Poppins, sans-serif !important;
    color: #0F172A !important;
    overflow-wrap: anywhere;
    margin: 0 0 8px 0 !important;
    letter-spacing: -0.5px !important;
  }

  .kpi:not(.diag-kpi) .muted {
    font-size: 13px !important;
    font-weight: 600 !important;
    color: #334155 !important;
    margin: 0 !important;
    line-height: 1.3 !important;
  }


  /* 2. KPI KHUSUS AI DIAGNOSTICS (Tetap Rata Kiri & Kompak) */
  .diag-kpi {
    display: flex !important;
    flex-direction: column !important;
    align-items: flex-start !important;
    justify-content: flex-start !important;
    text-align: left !important;
    gap: 6px !important;
    padding: 20px 22px !important;
    min-height: auto !important;
  }

  .diag-kpi .kpi-label {
    margin: 0 !important;
    font: 700 11px "IBM Plex Mono", monospace !important;
    letter-spacing: 1px !important;
    text-transform: uppercase !important;
    color: #0369A1 !important;
  }

  .diag-kpi .big-number {
    font: 700 26px/1.2 Poppins, sans-serif !important;
    margin: 4px 0 2px !important;
    color: #0F172A !important;
  }

  .diag-kpi .muted {
    font-size: 12px !important;
    font-weight: 600 !important;
    margin: 0 !important;
    color: #334155 !important;
  }
  .kpi .big-number{
    font:800 34px Poppins,sans-serif;
    color:#0F172A;
    overflow-wrap:anywhere;
    margin:0 0;
    letter-spacing:-0.5px;
  }
  .kpi .muted{
    font-size:14px;
    font-weight:600;
    color:#334155;
    margin-top:4px;
  }

  .dashboard-grid{
    display:grid;grid-template-columns:repeat(2,minmax(0,1fr));
    gap:16px;margin-bottom:16px
  }

  .equipment-grid{
    display:grid;
    grid-template-columns:30% 70%;
    align-items:center;
    gap:15px;
  }

  .gauge{width:100%;max-width:290px}
  .centered{text-align:center}

  .parameter-grid{
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:12px;
    width:100%;
  }

  .parameter{
    background:rgba(255,255,255,0.65);
    backdrop-filter:blur(18px);
    -webkit-backdrop-filter:blur(18px);
    border-top:1px solid rgba(255,255,255,0.9);
    border:1px solid rgba(255,255,255,0.75);
    border-radius:16px;
    padding:16px;
    min-height:150px;
    box-shadow:
      0 10px 25px rgba(15,23,42,0.06),
      inset 0 1px 2px rgba(255,255,255,0.8);
    display:flex;
    flex-direction:column;
    justify-content:space-between;
    gap:4px;
  }

  .parameter strong{
    display:block;
    font-size:28px;
    font-weight:700;
    color:#0F172A;
    line-height:1;
    margin:0;
  }

  .parameter-title{
    font-size:12px;
    font-weight:700;
    color:#1E293B;
    margin-bottom:6px;
  }

  .parameter-value{
    display:flex;
    align-items:baseline;
    gap:5px;
  }

  .parameter-unit{
    font-size:16px;
    color:#334155;
    font-weight:600;
  }

  .health-index{
    display:flex;
    justify-content:space-between;
    align-items:center;
    margin-top:8px;
    font-size:12px;
    color:#334155;
  }

  .health-index strong{
    font-size:14px;
    margin:0;
  }

  .limit-text{
    font-size:13px;
    color:#334155;
    margin-top:8px;
    font-weight:500;
  }

  .badge{
    display:inline-block;padding:5px 9px;border-radius:6px;
    font-size:11px;font-weight:700;background:rgba(239,246,255,0.8);color:#2563EB;
    border:1px solid rgba(37,99,235,0.3)
  }

  .badge.normal{
    width:100%;
    text-align:center;
    background:rgba(22,163,74,0.18);
    color:#15803D;
    border:1px solid rgba(22,163,74,0.4);
    border-radius:10px;
    padding:8px 0;
    font-size:13px;
    font-weight:700;
  }

  .badge.alarm,.badge.warning{
    background:rgba(217,119,6,0.18);
    color:#B45309;
    border:1px solid rgba(217,119,6,0.4);
    box-shadow:inset 0 1px 2px rgba(255,255,255,.5);
  }

  .badge.trip{
    background:rgba(220,38,38,0.2);
    color:#B91C1C;
    border:1px solid rgba(220,38,38,0.4);
  }

  .badge.unknown{
    background:rgba(241,245,249,0.7);
    color:#475569;
  }

  .chart-svg{width:100%;height:auto}

  .bar-row{
    display:grid;grid-template-columns:70px 1fr 32px;
    align-items:center;gap:12px;margin:15px 0;font-size:12px;
    font-weight:600;
  }

  .bar-track{
    background:rgba(229,231,235,0.6);
    height:13px;border-radius:6px;
    overflow:hidden;
    border:1px solid rgba(255,255,255,0.5);
  }

  .bar-fill{background:var(--purple);height:100%;border-radius:6px}

  .legend{display:flex;gap:18px;font-size:12px;color:var(--text);font-weight:600}
  .legend i{
    display:inline-block;width:10px;height:10px;
    border-radius:3px;margin-right:5px
  }

  .financial-chart{
    display:flex;align-items:end;gap:8px;
    height:225px;padding-top:15px;overflow-x:auto
  }

  .financial-column{
    flex:1;min-width:24px;height:100%;
    display:flex;flex-direction:column;justify-content:end;
    text-align:center;gap:6px
  }

  .financial-bars{
    height:185px;display:flex;flex-direction:column-reverse;
    justify-content:start;width:75%;margin:auto
  }

  .financial-bars>div{flex-shrink:0;border-radius:2px 2px 0 0}
  .financial-column small{font-size:11px;color:#334155;font-weight:600}

  .table-wrap{overflow-x:auto}

  table{width:100%;border-collapse:collapse;font-size:12px}

  /* KONTRAST TEKS HEADER TABEL KELIHATAN LEBIH TEGAS */
  th{
    background:rgba(241, 245, 249, 0.65);
    backdrop-filter:blur(5px);
    text-align:left;
    color:#0F172A;
    font-size:11px;
    font-weight:700;
    text-transform:uppercase;
    letter-spacing:0.5px;
  }

  td,th{padding:13px;border-bottom:1px solid rgba(255,255,255,0.5);color:#0F172A}
  td{font-weight:500}

  .timeline{
    border-left:2px solid var(--blue);
    padding:0 0 16px 15px;font-size:12.5px;line-height:1.6;color:#1E293B
  }

  .task-card{margin:16px 0;border-left:4px solid var(--blue) !important}
  .task-card textarea{width:100%;display:block;margin-bottom:12px}

  .plant-grid{
    display:grid;grid-template-columns:repeat(3,1fr);
    gap:16px;margin-top:24px
  }

  .plant-card{
    text-align:left;padding:25px;color:var(--text);
  }

  .plant-card:hover{
    transform:translateY(-3px);
    box-shadow:0 25px 50px rgba(15, 23, 42, 0.12), inset 0 1px 2px rgba(255, 255, 255, 0.8) !important;
  }

  .plant-card span{color:var(--blue);font-weight:700;font-size:12px}
  .plant-icon{font-size:30px;color:var(--blue);margin-bottom:15px}

  .trend-selector{
    display:flex;
    gap:18px;
    flex-wrap:wrap;
    margin-top:18px;
    padding-top:14px;
    border-top:1px solid rgba(255,255,255,.35);
  }
  
  .equipment-section{
    display:flex;
    flex-direction:column;
    gap:16px;
    margin-bottom:16px;
  }

  .trend-selector label{
    display:flex;
    align-items:center;
    gap:6px;
    font-size:13px;
    font-weight:600;
    color:#334155;
    margin:0;
  }

  .trend-selector input{
    accent-color:#2563EB;
  }

  /* AI DIAGNOSTICS & CASE FLOW */
  .diag-stack{display:flex;flex-direction:column;gap:24px}
  .diag-stack > .kpi-grid{margin:0}
  .diag-stack .dashboard-grid{margin-bottom:0;gap:24px}
  .diag-stack .kpi-grid{gap:20px}
  .diag-stack .card-heading{margin-bottom:18px}
  .diag-stack .table-wrap{margin-top:6px}
  .diag-stack .hint{margin:16px 0}
  .diag-stack .timeline:last-child{padding-bottom:4px}
  .diag-stack .task-card{margin:0}
  .loss-note{margin:-8px 4px 0;font-size:12px;color:#334155;font-weight:600}
  .rca-field{margin-bottom:22px}
  .rca-field:last-child{margin-bottom:0}
  .rca-field label{margin-top:0}
  .rca-field textarea{margin-top:10px}
  .rca-field .btn{margin-top:12px}

  .diag-kpi{align-items:flex-start;text-align:left;gap:6px;padding:20px 22px}
  .diag-kpi .kpi-label{
    margin:0;
    font:700 11px "IBM Plex Mono",monospace;
    letter-spacing:1px;
    text-transform:uppercase;
    color:#0369A1;
  }
  .diag-kpi .big-number{font:700 26px Poppins,sans-serif;margin:4px 0 2px;line-height:1.2;color:#0F172A}
  .diag-kpi .muted{font-size:12px;font-weight:600;margin:0;color:#334155}

  .badge.badge-lg{font-size:12px;padding:7px 12px;border-radius:8px;white-space:nowrap}
  .badge.s-new{background:rgba(37,99,235,0.18);color:#1D4ED8;border:1px solid rgba(37,99,235,0.4)}
  .badge.s-rca{background:rgba(217,119,6,0.2);color:#B45309;border:1px solid rgba(217,119,6,0.45)}
  .badge.s-exec{background:rgba(124,58,237,0.18);color:#6D28D9;border:1px solid rgba(124,58,237,0.4)}
  .badge.s-closed{background:rgba(22,163,74,0.2);color:#15803D;border:1px solid rgba(22,163,74,0.45)}

  .stepper{display:flex;align-items:flex-start;margin:6px 0 24px;gap:0}
  .step{flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;position:relative;text-align:center}
  .step::before{
    content:"";position:absolute;top:15px;left:-50%;width:100%;height:3px;
    background:rgba(148,163,184,0.5);z-index:0
  }
  .step:first-child::before{display:none}
  .step.done::before,.step.current::before{background:var(--blue)}
  .step .dot{
    position:relative;z-index:1;width:32px;height:32px;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    font:700 13px Poppins,sans-serif;background:rgba(255,255,255,0.9);
    color:#475569;border:2px solid rgba(148,163,184,0.7)
  }
  .step.done .dot{background:var(--blue);border-color:var(--blue);color:#fff}
  .step.current .dot{background:#fff;border-color:var(--blue);color:var(--blue);box-shadow:0 0 0 5px rgba(37,99,235,0.2)}
  .step-label{font-size:11px;font-weight:700;letter-spacing:.4px;color:#475569}
  .step.done .step-label,.step.current .step-label{color:#0F172A}

  @media(max-width:1100px){
    .dashboard-grid{grid-template-columns:1fr}
    .kpi-grid{grid-template-columns:repeat(2,1fr)}
  }

  @media(max-width:700px){
    .shell{display:block}.sidebar{width:100%;position:static;height:auto}
    .content{padding:16px}.kpi-grid{grid-template-columns:1fr 1fr}
    .equipment-grid,.plant-grid{grid-template-columns:1fr}
    .parameter-grid{grid-template-columns:repeat(2,1fr);}
    .topbar{padding:15px}
  }`;

  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}

/* ---------------- RENDER ---------------- */

const PAGES = {
  selection: renderSelection,
  "plant-performance": renderPlantPerformance,
  dashboard: renderPlantPerformance,
  "equipment-performance": renderEquipmentPerformance,
  incidents: renderIncidents,
  diagnostics: renderDiagnostics,
  tasks: renderTasks,
};

function render() {
  const renderPage = PAGES[C.page] || renderTasks;
  document.body.innerHTML = C.user ? shell(renderPage()) : renderLogin();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}