function getDayOfYear(day, month) {
    // Days in each month
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    // Validate inputs
    if (day < 1 || day > 31) return 1;
    if (month < 1 || month > 12) return 1;

    // Validate that day doesn't exceed days in month
    if (day > daysInMonth[month - 1]) {
        day = daysInMonth[month - 1];
    }

    // Calculate day of year
    let dayOfYear = 0;
    for (let i = 0; i < month - 1; i++) {
        dayOfYear += daysInMonth[i];
    }
    dayOfYear += day;

    return dayOfYear;
}

// API call to backend (relative, expects server running on same origin)
// but we fully implement fetch to /api/calculations
async function callApi(calculationType, payloadBody) {
    // Build request exactly as server expects:
    // { calculationType, latitude, panelTilt, panelAzimuth, dayOfYear, hour, type, weather, panelArea? }
    const response = await fetch('/api/calculations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadBody)
    });
    // Error handling if response didn't load properly
    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.calculation;
}

async function fetchMoment(params) {
    const body = {
        calculationType: "moment",
        trueCalcType: params.trueCalcType,
        type: params.type,
        latitude: params.latitude,
        longitude: 10.0,
        panelTilt: params.panelTilt,
        panelAzimuth: params.panelAzimuth,
        dayOfYear: params.dayOfYear,
        hour: params.hour,
        specificHour: params.specificHour,
        weather: params.weather,
        panelArea: params.panelArea
    };
    // only add panelArea if defined
    if (params.panelArea !== undefined && params.panelArea !== null) body.panelArea = params.panelArea;
    const calc = await callApi("moment", body);
    return calc.result;
}

async function fetchDailyEnergy(params) {
    const body = {
        calculationType: "daily",
        trueCalcType: params.trueCalcType,
        type: params.type,
        latitude: params.latitude,
        longitude: 10.0,
        panelTilt: params.panelTilt,
        panelAzimuth: params.panelAzimuth,
        dayOfYear: params.dayOfYear,
        specificHour: params.specificHour,
        weather: params.weather,
        panelArea: params.panelArea
    };
    if (params.panelArea !== undefined && params.panelArea !== null) body.panelArea = params.panelArea;
    const calc = await callApi("daily", body);
    return calc.result;  // includes energyWh, energyKWh, panelEfficiencyUsed etc.
}

// For hourly graph (when user selects "hourly" and calcType = daily or moment)
async function computeHourlySeries(baseParams, startHour, numHours, refDayOfYear) {
    let results = [];
    for (let i = 0; i < numHours; i++) {
        const hourIndex = (startHour + i) % 24;
        if (hourIndex > 23) continue;
        const momentParams = {
            ...baseParams,
            dayOfYear: refDayOfYear,
            hour: hourIndex
        };
        try {
            const momentResult = await fetchMoment(momentParams);
            results.push({
                label: `${hourIndex}:00`,
                power: momentResult.power || 0,
                energyWh: momentResult.energy || 0
            });
        } catch (err) {
            console.warn(`hour ${hourIndex} error`, err);
            results.push({ label: `${hourIndex}:00`, power: 0, energyWh: 0 });
        }
    }
    return results;
}

// For daily graph (granularity = daily), returns energy per day for N days
async function computeDailySeries(baseParams, startDayOfYear, numDays) {
    let results = [];
    for (let d = 0; d < numDays; d++) {
        let currentDay = startDayOfYear + d;
        // wrap around year max 366? for simplicity beyond 366, we cap; but simulation fine
        if (currentDay > 366) currentDay = 366;
        if (currentDay < 1) currentDay = 1;
        const dailyParams = { ...baseParams, dayOfYear: currentDay };
        try {
            const dailyResult = await fetchDailyEnergy(dailyParams);
            results.push({
                label: `Tag ${currentDay}`,
                energyWh: dailyResult.energyWh || 0,
                power: (dailyResult.energyWh || 0) / 24  // average watt for display purposes (optional)
            });
        } catch (err) {
            console.warn(`day ${currentDay} failed`, err);
            results.push({ label: `Tag ${currentDay}`, energyWh: 0, power: 0 });
        }
    }
    return results;
}

let chartInstance = null;

async function updateChart() {
    const calcType = document.getElementById('calcType').value;   // "moment" or "daily"
    const panelType = document.getElementById('panelType').value;
    const latitude = parseFloat(document.getElementById('latitude').value);
    const longitude = 10.0;
    const panelTilt = parseFloat(document.getElementById('panelTilt').value);
    const panelAzimuth = parseFloat(document.getElementById('panelAzimuth').value);
    let panelArea = parseFloat(document.getElementById('panelArea').value);
    if (isNaN(panelArea)) panelArea = 1.6;
    const weather = parseFloat(document.getElementById('weather').value);
    const day = parseInt(document.getElementById('dayInput').value, 10);
    const month = parseInt(document.getElementById('monthInput').value, 10);
    let dayOfYear = getDayOfYear(day, month);
    const specificHour = parseInt(document.getElementById('specificHour').value, 10);
    const graphGranularity = document.getElementById('graphGranularity').value; // "hourly" or "daily"
    let rangeCount = parseInt(document.getElementById('rangeCount').value, 10);
    if (isNaN(rangeCount) || rangeCount < 1) rangeCount = 12;
    // graph limit safety
    if (graphGranularity === 'hourly' && rangeCount > 48) rangeCount = 48;
    if (graphGranularity === 'daily' && rangeCount > 30) rangeCount = 30;

    const baseParams = {
        trueCalcType: calcType,
        type: panelType,
        latitude, longitude, panelTilt, panelAzimuth, weather,
        specificHour: specificHour,
        panelArea: panelArea
    };

    // Show loading message
    const metaSpan = document.getElementById('metaInfo');
    const debugDiv = document.getElementById('debugMsg');
    metaSpan.innerText = 'Berechnung läuft...';
    debugDiv.innerText = 'Rufe API-Endpunkte auf (mehrere Anfragen möglich)';

    try {
        let seriesData = [];
        let totalEnergyWh = 0;
        let maxPowerW = 0;

        if (graphGranularity === 'hourly') {
            // hourly graph computes watts for each hour
            let startHour = 0;
            if (calcType === 'moment') {
                startHour = specificHour;
            } else {
                startHour = 0; // daily mode show full day cycle
            }
            // array of wattage for each hour within the given range
            const hourlyResult = await computeHourlySeries(baseParams, startHour, rangeCount, dayOfYear);
            // creates a more usable array of the hourlyResult
            seriesData = hourlyResult.map(point => ({ label: point.label, value: point.power, rawWh: point.power }));
            // calculates the total amount of energy produced within the range
            totalEnergyWh = seriesData.reduce((sum, item) => sum + (item.rawWh > 0 ? item.rawWh : 0), 0);
            // takes the biggest number in the spread of seriesData.value
            maxPowerW = Math.max(...seriesData.map(i => i.value), 0);
            metaSpan.innerText = `Stundenauflösung · ${rangeCount} Stunden`;
        }
        else { // daily graph granularity
            const dailySeries = await computeDailySeries(baseParams, dayOfYear, rangeCount);
            seriesData = dailySeries.map(d => ({ label: d.label, value: d.energyWh }));
            totalEnergyWh = seriesData.reduce((sum, item) => sum + (item.value > 0 ? item.value : 0), 0);
            maxPowerW = Math.max(...seriesData.map(i => i.value), 0);
            metaSpan.innerText = `Tagesertrag · ${rangeCount} Tage`;
        }

        let panelEffDisplay = '—';
        try {
            const temporaryParams = { ...baseParams, dayOfYear, hour: 12 };
            const temporaryFetch = await fetchMoment(temporaryParams);
            panelEffDisplay = temporaryFetch.panelEfficiencyUsed
                ? (temporaryFetch.panelEfficiencyUsed * 100).toFixed(1) + '%'
                : (baseParams.type==='monocrystalline'? '20%' : baseParams.type==='polycrystalline' ? '16.5%' : '11%')
        } catch(e) { panelEffDisplay = 'no panel'; }

        // Update statistics
        document.getElementById('totalValue').innerHTML = Math.round(totalEnergyWh) + ' W';
        document.getElementById('peakValue').innerHTML = Math.round(maxPowerW) + (graphGranularity==='hourly'?' W':' W/Tag');
        document.getElementById('panelEffUsed').innerHTML = panelEffDisplay;

        const labels = seriesData.map(series => series.label);
        const values = seriesData.map(series => series.value);
        const ctx = document.getElementById('powerChart').getContext('2d');
        if (chartInstance) chartInstance.destroy();

        const yLabel = graphGranularity === 'hourly' ? 'Leistung (W) / Stunde' : 'Tagesenergie (Wh)';
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: graphGranularity === 'hourly' ? 'Ertrag pro Stunde (Wh ≈ Watt)' : 'Ertrag pro Tag (Wh)',
                    data: values,
                    borderColor: '#e68a2e',
                    backgroundColor: 'rgba(230,138,46,0.1)',
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: '#f0b27a',
                    pointBorderColor: '#c95a0f',
                    tension: 0.3,
                    fill: true,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.raw.toFixed(1)} ${graphGranularity === 'hourly' ? 'W · Wh this one' : 'Wh'}`
                        }
                    },
                    legend: { position: 'top' }
                },
                scales: {
                    y: { title: { display: true, text: yLabel }, beginAtZero: true },
                    x: { title: { display: true, text: graphGranularity === 'hourly' ? 'Uhrzeit' : 'Tag (im Jahr)' }, ticks: { maxRotation: 35 } }
                }
            }
        });
        debugDiv.innerHTML = `Graph aktualisiert · Gesamt ${Math.round(totalEnergyWh)} Wh · Spitze ${Math.round(maxPowerW)} ${graphGranularity==='hourly'?'W':'Wh/Tag'}`;
    } catch (err) {
        console.error(err);
        debugDiv.innerHTML = `Fehler: ${err.message}. Stelle sicher, dass der Backend-Server läuft (node server.js).`;
        metaSpan.innerText = 'Fehler bei API';
        document.getElementById('totalValue').innerHTML = 'Fehler';
    }
}

const calcTypeSelect = document.getElementById('calcType');
const dayMonthContainer = document.getElementById('dayMonthContainer');
const hourContainer = document.getElementById('hourContainer');

// Function to toggle visibility based on calculation type
function toggleDateInputs() {
    const calcType = calcTypeSelect.value;

    if (calcType === 'daily') {
        // Show day/month, hide hour
        dayMonthContainer.style.display = 'flex';
        hourContainer.style.display = 'none';
    } else if (calcType === 'moment') {
        // Show hour, hide day/month
        dayMonthContainer.style.display = 'none';
        hourContainer.style.display = 'flex';
    }
}

// Add event listener to calculation type select
calcTypeSelect.addEventListener('change', toggleDateInputs);

// Initialize on page load
document.addEventListener('DOMContentLoaded', toggleDateInputs);

// Initial setup and event binding
document.getElementById('computeBtn').addEventListener('click', () => updateChart());

// helper for initial load
window.addEventListener('DOMContentLoaded', async () => {
    // Also populate dayOfYear from date
    const dateInput = document.getElementById('datePicker');
    const today = new Date();
    const yyyy = today.getFullYear();
    if (!dateInput.value) dateInput.value = `${yyyy}-06-21`; // summer default
    // Set example azimuth north?
    await updateChart();
});

document.addEventListener('DOMContentLoaded', function() {
    const historyBtn = document.getElementById('historyBtn');
    if (historyBtn) {
        historyBtn.addEventListener('click', function() {
            window.location.href = 'table.html';
        });
    }
});

// When calculation type changes, adjust specificHour visibility or rangeCount suggestions
document.getElementById('calcType').addEventListener('change', (e) => {
    const isMoment = e.target.value === 'moment';
    const hourInputDiv = document.querySelector('.field-group:has(#specificHour)');
    if (hourInputDiv) {
        // visual hint: keep but we can style
    }
    if (isMoment && document.getElementById('graphGranularity').value === 'daily') {
        // ensure that moment with daily granularity would work, but we allow
    }
});
// Ensure graph based on both granularities works
document.getElementById('graphGranularity').addEventListener('change', () => {
    const rangeInput = document.getElementById('rangeCount');
    let maxVal = document.getElementById('graphGranularity').value === 'hourly' ? 48 : 30;
    let current = parseInt(rangeInput.value,10);
    if (current > maxVal) rangeInput.value = maxVal;
    if (current < 1) rangeInput.value = 12;
    rangeInput.max = maxVal;
});
document.getElementById('graphGranularity').dispatchEvent(new Event('change'));