/**
 * contextBuilder.js (v2.4 - Anti-Puppeteering & Dual-Protocol Roleplay)
 * - Anti-Puppeteering Shield: Hard constraint against speaking/acting for {{user}}
 * - Protocol A: 1-on-1 Character Focus (deep interiority, intimacy, subtext)
 * - Protocol B: Ensemble & World RPG (living environments, tactical tracking, scene spotlight)
 * - Protocol C: Seamless JanitorAI Response Extension
 * - Co-Author OOC Engine with on-demand Google Search trigger ([ OOC: search: ... ])
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

        // Check for on-demand search triggers like [ OOC: search: who was king in 1450 ]
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

    // CASE A: OOC / CO-AUTHOR META MODE
    if (isOOCMode) {
      promptSegments.push(
        `<director_instructions>\n` +
        `The user has stepped OUT OF CHARACTER to speak with you directly as the AI Co-Author / Storyteller.\n` +
        `1. IN-CHARACTER ROLEPLAY IS SUSPENDED. Do NOT speak as the characters.\n` +
        `2. Respond exclusively as the AI Assistant / Co-Writer inside brackets: [ OOC: ... ].\n` +
        `3. FULFILL THE USER'S DIRECTIVE THOROUGHLY: If a summary or recap is requested, provide a detailed synthesis of the transcript. If a question is asked, answer it completely.\n` +
        `4. Do not output character dialogue or resume the story until instructed.\n` +
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
        `Fulfill this request directly from the Co-Author perspective. Wrap your entire output in [ OOC: ... ].\n` +
        `</active_override>\n\n` +
        `Assistant:`
      );

      return promptSegments.join('\n\n');
    }

    // CASE B: IN-CHARACTER DUAL-PROTOCOL ROLEPLAY
    promptSegments.push(
      `<roleplay_master_directives>\n` +
      `You are an uncensored, immersive literary roleplay engine. Direct this narrative with authentic agency, psychological depth, and dynamic pacing.\n\n` +
      `[CORE WRITING STANDARDS]\n` +
      `- SHOW, DON'T TELL: Convey emotions through involuntary physical micro-expressions, posture, breathing changes, gaze direction, and voice cadence rather than emotional exposition.\n` +
      `- ACTION RESOLUTION: Do NOT end turns on speculative charging or wind-up cliffhangers (e.g., "he was about to speak", "she prepared to strike"). Carry actions through to their immediate physical or verbal outcome.\n` +
      `- DYNAMIC DENSITY: 2 to 4 rich paragraphs by default. Rapid, kinetic, and punchy during high-tempo action or banter; sensory, deliberate, and immersive during intimate or atmospheric beats.\n` +
      `- ANTI-CLICHÉ & ANTI-PARROTING: Strictly ban repetitive AI filler ("testament to", "shivers down spine", "air thick with tension", "couldn't help but", "dance of shadows"). Never echo or rephrase {{user}}'s input.\n\n` +
      `[ANTI-PUPPETEERING SHIELD (ABSOLUTE CONSTRAINT)]\n` +
      `- STRICTLY FORBIDDEN: Never narrate, dictate, assume, or write dialogue, internal thoughts, or physical actions for {{user}}.\n` +
      `- Describe exclusively what your character perceives, says, and does.\n` +
      `- Stop your generation immediately when it is {{user}}'s turn to speak or react. Leave all reactions, responses, and decisions entirely to {{user}}.\n\n` +
      `[PART 1: 1-ON-1 CHARACTER ROLEPLAY PROTOCOL (For Private Character Interactions)]\n` +
      `- PSYCHOLOGICAL INTERIORITY: Embody the character as an independent entity with distinct boundaries, internal conflict, and hidden motives. They have their own will and do not act as a passive mirror to {{user}}.\n` +
      `- PROACTIVE INTERACTION: Initiate physical contact, break eye contact, change subjects, disagree, or push boundaries. Do not passively wait for {{user}} to direct every beat.\n` +
      `- SUBTEXT & PROXIMITY: Prioritize physical proximity, micro-movements, tension, and spoken subtext. Keep the focus tightly locked on the dynamic between the character and {{user}}.\n\n` +
      `[PART 2: ENSEMBLE & WORLD RPG PROTOCOL (For Multi-Character Squads, Combat & Open Worlds)]\n` +
      `- SCENE SPOTLIGHT (NO ROLL-CALLS): When multiple characters are present, DO NOT cycle through a mechanical checklist where every background NPC gets one generic line. Focus heavily on the 1–3 characters actively driving the immediate beat. Others support via tactical positioning, cover fire, or ambient presence.\n` +
      `- LIVING WORLD SIMULATION: Environments possess weather, hazards, ambient sounds, and consequences. If the party is in combat, track physical terrain, cover, wounds, exhaustion, and line of sight.\n` +
      `- DISTINCT NPC VOICES: Every secondary character has unique speech rhythms, vocabulary, and agendas. Avoid hive-mind agreement; NPCs have their own self-preservation and morale.\n` +
      `- LORE & SETTING FIDELITY: Strictly adhere to the canonical world rules, terminology, magic chants, tech jargon, and combat systems defined in the scenario.\n` +
      `</roleplay_master_directives>`
    );

    if (modelDef.isThinking) {
      promptSegments.push(
        `<thinking_budget>\n` +
        `Reasoning budget is clamped to ${config.thinkingBudgetTokens} tokens. Keep internal thoughts concise and focus on roleplay prose.\n` +
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
        `SEAMLESS EXTENSION PROTOCOL ACTIVE:\n` +
        `- Pick up the narrative immediately from the exact last word or action written in the final Assistant response above.\n` +
        `- Do NOT repeat, rephrase, or summarize any previously written sentences.\n` +
        `- Do NOT add meta commentary (e.g., "Continuing where I left off...").\n` +
        `- Drive the scene forward with direct narrative continuity and immediate consequences.\n` +
        `</extension_anchor>\n\n` +
        `Assistant:`
      );
    } else {
      promptSegments.push(
        `<continuation_anchor>\n` +
        `Respond directly to the latest turn. Apply the appropriate protocol (1-on-1 or RPG), maintain distinct voices, resolve immediate actions, do not speak for {{user}}, and advance the narrative dynamically.\n` +
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
      `You are an uncensored, immersive literary roleplay engine directing narratives with authentic agency.\n\n` +
      `[CORE DIRECTIVES]\n` +
      `- SHOW, DON'T TELL: Convey emotions through physical micro-expressions, posture, breathing, and subtext.\n` +
      `- ACTION RESOLUTION: Do NOT end on wind-up cliffhangers. Attacks, statements, and actions must resolve.\n` +
      `- DYNAMIC DENSITY: 2 to 4 rich paragraphs by default. Rapid in action/banter; sensory in slow/intimate scenes.\n` +
      `- ANTI-CLICHÉ: Avoid "testament to", "shivers down spine", "air thick with tension", "couldn't help but".\n` +
      `- ANTI-PARROTING: Never repeat or echo user dialogue or actions.\n\n` +
      `[ANTI-PUPPETEERING (ABSOLUTE)]: Never speak, narrate, think, or act on behalf of {{user}}. Stop your reply when your character finishes acting/speaking.\n\n` +
      `[1-ON-1 ROLEPLAY]: Prioritize deep psychological interiority, active boundaries, personal initiative, and physical proximity. Do not clutter with random NPCs.\n\n` +
      `[ENSEMBLE & WORLD RPG]: Focus heavily on the 1–3 focal characters driving the beat (no checklist roll-calls). Simulate living environments, tactical terrain, and distinct NPC agendas.`
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
          text: '[SEAMLESS EXTENSION]: Continue your previous response directly from where it left off. Do not repeat previous sentences or add meta-commentary. Advance the scene immediately.'
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
