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
        type: params.type,
        latitude: params.latitude,
        longitude: params.longitude,
        panelTilt: params.panelTilt,
        panelAzimuth: params.panelAzimuth,
        dayOfYear: params.dayOfYear,
        hour: params.hour,
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
        type: params.type,
        latitude: params.latitude,
        longitude: params.longitude,
        panelTilt: params.panelTilt,
        panelAzimuth: params.panelAzimuth,
        dayOfYear: params.dayOfYear,
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


