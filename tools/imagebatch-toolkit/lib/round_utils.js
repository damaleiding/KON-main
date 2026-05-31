const path = require('path');
const { PROJECT_DIR } = require('./runtime_config');

const ROUND_INPUTS_ROOT = path.join(PROJECT_DIR, 'round_inputs');

function getNormalizedRound(value, fallback = 1) {
    const round = Number.parseInt(String(value ?? fallback), 10);
    return Number.isFinite(round) && round >= 1 ? round : fallback;
}

function getRoundLabel(round) {
    return `第${getNormalizedRound(round)}轮`;
}

function getRoundInputSubdir(round) {
    const normalized = getNormalizedRound(round);
    return normalized === 1 ? 'input_images' : path.join('round_inputs', `round_${normalized}`);
}

function getRoundInputDir(round) {
    return path.join(PROJECT_DIR, getRoundInputSubdir(round));
}

function getRoundPublicBasePath(round) {
    return getRoundInputSubdir(round).replace(/\\/g, '/');
}

function inferRoundFromImage(image = {}) {
    return getNormalizedRound(image.round || 1);
}

module.exports = {
    ROUND_INPUTS_ROOT,
    getNormalizedRound,
    getRoundLabel,
    getRoundInputSubdir,
    getRoundInputDir,
    getRoundPublicBasePath,
    inferRoundFromImage
};
