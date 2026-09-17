# Asriel-Proxy-Gemini

A high-performance, asynchronous OpenAI-to-Gemini reverse proxy specifically built for **JanitorAI**.

Runs seamlessly across **Android (Termux)**, **Windows**, **macOS**, and **Linux**.

---

## 🌟 Core Features

1. **Sliding-Window Stream Sanitizer (`StreamSanitizer`)**:
   - Zero-leak buffering: prevents split XML tags (e.g. `<Elicita` ... `tionsGroup>`) from ever appearing in character dialogue.
   - Cleans internal Google UI artifacts, `<thought>` blocks, search queries, and raw/markdown URLs on the fly.

2. **Turn-Anchoring Protocol**:
   - Eliminates context drift in 100+ turn roleplays across Gemini's 1M–2M context window.
   - Normalizes message sequences to strict alternating `user` / `model` pairs without 400 Bad Request errors.
   - Automatically embeds the `[SYSTEM TURN DIRECTIVE]` to keep the character laser-focused on your latest prompt.

3. **Thinking Budget Governance**:
   - Caps `thinking_budget` explicitly at 5,000 tokens (customizable via `.env`) to prevent reasoning loops on complex character cards.

4. **Out-of-Character (OOC) Engine**:
   - Automatically detects `[OOC: ...]`, `(OOC: ...)`, and `{OOC: ...}` blocks and promotes them to top-level priority meta-instructions.

5. **Multi-Key Failover Engine (`GuestSessionCycler`)**:
   - Round-robins across a pool of API keys.
   - Backs off rate-limited keys (HTTP 429) automatically and retries without dropping the JanitorAI connection.

---

## 🚀 Quick Start

### 1. Windows
Double-click `start.bat`.

### 2. Linux / macOS
```bash
chmod +x start.sh
./start.sh
