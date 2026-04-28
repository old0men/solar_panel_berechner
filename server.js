// K.C.
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");

const SolarPanelCalculator = require("./calculator");
const { listPanelTypes, getPanelType } = require("./panel-types");
const {
    dbPath,
    getOrCreateUser,
    createCalculation,
    listCalculationsByUser,
    getCalculationByIdForUser,
    deleteCalculationByIdForUser
} = require("./db");

const app = express();
const path = require("path");
const calculator = new SolarPanelCalculator();
const PORT = Number(process.env.PORT || 3000);
const USER_COOKIE_NAME = "solar_user_id";
const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;

app.use(express.json());
app.use(cookieParser());

app.use(express.static(path.join(__dirname, "public")));
app.use((req, res, next) => {
    let cookieId = req.cookies[USER_COOKIE_NAME];

    if (!cookieId) {
        cookieId = crypto.randomUUID();
        res.cookie(USER_COOKIE_NAME, cookieId, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: ONE_YEAR_MS
        });
    }

    req.currentUser = getOrCreateUser(cookieId);
    next();
});

function parseNumber(value, fieldName, errors, options = {}) {
    const { min, max, required = true } = options;

    if (value === undefined || value === null || value === "") {
        if (required) {
            errors.push(`${fieldName} is required.`);
        }
        return undefined;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        errors.push(`${fieldName} must be a valid number.`);
        return undefined;
    }

    if (min !== undefined && parsed < min) {
        errors.push(`${fieldName} must be at least ${min}.`);
    }

    if (max !== undefined && parsed > max) {
        errors.push(`${fieldName} must be at most ${max}.`);
    }

    return parsed;
}

function validateBaseParams(body) {
    const errors = [];
    const panelType = getPanelType(body.type);

    if (!panelType) {
        errors.push("type must be one of: polycrystalline, monocrystalline, thinFilm.");
    }

    const params = {
        latitude: parseNumber(body.latitude, "latitude", errors, { min: -90, max: 90 }),
        longitude: parseNumber(body.longitude, "longitude", errors, { min: -180, max: 180 }),
        panelTilt: parseNumber(body.panelTilt, "panelTilt", errors, { min: 0, max: 90 }),
        panelAzimuth: parseNumber(body.panelAzimuth, "panelAzimuth", errors, { min: -180, max: 360 }),
        panelArea: parseNumber(body.panelArea, "panelArea", errors, { min: 0, required: false }),
        weather: parseNumber(body.weather, "weather", errors, {min: 0, max: 1, required: false}) ?? 0
    };

    console.log(params.weather)

    return { errors, params, panelType };
}

function buildCalculation(mode, body) {
    const { errors, params, panelType } = validateBaseParams(body);

    if (mode === "moment" || mode === "daily") {
        params.dayOfYear = parseNumber(body.dayOfYear, "dayOfYear", errors, { min: 1, max: 366 });
    }

    if (mode === "moment") {
        params.hour = parseNumber(body.hour, "hour", errors, { min: 0, max: 24 });
    }

    if (errors.length > 0) {
        const error = new Error("Validation failed");
        error.statusCode = 400;
        error.details = errors;
        throw error;
    }

    if (params.panelArea === undefined) {
        delete params.panelArea;
    }

    const calculationParams = {
        ...params,
        panelEfficiency: panelType.defaultEfficiency
    };

    const input = {
        ...params,
        type: panelType.code,
        panelEfficiency: panelType.defaultEfficiency,
        panelEfficiencyRange: {
            min: panelType.efficiencyMin,
            max: panelType.efficiencyMax
        }
    };

    if (mode === "moment") {
        const result = calculator.calculateEnergy(calculationParams);
        return {
            input,
            result: {
                ...result,
                panelType: panelType.code,
                panelTypeGermanName: panelType.germanName,
                panelEfficiencyUsed: panelType.defaultEfficiency,
                panelEfficiencyRange: {
                    min: panelType.efficiencyMin,
                    max: panelType.efficiencyMax
                }
            }
        };
    }

    if (mode === "daily") {
        const energyWh = calculator.calculateDailyEnergy(calculationParams);
        return {
            input,
            result: {
                energyWh,
                energyKWh: energyWh / 1000,
                panelType: panelType.code,
                panelTypeGermanName: panelType.germanName,
                panelEfficiencyUsed: panelType.defaultEfficiency,
                panelEfficiencyRange: {
                    min: panelType.efficiencyMin,
                    max: panelType.efficiencyMax
                }
            }
        };
    }

    if (mode === "annual") {
        const result = calculator.calculateAnnualEnergy(calculationParams);
        return {
            input,
            result: {
                ...result,
                panelType: panelType.code,
                panelTypeGermanName: panelType.germanName,
                panelEfficiencyUsed: panelType.defaultEfficiency,
                panelEfficiencyRange: {
                    min: panelType.efficiencyMin,
                    max: panelType.efficiencyMax
                }
            }
        };
    }

    const error = new Error("Unsupported calculation type.");
    error.statusCode = 400;
    throw error;
}

function sendStoredCalculation(res, userId, calculationType, calculation) {
    const record = createCalculation({
        userId,
        calculationType,
        input: calculation.input,
        result: calculation.result
    });

    res.status(201).json({
        user: {
            id: userId
        },
        calculation: record
    });
}

app.get("/", (req, res) => {
    res.json({
        name: "solar_panel_berechner API",
        database: dbPath,
        endpoints: {
            getCookie: "GET /api/users/me",
            deleteCookie: "DELETE /api/users/me",
            panelTypes: "GET /api/panel-types",
            createCalculation: "POST /api/calculations",
            listCalculations: "GET /api/calculations",
            getCalculation: "GET /api/calculations/:id",
            deleteCalculation: "DELETE /api/calculations/:id",
            health: "GET /api/health"
        },
        supportedCalculationTypes: ["moment", "daily", "annual"],
        supportedPanelTypes: listPanelTypes()
    });
});

app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        database: dbPath,
        time: new Date().toISOString()
    });
});

app.get("/api/users/me", (req, res) => {
    res.json({
        user: req.currentUser
    });
});

app.delete("/api/users/me", (req, res) => {
    res.clearCookie(USER_COOKIE_NAME, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production"
    });

    res.status(204).send();
});

app.get("/api/panel-types", (req, res) => {
    res.json({
        panelTypes: listPanelTypes()
    });
});

app.post("/api/calculations", (req, res, next) => {
    try {
        const mode = req.body.calculationType;
        if (!mode) {
            const error = new Error("calculationType is required.");
            error.statusCode = 400;
            throw error;
        }

        const calculation = buildCalculation(mode, req.body);
        sendStoredCalculation(res, req.currentUser.id, mode, calculation);
    } catch (error) {
        next(error);
    }
});

app.get("/api/calculations", (req, res) => {
    res.json({
        calculations: listCalculationsByUser(req.currentUser.id)
    });
});

app.get("/api/calculations/:id", (req, res) => {
    const calculationId = Number(req.params.id);
    const calculation = getCalculationByIdForUser(calculationId, req.currentUser.id);

    if (!calculation) {
        return res.status(404).json({
            error: "Calculation not found."
        });
    }

    return res.json({ calculation });
});

app.delete("/api/calculations/:id", (req, res) => {
    const calculationId = Number(req.params.id);
    const deleted = deleteCalculationByIdForUser(calculationId, req.currentUser.id);

    if (!deleted) {
        return res.status(404).json({
            error: "Calculation not found."
        });
    }

    return res.status(204).send();
});

app.use((error, req, res, next) => {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
        error: error.message || "Internal server error.",
        details: error.details || undefined
    });
});

function startServer(port = PORT) {
    return app.listen(port, () => {
        console.log(`API listening on http://localhost:${port}`);
    });
}

if (require.main === module) {
    startServer();
}

module.exports = {
    app,
    startServer
};
