const statusConfig = {
  Underloaded: { color: "#3B82F6" }, Normal: { color: "#22C55E" },
  Critical: { color: "#F59E0B" }, Overloaded: { color: "#EF4444" },
};

const dom = {
  appShell: document.querySelector(".app-shell"),
  sidebarToggle: document.getElementById("sidebarToggle"),
  themeToggle: document.getElementById("themeToggle"),
  kpiCards: [...document.querySelectorAll(".kpi-card")],
  
  regionFilter: document.getElementById("regionFilter"),
  circleFilter: document.getElementById("circleFilter"),
  divisionFilter: document.getElementById("divisionFilter"),
  zoneFilter: document.getElementById("zoneFilter"),
  substationFilter: document.getElementById("substationFilter"),
  feederFilter: document.getElementById("feederFilter"),
  dateFilter: document.getElementById("dateFilter"),
  resetFilters: document.getElementById("resetFilters"),
  
  // Map specific filters
  mRegion: document.getElementById("mRegion"),
  mCircle: document.getElementById("mCircle"),
  mDivision: document.getElementById("mDivision"),
  mFeeder: document.getElementById("mFeeder"),
  mLoad: document.getElementById("mLoad"),
  
  // Updated KPIs
  totalDtr: document.getElementById("totalDtr"),
  underloadedCount: document.getElementById("underloadedCount"),
  normalCount: document.getElementById("normalCount"),
  criticalCount: document.getElementById("criticalCount"),
  overloadedCount: document.getElementById("overloadedCount"),
  
  tableBody: document.getElementById("dtrTableBody"),
  hierarchyTableBody: document.getElementById("hierarchyTableBody"),
  tableSummary: document.getElementById("tableSummary"),
  loadingState: document.getElementById("loadingState"),
  emptyState: document.getElementById("emptyState"),
  sidebarHealthStatus: document.getElementById("sidebarHealthStatus"),
  kpiModal: document.getElementById("kpiModal"),
  kpiModalBackdrop: document.getElementById("kpiModalBackdrop"),
  kpiModalClose: document.getElementById("kpiModalClose"),
  kpiModalTitle: document.getElementById("kpiModalTitle"),
  kpiModalSummary: document.getElementById("kpiModalSummary"),
  kpiModalDownload: document.getElementById("kpiModalDownload"),
  kpiModalTableBody: document.getElementById("kpiModalTableBody"),
};

const appState = {
  rawData: [], filteredData: [], mapFilteredData: [],
  filters: { region: "", circle: "", division: "", zone: "", substation: "", feeder: "", date: "" },
  charts: {}, map: null, markersLayer: null, radarLayer: null, mapLayers: {},
  activeKpiKey: null
};

const CASCADE_HIERARCHY = [
  { el: dom.regionFilter, key: 'region' }, { el: dom.circleFilter, key: 'circle' },
  { el: dom.divisionFilter, key: 'division' }, { el: dom.zoneFilter, key: 'zone' },
  { el: dom.substationFilter, key: 'substationName' }, { el: dom.feederFilter, key: 'feederName' }
];

const MAP_CASCADE = [
  { el: dom.mRegion, key: 'region' }, { el: dom.mCircle, key: 'circle' }, 
  { el: dom.mDivision, key: 'division' }, { el: dom.mFeeder, key: 'feederName' }
];

document.addEventListener("DOMContentLoaded", async () => {
  setupUi();
  try {
    const response = await fetch("../source/PKG3_DT_Load.xlsx?t=" + new Date().getTime());
    if (!response.ok) throw new Error("HTTP error " + response.status);
    const arrayBuffer = await response.arrayBuffer();
    
    const workbook = XLSX.read(arrayBuffer, {type: 'array'});
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const source = XLSX.utils.sheet_to_json(sheet, {raw: false, defval: ""}); 
    
    // Filter out invalid utilization immediately
    appState.rawData = source.map(normalizeRecord).filter((r) => r.utilization > 0);

    initializeMap();
    
    // Initialize the dropdowns
    updateDropdownCascades(0, CASCADE_HIERARCHY, appState.rawData);
    updateDropdownCascades(0, MAP_CASCADE, appState.rawData);
    populateDateDropdown();
    
    // Force the first render
    applyFilters();
    applyMapFilters();
  } catch (error) {
    showErrorState(error);
  } finally {
    dom.loadingState.classList.add("hidden");
  }
});

function setupUi() {
  syncSidebarState();
  dom.sidebarToggle.addEventListener("click", () => {
    if (window.innerWidth <= 960) return;
    dom.appShell.classList.toggle("sidebar-collapsed");
  });

  window.addEventListener("resize", syncSidebarState);

  // Theme Toggle
  dom.themeToggle.addEventListener("click", () => {
    const root = document.documentElement;
    const isDark = root.getAttribute("data-theme") === "dark";
    root.setAttribute("data-theme", isDark ? "light" : "dark");
    dom.themeToggle.innerHTML = isDark ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
    
    if(appState.map) {
      if (appState.map.hasLayer(appState.mapLayers.light) || appState.map.hasLayer(appState.mapLayers.dark)) {
          if(isDark) { appState.map.addLayer(appState.mapLayers.dark); appState.map.removeLayer(appState.mapLayers.light); }
          else { appState.map.addLayer(appState.mapLayers.light); appState.map.removeLayer(appState.mapLayers.dark); }
      }
    }
  });

  // Global Filters
  CASCADE_HIERARCHY.forEach((config, index) => {
    config.el.addEventListener("change", () => {
      updateDropdownCascades(index + 1, CASCADE_HIERARCHY, appState.rawData); 
      applyFilters();
    });
  });
  dom.dateFilter.addEventListener("change", applyFilters);
  dom.resetFilters.addEventListener("click", () => {
    CASCADE_HIERARCHY.forEach(c => c.el.value = ""); dom.dateFilter.value = "";
    updateDropdownCascades(1, CASCADE_HIERARCHY, appState.rawData);
    applyFilters();
  });

  // Map Filters
  MAP_CASCADE.forEach((config, index) => {
    config.el.addEventListener("change", () => {
      updateDropdownCascades(index + 1, MAP_CASCADE, appState.rawData);
      applyMapFilters();
    });
  });
  dom.mLoad.addEventListener("change", applyMapFilters);

  dom.kpiCards.forEach((card) => {
    card.addEventListener("click", (event) => {
      const action = event.target.closest("[data-kpi-action]");
      if (!action) return;

      const kpiKey = card.dataset.kpi;
      if (action.dataset.kpiAction === "view") openKpiModal(kpiKey);
      if (action.dataset.kpiAction === "download") downloadKpiRecords(kpiKey);
    });
  });

  dom.kpiModalBackdrop.addEventListener("click", closeKpiModal);
  dom.kpiModalClose.addEventListener("click", closeKpiModal);
  dom.kpiModalDownload.addEventListener("click", () => {
    if (appState.activeKpiKey) downloadKpiRecords(appState.activeKpiKey);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dom.kpiModal.classList.contains("hidden")) closeKpiModal();
  });
}

function syncSidebarState() {
  if (window.innerWidth <= 960) {
    dom.appShell.classList.remove("sidebar-collapsed");
    dom.appShell.classList.remove("mobile-sidebar-open");
    return;
  }

  if (!dom.appShell.classList.contains("sidebar-collapsed")) {
    dom.appShell.classList.remove("mobile-sidebar-open");
  }
}

function normalizeRecord(record) {
  let ufStr = record['Utilization Factor (%)'];
  let uf = Number.parseFloat(String(ufStr ?? "").replace(/,/g, "").trim());
  if (typeof ufStr === 'string' && !ufStr.includes('%') && uf <= 2.0 && uf > 0) uf *= 100;

  return {
    region: record.Region?.trim() || "Unknown", circle: record.Circle?.trim() || "Unknown",
    division: record.Division?.trim() || "Unknown", zone: record.Zone?.trim() || "Unknown",
    substationName: record["Substation Name"]?.trim() || "Unknown", feederName: record["Feeder Name"]?.trim() || "Unknown",
    dtrName: record["Dtr Name"]?.trim() || "Unknown", dtrCode: record["DTR Code"]?.trim() || "Unknown",
    capacity: Number.parseFloat(String(record["DTR Capacity (kVA)"] ?? "").replace(/,/g, "").trim()),
    maxKva: Number.parseFloat(String(record["MAX kVA (kVA)"] ?? "").replace(/,/g, "").trim()),
    utilization: isNaN(uf) ? 0 : uf,
    informationDate: record["Information Date"]?.trim() || "",
    latitude: Number.parseFloat(record.Latitude), longitude: Number.parseFloat(record.Longitude),
    status: deriveStatus(isNaN(uf) ? 0 : uf),
  };
}

function deriveStatus(utilization) {
  if (utilization < 50) return "Underloaded";
  if (utilization < 80) return "Normal";
  if (utilization <= 100) return "Critical";
  return "Overloaded";
}

function updateDropdownCascades(startIndex, hierarchyArray, sourceData) {
  let validData = sourceData;
  for (let i = 0; i < startIndex; i++) {
      let val = hierarchyArray[i].el.value;
      if (val) validData = validData.filter(row => row[hierarchyArray[i].key] === val);
  }
  for (let i = startIndex; i < hierarchyArray.length; i++) {
      let selectEl = hierarchyArray[i].el;
      let currentVal = selectEl.value;
      let uniqueValues = [...new Set(validData.map(item => item[hierarchyArray[i].key]))].filter(Boolean).sort();
      selectEl.innerHTML = `<option value="">All ${hierarchyArray[i].key}s</option>`;
      uniqueValues.forEach(opt => selectEl.add(new Option(opt, opt)));
      if (uniqueValues.includes(currentVal)) selectEl.value = currentVal;
  }
}

function populateDateDropdown() {
  const dates = [...new Set(appState.rawData.map(d => d.informationDate))].filter(Boolean).sort();
  dom.dateFilter.innerHTML = '<option value="">All Dates</option>';
  dates.forEach(d => dom.dateFilter.add(new Option(d, d)));
}

function applyFilters() {
  let filtered = appState.rawData;
  CASCADE_HIERARCHY.forEach(level => {
      let val = level.el.value;
      if (val) filtered = filtered.filter(row => row[level.key] === val);
  });
  if (dom.dateFilter.value) filtered = filtered.filter(row => row.informationDate === dom.dateFilter.value);

  appState.filteredData = filtered;
  const aggregates = buildAggregates(filtered);

  renderKpis(aggregates);
  renderTable(filtered);
  renderHierarchyTable(aggregates.hierarchy);
  renderCharts(aggregates, filtered);
  toggleEmptyState(filtered.length === 0);
}

function buildAggregates(records) {
  const statusCounts = { Underloaded: 0, Normal: 0, Critical: 0, Overloaded: 0 };
  const hierarchyMap = {};

  records.forEach((r) => {
    statusCounts[r.status] += 1;
    const reg = r.region; const cir = r.circle;
    if (!hierarchyMap[reg]) hierarchyMap[reg] = { totals: { Underloaded:0, Normal:0, Critical:0, Overloaded:0, total:0 }, circles: {} };
    if (!hierarchyMap[reg].circles[cir]) hierarchyMap[reg].circles[cir] = { Underloaded:0, Normal:0, Critical:0, Overloaded:0, total:0 };

    hierarchyMap[reg].totals.total++; hierarchyMap[reg].circles[cir].total++;
    hierarchyMap[reg].totals[r.status]++; hierarchyMap[reg].circles[cir][r.status]++;
  });

  return { totalDtr: records.length, statusCounts, hierarchy: hierarchyMap };
}

function renderKpis(aggregates) {
  dom.totalDtr.textContent = formatInteger(aggregates.totalDtr);
  dom.underloadedCount.textContent = formatInteger(aggregates.statusCounts.Underloaded);
  dom.normalCount.textContent = formatInteger(aggregates.statusCounts.Normal);
  dom.criticalCount.textContent = formatInteger(aggregates.statusCounts.Critical);
  dom.overloadedCount.textContent = formatInteger(aggregates.statusCounts.Overloaded);
  
  const topStatus = Object.entries(aggregates.statusCounts).sort((a, b) => b[1] - a[1])[0];
  dom.sidebarHealthStatus.textContent = topStatus && topStatus[1] > 0 ? topStatus[0] : "No Data";
}

function getKpiRecords(kpiKey) {
  if (kpiKey === "total") return [...appState.filteredData];
  return appState.filteredData.filter((record) => record.status === kpiKey);
}

function getKpiLabel(kpiKey) {
  if (kpiKey === "total") return "Total DTR Count";
  return `${kpiKey} Count`;
}

function openKpiModal(kpiKey) {
  const records = getKpiRecords(kpiKey);
  appState.activeKpiKey = kpiKey;
  dom.kpiModalTitle.textContent = getKpiLabel(kpiKey);
  dom.kpiModalSummary.textContent = `${formatInteger(records.length)} records in the current filter context`;
  renderKpiModalTable(records);
  dom.kpiModal.classList.remove("hidden");
  dom.kpiModal.setAttribute("aria-hidden", "false");
}

function closeKpiModal() {
  appState.activeKpiKey = null;
  dom.kpiModal.classList.add("hidden");
  dom.kpiModal.setAttribute("aria-hidden", "true");
}

function renderKpiModalTable(records) {
  dom.kpiModalTableBody.innerHTML = "";
  if (!records.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="12" style="text-align:center; color:var(--text-secondary);">No records available for this KPI.</td>`;
    dom.kpiModalTableBody.appendChild(row);
    return;
  }

  records
    .slice()
    .sort((a, b) => b.utilization - a.utilization)
    .forEach((record) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><strong>${record.dtrCode}</strong></td>
        <td>${record.dtrName}</td>
        <td>${record.region}</td>
        <td>${record.circle}</td>
        <td>${record.division}</td>
        <td>${record.substationName}</td>
        <td>${record.feederName}</td>
        <td>${formatNumber(record.capacity)}</td>
        <td>${formatNumber(record.maxKva)}</td>
        <td style="color:${statusConfig[record.status].color}; font-weight:700;">${formatNumber(record.utilization)}%</td>
        <td><span class="status-badge status-badge--${record.status.toLowerCase()}">${record.status}</span></td>
        <td>${record.informationDate || "-"}</td>
      `;
      dom.kpiModalTableBody.appendChild(row);
    });
}

function downloadKpiRecords(kpiKey) {
  const records = getKpiRecords(kpiKey);
  if (!records.length) return;

  const rows = records.map((record) => ({
    "DTR Code": record.dtrCode,
    "DTR Name": record.dtrName,
    Region: record.region,
    Circle: record.circle,
    Division: record.division,
    Zone: record.zone,
    Substation: record.substationName,
    Feeder: record.feederName,
    "Capacity (kVA)": record.capacity,
    "MAX kVA": record.maxKva,
    "Utilization %": record.utilization,
    Status: record.status,
    Latitude: record.latitude,
    Longitude: record.longitude,
    Date: record.informationDate,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "KPI Data");
  XLSX.writeFile(workbook, `${sanitizeFileName(getKpiLabel(kpiKey))}_${getTodayStamp()}.xlsx`);
}

// --- TABLES ---
function renderHierarchyTable(hierarchy) {
  dom.hierarchyTableBody.innerHTML = "";
  let gt = { u:0, n:0, c:0, o:0, t:0 };
  
  Object.keys(hierarchy).sort().forEach(regName => {
    const rData = hierarchy[regName];
    gt.u+=rData.totals.Underloaded; gt.n+=rData.totals.Normal; gt.c+=rData.totals.Critical; gt.o+=rData.totals.Overloaded; gt.t+=rData.totals.total;

    let rRow = document.createElement("tr"); rRow.className = "region-row";
    rRow.innerHTML = `
      <td><span class="toggle-icon"><i class="fa-solid fa-chevron-right"></i></span> ${regName}</td>
      <td>${rData.totals.Underloaded}</td><td>${rData.totals.Normal}</td>
      <td style="color:var(--critical); font-weight:bold;">${rData.totals.Critical}</td>
      <td style="color:var(--overloaded); font-weight:bold;">${rData.totals.Overloaded}</td>
      <td><strong>${rData.totals.total}</strong></td>
    `;
    dom.hierarchyTableBody.appendChild(rRow);

    let cRows = [];
    Object.keys(rData.circles).sort().forEach(cirName => {
      const cData = rData.circles[cirName];
      let cRow = document.createElement("tr"); cRow.className = "circle-row";
      cRow.innerHTML = `
        <td>${cirName}</td><td>${cData.Underloaded}</td><td>${cData.Normal}</td>
        <td>${cData.Critical}</td><td>${cData.Overloaded}</td><td><strong>${cData.total}</strong></td>
      `;
      dom.hierarchyTableBody.appendChild(cRow);
      cRows.push(cRow);
    });

    rRow.addEventListener("click", () => {
      const exp = rRow.classList.toggle('expanded');
      rRow.querySelector('.toggle-icon i').className = exp ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right';
      cRows.forEach(row => row.style.display = exp ? 'table-row' : 'none');
    });
  });

  if(gt.t > 0) {
    let tRow = document.createElement("tr"); tRow.className = "total-row";
    tRow.innerHTML = `<td>GRAND TOTAL</td><td>${gt.u}</td><td>${gt.n}</td><td style="color:var(--critical)">${gt.c}</td><td style="color:var(--overloaded)">${gt.o}</td><td>${gt.t}</td>`;
    dom.hierarchyTableBody.appendChild(tRow);
  }
}

function renderTable(records) {
  dom.tableBody.innerHTML = "";
  const topRows = [...records].sort((a, b) => b.utilization - a.utilization).slice(0, 50);
  
  topRows.forEach((r) => {
    const row = document.createElement("tr");
    row.className = r.status === "Overloaded" ? "table-row--overloaded" : (r.status === "Critical" ? "table-row--critical" : "");
    row.innerHTML = `
      <td><strong>${r.dtrCode}</strong><br><small style="color:var(--text-secondary)">${r.dtrName}</small></td>
      <td>${r.region}</td>
      <td>${r.substationName}<br><small style="color:var(--text-secondary)">${r.feederName}</small></td>
      <td>${formatNumber(r.capacity)} kVA</td>
      <td>${formatNumber(r.maxKva)} kVA</td>
      <td style="color:${statusConfig[r.status].color}; font-weight:bold;">${formatNumber(r.utilization)}%</td>
      <td><span class="status-badge status-badge--${r.status.toLowerCase()}">${r.status}</span></td>
    `;
    dom.tableBody.appendChild(row);
  });
}

// --- CHARTS ---
function renderCharts(aggregates, records) {
  Chart.defaults.color = "#9AA4B2"; Chart.defaults.borderColor = "rgba(128,128,128,0.1)"; Chart.defaults.font.family = "Inter";

  updateChart("healthChart", "doughnut", {
    labels: Object.keys(aggregates.statusCounts),
    datasets: [{ data: Object.values(aggregates.statusCounts), backgroundColor: Object.keys(aggregates.statusCounts).map((s) => statusConfig[s].color), borderWidth: 0 }],
  }, { responsive: true, maintainAspectRatio: false, cutout: "68%", plugins: { legend: { position: "right" } } });

  let maxVal = records.length ? Math.max(...records.map(r => Math.max(r.capacity, r.maxKva))) * 1.1 : 100;

  const scatterDatasets = ["Underloaded", "Normal", "Critical", "Overloaded"].map((status) => ({
    type: "scatter",
    label: status,
    data: records
      .filter((record) => record.status === status)
      .map((record, index) => ({
        x: addScatterJitter(record.capacity, index, records.length),
        y: addScatterJitter(record.maxKva, index + 3, records.length),
        actualX: record.capacity,
        actualY: record.maxKva,
        dtr: record.dtrCode,
        status: record.status
      })),
    backgroundColor: `${statusConfig[status].color}CC`,
    borderColor: statusConfig[status].color,
    pointRadius: 4.5,
    pointHoverRadius: 7,
    pointBorderWidth: 1,
    pointBorderColor: "#ffffff",
    order: 1
  }));

  updateChart("capacityChart", "scatter", {
    datasets: [
      { type: 'line', label: '100% Load Threshold', data: [{x: 0, y: 0}, {x: maxVal, y: maxVal}], borderColor: statusConfig.Overloaded.color, borderWidth: 2, borderDash: [5, 5], fill: false, pointRadius: 0, order: 2 },
      ...scatterDatasets
    ],
  }, {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 8, right: 10, bottom: 0, left: 0 } },
    plugins: {
      legend: {
        position: "top",
        labels: {
          usePointStyle: true,
          pointStyle: "circle",
          boxWidth: 10,
          padding: 18
        }
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            if (ctx.dataset.type === "line") return "100% load threshold";
            return `DT: ${ctx.raw.dtr} | Cap: ${formatNumber(ctx.raw.actualX)} | Load: ${formatNumber(ctx.raw.actualY)} | ${ctx.raw.status}`;
          }
        }
      }
    },
    scales: {
      x: {
        title: { display: true, text: "Capacity (kVA)" },
        suggestedMax: maxVal
      },
      y: {
        title: { display: true, text: "MAX kVA" },
        suggestedMax: maxVal
      }
    }
  });
}

function updateChart(canvasId, type, data, options) {
  if (appState.charts[canvasId]) { appState.charts[canvasId].data = data; appState.charts[canvasId].options = options; appState.charts[canvasId].update();
  } else { appState.charts[canvasId] = new Chart(document.getElementById(canvasId), { type, data, options }); }
}

function addScatterJitter(value, index, total) {
  if (!Number.isFinite(value)) return value;
  const spread = total > 250 ? 1.8 : 1.2;
  const offset = (((index % 7) - 3) / 3) * spread;
  return Math.max(0, value + offset);
}

// --- MAP ---
function initializeMap() {
  appState.map = L.map("map", { zoomControl: false }).setView([21.25, 81.62], 7);
  L.control.zoom({ position: "bottomright" }).addTo(appState.map);

  appState.mapLayers.light = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OSM" });
  appState.mapLayers.dark = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19, attribution: "© CartoDB" });
  appState.mapLayers.google = L.tileLayer("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", { maxZoom: 20, attribution: "© Google" });

  appState.mapLayers.google.addTo(appState.map);

  L.control.layers({ 
    "Google Satellite": appState.mapLayers.google,
    "Dark Map": appState.mapLayers.dark, 
    "Light Map": appState.mapLayers.light 
  }).addTo(appState.map);

  appState.markersLayer = L.layerGroup().addTo(appState.map);
  appState.radarLayer = L.layerGroup().addTo(appState.map);
  appState.map.on('popupclose', () => appState.radarLayer.clearLayers());
}

function applyMapFilters() {
  let filtered = appState.rawData; // FIX: Ensure it always starts with all raw data
  
  MAP_CASCADE.forEach(level => {
      let val = level.el.value;
      if (val) filtered = filtered.filter(row => row[level.key] === val);
  });
  
  if (dom.mLoad.value) filtered = filtered.filter(row => row.status === dom.mLoad.value);
  appState.mapFilteredData = filtered;
  renderMap(filtered);
}

function renderMap(records) {
  if (!appState.map) return;
  appState.markersLayer.clearLayers(); appState.radarLayer.clearLayers();

  const latLngs = [];

  records.forEach((record) => {
    if (!Number.isFinite(record.latitude) || !Number.isFinite(record.longitude)) return;
    const color = statusConfig[record.status].color;

    const pinIcon = L.divIcon({
      className: '',
      html: `<i class="fa-solid fa-location-dot" style="color:${color}; font-size:26px; filter:drop-shadow(1px 3px 3px rgba(0,0,0,0.6));"></i>`,
      iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -26]
    });

    const marker = L.marker([record.latitude, record.longitude], { icon: pinIcon });

    marker.on("click", () => {
      appState.radarLayer.clearLayers();
      const centerLL = L.latLng(record.latitude, record.longitude);
      L.circle(centerLL, { radius: 3000, color: color, weight: 1, fillColor: color, fillOpacity: 0.05, dashArray: "5, 5" }).addTo(appState.radarLayer);

      let nearbyHTML = `<div style="max-height:150px; overflow-y:auto; border-top:1px solid var(--border); margin-top:8px; padding-top:8px;"><div style="font-size:11px; color:var(--text-secondary); margin-bottom:5px;">Nearby DTs (3km)</div>`;
      let nearbyCount = 0;

      appState.rawData.forEach(target => {
        if (target.dtrCode !== record.dtrCode && Number.isFinite(target.latitude)) {
          const targetLL = L.latLng(target.latitude, target.longitude);
          const dist = centerLL.distanceTo(targetLL);
          if (dist <= 3000) {
            nearbyCount++;
            L.polyline([centerLL, targetLL], { color: color, weight: 1.5, opacity: 0.7, dashArray: "4, 6" }).addTo(appState.radarLayer);
            nearbyHTML += `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px dashed var(--border); padding:4px 0;"><div><strong style="font-size:12px; color:var(--text-primary);">${target.dtrCode}</strong><br><span style="font-size:10px; color:var(--text-secondary);">📍 ${(dist/1000).toFixed(2)} km</span></div><div style="color:${statusConfig[target.status].color}; font-weight:bold; font-size:12px;">${formatNumber(target.utilization)}%</div></div>`;
          }
        }
      });
      
      if(nearbyCount === 0) nearbyHTML += `<div style="font-size:11px; color:var(--text-secondary); text-align:center;">No other DTs within 3km</div>`;
      nearbyHTML += `</div>`;

      marker.bindPopup(`<div style="min-width:220px; font-family:'Inter', sans-serif;"><h3 style="margin:0 0 5px 0; color:var(--text-primary);">${record.dtrCode}</h3><p style="margin:2px 0; font-size:12px; color:var(--text-secondary);">Feeder: ${record.feederName}</p><div style="margin:8px 0; padding:6px; text-align:center; border-radius:4px; background:${color}20; color:${color}; font-weight:bold;">${record.status}: ${formatNumber(record.utilization)}%</div>${nearbyHTML}</div>`).openPopup();
    });

    marker.addTo(appState.markersLayer);
    latLngs.push([record.latitude, record.longitude]);
  });

  if (latLngs.length > 0) appState.map.fitBounds(latLngs, { padding: [30, 30], maxZoom: 16 });
}

function toggleEmptyState(isEmpty) { dom.emptyState.classList.toggle("hidden", !isEmpty); }
function showErrorState(error) { console.error(error); dom.emptyState.classList.remove("hidden"); dom.emptyState.innerHTML = `<h3>Unable to load data</h3><p>${error.message}</p>`; }
function formatNumber(value) { return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 }); }
function formatInteger(value) { return Number(value || 0).toLocaleString("en-IN"); }
function sanitizeFileName(value) { return String(value).replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_"); }
function getTodayStamp() { return new Date().toISOString().slice(0, 10); }
