"""
Main FastAPI server for Asriel-Proxy-Gemini.
Implements OpenAI-compatible /v1/chat/completions and /v1/models endpoints with SSE streaming.
"""

import json
import logging
import sys
import time
import uuid
from typing import Any, AsyncGenerator, Dict

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from config import settings
from cycler import cycler_engine
from sanitizer import StreamSanitizer, sanitize_complete_text
from transformer import PayloadTransformer

# Structured logging
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("AsrielProxy")

app = FastAPI(
    title="Asriel-Proxy-Gemini",
    version="2.5.0",
    description="High-performance, cross-platform OpenAI reverse proxy tailored for JanitorAI",
)

# Enable CORS for local and web-based JanitorAI frontends
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
@app.get("/health")
async def health_check() -> Dict[str, Any]:
    """Health status and diagnostic statistics."""
    keys = settings.get_api_key_list()
    return {
        "status": "online",
        "proxy": "Asriel-Proxy-Gemini",
        "pool_capacity": len(keys),
        "default_model": settings.DEFAULT_MODEL,
        "thinking_budget": settings.THINKING_BUDGET,
    }


@app.get("/v1/models")
@app.get("/models")
async def list_models() -> Dict[str, Any]:
    """Exposes OpenAI-compatible model registry for JanitorAI model pickers."""
    timestamp = int(time.time())
    model_ids = [
        "gemini-3.8-flash",
        "gemini-3.8-flash-thinking",
        "gemini-3.7-flash",
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-pro",
        "gemini-1.5-flash",
    ]
    return {
        "object": "list",
        "data": [
            {
                "id": m_id,
                "object": "model",
                "created": timestamp,
                "owned_by": "google",
                "permission": [],
                "root": m_id,
                "parent": None,
            }
            for m_id in model_ids
        ],
    }


def create_sse_chunk(
    completion_id: str,
    model: str,
    content: str | None = None,
    finish_reason: str | None = None,
) -> str:
    """Builds standard OpenAI SSE data packet."""
    delta: Dict[str, Any] = {}
    if content is not None:
        delta["content"] = content

    chunk_data = {
        "id": completion_id,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "delta": delta,
                "finish_reason": finish_reason,
            }
        ],
    }
    return f"data: {json.dumps(chunk_data, ensure_ascii=False)}\n\n"


async def gemini_stream_generator(
    model: str,
    gemini_payload: Dict[str, Any],
    client_auth_key: str | None = None,
) -> AsyncGenerator[str, None]:
    """
    Streams content from Gemini, scrubbing XML and URLs on the fly,
    yielding compliant OpenAI SSE chunks.
    """
    completion_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    sanitizer = StreamSanitizer(
        strip_xml=settings.STRIP_XML_TAGS,
        strip_urls=settings.STRIP_URLS,
        strip_thoughts=settings.STRIP_THINKING_BLOCKS,
    )

    max_retries = settings.MAX_RETRIES_PER_REQUEST
    attempt = 0
    stream_started = False

    while attempt < max_retries:
        attempt += 1
        session, pool_key = await cycler_engine.acquire_session()
        active_key = client_auth_key or pool_key

        url = f"{settings.GEMINI_BASE_URL}/models/{model}:streamGenerateContent?alt=sse&key={active_key}"

        try:
            async with httpx.AsyncClient(timeout=settings.REQUEST_TIMEOUT) as client:
                async with client.stream(
                    "POST",
                    url,
                    headers=session.headers,
                    json=gemini_payload,
                ) as response:
                    if response.status_code != 200:
                        err_body = await response.aread()
                        logger.warning(
                            f"[Attempt {attempt}] Upstream returned {response.status_code}: {err_body.decode('utf-8', errors='ignore')}"
                        )
                        await cycler_engine.report_failure(session, response.status_code)
                        if attempt < max_retries:
                            continue
                        # If retries exhausted, send error chunk
                        err_msg = f"[Proxy Error: Upstream HTTP {response.status_code}]"
                        yield create_sse_chunk(completion_id, model, content=err_msg)
                        yield create_sse_chunk(completion_id, model, finish_reason="stop")
                        yield "data: [DONE]\n\n"
                        return

                    await cycler_engine.report_success(session)

                    async for raw_line in response.aiter_lines():
                        if not raw_line:
                            continue
                        if not raw_line.startswith("data:"):
                            continue

                        data_str = raw_line[5:].strip()
                        if not data_str:
                            continue

                        try:
                            gemini_chunk = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue

                        candidates = gemini_chunk.get("candidates", [])
                        if not candidates:
                            continue

                        candidate = candidates[0]
                        content_obj = candidate.get("content", {})
                        parts = content_obj.get("parts", [])

                        text_accumulator = ""
                        for part in parts:
                            # Omit thoughts if marked by Gemini reasoning endpoints
                            if part.get("thought", False) and settings.STRIP_THINKING_BLOCKS:
                                continue
                            text_accumulator += part.get("text", "")

                        if text_accumulator:
                            cleaned_slice = sanitizer.feed(text_accumulator)
                            if cleaned_slice:
                                stream_started = True
                                yield create_sse_chunk(completion_id, model, content=cleaned_slice)

                        if candidate.get("finishReason"):
                            break

                    # Flush remainder
                    final_flush = sanitizer.flush()
                    if final_flush:
                        yield create_sse_chunk(completion_id, model, content=final_flush)

                    yield create_sse_chunk(completion_id, model, finish_reason="stop")
                    yield "data: [DONE]\n\n"
                    return

        except (httpx.RequestError, httpx.TimeoutException) as exc:
            logger.error(f"[Attempt {attempt}] Connection failure: {str(exc)}")
            await cycler_engine.report_failure(session, 503)
            if attempt >= max_retries:
                yield create_sse_chunk(
                    completion_id, model, content="\n\n[Proxy Network Timeout: Upstream unreachable]"
                )
                yield create_sse_chunk(completion_id, model, finish_reason="stop")
                yield "data: [DONE]\n\n"
                return


@app.post("/v1/chat/completions")
@app.post("/chat/completions")
async def chat_completions(request: Request) -> Response:
    """Main OpenAI-compatible endpoint consumed by JanitorAI."""
    try:
        body = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON payload: {str(exc)}")

    auth_header = request.headers.get("Authorization", "")
    client_auth_key = None
    if auth_header.startswith("Bearer "):
        extracted = auth_header.replace("Bearer ", "").strip()
        # Only adopt user key if it is not a placeholder dummy token
        if extracted and extracted != "asriel" and not extracted.startswith("sk-dummy"):
            client_auth_key = extracted

    model, gemini_payload = PayloadTransformer.build_gemini_payload(body)
    stream_requested = body.get("stream", False)

    if stream_requested:
        return StreamingResponse(
            gemini_stream_generator(model, gemini_payload, client_auth_key),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    # Non-streaming JSON completion execution
    max_retries = settings.MAX_RETRIES_PER_REQUEST
    for attempt in range(1, max_retries + 1):
        session, pool_key = await cycler_engine.acquire_session()
        active_key = client_auth_key or pool_key

        url = f"{settings.GEMINI_BASE_URL}/models/{model}:generateContent?key={active_key}"

        try:
            async with httpx.AsyncClient(timeout=settings.REQUEST_TIMEOUT) as client:
                res = await client.post(
                    url,
                    headers=session.headers,
                    json=gemini_payload,
                )

                if res.status_code != 200:
                    await cycler_engine.report_failure(session, res.status_code)
                    if attempt < max_retries:
                        continue
                    return JSONResponse(
                        status_code=res.status_code,
                        content={"error": {"message": res.text, "type": "upstream_error"}},
                    )

                await cycler_engine.report_success(session)
                gemini_data = res.json()

                raw_text = ""
                candidates = gemini_data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    for p in parts:
                        if p.get("thought", False) and settings.STRIP_THINKING_BLOCKS:
                            continue
                        raw_text += p.get("text", "")

                sanitized_text = sanitize_complete_text(
                    raw_text,
                    strip_xml=settings.STRIP_XML_TAGS,
                    strip_urls=settings.STRIP_URLS,
                    strip_thoughts=settings.STRIP_THINKING_BLOCKS,
                )

                completion_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
                return JSONResponse(
                    content={
                        "id": completion_id,
                        "object": "chat.completion",
                        "created": int(time.time()),
                        "model": model,
                        "choices": [
                            {
                                "index": 0,
                                "message": {
                                    "role": "assistant",
                                    "content": sanitized_text,
                                },
                                "finish_reason": "stop",
                            }
                        ],
                        "usage": {
                            "prompt_tokens": 0,
                            "completion_tokens": 0,
                            "total_tokens": 0,
                        },
                    }
                )

        except (httpx.RequestError, httpx.TimeoutException) as exc:
            await cycler_engine.report_failure(session, 503)
            if attempt >= max_retries:
                raise HTTPException(status_code=504, detail=f"Proxy timeout: {str(exc)}")

    raise HTTPException(status_code=500, detail="Retries exhausted across session pool.")


if __name__ == "__main__":
    import uvicorn

    logger.info(f"Launching Asriel-Proxy-Gemini on {settings.HOST}:{settings.PORT}")
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False,
        access_log=True,
    )
