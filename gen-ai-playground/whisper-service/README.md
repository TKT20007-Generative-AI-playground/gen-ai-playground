# Whisper Service (Phase 1)

Standalone containerized transcription API using faster-whisper.

## Endpoints

- `GET /health`: basic status and model config
- `POST /transcribe`: multipart file upload transcription

## Environment variables

- `WHISPER_MODEL` (default: `openai/whisper-large-v3-turbo`)
- `WHISPER_DEVICE` (default: `cpu`)
- `WHISPER_COMPUTE_TYPE` (default: `int8`)
- `WHISPER_DOWNLOAD_ROOT` (optional)
- `WHISPER_PRELOAD` (default: `false`)
- `MAX_UPLOAD_MB` (default: `50`)

Model aliases are supported so you can use OpenAI naming directly:

- `openai/whisper-large-v3-turbo` -> `turbo`
- `openai/whisper-large-v3` -> `large-v3`

## Build and run locally

```bash
docker build -t whisper-service:local ./whisper-service

docker run --rm -p 9000:9000 \
  -e WHISPER_MODEL=openai/whisper-large-v3-turbo \
  -e WHISPER_DEVICE=cpu \
  whisper-service:local
```

## Test with curl

```bash
curl -X POST "http://localhost:9000/transcribe" \
  -F "file=@/absolute/path/to/audio.wav" \
  -F "task=transcribe"
```

Example response:

```json
{
  "text": "hello world",
  "language": "en",
  "duration": 4.2,
  "segments": [
    {"start": 0.0, "end": 1.2, "text": "hello"},
    {"start": 1.2, "end": 2.0, "text": " world"}
  ],
  "model": "openai/whisper-large-v3-turbo",
  "resolved_model": "turbo"
}
```

## Troubleshooting

If you see an error like:

`Invalid model size 'YOUR_NEW_MODEL_NAME'`

your runtime env still contains a placeholder value for `WHISPER_MODEL`.

Use:

```bash
docker run --rm -p 9000:9000 \
  -e WHISPER_MODEL=openai/whisper-large-v3-turbo \
  -e WHISPER_DEVICE=cpu \
  whisper-service:local
```

Then verify:

```bash
curl http://localhost:9000/health
```

Expected:

- `model` is `openai/whisper-large-v3-turbo`
- `resolved_model` is `turbo`
