const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { PROJECT_DIR } = require('../runtime_config');
const {
    HARNESS_PATHS,
    isOutputFilenameCompliant,
    parseOutputFilename,
    runClaudeCodeHarnessReview
} = require('./index');

const OUTPUT_DIR = path.join(PROJECT_DIR, 'output_images');
const GALLERY_DATA_PATH = path.join(OUTPUT_DIR, 'gallery_data.js');
const GENERATOR_SCRIPT = path.join(PROJECT_DIR, 'batch_process.mjs');

function ensureHarnessFiles() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function readGalleryData() {
    if (!fs.existsSync(GALLERY_DATA_PATH)) {
        return [];
    }

    try {
        const content = fs.readFileSync(GALLERY_DATA_PATH, 'utf8');
        return JSON.parse(content.replace('window.galleryData = ', '').replace(/;$/, ''));
    } catch {
        return [];
    }
}

function writeJson(filePath, payload) {
    ensureHarnessFiles();
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function writeHarnessStatus(phase, extra = {}) {
    writeJson(HARNESS_PATHS.statusFile, {
        phase,
        updatedAt: new Date().toISOString(),
        ...extra
    });
}

function runProcess(command, args, options = {}) {
    return new Promise((resolve) => {
        const child = spawn(command, args, {
            cwd: PROJECT_DIR,
            stdio: 'pipe',
            shell: false,
            windowsHide: true,
            env: { ...process.env, ...(options.env || {}) }
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', chunk => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', chunk => {
            stderr += chunk.toString();
        });
        child.on('error', error => {
            resolve({ status: null, stdout, stderr, error });
        });
        child.on('close', status => {
            resolve({ status, stdout, stderr, error: null });
        });
    });
}

function summarizeLocalVerification() {
    const galleryEntries = readGalleryData();
    const invalidEntries = [];
    const missingFiles = [];

    for (const entry of galleryEntries) {
        const storedPath = String(entry?.path || '').replace(/^\/+/, '').replace(/\\/g, '/');
        const fileName = path.basename(storedPath);
        const absolutePath = storedPath ? path.resolve(PROJECT_DIR, storedPath) : '';

        if (!storedPath || !isOutputFilenameCompliant(fileName)) {
            invalidEntries.push({
                name: entry?.name || '',
                path: storedPath,
                fileName
            });
        }

        if (absolutePath && !fs.existsSync(absolutePath)) {
            missingFiles.push({
                name: entry?.name || '',
                path: storedPath,
                fileName
            });
        }
    }

    return {
        status: missingFiles.length > 0 ? 'fail' : (invalidEntries.length > 0 ? 'warn' : 'pass'),
        summary: missingFiles.length > 0
            ? `Found ${missingFiles.length} gallery entries whose files are missing.`
            : (invalidEntries.length > 0
                ? `Found ${invalidEntries.length} gallery entries that do not follow the harness filename contract.`
                : 'All gallery entries match the harness filename contract.'),
        totals: {
            galleryEntries: galleryEntries.length,
            compliantNames: galleryEntries.length - invalidEntries.length,
            invalidNames: invalidEntries.length,
            missingFiles: missingFiles.length
        },
        samples: {
            invalidEntries: invalidEntries.slice(0, 10),
            missingFiles: missingFiles.slice(0, 10),
            parsedNames: galleryEntries
                .map(entry => parseOutputFilename(path.basename(String(entry?.path || ''))))
                .filter(Boolean)
                .slice(-10)
        }
    };
}

async function runNodeTests() {
    const testsDir = path.join(PROJECT_DIR, 'tests');
    if (!fs.existsSync(testsDir)) {
        return {
            status: 'skipped',
            summary: 'No tests directory found.',
            command: null,
            exitCode: null,
            output: ''
        };
    }

    const testFiles = fs.readdirSync(testsDir)
        .filter(name => name.endsWith('.test.js'))
        .map(name => path.join(testsDir, name));

    if (testFiles.length === 0) {
        return {
            status: 'skipped',
            summary: 'No Node test files were found.',
            command: null,
            exitCode: null,
            output: ''
        };
    }

    const result = await runProcess(process.execPath, ['--test', ...testFiles]);
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();

    return {
        status: result.error ? 'fail' : (result.status === 0 ? 'pass' : 'fail'),
        summary: result.error
            ? `Node tests failed to start: ${result.error.message}`
            : (result.status === 0 ? 'Node tests passed.' : `Node tests exited with status ${result.status}.`),
        command: [process.execPath, '--test', ...testFiles.map(file => path.relative(PROJECT_DIR, file))].join(' '),
        exitCode: result.status,
        output: output.slice(-4000)
    };
}

function resolveOverallStatus(localStatus, testStatus, claudeStatus) {
    if ([localStatus, testStatus, claudeStatus].includes('fail')) {
        return 'fail';
    }
    if ([localStatus, testStatus, claudeStatus].includes('warn')) {
        return 'warn';
    }
    if ([localStatus, testStatus].every(status => status === 'skipped') && claudeStatus === 'skipped') {
        return 'skipped';
    }
    return 'pass';
}

async function runVerification(trigger = 'manual') {
    writeHarnessStatus('verifying', { trigger });
    const localReport = summarizeLocalVerification();
    const testReport = await runNodeTests();
    const claudeReport = await runClaudeCodeHarnessReview({
        projectDir: PROJECT_DIR,
        localReport,
        testReport
    });

    const report = {
        trigger,
        updatedAt: new Date().toISOString(),
        overallStatus: resolveOverallStatus(localReport.status, testReport.status, claudeReport.status),
        localReport,
        testReport,
        claudeReport
    };
    writeJson(HARNESS_PATHS.reportFile, report);
    writeHarnessStatus('idle', {
        trigger,
        overallStatus: report.overallStatus,
        summary: report.localReport.summary
    });
    return report;
}

async function runBatchHarness() {
    writeHarnessStatus('batch-running', {
        trigger: 'batch',
        batchScript: path.relative(PROJECT_DIR, GENERATOR_SCRIPT)
    });

    const batchResult = await runProcess(process.execPath, [GENERATOR_SCRIPT], {
        env: process.env
    });

    const verificationReport = await runVerification('post-batch');
    writeHarnessStatus('idle', {
        trigger: 'post-batch',
        batchExitCode: batchResult.status,
        overallStatus: verificationReport.overallStatus,
        summary: verificationReport.localReport.summary
    });

    if (batchResult.error) {
        process.exitCode = 1;
        return;
    }

    process.exitCode = batchResult.status || 0;
}

async function main() {
    const mode = String(process.argv[2] || 'batch').toLowerCase();
    ensureHarnessFiles();

    if (mode === 'verify') {
        const report = await runVerification('manual');
        process.stdout.write(JSON.stringify(report, null, 2));
        return;
    }

    await runBatchHarness();
}

main().catch(error => {
    writeHarnessStatus('error', {
        summary: error.message
    });
    process.exitCode = 1;
});
