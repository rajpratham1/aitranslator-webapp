import os
from collections import OrderedDict
from functools import lru_cache
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"
MODEL_NAME = os.getenv("MODEL_NAME", "Helsinki-NLP/opus-mt-en-hi")
MAX_INPUT_CHARS = int(os.getenv("MAX_INPUT_CHARS", "2000"))
MAX_OUTPUT_TOKENS = int(os.getenv("MAX_OUTPUT_TOKENS", "256"))
MAX_CACHE_SIZE = int(os.getenv("MAX_CACHE_SIZE", "200"))

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")


@lru_cache(maxsize=1)
def get_translator():
    # Lazy import keeps startup fast and allows a helpful error if deps are missing.
    from transformers import pipeline

    return pipeline("translation", model=MODEL_NAME)


TRANSLATION_CACHE = OrderedDict()


def cache_get(key):
    if key in TRANSLATION_CACHE:
        TRANSLATION_CACHE.move_to_end(key)
        return TRANSLATION_CACHE[key]
    return None


def cache_set(key, value):
    TRANSLATION_CACHE[key] = value
    TRANSLATION_CACHE.move_to_end(key)
    if len(TRANSLATION_CACHE) > MAX_CACHE_SIZE:
        TRANSLATION_CACHE.popitem(last=False)


def detect_language(text: str) -> str:
    try:
        from langdetect import detect

        return detect(text) or "auto"
    except Exception:
        return "auto"


def translate_with_fallback(text: str, source_lang: str, target_lang: str) -> str:
    """
    Prefer the local HuggingFace model, then fallback to GoogleTranslator.
    This keeps local dev working on Python versions where torch wheels may lag.
    """
    if source_lang == "en" and target_lang == "hi":
        try:
            translator = get_translator()
            output = translator(text, max_length=MAX_OUTPUT_TOKENS)
            return output[0]["translation_text"]
        except Exception:
            pass

    from deep_translator import GoogleTranslator

    return GoogleTranslator(source=source_lang, target=target_lang).translate(text)


@app.get("/api/health")
def health():
    return jsonify(
        {
            "status": "ok",
            "model": MODEL_NAME,
            "max_input_chars": MAX_INPUT_CHARS,
        }
    )


@app.post("/api/translate")
def translate():
    payload = request.get_json(silent=True) or {}
    text = (payload.get("text") or "").strip()
    source_lang = (payload.get("source_lang") or "auto").lower()
    target_lang = (payload.get("target_lang") or "hi").lower()
    detected_lang = None

    if not text:
        return jsonify({"error": "text is required"}), 400

    if len(text) > MAX_INPUT_CHARS:
        return jsonify({"error": f"text too long (max {MAX_INPUT_CHARS})"}), 400

    if source_lang == "auto":
        detected_lang = detect_language(text)
        source_lang = detected_lang if detected_lang else "auto"

    cache_key = (text, source_lang, target_lang)
    cached = cache_get(cache_key)
    if cached:
        return jsonify(
            {
                "translation": cached,
                "translated_text": cached,
                "source_lang": source_lang,
                "target_lang": target_lang,
                "detected_source_lang": detected_lang,
                "cached": True,
            }
        )

    try:
        translated_text = translate_with_fallback(text, source_lang, target_lang)
    except Exception as exc:
        app.logger.exception("translation_error")
        return jsonify({"error": "translation failed", "details": str(exc)}), 500

    cache_set(cache_key, translated_text)

    return jsonify(
        {
            "translation": translated_text,
            "translated_text": translated_text,
            "source_lang": source_lang,
            "target_lang": target_lang,
            "detected_source_lang": detected_lang,
            "cached": False,
        }
    )


@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/<path:path>")
def static_proxy(path: str):
    if path.startswith("api/"):
        abort(404)

    file_path = FRONTEND_DIR / path
    if file_path.exists():
        return send_from_directory(FRONTEND_DIR, path)
    return send_from_directory(FRONTEND_DIR, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)
