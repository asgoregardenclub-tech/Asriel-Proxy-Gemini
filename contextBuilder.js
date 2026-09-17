/**
 * contextBuilder.js (v1.1.1 Hotfix)
 * Multi-turn context formatter, recency anchoring engine, strict OOC override parser,
 * thinking budget enforcement, and conditional 5+ paragraph / 550+ word enforcement.
 */

import { config } from './config.js';

export class ContextBuilder {
  /**
   * Extracts Out-Of-Character (OOC) instructions from a message.
   * Matches [ OOC: ... ], (OOC: ...), ((ooc: ...)), [ooc: ...]
   */
  static extractOOC(text) {
    if (!text || typeof text !== 'string') {
      return { cleanedText: '', oocDirectives: [] };
    }

    const oocDirectives = [];
    const oocPattern = /(?:\[|\()+[\s\n]*OOC[\s\n]*:[\s\n]*([\s\S]*?)[\s\n]*(?:\]|\))+/gi;

    let match;
    while ((match = oocPattern.exec(text)) !== null) {
      if (match[1] && match[1].trim()) {
        oocDirectives.push(match[1].trim());
      }
    }

    const cleanedText = text.replace(oocPattern, '').trim();
    return { cleanedText, oocDirectives };
  }

  /**
   * Assembles the prompt payload sent to Gemini.
   */
  static buildPrompt(messages, requestedModel = '') {
    if (!Array.isArray(messages) || messages.length === 0) {
      return '';
    }

    const systemParts = [];
    const transcriptParts = [];

    const modelDef = config.modelMappings[requestedModel] || config.modelMappings[config.defaultModel];
    const isThinkingModel = modelDef?.isThinking || requestedModel.includes('thinking');

    // 1. Process messages chronologically
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const role = (msg.role || 'user').toLowerCase();
      const rawContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '');

      if (role === 'system') {
        systemParts.push(rawContent.trim());
      } else if (role === 'user') {
        transcriptParts.push({ role: 'User', content: rawContent.trim() });
      } else if (role === 'assistant') {
        transcriptParts.push({ role: 'Assistant', content: rawContent.trim() });
      }
    }

    // 2. Inspect the latest User message
    let rawLatestUserMessage = '';
    for (let i = transcriptParts.length - 1; i >= 0; i--) {
      if (transcriptParts[i].role === 'User') {
        rawLatestUserMessage = transcriptParts[i].content;
        break;
      }
    }

    const { cleanedText: latestUserDialogue, oocDirectives: latestOOC } =
      ContextBuilder.extractOOC(rawLatestUserMessage);

    const hasOOCDirective = latestOOC.length > 0;
    const extractedOOC = latestOOC.join(' | ');

    // Detect if this is an explicit pause, stop, or purely OOC request
    const isExplicitPause =
      hasOOCDirective &&
      /\b(pause|stop|halt|freeze|break|wait|hold\s*on|timeout|quit)\b/i.test(extractedOOC);
    const isPureOOC = hasOOCDirective && latestUserDialogue.length === 0;
    const isOOCPauseActive = isExplicitPause || isPureOOC;

    const promptSegments = [];

    // =========================================================================
    // CASE A: OOC PAUSE ACTIVE (User wants to pause or chat purely out of character)
    // =========================================================================
    if (isOOCPauseActive) {
      promptSegments.push(
        '=== SYSTEM META-DIRECTIVE: OOC PAUSE MODE ===\n' +
        'THE ROLEPLAY IS CURRENTLY PAUSED BY USER COMMAND.\n' +
        'CRITICAL INSTRUCTIONS:\n' +
        '1. DO NOT generate ANY story narrative, scene descriptions, or character dialogue.\n' +
        '2. DO NOT say "resuming the narrative" or continue the roleplay.\n' +
        '3. DO NOT apply any minimum length or 5-paragraph rules.\n' +
        '4. Respond EXCLUSIVELY out-of-character in brackets: [ OOC: ... ].\n' +
        '5. Acknowledge the user\'s OOC comment or question directly and await further instruction before resuming.'
      );

      if (systemParts.length > 0) {
        promptSegments.push('=== BACKGROUND SCENARIO (PAUSED) ===\n' + systemParts.join('\n\n'));
      }

      if (transcriptParts.length > 0) {
        promptSegments.push('=== PREVIOUS CHAT LOG ===');
        for (const turn of transcriptParts) {
          promptSegments.push(`${turn.role}: ${turn.content}`);
        }
      }

      promptSegments.push(
        '=== URGENT EXECUTION OVERRIDE ===\n' +
        `User OOC Command: "${extractedOOC}"\n` +
        'The roleplay is PAUSED. You are strictly forbidden from writing in-character.\n' +
        'Output ONLY a concise OOC response in [ OOC: ... ] and terminate generation immediately.\n\n' +
        'Assistant:'
      );

      return promptSegments.join('\n\n');
    }

    // =========================================================================
    // CASE B: NORMAL IN-CHARACTER ROLEPLAY (5+ Paragraphs / 550+ Words Mandatory)
    // =========================================================================
    promptSegments.push(
      '=== SYSTEM META-DIRECTIVE ===\n' +
      'You are an expert creative roleplay engine. Follow all character personas, scenarios, and constraints strictly.'
    );

    // Enforce 5+ Paragraphs & 550+ Words
    promptSegments.push(
      '=== FORMATTING & LENGTH ENFORCEMENT ===\n' +
      'Every narrative response MUST consist of a minimum of five (5) rich, detailed paragraphs, totaling at least 550 words.\n' +
      'Do not provide brief, clipped, or fast-forwarded summaries. Fleshed-out scene progression, sensory details, environmental atmosphere, and character introspection are required to fulfill the 5-paragraph minimum.'
    );

    if (isThinkingModel) {
      promptSegments.push(
        `[THINKING BUDGET ENFORCEMENT: Internal reasoning is clamped to a maximum of ${config.thinkingBudgetTokens} tokens. Wrap up internal thinking promptly and produce the external roleplay prose.]`
      );
    }

    if (systemParts.length > 0) {
      promptSegments.push('=== CHARACTER DEFINITION & SCENARIO ===\n' + systemParts.join('\n\n'));
    }

    if (transcriptParts.length > 0) {
      promptSegments.push('=== CONVERSATION LOG ===');
      for (const turn of transcriptParts) {
        promptSegments.push(`${turn.role}: ${turn.content}`);
      }
    }

    // Mixed Turn: User provided an in-character action + an OOC direction (e.g. `*smiles* [ OOC: make him angry ]`)
    if (hasOOCDirective) {
      promptSegments.push(
        '=== OUT-OF-CHARACTER META-DIRECTIVE ===\n' +
        `The user provided an out-of-character behavioral directive: "${extractedOOC}".\n` +
        'Incorporate this directive into the character\'s actions and behavior while maintaining the narrative.'
      );
    }

    if (rawLatestUserMessage) {
      promptSegments.push(
        '=== RECENCY LOCK & CONTINUATION DIRECTIVE ===\n' +
        'CRITICAL: Your next output MUST be the direct narrative continuation responding EXCLUSIVELY to the final User turn immediately preceding this line:\n' +
        `"${rawLatestUserMessage.slice(0, 300)}..."\n` +
        'Do NOT regress to earlier scenes. Do NOT re-reply to previous turns. Maintain chronological progression and deliver at least 5 rich paragraphs (550+ words).\n\n' +
        'Assistant:'
      );
    } else {
      promptSegments.push('Assistant:');
    }

    return promptSegments.join('\n\n');
  }
}

export const buildPrompt = ContextBuilder.buildPrompt;
