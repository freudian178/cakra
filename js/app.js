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
  diagPoint: {},
  diagSel: {},
  rcaWork: {},
  rcaKey: "cakra-rca-v1",
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
  { id: "MGR-01", role: "manager", password: "demo123" },
  { id: "ROT-01", role: "staff", password: "demo123" },
  { id: "REL-05", role: "staff", password: "demo123" },
  { id: "REL-02", role: "staff", password: "demo123" },
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
    C.rcaWork = loadRcaWork();
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
    <div class="card">${incidentTable(incidents())}</div>`;
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
function episodesFor(tag) {
  const history = C.equipment[tag]?.history || [];
  if (!machines[tag] || !history.length) return null;
  const states = history.map((row) => rowAssessment(tag, row));
  const runs = [];
  for (let i = 0; i < states.length; i++) {
    if (states[i].state === "NORMAL") continue;
    let end = i;
    while (end + 1 < states.length && states[end + 1].state !== "NORMAL") end++;
    let trip = -1;
    for (let k = i; k <= end; k++) {
      if (states[k].state === "TRIP") {
        trip = k;
        break;
      }
    }
    runs.push({ start: i, end, trip });
    i = end;
  }
  if (!runs.length) return null;
  const last = runs[runs.length - 1];
  const live = last.end === states.length - 1 ? last : null;
  const past = live ? runs[runs.length - 2] || null : last;
  return { history, states, live, past };
}

function diagContext(tag) {
  const record = latestRecordForTag(tag);
  const ep = episodesFor(tag);
  if (!ep) {
    return { mode: record ? "REGISTER" : "NONE", level: "HISTORICAL REVIEW", abnormal: [], record, ep: null, points: [], point: null };
  }
  // Selectable points: the live reading (if abnormal) and the last recorded alarm episode.
  const points = [];
  if (ep.live) points.push({ key: "live", idx: ep.live.end, label: "Current Reading" });
  if (ep.past) {
    points.push({ key: "early", idx: ep.past.start, label: "Early Warning" });
    if (ep.past.trip >= 0) points.push({ key: "trip", idx: ep.past.trip, label: "Trip" });
  }
  const wanted = points.find((p) => p.key === C.diagPoint[tag]);
  const chosen = wanted || points.find((p) => p.key === "live") || points.find((p) => p.key === "trip") || points[0];
  const idx = chosen.idx;
  const assessment = ep.states[idx];
  const row = ep.history[idx];
  const leadRun = ep.past || ep.live;
  const first = ep.history[leadRun.start];
  const tripRow = leadRun.trip >= 0 ? ep.history[leadRun.trip] : null;
  // A single abnormal reading after a normal one, with the recorded health status still NORMAL,
  // is treated as unconfirmed (possible instrument or transient issue).
  const unconfirmed =
    chosen.key === "live" &&
    ep.live.start === ep.live.end &&
    ep.live.start > 0 &&
    String(row["Health Status"] || "").toUpperCase() === "NORMAL";
  return {
    mode: ep.live ? "LIVE" : "REPLAY",
    level: assessment.state === "TRIP" ? "TRIP" : "EARLY WARNING",
    abnormal: assessment.abnormal,
    record,
    ep,
    points,
    point: chosen.key,
    row,
    first,
    tripRow,
    hasTrip: !!tripRow,
    leadWeeks: tripRow ? weeksBetween(first.Date, tripRow.Date) : null,
    activeWeeks: weeksBetween(first.Date, ep.history[leadRun.end].Date),
    unconfirmed,
  };
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

function buildRecommendedActions(subject, matches) {
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
  (C.rcaWork[subject.tag]?.actions || []).forEach((a) => {
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

function runDiagnostics(tag) {
  const ctx = diagContext(tag);
  const subject = buildSubject(tag, ctx);
  const matches = ctx.mode === "NONE" ? [] : findSimilarIncidents(subject, ctx);
  return { ctx, subject, matches, causes: buildPossibleCauses(matches), actions: buildRecommendedActions(subject, matches) };
}

function actionAlreadyAssigned(action) {
  return C.tasks.find(
    (t) =>
      t.tag === C.tag &&
      t.action === action.text &&
      ["ASSIGNED", "IN_PROGRESS", "PENDING_VERIFICATION"].includes(t.status),
  );
}

/* ---- RCA workspace state ---- */

function rcaState(tag) {
  C.rcaWork[tag] ??= {
    open: false,
    problem: "",
    evidence: "",
    findings: "",
    rootCause: "",
    confirmedBy: "",
    confirmedAt: "",
    actions: [],
  };
  return C.rcaWork[tag];
}

function loadRcaWork() {
  try {
    const v = JSON.parse(localStorage.getItem(C.rcaKey) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch (err) {
    console.warn("Saved RCA work could not be read.", err);
    return {};
  }
}

function saveRca() {
  try {
    localStorage.setItem(C.rcaKey, JSON.stringify(C.rcaWork));
  } catch (err) {
    console.warn("RCA work could not be saved.", err);
  }
}

function rerender() {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}

/* ---- render ---- */

function conditionText(ctx) {
  if (ctx.mode === "REGISTER")
    return "No threshold telemetry is configured for this tag. Diagnostics rely on the incident register and any linked RCA records.";
  if (ctx.mode === "NONE") return "No telemetry and no incident record are available for this tag.";
  const params = ctx.abnormal.map((p) => p.label).join(", ");
  if (ctx.unconfirmed)
    return params + " crossed a threshold in a single reading only. The previous reading and the recorded health status are normal, so this is unconfirmed. Verify the instrument and trend before treating it as a trip.";
  if (ctx.level === "TRIP") return params + " crossed the trip threshold. Diagnostic review is recommended.";
  return params + " reached an alarm condition. Review similar cases and preventive actions before it escalates.";
}

function renderDiagnostics() {
  const tagOptions = tagsForPlant();
  if (!tagOptions.includes(C.tag)) C.tag = tagOptions[0] || "";
  const d = runDiagnostics(C.tag);
  const { ctx, subject, matches, causes, actions } = d;
  const record = ctx.record;
  const isManager = C.role === "manager";
  const sel = new Set(C.diagSel[C.tag] || []);
  const levelClass = ctx.level === "TRIP" ? "trip" : ctx.level === "EARLY WARNING" ? "alarm" : "normal";

  const header = `
    <div class="page-header">
      <div>
        <p class="eyebrow">DECIDE / DIAGNOSTICS</p>
        <h1>${esc(C.tag)} — AI-Assisted Diagnostics</h1>
        <p class="muted">Decision support: similar incidents, historical RCA and recommended actions. A root cause is confirmed only through RCA Analysis.</p>
      </div>
      <div class="filter-box">
        <label>Equipment Tag</label>
        <select onchange="chooseTag(this.value)">
          ${tagOptions.map((t) => `<option value="${esc(t)}" ${t === C.tag ? "selected" : ""}>${esc(t)}</option>`).join("")}
        </select>
      </div>
    </div>`;

  /* 1. condition + incident summary */
  const pointButtons =
    ctx.points.length > 1 || ctx.mode === "REPLAY"
      ? `<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
          ${ctx.points
            .map(
              (p) =>
                `<button class="btn ${ctx.point === p.key ? "" : "outline"}" onclick="setDiagPoint('${p.key}')">${esc(p.label)} · Week ${esc(ctx.ep.history[p.idx].Week)}</button>`,
            )
            .join("")}
        </div>
        <p class="muted" style="margin-top:12px">${
          ctx.mode === "REPLAY"
            ? "Replay of the last recorded alarm episode (the latest reading is back to normal). "
            : ""
        }Incident records on this tag are used as historical reference.</p>`
      : "";

  const paramTable = ctx.abnormal.length
    ? `<div class="table-wrap" style="margin-top:14px"><table>
        <thead><tr><th>Parameter</th><th>Current Reading</th><th>Alarm Threshold</th><th>Trip Threshold</th><th>Status</th></tr></thead>
        <tbody>${ctx.abnormal
          .map(
            (p) => `<tr>
            <td>${esc(p.label)}</td>
            <td>${esc(p.value)} ${esc(p.unit)}</td>
            <td>${esc(p.alarm)}</td>
            <td>${esc(p.trip)}</td>
            <td><span class="badge ${p.state.toLowerCase()}">${esc(p.state)}</span></td>
          </tr>`,
          )
          .join("")}</tbody></table></div>`
    : "";

  const leadCard =
    ctx.mode === "REGISTER" || ctx.mode === "NONE"
      ? card("Early-Warning Lead Time", "—", "No weekly telemetry for this tag")
      : ctx.hasTrip
        ? card("Early-Warning Lead Time", ctx.leadWeeks + " weeks", "Recorded episode: first alarm " + ctx.first.Date + " → trip " + ctx.tripRow.Date)
        : card("Alarm Active", ctx.activeWeeks + " weeks", "Since " + ctx.first.Date + " · no trip yet");

  const summary = `
    <div class="card">
      <div class="card-heading">
        <div>
          <p class="eyebrow">INCIDENT SUMMARY</p>
          <h3>${esc(subject.name)}</h3>
          <p class="muted">${esc(conditionText(ctx))}</p>
        </div>
        <span class="badge ${levelClass}">${esc(ctx.level)}</span>
      </div>
      ${paramTable}
      ${pointButtons}
    </div>
    <div class="kpi-grid">
      ${card("Incident Record", record ? record["AR No."] : "None", record ? record["Risk Case Title"] : "No incident registered for this tag")}
      ${card("Record Status", record ? record["Overall Status"] : "—", record ? "RCA due " + (record["RCA Due Date"] || "—") : "")}
      ${card("Downtime", record ? num(record["Downtime (hrs)"]) + " h" : "—", "Incident Database")}
      ${card("Actual Loss", record ? usd(num(record["Act. Loss (k US$)"]) * 1000) : "—", "Incident Database")}
      ${card("Potential Loss", record ? usd(num(record["Pot. Loss (k US$)"]) * 1000) : "—", "Incident Database")}
      ${leadCard}
    </div>`;

  /* 2. similar incidents */
  const rcaCount = matches.filter((m) => m.rca).length;
  const plantCount = new Set(matches.map((m) => m.row.Plant)).size;
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
              (m) => `<tr>
            <td><span class="badge">${esc(m.label)}</span></td>
            <td><strong>${esc(m.row["Tag Number"])}</strong> · ${esc(m.row["AR No."])}<br>
              ${esc(m.row["Risk Case Title"])}<br><small class="muted">${esc(m.relation)} · ${esc(m.row["Overall Status"])}</small></td>
            <td>${m.reasons.map((r) => esc(r)).join("<br>")}</td>
            <td>${m.rca ? "Available" : "Not available"}</td>
          </tr>`,
            )
            .join("")}</tbody></table></div>`
          : `<p class="muted">The diagnostic can only reference incidents that exist in the Incident Database.</p>`
      }
    </div>`;

  /* 3. historical RCA reference */
  const rcaMatches = matches.filter((m) => m.rca).slice(0, 3);
  const rcaRef = matches.length
    ? `<div class="card">
        <p class="eyebrow">HISTORICAL RCA REFERENCE</p>
        <h3>Reference from Similar Cases</h3>
        ${
          rcaMatches.length
            ? `<p class="muted">Historical RCA is evidence, not the RCA of the current condition. The root cause of the current condition is not confirmed.</p>
          ${rcaMatches
            .map(
              (m) => `<div class="hint">
            <strong>Similar case: ${esc(m.row["Tag Number"])} — ${esc(m.row["AR No."])}</strong>
            <small class="muted"> · ${esc(m.relation)}</small>
            <p><strong>Historical root cause:</strong> A similar historical incident was associated with: ${esc(m.rca.root_cause)}</p>
            <p><strong>Historical corrective / preventive actions:</strong></p>
            ${(m.rca.corrective_actions || []).map((a) => `<div class="timeline">${esc(a.action)}</div>`).join("")}
          </div>`,
            )
            .join("")}`
            : `<p class="muted"><strong>Similar Historical Incident Found.</strong> No historical RCA available for this case.</p>`
        }
      </div>`
    : "";

  /* 4. possible causes + evidence summary */
  const causesCard = `
    <div class="card">
      <p class="eyebrow">POSSIBLE CAUSES</p>
      <h3>Hypotheses from Evidence</h3>
      ${
        causes.length
          ? `<p class="muted">These are possible causes drawn from similar cases, not confirmed root causes.</p>
        ${causes.map((c) => `<div class="timeline"><strong>Possible cause:</strong> ${esc(c.text)}<br><small class="muted">${esc(c.source)}</small></div>`).join("")}`
          : `<p class="muted">Insufficient evidence to determine a likely cause. Further inspection is recommended.</p>`
      }
    </div>`;
  const evidenceCard = `
    <div class="card">
      <p class="eyebrow">EVIDENCE BASE</p>
      <h3>What this view is based on</h3>
      <div class="timeline">${ctx.abnormal.length ? ctx.abnormal.length + " abnormal parameter(s) at the selected point" : "No abnormal parameter available"}</div>
      <div class="timeline">${matches.length} similar incident(s) across ${plantCount} plant(s)</div>
      <div class="timeline">${rcaCount} of ${matches.length} similar incident(s) have a historical RCA</div>
      <div class="timeline">${record ? "Latest record on this tag: " + esc(record["AR No."]) : "No incident record on this tag"}</div>
    </div>`;

  /* 5. recommended actions */
  const groupRows = (type) =>
    actions
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => a.type === type)
      .map(({ a, i }) => {
        const task = actionAlreadyAssigned(a);
        return `<tr>
          <td style="width:34px">${
            isManager && !task
              ? `<input type="checkbox" style="width:auto;margin:0;padding:0" ${sel.has(a.text) ? "checked" : ""} onchange="toggleDiagAction(${i})">`
              : ""
          }</td>
          <td>${esc(a.text)}<br><small class="muted">${esc(a.source)} · ${esc(a.ref)}</small></td>
          <td>${esc(a.pic || "—")}</td>
          <td>${esc(a.histStatus || "—")}</td>
          <td>${task ? `<span class="badge">${esc(task.status)}</span>` : isManager ? "" : `<span class="muted">Manager only</span>`}</td>
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
  const rca = rcaState(C.tag);
  const actionsCard = `
    <div class="card">
      <div class="card-heading">
        <div>
          <p class="eyebrow">DECIDE / RECOMMENDATION</p>
          <h3>Recommended Actions</h3>
          <p class="muted">Review and select the actions to carry forward. Nothing is sent to the Action Hub automatically.</p>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn outline" onclick="startRca()">${rca.open ? "RCA Analysis Open ↓" : "Start RCA Analysis"}</button>
          ${isManager ? `<button class="btn" ${sel.size ? "" : "disabled style=\"opacity:.5;cursor:not-allowed\""} onclick="openActionPlan()">Create Action Plan (${sel.size})</button>` : ""}
        </div>
      </div>
      ${
        actions.length
          ? actionGroup(
              "A. Immediate Corrective Action",
              ctx.level === "EARLY WARNING"
                ? "Failure has not occurred yet. Listed for readiness if the condition escalates."
                : "For a trip or failure that needs prompt action.",
              "Corrective",
            ) +
            actionGroup("B. Preventive / Pro-active Action", "To prevent recurrence or reduce risk.", "Preventive") +
            (isManager ? "" : `<p class="muted" style="margin-top:14px">Only managers can select and assign actions.</p>`)
          : `<p class="muted">${
              matches.length
                ? "No historical RCA or CAPA is available for the similar incidents, so no actions can be recommended. Further inspection is recommended."
                : "No matching historical incident found, so no actions can be recommended."
            } You can still start RCA Analysis and define actions from the investigation.</p>`
      }
    </div>`;

  return `
    ${header}
    ${summary}
    ${similar}
    ${rcaRef}
    <div class="dashboard-grid">${causesCard}${evidenceCard}</div>
    ${actionsCard}
    ${rca.open ? renderRcaAnalysis(d) : ""}
    ${C.assigningPlan ? renderAssignModal(d) : ""}`;
}

function renderRcaAnalysis(d) {
  const { ctx, subject, matches, causes } = d;
  const s = rcaState(C.tag);
  const record = ctx.record;
  const defaultProblem =
    C.tag +
    " — " +
    ctx.level.toLowerCase() +
    (ctx.abnormal.length ? ": " + ctx.abnormal.map((p) => p.label + " " + p.value + " " + p.unit).join(", ") : "");
  const chronology = ctx.ep
    ? [
        ctx.first && "Week " + ctx.first.Week + " · " + ctx.first.Date + ": first threshold deviation recorded.",
        ctx.tripRow && "Week " + ctx.tripRow.Week + " · " + ctx.tripRow.Date + ": " + (ctx.tripRow.Remark || "trip recorded."),
      ].filter(Boolean)
    : record
      ? [record["Date of Occur."] + ": " + record["Risk Case Title"]]
      : [];
  const confirmed = !!s.confirmedAt;
  return `
    <div class="card" id="rca-analysis">
      <div class="card-heading">
        <div>
          <p class="eyebrow">RCA ANALYSIS</p>
          <h3>${esc(C.tag)} — Root Cause Investigation</h3>
          <p class="muted">Investigation workspace. Confirmed Root Cause is filled by the investigator, never by historical RCA.</p>
        </div>
        <span class="badge ${confirmed ? "normal" : "alarm"}">${confirmed ? "ROOT CAUSE CONFIRMED" : "INVESTIGATION OPEN"}</span>
      </div>

      <label>Incident</label>
      <p class="muted">${esc(record ? record["AR No."] + " · " + record["Risk Case Title"] : "No incident record linked")} · ${esc(subject.name)}</p>

      <label>Problem Statement</label>
      <textarea rows="3" style="width:100%" oninput="rcaInput('problem',this.value)">${esc(s.problem || defaultProblem)}</textarea>

      <label>Incident Chronology</label>
      ${chronology.length ? chronology.map((x) => `<div class="timeline">${esc(x)}</div>`).join("") : `<p class="muted">No chronology available.</p>`}

      <label>Evidence</label>
      ${ctx.abnormal.map((p) => `<div class="timeline">${esc(p.label)}: ${esc(p.value)} ${esc(p.unit)} (${esc(p.state)}; alarm ${esc(p.alarm)}, trip ${esc(p.trip)})</div>`).join("")}
      <textarea rows="3" style="width:100%" placeholder="Add inspection findings, photos reference, field observations" oninput="rcaInput('evidence',this.value)">${esc(s.evidence)}</textarea>

      <label>Similar Historical Cases</label>
      ${matches.length ? matches.map((m) => `<div class="timeline">${esc(m.row["Tag Number"])} · ${esc(m.row["AR No."])} — ${esc(m.row["Risk Case Title"])}${m.rca ? " (RCA available)" : ""}</div>`).join("") : `<p class="muted">No matching historical incident found.</p>`}

      <label>Possible Causes</label>
      ${causes.length ? causes.map((c) => `<div class="timeline">${esc(c.text)}</div>`).join("") : `<p class="muted">Insufficient evidence to determine a likely cause.</p>`}

      <label>Investigation Findings</label>
      <textarea rows="4" style="width:100%" placeholder="What did the investigation find?" oninput="rcaInput('findings',this.value)">${esc(s.findings)}</textarea>

      <label>Confirmed Root Cause</label>
      ${
        confirmed
          ? `<div class="hint"><strong>${esc(s.rootCause)}</strong>
              <p class="muted">Confirmed by ${esc(s.confirmedBy)} on ${esc(s.confirmedAt.slice(0, 10))}</p></div>
            <button class="btn outline" onclick="reopenRca()">Reopen Investigation</button>`
          : `<p class="muted">Not yet determined</p>
            <textarea rows="3" style="width:100%" placeholder="State the root cause supported by your findings" oninput="rcaInput('rootCause',this.value)">${esc(s.rootCause)}</textarea>
            <button class="btn" onclick="confirmRootCause()">Confirm Root Cause</button>`
      }

      <label>Corrective &amp; Preventive Actions</label>
      <p class="muted">Select from the Recommended Actions above, or add an action defined by this investigation.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <input id="rca-new-action" placeholder="New action" style="flex:1;min-width:220px">
        <select id="rca-new-type"><option>Corrective</option><option>Preventive</option></select>
        <button class="btn outline" onclick="addRcaAction()">Add Action</button>
      </div>
    </div>`;
}

function renderAssignModal(d) {
  const chosen = (C.diagSel[C.tag] || []).map((text) => d.actions.find((a) => a.text === text)).filter(Boolean);
  if (!chosen.length) return "";
  const staff = USERS.filter((u) => u.role === "staff").map((u) => u.id);
  const defaultPriority = d.ctx.level === "TRIP" && !d.ctx.unconfirmed ? "High" : "Medium";
  const today = new Date().toISOString().slice(0, 10);
  return `
    <div id="assign-modal" style="position:fixed;inset:0;background:rgba(15,23,42,.35);backdrop-filter:blur(5px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px">
      <div class="card" style="width:min(860px,100%);max-height:90vh;overflow:auto;box-shadow:0 24px 60px rgba(15,23,42,.22)">
        <div class="card-heading">
          <div>
            <p class="eyebrow">ACTION ASSIGNMENT</p>
            <h3>Assign ${chosen.length} Selected Action${chosen.length > 1 ? "s" : ""}</h3>
            <p class="muted">Deadline is required and is set by you. PIC is pre-filled from the historical RCA when available.</p>
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
                ${["High", "Medium", "Low"].map((p) => `<option ${p === defaultPriority ? "selected" : ""}>${p}</option>`).join("")}
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

function setDiagPoint(point) {
  C.diagPoint[C.tag] = point;
  C.diagSel[C.tag] = [];
  rerender();
}

function toggleDiagAction(index) {
  if (C.role !== "manager") return;
  const action = runDiagnostics(C.tag).actions[index];
  if (!action) return;
  const sel = new Set(C.diagSel[C.tag] || []);
  if (sel.has(action.text)) sel.delete(action.text);
  else sel.add(action.text);
  C.diagSel[C.tag] = [...sel];
  rerender();
}

function openActionPlan() {
  if (C.role !== "manager" || !(C.diagSel[C.tag] || []).length) return;
  C.assigningPlan = true;
  rerender();
}

function closeAssignModal() {
  C.assigningPlan = false;
  rerender();
}

function confirmAssign() {
  if (C.role !== "manager") return;
  const d = runDiagnostics(C.tag);
  const chosen = (C.diagSel[C.tag] || []).map((text) => d.actions.find((a) => a.text === text)).filter(Boolean);
  if (!chosen.length) return alert("No action selected.");

  const rows = chosen.map((a, i) => ({
    a,
    pic: document.getElementById("as-pic-" + i)?.value || "",
    priority: document.getElementById("as-pri-" + i)?.value || "Medium",
    due: document.getElementById("as-due-" + i)?.value || "",
  }));
  if (rows.some((r) => !r.due)) return alert("Please enter a deadline for every action.");
  if (rows.some((r) => !r.pic)) return alert("Please select a PIC for every action.");

  const stamp = Date.now();
  rows.forEach((r, i) => {
    C.tasks.push({
      id: "TASK-" + stamp + "-" + i,
      ar: d.ctx.record?.["AR No."] || "—",
      tag: C.tag,
      plant: C.plant,
      action: r.a.text,
      type: r.a.type,
      priority: r.priority,
      source: r.a.source + " (" + r.a.ref + ")",
      pic: r.pic,
      due: r.due,
      status: "ASSIGNED",
      evidence: "",
      history: [{ by: C.user, status: "ASSIGNED", at: new Date().toISOString() }],
    });
  });
  save();
  C.diagSel[C.tag] = [];
  C.assigningPlan = false;
  go("tasks");
}

function startRca() {
  const s = rcaState(C.tag);
  s.open = true;
  saveRca();
  rerender();
  document.getElementById("rca-analysis")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function rcaInput(field, value) {
  rcaState(C.tag)[field] = value;
  saveRca();
}

function confirmRootCause() {
  const s = rcaState(C.tag);
  if (!s.findings.trim()) return alert("Please record the investigation findings first.");
  if (!s.rootCause.trim()) return alert("Please state the confirmed root cause.");
  s.confirmedBy = C.user;
  s.confirmedAt = new Date().toISOString();
  saveRca();
  rerender();
}

function reopenRca() {
  const s = rcaState(C.tag);
  s.confirmedBy = "";
  s.confirmedAt = "";
  saveRca();
  rerender();
}

function addRcaAction() {
  const text = document.getElementById("rca-new-action")?.value.trim();
  const type = document.getElementById("rca-new-type")?.value || "Corrective";
  if (!text) return alert("Please describe the action.");
  const s = rcaState(C.tag);
  s.actions.push({ text, type });
  saveRca();
  rerender();
}

/* ---------------- TASKS ---------------- */

function updateTask(id, next, evidence = "") {
  const t = C.tasks.find((x) => x.id === id);
  if (!t) return;
  const manager = C.role === "manager";
  const owner = C.role === "staff" && t.pic === C.user;

  const allowed =
    (owner && t.status === "ASSIGNED" && next === "IN_PROGRESS") ||
    (owner && t.status === "IN_PROGRESS" && next === "PENDING_VERIFICATION" && evidence.trim()) ||
    (manager && t.status === "PENDING_VERIFICATION" && ["VERIFIED", "IN_PROGRESS"].includes(next));

  if (!allowed) return alert("Action not permitted.");

  t.status = next;
  if (evidence) t.evidence = evidence;
  t.history.push({
    by: C.user,
    status: next,
    at: new Date().toISOString(),
  });
  save();
  render();
}

function submitTask(id) {
  const text = document.getElementById("evidence-" + id)?.value.trim();
  if (!text) return alert("Please provide completion evidence.");
  updateTask(id, "PENDING_VERIFICATION", text);
}

function resetTasks() {
  if (C.role !== "manager") return;
  if (!confirm("Reset all demo tasks?")) return;
  C.tasks = [];
  save();
  render();
}

function isOverdue(t) {
  return t.status !== "VERIFIED" && String(t.due || "") < new Date().toISOString().slice(0, 10);
}

function renderTasks() {
  const rows = C.role === "manager" ? C.tasks : C.tasks.filter((x) => x.pic === C.user);

  return `
    <div class="page-header">
      <div>
        <p class="eyebrow">ACT / WORK ORDER MANAGEMENT</p>
        <h1>Action Hub</h1>
        <p class="muted">
          ${C.role === "manager" ? "All assigned tasks" : "My assigned tasks"}
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
    ${
      rows.length
        ? rows
            .map(
              (t) => `
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
          ${esc(t.ar)} · PIC ${esc(t.pic)} · Due ${esc(t.due)}${t.type ? " · " + esc(t.type) : ""}${t.priority ? " · " + esc(t.priority) + " priority" : ""}
        </p>
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
          C.role === "manager" && t.status === "PENDING_VERIFICATION"
            ? `
          <button class="btn"
            onclick="updateTask('${t.id}','VERIFIED')">
            Verify Completion
          </button>
          <button class="btn outline"
            onclick="updateTask('${t.id}','IN_PROGRESS')">
            Return to Staff
          </button>`
            : ""
        }
        ${
          t.status === "VERIFIED"
            ? `
          <p class="success-text">
            Task verified. Incident closure remains separate.
          </p>`
            : ""
        }
      </div>`,
            )
            .join("")
        : `<div class="card"><p class="muted">
        No tasks available for this account.
      </p></div>`
    }`;
}

/* ---------------- STYLES ---------------- */

function installStyles() {
  const css = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Open+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap');

  :root{
    --blue:#0F4C81;
    --purple:#2563EB;
    --green:#16A34A;
    --orange:#D97706;
    --red:#DC2626;

    --text:#0F172A;
    --muted:#475569;
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

  h1,h2,h3{font-family:Poppins,sans-serif;margin:0 0 12px;color:#0F172A}
  h1{font-size:30px}h2{font-size:21px}h3{font-size:17px}
  p{line-height:1.65}
  button,input,select,textarea{font:inherit}
  button{cursor:pointer}

  label{
    display:block;font-size:12px;font-weight:700;
    margin:16px 0 8px;color:#475569;text-transform:uppercase;letter-spacing:.5px
  }

  input,select,textarea{
    padding:11px 12px;
    border:1px solid rgba(255,255,255,0.6);
    border-radius:10px;
    background:rgba(255,255,255,0.55);
    backdrop-filter:blur(10px);
    -webkit-backdrop-filter:blur(10px);
    color:var(--text);
    max-width:100%;
    box-shadow:inset 0 1px 2px rgba(255,255,255,0.4);
  }

  .muted{color:#334155;font-size:13px;font-weight:500;margin:0 0 12px}

  .eyebrow{
    font:600 11px "IBM Plex Mono",monospace;
    letter-spacing:1px;color:var(--blue);margin-bottom:10px
  }

  .btn{
    border:1px solid rgba(255,255,255,0.3);
    border-radius:10px;
    background:rgba(15, 76, 129, 0.85);
    backdrop-filter:blur(8px);
    -webkit-backdrop-filter:blur(8px);
    color:white;
    padding:11px 17px;
    font-weight:600;
    box-shadow:0 4px 15px rgba(15,76,129,0.25), inset 0 1px 1px rgba(255,255,255,0.3);
    transition:all 0.2s ease;
  }

  .btn:hover{
    background:rgba(15, 76, 129, 0.95);
    box-shadow:0 6px 20px rgba(15,76,129,0.35);
  }

  .btn.outline{
    background:rgba(255,255,255,0.5);
    color:var(--blue);
    border:1px solid rgba(191,219,254,0.8);
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
color:#475569;
}

  /* GLASS CARD STYLING */
  .login-card, .card, .plant-card, .filter-box {
    background: rgba(255, 255, 255, 0.42) !important;
    backdrop-filter: blur(20px) saturate(160%) !important;
    -webkit-backdrop-filter: blur(20px) saturate(160%) !important;
    border: 1px solid rgba(255, 255, 255, 0.6) !important;
    border-top: 1px solid rgba(255, 255, 255, 0.8) !important;
    border-left: 1px solid rgba(255, 255, 255, 0.7) !important;
    border-radius: 20px !important;
    box-shadow: 
      0 20px 40px rgba(15, 23, 42, 0.08),
      inset 0 1px 2px rgba(255, 255, 255, 0.6) !important;
    padding: 22px;
    min-width: 0;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .login-card input{width:100%}

  .hint{
    background:rgba(239,246,255,0.5);
    border:1px solid rgba(255,255,255,0.5);
    border-radius:12px;
    padding:15px;font-size:13px;margin:20px 0
  }

  .danger-text{color:var(--red);font-size:12px}
  .success-text{color:var(--green);font-weight:600}

  .shell{display:flex;min-height:100vh}

  .sidebar{
    width:245px;flex-shrink:0;
    background:rgba(15, 23, 42, 0.85);
    backdrop-filter:blur(25px);
    -webkit-backdrop-filter:blur(25px);
    border-right:1px solid rgba(255,255,255,0.1);
    color:white;padding:28px 18px;position:relative
  }

  .side-caption{font-size:10px;color:#94A3B8;margin-bottom:35px}
  .side-footer{font-size:10px;color:#94A3B8;margin-top:45px}

  .nav{
    display:block;width:100%;border:0;border-radius:10px;
    text-align:left;padding:13px;color:#CBD5E1;
    background:transparent;margin:5px 0;font-size:13px;
    transition:all 0.2s ease;
  }

  .nav:hover,.nav.active{
    background:rgba(37, 99, 235, 0.8);
    backdrop-filter:blur(10px);
    color:white;
    box-shadow:0 4px 12px rgba(37, 99, 235, 0.3);
  }

  .main{flex:1;min-width:0}

  .topbar{
    background:rgba(255,255,255,0.35);
    backdrop-filter:blur(20px) saturate(180%);
    -webkit-backdrop-filter:blur(20px) saturate(180%);
    border-bottom:1px solid rgba(255,255,255,0.5);
    padding:17px 28px;display:flex;justify-content:space-between;
    align-items:center;gap:12px;flex-wrap:wrap
  }

  .user-area{display:flex;align-items:center;gap:12px;font-size:13px}

  .role-badge{
    background:rgba(239,246,255,0.6);
    color:#2563EB;
    border:1px solid rgba(255,255,255,0.6);
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

  .kpi{
    display:flex;
    flex-direction:column;
    justify-content:center;
    align-items:center;
    text-align:center;
  }
  .kpi .big-number{
    font:900 34px Poppins,sans-serif;
    color:#0F172A;
    overflow-wrap:anywhere;
    margin:0 0;
  }
  .kpi .muted{
    font-size:20px;
    font-weight:600;
    color:#334155;
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
    background:rgba(255,255,255,0.55);
    backdrop-filter:blur(18px);
    -webkit-backdrop-filter:blur(18px);

    border-top:1px solid rgba(255,255,255,0.8);
    border:1px solid rgba(255,255,255,0.7);
    border-radius:16px;
    padding:16px;
    min-height:150px;
    box-shadow:
    0 10px 25px rgba(15,23,42,0.08),
    inset 0 1px 2px rgba(255,255,255,0.7);
    display:flex;
    flex-direction:column;
    justify-content:space-between;
    gap:4px;
  }

  .parameter strong{
    display:block;
    font-size:30px;
    font-weight:700;
    color:#0F172A;
    line-height:1;
    margin:0;
  }

  .parameter-title{
    font-size:12px;
    font-weight:600;
    color:#334155;
    margin-bottom:8px;
  }

  .parameter-value{
    display:flex;
    align-items:baseline;
    gap:5px;
  }

  .parameter-unit{
    font-size:18px;
    color:#475569;
    font-weight:500;
  }

  .health-index{
    display:flex;
    justify-content:space-between;
    align-items:center;
    margin-top:8px;
    font-size:12px;
    color:#64748B;
  }

  .health-index strong{
    font-size:14px;
    margin:0;
  }

  .limit-text{
    font-size:14px;
    color:#64748B;
    margin-top:8px;
  }

  .badge{
    display:inline-block;padding:5px 9px;border-radius:6px;
    font-size:10px;font-weight:700;background:rgba(239,246,255,0.6);color:#2563EB;
    border:1px solid rgba(255,255,255,0.5)
  }

  .badge.normal{
    width:100%;
    text-align:center;
    background:rgba(22,163,74,0.18);
    color:#15803D;
    border:1px solid rgba(22,163,74,0.35);
    border-radius:10px;
    padding:9px 0;
    font-size:14px;
    font-weight:700;
  }

  .badge.alarm,.badge.warning{
      background:rgba(217,119,6,0.16);
      color:#B45309;
      border-color:rgba(217,119,6,0.35);
      box-shadow:
      inset 0 1px 2px rgba(255,255,255,.5);
  }

  .badge.trip{
    background:rgba(220,38,38,0.18);
    color:var(--red);
    border:1px solid rgba(220,38,38,0.3);
  }

  .badge.unknown{
    background:rgba(241,245,249,0.5);
    color:#64748B;
  }

  .chart-svg{width:100%;height:auto}

  .bar-row{
    display:grid;grid-template-columns:70px 1fr 32px;
    align-items:center;gap:12px;margin:15px 0;font-size:12px
  }

  .bar-track{
    background:rgba(229,231,235,0.5);
    height:13px;border-radius:6px;
    overflow:hidden;
    border:1px solid rgba(255,255,255,0.4);
  }

  .bar-fill{background:var(--purple);height:100%;border-radius:6px}

  .legend{display:flex;gap:18px;font-size:11px;color:var(--muted)}
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
  .financial-column small{font-size:10px;color:var(--muted)}

  .table-wrap{overflow-x:auto}

  table{width:100%;border-collapse:collapse;font-size:12px}

  th{
    background:rgba(248,250,252,0.4);
    backdrop-filter:blur(5px);
    text-align:left;color:var(--muted);
    font-size:10px;text-transform:uppercase
  }

  td,th{padding:13px;border-bottom:1px solid rgba(255,255,255,0.4)}

  .timeline{
    border-left:2px solid var(--blue);
    padding:0 0 16px 15px;font-size:12px;line-height:1.6
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
    border-top:
    1px solid rgba(255,255,255,.35);
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

  @media(max-width:1100px){
    .dashboard-grid{grid-template-columns:1fr}
    .kpi-grid{grid-template-columns:repeat(2,1fr)}
  }

  @media(max-width:700px){
    .shell{display:block}.sidebar{width:100%;position:static}
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