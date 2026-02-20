# AI Translator Web App

Multi-language translation web app built with Flask and a clean HTML/CSS/JS frontend. It supports popular languages in the UI and exposes a simple REST API.

## Features

- Multi-language translation UI with source/target selectors
- Fast, responsive layout with history, copy, and status feedback
- `/api/translate` endpoint for programmatic use
- Local fallback translation via `deep-translator`
- Optional Hugging Face model path for `en -> hi`

## Supported Languages (UI)

`English`, `Hindi`, `Spanish`, `French`, `German`, `Italian`, `Portuguese`, `Russian`, `Chinese`, `Japanese`, `Korean`, `Arabic`

## Project Structure

```text
aitranslator.setup/
|-- app.py
|-- frontend/
|   |-- index.html
|   |-- styles.css
|   `-- app.js
|-- templates/          (legacy, not used by current app)
|-- .venv/              (local virtual environment)
`-- README.md
```

## Local Setup

1. Create and activate a virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install dependencies:

```powershell
pip install flask deep-translator
```

3. Run the app:

```powershell
python app.py
```

4. Open in browser:

`http://127.0.0.1:5000`

## API Reference

### `GET /api/health`

Returns health metadata:

```json
{
  "status": "ok",
  "model": "Helsinki-NLP/opus-mt-en-hi",
  "max_input_chars": 2000
}
```

### `POST /api/translate`

Request:

```json
{
  "text": "How are you?",
  "source_lang": "en",
  "target_lang": "hi"
}
```

Response:

```json
{
  "translation": "आप कैसे हैं?",
  "translated_text": "आप कैसे हैं?",
  "source_lang": "en",
  "target_lang": "hi"
}
```

## Translation Behavior

- Primary: Hugging Face model for `en -> hi` (if `transformers` + `torch` are available)
- Fallback: `deep-translator` for any language pair supported by Google Translator

## Environment Variables

- `MODEL_NAME` default: `Helsinki-NLP/opus-mt-en-hi`
- `MAX_INPUT_CHARS` default: `2000`
- `MAX_OUTPUT_TOKENS` default: `256`
- `PORT` default: `5000`

## Troubleshooting

- CSS/JS not loading: ensure you are running `python app.py` from `aitranslator.setup/`
- Translation errors: install `deep-translator` or check internet access
- Port in use: run with `PORT=5001` and open `http://127.0.0.1:5001`
