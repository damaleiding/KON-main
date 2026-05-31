const path = require('path');
const {
    buildOutputFilename,
    buildResolutionTag,
    buildRoundInputFilename,
    formatHarnessTimestamp,
    inferOutputNamingContext,
    isOutputFilenameCompliant,
    parseOutputFilename,
    sanitizeSegment
} = require('./naming');
const { HARNESS_CONSTRAINTS, renderConstraintsForPrompt } = require('./constraints');
const { isClaudeCodeAvailable, runClaudeCodeHarnessReview } = require('./claude_code');

const PROJECT_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_DIR, 'output_images');

const HARNESS_PATHS = {
    rootDir: __dirname,
    runnerScript: path.join(__dirname, 'run.js'),
    statusFile: path.join(OUTPUT_DIR, 'harness_status.json'),
    reportFile: path.join(OUTPUT_DIR, 'harness_report.json')
};

module.exports = {
    HARNESS_CONSTRAINTS,
    HARNESS_PATHS,
    buildOutputFilename,
    buildResolutionTag,
    buildRoundInputFilename,
    formatHarnessTimestamp,
    inferOutputNamingContext,
    isClaudeCodeAvailable,
    isOutputFilenameCompliant,
    parseOutputFilename,
    renderConstraintsForPrompt,
    runClaudeCodeHarnessReview,
    sanitizeSegment
};
