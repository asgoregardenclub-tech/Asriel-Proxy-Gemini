/**
 * cleaner.js
 * Stateful stream cleaner that removes internal reasoning, LMDX XML tags,
 * and markdown link URLs without token leaks across SSE chunk borders.
 */

export class StreamCleaner {
  constructor() {
    this.buffer = '';
    this.inThoughtBlock = false;
    this.maxLookahead = 300;
  }

  static cleanText(text) {
    if (!text || typeof text !== 'string') return '';

    let cleaned = text;

    // Strip Google code execution artifacts
    cleaned = cleaned.replace(
      /```(?:python|javascript|text)\?code_(?:reference|stdout)&code_event_index=\d+[\s\S]*?```\n?/g,
      ''
    );

    // Strip Google internal LMDX tags and contents
    cleaned = cleaned.replace(/<thought\b[^>]*>[\s\S]*?<\/thought>/gi, '');
    cleaned = cleaned.replace(/<grounding-citation\b[^>]*>[\s\S]*?<\/grounding-citation>/gi, '');
    cleaned = cleaned.replace(/<citation_sources\b[^>]*>[\s\S]*?<\/citation_sources>/gi, '');
    cleaned = cleaned.replace(/<ElicitationsGroup\b[^>]*>[\s\S]*?<\/ElicitationsGroup>/gi, '');
    cleaned = cleaned.replace(/<FollowUp\b[^>]*>[\s\S]*?<\/FollowUp>/gi, '');
    cleaned = cleaned.replace(/<Sequence\b[^>]*>[\s\S]*?<\/Sequence>/gi, '');
    cleaned = cleaned.replace(/<Step\b[^>]*>[\s\S]*?<\/Step>/gi, '');
    cleaned = cleaned.replace(/<Timeline\b[^>]*>[\s\S]*?<\/Timeline>/gi, '');
    cleaned = cleaned.replace(/<TimelineEvent\b[^>]*>[\s\S]*?<\/TimelineEvent>/gi, '');
    cleaned = cleaned.replace(/<Carousel\b[^>]*>[\s\S]*?<\/Carousel>/gi, '');
    cleaned = cleaned.replace(/<GenerateWidget\b[^>]*>[\s\S]*?<\/GenerateWidget>/gi, '');

    // Strip dangling or standalone tags
    cleaned = cleaned.replace(
      /<\/?(?:thought|grounding-citation|citation_sources|ElicitationsGroup|Elicitation|FollowUp|Sequence|Step|Timeline|TimelineEvent|Carousel|GenerateWidget)\b[^>]*\/?>/gi,
      ''
    );

    // Suppress Google internal citations
    cleaned = cleaned.replace(/\[\s*(?:cite|citation)\s*:\s*[^\]]+\]/gi, '');
    cleaned = cleaned.replace(/\[\d+\]\(https?:\/\/[^\s\)]+\)/gi, '');

    // Suppress links: retain anchor text, strip URL
    cleaned = cleaned.replace(/\[([^\]]+)\]\(https?:\/\/[^\s\)]+\)/gi, '$1');

    // Strip raw standalone URLs
    cleaned = cleaned.replace(/https?:\/\/[^\s<>"'`)]+/gi, '');

    // Clean whitespace
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    return cleaned;
  }

  process(chunk) {
    if (!chunk) return '';
    this.buffer += chunk;

    let output = '';

    while (this.buffer.length > 0) {
      if (this.inThoughtBlock) {
        const closeIdx = this.buffer.toLowerCase().indexOf('</thought>');
        if (closeIdx !== -1) {
          this.buffer = this.buffer.slice(closeIdx + 10);
          this.inThoughtBlock = false;
          continue;
        } else {
          const tail = this.buffer.slice(-10).toLowerCase();
          const openBracket = tail.lastIndexOf('<');
          if (openBracket !== -1 && '</thought>'.startsWith(tail.slice(openBracket))) {
            this.buffer = tail.slice(openBracket);
          } else {
            this.buffer = '';
          }
          return output;
        }
      }

      const openIdx = this.buffer.toLowerCase().indexOf('<thought');
      if (openIdx !== -1) {
        const tagEnd = this.buffer.indexOf('>', openIdx);
        if (tagEnd !== -1) {
          const beforeThought = this.buffer.slice(0, openIdx);
          output += StreamCleaner.cleanText(beforeThought);
          this.buffer = this.buffer.slice(tagEnd + 1);
          this.inThoughtBlock = true;
          continue;
        } else {
          const before = this.buffer.slice(0, openIdx);
          output += StreamCleaner.cleanText(before);
          this.buffer = this.buffer.slice(openIdx);
          return output;
        }
      }

      const safeIndex = this.findSafeBoundary(this.buffer);
      if (safeIndex <= 0) break;

      const processable = this.buffer.slice(0, safeIndex);
      this.buffer = this.buffer.slice(safeIndex);
      output += StreamCleaner.cleanText(processable);
    }

    return output;
  }

  findSafeBoundary(str) {
    const len = str.length;
    if (len === 0) return 0;
    let boundary = len;

    const lastOpenTag = str.lastIndexOf('<');
    if (lastOpenTag !== -1) {
      const lastCloseTag = str.lastIndexOf('>');
      if (lastCloseTag < lastOpenTag) {
        const prospective = str.slice(lastOpenTag + 1).toLowerCase();
        if (
          /^(?:t|th|tho|thou|ground|cit|elic|foll|seq|step|time|caro)/.test(prospective) &&
          len - lastOpenTag < this.maxLookahead
        ) {
          boundary = Math.min(boundary, lastOpenTag);
        }
      }
    }

    const lastOpenBracket = str.lastIndexOf('[');
    if (lastOpenBracket !== -1) {
      const lastCloseParen = str.lastIndexOf(')');
      if (lastCloseParen < lastOpenBracket && len - lastOpenBracket < this.maxLookahead) {
        boundary = Math.min(boundary, lastOpenBracket);
      }
    }

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
    if (this.inThoughtBlock) {
      this.buffer = '';
      this.inThoughtBlock = false;
      return '';
    }
    const remainder = StreamCleaner.cleanText(this.buffer);
    this.buffer = '';
    return remainder;
  }
}

export const cleanText = StreamCleaner.cleanText;
