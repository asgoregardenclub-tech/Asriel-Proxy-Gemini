/**
 * contextBuilder.js
 * Multi-turn context formatter, recency anchoring engine, OOC extractor,
 * and reasoning budget enforcement.
 */

import { config } from './config.js';

export class ContextBuilder {
  /**
   * Systematically extracts Out-Of-Character (OOC) instructions from text.
   * Matches variations such as:
   * [ OOC: pause ], (OOC: do this), ((ooc: ...)), [ooc: ...]
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
   * Assembles the full prompt transcript for Gemini's single-turn guest envelope.
   * Incorporates recency locking and thinking clamps.
   */
  static buildPrompt(messages, requestedModel = '') {
    if (!Array.isArray(messages) || messages.length === 0) {
      return '';
    }

    const systemParts = [];
    const transcriptParts = [];
    const collectedOOC = [];

    // Check if the requested model triggers reasoning/thinking clamp
    const modelDef = config.modelMappings[requestedModel] || config.modelMappings[config.defaultModel];
    const isThinkingModel = modelDef?.isThinking || requestedModel.includes('thinking');

    // 1. Process messages chronologically without artificial history truncation (Full 1M+ context)
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const role = (msg.role || 'user').toLowerCase();
      const rawContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '');

      if (role === 'system') {
        systemParts.push(rawContent.trim());
      } else if (role === 'user') {
        const { cleanedText, oocDirectives } = ContextBuilder.extractOOC(rawContent);
        if (oocDirectives.length > 0) {
          collectedOOC.push(...oocDirectives);
        }
        // Retain dialogue and action prose
        const userContent = cleanedText || rawContent;
        transcriptParts.push({ role: 'User', content: userContent });
      } else if (role === 'assistant') {
        transcriptParts.push({ role: 'Assistant', content: rawContent.trim() });
      }
    }

    // 2. Identify the most recent User message for strict Recency Anchoring
    let latestUserMessage = '';
    for (let i = transcriptParts.length - 1; i >= 0; i--) {
      if (transcriptParts[i].role === 'User') {
        latestUserMessage = transcriptParts[i].content;
        break;
      }
    }

    // 3. Assemble composite prompt segments
    const promptSegments = [];

    // Header directive
    promptSegments.push(
      '=== SYSTEM META-DIRECTIVE ===\n' +
      'You are operating inside a roleplay environment. Follow all character personas, scenarios, and world rules provided below.'
    );

    // Thinking Budget Clamping
    if (isThinkingModel) {
      promptSegments.push(
        `[THINKING BUDGET ENFORCEMENT: Internal reasoning, thoughts, and cognitive deliberation are strictly clamped to a maximum of ${config.thinkingBudgetTokens} tokens. Conclude reasoning concisely and output the dialogue and action response directly.]`
      );
    }

    // Out-Of-Character (OOC) Priority Directive
    if (collectedOOC.length > 0) {
      const formattedOOC = collectedOOC.map((directive, idx) => `  ${idx + 1}. ${directive}`).join('\n');
      promptSegments.push(
        '=== PRIORITY OUT-OF-CHARACTER (OOC) META-INSTRUCTIONS ===\n' +
        'The user has issued the following meta-directives. These supersede persona habits and plot defaults:\n' +
        `${formattedOOC}\n` +
        'Strictly follow these directives in your upcoming response.'
      );
    }

    // Scenario / Persona / System Context
    if (systemParts.length > 0) {
      promptSegments.push(
        '=== CHARACTER DEFINITION & SCENARIO ===\n' +
        systemParts.join('\n\n')
      );
    }

    // Full Context Chronological Transcript (Mid-Chat Injection Resilient)
    if (transcriptParts.length > 0) {
      promptSegments.push('=== CONVERSATION LOG ===');
      for (const turn of transcriptParts) {
        promptSegments.push(`${turn.role}: ${turn.content}`);
      }
    }

    // Recency Lock Anchor: Prevents memory bleed and ensures continuation of the latest turn
    if (latestUserMessage) {
      promptSegments.push(
        '=== RECENCY LOCK & CONTINUATION DIRECTIVE ===\n' +
        'CRITICAL: Your next output MUST be the direct narrative and dialogue continuation responding EXCLUSIVELY to the final User turn immediately preceding this line:\n' +
        `"${latestUserMessage.slice(0, 300)}..."\n` +
        'Do NOT regress to earlier scenes. Do NOT re-reply to previous turns. Generate the next turn now:\n' +
        'Assistant:'
      );
    } else {
      promptSegments.push('Assistant:');
    }

    return promptSegments.join('\n\n');
  }
}

export const buildPrompt = ContextBuilder.buildPrompt;
