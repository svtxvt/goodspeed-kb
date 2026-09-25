// Markdown-aware chunking: split into sections by heading, pack paragraphs
// into chunks of up to ~800 tokens, and prefix every chunk with its heading
// path so a chunk still makes sense on its own ("Setup > Docker").

export const CHUNKING = {
  maxTokens: 800,
  /** Modest overlap (~12%) so a fact split across two chunks survives in one of them. */
  overlapTokens: 100,
} as const;

/**
 * An ESTIMATE (~4 characters per token for English prose). Tokenizers differ
 * per provider, so the budgets below keep a safety margin instead of pretending
 * to be exact.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface Section {
  headingPath: string[];
  blocks: string[];
}

/** Splits markdown into sections; blocks are paragraphs, lists or whole code fences. */
function parseSections(markdown: string): Section[] {
  const sections: Section[] = [];
  const headings: { level: number; text: string }[] = [];
  let section: Section = { headingPath: [], blocks: [] };
  let block: string[] = [];
  let fence: string | null = null;

  const flushBlock = () => {
    const text = block.join('\n').trim();
    if (text) section.blocks.push(text);
    block = [];
  };
  const flushSection = () => {
    flushBlock();
    if (section.blocks.length > 0) sections.push(section);
  };

  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const fenceMarker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (fenceMarker && (!fence || fenceMarker.startsWith(fence))) {
      if (fence) {
        block.push(line);
        flushBlock(); // the code block ends here
        fence = null;
      } else {
        flushBlock(); // the code block starts a new block
        block.push(line);
        fence = fenceMarker;
      }
      continue;
    }
    if (fence) {
      block.push(line); // a code block is never split on blank lines or "#" comments
      continue;
    }

    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      flushSection();
      const level = heading[1]!.length;
      while (headings.length > 0 && headings.at(-1)!.level >= level) headings.pop();
      headings.push({ level, text: heading[2]! });
      section = { headingPath: headings.map((h) => h.text).filter(Boolean), blocks: [] };
      continue;
    }

    if (line.trim() === '') flushBlock();
    else block.push(line);
  }
  flushSection();
  return sections;
}

/** Greedily concatenates units into strings of at most `max` characters. */
function pack(units: string[], max: number): string[] {
  const out: string[] = [];
  let current = '';
  for (const unit of units) {
    if (current && current.length + unit.length > max) {
      out.push(current);
      current = '';
    }
    current += unit;
  }
  if (current) out.push(current);
  return out.map((text) => text.trim()).filter(Boolean);
}

/** Fallback for a paragraph larger than a chunk: sentences, then words, then characters. */
function splitOversized(text: string, max: number): string[] {
  const sentences = text.match(/[^.!?\n]+(?:[.!?]+\s*|\n+|$)/g) ?? [text];
  const units = sentences.flatMap((sentence) => {
    if (sentence.length <= max) return [sentence];
    return sentence.split(/(?<=\s)/).flatMap((word) => {
      if (word.length <= max) return [word];
      const pieces: string[] = [];
      for (let i = 0; i < word.length; i += max) pieces.push(word.slice(i, i + max));
      return pieces;
    });
  });
  return pack(units, max);
}

/** The end of a chunk, starting at a sentence (or at least a word) boundary. */
function tail(text: string, maxChars: number): string {
  if (maxChars <= 0) return '';
  const slice = text.slice(-maxChars);
  const sentenceStart = slice.search(/[.!?]\s+\S/);
  if (sentenceStart >= 0 && sentenceStart < slice.length / 2) {
    return slice.slice(sentenceStart + 1).trim();
  }
  const wordStart = slice.search(/\s/);
  return (wordStart >= 0 ? slice.slice(wordStart) : slice).trim();
}

export function chunkMarkdown(
  markdown: string,
  options: { maxTokens: number; overlapTokens: number } = CHUNKING,
): string[] {
  const maxChars = options.maxTokens * 4;
  const overlapChars = options.overlapTokens * 4;
  const chunks: string[] = [];

  for (const section of parseSections(markdown)) {
    const prefix = section.headingPath.length > 0 ? `${section.headingPath.join(' > ')}\n\n` : '';
    const budget = Math.max(maxChars - prefix.length, 200);
    // Leave room for the overlap carried into the next chunk.
    const pieceMax = Math.max(budget - overlapChars - 2, 100);
    const pieces = section.blocks.flatMap((block) =>
      block.length <= pieceMax ? [block] : splitOversized(block, pieceMax),
    );

    let body = '';
    for (const piece of pieces) {
      if (!body) {
        body = piece;
      } else if (body.length + 2 + piece.length <= budget) {
        body += `\n\n${piece}`;
      } else {
        chunks.push(prefix + body);
        const overlap = tail(body, overlapChars);
        body = overlap ? `${overlap}\n\n${piece}` : piece;
      }
    }
    if (body) chunks.push(prefix + body);
  }
  return chunks;
}
