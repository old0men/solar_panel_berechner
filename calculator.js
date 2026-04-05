class SolarPanelCalculator {
    constructor(panelEfficiency = 0.85, panelArea = 1.6) {
        this.panelEfficiency = panelEfficiency;
        this.panelArea = panelArea;
        this.solarConstant = 1000;
    }

    calculateIncidenceAngleCosine(panelTilt, panelAzimuth, sunZenith, sunAzimuth) {
        const panelTiltRad = panelTilt * Math.PI / 180;
        const panelAzimuthRad = panelAzimuth * Math.PI / 180;
        const sunZenithRad = sunZenith * Math.PI / 180;
        const sunAzimuthRad = sunAzimuth * Math.PI / 180;

        const cosTheta = Math.cos(sunZenithRad) * Math.cos(panelTiltRad) +
            Math.sin(sunZenithRad) * Math.sin(panelTiltRad) *
            Math.cos(sunAzimuthRad - panelAzimuthRad);

        return Math.max(0, cosTheta);
    }

    calculateDeclination(dayOfYear) {
        const radians = (360 / 365) * (dayOfYear - 81) * Math.PI / 180;
        return 23.45 * Math.sin(radians);
    }

    calculateSunPosition(latitude, longitude, dayOfYear, hour) {
        const declination = this.calculateDeclination(dayOfYear);
        const declinationRad = declination * Math.PI / 180;
        const latitudeRad = latitude * Math.PI / 180;
        const hourAngle = (hour - 12) * 15;
        const hourAngleRad = hourAngle * Math.PI / 180;

        const cosZenith = Math.sin(latitudeRad) * Math.sin(declinationRad) +
            Math.cos(latitudeRad) * Math.cos(declinationRad) *
            Math.cos(hourAngleRad);

        const zenith = Math.acos(Math.max(-1, Math.min(1, cosZenith)));
        const zenithDeg = zenith * 180 / Math.PI;

        let azimuth;
        if (Math.abs(cosZenith) < 0.9999) {
            const sinAzimuth = Math.cos(declinationRad) * Math.sin(hourAngleRad) /
                Math.sin(zenith);
            azimuth = Math.asin(Math.max(-1, Math.min(1, sinAzimuth)));

            let azimuthDeg = azimuth * 180 / Math.PI;
            if (hourAngle > 0) {
                azimuthDeg = 360 - azimuthDeg;
            }

            azimuth = azimuthDeg;
        } else {
            azimuth = 0;
        }

        return {
            zenith: zenithDeg,
            azimuth,
            elevation: 90 - zenithDeg
        };
    }

    calculateAirMassEffect(zenithDeg) {
        if (zenithDeg >= 90) {
            return 0;
        }

        const zenithRad = zenithDeg * Math.PI / 180;
        const airMass = 1 / Math.cos(zenithRad);
        const attenuation = Math.exp(-0.1 * airMass);

        return Math.max(0.1, attenuation);
    }

    calculateEnergy(params) {
        const {
            latitude,
            longitude,
            dayOfYear,
            hour,
            panelTilt,
            panelAzimuth,
            panelEfficiency = this.panelEfficiency,
            panelArea = this.panelArea
        } = params;

        const sunPos = this.calculateSunPosition(latitude, longitude, dayOfYear, hour);

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

        const cosTheta = this.calculateIncidenceAngleCosine(
            panelTilt,
            panelAzimuth,
            sunPos.zenith,
            sunPos.azimuth
        );
        const airMassFactor = this.calculateAirMassEffect(sunPos.zenith);
        const beamIrradiance = this.solarConstant * airMassFactor;
        const incidentPower = beamIrradiance * panelArea * cosTheta;
        const electricalPower = incidentPower * panelEfficiency;

        return {
            power: electricalPower,
            energy: electricalPower,
            incidentPower,
            efficiency: panelEfficiency,
            details: {
                sunElevation: sunPos.elevation,
                sunZenith: sunPos.zenith,
                sunAzimuth: sunPos.azimuth,
                incidenceAngle: Math.acos(cosTheta) * 180 / Math.PI,
                incidenceAngleCosine: cosTheta,
                airMassFactor,
                beamIrradiance,
                declination: this.calculateDeclination(dayOfYear)
            }
        };
    }

    calculateDailyEnergy(params) {
        const { dayOfYear, ...otherParams } = params;
        let totalEnergy = 0;

        for (let hour = 0; hour < 24; hour += 0.5) {
            const result = this.calculateEnergy({
                ...otherParams,
                dayOfYear,
                hour
            });
            totalEnergy += result.energy * 0.5;
        }

        return totalEnergy;
    }

    calculateAnnualEnergy(params) {
        const monthlyEnergy = [];
        let totalAnnual = 0;
        const daysPerMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

        for (let month = 0; month < 12; month += 1) {
            let monthTotal = 0;
            const startDay = daysPerMonth.slice(0, month).reduce((sum, days) => sum + days, 0) + 1;

            for (let day = 0; day < daysPerMonth[month]; day += 1) {
                const dayOfYear = startDay + day;
                monthTotal += this.calculateDailyEnergy({
                    ...params,
                    dayOfYear
                });
            }

            monthlyEnergy.push({
                month: month + 1,
                energy: monthTotal / 1000,
                days: daysPerMonth[month]
            });

            totalAnnual += monthTotal;
        }

        return {
            monthly: monthlyEnergy,
            annual: totalAnnual / 1000,
            annualWh: totalAnnual
        };
    }
}

module.exports = SolarPanelCalculator;
