"""
Stateful stream cleaner and XML/URL scrubber.
Eliminates internal Google UI tokens, reasoning tags, and web links from text chunks.
"""

import re
from typing import Set


class StreamSanitizer:
    """
    Stateful sliding-window stream processor that buffers unclosed XML tags
    and scrubs artifacts on the fly without breaking JanitorAI chat bubbles.
    """

    # Tag names whose contents must be eliminated entirely
    SUPPRESS_BLOCK_TAGS: Set[str] = {
        "thought",
        "elicitationsgroup",
        "elicitation",
        "followup",
        "context",
        "internal",
        "search_query",
    }

    def __init__(self, strip_xml: bool = True, strip_urls: bool = True, strip_thoughts: bool = True):
        self.strip_xml = strip_xml
        self.strip_urls = strip_urls
        self.strip_thoughts = strip_thoughts

        self._buffer: str = ""
        self._in_block_tag: str | None = None

        # Precompiled regex patterns
        self._url_markdown_re = re.compile(r"\[([^\]]+)\]\((?:https?|ftp)://[^\)]+\)")
        self._raw_url_re = re.compile(r"(?:https?|ftp)://[^\s<>\"]+")
        self._html_anchor_re = re.compile(r"<a\b[^>]*>(.*?)</a>", re.IGNORECASE)
        self._generic_xml_tag_re = re.compile(r"</?[a-zA-Z0-9_:\-]+(?:\s+[^>]*)?>")

    def feed(self, chunk: str) -> str:
        """
        Receives an arbitrary chunk, buffers potential split tags,
        and returns safe, clean text.
        """
        self._buffer += chunk
        output_fragments = []

        while self._buffer:
            # Case 1: Inside a suppressed block (e.g. <thought> ... </thought>)
            if self._in_block_tag:
                close_pattern = re.compile(f"</{re.escape(self._in_block_tag)}>", re.IGNORECASE)
                match = close_pattern.search(self._buffer)
                if match:
                    # Drop everything up to and including the closing tag
                    self._buffer = self._buffer[match.end():]
                    self._in_block_tag = None
                    continue
                else:
                    # Closing tag not yet observed; retain tail to avoid splitting </tag>
                    max_close_tag_len = len(self._in_block_tag) + 4
                    if len(self._buffer) > max_close_tag_len:
                        self._buffer = self._buffer[-max_close_tag_len:]
                    return ""

            # Case 2: Looking for tag openings
            tag_open_idx = self._buffer.find("<")
            if tag_open_idx == -1:
                # No tag starts; whole buffer is candidate text
                text_to_emit = self._buffer
                self._buffer = ""
                output_fragments.append(self._sanitize_plain_text(text_to_emit))
                break

            # Emit safe text preceding '<'
            if tag_open_idx > 0:
                safe_prefix = self._buffer[:tag_open_idx]
                output_fragments.append(self._sanitize_plain_text(safe_prefix))
                self._buffer = self._buffer[tag_open_idx:]

            # Now self._buffer starts with '<'
            tag_close_idx = self._buffer.find(">")
            if tag_close_idx == -1:
                # Incomplete tag at boundary (e.g. "<Elicita" or "<th")
                # Withhold buffer if it looks like a tag name (under 64 chars)
                if len(self._buffer) < 64 and re.match(r"^<[a-zA-Z0-9_:\-/\s]*$", self._buffer):
                    break
                else:
                    # Not an XML tag (e.g. mathematical '< ' or broken text), emit first char
                    output_fragments.append(self._buffer[0])
                    self._buffer = self._buffer[1:]
                    continue

            # Complete tag found: <tag ...>
            full_tag = self._buffer[: tag_close_idx + 1]
            self._buffer = self._buffer[tag_close_idx + 1 :]

            # Extract tag name
            tag_match = re.match(r"^<(/)?([a-zA-Z0-9_:\-]+)", full_tag)
            if not tag_match:
                # Invalid tag syntax, emit as-is
                output_fragments.append(full_tag)
                continue

            is_closing = bool(tag_match.group(1))
            tag_name = tag_match.group(2).lower()

            # Check if entering a suppressed block
            if not is_closing and (tag_name in self.SUPPRESS_BLOCK_TAGS or tag_name.startswith("call:")):
                if self.strip_xml or (tag_name == "thought" and self.strip_thoughts):
                    self._in_block_tag = tag_name
                    continue

            # Drop standalone UI or XML tags if XML stripping is active
            if self.strip_xml:
                continue

            output_fragments.append(full_tag)

        return "".join(output_fragments)

    def flush(self) -> str:
        """Flushes any remaining text when stream ends."""
        if self._in_block_tag:
            # Stream concluded inside a suppressed block; drop buffer
            self._buffer = ""
            return ""

        remaining = self._sanitize_plain_text(self._buffer)
        self._buffer = ""
        return remaining

    def _sanitize_plain_text(self, text: str) -> str:
        """Applies URL, markdown link, and generic tag scrubbing."""
        if not text:
            return ""

        result = text

        if self.strip_urls:
            # Convert [label](http://...) to label
            result = self._url_markdown_re.sub(r"\1", result)
            # Remove HTML anchors <a href="...">label</a> -> label
            result = self._html_anchor_re.sub(r"\1", result)
            # Strip bare hyperlinks
            result = self._raw_url_re.sub("", result)

        if self.strip_xml:
            # Scrub any lingering XML/HTML tags
            result = self._generic_xml_tag_re.sub("", result)

        return result


def sanitize_complete_text(
    text: str,
    strip_xml: bool = True,
    strip_urls: bool = True,
    strip_thoughts: bool = True
) -> str:
    """Non-streaming complete pass utility for full payloads."""
    sanitizer = StreamSanitizer(
        strip_xml=strip_xml,
        strip_urls=strip_urls,
        strip_thoughts=strip_thoughts
    )
    cleaned = sanitizer.feed(text) + sanitizer.flush()
    return cleaned.strip()
