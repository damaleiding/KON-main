function createDocFromContent() {
  assertContent_();

  const doc = DocumentApp.create(CONTENT_TITLE);
  writeMarkdownToBody_(doc.getBody(), CONTENT_MD);
  doc.saveAndClose();

  const result = {
    documentId: doc.getId(),
    url: doc.getUrl(),
    title: CONTENT_TITLE
  };
  console.log(JSON.stringify(result));
  return result;
}

function setTargetDocumentId(documentId) {
  if (!documentId) {
    throw new Error('documentId is required.');
  }
  PropertiesService.getScriptProperties().setProperty('TARGET_DOCUMENT_ID', documentId);
  return { documentId };
}

function overwriteConfiguredDoc() {
  const documentId = PropertiesService.getScriptProperties().getProperty('TARGET_DOCUMENT_ID');
  if (!documentId) {
    throw new Error('TARGET_DOCUMENT_ID is not set. Run setTargetDocumentId first.');
  }
  return overwriteDocFromContent(documentId);
}

function overwriteDocFromContent(documentId) {
  assertContent_();

  const doc = DocumentApp.openById(documentId);
  const body = doc.getBody();
  body.clear();
  writeMarkdownToBody_(body, CONTENT_MD);
  doc.saveAndClose();

  const result = {
    documentId: doc.getId(),
    url: doc.getUrl(),
    title: doc.getName()
  };
  console.log(JSON.stringify(result));
  return result;
}

function writeMarkdownToBody_(body, markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let pendingParagraph = [];

  for (const line of lines) {
    if (/^\s*$/.test(line)) {
      flushParagraph_(body, pendingParagraph);
      pendingParagraph = [];
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph_(body, pendingParagraph);
      pendingParagraph = [];
      appendHeading_(body, heading[2], heading[1].length);
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      flushParagraph_(body, pendingParagraph);
      pendingParagraph = [];
      body.appendHorizontalRule();
      continue;
    }

    pendingParagraph.push(line);
  }

  flushParagraph_(body, pendingParagraph);
}

function appendHeading_(body, text, level) {
  const paragraph = body.appendParagraph(text);
  const headings = [
    DocumentApp.ParagraphHeading.HEADING1,
    DocumentApp.ParagraphHeading.HEADING2,
    DocumentApp.ParagraphHeading.HEADING3,
    DocumentApp.ParagraphHeading.HEADING4,
    DocumentApp.ParagraphHeading.HEADING5,
    DocumentApp.ParagraphHeading.HEADING6
  ];
  paragraph.setHeading(headings[Math.min(level, 6) - 1]);
}

function flushParagraph_(body, lines) {
  if (!lines.length) {
    return;
  }

  const text = lines.join('\n').replace(/^>\s?/gm, '');
  body.appendParagraph(text);
}

function assertContent_() {
  if (typeof CONTENT_MD === 'undefined' || !CONTENT_MD) {
    throw new Error('CONTENT_MD is missing. Run build-content.ps1 before clasp push.');
  }
  if (typeof CONTENT_TITLE === 'undefined' || !CONTENT_TITLE) {
    throw new Error('CONTENT_TITLE is missing. Run build-content.ps1 before clasp push.');
  }
}
