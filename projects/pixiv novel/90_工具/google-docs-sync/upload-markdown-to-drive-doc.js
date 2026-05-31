const fs = require('fs');
const path = require('path');

const args = parseArgs(process.argv.slice(2));

async function main() {
  const source = requiredArg('source');
  const title = requiredArg('title');
  const mode = args.mode || 'create';
  const statePath = args.state;
  const claspHome = args.claspHome || process.env.HOME || process.env.USERPROFILE;
  const paragraphMode = args.paragraphMode || args['paragraph-mode'] || 'loose';

  if (!claspHome) {
    throw new Error('Missing clasp home. Set --clasp-home or HOME/USERPROFILE.');
  }

  const token = readClaspToken(claspHome);
  const accessToken = await refreshAccessToken(token);
  const markdown = fs.readFileSync(source, 'utf8');
  const html = markdownToHtml(markdown, title, { paragraphMode });

  let result;
  if (mode === 'update') {
    const documentId = args.documentId || readState(statePath).documentId;
    if (!documentId) {
      throw new Error('Missing document id for update mode.');
    }
    result = await uploadDoc(accessToken, title, html, documentId);
  } else if (mode === 'create') {
    result = await uploadDoc(accessToken, title, html);
  } else {
    throw new Error(`Unsupported mode: ${mode}`);
  }

  if (statePath) {
    writeState(statePath, {
      documentId: result.id,
      name: result.name,
      webViewLink: result.webViewLink,
      mode,
      paragraphMode,
      updatedAt: new Date().toISOString()
    });
  }

  console.log(JSON.stringify({
    documentId: result.id,
    name: result.name,
    webViewLink: result.webViewLink,
    mode,
    paragraphMode
  }, null, 2));
}

function requiredArg(name) {
  if (!args[name]) {
    throw new Error(`Missing required argument --${name}`);
  }
  return args[name];
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i++) {
    const current = argv[i];
    if (!current.startsWith('--')) {
      continue;
    }
    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      i++;
    }
  }
  return parsed;
}

function readClaspToken(claspHome) {
  const rcPath = path.join(claspHome, '.clasprc.json');
  const rc = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
  const token = rc.tokens && rc.tokens.default;
  if (!token || !token.refresh_token || !token.client_id || !token.client_secret) {
    throw new Error(`Invalid clasp token file: ${rcPath}`);
  }
  return token;
}

async function refreshAccessToken(token) {
  const body = new URLSearchParams({
    client_id: token.client_id,
    client_secret: token.client_secret,
    refresh_token: token.refresh_token,
    grant_type: 'refresh_token'
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!response.ok) {
    throw new Error(`OAuth refresh failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('OAuth refresh response did not include access_token.');
  }
  return data.access_token;
}

async function uploadDoc(accessToken, title, html, documentId) {
  const boundary = `kva_docs_sync_${Date.now()}`;
  const metadata = {
    name: title,
    mimeType: 'application/vnd.google-apps.document'
  };

  const multipartBody = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
    `--${boundary}--`,
    ''
  ].join('\r\n');

  const baseUrl = documentId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(documentId)}`
    : 'https://www.googleapis.com/upload/drive/v3/files';
  const url = `${baseUrl}?uploadType=multipart&fields=id,name,webViewLink`;
  const method = documentId ? 'PATCH' : 'POST';

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartBody
  });

  if (!response.ok) {
    throw new Error(`Drive upload failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

function markdownToHtml(markdown, title, options = {}) {
  const paragraphMode = options.paragraphMode || 'loose';
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    '<style>',
    'body { font-family: "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; line-height: 1.65; }',
    'h1, h2, h3, h4, h5, h6 { margin-top: 18pt; margin-bottom: 10pt; }',
    'p { margin: 0 0 10pt 0; }',
    'hr { margin: 18pt 0; }',
    '</style>',
    '</head>',
    '<body>'
  ];
  let paragraph = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushParagraph(html, paragraph, paragraphMode);
      paragraph = [];
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph(html, paragraph, paragraphMode);
      paragraph = [];
      const level = Math.min(heading[1].length, 6);
      html.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      flushParagraph(html, paragraph, paragraphMode);
      paragraph = [];
      html.push('<hr>');
      continue;
    }

    const contentLine = line.replace(/^>\s?/, '');
    if (paragraphMode === 'loose') {
      flushParagraph(html, paragraph, paragraphMode);
      paragraph = [];
      flushParagraph(html, [contentLine], paragraphMode);
    } else {
      paragraph.push(contentLine);
    }
  }

  flushParagraph(html, paragraph, paragraphMode);
  html.push('</body>', '</html>');
  return html.join('\n');
}

function flushParagraph(html, paragraph, paragraphMode = 'loose') {
  if (!paragraph.length) {
    return;
  }
  const text = paragraph.join('\n');
  const chunks = paragraphMode === 'loose' ? splitLooseParagraph(text) : [text];
  for (const chunk of chunks) {
    if (chunk.trim()) {
      html.push(`<p>${escapeHtml(chunk).replace(/\n/g, '<br>')}</p>`);
    }
  }
}

function splitLooseParagraph(text) {
  const normalized = text.trim();
  if (normalized.length <= 180) {
    return [normalized];
  }

  const sentences = normalized.match(/[^。！？；……]+[。！？；……」』”）)]*|.+$/g) || [normalized];
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    const next = current ? `${current}${sentence}` : sentence;
    if (current && next.length > 140) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = next;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }
  return chunks.length ? chunks : [normalized];
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readState(statePath) {
  if (!statePath || !fs.existsSync(statePath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function writeState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
