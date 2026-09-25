import { describe, expect, it } from 'vitest';

import { CHUNKING, chunkMarkdown, estimateTokens } from './chunker.js';

const MAX_CHARS = CHUNKING.maxTokens * 4;

/** Words of `text`, for "nothing was lost" checks that ignore whitespace and prefixes. */
const words = (text: string) => text.split(/\s+/).filter(Boolean);

function sentences(count: number, prefix = 'Sentence'): string {
  return Array.from(
    { length: count },
    (_, i) => `${prefix} number ${i} explains one small fact.`,
  ).join(' ');
}

describe('chunkMarkdown', () => {
  it('returns nothing for empty or blank content', () => {
    expect(chunkMarkdown('')).toEqual([]);
    expect(chunkMarkdown('  \n\n \r\n')).toEqual([]);
  });

  it('keeps a short plain-text document in one chunk', () => {
    expect(chunkMarkdown('Just a note.\n\nWith two paragraphs.')).toEqual([
      'Just a note.\n\nWith two paragraphs.',
    ]);
  });

  it('starts a chunk per section and prefixes the heading path', () => {
    const chunks = chunkMarkdown(
      [
        'Intro before any heading.',
        '# Guide',
        'Guide overview.',
        '## Install',
        'Run the installer.',
        '### Linux',
        'Use the package manager.',
        '## Configure',
        'Edit the config file.',
      ].join('\n'),
    );
    expect(chunks).toEqual([
      'Intro before any heading.',
      'Guide\n\nGuide overview.',
      'Guide > Install\n\nRun the installer.',
      'Guide > Install > Linux\n\nUse the package manager.',
      'Guide > Configure\n\nEdit the config file.',
    ]);
  });

  it('handles skipped heading levels when building the path', () => {
    const chunks = chunkMarkdown('# A\n### C\nunder c\n### E\nunder e\n## D\nunder d');
    expect(chunks).toEqual(['A > C\n\nunder c', 'A > E\n\nunder e', 'A > D\n\nunder d']);
  });

  it('does not treat "#" inside a code fence as a heading or split the fence', () => {
    const markdown = '# Script\n```bash\n# install deps\n\npnpm install\n```\nDone.';
    expect(chunkMarkdown(markdown)).toEqual([
      'Script\n\n```bash\n# install deps\n\npnpm install\n```\n\nDone.',
    ]);
  });

  it('packs paragraphs up to the budget and carries a small overlap forward', () => {
    const paragraphs = Array.from({ length: 12 }, (_, i) => sentences(8, `P${i}`));
    const chunks = chunkMarkdown(`# Long\n${paragraphs.join('\n\n')}`);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.startsWith('Long\n\n')).toBe(true);
      expect(chunk.length).toBeLessThanOrEqual(MAX_CHARS);
    }
    // Each later chunk begins with the end of the previous one.
    for (let i = 1; i < chunks.length; i++) {
      const firstLine = chunks[i]!.slice('Long\n\n'.length).split('\n\n')[0]!;
      expect(chunks[i - 1]).toContain(firstLine);
    }
    // Every paragraph survives in some chunk.
    for (const paragraph of paragraphs) {
      expect(chunks.some((chunk) => chunk.includes(paragraph))).toBe(true);
    }
  });

  it('splits an oversized paragraph at sentence boundaries without losing text', () => {
    const paragraph = sentences(200); // ~9,000 characters, far above one chunk
    const chunks = chunkMarkdown(paragraph);

    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(MAX_CHARS);
      expect(chunk).toMatch(/fact\.$/); // ends on a sentence boundary
    }
    const covered = new Set(chunks.flatMap(words));
    expect(words(paragraph).every((word) => covered.has(word))).toBe(true);
  });

  it('falls back to a hard split for a single enormous token', () => {
    const blob = 'x'.repeat(MAX_CHARS * 2 + 10);
    const chunks = chunkMarkdown(blob);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(MAX_CHARS);
    expect(chunks.join('').replace(/\s/g, '').length).toBeGreaterThanOrEqual(blob.length);
  });

  it('keeps heading-only content, but not a parent heading that its children repeat', () => {
    expect(chunkMarkdown('# Only a title\n## And a subtitle')).toEqual([
      'Only a title > And a subtitle',
    ]);
    expect(chunkMarkdown('# A\n## B\ntext\n## C')).toEqual(['A > B\n\ntext', 'A > C']);
  });

  it('bounds a huge heading so every chunk stays within the budget', () => {
    const chunks = chunkMarkdown(`# ${'h'.repeat(10_000)}\n${sentences(20)}`);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(MAX_CHARS);
    expect(chunks[0]).toMatch(/^h{299}…\n\nSentence number 0/);
  });

  it('normalises Windows line endings', () => {
    expect(chunkMarkdown('# T\r\nline one\r\n\r\nline two')).toEqual(['T\n\nline one\n\nline two']);
  });
});

describe('estimateTokens', () => {
  it('estimates ~4 characters per token', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});
