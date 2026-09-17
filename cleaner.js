/**
 * cleaner.js
 * Real-time, chunk-boundary safe stream buffer and static output sanitizer.
 * Strips Google internal XML/LMDX tags, citation anchors, and markdown/raw links.
 */

export class StreamCleaner {
  constructor() {
    this.buffer = '';
    // Maximum characters to delay across a chunk boundary for an unclosed tag/link
    this.maxLookahead = 400;
  }

  /**
   * Cleans a complete text block statically (for non-streaming completions or final passes).
   */
  static cleanText(text) {
    if (!text || typeof text !== 'string') return '';

    let cleaned = text;

    // 1. Remove Google internal code interpreter & stdout artifacts
    cleaned = cleaned.replace(
      /```(?:python|javascript|text)\?code_(?:reference|stdout)&code_event_index=\d+[\s\S]*?```\n?/g,
      ''
    );

    // 2. Remove LMDX Interactive Containers and System UI tags along with internal content
    cleaned = cleaned.replace(/<ElicitationsGroup\b[^>]*>[\s\S]*?<\/ElicitationsGroup>/gi, '');
    cleaned = cleaned.replace(/<FollowUp\b[^>]*>[\s\S]*?<\/FollowUp>/gi, '');
    cleaned = cleaned.replace(/<thought\b[^>]*>[\s\S]*?<\/thought>/gi, '');
    cleaned = cleaned.replace(/<grounding-citation\b[^>]*>[\s\S]*?<\/grounding-citation>/gi, '');
    cleaned = cleaned.replace(/<citation_sources\b[^>]*>[\s\S]*?<\/citation_sources>/gi, '');
    cleaned = cleaned.replace(/<Sequence\b[^>]*>[\s\S]*?<\/Sequence>/gi, '');
    cleaned = cleaned.replace(/<Timeline\b[^>]*>[\s\S]*?<\/Timeline>/gi, '');
    cleaned = cleaned.replace(/<Carousel\b[^>]*>[\s\S]*?<\/Carousel>/gi, '');
    cleaned = cleaned.replace(/<GenerateWidget\b[^>]*>[\s\S]*?<\/GenerateWidget>/gi, '');

    // 3. Remove standalone, empty, or self-closing tags
    cleaned = cleaned.replace(/<\/?(?:ElicitationsGroup|Elicitation|FollowUp|thought|grounding-citation|citation_sources|Sequence|Step|Timeline|TimelineEvent|Carousel|GenerateWidget)\b[^>]*\/?>/gi, '');

    // 4. Remove Google internal citation metadata [cite: ...] or [citation: ...]
    cleaned = cleaned.replace(/\[\s*(?:cite|citation)\s*:\s*[^\]]+\]/gi, '');

    // 5. Remove search index citation anchors: e.g. [1](https://google.com/...)
    cleaned = cleaned.replace(/\[\d+\]\(https?:\/\/[^\s\)]+\)/gi, '');

    // 6. Link Suppression: Convert standard markdown links [Anchor Text](https://...) -> "Anchor Text"
    cleaned = cleaned.replace(/\[([^\]]+)\]\(https?:\/\/[^\s\)]+\)/gi, '$1');

    // 7. Link Suppression: Strip raw external URLs completely
    cleaned = cleaned.replace(/https?:\/\/[^\s<>"'`)]+/gi, '');

    // 8. Normalise excessive vertical spacing created by stripped blocks (max 2 consecutive newlines)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    return cleaned;
  }

  /**
   * Ingests an incoming raw stream chunk, buffers boundary risk segments,
   * and yields sanitized text safe for immediate SSE forwarding.
   */
  process(chunk) {
    if (!chunk) return '';

    this.buffer += chunk;

    // Determine the safe substring cut-off point where no partial tag or link begins
    const safeIndex = this.findSafeBoundary(this.buffer);

    if (safeIndex <= 0) {
      return '';
    }

    const processable = this.buffer.slice(0, safeIndex);
    this.buffer = this.buffer.slice(safeIndex);

    return StreamCleaner.cleanText(processable);
  }

  /**
   * Scans the buffer for unclosed tags (<), markdown link triggers ([), or URL schemas (http)
   * that might be split across SSE chunks.
   */
  findSafeBoundary(str) {
    const len = str.length;
    if (len === 0) return 0;

    let boundary = len;

    // Check for an unclosed XML/HTML tag '<'
    const lastOpenTag = str.lastIndexOf('<');
    if (lastOpenTag !== -1) {
      const lastCloseTag = str.lastIndexOf('>');
      if (lastCloseTag < lastOpenTag) {
        // Tag is open and unclosed. Is it a plausible tag start or just a standalone comparison?
        const prospective = str.slice(lastOpenTag + 1);
        if (/^[a-zA-Z0-9_\-\/]/i.test(prospective)) {
          if (len - lastOpenTag < this.maxLookahead) {
            boundary = Math.min(boundary, lastOpenTag);
          }
        }
      }
    }

    // Check for an unclosed Markdown link '[' without matching ')'
    const lastOpenBracket = str.lastIndexOf('[');
    if (lastOpenBracket !== -1) {
      const lastCloseParen = str.lastIndexOf(')');
      if (lastCloseParen < lastOpenBracket && len - lastOpenBracket < this.maxLookahead) {
        boundary = Math.min(boundary, lastOpenBracket);
      }
    }

    // Check for trailing protocol scheme that might be cut mid-URL
    const httpIdx = Math.max(str.lastIndexOf('http://'), str.lastIndexOf('https://'));
    if (httpIdx !== -1) {
      const afterHttp = str.slice(httpIdx);
      if (!/\s/.test(afterHttp) && len - httpIdx < this.maxLookahead) {
        boundary = Math.min(boundary, httpIdx);
      }
    }

    return boundary;
  }

  /**
   * Flushes any remaining characters buffered at the close of the stream.
   */
  flush() {
    if (!this.buffer) return '';
    const remainder = StreamCleaner.cleanText(this.buffer);
    this.buffer = '';
    return remainder;
  }
}

export const cleanText = StreamCleaner.cleanText;
