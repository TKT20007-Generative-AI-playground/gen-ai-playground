# Whisper Service (Phase 1)

Standalone containerized transcription API using faster-whisper.

## Endpoints

- `GET /health`: basic status and model config
- `POST /transcribe`: multipart file upload transcription

## Environment variables

- `WHISPER_MODEL` (default: `whisper-large-v3-turbo`)
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
  -e WHISPER_DEVICE=cuda \
  -e WHISPER_COMPUTE_TYPE=float16 \
  whisper-service:local
```

The image installs NVIDIA CUDA runtime libraries (`nvidia-cublas-cu12`,
`nvidia-cudnn-cu12`) so GPU transcription can load `libcublas.so.12`.
The container runs as a non-root user (`appuser`) at runtime.

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
  "transcription_time_ms": 1530,
  "segments": [
    {"start": 0.0, "end": 1.2, "text": "hello"},
    {"start": 1.2, "end": 2.0, "text": " world"}
  ],
  "configured_model": "openai/whisper-large-v3-turbo",
  "model": "whisper-large-v3-turbo"
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
  -e WHISPER_DEVICE=cuda \
  -e WHISPER_COMPUTE_TYPE=float16 \
  whisper-service:local
```

If you see an error like:

`Library libcublas.so.12 is not found or cannot be loaded`

rebuild and publish a fresh image tag, then redeploy template:

```bash
export GHCR_OWNER=tkt20007-generative-ai-playground
export GHCR_REPO=gen-ai-playground
export IMAGE=ghcr.io/${GHCR_OWNER}/${GHCR_REPO}/whisper-service:v6

# Requires a token with write:packages scope.
echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_USER" --password-stdin

docker build -t "$IMAGE" ./whisper-service
docker push "$IMAGE"
```

Use lowercase values for `GHCR_OWNER` and `GHCR_REPO` even if your GitHub org/repo has uppercase letters.

The backend whisper templates are pinned to `ghcr.io/tkt20007-generative-ai-playground/gen-ai-playground/whisper-service:v6`.

If your cluster or runtime cannot pull the image, ensure the GHCR package is visible to your deploy target:

- Public package: set package visibility to public in GitHub Packages.
- Private package: configure an image pull secret/token in your deployment platform.

Then verify:

```bash
curl http://localhost:9000/health
```

Expected:

- `configured_model` reflects the raw `WHISPER_MODEL` env value
- `model` is the normalized model identifier used by the service
