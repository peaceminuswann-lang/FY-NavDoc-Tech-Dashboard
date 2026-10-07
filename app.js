let currentFleet = 'b737';
let currentMonth = '01_2026';
let currentMonthlyYear = '2026';
let currentPeriod = 'monthly';
let currentQuarter = 'Q1';
let currentQuarterlyYear = '2026';
let currentYearlyYear = '2026';
let table;
let fuelDataLoadRequestId = 0;
let fuelOverTimeChart, fuelByAircraftChart, fuelByRouteChart, fuelStatsChart;

// Live data auto-refresh configuration
let autoRefreshInterval = null;
let liveDataSubscriptions = [];
const AUTO_REFRESH_INTERVAL = 10000; // 10 seconds
let isLiveDataEnabled = false; // Disabled for admin-uploaded fuel/delay analysis data

// Firebase helper functions
async function getFlightData(key) {
    try {
        const docRef = window.doc(window.db, 'flightData', key);
        const docSnap = await window.getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data().data || [];
        } else {
            return [];
        }
    } catch (error) {
        console.error('Error getting flight data:', error);
        return [];
    }
}

async function setFlightData(key, data) {
    try {
        await window.setDoc(window.doc(window.db, 'flightData', key), { data });
    } catch (error) {
        console.error('Error setting flight data:', error);
    }
}

async function getAvailableMonths() {
    try {
        const docRef = window.doc(window.db, 'metadata', 'availableMonths');
        const docSnap = await window.getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data().months || [];
        } else {
            return [];
        }
    } catch (error) {
        console.error('Error getting available months:', error);
        return [];
    }
}

async function setAvailableMonths(months) {
    try {
        await window.setDoc(window.doc(window.db, 'metadata', 'availableMonths'), { months });
    } catch (error) {
        console.error('Error setting available months:', error);
    }
}

function formatNumber(value) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function calculateSummary(data) {
    const totalFlights = data.length;
    const totalCFPBo = data.reduce((sum, row) => sum + (parseFloat(row['CFP Burn Off']) || 0), 0);
    const totalActBo = data.reduce((sum, row) => sum + (parseFloat(row['Actual Burn Off']) || 0), 0);
    const totalFuelUplift = data.reduce((sum, row) => sum + (parseFloat(row['Fuel Uplift (kg)']) || 0), 0);
    const totalOffChock = data.reduce((sum, row) => sum + (parseFloat(row['Off Chocks']) || 0), 0);
    const delta = totalCFPBo - totalActBo;
    const avgOffChocks = totalFlights ? totalOffChock / totalFlights : 0;
    const avgFuelBurn = totalFlights ? totalActBo / totalFlights : 0;
    const fuelSavedPercent = totalCFPBo ? (delta / totalCFPBo) * 100 : 0;

    const categories = [
        { label: '>100%', min: 100, max: Infinity },
        { label: '>90%-100%', min: 90, max: 100 },
        { label: '>80%-90%', min: 80, max: 90 },
        { label: '>70%-80%', min: 70, max: 80 },
        { label: '>60%-70%', min: 60, max: 70 },
        { label: '>50%-60%', min: 50, max: 60 },
        { label: '<50%', min: -Infinity, max: 50 }
    ];

    const distribution = categories.map(cat => ({ range: cat.label, flights: 0, percent: '0.00%' }));
    data.forEach(row => {
        const cfp = parseFloat(row['CFP Burn Off']) || 0;
        const act = parseFloat(row['Actual Burn Off']) || 0;
        if (cfp <= 0) return;
        const pct = (act / cfp) * 100;
        for (let i = 0; i < categories.length; i++) {
            const cat = categories[i];
            if (pct > cat.min && pct <= cat.max || (cat.max === Infinity && pct > 100) || (cat.min === -Infinity && pct <= 50)) {
                distribution[i].flights += 1;
                break;
            }
        }
    });
    distribution.forEach(row => {
        row.percent = totalFlights ? ((row.flights / totalFlights) * 100).toFixed(2) + '%' : '0.00%';
    });

    const sectorMap = {};
    data.forEach(row => {
        const from = row.From || row.Origin || '';
        const to = row.To || row.Destination || '';
        const sector = from && to ? `${from}-${to}` : null;
        const burn = parseFloat(row['Actual Burn Off']) || 0;
        if (!sector) return;
        if (!sectorMap[sector]) {
            sectorMap[sector] = { burnOff: 0, flights: 0 };
        }
        sectorMap[sector].burnOff += burn;
        sectorMap[sector].flights += 1;
    });
    const sectorFuel = Object.keys(sectorMap).map(sector => ({
        sector,
        burnOff: sectorMap[sector].burnOff,
        flights: sectorMap[sector].flights
    })).sort((a, b) => b.burnOff - a.burnOff);

    return {
        totalFlights,
        totalCFPBo,
        totalActBo,
        totalFuelUplift,
        totalOffChock,
        delta,
        fuelSavedPercent,
        avgOffChocks,
        avgFuelBurn,
        distribution,
        sectorFuel
    };
}

function normalizeRow(row) {
    const normalized = Object.assign({}, row);
    normalized['Delay Code'] = row['Delay Code'] || row['Delay Code (Dep)'] || row['Delay Code (Arr)'] || '';
    normalized['Delay Reason'] = row['Delay Reason'] || row['Delay Reason (Dep)'] || row['Delay Reason (Arr)'] || '';
    normalized['AC Reg No'] = row['AC Reg No'] || row['AC Reg'] || row['Aircraft'] || '';
    normalized['Fuel Uplift (kg)'] = row['Fuel Uplift (kg)'] || row['Fuel Uplift'] || row['Fuel'] || '0';
    normalized['Date'] = row['Date'] || row['Flight Date'] || '';
    normalized['Flight No'] = row['Flight No'] || row['Flight Number'] || row['Flight'] || '';
    normalized['From'] = row['From'] || row['Origin'] || '';
    normalized['To'] = row['To'] || row['To'] || row['Destination'] || '';
    normalized['STD'] = row['STD'] || row['Scheduled Time'] || '';
    normalized['STA'] = row['STA'] || row['Arrival Time'] || '';
    normalized['Block Time'] = row['Block Time'] || row['BlockTime'] || '';
    normalized['Report No'] = row['Report No'] || row['TCV No'] || row['TCV_No'] || '';
    return normalized;
}

// Live Data Auto-Refresh Functions
function showSyncIndicator() {
    let indicator = document.getElementById('liveDataIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'liveDataIndicator';
        indicator.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #00d4ff, #0099ff);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            box-shadow: 0 4px 15px rgba(0, 212, 255, 0.4);
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        document.body.appendChild(indicator);
    }
    indicator.innerHTML = '<span style="display: inline-block; width: 8px; height: 8px; background: white; border-radius: 50%; animation: pulse 1.5s infinite;"></span> Live Data Syncing...';
    if (!document.getElementById('pulseAnimation')) {
        const style = document.createElement('style');
        style.id = 'pulseAnimation';
        style.textContent = '@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }';
        document.head.appendChild(style);
    }
}

function hideSyncIndicator() {
    const indicator = document.getElementById('liveDataIndicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

function updateSyncIndicator(isActive) {
    const indicator = document.getElementById('liveDataIndicator');
    if (indicator) {
        if (isActive) {
            indicator.style.display = 'flex';
            indicator.innerHTML = '<span style="display: inline-block; width: 8px; height: 8px; background: white; border-radius: 50%; animation: pulse 1.5s infinite;"></span> Live Data Syncing...';
        } else {
            indicator.innerHTML = '<span style="display: inline-block; width: 8px; height: 8px; background: #4ade80; border-radius: 50%;"></span> Live Data Updated';
        }
    }
}

function startAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    
    autoRefreshInterval = setInterval(async () => {
        if (!isLiveDataEnabled) return;
        
        showSyncIndicator();
        
        try {
            if (currentPeriod === 'monthly') {
                await loadFleetData(currentFleet, currentMonth, currentPeriod, true);
            } else if (currentPeriod === 'quarterly') {
                await loadQuarterlyData(currentFleet, currentQuarter, currentQuarterlyYear, true);
            } else if (currentPeriod === 'yearly') {
                await loadYearlyData(currentFleet, currentYearlyYear, true);
            }
            updateSyncIndicator(false);
            setTimeout(hideSyncIndicator, 2000);
        } catch (error) {
            console.error('Error during auto-refresh:', error);
        }
    }, AUTO_REFRESH_INTERVAL);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
    hideSyncIndicator();
}

function toggleLiveData() {
    isLiveDataEnabled = !isLiveDataEnabled;
    if (isLiveDataEnabled) {
        startAutoRefresh();
        console.log('Live Data: ENABLED');
    } else {
        stopAutoRefresh();
        console.log('Live Data: DISABLED');
    }
    return isLiveDataEnabled;
}

$(document).ready(async function () {
    await populateMonthSelector();
    await populateMonthlyYearSelector();
    await populateQuarterlyYearSelector();
    await populateYearlyYearSelector();
    // Show monthly table by default
    document.getElementById('monthlyTableContainer').style.display = 'flex';
    await loadFleetData(currentFleet, currentMonth, currentPeriod);
    
    // Live data auto-refresh is disabled for fuel/delay analysis pages.
    
    // Stop auto-refresh when page unloads
    window.addEventListener('beforeunload', function() {
        stopAutoRefresh();
    });
});

function renderSummaryData(data) {
    const summary = calculateSummary(data);
    document.getElementById('cfpBoValue').textContent = formatNumber(summary.totalCFPBo);
    document.getElementById('actBoValue').textContent = formatNumber(summary.totalActBo);
    document.getElementById('fuelUpliftValue').textContent = formatNumber(summary.totalFuelUplift);
    document.getElementById('offChockValue').textContent = formatNumber(summary.totalOffChock);
    document.getElementById('deltaValue').textContent = formatNumber(summary.delta);
    document.getElementById('summaryMonth').textContent = document.getElementById('periodTitle').textContent || '';
    document.getElementById('fuelSavedValue').textContent = summary.fuelSavedPercent.toFixed(2) + '%';
    document.getElementById('avgOffChocksValue').textContent = formatNumber(summary.avgOffChocks);
    document.getElementById('avgFuelBurnValue').textContent = formatNumber(summary.avgFuelBurn);
    
    // Update hero section
    document.getElementById('heroFuelSavedValue').textContent = summary.fuelSavedPercent.toFixed(2) + '%';
    document.getElementById('heroTotalFuelSavings').textContent = formatNumber(summary.delta);
    document.getElementById('heroAvgFuelBurn').textContent = formatNumber(summary.avgFuelBurn);

    const burnTableBody = document.getElementById('burnDistributionTable');
    burnTableBody.innerHTML = '';
    summary.distribution.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.range}</td>
            <td>${row.flights}</td>
            <td>${row.percent}</td>
        `;
        burnTableBody.appendChild(tr);
    });

    const sectorTableBody = document.getElementById('sectorFuelTable');
    sectorTableBody.innerHTML = '';
    summary.sectorFuel.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.sector}</td>
            <td>${formatNumber(item.burnOff)}</td>
            <td>${item.flights}</td>
        `;
        sectorTableBody.appendChild(tr);
    });
}

async function renderMonthlyFuelSavings(fleet, year, requestId) {
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const fleetKeys = getFleetKeys(fleet);
    const monthlyResults = await Promise.all(monthNames.map(async (_, index) => {
        const monthStr = String(index + 1).padStart(2, '0');
        const fleetData = await Promise.all(fleetKeys.map(fleetKey => getFlightData(`${fleetKey}_${monthStr}_${year}`)));
        const allData = fleetData.flat();
        const fuelSavedPercent = allData.length > 0
            ? calculateSummary(allData.map(normalizeRow)).fuelSavedPercent
            : 0;
        return { fuelSavedPercent, isZero: allData.length === 0 };
    }));

    if (requestId !== fuelDataLoadRequestId) return;

    const headerRow = document.getElementById('monthlyHeaderRow');
    const monthHeader = document.createElement('th');
    monthHeader.style.textAlign = 'left';
    monthHeader.textContent = 'MONTH';
    const monthCells = monthNames.map(month => {
        const th = document.createElement('th');
        th.textContent = month;
        return th;
    });
    headerRow.replaceChildren(monthHeader, ...monthCells);

    const dataRow = document.getElementById('monthlyFuelSavingsTable');
    const savingsLabel = document.createElement('td');
    savingsLabel.style.cssText = 'text-align: left; color: #333; font-weight: 600;';
    savingsLabel.textContent = '% FUEL SAVINGS';
    const savingsCells = monthlyResults.map(({ fuelSavedPercent, isZero }) => {
        const td = document.createElement('td');
        td.className = `savings-value ${isZero ? 'zero' : ''}`;
        td.textContent = fuelSavedPercent.toFixed(2) + '%';
        return td;
    });
    dataRow.replaceChildren(savingsLabel, ...savingsCells);
}

async function renderQuarterlyFuelSavings(fleet, year, requestId) {
    const quarterMonths = {
        'Q1': ['01', '02', '03'],
        'Q2': ['04', '05', '06'],
        'Q3': ['07', '08', '09'],
        'Q4': ['10', '11', '12']
    };
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    
    const fleetKeys = getFleetKeys(fleet);
    const quarterlyResults = await Promise.all(quarters.map(async quarter => {
        const quarterData = await Promise.all(quarterMonths[quarter].flatMap(month =>
            fleetKeys.map(fleetKey => getFlightData(`${fleetKey}_${month}_${year}`))
        ));
        const allData = quarterData.flat();
        const fuelSavedPercent = allData.length > 0
            ? calculateSummary(allData.map(normalizeRow)).fuelSavedPercent
            : 0;
        return { fuelSavedPercent, isZero: allData.length === 0 };
    }));

    if (requestId !== fuelDataLoadRequestId) return;

    const headerRow = document.getElementById('quarterlyHeaderRow');
    const quarterHeader = document.createElement('th');
    quarterHeader.style.textAlign = 'left';
    quarterHeader.textContent = 'QUARTER';
    headerRow.replaceChildren(quarterHeader, ...quarters.map(quarter => {
        const th = document.createElement('th');
        th.textContent = quarter;
        return th;
    }));

    const dataRow = document.getElementById('quarterlyFuelSavingsTable');
    const savingsLabel = document.createElement('td');
    savingsLabel.style.cssText = 'text-align: left; color: #333; font-weight: 600;';
    savingsLabel.textContent = '% FUEL SAVINGS';
    dataRow.replaceChildren(savingsLabel, ...quarterlyResults.map(({ fuelSavedPercent, isZero }) => {
        const td = document.createElement('td');
        td.className = `savings-value ${isZero ? 'zero' : ''}`;
        td.textContent = fuelSavedPercent.toFixed(2) + '%';
        return td;
    }));
}

async function populateMonthSelector() {
    const selector = document.getElementById('monthSelector');
    selector.innerHTML = '';
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const currentMonthNumber = currentMonth.split('_')[0];
    for (let i = 1; i <= 12; i++) {
        const monthValue = i < 10 ? '0' + i : String(i);
        const option = document.createElement('option');
        option.value = monthValue;
        option.textContent = monthNames[i - 1];
        if (monthValue === currentMonthNumber) option.selected = true;
        selector.appendChild(option);
    }
}

async function populateMonthlyYearSelector() {
    const selector = document.getElementById('monthlyYearSelector');
    selector.innerHTML = '';
    for (let year = 2000; year <= 2100; year++) {
        const yearStr = String(year);
        const option = document.createElement('option');
        option.value = yearStr;
        option.textContent = yearStr;
        if (yearStr === currentMonthlyYear) option.selected = true;
        selector.appendChild(option);
    }
}

async function populateQuarterlyYearSelector() {
    const selector = document.getElementById('quarterlyYearSelector');
    selector.innerHTML = '';
    for (let year = 2000; year <= 2100; year++) {
        const yearStr = String(year);
        const option = document.createElement('option');
        option.value = yearStr;
        option.textContent = yearStr;
        if (yearStr === currentQuarterlyYear) option.selected = true;
        selector.appendChild(option);
    }
}

async function populateYearlyYearSelector() {
    const selector = document.getElementById('yearlyYearSelector');
    selector.innerHTML = '';
    for (let year = 2000; year <= 2100; year++) {
        const yearStr = String(year);
        const option = document.createElement('option');
        option.value = yearStr;
        option.textContent = yearStr;
        if (yearStr === currentYearlyYear) option.selected = true;
        selector.appendChild(option);
    }
}

function getFleetKeys(fleet) {
    return fleet === 'both' ? ['b737', 'atr'] : [fleet];
}

function setPeriod(period) {
    currentPeriod = period;
    
    // Show/hide tables based on period
    document.getElementById('monthlyTableContainer').style.display = period === 'monthly' ? 'flex' : 'none';
    document.getElementById('quarterlyTableContainer').style.display = period === 'quarterly' ? 'flex' : 'none';
    
    if (period === 'monthly') {
        loadFleetData(currentFleet, currentMonth, period);
    } else if (period === 'quarterly') {
        loadQuarterlyData(currentFleet, currentQuarter, currentQuarterlyYear);
    } else if (period === 'yearly') {
        loadYearlyData(currentFleet, currentYearlyYear);
    }
}

async function loadFleetData(fleet, month, period, isAutoRefresh = false) {
    const requestId = ++fuelDataLoadRequestId;
    const fleetKeys = getFleetKeys(fleet);
    let allData = [];
    for (const f of fleetKeys) {
        const key = f + '_' + month;
        const data = await getFlightData(key);
        allData = allData.concat(data);
    }

    if (requestId !== fuelDataLoadRequestId) return;
    const normalizedData = allData.map(normalizeRow);
    
    // Only reinitialize table if not auto-refresh to avoid disruption
    if (!isAutoRefresh) {
        initTable(normalizedData);
    } else {
        // For auto-refresh, just update the table data smoothly
        if (table) {
            table.clear();
            table.rows.add(normalizedData);
            table.draw(false);
        }
    }
    
    createCharts(normalizedData);
    updateTitle(fleet, month, period);
    renderSummaryData(normalizedData, document.getElementById('periodTitle').textContent);
    const [, year] = month.split('_');
    await renderMonthlyFuelSavings(fleet, year, requestId);
}

async function loadQuarterlyData(fleet, quarter, year, isAutoRefresh = false) {
    const requestId = ++fuelDataLoadRequestId;
    const quarterMonths = {
        'Q1': ['01', '02', '03'],
        'Q2': ['04', '05', '06'],
        'Q3': ['07', '08', '09'],
        'Q4': ['10', '11', '12']
    };
    const months = quarterMonths[quarter];
    const fleetKeys = getFleetKeys(fleet);
    let allData = [];
    for (const month of months) {
        for (const f of fleetKeys) {
            const key = f + '_' + month + '_' + year;
            const data = await getFlightData(key);
            allData = allData.concat(data);
        }
    }
    if (requestId !== fuelDataLoadRequestId) return;
    const normalizedData = allData.map(normalizeRow);
    
    // Only reinitialize table if not auto-refresh to avoid disruption
    if (!isAutoRefresh) {
        initTable(normalizedData);
    } else {
        // For auto-refresh, just update the table data smoothly
        if (table) {
            table.clear();
            table.rows.add(normalizedData);
            table.draw(false);
        }
    }
    
    createCharts(normalizedData);
    updateTitle(fleet, quarter + '_' + year, 'quarterly');
    renderSummaryData(normalizedData, document.getElementById('periodTitle').textContent);
    await renderQuarterlyFuelSavings(fleet, year, requestId);
}

async function loadYearlyData(fleet, year, isAutoRefresh = false) {
    const requestId = ++fuelDataLoadRequestId;
    const fleetKeys = getFleetKeys(fleet);
    let allData = [];
    for (let month = 1; month <= 12; month++) {
        const monthStr = month.toString().padStart(2, '0');
        for (const f of fleetKeys) {
            const key = f + '_' + monthStr + '_' + year;
            const data = await getFlightData(key);
            allData = allData.concat(data);
        }
    }
    if (requestId !== fuelDataLoadRequestId) return;
    const normalizedData = allData.map(normalizeRow);
    
    // Only reinitialize table if not auto-refresh to avoid disruption
    if (!isAutoRefresh) {
        initTable(normalizedData);
    } else {
        // For auto-refresh, just update the table data smoothly
        if (table) {
            table.clear();
            table.rows.add(normalizedData);
            table.draw(false);
        }
    }
    
    createCharts(normalizedData);
    updateTitle(fleet, year, 'yearly');
    renderSummaryData(normalizedData, document.getElementById('periodTitle').textContent);
}

function switchFleet(fleet) {
    currentFleet = fleet;
    
    if (currentPeriod === 'monthly') {
        loadFleetData(fleet, currentMonth, currentPeriod);
    } else if (currentPeriod === 'quarterly') {
        loadQuarterlyData(fleet, currentQuarter, currentQuarterlyYear);
    } else if (currentPeriod === 'yearly') {
        loadYearlyData(fleet, currentYearlyYear);
    }
}

function switchMonth(month) {
    currentMonth = `${month}_${currentMonthlyYear}`;
    loadFleetData(currentFleet, currentMonth, currentPeriod);
    updateTitle(currentFleet, currentMonth, currentPeriod);
}

function switchMonthlyYear(year) {
    currentMonthlyYear = year;
    const monthNumber = currentMonth.split('_')[0];
    currentMonth = `${monthNumber}_${year}`;
    loadFleetData(currentFleet, currentMonth, currentPeriod);
    updateTitle(currentFleet, currentMonth, currentPeriod);
}

function switchQuarter(quarter) {
    currentQuarter = quarter;
    loadQuarterlyData(currentFleet, quarter, currentQuarterlyYear);
}

function switchQuarterlyYear(year) {
    currentQuarterlyYear = year;
    loadQuarterlyData(currentFleet, currentQuarter, year);
}

function switchYearlyYear(year) {
    currentYearlyYear = year;
    loadYearlyData(currentFleet, year);
}

function updateTitle(fleet, period, periodType) {
    document.getElementById('fleetTitle').textContent = fleet === 'b737' ? 'B737' : fleet === 'atr' ? 'ATR72' : 'Both';
    let periodText = '';
    if (periodType === 'monthly') {
        const [m, y] = period.split('_');
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        periodText = monthNames[parseInt(m) - 1] + ' ' + y;
    } else if (periodType === 'quarterly') {
        const [q, y] = period.split('_');
        periodText = q + ' ' + y;
    } else if (periodType === 'yearly') {
        periodText = period;
    }
    document.getElementById('periodTitle').textContent = periodText;
}

function initTable(data) {
    const normalizedData = data.map(normalizeRow);
    const tableElement = $('#flightTable');
    if ($.fn.dataTable.isDataTable(tableElement[0])) {
        tableElement.DataTable().clear().destroy();
    }
    table = $('#flightTable').DataTable({
        data: normalizedData,
        pageLength: 25,
        columns: [
            { data: 'Date', defaultContent: '' },
            { data: 'Report No', defaultContent: '' },
            { data: 'Flight No', defaultContent: '' },
            { data: 'AC Reg No', defaultContent: '' },
            { data: 'From', defaultContent: '' },
            { data: 'To', defaultContent: '' },
            { data: 'STD', defaultContent: '' },
            { data: 'STA', defaultContent: '' },
            { data: 'Block Time', defaultContent: '' },
            { data: 'Actual Burn Off', defaultContent: '0' }
        ]
    });
}

function createCharts(data) {
    // Destroy existing charts
    if (fuelOverTimeChart) fuelOverTimeChart.destroy();
    if (fuelByAircraftChart) fuelByAircraftChart.destroy();
    if (fuelByRouteChart) fuelByRouteChart.destroy();
    if (fuelStatsChart) fuelStatsChart.destroy();

    // Fuel over time
    const fuelByDate = {};
    data.forEach(flight => {
        const date = flight.Date;
        const fuel = parseFloat(flight['Fuel Uplift (kg)']) || 0;
        if (!fuelByDate[date]) fuelByDate[date] = 0;
        fuelByDate[date] += fuel;
    });
    const dates = Object.keys(fuelByDate).sort();
    const fuelValues = dates.map(date => fuelByDate[date]);

    fuelOverTimeChart = new Chart(document.getElementById('fuelOverTimeChart'), {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'Fuel Uplift (kg)',
                data: fuelValues,
                borderColor: '#FF8C00',
                backgroundColor: 'rgba(255, 140, 0, 0.1)',
                fill: true,
                tension: 0.4,
                borderWidth: 3,
                pointRadius: 5,
                pointBackgroundColor: '#FF8C00',
                pointBorderColor: '#FFFFFF',
                pointBorderWidth: 2,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        font: { size: 13, weight: 'bold' },
                        padding: 15,
                        color: '#1f2b44'
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        font: { weight: 'bold' },
                        color: '#666'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    ticks: {
                        font: { weight: 'bold' },
                        color: '#666'
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });

    // Fuel by aircraft (Total Fuel Savings)
    const fuelSavingsByAircraft = {};
    data.forEach(flight => {
        const aircraft = flight['AC Reg No'];
        const cfpBurn = parseFloat(flight['CFP Burn Off']) || 0;
        const actualBurn = parseFloat(flight['Actual Burn Off']) || 0;
        const savings = cfpBurn - actualBurn;
        if (!fuelSavingsByAircraft[aircraft]) fuelSavingsByAircraft[aircraft] = 0;
        fuelSavingsByAircraft[aircraft] += savings;
    });
    const aircrafts = Object.keys(fuelSavingsByAircraft);
    const aircraftSavings = aircrafts.map(ac => fuelSavingsByAircraft[ac]);

    fuelByAircraftChart = new Chart(document.getElementById('fuelByAircraftChart'), {
        type: 'bar',
        data: {
            labels: aircrafts,
            datasets: [{
                label: 'Total Fuel Savings (kg)',
                data: aircraftSavings,
                backgroundColor: [
                    'rgba(255, 140, 0, 0.8)',
                    'rgba(255, 179, 77, 0.8)',
                    'rgba(255, 159, 26, 0.8)',
                    'rgba(255, 165, 0, 0.8)'
                ],
                borderColor: [
                    '#FF8C00',
                    '#FFB34D',
                    '#FF9F1A',
                    '#FFA500'
                ],
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: 'x',
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        font: { size: 13, weight: 'bold' },
                        padding: 15,
                        color: '#1f2b44'
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        font: { weight: 'bold' },
                        color: '#666'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    ticks: {
                        font: { weight: 'bold' },
                        color: '#666'
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });

    // Fuel by route
    const fuelByRoute = {};
    data.forEach(flight => {
        const route = flight.From + ' - ' + flight.To;
        const fuel = parseFloat(flight['Fuel Uplift (kg)']) || 0;
        if (!fuelByRoute[route]) fuelByRoute[route] = 0;
        fuelByRoute[route] += fuel;
    });
    const routes = Object.keys(fuelByRoute).sort();
    const routeFuel = routes.map(route => fuelByRoute[route]);

    fuelByRouteChart = new Chart(document.getElementById('fuelByRouteChart'), {
        type: 'bar',
        data: {
            labels: routes,
            datasets: [{
                label: 'Fuel Uplift (kg)',
                data: routeFuel,
                backgroundColor: 'rgba(255, 140, 0, 0.7)',
                borderColor: '#FF8C00',
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        font: { size: 13, weight: 'bold' },
                        padding: 15,
                        color: '#1f2b44'
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        font: { weight: 'bold' },
                        color: '#666'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                y: {
                    ticks: {
                        font: { weight: 'bold' },
                        color: '#666'
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });

    // Fuel statistics
    const fuels = data.map(flight => parseFloat(flight['Fuel Uplift (kg)']) || 0).filter(f => f > 0);
    const total = fuels.reduce((a, b) => a + b, 0);
    const avg = total / fuels.length;
    const max = Math.max(...fuels);
    const min = Math.min(...fuels);

    fuelStatsChart = new Chart(document.getElementById('fuelStatsChart'), {
        type: 'bar',
        data: {
            labels: ['Total Fuel', 'Average Fuel', 'Max Fuel', 'Min Fuel'],
            datasets: [{
                label: 'Fuel Uplift (kg)',
                data: [total, avg, max, min],
                backgroundColor: [
                    'rgba(255, 140, 0, 0.9)',
                    'rgba(255, 179, 77, 0.85)',
                    'rgba(255, 107, 53, 0.9)',
                    'rgba(255, 165, 0, 0.8)'
                ],
                borderColor: [
                    '#FF8C00',
                    '#FFB34D',
                    '#FF6B35',
                    '#FFA500'
                ],
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        font: { size: 13, weight: 'bold' },
                        padding: 15,
                        color: '#1f2b44'
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        font: { weight: 'bold' },
                        color: '#666'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    ticks: {
                        font: { weight: 'bold' },
                        color: '#666'
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Supabase functions
async function getFlightData(key) {
    try {
        const { data, error } = await window.supabase
            .from('flight_data')
            .select('data')
            .eq('id', key)
            .single();
        
        if (error || !data) {
            return [];
        }
        
        const flightData = data.data || [];
        // Return empty array if no data
        return Array.isArray(flightData) && flightData.length > 0 ? flightData : [];
    } catch (error) {
        console.error('Error getting flight data:', error);
        return [];
    }
}

async function setFlightData(key, data) {
    try {
        const { error } = await window.supabase
            .from('flight_data')
            .upsert([{ id: key, data: data }]);
        if (error) {
            console.error('Error setting flight data:', error);
        }
    } catch (error) {
        console.error('Error setting flight data:', error);
    }
}

async function getAvailableMonths() {
    try {
        const { data, error } = await window.supabase
            .from('available_months')
            .select('months')
            .eq('id', 'availableMonths')
            .single();
        if (error || !data) {
            return ['01_2026']; // default
        }
        return data.months || ['01_2026'];
    } catch (error) {
        console.error('Error getting available months:', error);
        return ['01_2026'];
    }
}

async function setAvailableMonths(months) {
    try {
        const { error } = await window.supabase
            .from('available_months')
            .upsert([{ id: 'availableMonths', months: months }]);
        if (error) {
            console.error('Error setting available months:', error);
        }
    } catch (error) {
        console.error('Error setting available months:', error);
    }
}