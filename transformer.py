"""
Translates OpenAI chat completion schemas to Google Gemini REST payloads.
Implements Turn-Anchoring, role consolidation, OOC extraction, and thinking budget clamps.
"""

import re
from typing import Any, Dict, List, Optional, Tuple
from config import settings


class PayloadTransformer:
    """
    Transforms OpenAI payload structure into Gemini REST format.
    Ensures message role alternation, contextual anchoring, and thinking limits.
    """

    OOC_PATTERN = re.compile(
        r"(?:\[\s*OOC\s*:\s*([\s\S]*?)\]|\(\s*OOC\s*:\s*([\s\S]*?)\)|\{\s*OOC\s*:\s*([\s\S]*?)\})",
        re.IGNORECASE
    )

    TURN_DIRECTIVE_PREFIX = (
        "[SYSTEM TURN DIRECTIVE: The user's active prompt is below. "
        "Do not respond to or repeat previous conversational turns. "
        "Generate the continuation ONLY for this immediate prompt.]\n"
    )

    META_INSTRUCTION_TEMPLATE = (
        "\n\n[HIGH PRIORITY META-INSTRUCTION: The user has issued an Out-Of-Character directive. "
        "Temporarily suspend standard narrative momentum where specified to strictly execute this command: \"{command}\"]"
    )

    @classmethod
    def extract_ooc_directives(cls, text: str) -> Tuple[str, List[str]]:
        """Extracts OOC blocks from user input while leaving clean narrative context."""
        extracted_commands: List[str] = []

        def _replacer(match: re.Match) -> str:
            cmd = match.group(1) or match.group(2) or match.group(3)
            if cmd and cmd.strip():
                extracted_commands.append(cmd.strip())
            return ""

        cleaned_text = cls.OOC_PATTERN.sub(_replacer, text).strip()
        return cleaned_text, extracted_commands

    @classmethod
    def transform_messages_to_gemini(
        cls, openai_messages: List[Dict[str, Any]]
    ) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Parses messages, extracts turn-0 system prompts, merges adjacent identical roles,
        and anchors the final user turn.
        """
        system_prompts: List[str] = []
        raw_dialogue: List[Dict[str, str]] = []

        for msg in openai_messages:
            role = msg.get("role", "user").lower()
            content = msg.get("content", "")

            # Normalize content format
            if isinstance(content, list):
                parts = []
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "text":
                        parts.append(item.get("text", ""))
                    elif isinstance(item, str):
                        parts.append(item)
                content = " ".join(parts)
            else:
                content = str(content)

            if role in ("system", "developer"):
                system_prompts.append(content)
            elif role in ("user", "assistant"):
                target_role = "user" if role == "user" else "model"
                raw_dialogue.append({"role": target_role, "content": content})

        # Gemini requires strictly alternating user/model sequences starting with 'user'
        consolidated_turns: List[Dict[str, str]] = []
        for turn in raw_dialogue:
            if not consolidated_turns:
                consolidated_turns.append(turn)
            else:
                # Merge consecutive identical roles
                if consolidated_turns[-1]["role"] == turn["role"]:
                    consolidated_turns[-1]["content"] += f"\n\n{turn['content']}"
                else:
                    consolidated_turns.append(turn)

        # Ensure conversation starts with 'user'
        if consolidated_turns and consolidated_turns[0]["role"] == "model":
            consolidated_turns.insert(0, {"role": "user", "content": "[Session Initialized]"})

        # Process final user turn with Anchor Directive and OOC Elevation
        if consolidated_turns:
            last_turn = consolidated_turns[-1]
            if last_turn["role"] == "user":
                original_text = last_turn["content"]
                clean_text, ooc_cmds = cls.extract_ooc_directives(original_text)

                if not clean_text and ooc_cmds:
                    clean_text = "[OOC Command Only]"

                # Apply Turn Sequence Anchor
                anchored_text = f"{cls.TURN_DIRECTIVE_PREFIX}{clean_text}"

                # Append Elevated OOC Meta-Directives if detected
                for cmd in ooc_cmds:
                    anchored_text += cls.META_INSTRUCTION_TEMPLATE.format(command=cmd)

                consolidated_turns[-1]["content"] = anchored_text

        # Format system instruction if available
        system_instruction_payload = None
        if system_prompts:
            combined_system = "\n\n".join(system_prompts)
            system_instruction_payload = {
                "parts": [{"text": combined_system}]
            }

        # Build Gemini contents structure
        gemini_contents = [
            {
                "role": turn["role"],
                "parts": [{"text": turn["content"]}]
            }
            for turn in consolidated_turns
        ]

        return system_instruction_payload, gemini_contents

    @classmethod
    def build_gemini_payload(
        cls, openai_body: Dict[str, Any]
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Converts the entire OpenAI chat completion payload into Gemini REST format.
        """
        raw_model = openai_body.get("model", settings.DEFAULT_MODEL)

        # Strip vendor prefixes if passed by frontends
        model = raw_model.split("/")[-1].strip()
        if not model:
            model = settings.DEFAULT_MODEL

        messages = openai_body.get("messages", [])
        system_instruction, contents = cls.transform_messages_to_gemini(messages)

        # Build generation configuration
        generation_config: Dict[str, Any] = {}

        if "temperature" in openai_body:
            generation_config["temperature"] = float(openai_body["temperature"])
        if "top_p" in openai_body:
            generation_config["topP"] = float(openai_body["top_p"])
        if "max_tokens" in openai_body and openai_body["max_tokens"]:
            generation_config["maxOutputTokens"] = int(openai_body["max_tokens"])
        elif "max_completion_tokens" in openai_body and openai_body["max_completion_tokens"]:
            generation_config["maxOutputTokens"] = int(openai_body["max_completion_tokens"])
        if "stop" in openai_body:
            stop_seq = openai_body["stop"]
            if isinstance(stop_seq, str):
                generation_config["stopSequences"] = [stop_seq]
            elif isinstance(stop_seq, list):
                generation_config["stopSequences"] = stop_seq

        # Enforce thinking budget on reasoning variants or by default
        budget = settings.THINKING_BUDGET
        if budget > 0:
            generation_config["thinkingConfig"] = {
                "thinkingBudget": budget
            }

        payload: Dict[str, Any] = {
            "contents": contents,
            "generationConfig": generation_config
        }

        if system_instruction:
            payload["systemInstruction"] = system_instruction

        return model, payload
