// ==========================================
// 1. CONFIGURATION & UI SETUP
// ==========================================
const TARGET_SLA = 98.0; 
const OVERALL_TARGET = 98.5; 
const CLOUD_API_URL = "https://script.google.com/macros/s/AKfycbzQFjUaCRlhiLQdPutNPlBoHFaw1dSHwQyNu-ncWsZiGUIKj2gBHkQJ043fVrHyrpgrvw/exec";
window.globalDashboardData = null;

Chart.defaults.font.family = 'Inter, sans-serif';

// Setup UI Listeners
document.addEventListener('DOMContentLoaded', () => {
    // --- THEME TOGGLER LOGIC ---
    const themeToggleBtn = document.getElementById('theme-toggle');
    const darkIcon = document.getElementById('theme-toggle-dark-icon');
    const lightIcon = document.getElementById('theme-toggle-light-icon');

    if (localStorage.getItem('color-theme') === 'dark' || (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        lightIcon.classList.remove('hidden');
    } else {
        document.documentElement.classList.remove('dark');
        darkIcon.classList.remove('hidden');
    }

    themeToggleBtn.addEventListener('click', () => {
        darkIcon.classList.toggle('hidden'); 
        lightIcon.classList.toggle('hidden');
        if (document.documentElement.classList.contains('dark')) {
            document.documentElement.classList.remove('dark'); 
            localStorage.setItem('color-theme', 'light');
        } else {
            document.documentElement.classList.add('dark'); 
            localStorage.setItem('color-theme', 'dark');
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

    // --- SIDEBAR TOGGLE LOGIC ---
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('toggle-sidebar');
    const closeBtn = document.getElementById('close-sidebar');

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            if (window.innerWidth < 768) {
                sidebar.classList.toggle('-translate-x-full');
            } else {
                sidebar.classList.toggle('hidden');
            }
        });
    }
    if (closeBtn && sidebar) closeBtn.addEventListener('click', () => sidebar.classList.add('-translate-x-full'));

    // --- PACKAGE TOGGLE LOGIC ---
    const btnPkg1 = document.getElementById('btn-pkg1');
    const btnPkg3 = document.getElementById('btn-pkg3');
    const filterPkg = document.getElementById('filter-pkg');

    function setPkgMode(pkg) {
        filterPkg.value = pkg;
        
        // Active/Inactive Styling
        const activeClass = "flex-1 py-1.5 text-[12px] font-bold rounded-md bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm transition-all z-10";
        const inactiveClass = "flex-1 py-1.5 text-[12px] font-bold rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all z-10";
        
        if(pkg === 'PKG1') {
            btnPkg1.className = activeClass;
            btnPkg3.className = inactiveClass;
        } else {
            btnPkg3.className = activeClass;
            btnPkg1.className = inactiveClass;
        }
        
        // Auto-refresh dashboard instantly on toggle click
        if (window.globalDashboardData) {
            applyFiltersAndRender();
        }
    }

    if (btnPkg1 && btnPkg3) {
        btnPkg1.addEventListener('click', () => setPkgMode('PKG1'));
        btnPkg3.addEventListener('click', () => setPkgMode('PKG3'));
    }
    // --- PROFILE DROPDOWN LOGIC ---
    const profileBtn = document.getElementById('profile-btn');
    const profileMenu = document.getElementById('profile-menu');
    if (profileBtn && profileMenu) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation(); 
            profileMenu.classList.toggle('hidden');
        });
        document.addEventListener('click', (e) => {
            if (!profileBtn.contains(e.target) && !profileMenu.contains(e.target)) {
                profileMenu.classList.add('hidden');
            }
        });
    }

    // --- CLOCK ---
    function updateLiveTime() {
        const timeElement = document.getElementById('update-time');
        if (timeElement) timeElement.innerText = `LIVE: ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
    }
    updateLiveTime(); setInterval(updateLiveTime, 60000);
});

// ==========================================
// 2. CHART INITIALIZATION (FULL WIDTH TREND)
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
            x: { grid: { display: false }, ticks: { font: {size: 11}, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } } 
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
    document.getElementById('loader-text').innerText = text;
    state ? loader.classList.remove('hidden') : loader.classList.add('hidden');
}

function parseCustomDate(dateVal) {
    if (!dateVal) return null;
    if (typeof dateVal === 'string') {
        if (dateVal.includes('T')) return new Date(dateVal); 
        if (dateVal.includes('/')) {
            let p = dateVal.split(/[-/]/); 
            if (p.length === 3) return new Date(p[2].length === 2 ? "20" + p[2] : p[2], p[0] - 1, p[1]);
        }
    }
    return new Date(dateVal);
}

function getLocalMonthString(d) {
    if (!d || isNaN(d)) return "";
    return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]} ${d.getFullYear()}`;
}

async function syncDashboardData() {
    setLoader(true, "Downloading Cloud Data...");
    try {
        const response = await fetch(CLOUD_API_URL);
        window.globalDashboardData = await response.json(); 
        populateDropdowns();
        applyFiltersAndRender();
    } catch (error) { console.error("Data Sync Error:", error); } 
    finally { setLoader(false); }
}

function populateDropdowns() {
    let db = window.globalDashboardData; if (!db) return;
    let sats = new Set(), uniqueMonths = new Set();

    ["PKG1_BILL", "PKG3_BILL", "PKG1_LOAD", "PKG3_LOAD", "PKG1_DAILY", "PKG3_DAILY"].forEach(sheet => {
        if (db[sheet]) db[sheet].forEach(row => { 
            if (row.sat_name) sats.add(row.sat_name); 
            let rawDate = row.month || row.slot_date;
            if (rawDate) {
                let d = parseCustomDate(rawDate);
                if (d && !isNaN(d)) uniqueMonths.add(getLocalMonthString(d));
            }
        });
    });

    let satSelect = document.getElementById('filter-sat'); satSelect.innerHTML = '<option value="ALL">All SATs</option>';
    Array.from(sats).sort().forEach(sat => satSelect.innerHTML += `<option value="${sat}">${sat}</option>`);

    let timeSelect = document.getElementById('filter-time'); timeSelect.innerHTML = '';
    let sortedMonths = Array.from(uniqueMonths).sort((a, b) => new Date(b) - new Date(a));
    let now = new Date(), currentMonthStr = getLocalMonthString(now), prevMonthStr = getLocalMonthString(new Date(now.getFullYear(), now.getMonth() - 1, 1));

    sortedMonths.forEach(label => {
        let finalOptionText = label === currentMonthStr ? `Current Month (${label})` : (label === prevMonthStr ? `Previous Month (${label})` : label);
        timeSelect.innerHTML += `<option value="${label}">${finalOptionText}</option>`;
    });
}

function filterSheetData(sheetArray, targetPkg, ignorePkg = false, ignoreDate = false) {
    if (!sheetArray || sheetArray.length === 0) return [];
    let selPkg = document.getElementById('filter-pkg').value, selSat = document.getElementById('filter-sat').value, selMonth = document.getElementById('filter-time').value;

    return sheetArray.filter(row => {
        let pkgMatch = ignorePkg ? true : (selPkg === "ALL" || selPkg === targetPkg);
        let satMatch = (selSat === "ALL" || row.sat_name === selSat);
        let rawDate = row.month || row.slot_date;
        let rowMonth = rawDate ? getLocalMonthString(parseCustomDate(rawDate)) : "";
        let monthMatch = ignoreDate ? true : (selMonth === "ALL" || rowMonth === selMonth);
        return pkgMatch && satMatch && monthMatch;
    });
}

const getAvg = (arr, col) => { if (!arr || !arr.length) return 0; let sum = 0, count = 0; arr.forEach(r => { let v = parseFloat(r[col]); if(!isNaN(v)){ sum+=v; count++; }}); return count ? (sum/count) : 0; };
const getSum = (arr, col) => arr && arr.length ? arr.reduce((s, r) => s + (parseFloat(r[col]) || 0), 0) : 0;

function renderValue(valId, diffId, value, target, isOverall = false) {
    let numVal = parseFloat(value) || 0;
    document.getElementById(valId).innerText = numVal.toFixed(1) + "%";
    let diff = numVal - target, diffEl = document.getElementById(diffId), suffix = isOverall ? "FROM PREV MONTH" : "FROM TARGET";
    if (diff >= 0) {
        diffEl.innerHTML = `▲ ${Math.abs(diff).toFixed(1)}% <span class="uppercase">${suffix}</span>`;
        diffEl.className = "text-[10px] font-bold text-emerald-500";
    } else {
        diffEl.innerHTML = `▼ -${Math.abs(diff).toFixed(1)}% <span class="uppercase">${suffix}</span>`;
        diffEl.className = "text-[10px] font-bold text-rose-500";
    }
}

function updateTrendChart(billData, loadData, dailyData) {
    let allDates = [];
    dailyData.forEach(r => { if(r.slot_date) allDates.push(parseCustomDate(r.slot_date)); });
    loadData.forEach(r => { if(r.slot_date) allDates.push(parseCustomDate(r.slot_date)); });

    let latestDate = new Date(), validDates = allDates.filter(d => d && !isNaN(d));
    if(validDates.length > 0) latestDate = new Date(Math.max.apply(null, validDates));
    let tMonth = latestDate.getMonth(), tYear = latestDate.getFullYear(), dateGroups = {}, monthlyBillVal = 0;

    billData.forEach(r => {
        let dObj = r.slot_date ? parseCustomDate(r.slot_date) : (r.month ? new Date(r.month) : null);
        if(dObj && !isNaN(dObj) && dObj.getMonth() === tMonth && dObj.getFullYear() === tYear) monthlyBillVal = parseFloat(r.percentage_72_hrs) || monthlyBillVal;
    });

    const process = (data, col, arrName) => {
        data.forEach(r => {
            if (!r.slot_date) return;
            let dObj = parseCustomDate(r.slot_date);
            if (dObj && !isNaN(dObj) && dObj.getMonth() === tMonth && dObj.getFullYear() === tYear) {
                let dStr = dObj.getFullYear() + "-" + String(dObj.getMonth() + 1).padStart(2, '0') + "-" + String(dObj.getDate()).padStart(2, '0');
                if(!dateGroups[dStr]) dateGroups[dStr] = { loadVals: [], dailyVals: [] };
                dateGroups[dStr][arrName].push(parseFloat(r[col])||0);
            }
        });
    };
    process(loadData, 'percentage_2400_hrs', 'loadVals'); process(dailyData, 'sla_percentage', 'dailyVals');

    let sortedDates = Object.keys(dateGroups).sort(), labels = [], billP = [], loadP = [], dailyP = [], targetP = [];
    sortedDates.forEach(d => {
        labels.push(new Date(d + "T00:00:00").getDate()); 
        billP.push(monthlyBillVal > 0 ? monthlyBillVal : null);
        let lV = dateGroups[d].loadVals; loadP.push(lV.length ? Number((lV.reduce((a,b)=>a+b)/lV.length).toFixed(1)) : null);
        let dV = dateGroups[d].dailyVals; dailyP.push(dV.length ? Number((dV.reduce((a,b)=>a+b)/dV.length).toFixed(1)) : null);
        targetP.push(99.0); 
    });

    trendChartFull.data.labels = labels.length ? labels : ['No Data']; 
    trendChartFull.data.datasets[0].data = billP;
    trendChartFull.data.datasets[1].data = loadP; 
    trendChartFull.data.datasets[2].data = dailyP; 
    trendChartFull.data.datasets[3].data = targetP; 
    
    let textColor = document.documentElement.classList.contains('dark') ? '#94a3b8' : '#475569';
    let gridColor = document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    trendChartFull.options.scales.x.ticks.color = textColor; trendChartFull.options.scales.y.ticks.color = textColor;
    trendChartFull.options.scales.y.grid.color = gridColor;
    
    trendChartFull.update();
}

// ------------------------------------------
// NEW: Generate Table Data & Render with Target Diff
// ------------------------------------------
function renderTable() {
    const tbody = document.getElementById('sat-table-body');
    const info = document.getElementById('table-info');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    
    tbody.innerHTML = '';
    
    let start = (currentPage - 1) * rowsPerPage;
    let end = start + rowsPerPage;
    let paginatedItems = tableDataObj.slice(start, end);

    if(tableDataObj.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="px-6 py-8 text-center text-slate-500">No Data Available for selected filters.</td></tr>`;
        info.innerText = "Showing 0 to 0 of 0 SATs";
        btnPrev.disabled = true; btnNext.disabled = true;
        return;
    }

    // Advanced formatter with Target Difference logic
    const formatSLAWithDiff = (val, target) => {
        if(isNaN(val) || val === 0) return `<span class="text-slate-500">N/A</span>`;
        
        let diff = val - target;
        let diffHtml = '';
        
        if (diff >= 0) {
            diffHtml = `<span class="text-[9px] text-emerald-500 ml-1.5 font-bold">▲ ${Math.abs(diff).toFixed(1)}%</span>`;
        } else {
            diffHtml = `<span class="text-[9px] text-rose-500 ml-1.5 font-bold">▼ -${Math.abs(diff).toFixed(1)}%</span>`;
        }

        let mainHtml = val >= target 
            ? `<span class="text-emerald-500 font-bold">${val.toFixed(1)}%</span>` 
            : `<span class="text-rose-500 font-bold">${val.toFixed(1)}%</span>`;

        return `<div class="flex items-center">${mainHtml} ${diffHtml}</div>`;
    };

    paginatedItems.forEach(row => {
        let tr = document.createElement('tr');
        
        // Status Badge Logic (Based on Bill 168H >= 99%)
        let statusBadge = row.bill168 >= 99.0 
            ? `<span class="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-1 rounded text-[10px] font-bold tracking-wider">Compliant ✅</span>`
            : `<span class="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-1 rounded text-[10px] font-bold tracking-wider">Warning ⚠️</span>`;

        tr.innerHTML = `
            <td class="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">${row.sat}</td>
            <td class="px-4 py-3">${row.meters.toLocaleString('en-IN')}</td>
            <td class="px-4 py-3">${formatSLAWithDiff(row.daily, 99.0)}</td>
            <td class="px-4 py-3">${formatSLAWithDiff(row.load8, 98.0)}</td>
            <td class="px-4 py-3">${formatSLAWithDiff(row.load12, 99.0)}</td>
            <td class="px-4 py-3">${formatSLAWithDiff(row.load24, 99.0)}</td>
            <td class="px-4 py-3">${formatSLAWithDiff(row.bill72, 98.0)}</td>
            <td class="px-4 py-3 bg-slate-50 dark:bg-slate-800/30">${formatSLAWithDiff(row.bill168, 99.0)}</td>
            <td class="px-4 py-3">${statusBadge}</td>
        `;
        tbody.appendChild(tr);
    });

    info.innerText = `Showing ${start + 1} to ${Math.min(end, tableDataObj.length)} of ${tableDataObj.length} SATs`;
    btnPrev.disabled = currentPage === 1;
    btnNext.disabled = end >= tableDataObj.length;
}

document.getElementById('btn-prev')?.addEventListener('click', () => { if(currentPage > 1) { currentPage--; renderTable(); } });
document.getElementById('btn-next')?.addEventListener('click', () => { if(currentPage * rowsPerPage < tableDataObj.length) { currentPage++; renderTable(); } });

// ------------------------------------------
// MASTER RENDER FUNCTION
// ------------------------------------------
function applyFiltersAndRender() {
    setLoader(true, "Applying Filters...");
    setTimeout(() => {
        let db = window.globalDashboardData; if (!db) { setLoader(false); return; }

        let selPkg = document.getElementById('filter-pkg').value;
        let selMonth = document.getElementById('filter-time').value;
        document.getElementById('main-title-pkg').innerText = selPkg;
        
        let titleSuffix = selMonth === "ALL" ? "" : `(${selMonth})`;
        document.getElementById('trend-month-title').innerText = titleSuffix;
        document.getElementById('table-month-title').innerText = titleSuffix;

        let f_p1_bill = filterSheetData(db.PKG1_BILL, "PKG1"), f_p3_bill = filterSheetData(db.PKG3_BILL, "PKG3");
        let f_p1_load = filterSheetData(db.PKG1_LOAD, "PKG1"), f_p3_load = filterSheetData(db.PKG3_LOAD, "PKG3");
        let f_p1_daily = filterSheetData(db.PKG1_DAILY, "PKG1"), f_p3_daily = filterSheetData(db.PKG3_DAILY, "PKG3");

       let cBill = [...f_p1_bill, ...f_p3_bill], cLoad = [...f_p1_load, ...f_p3_load], cDaily = [...f_p1_daily, ...f_p3_daily];

        // --- 1. Top KPIs (FIXED: Unique Meters Calculation) ---
        let uniqueMetersMap = {};
        
        // Step A: Har unique SAT ke highest/latest meters map mein store karo
        cDaily.forEach(r => { 
            if(r.sat_name && r.total_meters) {
                uniqueMetersMap[r.sat_name] = Math.max(uniqueMetersMap[r.sat_name] || 0, parseFloat(r.total_meters));
            }
        });
        
        // Step B: Agar Daily sheet khali hai, toh Load sheet se meters uthao
        if(Object.keys(uniqueMetersMap).length === 0) {
            cLoad.forEach(r => { 
                if(r.sat_name && r.total_meters) {
                    uniqueMetersMap[r.sat_name] = Math.max(uniqueMetersMap[r.sat_name] || 0, parseFloat(r.total_meters));
                }
            });
        }
        
        // Step C: Ab in unique meters ka sum karo
        let totMeters = Object.values(uniqueMetersMap).reduce((sum, val) => sum + val, 0);
        
        document.getElementById('val-total-meters').innerText = totMeters > 0 ? totMeters.toLocaleString('en-IN') : "0";
        let aB72 = getAvg(cBill, 'percentage_72_hrs'), aB168 = getAvg(cBill, 'percentage_168_hrs');
        let aL8 = getAvg(cLoad, 'percentage_0800_hrs'), aL12 = getAvg(cLoad, 'percentage_1200_hrs'), aL24 = getAvg(cLoad, 'percentage_2400_hrs');
        let aD24 = getAvg(cDaily, 'sla_percentage'), overall = (aB72 + aL24 + aD24) / 3;

        renderValue('val-overall-sla', 'diff-overall-sla', overall, OVERALL_TARGET, true); 
        renderValue('val-bill-168', 'diff-bill-168', aB168, TARGET_SLA);
        renderValue('val-bill-72', 'diff-bill-72', aB72, TARGET_SLA);
        renderValue('val-load-24', 'diff-load-24', aL24, TARGET_SLA);
        renderValue('val-load-8', 'diff-load-8', aL8, TARGET_SLA);
        renderValue('val-load-12', 'diff-load-12', aL12, TARGET_SLA);
        renderValue('val-daily-24', 'diff-daily-24', aD24, TARGET_SLA);

        let exclPercDaily = Math.max(0, 100 - (isNaN(aD24) ? 100 : aD24));
        let exclCountDaily = Math.round((totMeters * exclPercDaily) / 100);
        
        let exclPercLoad = Math.max(0, 100 - (isNaN(aL24) ? 100 : aL24));
        let exclCountLoad = Math.round((totMeters * exclPercLoad) / 100);
        
        let exclPercBill = Math.max(0, 100 - (isNaN(aB168) ? 100 : aB168));
        let exclCountBill = Math.round((totMeters * exclPercBill) / 100);

        document.getElementById('excl-count-daily').innerText = exclCountDaily.toLocaleString('en-IN');
        document.getElementById('excl-perc-daily').innerText = `(${exclPercDaily.toFixed(1)}%)`;

        document.getElementById('excl-count-load').innerText = exclCountLoad.toLocaleString('en-IN');
        document.getElementById('excl-perc-load').innerText = `(${exclPercLoad.toFixed(1)}%)`;

        document.getElementById('excl-count-bill').innerText = exclCountBill.toLocaleString('en-IN');
        document.getElementById('excl-perc-bill').innerText = `(${exclPercBill.toFixed(1)}%)`;

        document.getElementById('val-breach-daily').innerText = cDaily.filter(r => parseFloat(r.sla_percentage) < 99.0).length;
        document.getElementById('val-breach-load').innerText = cLoad.filter(r => parseFloat(r.percentage_2400_hrs) < 99.0).length;
        document.getElementById('val-breach-bill').innerText = cBill.filter(r => parseFloat(r.percentage_168_hrs) < 99.0).length;

        updateTrendChart(
            [...filterSheetData(db.PKG1_BILL, "PKG1", false, true), ...filterSheetData(db.PKG3_BILL, "PKG3", false, true)], 
            [...filterSheetData(db.PKG1_LOAD, "PKG1", false, true), ...filterSheetData(db.PKG3_LOAD, "PKG3", false, true)], 
            [...filterSheetData(db.PKG1_DAILY, "PKG1", false, true), ...filterSheetData(db.PKG3_DAILY, "PKG3", false, true)]
        );

        let satMap = {};
        
        cBill.forEach(r => {
            let s = r.sat_name; if(!s) return;
            if(!satMap[s]) satMap[s] = { sat: s, meters: 0, b168: [], b72: [], l24: [], l12: [], l8: [], daily: [] };
            satMap[s].b168.push(parseFloat(r.percentage_168_hrs) || 0);
            satMap[s].b72.push(parseFloat(r.percentage_72_hrs) || 0);
        });
        
        cLoad.forEach(r => {
            let s = r.sat_name; if(!s) return;
            if(!satMap[s]) satMap[s] = { sat: s, meters: 0, b168: [], b72: [], l24: [], l12: [], l8: [], daily: [] };
            satMap[s].l24.push(parseFloat(r.percentage_2400_hrs) || 0);
            satMap[s].l12.push(parseFloat(r.percentage_1200_hrs) || 0);
            satMap[s].l8.push(parseFloat(r.percentage_0800_hrs) || 0);
        });

        cDaily.forEach(r => {
            let s = r.sat_name; if(!s) return;
            if(!satMap[s]) satMap[s] = { sat: s, meters: 0, b168: [], b72: [], l24: [], l12: [], l8: [], daily: [] };
            satMap[s].meters = Math.max(satMap[s].meters, parseFloat(r.total_meters) || 0);
            satMap[s].daily.push(parseFloat(r.sla_percentage) || 0);
        });

        tableDataObj = [];
        const avg = arr => arr.length ? arr.reduce((x,y)=>x+y)/arr.length : 0;

        Object.keys(satMap).forEach(key => {
            let row = satMap[key];
            
            let b168Avg = avg(row.b168);
            let b72Avg = avg(row.b72);
            let l24Avg = avg(row.l24);
            let l12Avg = avg(row.l12);
            let l8Avg = avg(row.l8);
            let dAvg = avg(row.daily);
            
            tableDataObj.push({
                sat: row.sat,
                meters: row.meters,
                bill168: b168Avg,
                bill72: b72Avg,
                load24: l24Avg,
                load12: l12Avg,
                load8: l8Avg,
                daily: dAvg
            });
        });

        // Default Sort: SAT Name (Alphanumeric Ascending)
        tableDataObj.sort((a, b) => {
            return a.sat.localeCompare(b.sat, undefined, { numeric: true, sensitivity: 'base' });
        });
        
        currentPage = 1;
        renderTable();
        
        setLoader(false);
    }, 500); 
}

window.addEventListener('load', syncDashboardData);
document.getElementById('refresh-btn').addEventListener('click', syncDashboardData);
// Notice: apply-btn is no longer in HTML, toggle handles the update directly now