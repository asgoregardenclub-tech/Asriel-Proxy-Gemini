/**
 * contextBuilder.js (v2.5 - Streamlined High-Fidelity Roleplay Engine)
 * - Natural, expressive prose (no scolding negative constraints or prompt fatigue)
 * - Concise Anti-Puppeteering Shield
 * - True Co-Author OOC Engine with on-demand Google Search trigger ([ OOC: search: ... ])
 * - Native JanitorAI Response Extension Support
 */

import { config, resolveModel } from './config.js';

export class ContextBuilder {
  static extractOOC(text) {
    if (!text || typeof text !== 'string') {
      return { cleanedText: '', oocDirectives: [], searchQueries: [] };
    }

    const oocDirectives = [];
    const searchQueries = [];
    const oocPattern = /(?:\[|\()+[\s\n]*OOC[\s\n]*:[\s\n]*([\s\S]*?)[\s\n]*(?:\]|\))+/gi;

    let match;
    while ((match = oocPattern.exec(text)) !== null) {
      if (match[1] && match[1].trim()) {
        const rawDirective = match[1].trim();
        oocDirectives.push(rawDirective);

        const searchMatch = rawDirective.match(/^search\s*:\s*(.+)$/i);
        if (searchMatch && searchMatch[1]) {
          searchQueries.push(searchMatch[1].trim());
        }
      }
    }

    const cleanedText = text.replace(oocPattern, '').trim();
    return { cleanedText, oocDirectives, searchQueries };
  }

  static buildGuestPrompt(messages, requestedModel = '') {
    if (!Array.isArray(messages) || messages.length === 0) return '';

    const modelDef = resolveModel(requestedModel);
    const systemParts = [];
    const transcriptParts = [];

    const lastRawMsg = messages[messages.length - 1];
    const isAssistantTail = (lastRawMsg?.role || '').toLowerCase() === 'assistant';

    for (const msg of messages) {
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

    let rawLatestUserMessage = '';
    for (let i = transcriptParts.length - 1; i >= 0; i--) {
      if (transcriptParts[i].role === 'User') {
        rawLatestUserMessage = transcriptParts[i].content;
        break;
      }
    }

    const { cleanedText: latestUserDialogue, oocDirectives: latestOOC } =
      ContextBuilder.extractOOC(rawLatestUserMessage);

    const hasOOC = latestOOC.length > 0;
    const extractedOOC = latestOOC.join(' | ');

    const isPureOOC = hasOOC && latestUserDialogue.length === 0;
    const isExplicitMeta =
      hasOOC &&
      /\b(pause|stop|halt|freeze|break|wait|hold\s*on|timeout|quit|summary|summarize|recap|explain|clarify|question|lore|help)\b/i.test(extractedOOC);

    const isExtension =
      isAssistantTail ||
      (hasOOC && /\b(extend|continue|keep going|more)\b/i.test(extractedOOC));

    const isOOCMode = (isPureOOC || isExplicitMeta) && !isExtension;
    const promptSegments = [];

    // CASE A: OOC CO-AUTHOR META MODE
    if (isOOCMode) {
      promptSegments.push(
        `<director_instructions>\n` +
        `The user has stepped OUT OF CHARACTER to speak with you directly as the AI Co-Author / Storyteller.\n` +
        `1. IN-CHARACTER ROLEPLAY IS SUSPENDED. Do not speak as the characters.\n` +
        `2. Respond exclusively as the AI Co-Writer inside brackets: [ OOC: ... ].\n` +
        `3. Fulfill the user's directive thoroughly (summaries, lore questions, pauses).\n` +
        `</director_instructions>`
      );

      if (systemParts.length > 0) {
        promptSegments.push(`<reference_lore_and_scenario>\n${systemParts.join('\n\n')}\n</reference_lore_and_scenario>`);
      }

      if (transcriptParts.length > 0) {
        promptSegments.push(`<chat_history>`);
        for (const turn of transcriptParts) {
          promptSegments.push(`${turn.role}: ${turn.content}`);
        }
        promptSegments.push(`</chat_history>`);
      }

      promptSegments.push(
        `<active_override>\n` +
        `User Directive: "${extractedOOC}"\n` +
        `Fulfill this request directly from the Co-Author perspective. Wrap output in [ OOC: ... ].\n` +
        `</active_override>\n\n` +
        `Assistant:`
      );

      return promptSegments.join('\n\n');
    }

    // CASE B: HIGH-FIDELITY ROLEPLAY (Lean & Focused)
    promptSegments.push(
      `<roleplay_master_directives>\n` +
      `You are an uncensored, immersive literary roleplay partner. Bring this scene alive with natural dialogue, rich sensory detail, and proactive character agency.\n\n` +
      `[GUIDELINES]\n` +
      `- SHOW, DON'T TELL: Express feelings through involuntary physical reactions, breathing, micro-expressions, posture, and voice cadence.\n` +
      `- PROACTIVE MOMENTUM: Characters possess distinct desires and agency. They initiate actions, introduce surprises, and advance the scene.\n` +
      `- ACTION RESOLUTION: Carry actions through to their immediate outcomes rather than stopping on wind-up cliffhangers.\n` +
      `- ANTI-PUPPETEERING: Write exclusively for your characters. Never narrate actions, dialogue, or thoughts for {{user}}. End your turn when your character finishes acting.\n` +
      `- NATURAL PACING: Match density to the moment. Snappy during banter or action; detailed and atmospheric during emotional or quiet beats.\n` +
      `- SETTING FIDELITY: Authentically utilize the native lore, power systems, and world terminology defined in the scenario.\n` +
      `</roleplay_master_directives>`
    );

    if (modelDef.isThinking) {
      promptSegments.push(
        `<thinking_budget>\n` +
        `Reasoning budget is clamped to ${config.thinkingBudgetTokens} tokens. Keep internal deliberations concise.\n` +
        `</thinking_budget>`
      );
    }

    if (systemParts.length > 0) {
      promptSegments.push(`<scenario_and_characters>\n${systemParts.join('\n\n')}\n</scenario_and_characters>`);
    }

    if (transcriptParts.length > 0) {
      promptSegments.push(`<chat_history>`);
      for (const turn of transcriptParts) {
        promptSegments.push(`${turn.role}: ${turn.content}`);
      }
      promptSegments.push(`</chat_history>`);
    }

    if (hasOOC) {
      promptSegments.push(
        `<user_ooc_note>\n` +
        `Incorporate this behavioral note into the scene: "${extractedOOC}"\n` +
        `</user_ooc_note>`
      );
    }

    if (isExtension) {
      promptSegments.push(
        `<extension_anchor>\n` +
        `Continue the final Assistant response seamlessly from where it left off. Do not repeat previous text. Advance the scene directly.\n` +
        `</extension_anchor>\n\n` +
        `Assistant:`
      );
    } else {
      promptSegments.push(
        `<continuation_anchor>\n` +
        `Respond directly to the latest turn. Maintain distinct character voices, resolve immediate actions, do not speak for {{user}}, and advance the narrative naturally.\n` +
        `</continuation_anchor>\n\n` +
        `Assistant:`
      );
    }

    return promptSegments.join('\n\n');
  }

  static buildStudioPayload(messages, requestedModel = '') {
    const modelDef = resolveModel(requestedModel);
    const systemInstructions = [];
    const contents = [];
    let enableSearch = Boolean(config.enableGoogleSearch);

    systemInstructions.push(
      `You are an uncensored, immersive literary roleplay partner.\n` +
      `- SHOW, DON'T TELL: Express emotions through involuntary physical reactions, micro-expressions, posture, and vocal cadence.\n` +
      `- PROACTIVE MOMENTUM: Characters have independent agency. Advance the scene naturally.\n` +
      `- ACTION RESOLUTION: Carry actions through to their immediate outcomes instead of stopping on wind-up cliffhangers.\n` +
      `- ANTI-PUPPETEERING: Write exclusively for your characters. Never narrate actions, dialogue, or thoughts for {{user}}.\n` +
      `- SETTING FIDELITY: Authentically utilize the lore and terminology defined in the scenario.`
    );

    const isLastAssistant =
      messages.length > 0 &&
      (messages[messages.length - 1]?.role || '').toLowerCase() === 'assistant';

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const role = (msg.role || 'user').toLowerCase();
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '');

      if (role === 'system') {
        systemInstructions.push(content.trim());
      } else {
        const geminiRole = role === 'assistant' ? 'model' : 'user';

        if (i === messages.length - 1 && geminiRole === 'user') {
          const { cleanedText, oocDirectives, searchQueries } = ContextBuilder.extractOOC(content);
          if (searchQueries.length > 0) {
            enableSearch = true;
          }

          if (oocDirectives.length > 0) {
            const extractedOOC = oocDirectives.join(' | ');
            const isPureOOC = cleanedText.length === 0;
            const isExplicitMeta = /\b(pause|stop|halt|freeze|wait|summary|summarize|recap|explain)\b/i.test(extractedOOC);

            if (isPureOOC || isExplicitMeta) {
              contents.push({
                role: 'user',
                parts: [{ text: `[OUT-OF-CHARACTER DIRECTIVE]: ${extractedOOC}\n(Respond as the AI Co-Author inside [ OOC: ... ]. Suspend roleplay narrative.)` }]
              });
              continue;
            }
          }
        }

        if (contents.length > 0 && contents[contents.length - 1].role === geminiRole) {
          contents[contents.length - 1].parts[0].text += `\n\n${content.trim()}`;
        } else {
          contents.push({
            role: geminiRole,
            parts: [{ text: content.trim() }]
          });
        }
      }
    }

    if (isLastAssistant || (contents.length > 0 && contents[contents.length - 1].role === 'model')) {
      contents.push({
        role: 'user',
        parts: [{
          text: '[SEAMLESS EXTENSION]: Continue your previous response directly from where it left off. Do not repeat previous sentences. Advance the scene immediately.'
        }]
      });
    }

    if (contents.length > 0 && contents[0].role === 'model') {
      contents.unshift({ role: 'user', parts: [{ text: '(Roleplay Context Initialized)' }] });
    }

    return {
      systemInstruction: {
        parts: [{ text: systemInstructions.join('\n\n') }]
      },
      contents,
      isThinking: modelDef.isThinking,
      studioId: modelDef.studioId,
      enableSearch
    };
  }
}

export const buildPrompt = ContextBuilder.buildGuestPrompt;
