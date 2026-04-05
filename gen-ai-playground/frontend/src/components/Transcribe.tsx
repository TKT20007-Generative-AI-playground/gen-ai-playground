import axios from "axios"
import { useEffect, useRef, useState } from "react"
import { Alert, Button, FileInput, Group, Paper, Stack, Text, Textarea, Title } from "@mantine/core"

import ActionStatus from "./ActionStatus"
import { formatDurationMs } from "../utils/time"

type TranscriptionSegment = {
  start: number
  end: number
  text: string
}

type TranscriptionResponse = {
  text: string
  language?: string
  duration?: number
  model?: string
  resolved_model?: string
  segments?: TranscriptionSegment[]
}

type TranscribeSource = "uploaded" | "recording"

const getCsrfToken = (): string => {
  const value = `; ${document.cookie}`
  const parts = value.split(`; csrf_token=`)
  if (parts.length === 2) return parts.pop()!.split(";").shift()!
  return ""
}

export default function Transcribe() {
  const backendUrl = import.meta.env.VITE_API_URL || "http://localhost:8000"
  const recordingSupported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"

  const [file, setFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [transcribeStartTime, setTranscribeStartTime] = useState<number | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null)
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TranscriptionResponse | null>(null)
  const [activeTranscribeSource, setActiveTranscribeSource] = useState<TranscribeSource | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<number | null>(null)

  const clearRecordingTimer = () => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
  }

  const stopActiveStream = () => {
    if (!streamRef.current) return
    for (const track of streamRef.current.getTracks()) {
      track.stop()
    }
    streamRef.current = null
  }

  useEffect(() => {
    return () => {
      clearRecordingTimer()
      stopActiveStream()
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl)
      }
    }
  }, [recordedAudioUrl])

  const replaceRecordedAudioUrl = (nextUrl: string | null) => {
    setRecordedAudioUrl((prev: string | null) => {
      if (prev) URL.revokeObjectURL(prev)
      return nextUrl
    })
  }

  const toTranscribeFile = (blob: Blob): File => {
    const mimeType = blob.type || "audio/webm"
    let extension = "webm"
    if (mimeType.includes("ogg")) extension = "ogg"
    if (mimeType.includes("wav")) extension = "wav"
    if (mimeType.includes("mp4") || mimeType.includes("m4a")) extension = "m4a"
    return new File([blob], `recording.${extension}`, { type: mimeType })
  }

  const transcribeFile = async (targetFile: File, source: TranscribeSource) => {
    setError(null)
    setResult(null)
    setActiveTranscribeSource(source)
    setIsLoading(true)
    setTranscribeStartTime(Date.now())

    const formData = new FormData()
    formData.append("file", targetFile)
    formData.append("task", "transcribe")

    try {
      const response = await axios.post<TranscriptionResponse>(`${backendUrl}/audio/transcribe`, formData, {
        withCredentials: true,
        headers: {
          "X-CSRF-Token": getCsrfToken(),
        },
        timeout: 300000,
      })

      setResult(response.data)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof detail === "string" ? detail : "Transcription failed. Please try again.")
    } finally {
      setIsLoading(false)
      setTranscribeStartTime(null)
      setActiveTranscribeSource(null)
    }
  }

  const onTranscribeUploaded = async () => {
    if (!file) {
      setError("Please choose an audio file first.")
      return
    }
    await transcribeFile(file, "uploaded")
  }

  const onTranscribeRecording = async () => {
    if (!recordedBlob) {
      setError("Please record audio first.")
      return
    }
    await transcribeFile(toTranscribeFile(recordedBlob), "recording")
  }

  const startRecording = async () => {
    if (!recordingSupported) {
      setError("Audio recording is not supported in this browser.")
      return
    }
    if (isLoading || isRecording) return

    setError(null)
    setResult(null)
    setRecordedBlob(null)
    replaceRecordedAudioUrl(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const preferredMimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
      const selectedMimeType = preferredMimeTypes.find(type => MediaRecorder.isTypeSupported(type))
      const recorder = selectedMimeType
        ? new MediaRecorder(stream, { mimeType: selectedMimeType })
        : new MediaRecorder(stream)

      mediaRecorderRef.current = recorder
      recordingChunksRef.current = []

      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        clearRecordingTimer()
        setIsRecording(false)
        setRecordingStartTime(null)

        const outputType = recorder.mimeType || recordingChunksRef.current[0]?.type || "audio/webm"
        const outputBlob = new Blob(recordingChunksRef.current, { type: outputType })

        stopActiveStream()

        if (!outputBlob.size) {
          setError("No audio captured. Please try recording again.")
          return
        }

        setRecordedBlob(outputBlob)
        replaceRecordedAudioUrl(URL.createObjectURL(outputBlob))
      }

      recorder.onerror = () => {
        clearRecordingTimer()
        setIsRecording(false)
        setRecordingStartTime(null)
        stopActiveStream()
        setError("Recording failed. Please try again.")
      }

      recorder.start()
      const startedAt = Date.now()
      setIsRecording(true)
      setRecordingStartTime(startedAt)
      setRecordingElapsedMs(0)
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingElapsedMs(Date.now() - startedAt)
      }, 100)
    } catch {
      stopActiveStream()
      setIsRecording(false)
      setRecordingStartTime(null)
      clearRecordingTimer()
      setError("Microphone permission denied or unavailable. Please allow microphone access and retry.")
    }
  }

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === "inactive") return
    recorder.stop()
  }

  const clearRecording = () => {
    setRecordedBlob(null)
    replaceRecordedAudioUrl(null)
    setRecordingElapsedMs(0)
  }

  const recordingDurationLabel = formatDurationMs(recordingElapsedMs, {
    decimals: 1,
    compactMinutes: true,
  })

  const canStartRecording = !isLoading && !isRecording
  const canStopRecording = !isLoading && isRecording
  const canTranscribeUploaded = !isLoading && !isRecording && !!file
  const canTranscribeRecording = !isLoading && !isRecording && !!recordedBlob

  const recordingButtonText = isRecording ? "Recording..." : "Start recording"

  return (
    <Stack gap="md" style={{ maxWidth: 900, margin: "0 auto" }}>
      <Title order={3}>Audio Transcription</Title>
      <Text c="dimmed" size="sm">
        Upload an audio file or record with your microphone, then transcribe it using the Whisper service.
      </Text>

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Text fw={600}>Upload audio file</Text>
          <FileInput
            label="Audio file"
            placeholder="Choose audio file"
            value={file}
            onChange={setFile}
            accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm"
            disabled={isLoading || isRecording}
          />

          <Button
            onClick={onTranscribeUploaded}
            loading={isLoading && activeTranscribeSource === "uploaded"}
            disabled={!canTranscribeUploaded}
          >
            Transcribe uploaded file
          </Button>
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Text fw={600}>Record audio</Text>
          {!recordingSupported ? (
            <Alert color="yellow" variant="light">
              This browser does not support microphone recording for this page.
            </Alert>
          ) : (
            <>
              <Group>
                <Button onClick={startRecording} disabled={!canStartRecording}>
                  {recordingButtonText}
                </Button>
                <Button color="orange" onClick={stopRecording} disabled={!canStopRecording}>
                  Stop recording
                </Button>
                <Button variant="default" onClick={clearRecording} disabled={isRecording || !recordedBlob}>
                  Clear recording
                </Button>
              </Group>

              {isRecording && recordingStartTime ? (
                <ActionStatus actionText="Recording" startTime={recordingStartTime} />
              ) : (
                <Text size="sm" c="dimmed">
                  Recorded duration: {recordingDurationLabel}
                </Text>
              )}

              {recordedAudioUrl ? <audio controls src={recordedAudioUrl} /> : null}

              <Button
                onClick={onTranscribeRecording}
                loading={isLoading && activeTranscribeSource === "recording"}
                disabled={!canTranscribeRecording}
              >
                Transcribe recording
              </Button>
            </>
          )}
        </Stack>
      </Paper>

      {isLoading && transcribeStartTime ? <ActionStatus actionText="Transcribing" startTime={transcribeStartTime} /> : null}

      {error ? (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      ) : null}

      {result ? (
        <Paper withBorder p="md" radius="md">
          <Stack gap="xs">
            <Text fw={600}>Transcript</Text>
            <Textarea value={result.text} readOnly autosize minRows={6} maxRows={16} />

            <Text size="sm" c="dimmed">
              Language: {result.language ?? "unknown"}
            </Text>
            <Text size="sm" c="dimmed">
              Model: {result.model ?? "unknown"}
              {result.resolved_model ? ` (resolved: ${result.resolved_model})` : ""}
            </Text>
            {typeof result.duration === "number" ? (
              <Text size="sm" c="dimmed">
                Audio duration: {result.duration.toFixed(2)}s
              </Text>
            ) : null}
            {result.segments?.length ? (
              <Text size="sm" c="dimmed">
                Segments: {result.segments.length}
              </Text>
            ) : null}
          </Stack>
        </Paper>
      ) : null}
    </Stack>
  )
}
