const test = require('node:test');
const assert = require('node:assert/strict');
const {
    getNormalizedRound,
    getRoundInputSubdir,
    getRoundPublicBasePath,
    inferRoundFromImage
} = require('../round_utils');

test('getNormalizedRound normalizes invalid values', () => {
    assert.equal(getNormalizedRound(undefined, 3), 3);
    assert.equal(getNormalizedRound('2', 1), 2);
    assert.equal(getNormalizedRound('0', 5), 5);
});

test('round directories follow the existing contract', () => {
    assert.equal(getRoundInputSubdir(1), 'input_images');
    assert.equal(getRoundInputSubdir(3), 'round_inputs\\round_3');
    assert.equal(getRoundPublicBasePath(3), 'round_inputs/round_3');
});

test('inferRoundFromImage falls back to round 1', () => {
    assert.equal(inferRoundFromImage({ round: 4 }), 4);
    assert.equal(inferRoundFromImage({}), 1);
});
