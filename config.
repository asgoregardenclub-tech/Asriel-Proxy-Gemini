"""
Configuration module for Asriel-Proxy-Gemini.
Loads configuration from environment variables or .env file.
"""

from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Server Bind Configuration
    HOST: str = Field(default="0.0.0.0", description="Host interface to bind proxy server")
    PORT: int = Field(default=5000, description="Port to run proxy server")

    # API Keys & Upstream Engine
    GEMINI_API_KEYS: str = Field(
        default="",
        description="Comma-separated pool of Gemini API keys (e.g., key1,key2,key3)"
    )
    DEFAULT_MODEL: str = Field(
        default="gemini-2.5-flash",
        description="Fallback Gemini model if not specified in request"
    )
    GEMINI_BASE_URL: str = Field(
        default="https://generativelanguage.googleapis.com/v1beta",
        description="Base URL for Google Gemini REST API"
    )

    # Reasoning / Thinking Controls
    THINKING_BUDGET: int = Field(
        default=5000,
        description="Explicit token budget for reasoning models (e.g. gemini-3.8-flash-thinking)"
    )

    # Sanitization Flags
    STRIP_XML_TAGS: bool = Field(default=True, description="Strip internal UI/XML elements")
    STRIP_URLS: bool = Field(default=True, description="Scrub raw and markdown URLs from dialogue")
    STRIP_THINKING_BLOCKS: bool = Field(default=True, description="Omit raw thought chains from visible stream")

    # Request & Failover Resilience
    REQUEST_TIMEOUT: float = Field(default=120.0, description="HTTP client timeout in seconds")
    MAX_RETRIES_PER_REQUEST: int = Field(default=3, description="Maximum failover attempts per turn")
    KEY_COOLDOWN_SECONDS: int = Field(default=60, description="Backoff duration when HTTP 429 is received")

    def get_api_key_list(self) -> List[str]:
        """Parses comma-separated keys into a clean list."""
        if not self.GEMINI_API_KEYS.strip():
            return []
        return [k.strip() for k in self.GEMINI_API_KEYS.split(",") if k.strip()]


settings = Settings()
