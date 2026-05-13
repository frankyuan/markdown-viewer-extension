const IMAGE_EXTENSION_RE = /\.(apng|avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i;

export const OBSIDIAN_ATTACHMENT_FOLDER_STORAGE_KEY = 'obsidianAttachmentFolder';

interface FenceMarker {
  char: '`' | '~';
  length: number;
}

export function normalizeObsidianAttachmentFolder(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

export function readObsidianAttachmentFolderSetting(): Promise<string> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([OBSIDIAN_ATTACHMENT_FOLDER_STORAGE_KEY], (result) => {
        if (chrome.runtime.lastError) {
          resolve('');
          return;
        }
        resolve(normalizeObsidianAttachmentFolder(result?.[OBSIDIAN_ATTACHMENT_FOLDER_STORAGE_KEY]));
      });
    } catch {
      resolve('');
    }
  });
}

export function writeObsidianAttachmentFolderSetting(value: string): Promise<string> {
  const normalized = normalizeObsidianAttachmentFolder(value);

  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [OBSIDIAN_ATTACHMENT_FOLDER_STORAGE_KEY]: normalized }, () => {
        resolve(normalized);
      });
    } catch {
      resolve(normalized);
    }
  });
}

export function rewriteObsidianAttachmentImagePaths(
  markdown: string,
  documentUrl: string,
  folderTemplate: string
): string {
  const template = normalizeObsidianAttachmentFolder(folderTemplate);
  if (!markdown || !template) {
    return markdown;
  }

  const noteFileName = getNoteFileName(documentUrl);
  if (!noteFileName) {
    return markdown;
  }

  const folder = expandAttachmentFolderTemplate(template, noteFileName);
  if (!folder) {
    return markdown;
  }

  const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
  const hasTrailingNewline = markdown.endsWith('\n');
  const lines = markdown.split(/\r?\n/);
  let activeFence: FenceMarker | null = null;

  const rewritten = lines.map((line) => {
    const fence = parseFenceMarker(line);
    if (fence) {
      if (!activeFence) {
        activeFence = fence;
      } else if (activeFence.char === fence.char && fence.length >= activeFence.length) {
        activeFence = null;
      }
      return line;
    }

    if (activeFence) {
      return line;
    }

    return rewriteOutsideInlineCode(line, (segment) => {
      const withWikiEmbeds = rewriteWikiImageEmbeds(segment, folder);
      return rewriteMarkdownImages(withWikiEmbeds, folder);
    });
  }).join(newline);

  return hasTrailingNewline && !rewritten.endsWith(newline)
    ? rewritten + newline
    : rewritten;
}

function getNoteFileName(documentUrl: string): string {
  let fileName = '';

  try {
    const parsed = new URL(documentUrl);
    fileName = parsed.pathname.split('/').pop() || '';
  } catch {
    fileName = documentUrl.replace(/\\/g, '/').split('/').pop() || '';
  }

  try {
    fileName = decodeURIComponent(fileName);
  } catch {
    // Keep the original filename if URL decoding fails.
  }

  return fileName.replace(/\.(md|markdown)$/i, '').trim();
}

function expandAttachmentFolderTemplate(template: string, noteFileName: string): string {
  return normalizeObsidianAttachmentFolder(
    template.replace(/\$\{noteFileName\}/g, noteFileName)
  );
}

function parseFenceMarker(line: string): FenceMarker | null {
  const match = line.match(/^(?: {0,3})(`{3,}|~{3,})/);
  if (!match) {
    return null;
  }

  const marker = match[1];
  const char = marker[0];
  if (char !== '`' && char !== '~') {
    return null;
  }

  return { char, length: marker.length };
}

function rewriteOutsideInlineCode(line: string, rewriteSegment: (segment: string) => string): string {
  let output = '';
  let index = 0;

  while (index < line.length) {
    if (line[index] === '`') {
      const tickCount = countRun(line, index, '`');
      const marker = '`'.repeat(tickCount);
      const closingIndex = line.indexOf(marker, index + tickCount);
      if (closingIndex === -1) {
        output += line.slice(index);
        break;
      }

      output += line.slice(index, closingIndex + tickCount);
      index = closingIndex + tickCount;
      continue;
    }

    const nextCodeIndex = line.indexOf('`', index);
    const segmentEnd = nextCodeIndex === -1 ? line.length : nextCodeIndex;
    output += rewriteSegment(line.slice(index, segmentEnd));
    index = segmentEnd;
  }

  return output;
}

function rewriteWikiImageEmbeds(segment: string, folder: string): string {
  let output = '';
  let index = 0;

  while (index < segment.length) {
    if (segment.startsWith('![[', index)) {
      const closingIndex = segment.indexOf(']]', index + 3);
      if (closingIndex !== -1) {
        const content = segment.slice(index + 3, closingIndex);
        output += `![[${rewriteWikiImageEmbedContent(content, folder)}]]`;
        index = closingIndex + 2;
        continue;
      }
    }

    output += segment[index];
    index += 1;
  }

  return output;
}

function rewriteWikiImageEmbedContent(content: string, folder: string): string {
  const pipeIndex = content.indexOf('|');
  const linkPart = pipeIndex === -1 ? content : content.slice(0, pipeIndex);
  const detailPart = pipeIndex === -1 ? '' : content.slice(pipeIndex);
  const rewrittenPath = rewriteBareImagePath(linkPart.trim(), folder);

  return rewrittenPath ? `${rewrittenPath}${detailPart}` : content;
}

function rewriteMarkdownImages(segment: string, folder: string): string {
  let output = '';
  let index = 0;

  while (index < segment.length) {
    if (segment.startsWith('![', index)) {
      const altEnd = findClosingBracket(segment, index + 2);
      if (altEnd !== -1 && segment[altEnd + 1] === '(') {
        const destinationStart = altEnd + 2;
        const destinationEnd = findClosingParen(segment, destinationStart);
        if (destinationEnd !== -1) {
          const destination = segment.slice(destinationStart, destinationEnd);
          const rewrittenDestination = rewriteMarkdownImageDestination(destination, folder);
          output += segment.slice(index, destinationStart);
          output += rewrittenDestination ?? destination;
          output += ')';
          index = destinationEnd + 1;
          continue;
        }
      }
    }

    output += segment[index];
    index += 1;
  }

  return output;
}

function rewriteMarkdownImageDestination(destination: string, folder: string): string | null {
  const leadingWhitespace = destination.match(/^\s*/)?.[0] ?? '';
  const trailingWhitespace = destination.match(/\s*$/)?.[0] ?? '';
  const trimmed = destination.trim();
  if (!trimmed) {
    return null;
  }

  const directRewrite = rewriteBareImagePath(unwrapMarkdownAngleDestination(trimmed), folder);
  if (directRewrite) {
    return `${leadingWhitespace}${formatMarkdownDestination(directRewrite)}${trailingWhitespace}`;
  }

  let imagePath = '';
  let suffix = '';

  if (trimmed.startsWith('<')) {
    const closeIndex = findUnescapedAngleClose(trimmed, 1);
    if (closeIndex === -1) {
      return null;
    }
    imagePath = trimmed.slice(1, closeIndex);
    suffix = trimmed.slice(closeIndex + 1);
  } else {
    const match = trimmed.match(/^(\S+)([\s\S]*)$/);
    if (!match) {
      return null;
    }
    imagePath = match[1];
    suffix = match[2] || '';
  }

  const rewrittenPath = rewriteBareImagePath(imagePath, folder);
  if (!rewrittenPath) {
    return null;
  }

  return `${leadingWhitespace}${formatMarkdownDestination(rewrittenPath)}${suffix}${trailingWhitespace}`;
}

function rewriteBareImagePath(rawPath: string, folder: string): string | null {
  const path = rawPath.trim().replace(/\\/g, '/');
  if (!path || isSpecialUrl(path)) {
    return null;
  }

  const { pathPart, suffix } = splitPathSuffix(path);
  const fileName = pathPart.replace(/^\.\/+/, '');
  if (
    !fileName ||
    fileName.startsWith('../') ||
    fileName.startsWith('/') ||
    fileName.includes('/')
  ) {
    return null;
  }

  if (!IMAGE_EXTENSION_RE.test(fileName)) {
    return null;
  }

  return ensureRelativePath(`${folder}/${fileName}${suffix}`);
}

function splitPathSuffix(path: string): { pathPart: string; suffix: string } {
  const match = path.match(/^([^?#]+)([?#].*)?$/);
  if (!match) {
    return { pathPart: path, suffix: '' };
  }
  return {
    pathPart: match[1],
    suffix: match[2] || '',
  };
}

function ensureRelativePath(path: string): string {
  if (path.startsWith('./') || path.startsWith('../')) {
    return path;
  }
  return `./${path}`;
}

function isSpecialUrl(path: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(path);
}

function unwrapMarkdownAngleDestination(destination: string): string {
  if (!destination.startsWith('<') || !destination.endsWith('>')) {
    return destination;
  }
  return destination.slice(1, -1);
}

function formatMarkdownDestination(path: string): string {
  if (!/[\s()<>]/.test(path)) {
    return path;
  }

  return `<${path.replace(/[<>]/g, (char) => char === '<' ? '%3C' : '%3E')}>`;
}

function findClosingBracket(text: string, start: number): number {
  let escaped = false;
  let depth = 0;

  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '[') {
      depth += 1;
      continue;
    }
    if (char === ']') {
      if (depth === 0) {
        return index;
      }
      depth -= 1;
    }
  }

  return -1;
}

function findClosingParen(text: string, start: number): number {
  let escaped = false;
  let inAngle = false;
  let depth = 0;

  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '<' && !inAngle) {
      inAngle = true;
      continue;
    }
    if (char === '>' && inAngle) {
      inAngle = false;
      continue;
    }
    if (inAngle) {
      continue;
    }
    if (char === '(') {
      depth += 1;
      continue;
    }
    if (char === ')') {
      if (depth === 0) {
        return index;
      }
      depth -= 1;
    }
  }

  return -1;
}

function findUnescapedAngleClose(text: string, start: number): number {
  let escaped = false;

  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '>') {
      return index;
    }
  }

  return -1;
}

function countRun(text: string, start: number, char: string): number {
  let count = 0;
  while (text[start + count] === char) {
    count += 1;
  }
  return count;
}
