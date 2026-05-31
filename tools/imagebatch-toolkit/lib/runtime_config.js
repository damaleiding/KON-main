const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECT_DIR = __dirname;
const DEFAULT_DIRS = {
    references: 'references',
    outputs: 'outputs',
    tables: 'tables',
    referenceImages: path.join('references', 'reference_images'),
    galleryData: path.join('outputs', 'gallery_data.js'),
    stateFile: path.join('outputs', 'state.js')
};

const PROJECT_PATHS = {
    referencesDir: path.join(PROJECT_DIR, DEFAULT_DIRS.references),
    outputsDir: path.join(PROJECT_DIR, DEFAULT_DIRS.outputs),
    tablesDir: path.join(PROJECT_DIR, DEFAULT_DIRS.tables),
    referenceImagesDir: path.join(PROJECT_DIR, DEFAULT_DIRS.referenceImages),
    galleryDataFile: path.join(PROJECT_DIR, DEFAULT_DIRS.galleryData),
    stateFile: path.join(PROJECT_DIR, DEFAULT_DIRS.stateFile)
};

const CSV_FIELD_ALIASES = {
    id: ['ID', 'Id', 'id'],
    name: ['名称', '物品/技能名称', '物品名称', 'name'],
    type: ['类型', '类别', 'type'],
    element: ['五行属性', '五行', 'element'],
    artRequirement: ['美术设计要求', '美术需求', '设计要求'],
    prompt: ['可以直接复制的AI提示词(Prompt)', 'AI提示词(Prompt)', 'Prompt', 'prompt']
};

const DEFAULT_CSV_NAMES = [
    '准备给AI的提示词表格.csv',
    '新_准备给AI的提示词表格.csv',
    'sample_data.csv'
];

let cachedBrowserToken = null;
let cachedBrowserPayload = null;
let lastBrowserScanAt = 0;

function resolveProjectPath(...segments) {
    return path.join(PROJECT_DIR, ...segments);
}

function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(normalized + padding, 'base64').toString('utf8');
}

function decodeJwtPayload(token) {
    try {
        const parts = String(token || '').trim().split('.');
        if (parts.length !== 3) return null;
        return JSON.parse(decodeBase64Url(parts[1]));
    } catch {
        return null;
    }
}

function decodeJwtHeader(token) {
    try {
        const parts = String(token || '').trim().split('.');
        if (parts.length !== 3) return null;
        return JSON.parse(decodeBase64Url(parts[0]));
    } catch {
        return null;
    }
}

function getRemainingSecondsFromPayload(payload) {
    if (!payload || !payload.exp) return null;
    return payload.exp - Math.floor(Date.now() / 1000);
}

function isCratePassportToken(token) {
    const header = decodeJwtHeader(token);
    const payload = decodeJwtPayload(token);
    return Boolean(
        header?.alg === 'RS256' &&
        payload?.iss === 'paas.passport.auth' &&
        payload?.type === 'person_account'
    );
}

function isTokenUsable(token, minRemainingSeconds = 300) {
    const payload = decodeJwtPayload(token);
    if (!payload || !payload.exp || !isCratePassportToken(token)) return false;
    return getRemainingSecondsFromPayload(payload) > minRemainingSeconds;
}

function updateEnvValue(key, value, baseDir = PROJECT_DIR) {
    const envPath = path.join(baseDir, '.env');
    const escapedValue = String(value ?? '').replace(/\r?\n/g, '');
    let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    const line = `${key}=${escapedValue}`;

    if (new RegExp(`^${key}=`, 'm').test(content)) {
        content = content.replace(new RegExp(`^${key}=.*$`, 'm'), line);
    } else {
        content = content.trimEnd() + (content.trim() ? '\n' : '') + line + '\n';
    }

    fs.writeFileSync(envPath, content);
}

function resolveCsvPath(baseDir = PROJECT_DIR) {
    const resolvedBaseDir = path.isAbsolute(baseDir) ? baseDir : resolveProjectPath(baseDir);
    const candidates = [];
    if (process.env.CSV_PATH) {
        candidates.push(
            path.isAbsolute(process.env.CSV_PATH)
                ? process.env.CSV_PATH
                : path.join(resolvedBaseDir, process.env.CSV_PATH)
        );
    }

    for (const name of DEFAULT_CSV_NAMES) {
        candidates.push(path.join(PROJECT_PATHS.tablesDir, name));
        candidates.push(path.join(resolvedBaseDir, name));
    }

    return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function parseCsvLine(line) {
    const parts = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            parts.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    parts.push(current.trim());
    return parts.map(part => part.replace(/^"|"$/g, ''));
}

function findHeaderIndex(headers, aliases) {
    return aliases.map(alias => headers.indexOf(alias)).find(index => index !== -1) ?? -1;
}

function getField(parts, headers, aliases) {
    const index = findHeaderIndex(headers, aliases);
    return index >= 0 ? (parts[index] || '').trim() : '';
}

function parsePromptRecords(csvPath = resolveCsvPath()) {
    if (!csvPath) {
        throw new Error('No prompt CSV found. Set CSV_PATH in .env or place a CSV file in the project root.');
    }

    const content = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
    const lines = content.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length === 0) return [];

    const headers = parseCsvLine(lines[0]);
    return lines.slice(1).map(line => {
        const parts = parseCsvLine(line);
        return {
            id: getField(parts, headers, CSV_FIELD_ALIASES.id),
            name: getField(parts, headers, CSV_FIELD_ALIASES.name),
            type: getField(parts, headers, CSV_FIELD_ALIASES.type),
            element: getField(parts, headers, CSV_FIELD_ALIASES.element),
            artRequirement: getField(parts, headers, CSV_FIELD_ALIASES.artRequirement),
            prompt: getField(parts, headers, CSV_FIELD_ALIASES.prompt)
        };
    }).filter(record => record.id || record.name);
}

function buildPromptFromRecord(record) {
    if (record.prompt) return record.prompt;

    return [
        record.name ? `Game icon for '${record.name}'.` : '',
        record.type ? `Type: ${record.type}.` : '',
        record.element ? `Element: ${record.element}.` : '',
        record.artRequirement ? `Design requirements: ${record.artRequirement}.` : ''
    ].filter(Boolean).join(' ').trim();
}

function getBrowserLevelDbDirs() {
    const localAppData = process.env.LOCALAPPDATA;
    const roots = [
        path.join(localAppData || '', 'Google', 'Chrome', 'User Data'),
        path.join(localAppData || '', 'Microsoft', 'Edge', 'User Data')
    ];

    const dirs = [];
    for (const root of roots) {
        if (!fs.existsSync(root)) continue;
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            if (!(entry.name === 'Default' || entry.name.startsWith('Profile'))) continue;
            const levelDbDir = path.join(root, entry.name, 'Local Storage', 'leveldb');
            if (fs.existsSync(levelDbDir)) {
                dirs.push(levelDbDir);
            }
        }
    }
    return dirs;
}

function scoreTokenCandidate(token, context) {
    if (!isCratePassportToken(token)) return null;
    const payload = decodeJwtPayload(token);
    if (!payload || !payload.exp) return null;

    const now = Math.floor(Date.now() / 1000);
    const remaining = payload.exp - now;
    const scoreBase = payload.exp * 1000;
    let score = scoreBase;

    if (/crate\.tiktok-row\.net/i.test(context)) score += 5_000_000_000;
    if (/CLOUD_JWT_MAP|__cloud_jwt/i.test(context)) score += 4_000_000_000;
    if (/tiktok-aigc-creation-platform|CreateBlock|771162/i.test(context)) score += 3_000_000_000;
    if (payload.iss === 'paas.passport.auth') score += 2_000_000_000;
    if (remaining > 0) score += 1_000_000_000;

    return { token, payload, score };
}

function findBestBrowserToken() {
    let best = null;
    const jwtRegex = /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}\b/g;

    for (const levelDbDir of getBrowserLevelDbDirs()) {
        const files = fs.readdirSync(levelDbDir)
            .filter(name => name.endsWith('.ldb') || name.endsWith('.log'))
            .map(name => path.join(levelDbDir, name))
            .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
            .slice(0, 8);

        for (const filePath of files) {
            const text = fs.readFileSync(filePath).toString('latin1');
            let match;
            while ((match = jwtRegex.exec(text)) !== null) {
                const token = match[0];
                const context = text.slice(Math.max(0, match.index - 300), Math.min(text.length, match.index + token.length + 300));
                const candidate = scoreTokenCandidate(token, context);
                if (!candidate) continue;

                if (!best || candidate.score > best.score) {
                    best = { ...candidate, filePath };
                }
            }
        }
    }

    return best;
}

function findBestBrowserTokenViaPowerShell() {
    try {
        const script = [
            "$patterns = @(",
            "  \"$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\*\\Local Storage\\leveldb\\*.ldb\",",
            "  \"$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\*\\Local Storage\\leveldb\\*.log\",",
            "  \"$env:LOCALAPPDATA\\Microsoft\\Edge\\User Data\\*\\Local Storage\\leveldb\\*.ldb\",",
            "  \"$env:LOCALAPPDATA\\Microsoft\\Edge\\User Data\\*\\Local Storage\\leveldb\\*.log\"",
            ");",
            "$files = Get-ChildItem $patterns -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 20;",
            "$files | Select-String -Pattern 'crate\\.tiktok-row\\.net|CLOUD_JWT_MAP|__cloud_jwt|eyJ[a-zA-Z0-9_-]{8,}\\.[a-zA-Z0-9_-]{20,}\\.[a-zA-Z0-9_-]{10,}' -AllMatches | Select-Object -First 120 | ForEach-Object { $_.Path + '::' + $_.Line }"
        ].join(' ');

        const output = execFileSync('powershell', ['-NoProfile', '-Command', script], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        });

        let best = null;
        const jwtRegex = /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}\b/g;
        for (const line of output.split(/\r?\n/).filter(Boolean)) {
            const [filePath, ...rest] = line.split('::');
            const text = rest.join('::');
            let match;
            while ((match = jwtRegex.exec(text)) !== null) {
                const token = match[0];
                const candidate = scoreTokenCandidate(token, `${filePath} ${text}`);
                if (!candidate) continue;
                if (!best || candidate.score > best.score) {
                    best = { ...candidate, filePath };
                }
            }
        }
        return best;
    } catch {
        return null;
    }
}

function getCrateToken(options = {}) {
    const {
        minRemainingSeconds = 300,
        forceBrowserScan = false,
        persist = true,
        baseDir = process.cwd()
    } = options;

    const envToken = String(process.env.CRATE_TOKEN || '').trim();
    if (!forceBrowserScan && isTokenUsable(envToken, minRemainingSeconds)) {
        return { token: envToken, payload: decodeJwtPayload(envToken), source: 'env' };
    }

    const now = Date.now();
    if (
        !forceBrowserScan &&
        cachedBrowserToken &&
        cachedBrowserPayload &&
        getRemainingSecondsFromPayload(cachedBrowserPayload) > minRemainingSeconds &&
        now - lastBrowserScanAt < 30_000
    ) {
        return { token: cachedBrowserToken, payload: cachedBrowserPayload, source: 'browser-cache' };
    }

    const browserToken = findBestBrowserToken();
    const resolvedBrowserToken = browserToken || findBestBrowserTokenViaPowerShell();
    lastBrowserScanAt = now;
    if (resolvedBrowserToken && getRemainingSecondsFromPayload(resolvedBrowserToken.payload) > 0) {
        cachedBrowserToken = resolvedBrowserToken.token;
        cachedBrowserPayload = resolvedBrowserToken.payload;
        process.env.CRATE_TOKEN = resolvedBrowserToken.token;
        if (persist) updateEnvValue('CRATE_TOKEN', resolvedBrowserToken.token, baseDir);
        return {
            token: resolvedBrowserToken.token,
            payload: resolvedBrowserToken.payload,
            source: `browser:${resolvedBrowserToken.filePath}`
        };
    }

    if (envToken && isCratePassportToken(envToken)) {
        return { token: envToken, payload: decodeJwtPayload(envToken), source: 'env-stale' };
    }

    return null;
}

function getTokenStatus(options = {}) {
    const result = getCrateToken({ minRemainingSeconds: 60, persist: true, ...options });
    const payload = result?.payload || decodeJwtPayload(process.env.CRATE_TOKEN || '');
    const remainingSeconds = getRemainingSecondsFromPayload(payload);
    return {
        hasToken: Boolean(result?.token),
        source: result?.source || 'missing',
        expiresAt: payload?.exp || null,
        remainingSeconds,
        isExpired: typeof remainingSeconds === 'number' ? remainingSeconds <= 0 : true,
        alg: decodeJwtHeader(result?.token || process.env.CRATE_TOKEN || '')?.alg || null,
        iss: payload?.iss || null,
        isPassportToken: isCratePassportToken(result?.token || process.env.CRATE_TOKEN || '')
    };
}

module.exports = {
    DEFAULT_DIRS,
    PROJECT_DIR,
    PROJECT_PATHS,
    buildPromptFromRecord,
    decodeJwtHeader,
    decodeJwtPayload,
    getCrateToken,
    getTokenStatus,
    isCratePassportToken,
    parsePromptRecords,
    resolveProjectPath,
    resolveCsvPath
};
