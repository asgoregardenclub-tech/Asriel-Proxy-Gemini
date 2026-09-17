"""
GuestSessionCycler handles credential rotation, fingerprint generation,
cooldown tracking, and transparent failover across rate-limited endpoints.
"""

import asyncio
import hashlib
import random
import time
from typing import Dict, List, Optional, Tuple
from config import settings


class SessionCredential:
    """Represents a single credential/key identity with health tracking."""

    def __init__(self, key: str, identifier: str):
        self.key: str = key
        self.identifier: str = identifier
        self.failures: int = 0
        self.cooldown_until: float = 0.0
        self.headers: Dict[str, str] = self._generate_fingerprint_headers()

    def _generate_fingerprint_headers(self) -> Dict[str, str]:
        """Generates isolated rotating browser/client fingerprints."""
        user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
        ]
        chosen_ua = random.choice(user_agents)
        raw_seed = f"{self.identifier}-{time.time()}-{random.random()}"
        client_hash = hashlib.sha256(raw_seed.encode("utf-8")).hexdigest()[:16]

        return {
            "User-Agent": chosen_ua,
            "Accept": "application/json, text/event-stream",
            "Accept-Encoding": "gzip, deflate, br",
            "X-Client-Session-Id": client_hash,
            "X-Goog-Api-Client": "gl-python/3.12.0 rest/v1beta",
        }

    @property
    def is_available(self) -> bool:
        """Determines if the session is currently active and out of cooldown."""
        return time.time() >= self.cooldown_until

    def mark_rate_limited(self, cooldown_duration: int = 60) -> None:
        """Flags key on 429 quota exhaustion and sets exponential backoff."""
        self.failures += 1
        backoff = cooldown_duration * (2 ** min(self.failures - 1, 3))
        self.cooldown_until = time.time() + backoff

    def mark_success(self) -> None:
        """Resets degradation counters on successful response."""
        self.failures = 0
        self.cooldown_until = 0.0


class GuestSessionCycler:
    """
    Manages key pools, session rotation, and idempotent failovers.
    """

    def __init__(self):
        self._lock = asyncio.Lock()
        self._sessions: List[SessionCredential] = []
        self._index: int = 0
        self.reload_keys()

    def reload_keys(self) -> None:
        """Initializes or reloads credentials from configuration."""
        keys = settings.get_api_key_list()
        if keys:
            self._sessions = [
                SessionCredential(key=k, identifier=f"key-pool-{i}")
                for i, k in enumerate(keys)
            ]
        else:
            # Fallback guest pool placeholder if user operates in external-header mode
            self._sessions = [
                SessionCredential(key="EPHEMERAL_GUEST", identifier="guest-0")
            ]
        self._index = 0

    async def acquire_session(self) -> Tuple[SessionCredential, str]:
        """
        Retrieves next healthy session in pool via round-robin.
        Returns a tuple of (SessionCredential, API_Key).
        """
        async with self._lock:
            if not self._sessions:
                self.reload_keys()

            total_sessions = len(self._sessions)
            now = time.time()

            # Scan for first available session
            for _ in range(total_sessions):
                candidate = self._sessions[self._index]
                self._index = (self._index + 1) % total_sessions
                if candidate.is_available:
                    return candidate, candidate.key

            # If all are cooling down, select the one closest to expiry
            earliest = min(self._sessions, key=lambda s: s.cooldown_until)
            wait_time = max(0.0, earliest.cooldown_until - now)
            if wait_time > 0:
                await asyncio.sleep(min(wait_time, 2.0))
            return earliest, earliest.key

    async def report_failure(self, session: SessionCredential, status_code: int) -> None:
        """Marks rate limits or invalidation on session and forces cycling."""
        async with self._lock:
            if status_code in (429, 403, 401):
                session.mark_rate_limited(settings.KEY_COOLDOWN_SECONDS)
            else:
                session.failures += 1

    async def report_success(self, session: SessionCredential) -> None:
        """Confirms successful roundtrip and clears degradation status."""
        async with self._lock:
            session.mark_success()


cycler_engine = GuestSessionCycler(){
  "name": "asriel-proxy-gemini",
  "version": "1.0.0",
  "description": "High-performance OpenAI-to-Gemini reverse proxy middleware tailored for JanitorAI with context anchoring, stream sanitization, and account cycling.",
  "main": "server.js",
  "type": "commonjs",
  "scripts": {
    "start": "node server.js"
  },
  "keywords": [
    "janitorai",
    "gemini",
    "reverse-proxy",
    "openai-compatible",
    "llm-middleware",
    "termux"
  ],
  "author": "Asriel-Dev",
  "license": "MIT",
  "engines": {
    "node": ">=20.0.0"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.21.2"
  }
}
