/**
 * cleaner.js
 * Stream-safe XML tag stripper and link suppressor.
 * Buffers partial tags and links across SSE chunk boundaries.
 */

export class StreamCleaner {
  constructor() {
    this.buffer = '';
    this.maxLookahead = 350;
  }

  static cleanText(text) {
    if (!text || typeof text !== 'string') return '';

    let cleaned = text;

    // Remove Google code execution artifacts
    cleaned = cleaned.replace(
      /```(?:python|javascript|text)\?code_(?:reference|stdout)&code_event_index=\d+[\s\S]*?```\n?/g,
      ''
    );

    // Strip Google internal LMDX tags and contents
    cleaned = cleaned.replace(/<ElicitationsGroup\b[^>]*>[\s\S]*?<\/ElicitationsGroup>/gi, '');
    cleaned = cleaned.replace(/<FollowUp\b[^>]*>[\s\S]*?<\/FollowUp>/gi, '');
    cleaned = cleaned.replace(/<thought\b[^>]*>[\s\S]*?<\/thought>/gi, '');
    cleaned = cleaned.replace(/<grounding-citation\b[^>]*>[\s\S]*?<\/grounding-citation>/gi, '');
    cleaned = cleaned.replace(/<citation_sources\b[^>]*>[\s\S]*?<\/citation_sources>/gi, '');
    cleaned = cleaned.replace(/<Sequence\b[^>]*>[\s\S]*?<\/Sequence>/gi, '');
    cleaned = cleaned.replace(/<Timeline\b[^>]*>[\s\S]*?<\/Timeline>/gi, '');
    cleaned = cleaned.replace(/<Carousel\b[^>]*>[\s\S]*?<\/Carousel>/gi, '');
    cleaned = cleaned.replace(/<GenerateWidget\b[^>]*>[\s\S]*?<\/GenerateWidget>/gi, '');

    // Strip standalone or empty tags
    cleaned = cleaned.replace(
      /<\/?(?:ElicitationsGroup|Elicitation|FollowUp|thought|grounding-citation|citation_sources|Sequence|Step|Timeline|TimelineEvent|Carousel|GenerateWidget)\b[^>]*\/?>/gi,
      ''
    );

    // Strip Google internal citation tags
    cleaned = cleaned.replace(/\[\s*(?:cite|citation)\s*:\s*[^\]]+\]/gi, '');
    cleaned = cleaned.replace(/\[\d+\]\(https?:\/\/[^\s\)]+\)/gi, '');

    // Link suppression: keep anchor text, remove URL
    cleaned = cleaned.replace(/\[([^\]]+)\]\(https?:\/\/[^\s\)]+\)/gi, '$1');

    // Strip raw external URLs
    cleaned = cleaned.replace(/https?:\/\/[^\s<>"'`)]+/gi, '');

    // Normalize spacing
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    return cleaned;
  }

  process(chunk) {
    if (!chunk) return '';
    this.buffer += chunk;

    const safeIndex = this.findSafeBoundary(this.buffer);
    if (safeIndex <= 0) return '';

    const processable = this.buffer.slice(0, safeIndex);
    this.buffer = this.buffer.slice(safeIndex);

    return StreamCleaner.cleanText(processable);
  }

  findSafeBoundary(str) {
    const len = str.length;
    if (len === 0) return 0;
    let boundary = len;

    // Check for open '<'
    const lastOpenTag = str.lastIndexOf('<');
    if (lastOpenTag !== -1) {
      const lastCloseTag = str.lastIndexOf('>');
      if (lastCloseTag < lastOpenTag) {
        const prospective = str.slice(lastOpenTag + 1);
        if (/^[a-zA-Z0-9_\-\/]/i.test(prospective) && len - lastOpenTag < this.maxLookahead) {
          boundary = Math.min(boundary, lastOpenTag);
        }
      }
    }

    // Check for open markdown link '['
    const lastOpenBracket = str.lastIndexOf('[');
    if (lastOpenBracket !== -1) {
      const lastCloseParen = str.lastIndexOf(')');
      if (lastCloseParen < lastOpenBracket && len - lastOpenBracket < this.maxLookahead) {
        boundary = Math.min(boundary, lastOpenBracket);
      }
    }

    // Check for open URL scheme
    const httpIdx = Math.max(str.lastIndexOf('http://'), str.lastIndexOf('https://'));
    if (httpIdx !== -1) {
      const afterHttp = str.slice(httpIdx);
      if (!/\s/.test(afterHttp) && len - httpIdx < this.maxLookahead) {
        boundary = Math.min(boundary, httpIdx);
      }
    }

    return boundary;
  }

  flush() {
    if (!this.buffer) return '';
    const remainder = StreamCleaner.cleanText(this.buffer);
    this.buffer = '';
    return remainder;
  }
}

export const cleanText = StreamCleaner.cleanText;
