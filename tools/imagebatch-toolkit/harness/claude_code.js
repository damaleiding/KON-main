const { spawn, spawnSync } = require('child_process');
const { renderConstraintsForPrompt } = require('./constraints');

function resolveClaudeCommand() {
    const candidates = [];
    if (process.platform === 'win32') {
        const whereResult = spawnSync('where.exe', ['claude'], {
            encoding: 'utf8',
            stdio: 'pipe',
            shell: false,
            windowsHide: true
        });
        if (!whereResult.error && whereResult.status === 0) {
            candidates.push(
                ...String(whereResult.stdout || '')
                    .split(/\r?\n/)
                    .map(line => line.trim())
                    .filter(Boolean)
            );
        }
        candidates.push('claude.cmd', 'claude.exe', 'claude');
    } else {
        candidates.push('claude');
    }

    for (const candidate of candidates) {
        const useShell = /\.cmd$/i.test(candidate);
        const probe = spawnSync(candidate, ['--version'], {
            encoding: 'utf8',
            stdio: 'pipe',
            shell: useShell,
            windowsHide: true
        });
        if (!probe.error && probe.status === 0) {
            return candidate;
        }
    }

    return null;
}

function isClaudeCodeAvailable() {
    return Boolean(resolveClaudeCommand());
}

function extractJsonPayload(rawOutput) {
    const trimmed = String(rawOutput || '').trim();
    if (!trimmed) {
        return null;
    }

    const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
    const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace < 0 || lastBrace < firstBrace) {
        return null;
    }

    try {
        return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    } catch {
        return null;
    }
}

function extractStructuredTextPayload(rawOutput) {
    const text = String(rawOutput || '').trim();
    if (!text) {
        return null;
    }

    const statusMatch = text.match(/Status:\s*(pass|warn|fail)/i);
    const summaryMatch = text.match(/Summary:\s*(.+)/i);
    const findingsBlockMatch = text.match(/Findings:\s*([\s\S]*?)(?:Suggested actions:|$)/i);
    const actionsBlockMatch = text.match(/Suggested actions:\s*([\s\S]*)$/i);

    const toBulletList = (block) => String(block || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => /^[-*]/.test(line))
        .map(line => line.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean);

    if (!statusMatch && !summaryMatch && !findingsBlockMatch && !actionsBlockMatch) {
        return null;
    }

    return {
        status: statusMatch ? statusMatch[1].toLowerCase() : 'warn',
        summary: summaryMatch ? summaryMatch[1].trim() : text.split(/\r?\n/)[0].trim(),
        findings: toBulletList(findingsBlockMatch ? findingsBlockMatch[1] : ''),
        suggestedActions: toBulletList(actionsBlockMatch ? actionsBlockMatch[1] : '')
    };
}

function buildClaudeHarnessPrompt({ projectDir, localReport, testReport }) {
    return [
        'Inspect local source files only in',
        projectDir,
        '.',
        'Use CLAUDE.md and harness/constraints.js as hard requirements.',
        'Do not look for git or PRs.',
        `Local verification: ${localReport.status}. ${localReport.summary}`,
        `Node tests: ${testReport.status}. ${testReport.summary}`,
        'Reply in plain text.',
        'Include a line that starts with "Status:" and use pass, warn, or fail.',
        'Include a line that starts with "Summary:".',
        'Then include "Findings:" followed by bullets.',
        'Then include "Suggested actions:" followed by bullets.'
    ].join(' ');
}

function runClaudeCodeHarnessReview({ projectDir, localReport, testReport }) {
    const claudeCommand = resolveClaudeCommand();
    if (!claudeCommand) {
        return Promise.resolve({
            status: 'skipped',
            summary: 'Claude Code CLI is not available on this machine.',
            findings: [],
            suggestedActions: []
        });
    }

    const prompt = buildClaudeHarnessPrompt({ projectDir, localReport, testReport });

    return new Promise((resolve) => {
        const useShell = /\.cmd$/i.test(claudeCommand);
        const child = spawn(claudeCommand, ['-p', prompt], {
            cwd: projectDir,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: useShell,
            windowsHide: true
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
            resolve({
                status: 'warn',
                summary: `Claude Code sub-agent failed to start: ${error.message}`,
                findings: [],
                suggestedActions: [],
                raw: { stdout, stderr }
            });
        });
        child.on('close', (status) => {
            const parsed = extractJsonPayload(stdout);
            const structured = parsed || extractStructuredTextPayload(stdout);
            if (structured) {
                resolve({
                    status: structured.status || (status === 0 ? 'pass' : 'warn'),
                    summary: structured.summary || 'Claude Code review completed.',
                    findings: Array.isArray(structured.findings) ? structured.findings : [],
                    suggestedActions: Array.isArray(structured.suggestedActions) ? structured.suggestedActions : [],
                    raw: { stdout, stderr }
                });
                return;
            }

            resolve({
                status: status === 0 ? 'warn' : 'fail',
                summary: status === 0
                    ? 'Claude Code returned a non-JSON response.'
                    : `Claude Code exited with status ${status}.`,
                findings: stderr.trim() ? [stderr.trim()] : [],
                suggestedActions: [],
                raw: { stdout, stderr }
            });
        });
    });
}

module.exports = {
    isClaudeCodeAvailable,
    runClaudeCodeHarnessReview
};
