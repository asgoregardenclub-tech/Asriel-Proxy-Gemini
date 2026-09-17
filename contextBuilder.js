/**
 * contextBuilder.js (v1.1.3 Hotfix)
 * Multi-turn context formatter, recency anchoring engine, strict OOC co-author mode,
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

    // Pure OOC: No in-character dialogue or actions outside the brackets
    const isPureOOC = hasOOCDirective && latestUserDialogue.length === 0;

    // Explicit Meta Request: Summary, recap, pause, explanation, lore questions
    const isExplicitMeta =
      hasOOCDirective &&
      /\b(pause|stop|halt|freeze|break|wait|hold\s*on|timeout|quit|summary|summarize|recap|explain|clarify|question|help|rewind|retry|what\s+if)\b/i.test(extractedOOC);

    // If either condition is true, roleplay is suspended and AI enters Co-Writer / Meta Mode
    const isOOCMode = isPureOOC || isExplicitMeta;

    const promptSegments = [];

    // =========================================================================
    // CASE A: OUT-OF-CHARACTER (OOC) / CO-AUTHOR MODE
    // Used for summaries, recaps, pauses, lore discussions, and meta inquiries
    // =========================================================================
    if (isOOCMode) {
      promptSegments.push(
        `=== SYSTEM META-DIRECTIVE: OUT-OF-CHARACTER (OOC) MODE ===\n` +
        `The user has stepped OUT OF CHARACTER to speak with you directly as the AI Co-Author / Assistant.\n` +
        `CRITICAL INSTRUCTIONS FOR THIS TURN:\n` +
        `1. IN-CHARACTER ROLEPLAY IS SUSPENDED. You are strictly forbidden from writing as the character persona.\n` +
        `2. Speak EXCLUSIVELY as the AI Co-Author/Storyteller in Out-Of-Character brackets: [ OOC: ... ].\n` +
        `3. THOROUGHLY FULFILL THE USER'S REQUEST: If asked for a summary, provide a comprehensive, structured in-depth summary of the entire roleplay transcript. If asked a question or given a pause command, answer it completely.\n` +
        `4. Do NOT enforce narrative 5-paragraph roleplay constraints. Deliver whatever length is necessary to answer the user's OOC prompt.\n` +
        `5. Do NOT say "resuming narrative" and do NOT output any character dialogue.`
      );

      // Disarm the character card by marking it strictly as reference material
      if (systemParts.length > 0) {
        promptSegments.push(
          `=== REFERENCE MATERIAL (FOR CONTEXT ONLY - DO NOT ADOPT PERSONA) ===\n` +
          systemParts.join('\n\n')
        );
      }

      if (transcriptParts.length > 0) {
        promptSegments.push(`=== CHAT TRANSCRIPT TO REFERENCE ===`);
        for (const turn of transcriptParts) {
          promptSegments.push(`${turn.role}: ${turn.content}`);
        }
      }

      promptSegments.push(
        `=== CRITICAL OOC EXECUTION INSTRUCTION ===\n` +
        `User OOC Directive: "${extractedOOC}"\n\n` +
        `MANDATORY RULES:\n` +
        `- You are the AI Assistant / Co-Writer. Fulfill the user's directive completely and thoroughly.\n` +
        `- If a full/in-depth summary is requested, synthesize the entire transcript above into a detailed summary.\n` +
        `- Do NOT write as {{char}}. Do NOT generate story prose.\n` +
        `- Enclose your entire response inside [ OOC: ... ].\n\n` +
        `Assistant:`
      );

      return promptSegments.join('\n\n');
    }

    // =========================================================================
    // CASE B: NORMAL IN-CHARACTER ROLEPLAY
    // =========================================================================
    promptSegments.push(
      `=== SYSTEM META-DIRECTIVE ===\n` +
      `You are an expert creative roleplay engine. Follow all character personas, scenarios, and constraints strictly.`
    );

    promptSegments.push(
      `=== FORMATTING & LENGTH ENFORCEMENT ===\n` +
      `Every narrative response MUST consist of a minimum of five 3 rich, detailed paragraphs, totaling at least 350 to 500 words minimum, minimum suggests you can go past, but you cannot go below.\n` +
      `Do not provide brief, clipped, or fast-forwarded summaries. Fleshed-out scene progression, sensory details, environmental atmosphere, characters may go past the 5 paragraph threshold depending on if the scene consist of more than one person.`
    );

    if (isThinkingModel) {
      promptSegments.push(
        `[THINKING BUDGET ENFORCEMENT: Internal reasoning is clamped to a maximum of ${config.thinkingBudgetTokens} tokens. Wrap up internal thinking promptly and produce the external roleplay prose.]`
      );
    }

    if (systemParts.length > 0) {
      promptSegments.push(`=== CHARACTER DEFINITION & SCENARIO ===\n` + systemParts.join('\n\n'));
    }

    if (transcriptParts.length > 0) {
      promptSegments.push(`=== CONVERSATION LOG ===`);
      for (const turn of transcriptParts) {
        promptSegments.push(`${turn.role}: ${turn.content}`);
      }
    }

    // Mixed Turn: e.g. `*smiles* [ OOC: Make him angry ]`
    if (hasOOCDirective) {
      promptSegments.push(
        `=== OUT-OF-CHARACTER META-DIRECTIVE ===\n` +
        `The user provided an out-of-character behavioral directive: "${extractedOOC}".\n` +
        `Incorporate this directive into the character's actions and behavior while maintaining the narrative.`
      );
    }

    if (rawLatestUserMessage) {
      promptSegments.push(
        `=== RECENCY LOCK & CONTINUATION DIRECTIVE ===\n` +
        `CRITICAL: Your next output MUST be the direct narrative continuation responding EXCLUSIVELY to the final User turn immediately preceding this line:\n` +
        `"${rawLatestUserMessage.slice(0, 300)}..."\n` +
        `Do NOT regress to earlier scenes. Do NOT re-reply to previous turns. Maintain chronological progression and deliver at least 5 rich paragraphs (550+ words).\n\n` +
        `Assistant:`
      );
    } else {
      promptSegments.push(`Assistant:`);
    }

    return promptSegments.join('\n\n');
  }
}

export const buildPrompt = ContextBuilder.buildPrompt;
