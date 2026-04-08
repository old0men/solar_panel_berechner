// K.C.
const PANEL_TYPES = {
    polycrystalline: {
        code: "polycrystalline",
        germanName: "Polykristallin",
        efficiencyMin: 0.16,
        efficiencyMax: 0.20,
        defaultEfficiency: 0.18
    },
    monocrystalline: {
        code: "monocrystalline",
        germanName: "Monokristallin",
        efficiencyMin: 0.20,
        efficiencyMax: 0.23,
        defaultEfficiency: 0.215
    },
    thinFilm: {
        code: "thinFilm",
        germanName: "Duennschichtzellen",
        efficiencyMin: 0.10,
        efficiencyMax: 0.12,
        defaultEfficiency: 0.11
    }
};

function listPanelTypes() {
    return Object.values(PANEL_TYPES);
}

function getPanelType(code) {
    return PANEL_TYPES[code] || null;
}

module.exports = {
    listPanelTypes,
    getPanelType
};
