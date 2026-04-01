// Solar Panel Energy Calculator
class SolarPanelCalculator {
    constructor(panelEfficiency = 0.85, panelArea = 1.6) {
        this.panelEfficiency = panelEfficiency; // 85% efficiency by default
        this.panelArea = panelArea; // in square meters (typical panel ~1.6m²)
        this.solarConstant = 1000; // W/m² (peak solar irradiance)
    }

    /**
     * Calculate the cosine of the angle between sun rays and panel normal
     * @param {number} panelTilt - Panel tilt angle from horizontal (degrees)
     * @param {number} panelAzimuth - Panel azimuth (0° = south, 90° = west, etc.)
     * @param {number} sunZenith - Sun's zenith angle (0° = directly overhead, 90° = horizon)
     * @param {number} sunAzimuth - Sun's azimuth angle (degrees)
     * @returns {number} - Cosine of incidence angle
     */
    calculateIncidenceAngleCosine(panelTilt, panelAzimuth, sunZenith, sunAzimuth) {
        // Convert degrees to radians
        const panelTiltRad = panelTilt * Math.PI / 180;
        const panelAzimuthRad = panelAzimuth * Math.PI / 180;
        const sunZenithRad = sunZenith * Math.PI / 180;
        const sunAzimuthRad = sunAzimuth * Math.PI / 180;

        // Cosine of incidence angle formula
        const cosTheta =  Math.cos(sunZenithRad) * Math.cos(panelTiltRad) +
                                     Math.sin(sunZenithRad) * Math.sin(panelTiltRad) *
                                     Math.cos(sunAzimuthRad - panelAzimuthRad);

        // Return max 0 (can't be negative for energy production)
        return Math.max(0, cosTheta);
    }

    /**
     * Calculate solar declination angle based on day of year
     * @param {number} dayOfYear - Day of year (1-366)
     * @returns {number} - Declination angle (degrees)
     */
    calculateDeclination(dayOfYear) {
        // Cooper's equation (approximation)
        const radians = (360 / 365) * (dayOfYear - 81) * Math.PI / 180;
        return 23.45 * Math.sin(radians);
    }

    /**
     * Calculate sun position (zenith and azimuth)
     * @param {number} latitude - Location latitude (degrees, positive for north)
     * @param {number} longitude - Location longitude (degrees, positive for east)
     * @param {number} dayOfYear - Day of year (1-366)
     * @param {number} hour - Hour of day (0-24, can include decimals)
     * @returns {Object} - Sun zenith and azimuth angles
     */
    calculateSunPosition(latitude, longitude, dayOfYear, hour) {
        // Solar time calculations
        const declination = this.calculateDeclination(dayOfYear);
        const declinationRad = declination * Math.PI / 180;
        const latitudeRad = latitude * Math.PI / 180;

        // Hour angle (15° per hour, solar noon = 0°)
        const hourAngle = (hour - 12) * 15;
        const hourAngleRad = hourAngle * Math.PI / 180;

        // Calculate zenith angle
        const cosZenith = Math.sin(latitudeRad) * Math.sin(declinationRad) +
            Math.cos(latitudeRad) * Math.cos(declinationRad) *
            Math.cos(hourAngleRad);

        let zenith = Math.acos(Math.max(-1, Math.min(1, cosZenith)));
        const zenithDeg = zenith * 180 / Math.PI;

        // Calculate azimuth angle
        let azimuth;
        if (Math.abs(cosZenith) < 0.9999) {
            const sinAzimuth = Math.cos(declinationRad) * Math.sin(hourAngleRad) /
                Math.sin(zenith);
            azimuth = Math.asin(Math.max(-1, Math.min(1, sinAzimuth)));

            // Convert to degrees and adjust quadrant
            let azimuthDeg = azimuth * 180 / Math.PI;

            // Adjust based on hour angle
            if (hourAngle > 0) {
                azimuthDeg = 360 - azimuthDeg;
            }

            azimuth = azimuthDeg;
        } else {
            azimuth = 0;
        }

        return {
            zenith: zenithDeg,
            azimuth: azimuth,
            elevation: 90 - zenithDeg
        };
    }

    /**
     * Calculate air mass effect on irradiance
     * @param {number} zenithDeg - Sun zenith angle (degrees)
     * @returns {number} - Irradiance reduction factor
     */
    calculateAirMassEffect(zenithDeg) {
        if (zenithDeg >= 90) return 0;

        const zenithRad = zenithDeg * Math.PI / 180;
        const airMass = 1 / Math.cos(zenithRad);

        // Simple atmospheric attenuation model
        // More sophisticated models would include turbidity, altitude, etc.
        const attenuation = Math.exp(-0.1 * airMass);
        return Math.max(0.1, attenuation);
    }

    /**
     * Calculate total energy output
     * @param {Object} params - Calculation parameters
     * @returns {Object} - Detailed energy calculation results
     */
    calculateEnergy(params) {
        const {
            latitude,           // degrees
            longitude,          // degrees
            dayOfYear,          // 1-366
            hour,               // 0-24
            panelTilt,          // degrees from horizontal
            panelAzimuth,       // degrees from south (0° = south facing)
            panelEfficiency = this.panelEfficiency,
            panelArea = this.panelArea
        } = params;

        // Get sun position
        const sunPos = this.calculateSunPosition(latitude, longitude, dayOfYear, hour);

        // Check if sun is above horizon
        if (sunPos.elevation <= 0) {
            return {
                power: 0,
                energy: 0,
                message: "Sun is below horizon",
                details: {
                    sunElevation: sunPos.elevation,
                    sunZenith: sunPos.zenith,
                    sunAzimuth: sunPos.azimuth
                }
            };
        }

        // Calculate incidence angle
        const cosTheta = this.calculateIncidenceAngleCosine(
            panelTilt, panelAzimuth,
            sunPos.zenith, sunPos.azimuth
        );

        // Calculate air mass effect
        const airMassFactor = this.calculateAirMassEffect(sunPos.zenith);

        // Calculate direct beam irradiance
        const beamIrradiance = this.solarConstant * airMassFactor;

        // Calculate power incident on panel (W)
        const incidentPower = beamIrradiance * this.panelArea * cosTheta;

        // Calculate electrical power output
        const electricalPower = incidentPower * panelEfficiency;

        // Calculate energy for the hour (Wh)
        const energyForHour = electricalPower;

        return {
            power: electricalPower,
            energy: energyForHour,
            incidentPower: incidentPower,
            efficiency: panelEfficiency,
            details: {
                sunElevation: sunPos.elevation,
                sunZenith: sunPos.zenith,
                sunAzimuth: sunPos.azimuth,
                incidenceAngle: Math.acos(cosTheta) * 180 / Math.PI,
                incidenceAngleCosine: cosTheta,
                airMassFactor: airMassFactor,
                beamIrradiance: beamIrradiance,
                declination: this.calculateDeclination(dayOfYear)
            }
        };
    }

    /**
     * Calculate daily energy production
     * @param {Object} params - Calculation parameters
     * @returns {number} - Total daily energy (Wh)
     */
    calculateDailyEnergy(params) {
        const { dayOfYear, ...otherParams } = params;
        let totalEnergy = 0;

        // Calculate energy for each hour of the day
        for (let hour = 0; hour < 24; hour += 0.5) { // 30-minute intervals
            const result = this.calculateEnergy({
                ...otherParams,
                dayOfYear,
                hour
            });
            totalEnergy += result.energy * 0.5; // Multiply by hour fraction
        }

        return totalEnergy;
    }

    /**
     * Calculate annual energy production
     * @param {Object} params - Calculation parameters
     * @returns {Object} - Monthly and annual energy totals
     */
    calculateAnnualEnergy(params) {
        const monthlyEnergy = [];
        let totalAnnual = 0;

        // Days per month (simplified)
        const daysPerMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

        for (let month = 0; month < 12; month++) {
            let monthTotal = 0;
            const startDay = daysPerMonth.slice(0, month).reduce((a, b) => a + b, 0) + 1;

            // Calculate for each day of the month
            for (let day = 0; day < daysPerMonth[month]; day++) {
                const dayOfYear = startDay + day;
                monthTotal += this.calculateDailyEnergy({
                    ...params,
                    dayOfYear
                });
            }

            monthlyEnergy.push({
                month: month + 1,
                energy: monthTotal / 1000, // Convert to kWh
                days: daysPerMonth[month]
            });

            totalAnnual += monthTotal;
        }

        return {
            monthly: monthlyEnergy,
            annual: totalAnnual / 1000, // kWh/year
            annualWh: totalAnnual // Wh/year
        };
    }
}

// Example usage and demonstration
function demonstrateCalculator() {
    const calculator = new SolarPanelCalculator(0.85, 1.6);

    // Example: Panel at 35° tilt, facing south, at 40° latitude
    const params = {
        latitude: 40.7128,      // New York latitude
        longitude: -74.0060,    // New York longitude
        dayOfYear: 172,          // June 21 (summer solstice)
        hour: 12,                // Solar noon
        panelTilt: 35,           // 35° tilt from horizontal
        panelAzimuth: 0,         // Facing south
        panelEfficiency: 0.85,
        panelArea: 1.6
    };

    console.log("=== Solar Panel Energy Calculator ===\n");

    // Single moment calculation
    console.log("Single moment calculation (summer solstice, solar noon):");
    const result = calculator.calculateEnergy(params);
    console.log(`  Power output: ${result.power.toFixed(1)} W`);
    console.log(`  Energy (this hour): ${result.energy.toFixed(1)} Wh`);
    console.log(`  Sun elevation: ${result.details.sunElevation.toFixed(1)}°`);
    console.log(`  Incidence angle: ${result.details.incidenceAngle.toFixed(1)}°`);
    console.log(`  Air mass factor: ${result.details.airMassFactor.toFixed(2)}\n`);

    // Daily calculation
    console.log("Daily energy production (summer solstice):");
    const dailyEnergy = calculator.calculateDailyEnergy(params);
    console.log(`  Total: ${dailyEnergy.toFixed(1)} Wh (${(dailyEnergy / 1000).toFixed(2)} kWh)\n`);

    // Compare different panel tilts
    console.log("Daily energy comparison (summer vs winter):");
    const winterParams = { ...params, dayOfYear: 355 }; // December 21

    const tilts = [0, 15, 30, 35, 45, 60];
    console.log("Panel tilt | Summer (Jun 21) | Winter (Dec 21)");
    console.log("----------------------------------------------");

    tilts.forEach(tilt => {
        const summerEnergy = calculator.calculateDailyEnergy({ ...params, panelTilt: tilt });
        const winterEnergy = calculator.calculateDailyEnergy({ ...winterParams, panelTilt: tilt });
        console.log(`  ${tilt}°      | ${summerEnergy.toFixed(0)} Wh        | ${winterEnergy.toFixed(0)} Wh`);
    });

    console.log("\n");

    // Annual calculation
    console.log("Annual energy production (fixed tilt, 35°):");
    const annual = calculator.calculateAnnualEnergy(params);
    console.log(`  Total annual: ${annual.annual.toFixed(0)} kWh`);
    console.log("\n  Monthly breakdown:");
    annual.monthly.forEach(month => {
        console.log(`    Month ${month.month}: ${month.energy.toFixed(0)} kWh (${month.days} days)`);
    });
}

// Export for use in other modules (if using Node.js)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SolarPanelCalculator;
}

// Run demonstration
demonstrateCalculator();