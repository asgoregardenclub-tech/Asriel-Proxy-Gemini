/**
 * contextBuilder.js (v1.1 Update)
 * Multi-turn context formatter, recency anchoring engine, strict OOC override parser,
 * thinking budget enforcement, and 5+ paragraph / 550+ word minimum length enforcement.
 */

import { config } from './config.js';

export class ContextBuilder {
  /**
   * Systematically inspects and extracts Out-Of-Character (OOC) instructions.
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
   * Enforces 5+ paragraphs / 550+ words, recency locking, and strict OOC overrides.
   */
  static buildPrompt(messages, requestedModel = '') {
    if (!Array.isArray(messages) || messages.length === 0) {
      return '';
    }

    const systemParts = [];
    const transcriptParts = [];

    // Check if the requested model triggers reasoning/thinking clamp
    const modelDef = config.modelMappings[requestedModel] || config.modelMappings[config.defaultModel];
    const isThinkingModel = modelDef?.isThinking || requestedModel.includes('thinking');

    // 1. Process messages chronologically without artificial history truncation
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

    // 2. Identify the most recent User message to evaluate Recency and OOC overrides
    let rawLatestUserMessage = '';
    for (let i = transcriptParts.length - 1; i >= 0; i--) {
      if (transcriptParts[i].role === 'User') {
        rawLatestUserMessage = transcriptParts[i].content;
        break;
      }
    }

    // Parse OOC specifically from the latest user message
    const { cleanedText: latestUserDialogue, oocDirectives: latestOOC } =
      ContextBuilder.extractOOC(rawLatestUserMessage);

    const hasOOCDirective = latestOOC.length > 0;
    const extractedOOC = latestOOC.join(' | ');
    const isPureOOC = hasOOCDirective && latestUserDialogue.length === 0;

    // 3. Assemble composite prompt segments
    const promptSegments = [];

    // Header directive
    promptSegments.push(
      '=== SYSTEM META-DIRECTIVE ===\n' +
      'You are an expert creative roleplay engine. Follow all character personas, scenarios, and constraints strictly.'
    );

    // Strict Minimum Response Length Requirement (5+ paragraphs / 550+ words)
    promptSegments.push(
      '=== FORMATTING & LENGTH ENFORCEMENT ===\n' +
      'Every narrative response MUST consist of a minimum of five (5) rich, detailed paragraphs, totaling at least 550 words.\n' +
      'Do not provide brief, clipped, or fast-forwarded summaries. Fleshed-out scene progression, sensory details, environmental atmosphere, and character introspection are required to fulfill the 5-paragraph minimum.\n' +
      '(EXCEPTION: If and only if the latest turn contains an [URGENT META OVERRIDE] commanding an OOC pause or meta clarification, prioritize the meta instruction and reply concisely in OOC brackets without forced roleplay length.)'
    );

    // Thinking Budget Clamping
    if (isThinkingModel) {
      promptSegments.push(
        `[THINKING BUDGET ENFORCEMENT: Internal reasoning and chain-of-thought deliberations are clamped to a strict maximum of ${config.thinkingBudgetTokens} tokens. Wrap up internal thinking promptly and produce the external roleplay prose.]`
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

    // 4. Recency Locking & OOC Meta-Override Injection at the Conclusion
    if (hasOOCDirective) {
      promptSegments.push(
        '=== CRITICAL META-INSTRUCTION ===\n' +
        `[URGENT META OVERRIDE]: The user has issued an Out-Of-Character (OOC) directive: '${extractedOOC}'.\n` +
        'You are obligated to prioritize this instruction above the character roleplay. If instructed to pause, stop the narrative and respond exclusively in OOC brackets (e.g., "[ OOC: Understood, roleplay paused. ]"). Do not stay in character if commanded otherwise.'
      );

      if (isPureOOC) {
        promptSegments.push(
          'CRITICAL: The latest user message was purely an OOC command. Do NOT generate in-character roleplay. Respond purely out-of-character.\n' +
          'Assistant:'
        );
      } else {
        promptSegments.push(
          '=== RECENCY LOCK & CONTINUATION DIRECTIVE ===\n' +
          'Acknowledge the OOC directive, then continue the narrative responding to the latest User turn above while fulfilling the 5-paragraph / 550-word minimum length standard.\n' +
          'Assistant:'
        );
      }
    } else if (rawLatestUserMessage) {
      promptSegments.push(
        '=== RECENCY LOCK & CONTINUATION DIRECTIVE ===\n' +
        'CRITICAL: Your next output MUST be the direct narrative continuation responding EXCLUSIVELY to the final User turn immediately preceding this line:\n' +
        `"${rawLatestUserMessage.slice(0, 300)}..."\n` +
        'Do NOT regress to earlier scenes. Do NOT re-reply to previous turns. Maintain chronological progression and deliver at least 5 rich paragraphs (550+ words).\n' +
        'Assistant:'
      );
    } else {
      promptSegments.push('Assistant:');
    }

    return promptSegments.join('\n\n');
  }
}

export const buildPrompt = ContextBuilder.buildPrompt;
