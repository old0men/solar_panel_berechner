// K.C.
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "solar-calculator.sqlite");

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cookie_id TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS calculations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        calculation_type TEXT NOT NULL,
        input_json TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_calculations_user_id
    ON calculations(user_id);
`);

const statements = {
    findUserByCookie: db.prepare(`
        SELECT id, cookie_id AS cookieId, created_at AS createdAt
        FROM users
        WHERE cookie_id = ?
    `),
    insertUser: db.prepare(`
        INSERT INTO users (cookie_id, created_at)
        VALUES (?, ?)
    `),
    insertCalculation: db.prepare(`
        INSERT INTO calculations (user_id, calculation_type, input_json, result_json, created_at)
        VALUES (@userId, @calculationType, @inputJson, @resultJson, @createdAt)
    `),
    listCalculationsByUser: db.prepare(`
        SELECT
            id,
            calculation_type AS calculationType,
            input_json AS inputJson,
            result_json AS resultJson,
            created_at AS createdAt
        FROM calculations
        WHERE user_id = ?
        ORDER BY id DESC
    `),
    getCalculationByIdForUser: db.prepare(`
        SELECT
            id,
            calculation_type AS calculationType,
            input_json AS inputJson,
            result_json AS resultJson,
            created_at AS createdAt
        FROM calculations
        WHERE id = ? AND user_id = ?
    `),
    deleteCalculationByIdForUser: db.prepare(`
        DELETE FROM calculations
        WHERE id = ? AND user_id = ?
    `)
};

function createUser(cookieId) {
    const createdAt = new Date().toISOString();
    const result = statements.insertUser.run(cookieId, createdAt);

    return {
        id: Number(result.lastInsertRowid),
        cookieId,
        createdAt
    };
}

function getOrCreateUser(cookieId) {
    const existingUser = statements.findUserByCookie.get(cookieId);
    if (existingUser) {
        return existingUser;
    }

    return createUser(cookieId);
}

function normalizeCalculation(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        calculationType: row.calculationType,
        input: JSON.parse(row.inputJson),
        result: JSON.parse(row.resultJson),
        createdAt: row.createdAt
    };
}

function createCalculation({ userId, calculationType, input, result }) {
    const payload = {
        userId,
        calculationType,
        inputJson: JSON.stringify(input),
        resultJson: JSON.stringify(result),
        createdAt: new Date().toISOString()
    };

    const insertResult = statements.insertCalculation.run(payload);
    return getCalculationByIdForUser(Number(insertResult.lastInsertRowid), userId);
}

function listCalculationsByUser(userId) {
    return statements.listCalculationsByUser.all(userId).map(normalizeCalculation);
}

function getCalculationByIdForUser(calculationId, userId) {
    return normalizeCalculation(statements.getCalculationByIdForUser.get(calculationId, userId));
}

function deleteCalculationByIdForUser(calculationId, userId) {
    const result = statements.deleteCalculationByIdForUser.run(calculationId, userId);
    return result.changes > 0;
}

module.exports = {
    dbPath,
    getOrCreateUser,
    createCalculation,
    listCalculationsByUser,
    getCalculationByIdForUser,
    deleteCalculationByIdForUser
};
