const HARNESS_CONSTRAINTS = [
    {
        id: 'preserve-web-flow',
        title: 'Preserve existing dashboard flow',
        description: 'The dashboard remains the primary interaction surface. Harness changes should wrap server.js and batch_process.mjs instead of replacing them.'
    },
    {
        id: 'round-path-safety',
        title: 'Keep round path safety guards',
        description: 'All input sub-directories must stay relative to the project root and must continue to reject absolute paths or parent traversal.'
    },
    {
        id: 'provider-routing',
        title: 'Keep provider routing stable',
        description: 'Modules imply imagine-based processing, while Crate stays available as the fallback provider path.'
    },
    {
        id: 'crate-token-source',
        title: 'Honor Crate token acquisition rules',
        description: 'Crate token resolution should still prefer a valid environment token and then fall back to browser-backed discovery.'
    },
    {
        id: 'imagine-auth',
        title: 'Require imagine auth state',
        description: 'Imagine CLI tasks must validate login state before generation and should report actionable auth failures.'
    },
    {
        id: 'reference-size-limit',
        title: 'Respect reference image size limit',
        description: 'Images promoted into later rounds must remain within the existing reference size budget after compression.'
    },
    {
        id: 'retry-consistency',
        title: 'Retry only homogeneous failed groups',
        description: 'Failed task retry should continue to enforce same-round and same-input-pool consistency.'
    },
    {
        id: 'naming-contract',
        title: 'Use harness naming contract',
        description: 'Generated result images must encode model, resolution, module, round, version, and timestamp with the harness naming format.'
    },
    {
        id: 'claude-subagent',
        title: 'Use Claude Code as harness reviewer',
        description: 'Harness verification should run local checks first and then, when available, call Claude Code as a sub-agent for functional review and test feedback.'
    }
];

function renderConstraintsForPrompt() {
    return HARNESS_CONSTRAINTS.map((constraint, index) =>
        `${index + 1}. [${constraint.id}] ${constraint.title}: ${constraint.description}`
    ).join('\n');
}

module.exports = {
    HARNESS_CONSTRAINTS,
    renderConstraintsForPrompt
};
