const path = require('path');

function sanitizeSegment(value, fallback = 'na') {
    const cleaned = String(value ?? '')
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/[^\p{Letter}\p{Number}_-]/gu, '_')
        .replace(/_+/g, '_')
        .replace(/-+/g, '-')
        .replace(/^[_-]+|[_-]+$/g, '')
        .slice(0, 80);
    return cleaned || fallback;
}

function pad(value) {
    return String(value).padStart(2, '0');
}

function formatHarnessTimestamp(date = new Date()) {
    return [
        `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`,
        `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    ].join('_');
}

function buildResolutionTag({ provider, resolution, aspectRatio, sizePreset, width, height } = {}) {
    if (sizePreset) {
        return sanitizeSegment(String(sizePreset).toLowerCase(), 'default');
    }

    if (width && height) {
        return sanitizeSegment(`${width}x${height}`, 'default');
    }

    const normalizedResolution = String(resolution || '').trim();
    const normalizedAspectRatio = String(aspectRatio || '').trim();
    if (normalizedResolution && normalizedAspectRatio) {
        return sanitizeSegment(`${normalizedResolution}_${normalizedAspectRatio}`, 'default');
    }

    if (normalizedResolution) {
        return sanitizeSegment(normalizedResolution, 'default');
    }

    if (provider === 'crate') {
        return '512x512';
    }

    return 'default';
}

function buildOutputFilename({
    itemName,
    model,
    resolution,
    moduleId,
    round,
    version,
    timestamp = new Date(),
    ext = '.png'
}) {
    const normalizedExt = String(ext || '.png').startsWith('.') ? String(ext || '.png') : `.${ext}`;
    const parts = [
        sanitizeSegment(itemName, 'item'),
        `m-${sanitizeSegment(model, 'unknown-model')}`,
        `res-${sanitizeSegment(resolution, 'default')}`,
        `mod-${sanitizeSegment(moduleId, 'default')}`,
        `round-${Math.max(1, Number(round || 1))}`,
        `v-${Math.max(1, Number(version || 1))}`,
        `ts-${formatHarnessTimestamp(timestamp instanceof Date ? timestamp : new Date(timestamp))}`
    ];
    return `${parts.join('__')}${normalizedExt.toLowerCase()}`;
}

function buildRoundInputFilename({
    itemName,
    targetRound,
    timestamp = new Date(),
    ext = '.png'
}) {
    const normalizedExt = String(ext || '.png').startsWith('.') ? String(ext || '.png') : `.${ext}`;
    const baseName = sanitizeSegment(itemName, `round_${Math.max(1, Number(targetRound || 1))}`);
    return [
        baseName,
        'pool-input',
        `round-${Math.max(1, Number(targetRound || 1))}`,
        `ts-${formatHarnessTimestamp(timestamp instanceof Date ? timestamp : new Date(timestamp))}`
    ].join('__') + normalizedExt.toLowerCase();
}

function inferOutputNamingContext({ provider = 'crate', moduleConfig = {}, itemName, round = 1, version = 1 } = {}) {
    const resolvedModel = moduleConfig.model
        || (provider === 'crate' ? 'crate-default' : 'nano-banana-pro');
    return {
        itemName,
        model: resolvedModel,
        resolution: buildResolutionTag({
            provider,
            resolution: moduleConfig.resolution,
            aspectRatio: moduleConfig.aspectRatio,
            sizePreset: moduleConfig.sizePreset,
            width: moduleConfig.width,
            height: moduleConfig.height
        }),
        moduleId: moduleConfig.id || moduleConfig.name || 'default',
        round,
        version
    };
}

function parseOutputFilename(filename) {
    const base = path.basename(String(filename || ''));
    const match = base.match(/^(.+?)__m-(.+?)__res-(.+?)__mod-(.+?)__round-(\d+)__v-(\d+)__ts-(\d{8}_\d{6})\.(png|jpg|jpeg|webp)$/i);
    if (!match) {
        return null;
    }

    return {
        itemName: match[1],
        model: match[2],
        resolution: match[3],
        moduleId: match[4],
        round: Number(match[5]),
        version: Number(match[6]),
        timestamp: match[7],
        ext: `.${match[8].toLowerCase()}`
    };
}

function isOutputFilenameCompliant(filename) {
    return Boolean(parseOutputFilename(filename));
}

module.exports = {
    buildOutputFilename,
    buildResolutionTag,
    buildRoundInputFilename,
    formatHarnessTimestamp,
    inferOutputNamingContext,
    isOutputFilenameCompliant,
    parseOutputFilename,
    sanitizeSegment
};
