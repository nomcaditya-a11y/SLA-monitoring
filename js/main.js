// ==========================================
// 1. CONFIGURATION & UI SETUP
// ==========================================
const TARGET_SLA = 98.0; 
const OVERALL_TARGET = 98.5; 
window.globalDashboardData = null;

Chart.defaults.font.family = 'Inter, sans-serif';

// --- ROBUST CSV PARSER ---
function parseCSV(text) {
    if(!text) return [];
    let lines = text.trim().split('\n');
    if(lines.length < 2) return [];
    
    let headers = lines[0].split(',').map(h => h.replace(/\r/g, '').replace(/(^"|"$)/g, '').trim().toLowerCase());
    let result = [];
    
    for(let i = 1; i < lines.length; i++) {
        let rowText = lines[i];
        if(!rowText.trim()) continue;
        
        let values = rowText.split(',').map(v => v.replace(/\r/g, '').replace(/(^"|"$)/g, '').trim());
        let obj = {};
        headers.forEach((h, idx) => { obj[h] = values[idx] || ""; });
        result.push(obj);
    }
    return result;
}

// --- FIX: ULTIMATE VALUE-BASED METRIC EXTRACTOR ---
// --- SURGICAL FIX 1: AGGRESSIVE METRIC EXTRACTOR ---
function getMetric(row, type) {
    if(!row) return NaN;
    
    // 1. EXACT MATCH
    if (type === 'B168' && row['percentage_168_hrs'] !== undefined) return parseFloat(row['percentage_168_hrs']);
    if (type === 'B72' && row['percentage_72_hrs'] !== undefined) return parseFloat(row['percentage_72_hrs']);
    if (type === 'L12' && row['percentage_1200_hrs'] !== undefined) return parseFloat(row['percentage_1200_hrs']);
    if (type === 'L8' && row['percentage_0800_hrs'] !== undefined) return parseFloat(row['percentage_0800_hrs']);
    if (type === 'D24' && row['sla_percentage'] !== undefined) return parseFloat(row['sla_percentage']);
    if (type === 'METERS' && row['total_meters'] !== undefined) return parseFloat(row['total_meters']);

    // 2. AGGRESSIVE FALLBACK (If PKG3 has % symbols or slight name changes)
    const keys = Object.keys(row);
    const findAggressive = (numStr) => {
        let matches = keys.filter(k => k.includes(numStr));
        for(let k of matches) {
            if(k.includes('block') || k.includes('count')) continue;
            let v = parseFloat(row[k]);
            // Checks if value is a valid percentage OR explicitly has %, per, sla in header
            if(!isNaN(v) && (v <= 100.5 || k.includes('per') || k.includes('sla') || k.includes('%'))) return k;
        }
        return undefined;
    };
    
    let key;
    if (type === 'B168') key = findAggressive('168');
    if (type === 'B72')  key = findAggressive('72');
    if (type === 'L12')  key = findAggressive('12');
    if (type === 'L8')   key = findAggressive('8');
    if (type === 'D24')  key = keys.find(k => k.includes('sla') || k.includes('%') || k.includes('daily'));
    if (type === 'METERS') key = keys.find(k => k.includes('meter') || k.includes('total'));

    if (key && row[key] !== undefined && row[key] !== '') {
        let v = parseFloat(row[key]);
        return isNaN(v) ? NaN : v;
    }
    return NaN;
}

// Setup UI Listeners
document.addEventListener('DOMContentLoaded', () => {
    const themeToggleBtn = document.getElementById('theme-toggle');
    const darkIcon = document.getElementById('theme-toggle-dark-icon');
    const lightIcon = document.getElementById('theme-toggle-light-icon');

    if (localStorage.getItem('color-theme') === 'dark' || (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark'); lightIcon.classList.remove('hidden');
    } else {
        document.documentElement.classList.remove('dark'); darkIcon.classList.remove('hidden');
    }

    themeToggleBtn.addEventListener('click', () => {
        darkIcon.classList.toggle('hidden'); lightIcon.classList.toggle('hidden');
        if (document.documentElement.classList.contains('dark')) {
            document.documentElement.classList.remove('dark'); localStorage.setItem('color-theme', 'light');
        } else {
            document.documentElement.classList.add('dark'); localStorage.setItem('color-theme', 'dark');
        }
        if(typeof trendChartFull !== 'undefined') {
            let newColor = document.documentElement.classList.contains('dark') ? '#94a3b8' : '#475569';
            let newGrid = document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
            trendChartFull.options.scales.x.ticks.color = newColor; 
            trendChartFull.options.scales.y.ticks.color = newColor;
            trendChartFull.options.scales.y.grid.color = newGrid; 
            trendChartFull.update();
        }
    });

    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('toggle-sidebar');
    const closeBtn = document.getElementById('close-sidebar');

    // 🟢 MAGIC: Package Level Security Enforcer
    const rights = JSON.parse(sessionStorage.getItem("user_rights"));
    
    if (rights && rights.role !== 'admin') {
        const allowedPkgs = rights.packages || [];
        
        // Agar PKG1 ka right nahi hai, toh button chupao aur PKG3 default kardo
        if (!allowedPkgs.includes('PKG1')) {
            btnPkg1.style.display = 'none';
            setPkgMode('PKG3'); 
        }
        // Agar PKG3 ka right nahi hai, toh button chupao aur PKG1 default kardo
        if (!allowedPkgs.includes('PKG3')) {
            btnPkg3.style.display = 'none';
            setPkgMode('PKG1');
        }
    }

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            if (window.innerWidth < 768) sidebar.classList.toggle('-translate-x-full');
            else sidebar.classList.toggle('hidden');
        });
    }
    if (closeBtn && sidebar) closeBtn.addEventListener('click', () => sidebar.classList.add('-translate-x-full'));

    const btnPkg1 = document.getElementById('btn-pkg1');
    const btnPkg3 = document.getElementById('btn-pkg3');
    const filterPkg = document.getElementById('filter-pkg');

    function setPkgMode(pkg) {
        if(filterPkg) filterPkg.value = pkg;
        const activeClass = "flex-1 py-1.5 text-[12px] font-bold rounded-md bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm transition-all z-10";
        const inactiveClass = "flex-1 py-1.5 text-[12px] font-bold rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all z-10";
        
        if(pkg === 'PKG1') {
            if(btnPkg1) btnPkg1.className = activeClass;
            if(btnPkg3) btnPkg3.className = inactiveClass;
        } else {
            if(btnPkg3) btnPkg3.className = activeClass;
            if(btnPkg1) btnPkg1.className = inactiveClass;
        }
        if (window.globalDashboardData) applyFiltersAndRender();
    }

    if (btnPkg1 && btnPkg3) {
        btnPkg1.addEventListener('click', () => setPkgMode('PKG1'));
        btnPkg3.addEventListener('click', () => setPkgMode('PKG3'));
    }

    function updateLiveTime() {
        const timeElement = document.getElementById('update-time');
        if (timeElement) timeElement.innerText = `LIVE: ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
    }
    updateLiveTime(); setInterval(updateLiveTime, 60000);
});

// ==========================================
// 2. CHART INITIALIZATION
// ==========================================
let trendChartFull = new Chart(document.getElementById('trendChartFull').getContext('2d'), {
    type: 'line',
    data: { 
        labels: ['No Data'], 
        datasets: [
            { label: 'Billing (Aqua)', data: [0], borderColor: '#06b6d4', backgroundColor: 'transparent', borderWidth: 2, tension: 0.4, pointRadius: 3, spanGaps: true },
            { label: 'Load Survey (Orange)', data: [0], borderColor: '#f97316', backgroundColor: 'transparent', borderWidth: 2, tension: 0.4, pointRadius: 3, spanGaps: true },
            { label: 'Daily Energy (Green)', data: [0], borderColor: '#10b981', backgroundColor: 'transparent', borderWidth: 2, tension: 0.4, pointRadius: 3, spanGaps: true },
            { label: 'Target 99%', data: [], borderColor: '#ef4444', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, fill: false }
        ]
    },
    options: { 
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, 
        plugins: { legend: { position: 'top', labels: { boxWidth: 12, usePointStyle: true, padding: 20 } } }, 
        scales: { 
            y: { min: 80, max: 100, ticks: { font: {size: 11} } }, 
            x: { 
                grid: { display: false }, 
                ticks: { 
                    font: {size: 11}, maxRotation: 0, 
                    autoSkip: false,
                    callback: function(val, index) { return this.getLabelForValue(val); }
                } 
            } 
        } 
    }
});

// ==========================================
// 3. DATA ENGINE & LOGIC
// ==========================================
let tableDataObj = [];
let currentPage = 1;
const rowsPerPage = 10;

function setLoader(state, text = "Crunching Data...") {
    const loader = document.getElementById('data-loader');
    if(!loader) return;
    document.getElementById('loader-text').innerText = text;
    state ? loader.classList.remove('hidden') : loader.classList.add('hidden');
}

function parseCustomDate(dateVal) {
    if (!dateVal) return null;
    if (!isNaN(dateVal) && Number(dateVal) > 10000) {
        let ms = Math.round((Number(dateVal) - 25569) * 86400 * 1000);
        let utcDate = new Date(ms);
        return new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate());
    }
    if (typeof dateVal === 'string') {
        if (dateVal.includes('/')) {
            let parts = dateVal.split('/');
            if (parts.length === 3) {
                let month = parseInt(parts[0], 10), day = parseInt(parts[1], 10), year = parseInt(parts[2], 10);  
                if (year < 100) year += 2000;
                return new Date(year, month - 1, day);
            }
        }
        if (dateVal.includes('T')) return new Date(dateVal);
        if (dateVal.includes('-')) {
            let parts = dateVal.split('-');
            if(parts.length === 3) return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        }
    }
    return new Date(dateVal);
}

function getLocalMonthString(d) {
    if (!d || isNaN(d)) return "";
    return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]} ${d.getFullYear()}`;
}

async function syncDashboardData() {
    setLoader(true, "Reading Local CSV Files...");
    try {
        const [resDaily1, resLoad1, resBill1, resDaily3, resLoad3, resBill3] = await Promise.all([
            fetch('./source/DAILY1.CSV').catch(() => null),
            fetch('./source/LOAD1.CSV').catch(() => null),
            fetch('./source/BILL1.CSV').catch(() => null),
            fetch('./source/DAILY3.CSV').catch(() => null),
            fetch('./source/LOAD3.CSV').catch(() => null),
            fetch('./source/BILL3.CSV').catch(() => null)
        ]);

        let txtDaily1 = (resDaily1 && resDaily1.ok) ? await resDaily1.text() : "";
        let txtLoad1 = (resLoad1 && resLoad1.ok) ? await resLoad1.text() : "";
        let txtBill1 = (resBill1 && resBill1.ok) ? await resBill1.text() : "";
        let txtDaily3 = (resDaily3 && resDaily3.ok) ? await resDaily3.text() : "";
        let txtLoad3 = (resLoad3 && resLoad3.ok) ? await resLoad3.text() : "";
        let txtBill3 = (resBill3 && resBill3.ok) ? await resBill3.text() : "";

        window.globalDashboardData = {
            PKG1_DAILY: parseCSV(txtDaily1), PKG1_LOAD: parseCSV(txtLoad1), PKG1_BILL: parseCSV(txtBill1),
            PKG3_DAILY: parseCSV(txtDaily3), PKG3_LOAD: parseCSV(txtLoad3), PKG3_BILL: parseCSV(txtBill3)
        };

        populateDropdowns();
        applyFiltersAndRender();
        
    } catch (error) { 
        console.error("Local Data Sync Error:", error); 
        alert("Error reading CSV files! Ensure you are running a Local Web Server.");
    } 
    finally { setLoader(false); }
}

function populateDropdowns() {
    let db = window.globalDashboardData; if (!db) return;
    let sats = new Set(), uniqueMonths = new Set();

    ["PKG1_DAILY", "PKG3_DAILY", "PKG1_LOAD", "PKG3_LOAD", "PKG1_BILL", "PKG3_BILL"].forEach(sheet => {
        if (db[sheet]) db[sheet].forEach(row => { 
            if (row.sat_name) sats.add(row.sat_name); 
            let rawDate = row.month || row.slot_date;
            if (rawDate) {
                let d = parseCustomDate(rawDate);
                if (d && !isNaN(d)) uniqueMonths.add(getLocalMonthString(d));
            }
        });
    });

    let satSelect = document.getElementById('filter-sat'); 
    if(satSelect) {
        satSelect.innerHTML = '<option value="ALL">All SATs</option>';
        Array.from(sats).sort().forEach(sat => satSelect.innerHTML += `<option value="${sat}">${sat}</option>`);
    }

    let timeSelect = document.getElementById('filter-time'); 
    if(timeSelect) {
        timeSelect.innerHTML = '';
        let sortedMonths = Array.from(uniqueMonths).sort((a, b) => new Date(b) - new Date(a));
        let now = new Date(), currentMonthStr = getLocalMonthString(now), prevMonthStr = getLocalMonthString(new Date(now.getFullYear(), now.getMonth() - 1, 1));

        if(sortedMonths.length === 0) {
            timeSelect.innerHTML += `<option value="ALL">No Data Found</option>`;
        } else {
            sortedMonths.forEach(label => {
                let finalOptionText = label === currentMonthStr ? `Current Month (${label})` : (label === prevMonthStr ? `Previous Month (${label})` : label);
                timeSelect.innerHTML += `<option value="${label}">${finalOptionText}</option>`;
            });
        }
    }
}

function filterSheetData(sheetArray, targetPkg, ignorePkg = false, ignoreDate = false) {
    if (!sheetArray || sheetArray.length === 0) return [];
    let pkgEl = document.getElementById('filter-pkg');
    let selPkg = pkgEl ? pkgEl.value : "ALL";
    let satEl = document.getElementById('filter-sat');
    let selSat = satEl ? satEl.value : "ALL";
    let timeEl = document.getElementById('filter-time');
    let selMonth = timeEl ? timeEl.value : "ALL";

    return sheetArray.filter(row => {
        let pkgMatch = ignorePkg ? true : (selPkg === "ALL" || selPkg === targetPkg);
        let satMatch = (selSat === "ALL" || row.sat_name === selSat);
        let rawDate = row.month || row.slot_date;
        let rowMonth = rawDate ? getLocalMonthString(parseCustomDate(rawDate)) : "";
        let monthMatch = ignoreDate ? true : (selMonth === "ALL" || rowMonth === selMonth);
        return pkgMatch && satMatch && monthMatch;
    });
}

function renderValue(valId, diffId, value, target, isOverall = false) {
    let valEl = document.getElementById(valId);
    let diffEl = document.getElementById(diffId);
    if(!valEl || !diffEl) return;
    let suffix = isOverall ? "FROM PREV MONTH" : "FROM TARGET";

    if (isNaN(value)) {
        valEl.innerText = "N/A";
        diffEl.innerHTML = `-- <span class="uppercase">${suffix}</span>`;
        diffEl.className = "text-[10px] font-bold text-slate-500";
        return;
    }
    valEl.innerText = value.toFixed(1) + "%";
    let diff = value - target;
    if (diff >= 0) {
        diffEl.innerHTML = `▲ ${Math.abs(diff).toFixed(1)}% <span class="uppercase">${suffix}</span>`;
        diffEl.className = "text-[10px] font-bold text-emerald-500";
    } else {
        diffEl.innerHTML = `▼ -${Math.abs(diff).toFixed(1)}% <span class="uppercase">${suffix}</span>`;
        diffEl.className = "text-[10px] font-bold text-rose-500";
    }
}

// TREND CHART (Now uses Load 12H instead of 24H)
// --- SURGICAL FIX: FORCED MONTH SYNC TREND CHART ---
function updateTrendChart(cBill, cLoad, cDaily, selMonthStr) {
    let tMonth = new Date().getMonth();
    let tYear = new Date().getFullYear();

    // 1. Force chart to use the EXACT Selected Month from Dropdown
    if (selMonthStr && selMonthStr !== "ALL") {
        let monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        // Ensure we only extract "Feb 2026" even if value has extra text
        let cleanStr = selMonthStr.includes('(') ? selMonthStr.match(/\((.*?)\)/)[1] : selMonthStr;
        let parts = cleanStr.split(" ");
        if (parts.length === 2) {
            tMonth = monthNames.indexOf(parts[0]);
            tYear = parseInt(parts[1], 10);
        }
    } else {
        // Fallback: If "ALL" selected, fetch latest available month from data
        let allDates = [];
        const extractD = r => {
            let d = parseCustomDate(r.slot_date || r.month || r.date || r.billing_month);
            if (d && !isNaN(d)) allDates.push(d.getTime());
        };
        cDaily.forEach(extractD); cLoad.forEach(extractD); cBill.forEach(extractD);
        if (allDates.length > 0) {
            let latest = new Date(Math.max(...allDates));
            tMonth = latest.getMonth();
            tYear = latest.getFullYear();
        }
    }

    let daysInMonth = new Date(tYear, tMonth + 1, 0).getDate(); 
    let dateGroups = {};
    let monthlyBillVal = NaN;

    // 2. Extract Billing Data
    cBill.forEach(r => {
        let dObj = parseCustomDate(r.slot_date || r.month || r.date || r.billing_month);
        if(dObj && !isNaN(dObj) && dObj.getMonth() === tMonth && dObj.getFullYear() === tYear) {
            let v = getMetric(r, 'B72'); if(!isNaN(v)) monthlyBillVal = v;
        }
    });

    // 3. Process Daily & Load arrays
    const process = (data, type, arrName) => {
        data.forEach(r => {
            let dObj = parseCustomDate(r.slot_date || r.month || r.date || r.billing_month);
            if (dObj && !isNaN(dObj) && dObj.getMonth() === tMonth && dObj.getFullYear() === tYear) {
                let dStr = dObj.getFullYear() + "-" + String(dObj.getMonth() + 1).padStart(2, '0') + "-" + String(dObj.getDate()).padStart(2, '0');
                if(!dateGroups[dStr]) dateGroups[dStr] = { loadVals: [], dailyVals: [] };
                let v = getMetric(r, type);
                if(!isNaN(v)) dateGroups[dStr][arrName].push(v);
            }
        });
    };
    
    process(cLoad, 'L12', 'loadVals'); 
    process(cDaily, 'D24', 'dailyVals');

    // 4. Map data perfectly to X-Axis Days
    let labels = Array.from({length: daysInMonth}, (_, i) => i + 1);
    let billP = new Array(daysInMonth).fill(null);
    let loadP = new Array(daysInMonth).fill(null);
    let dailyP = new Array(daysInMonth).fill(null);
    let targetP = new Array(daysInMonth).fill(99.0);

    Object.keys(dateGroups).forEach(d => {
        let dayIndex = new Date(d + "T00:00:00").getDate() - 1; 
        billP[dayIndex] = !isNaN(monthlyBillVal) ? monthlyBillVal : null;
        let lV = dateGroups[d].loadVals; 
        loadP[dayIndex] = lV.length ? Number((lV.reduce((a,b)=>a+b)/lV.length).toFixed(1)) : null;
        let dV = dateGroups[d].dailyVals; 
        dailyP[dayIndex] = dV.length ? Number((dV.reduce((a,b)=>a+b)/dV.length).toFixed(1)) : null;
    });

    // 5. Render onto the actual Chart
    trendChartFull.data.labels = labels; 
    trendChartFull.data.datasets[0].data = billP;
    trendChartFull.data.datasets[1].data = loadP; 
    trendChartFull.data.datasets[2].data = dailyP; 
    trendChartFull.data.datasets[3].data = targetP; 
    
    trendChartFull.options.scales.x.ticks.callback = function(val, index) {
        let label = Number(this.getLabelForValue(val));
        if ([1, 7, 14, 21, 28, daysInMonth].includes(label)) return label;
        return null;
    };
    trendChartFull.update();
}

function renderTable() {
    const tbody = document.getElementById('sat-table-body');
    const info = document.getElementById('table-info');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    
    tbody.innerHTML = '';
    let start = (currentPage - 1) * rowsPerPage, end = start + rowsPerPage;
    let paginatedItems = tableDataObj.slice(start, end);

    if(tableDataObj.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="px-6 py-8 text-center text-slate-500">No Data Available for selected filters.</td></tr>`;
        if(info) info.innerText = "Showing 0 to 0 of 0 SATs";
        if(btnPrev) btnPrev.disabled = true; if(btnNext) btnNext.disabled = true;
        return;
    }

    const formatSLAWithDiff = (val, target) => {
        if(val === 0) return `<span class="text-slate-500 font-bold">0.0%</span>`; 
        if(isNaN(val)) return `<span class="text-slate-400 font-medium">N/A</span>`; 
        let diff = val - target;
        let diffHtml = diff >= 0 ? `<span class="text-[9px] text-emerald-500 ml-1.5 font-bold">▲ ${Math.abs(diff).toFixed(1)}%</span>` : `<span class="text-[9px] text-rose-500 ml-1.5 font-bold">▼ -${Math.abs(diff).toFixed(1)}%</span>`;
        let mainHtml = val >= target ? `<span class="text-emerald-500 font-bold">${val.toFixed(1)}%</span>` : `<span class="text-rose-500 font-bold">${val.toFixed(1)}%</span>`;
        return `<div class="flex items-center">${mainHtml} ${diffHtml}</div>`;
    };

    paginatedItems.forEach(row => {
        let tr = document.createElement('tr');
        let statusBadge = (row.bill168 >= 99.0 || isNaN(row.bill168)) ? `<span class="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-1 rounded text-[10px] font-bold tracking-wider">Compliant ✅</span>` : `<span class="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-1 rounded text-[10px] font-bold tracking-wider">Warning ⚠️</span>`;

        tr.innerHTML = `
            <td class="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">${row.sat}</td>
            <td class="px-4 py-3">${row.meters.toLocaleString('en-IN')}</td>
            <td class="px-4 py-3">${formatSLAWithDiff(row.daily, 99.0)}</td>
            <td class="px-4 py-3">${formatSLAWithDiff(row.load8, 98.0)}</td>
            <td class="px-4 py-3">${formatSLAWithDiff(row.load12, 99.0)}</td>
            <td class="px-4 py-3">${formatSLAWithDiff(row.bill72, 98.0)}</td>
            <td class="px-4 py-3 bg-slate-50 dark:bg-slate-800/30">${formatSLAWithDiff(row.bill168, 99.0)}</td>
            <td class="px-4 py-3">${statusBadge}</td>
        `;
        tbody.appendChild(tr);
    });

    if(info) info.innerText = `Showing ${start + 1} to ${Math.min(end, tableDataObj.length)} of ${tableDataObj.length} SATs`;
    if(btnPrev) btnPrev.disabled = currentPage === 1;
    if(btnNext) btnNext.disabled = end >= tableDataObj.length;
}

document.getElementById('btn-prev')?.addEventListener('click', () => { if(currentPage > 1) { currentPage--; renderTable(); } });
document.getElementById('btn-next')?.addEventListener('click', () => { if(currentPage * rowsPerPage < tableDataObj.length) { currentPage++; renderTable(); } });

function getLatestDataBySAT(dataArray) {
    let latestMap = {};
    dataArray.forEach(r => {
        let sat = r.sat_name; if (!sat) return;
        let dObj = parseCustomDate(r.slot_date || r.month);
        if (!dObj || isNaN(dObj)) return;
        
        let time = dObj.getTime();
        if (!latestMap[sat] || time > latestMap[sat].time) {
            latestMap[sat] = { time: time, row: r };
        }
    });
    return latestMap;
}

function applyFiltersAndRender() {
    setLoader(true, "Applying Filters...");
    setTimeout(() => {
        let db = window.globalDashboardData; if (!db) { setLoader(false); return; }

        let pkgEl = document.getElementById('filter-pkg');
        let timeEl = document.getElementById('filter-time');
        let selPkg = pkgEl ? pkgEl.value : "ALL";
        let selMonth = timeEl ? timeEl.value : "ALL";
        
        let titleEl = document.getElementById('main-title-pkg'); if(titleEl) titleEl.innerText = selPkg;
        let titleSuffix = selMonth === "ALL" ? "" : `(${selMonth})`;
        let tMonthEl = document.getElementById('trend-month-title'); if(tMonthEl) tMonthEl.innerText = titleSuffix;
        let tableMonthEl = document.getElementById('table-month-title'); if(tableMonthEl) tableMonthEl.innerText = titleSuffix;

        let cBill = [...filterSheetData(db.PKG1_BILL, "PKG1"), ...filterSheetData(db.PKG3_BILL, "PKG3")];
        let cLoad = [...filterSheetData(db.PKG1_LOAD, "PKG1"), ...filterSheetData(db.PKG3_LOAD, "PKG3")];
        let cDaily = [...filterSheetData(db.PKG1_DAILY, "PKG1"), ...filterSheetData(db.PKG3_DAILY, "PKG3")];

        let latestDailyMap = getLatestDataBySAT(cDaily);
        let latestLoadMap = getLatestDataBySAT(cLoad);
        let latestBillMap = getLatestDataBySAT(cBill);

        let allSats = new Set([...Object.keys(latestDailyMap), ...Object.keys(latestLoadMap), ...Object.keys(latestBillMap)]);
        tableDataObj = [];
        
        // Sum variables specifically omitting 24H Load
        let sumD24=0, countD24=0, sumL12=0, countL12=0, sumL8=0, countL8=0, sumB168=0, countB168=0, sumB72=0, countB72=0;
        let totMeters = 0;

        allSats.forEach(sat => {
            let rDaily = latestDailyMap[sat] ? latestDailyMap[sat].row : null;
            let rLoad = latestLoadMap[sat] ? latestLoadMap[sat].row : null;
            let rBill = latestBillMap[sat] ? latestBillMap[sat].row : null;

            let d24 = getMetric(rDaily, 'D24');
            let l12 = getMetric(rLoad, 'L12'); let l8 = getMetric(rLoad, 'L8');
            let b168 = getMetric(rBill, 'B168'); let b72 = getMetric(rBill, 'B72');

            let m = getMetric(rDaily, 'METERS'); if(isNaN(m)) m = getMetric(rLoad, 'METERS'); if(isNaN(m)) m = getMetric(rBill, 'METERS');
            let meters = isNaN(m) ? 0 : m;
            totMeters += meters;

            tableDataObj.push({ sat: sat, meters: meters, daily: d24, load12: l12, load8: l8, bill168: b168, bill72: b72 });

            if(!isNaN(d24)) { sumD24+=d24; countD24++; }
            if(!isNaN(l12)) { sumL12+=l12; countL12++; }
            if(!isNaN(l8)) { sumL8+=l8; countL8++; }
            if(!isNaN(b168)) { sumB168+=b168; countB168++; }
            if(!isNaN(b72)) { sumB72+=b72; countB72++; }
        });

        tableDataObj.sort((a, b) => a.sat.localeCompare(b.sat, undefined, { numeric: true, sensitivity: 'base' }));

        let totMetersEl = document.getElementById('val-total-meters');
        if(totMetersEl) totMetersEl.innerText = totMeters > 0 ? totMeters.toLocaleString('en-IN') : "0";

        let aD24 = countD24 ? sumD24/countD24 : NaN; 
        let aL12 = countL12 ? sumL12/countL12 : NaN; let aL8  = countL8 ? sumL8/countL8 : NaN;
        let aB168 = countB168 ? sumB168/countB168 : NaN; let aB72  = countB72 ? sumB72/countB72 : NaN;
        
        let validComps = 0, sumComps = 0;
        if(!isNaN(aB72)) { sumComps += aB72; validComps++; }
        if(!isNaN(aL12)) { sumComps += aL12; validComps++; } // Overall SLA now uses Load 12H
        if(!isNaN(aD24)) { sumComps += aD24; validComps++; }
        let overallVal = validComps > 0 ? sumComps/validComps : NaN;

        renderValue('val-overall-sla', 'diff-overall-sla', overallVal, OVERALL_TARGET, true); 
        renderValue('val-bill-168', 'diff-bill-168', aB168, TARGET_SLA); renderValue('val-bill-72', 'diff-bill-72', aB72, TARGET_SLA);
        renderValue('val-load-12', 'diff-load-12', aL12, TARGET_SLA); renderValue('val-load-8', 'diff-load-8', aL8, TARGET_SLA);
        renderValue('val-daily-24', 'diff-daily-24', aD24, TARGET_SLA);

        // --- Exclusions & Breaches (Calculated using 12H instead of 24H) ---
        let exclPercDaily = Math.max(0, 100 - (isNaN(aD24) ? 100 : aD24));
        let exclPercLoad = Math.max(0, 100 - (isNaN(aL12) ? 100 : aL12));
        let exclPercBill = Math.max(0, 100 - (isNaN(aB168) ? 100 : aB168));

        let eD = document.getElementById('excl-count-daily'); if(eD) eD.innerText = Math.round((totMeters * exclPercDaily) / 100).toLocaleString('en-IN');
        let eDp = document.getElementById('excl-perc-daily'); if(eDp) eDp.innerText = `(${exclPercDaily.toFixed(1)}%)`;
        let eL = document.getElementById('excl-count-load'); if(eL) eL.innerText = Math.round((totMeters * exclPercLoad) / 100).toLocaleString('en-IN');
        let eLp = document.getElementById('excl-perc-load'); if(eLp) eLp.innerText = `(${exclPercLoad.toFixed(1)}%)`;
        let eB = document.getElementById('excl-count-bill'); if(eB) eB.innerText = Math.round((totMeters * exclPercBill) / 100).toLocaleString('en-IN');
        let eBp = document.getElementById('excl-perc-bill'); if(eBp) eBp.innerText = `(${exclPercBill.toFixed(1)}%)`;

        let bD = document.getElementById('val-breach-daily'); if(bD) bD.innerText = tableDataObj.filter(r => !isNaN(r.daily) && r.daily < 99.0).length;
        let bL = document.getElementById('val-breach-load'); if(bL) bL.innerText = tableDataObj.filter(r => !isNaN(r.load12) && r.load12 < 99.0).length;
        let bB = document.getElementById('val-breach-bill'); if(bB) bB.innerText = tableDataObj.filter(r => !isNaN(r.bill168) && r.bill168 < 99.0).length;

        // 👇 YAHAN FIX HUA HAI: selMonth ab explicitly pass ho raha hai
        updateTrendChart([...filterSheetData(db.PKG1_BILL, "PKG1", false, true), ...filterSheetData(db.PKG3_BILL, "PKG3", false, true)], 
                         [...filterSheetData(db.PKG1_LOAD, "PKG1", false, true), ...filterSheetData(db.PKG3_LOAD, "PKG3", false, true)], 
                         [...filterSheetData(db.PKG1_DAILY, "PKG1", false, true), ...filterSheetData(db.PKG3_DAILY, "PKG3", false, true)],
                         selMonth); // <-- YE CONNECTION MISSING THA
                         
        currentPage = 1;
        renderTable();
        
        setLoader(false);
    }, 500); 
}

window.addEventListener('load', syncDashboardData);
let syncBtn = document.getElementById('refresh-btn');
if(syncBtn) syncBtn.addEventListener('click', syncDashboardData);

// --- FIX: MISSING APPLY FILTER EVENT LISTENER ADDED BACK ---
let applyBtn = document.getElementById('apply-btn');
if(applyBtn) applyBtn.addEventListener('click', applyFiltersAndRender);

