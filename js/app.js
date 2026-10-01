
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
  key: "cakra-actions-v5"
};

const $ = s => document.querySelector(s);
const num = v => Number(v) || 0;
const usd = v => "$" + num(v).toLocaleString("en-US", {
  maximumFractionDigits: 0
});
const esc = v => String(v ?? "").replace(/[&<>"']/g,
  x => ({"&":"&amp;","<":"&lt;",">":"&gt;",
         '"':"&quot;","'":"&#39;"}[x]));

const machines = {

    "PU-2101B": {
        params: [
            {
            key:"Overall Vibration (mm/s)",
            label:"Overall Vibration",
            unit:"mm/s",
            alarm:7,
            trip:11,
            direction:"high",
            jsonKey:"Overall Vibration (mm/s)",
            base:null
            },
            {
            key:"Seal Flush Flow (L/min)",
            label:"Seal Flush Flow",
            unit:"L/min",
            alarm:5,
            trip:4,
            direction:"low",
            jsonKey:"Seal Flush Flow (L/min)",
            base:null
            },
            {
            key:"Discharge Pressure (barg)",
            label:"Discharge Pressure",
            unit:"barg",
            alarm:8.5,
            trip:7.5,
            direction:"low",
            jsonKey:"Discharge Pressure (barg)",   
            base:null
            },
            {
            key:"Bearing Temp (°C)",
            label:"Bearing Temperature",
            unit:"°C",
            alarm:80,
            trip:95,
            direction:"high",
            jsonKey:"Bearing Temp (°C)",
            base:null
            }
        ]
    },


    "KO-3201": {
        params:    [
        {
        key:"DE Radial Vibration (micron)",
        label:"DE Radial Vibration",
        unit:"micron",
        alarm:45,
        trip:75,
        direction:"high",
        jsonKey:"DE Radial Vibration (micron)",
        base:null
        },
        {
        key:"Lube Oil Water Content (ppm)",
        label:"Lube Oil Water Content",
        unit:"ppm",
        alarm:500,
        trip:1500,
        direction:"high",
        jsonKey:"Lube Oil Water Content (ppm)",
        base:null
        },
        {
        key:"Lube Oil Supply Press (barg)",
        label:"Lube Oil Supply Pressure",
        unit:"barg",
        alarm:1.4,
        trip:1.1,
        direction:"low",
        jsonKey:"Lube Oil Supply Press (barg)",
        base:null
        },
        {
        key:"Bearing Metal Temp (°C)",
        label:"Bearing Metal Temperature",
        unit:"°C",
        alarm:95,
        trip:110,
        direction:"high",
        jsonKey:"Bearing Metal Temp (°C)",
        base:null
        }
        ],
    },


    "PM-4405B":{
        params:[
        {
        key:"Motor DE Bearing Temp (°C)",
        label:"Motor DE Bearing Temp",
        unit:"°C",
        alarm:75,
        trip:90,
        direction:"high",
        jsonKey:"Motor DE Bearing Temp (°C)",
        base:null
        },
        {
        key:"Motor Vibration (mm/s)",
        label:"Motor Vibration",
        unit:"mm/s",
        alarm:5,
        trip:8,
        direction:"high",
        jsonKey:"Motor Vibration (mm/s)",
        base:null
        },
        {
        key:"Motor Ampere (A)",
        label:"Motor Ampere",
        unit:"A",
        alarm:150,
        trip:165,
        direction:"high",
        jsonKey:"Motor Ampere (A)",
        base:null
        },
        {
        key:"Winding Temp (°C)",
        label:"Winding Temperature",
        unit:"°C",
        alarm:120,
        trip:140,
        direction:"high",
        jsonKey:"Winding Temp (°C)",
        base:null
        }
        ],
    },


    "HE-3301": {
        params: [
        {
        key:"Tube-side dP (bar)",
        label:"Tube-side dP",
        unit:"bar",
        alarm:0.6,
        trip:0.9,
        direction:"high",  
        jsonKey:"Tube-side dP (bar)",
        base:null
        },
        {
        key:"Heat Duty (% design)",
        label:"Heat Duty",
        unit:"%",
        alarm:90,
        trip:70,
        direction:"low",
        jsonKey:"Heat Duty (% design)",
        base:null
        },
        {
        key:"Cold Outlet Temp (°C)",
        label:"Cold Outlet Temp",
        unit:"°C",
        alarm:110,
        trip:95,
        direction:"low",
        jsonKey:"Cold Outlet Temp (°C)",   
        base:null
        },
        {
        key:"Feed Heavy-ends (%)",
        label:"Feed Heavy Ends",
        unit:"%",
        alarm:1.5,
        trip:2.4,
        direction:"high",
        jsonKey:"Feed Heavy-ends (%)",
        base:null
        }
        ]
    },


    "BL-5702": {
        params: [
        {
        key:"Overall Vibration (mm/s)",
        label:"Overall Vibration",
        unit:"mm/s",
        alarm:7,
        trip:11,
        direction:"high",
        jsonKey:"Overall Vibration (mm/s)",
        base:null
        },
        {
        key:"2X Harmonic (mm/s)",
        label:"2X Harmonic",
        unit:"mm/s",
        alarm:3,
        trip:5,
        direction:"high",
        jsonKey:"2X Harmonic (mm/s)",
        base:null
        },
        {
        key:"Coupling Offset (mm)",
        label:"Coupling Offset",
        unit:"mm",
        alarm:0.05,
        trip:0.3,
        direction:"high",
        jsonKey:"Coupling Offset (mm)",
        base:null
        },
        {
        key:"Bearing Temp (°C)",
        label:"Bearing Temperature",
        unit:"°C",
        alarm:80,
        trip:95,
        direction:"high",
        jsonKey:"Bearing Temp (°C)",
        base:null
        }
        ]

    }
};

/*
  Other equipment has genuine measurements, but its
  individual alarm/trip limits are not hardcoded here.
  Those limits must be verified before a gauge is shown.
*/

const USERS = [
  {id:"MGR-01",role:"manager",password:"demo123"},
  {id:"ROT-01",role:"staff",password:"demo123"},
  {id:"REL-05",role:"staff",password:"demo123"},
  {id:"REL-02",role:"staff",password:"demo123"}
];

/* ---------------- DATA ---------------- */

async function load(path) {
    const r = await fetch(path);
    if (!r.ok) throw Error("Failed to load " + path);
    return r.json();
}

function health(v,base,alarm,trip){

    const s = trip > alarm ? 1 : -1;
    const d = s*(v-base);
    const a = s*(alarm-base);
    const t = s*(trip-base);
    if(a<=0 || t<=a){
        return null;
    }
    const idx = d <= a
    ?
    (d/a)*50
    :
    50 + ((d-a)/(t-a))*50;
    return 100 - Math.max(
    0,
    Math.min(100,idx)
    );
}

function parameterStatus(v,alarm,trip){
    if(trip > alarm){
        if(v >= trip)
            return "TRIP";
        if(v >= alarm)
            return "ALARM";
    }
    else{
        if(v <= trip)
            return "TRIP";
        if(v <= alarm)
            return "ALARM";
    }
    return "NORMAL";

}

function calculateMachineHealth(tag){


    const config = machines[tag];

    if(!config) return null;


    const history =
    C.equipment[tag]?.history || [];


    const latest =
    history[history.length-1];


    if(!latest) return null;


    let results=[];



    config.params.forEach(p=>{


    let value =
    Number(latest[p.jsonKey]);



    if(!Number.isFinite(value))
    return;



    let base=p.base;



    // baseline median dari kondisi normal
    if(base===null){


    let normal =
    history
    .filter(row=>{


    let s =
    parameterStatus(
    Number(row[p.jsonKey]),
    p.alarm,
    p.trip
    );


    return s==="NORMAL";


    })
    .map(row=>Number(row[p.jsonKey]))
    .filter(Number.isFinite);



    if(normal.length){


    normal.sort((a,b)=>a-b);


    base =
    normal[
    Math.floor(normal.length/2)
    ];


    }

    else{


    // fallback
    base =
    p.direction==="high"
    ?
    p.alarm*0.5
    :
    p.alarm*1.5;


    }


    }




    let h =
    health(
    value,
    base,
    p.alarm,
    p.trip
    );



    results.push({

    label:p.label,

    value:value,

    unit:p.unit,

    alarm:p.alarm,

    trip:p.trip,

    health:h,

    state:
    parameterStatus(
    value,
    p.alarm,
    p.trip
    )

    });


    });



    if(!results.length)
    return null;



    let machineHealth =
    Math.min(
    ...results.map(x=>x.health)
    );



    let governing =
    results.reduce(
    (a,b)=>
    a.health<b.health?a:b
    );



    return {


    health:
    Math.round(machineHealth),


    status:
    machineHealth<=0
    ?
    "TRIP"
    :
    machineHealth<=50
    ?
    "ALARM"
    :
    "NORMAL",


    governing,


    parameters:results


    };


}

function normalizeIncidents(rows) {
  if (!Array.isArray(rows)) return [];
  const header = rows.find(r =>
    Object.values(r).includes("AR No.") &&
    Object.values(r).includes("Tag Number")
  );
  if (!header) return rows;

  const idx = rows.indexOf(header);
  return rows.slice(idx + 1).map(row => {

    const out = {};

    Object.keys(header).forEach(k => {

        const clean =
        String(header[k])
        .replace("Unnamed: ","")
        .trim();

        out[clean] = row[k];

    });


    // normalisasi nama plant
    out.Plant =
        out.Plant ||
        out["Plant / Unit"] ||
        out["PLANT"] ||
        "";

    return out;

    })
    .filter(r => r["AR No."] || r["Tag Number"]);
}

async function boot() {
  try {
    const [e,p,i,r] = await Promise.all([
      load("data/equipment-performance.json"),
      load("data/production-data.json"),
      load("data/incident-summary.json"),
      load("data/rca-details.json")
    ]);
    C.equipment = e;
    C.production = p;
    C.incidents = normalizeIncidents(i);
    C.rca = r;
    C.tasks = JSON.parse(localStorage.getItem(C.key) || "[]");
    if (!Array.isArray(C.tasks)) C.tasks = [];
    installStyles();
    render();
  } catch(err) {
    document.body.textContent = "CAKRA error: " + err.message;
    console.error(err);
  }
}

function save() {
  localStorage.setItem(C.key,JSON.stringify(C.tasks));
}

function getPlant(row){
  return String(
    row["Plant"] ||
    row["Plant / Unit"] ||
    row["PLANT"] ||
    ""
  ).trim().toUpperCase();
}


function incidents(plant=C.plant) {

  return C.incidents.filter(x =>
    getPlant(x) === String(plant)
      .trim()
      .toUpperCase()
  );

}

function selectedIncidents() {
  return incidents().filter(x => x["Tag Number"] === C.tag);
}

function selectedEquipment() {
  return C.equipment[C.tag] || null;
}

function selectedRCA() {
  return C.rca[C.tag] || null;
}

function tagsForPlant() {
  const actual = Object.keys(C.equipment).filter(tag =>
    (C.equipment[tag].info?.["Plant / Unit"] || "")
      .includes("(" + C.plant + ")")
  );
  const historical = incidents()
    .map(x => x["Tag Number"])
    .filter(Boolean);
  return [...new Set([...actual,...historical])].sort(
    (a,b) => (a === "PU-2101B" ? -1 :
              b === "PU-2101B" ? 1 : a.localeCompare(b))
  );
}

function latestHistory(tag=C.tag) {
  const h = C.equipment[tag]?.history || [];
  return h.length ? h[h.length-1] : null;
}

function status(value,limit) {
  if (!Number.isFinite(Number(value))) return "UNKNOWN";
  const x = Number(value);
  if (limit.direction === "high")
    return x >= limit.trip ? "TRIP" :
           x >= limit.alarm ? "ALARM" : "NORMAL";
  return x <= limit.trip ? "TRIP" :
         x <= limit.alarm ? "ALARM" : "NORMAL";
}

function gauge(value,limit) {
  if (!Number.isFinite(Number(value))) return null;
  const x = Number(value);
  const severity = limit.direction === "high"
    ? (x-limit.alarm)/(limit.trip-limit.alarm)
    : (limit.alarm-x)/(limit.alarm-limit.trip);

  /*
    Alarm is displayed at 70%; trip at 100%.
    The percentage is a visualization of proximity
    to trip, NOT an equipment health probability.
    Normal values are deliberately not assigned a
    percentage without a validated normal baseline.
  */
  if (severity < 0) return null;
  return Math.min(100,Math.max(70,70+30*severity));
}

/* ---------------- AUTH ---------------- */

function login() {
  const id = $("#login-id").value.trim().toUpperCase();
  const pw = $("#login-pass").value;
  const u = USERS.find(x => x.id === id && x.password === pw);
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
        <div class="logo">CAKRA<span>.</span></div>
        <p class="eyebrow">INTELLIGENT MANUFACTURING HUB</p>
        <h1>Welcome back</h1>
        <p class="muted">Sign in to your manufacturing workspace.</p>
        <label>Employee ID</label>
        <input id="login-id" placeholder="MGR-01 / ROT-01">
        <label>Password</label>
        <input id="login-pass" type="password" placeholder="Password">
        <p id="login-error" class="danger-text"></p>
        <button class="btn full" onclick="login()">Sign In →</button>
        <div class="hint">
          <strong>Demo accounts</strong><br>
          Manager: MGR-01<br>
          Staff: ROT-01, REL-05, REL-02<br>
          Password: demo123
        </div>
        <small class="muted">
          Prototype-only login. Not secure authentication.
        </small>
      </div>
    </div>`;
}

/* ---------------- NAVIGATION ---------------- */

function go(page) {
  C.page = page;
  render();
  window.scrollTo(0,0);
}

function choosePlant(p) {
  C.plant = p;
  C.tag = tagsForPlant()[0] || "";
  go("dashboard");
}

function chooseTag(tag) {
    console.log("TAG DIPILIH:", tag);
  C.tag = tag;
  C.selectedTrendParam=null;
  render();
}

function renderSelection() {
  const plants = [...new Set(
    C.incidents.map(x => x.Plant).filter(Boolean)
  )].sort();

  return `
    <div class="eyebrow">MANUFACTURING WORKSPACE</div>
    <h1>Select Plant</h1>
    <p class="muted">Choose the plant you want to monitor.</p>
    <div class="plant-grid">
      ${plants.map(p => `
        <button class="plant-card" onclick="choosePlant('${esc(p)}')">
          <div class="plant-icon">▦</div>
          <h2>${esc(p)}</h2>
          <p>${incidents(p).length} historical incidents</p>
          <span>Open workspace →</span>
        </button>`).join("")}
    </div>`;
}

function navButton(page,title) {
  return `<button class="nav ${C.page===page?"active":""}"
    onclick="go('${page}')">${title}</button>`;
}

function shell(content) {
  return `
    <div class="shell">
      <aside class="sidebar">
        <div class="logo">CAKRA<span>.</span></div>
        <p class="side-caption">INTELLIGENT MANUFACTURING</p>
        ${navButton("selection","▦  Plant Selection")}
        ${navButton("dashboard","◫  Performance Dashboard")}
        ${navButton("incidents","⚑  Incident Center")}
        ${navButton("diagnostics","◇  AI Diagnostics")}
        ${navButton("tasks","☷  Action Hub")}
      </aside>
      <div class="main">
        <header class="topbar">
          <div><strong>${esc(C.plant)} Workspace</strong>
            <span class="muted"> / ${esc(C.page)}</span></div>
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

/* ---------------- DASHBOARD ---------------- */

function card(label,value,detail="") {
  return `<div class="card kpi">
    <div class="big-number">${esc(value)}</div>
    <p class="muted">${esc(label)}</p>
    <small class="muted">${esc(detail)}</small>
  </div>`;
}

function renderGauge(machine){
    let value = machine.health;


    let color =
    value<=0
    ?
    "#DC2626"
    :
    value<=50
    ?
    "#D97706"
    :
    "#16A34A";



    return `


    <div class="gauge-box">


    <svg viewBox="0 0 240 150">


    <path
    d="M30 120 A90 90 0 0 1 210 120"
    stroke="#E5E7EB"
    stroke-width="20"
    fill="none"
    />



    <path
    d="M30 120 A90 90 0 0 1 210 120"
    stroke="${color}"
    stroke-width="20"
    fill="none"
    pathLength="100"
    stroke-dasharray="${value} 100"
    />


    <line
    x1="120"
    y1="120"
    x2="
    ${120+70*Math.cos(Math.PI*(1-value/100))}
    "
    y2="
    ${120-70*Math.sin(Math.PI*(1-value/100))}
    "
    stroke="#111827"
    stroke-width="4"
    />


    <circle
    cx="120"
    cy="120"
    r="7"
    fill="#111827"
    />


    <text
    x="120"
    y="95"
    text-anchor="middle"
    font-size="32"
    font-weight="700">

    ${Math.round(value)}%

    </text>



    <text
    x="120"
    y="150"
    text-anchor="middle"
    font-size="14"
    font-weight="500"
    fill="#111827">

    ${machine.status}

    </text>



    </svg>



    </div>


    `;

}

function renderEquipment() {
  const e = selectedEquipment();
  if (!e) return `
    <div class="card">
      <h3>Equipment Monitoring</h3>
      <span class="badge warning">DATA UNAVAILABLE</span>
      <p class="muted">
        This equipment has a historical incident record,
        but no telemetry dataset was provided.
      </p>
      <p>Historical incidents remain accessible below.</p>
    </div>`;
    const machine = calculateMachineHealth(C.tag);
    const latest = latestHistory();
    if(!machine){
        return `
        <div class="card">
            <h3>${C.tag}</h3>
            <p class="muted"> No validated telemetry available.</p>
        </div>`;
    }
    
    const worst = machine.governing;

  return `
    <div class="card">
      <div class="card-heading">
        <div>
          <p class="eyebrow">EQUIPMENT HEALTH</p>
          <h3>${esc(C.tag)} — Threshold Monitoring</h3>
          <p class="muted">Latest historical reading:
            ${esc(latest?.Date||"N/A")}</p>
        </div>
      </div>
      <div class="equipment-grid">
        <div class="gauge-panel">
          ${renderGauge(machine)}
        </div>
        <div class="parameter-grid">
        ${machine.parameters.map(p => `
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


            `).join("")}
        </div>
      </div>
    </div>`;
}

/* ---------------- SVG CHARTS ---------------- */

function lineChart(points,thresholds=[]) {

  if (!points.length) 
    return `<p class="muted">No data available.</p>`;


  const w=720,
        h=260,
        left=55,
        right=25,
        top=25,
        bottom=45;


  const values=points.map(p=>num(p.y));

  const all=[
    ...values,
    ...thresholds.map(t=>t.value)
  ];


  let min=Math.min(...all);
  let max=Math.max(...all);


  if(min===max){
    min-=1;
    max+=1;
  }


  const pad=(max-min)*0.15;

  min-=pad;
  max+=pad;



  const X=i =>
    left+i*(w-left-right)/
    Math.max(1,points.length-1);


  const Y=v =>
    top+(max-v)*(h-top-bottom)/(max-min);



  const path=points.map((p,i)=>
    `${i?"L":"M"}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`
  ).join(" ");



  return `

<svg viewBox="0 0 ${w} ${h}" 
class="chart-svg"
role="img">


<!-- GRID + Y AXIS -->

${[0,.25,.5,.75,1].map(f=>{

const y=top+f*(h-top-bottom);

return `

<line 
x1="${left}" 
y1="${y}"
x2="${w-right}"
y2="${y}"
stroke="rgba(15,23,42,0.25)"
stroke-width="1.5"
/>


<text 
x="10"
y="${y+5}"
font-size="12"
font-weight="600"
fill="#0F172A">

${(max-f*(max-min)).toFixed(1)}

</text>

`;

}).join("")}



<!-- ALARM / TRIP LINE -->

${thresholds.map(t=>`

<line

x1="${left}"

x2="${w-right}"

y1="${Y(t.value)}"

y2="${Y(t.value)}"

stroke="${t.color}"

stroke-width="2.5"

stroke-dasharray="8 6"

/>


<text

x="${w-right-5}"

y="${Y(t.value)-8}"

text-anchor="end"

font-size="12"

font-weight="700"

fill="${t.color}"

>

${esc(t.name)}

</text>


`).join("")}



<!-- MAIN TREND -->

<path

d="${path}"

stroke="#1D4ED8"

stroke-width="4"

fill="none"

/>



${points.map((p,i)=>`

<circle

cx="${X(i)}"

cy="${Y(p.y)}"

r="4"

fill="#1D4ED8">


<title>

${esc(p.label)} : ${esc(p.y)}

</title>


</circle>


`).join("")}




<!-- MONTH LABEL -->

${points.map((p,i)=>{


const date=new Date(p.label);


const prev=i>0 
? new Date(points[i-1].label)
: null;


const changed =
!prev ||
date.getMonth()!==prev.getMonth()
||
i===points.length-1;



if(changed){

return `

<text

x="${X(i)}"

y="${h-10}"

font-size="12"

font-weight="600"

text-anchor="middle"

fill="#0F172A">

${date.toLocaleDateString(
"en-US",
{
month:"short",
year:"numeric"
}
)}

</text>

`;

}


return "";


}).join("")}



</svg>

`;

}
function renderTrend(){

  const e = selectedEquipment();

  if(!e){
    return `
    <div class="card">
      <h3>Historical Trend</h3>
      <p class="muted">
      No equipment selected.
      </p>
    </div>`;
  }


  const params = machines[C.tag]?.params || [];


  const selectedKey =
  C.selectedTrendParam || params[0]?.jsonKey;



  const param =
  params.find(p=>p.jsonKey===selectedKey)
  || params[0];


  const points = e.history
  .filter(x=>Number.isFinite(Number(x[param.jsonKey])))
  .map(x=>({
      label:x.Date,
      y:Number(x[param.jsonKey])
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

      ${params.map(p=>`

      <option
      value="${p.jsonKey}"
      ${p.jsonKey===selectedKey?"selected":""}
      >
      ${esc(p.label)}
      </option>

      `).join("")}


      </select>

      </div>


    </div>



    <div>

    ${lineChart(
      points,
      [
        {
          name:"Alarm",
          value:param.alarm,
          color:"#D97706"
        },
        {
          name:"Trip",
          value:param.trip,
          color:"#DC2626"
        }
      ]
    )}

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

function changeTrendParameter(key){
    C.selectedTrendParam = key;
    render();
}

function updateTrendChart(){

 const checked=[

 ...document.querySelectorAll("[data-trend]:checked")

 ].map(x=>Number(x.dataset.trend));


 const params = machines[C.tag]?.params || [];

 const e=selectedEquipment();


 const datasets=params.map((p,i)=>({

   id:i,

   label:p.label,

   points:e.history
   .filter(x=>Number.isFinite(Number(x[p.jsonKey])))
   .map(x=>({
      label:x.Date,
      y:Number(x[p.jsonKey])
   })),

   alarm:p.alarm,
   trip:p.trip

 })).filter(x=>checked.includes(x.id));


 document.querySelector("#trend-chart").innerHTML =
 lineChartMulti(datasets,checked);

}
function lineChartMulti(datasets){


if(!datasets.length)
return `<p class="muted">Select parameter.</p>`;


const w=720,h=260;


const allValues=datasets.flatMap(d=>
d.points.map(p=>p.y)
);


let min=Math.min(...allValues);
let max=Math.max(...allValues);


if(min===max){
min-=1;
max+=1;
}


const left=50;
const right=20;
const top=20;
const bottom=40;


const X=i=>
left+i*(w-left-right)/
Math.max(1,datasets[0].points.length-1);


const Y=v=>
top+(max-v)*(h-top-bottom)/(max-min);



const colors=[
"#2563EB",
"#16A34A",
"#D97706",
"#DC2626"
];



return `

<svg viewBox="0 0 ${w} ${h}"
class="chart-svg">


${datasets.map((d,idx)=>{


const path=d.points.map((p,i)=>

`${i?"L":"M"}${X(i)},${Y(p.y)}`

).join(" ");


return `


<path 
d="${path}"
stroke="${colors[idx]}"
stroke-width="3"
fill="none"
/>


${d.points.map((p,i)=>`

<circle
cx="${X(i)}"
cy="${Y(p.y)}"
r="3"
fill="${colors[idx]}">

<title>
${d.label}: ${p.y}
</title>

</circle>

`).join("")}


`;

}).join("")}


</svg>

`;

}

function equipmentType() {
  const row=selectedIncidents()[0];
  if(row?.["Eq. Type"]) return row["Eq. Type"];
  return C.tag.split("-")[0];
}

function renderCrossPlant() {
  const type=equipmentType();
  const rows=C.incidents.filter(x=>
    x["Eq. Type"]===type && x.Plant!==C.plant
  );
  const counts={};
  rows.forEach(x=>counts[x.Plant]=(counts[x.Plant]||0)+1);
  const sorted=Object.entries(counts)
    .sort((a,b)=>b[1]-a[1]).slice(0,8);
  const max=Math.max(1,...sorted.map(x=>x[1]));

  return `<div class="card">
    <p class="eyebrow">CROSS-PLANT BENCHMARK</p>
    <h3>Same Equipment Type Incidents</h3>
    <p class="muted">Equipment type: ${esc(type)} · Other plants</p>
    ${sorted.length?sorted.map(([plant,n])=>`
      <div class="bar-row">
        <span>${esc(plant)}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width:${100*n/max}%"></div>
        </div>
        <strong>${n}</strong>
      </div>`).join(""):
      `<p class="muted">No matching incidents in other plants.</p>`}
    <p class="muted">Counts from historical incident records.
      Same equipment type does not necessarily mean same failure mode.</p>
  </div>`;
}

function renderFinancial() {
  const rows=incidents();
  const monthly={};
  rows.forEach(x=>{
    const date=String(x["Date of Occur."]||"");
    const month=date.slice(0,7);
    if(!/^\d{4}-\d{2}$/.test(month)) return;
    monthly[month]??={actual:0,potential:0};
    monthly[month].actual+=num(x["Act. Loss (k US$)"]);
    monthly[month].potential+=num(x["Pot. Loss (k US$)"]);
  });
  const months=Object.keys(monthly).sort();
  const max=Math.max(1,...months.map(m=>
    monthly[m].actual+monthly[m].potential));

  return `<div class="card">
    <p class="eyebrow">FINANCIAL ANALYTICS</p>
    <h3>Monthly Financial Impact</h3>
    <p class="muted">US$ thousands · Historical plant incidents</p>
    <div class="legend">
      <span><i style="background:#3B82F6"></i>Actual Loss</span>
      <span><i style="background:#8B5CF6"></i>Potential Loss</span>
    </div>
    <div class="financial-chart">
      ${months.map(m=>{
        const a=monthly[m].actual,p=monthly[m].potential;
        return `<div class="financial-column">
          <div class="financial-bars" title="${esc(m)}
            Actual: ${a.toFixed(1)}k; Potential: ${p.toFixed(1)}k">
            <div style="height:${a/max*100}%;background:#3B82F6"></div>
            <div style="height:${p/max*100}%;background:#8B5CF6"></div>
          </div>
          <small>${esc(m.slice(5))}</small>
        </div>`;
      }).join("")}
    </div>
    <p class="muted">
      Actual and potential loss are separate historical categories.
      This chart does not represent an AI prediction.
    </p>
  </div>`;
}

function renderDashboard() {
  const rows=incidents();
  const downtime=rows.reduce((s,x)=>s+num(x["Downtime (hrs)"]),0);
  const actual=rows.reduce((s,x)=>s+num(x["Act. Loss (k US$)"]),0);
  const open=rows.filter(x=>!/CLOSED|COMPLETE/i.test(
    String(x["Overall Status"]||"")
  )).length;

  const tagOptions=tagsForPlant();
  if(!tagOptions.includes(C.tag)) C.tag=tagOptions[0]||"";

  return `
    <div class="page-header">
      <div>
        <p class="eyebrow">SENSE / PERFORMANCE OVERVIEW</p>
        <h1>Manufacturing Performance</h1>
        <p class="muted">Operational visibility and incident intelligence</p>
      </div>
      <div class="filter-box">
        <label>Equipment Tag</label>
        <select onchange="chooseTag(this.value)">
          ${tagOptions.map(t=>`
            <option value="${esc(t)}" ${t===C.tag?"selected":""}>
              ${esc(t)} ${C.equipment[t]?"(Available)":""}
            </option>`).join("")}
        </select>
      </div>
    </div>
    <div class="kpi-grid">
      ${card("Historical Incidents",rows.length)}
      ${card("Recorded Downtime",downtime.toFixed(1)+" h")}
      ${card("Actual Financial Loss",usd(actual*1000))}
      ${card("Open Incident Records",open)}
    </div>
    <div class="dashboard-grid">
      ${renderEquipment()}
      ${renderTrend()}
      ${renderCrossPlant()}
      ${renderFinancial()}
    </div>
    <div class="card">
      <div class="card-heading">
        <div><p class="eyebrow">INCIDENT QUEUE</p>
          <h3>${esc(C.tag)} — Historical Incidents</h3></div>
        <button class="btn" onclick="go('diagnostics')">
          Open Diagnostics →
        </button>
      </div>
      ${incidentTable(selectedIncidents())}
    </div>`;
}

/* ---------------- INCIDENTS ---------------- */

function incidentTable(rows) {
  if(!rows.length) return `<p class="muted">No incidents found.</p>`;
  return `<div class="table-wrap"><table>
    <thead><tr><th>AR Number</th><th>Tag</th><th>Title</th>
      <th>Downtime</th><th>Actual Loss</th><th>Status</th></tr></thead>
    <tbody>${rows.map(x=>`
      <tr>
        <td>${esc(x["AR No."])}</td>
        <td>${esc(x["Tag Number"])}</td>
        <td>${esc(x["Risk Case Title"])}</td>
        <td>${esc(x["Downtime (hrs)"])} h</td>
        <td>${usd(num(x["Act. Loss (k US$)"])*1000)}</td>
        <td>${esc(x["Overall Status"])}</td>
      </tr>`).join("")}</tbody></table></div>`;
}

function renderIncidents() {
  return `<p class="eyebrow">SENSE / INCIDENT REGISTER</p>
    <h1>Incident Center</h1>
    <p class="muted">Historical incident records for ${esc(C.plant)}</p>
    <div class="card">${incidentTable(incidents())}</div>`;
}

/* ---------------- DIAGNOSTICS ---------------- */

function renderDiagnostics() {
  const r=selectedRCA();
  const record=selectedIncidents()[0];
  if(!r) return `
    <h1>${esc(C.tag)} — Diagnostics</h1>
    <div class="card">
      <p class="muted">
        Detailed RCA is not provided for this equipment.
        Incident history remains available in Incident Center.
      </p>
    </div>`;

  const actions=r.corrective_actions||[];
  return `
    <p class="eyebrow">DECIDE / DIAGNOSTICS</p>
    <h1>${esc(C.tag)} — AI-Assisted Diagnostics</h1>
    <p class="muted">${esc(r.title)}</p>
    <div class="kpi-grid">
      ${card("Historical Actual Loss",
        usd(num(record?.["Act. Loss (k US$)"])*1000))}
      ${card("Historical Potential Loss",
        usd(num(record?.["Pot. Loss (k US$)"])*1000))}
      ${card("Downtime",r.downtime_hours+" h")}
      ${card("RCA Owner",r.pic)}
    </div>
    <div class="dashboard-grid">
      <div class="card">
        <p class="eyebrow">VERIFIED RCA</p>
        <h3>Root Cause</h3>
        <p>${esc(r.root_cause)}</p>
        <h3>Problem Statement</h3>
        <p class="muted">${esc(r.problem_statement)}</p>
      </div>
      <div class="card">
        <p class="eyebrow">INCIDENT CHRONOLOGY</p>
        <h3>Historical Timeline</h3>
        ${(r.chronology||[]).map(x=>`
          <div class="timeline">${esc(x)}</div>`).join("")}
      </div>
    </div>
    <div class="card">
      <p class="eyebrow">ACT / RCA ACTIONS</p>
      <h3>Corrective & Preventive Actions</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Action</th><th>PIC</th>
          <th>Deadline</th><th>Status</th></tr></thead>
        <tbody>${actions.map(x=>`<tr>
          <td>${esc(x.action)}</td><td>${esc(x.pic)}</td>
          <td>${esc(x.plan_date)}</td>
          <td>${esc(x.status)}</td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>
    ${C.role==="manager"?`
      <div class="card">
        <h3>Assign Action to Staff</h3>
        <label>Corrective Action</label>
        <select id="action-select" onchange="syncPIC()">
          ${actions.map((x,i)=>`
            <option value="${i}">${esc(x.action)}</option>`).join("")}
        </select>
        <label>Responsible PIC</label>
        <select id="pic-select">
          ${USERS.filter(x=>x.role==="staff").map(x=>`
            <option value="${x.id}">${x.id}</option>`).join("")}
        </select>
        <label>Deadline</label>
        <input id="due-select" type="date">
        <button class="btn" onclick="assign()">Assign Task</button>
      </div>`:
      `<div class="card"><p class="muted">
        Assignment is restricted to the Manager role.
      </p></div>`}
    `;
}

function syncPIC() {
  const a=selectedRCA()?.corrective_actions?.[
    Number($("#action-select").value)
  ];
  if(a && USERS.some(u=>u.id===a.pic))
    $("#pic-select").value=a.pic;
  if(a?.plan_date) $("#due-select").value=a.plan_date;
}

function assign() {
  if(C.role!=="manager") return;
  const a=selectedRCA()?.corrective_actions?.[
    Number($("#action-select").value)
  ];
  if(!a) return alert("No action selected.");
  const pic=$("#pic-select").value;
  const due=$("#due-select").value;
  if(!due) return alert("Select a deadline.");

  C.tasks.push({
    id:"TASK-"+Date.now(),
    ar:selectedRCA().ar_number,
    tag:C.tag,
    plant:C.plant,
    action:a.action,
    pic,due,
    status:"ASSIGNED",
    evidence:"",
    history:[{
      by:C.user,status:"ASSIGNED",
      at:new Date().toISOString()
    }]
  });
  save();
  go("tasks");
}

/* ---------------- TASKS ---------------- */

function updateTask(id,next,evidence="") {
  const t=C.tasks.find(x=>x.id===id);
  if(!t) return;
  const manager=C.role==="manager";
  const owner=C.role==="staff" && t.pic===C.user;

  const allowed =
    (owner && t.status==="ASSIGNED" && next==="IN_PROGRESS") ||
    (owner && t.status==="IN_PROGRESS" &&
      next==="PENDING_VERIFICATION" && evidence.trim()) ||
    (manager && t.status==="PENDING_VERIFICATION" &&
      ["VERIFIED","IN_PROGRESS"].includes(next));

  if(!allowed) return alert("Action not permitted.");

  t.status=next;
  if(evidence) t.evidence=evidence;
  t.history.push({
    by:C.user,status:next,at:new Date().toISOString()
  });
  save();
  render();
}

function submitTask(id) {
  const text=document.getElementById("evidence-"+id)?.value.trim();
  if(!text) return alert("Please provide completion evidence.");
  updateTask(id,"PENDING_VERIFICATION",text);
}

function resetTasks() {
  if(C.role!=="manager") return;
  if(!confirm("Reset all demo tasks?")) return;
  C.tasks=[];
  save();
  render();
}

function renderTasks() {
  const rows=C.role==="manager"?C.tasks:
    C.tasks.filter(x=>x.pic===C.user);

  return `
    <div class="page-header">
      <div>
        <p class="eyebrow">ACT / WORK ORDER MANAGEMENT</p>
        <h1>Action Hub</h1>
        <p class="muted">
          ${C.role==="manager"?"All assigned tasks":"My assigned tasks"}
        </p>
      </div>
      ${C.role==="manager"?`
        <button class="btn outline" onclick="resetTasks()">
          Reset Demo
        </button>`:""}
    </div>
    ${rows.length?rows.map(t=>`
      <div class="card task-card">
        <div class="card-heading">
          <div>
            <p class="eyebrow">${esc(t.id)}</p>
            <h3>${esc(t.tag)} — ${esc(t.action)}</h3>
          </div>
          <span class="badge">${esc(t.status)}</span>
        </div>
        <p class="muted">
          ${esc(t.ar)} · PIC ${esc(t.pic)} · Due ${esc(t.due)}
        </p>
        ${t.evidence?`
          <div class="hint"><strong>Submitted Evidence</strong>
            <p>${esc(t.evidence)}</p></div>`:""}
        ${C.user===t.pic && t.status==="ASSIGNED"?`
          <button class="btn"
            onclick="updateTask('${t.id}','IN_PROGRESS')">
            Accept Task
          </button>`:""}
        ${C.user===t.pic && t.status==="IN_PROGRESS"?`
          <label>Completion Evidence</label>
          <textarea id="evidence-${t.id}" rows="3"
            placeholder="Describe completed work and evidence reference"></textarea>
          <button class="btn" onclick="submitTask('${t.id}')">
            Submit for Verification
          </button>`:""}
        ${C.role==="manager" &&
          t.status==="PENDING_VERIFICATION"?`
          <button class="btn"
            onclick="updateTask('${t.id}','VERIFIED')">
            Verify Completion
          </button>
          <button class="btn outline"
            onclick="updateTask('${t.id}','IN_PROGRESS')">
            Return to Staff
          </button>`:""}
        ${t.status==="VERIFIED"?`
          <p class="success-text">
            Task verified. Incident closure remains separate.
          </p>`:""}
      </div>`).join(""):
      `<div class="card"><p class="muted">
        No tasks available for this account.
      </p></div>`}`;
}

/* ---------------- STYLES ---------------- */

/* ---------------- STYLES ---------------- */

function installStyles() {
  const css=`
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

  .muted{color:#334155;font-size:13px;font-weight:500}
  
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
  
  .logo{font:700 27px Poppins,sans-serif;letter-spacing:1px}
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
  .filter-box label{margin:0 0 6px}
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
    margin:0 0 8px;
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
  
  const style=document.createElement("style");
  style.textContent=css;
  document.head.appendChild(style);
}

/* ---------------- RENDER ---------------- */

function render() {
  document.body.innerHTML=C.user
    ?shell(
      C.page==="selection"?renderSelection():
      C.page==="dashboard"?renderDashboard():
      C.page==="incidents"?renderIncidents():
      C.page==="diagnostics"?renderDiagnostics():
      renderTasks()
    )
    :renderLogin();
}

document.addEventListener("DOMContentLoaded",boot);
