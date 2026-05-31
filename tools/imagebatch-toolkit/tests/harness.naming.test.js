const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildOutputFilename,
    buildRoundInputFilename,
    buildResolutionTag,
    parseOutputFilename,
    isOutputFilenameCompliant
} = require('../harness');

test('buildOutputFilename includes model resolution round version and timestamp', () => {
    const timestamp = new Date(2026, 4, 21, 9, 8, 7);
    const fileName = buildOutputFilename({
        itemName: 'Fire Sword',
        model: 'banana-pro',
        resolution: '2K_1:1',
        moduleId: 'ink-pass',
        round: 2,
        version: 3,
        timestamp,
        ext: '.png'
    });

    assert.equal(
        fileName,
        'Fire-Sword__m-banana-pro__res-2K_1_1__mod-ink-pass__round-2__v-3__ts-20260521_090807.png'
    );
    assert.equal(isOutputFilenameCompliant(fileName), true);
});

test('parseOutputFilename reads harness contract fields', () => {
    const parsed = parseOutputFilename(
        'Fire-Sword__m-banana-pro__res-2K_1_1__mod-ink-pass__round-2__v-3__ts-20260521_090807.png'
    );

    assert.deepEqual(parsed, {
        itemName: 'Fire-Sword',
        model: 'banana-pro',
        resolution: '2K_1_1',
        moduleId: 'ink-pass',
        round: 2,
        version: 3,
        timestamp: '20260521_090807',
        ext: '.png'
    });
});

test('buildRoundInputFilename keeps round and timestamp', () => {
    const timestamp = new Date(2026, 4, 21, 9, 8, 7);
    const fileName = buildRoundInputFilename({
        itemName: 'Fire Sword',
        targetRound: 4,
        timestamp,
        ext: '.webp'
    });

    assert.equal(
        fileName,
        'Fire-Sword__pool-input__round-4__ts-20260521_090807.webp'
    );
});

test('buildOutputFilename preserves non-ascii item names', () => {
    const timestamp = new Date(2026, 4, 21, 9, 8, 7);
    const fileName = buildOutputFilename({
        itemName: '焚天宗_大殿_赤遥_融图',
        model: 'gpt-image-2',
        resolution: '3k-16-9',
        moduleId: 'img2模块',
        round: 1,
        version: 2,
        timestamp,
        ext: '.png'
    });

    assert.equal(
        fileName,
        '焚天宗_大殿_赤遥_融图__m-gpt-image-2__res-3k-16-9__mod-img2模块__round-1__v-2__ts-20260521_090807.png'
    );
    assert.equal(isOutputFilenameCompliant(fileName), true);
});

test('buildResolutionTag prefers size preset then ratio then provider defaults', () => {
    assert.equal(
        buildResolutionTag({ sizePreset: '1k-1-1', resolution: 'high', aspectRatio: '16:9' }),
        '1k-1-1'
    );
    assert.equal(
        buildResolutionTag({ resolution: '2K', aspectRatio: '3:4' }),
        '2K_3_4'
    );
    assert.equal(buildResolutionTag({ provider: 'crate' }), '512x512');
});
