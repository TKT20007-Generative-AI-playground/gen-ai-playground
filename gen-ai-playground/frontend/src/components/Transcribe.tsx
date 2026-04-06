import axios from "axios"
import { useCallback, useEffect, useRef, useState } from "react"
import { Alert, Button, FileInput, Group, MultiSelect, Text, Textarea } from "@mantine/core"

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
  transcription_time_ms?: number
  model?: string
  resolved_model?: string
  segments?: TranscriptionSegment[]
}

type TranscribeSource = "uploaded" | "recording"
type ModelStatus = "live" | "starting" | "offline" | "unknown"

type ModelOption = {
  value: string
  label: string
}

type ModelTranscriptionState = {
  loading: boolean
  startTime: number | null
  elapsedMs: number | null
  data: TranscriptionResponse | null
  error: string | null
}

const MAX_AUDIO_MODELS = 4

const modelStatusPriority: Record<ModelStatus, number> = {
  live: 0,
  starting: 1,
  unknown: 2,
  offline: 3,
}

function buildDropdownData(modelOptions: ModelOption[], statuses: Record<string, ModelStatus>) {
  return modelOptions
    .map(model => {
      const status = statuses[model.value] ?? "unknown"
      const isLive = status === "live"
      const emoji = isLive ? "\u{1F7E2}" : status === "starting" ? "\u{1F7E1}" : "\u26AA"

      return {
        value: model.value,
        label: `${emoji} ${model.label}`,
        disabled: !isLive,
      }
    })
    .sort((a, b) => {
      const leftStatus = statuses[a.value] ?? "unknown"
      const rightStatus = statuses[b.value] ?? "unknown"
      const statusDiff = modelStatusPriority[leftStatus] - modelStatusPriority[rightStatus]
      if (statusDiff !== 0) return statusDiff
      return a.label.localeCompare(b.label)
    })
}

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
  const [isRecording, setIsRecording] = useState(false)
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTranscribeSource, setActiveTranscribeSource] = useState<TranscribeSource | null>(null)

  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [modelStatuses, setModelStatuses] = useState<Record<string, ModelStatus>>({})
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [resultsByModel, setResultsByModel] = useState<Record<string, ModelTranscriptionState>>({})

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])

  const stopActiveStream = () => {
    if (!streamRef.current) return
    for (const track of streamRef.current.getTracks()) {
      track.stop()
    }
    streamRef.current = null
  }

  useEffect(() => {
    return () => {
      stopActiveStream()
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl)
      }
    }
  }, [recordedAudioUrl])

  const fetchAudioModels = useCallback(async () => {
    try {
      const response = await axios.get(`${backendUrl}/audio/models`, {
        withCredentials: true,
        headers: {
          "X-CSRF-Token": getCsrfToken(),
        },
      })

      const models: ModelOption[] = (response.data.available_models ?? []).map(
        (model: { value: string; label: string }) => ({
          value: model.value,
          label: model.label,
        }),
      )
      setModelOptions(models)
    } catch {
      // silent
    }
  }, [backendUrl])

  const fetchAudioModelStatuses = useCallback(async () => {
    try {
      const response = await axios.get(`${backendUrl}/audio/model-statuses`, {
        withCredentials: true,
        headers: {
          "X-CSRF-Token": getCsrfToken(),
        },
      })
      setModelStatuses(response.data)
    } catch {
      // silent
    }
  }, [backendUrl])

  useEffect(() => {
    fetchAudioModels()
    fetchAudioModelStatuses()
  }, [fetchAudioModels, fetchAudioModelStatuses])

  useEffect(() => {
    const intervalId = window.setInterval(fetchAudioModelStatuses, 30000)
    return () => window.clearInterval(intervalId)
  }, [fetchAudioModelStatuses])

  useEffect(() => {
    setResultsByModel(prev => {
      const next: Record<string, ModelTranscriptionState> = {}
      for (const model of selectedModels) {
        if (prev[model]) {
          next[model] = prev[model]
        }
      }
      return next
    })
  }, [selectedModels])

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

  const extractErrorDetail = (err: unknown): string => {
    const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
    if (typeof detail === "string") {
      return detail
    }
    if (detail && typeof detail === "object") {
      const message = (detail as { message?: unknown }).message
      if (typeof message === "string") {
        return message
      }
      try {
        return JSON.stringify(detail)
      } catch {
        return "Transcription failed. Please try again."
      }
    }
    return "Transcription failed. Please try again."
  }

  const getModelLabel = (modelValue: string): string => {
    return modelOptions.find(model => model.value === modelValue)?.label ?? modelValue
  }

  const getModelStatusAlertColor = (status: ModelStatus): string => {
    if (status === "starting") return "yellow"
    return "gray"
  }

  const getModelStatusMessage = (status: ModelStatus): string | null => {
    if (status === "live") return null
    if (status === "starting") return "This model is starting up. It may take a minute or two."
    if (status === "offline") return "This model is not deployed. Ask an admin to deploy it from the dashboard."
    return "Model status is currently unknown."
  }

  const dropdownData = buildDropdownData(modelOptions, modelStatuses)

  const transcribeFile = async (targetFile: File, source: TranscribeSource) => {
    if (selectedModels.length === 0) {
      setError("Please select at least one live audio model first.")
      return
    }

    setError(null)
    setActiveTranscribeSource(source)
    setIsLoading(true)

    const modelsToRun = [...selectedModels]
    setResultsByModel(
      modelsToRun.reduce(
        (acc, modelValue) => {
          acc[modelValue] = {
            loading: true,
            startTime: Date.now(),
            elapsedMs: null,
            data: null,
            error: null,
          }
          return acc
        },
        {} as Record<string, ModelTranscriptionState>,
      ),
    )

    await Promise.all(
      modelsToRun.map(async modelValue => {
        const startedAt = Date.now()
        const formData = new FormData()
        formData.append("file", targetFile)
        formData.append("task", "transcribe")
        formData.append("model_path", modelValue)

        try {
          const response = await axios.post<TranscriptionResponse>(`${backendUrl}/audio/transcribe`, formData, {
            withCredentials: true,
            headers: {
              "X-CSRF-Token": getCsrfToken(),
            },
            timeout: 300000,
          })

          setResultsByModel(prev => ({
            ...prev,
            [modelValue]: {
              loading: false,
              startTime: prev[modelValue]?.startTime ?? null,
              elapsedMs: Date.now() - startedAt,
              data: response.data,
              error: null,
            },
          }))
        } catch (err: unknown) {
          setResultsByModel(prev => ({
            ...prev,
            [modelValue]: {
              loading: false,
              startTime: prev[modelValue]?.startTime ?? null,
              elapsedMs: Date.now() - startedAt,
              data: null,
              error: extractErrorDetail(err),
            },
          }))
        }
      }),
    )

    setIsLoading(false)
    setActiveTranscribeSource(null)
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
    setResultsByModel({})
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
        setIsRecording(false)
        setRecordingStartTime(null)
        stopActiveStream()
        setError("Recording failed. Please try again.")
      }

      recorder.start()
      setIsRecording(true)
      setRecordingStartTime(Date.now())
    } catch {
      stopActiveStream()
      setIsRecording(false)
      setRecordingStartTime(null)
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
  }

  const canStartRecording = !isLoading && !isRecording
  const canStopRecording = !isLoading && isRecording
  const canTranscribeUploaded = !isLoading && !isRecording && !!file && selectedModels.length > 0
  const canTranscribeRecording = !isLoading && !isRecording && !!recordedBlob && selectedModels.length > 0
  const modelGridTemplateColumns =
    selectedModels.length === 1
      ? "minmax(320px, 1fr)"
      : selectedModels.length === 2
        ? "repeat(2, minmax(320px, 1fr))"
        : "repeat(auto-fit, minmax(280px, 1fr))"

  const recordingButtonText = isRecording ? "Recording..." : "Start recording"

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "20px",
        boxSizing: "border-box",
        gap: "16px",
      }}
    >
      <Text c="dimmed" size="sm" mb={6}>
        Select up to {MAX_AUDIO_MODELS} models for transcription.
      </Text>

      <MultiSelect
        label="Models"
        placeholder={selectedModels.length > 0 ? "" : "Select models"}
        data={dropdownData}
        value={selectedModels}
        onChange={setSelectedModels}
        maxValues={MAX_AUDIO_MODELS}
        searchable
        clearable
        disabled={isLoading || isRecording}
      />

      {selectedModels.length > 0 ? (
        <>
          <div
            style={{
              display: "grid",
              gap: "20px",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              width: "100%",
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "8px",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <Text fw={700}>Upload audio file</Text>
              <FileInput
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
            </div>

            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "8px",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <Text fw={700}>Record audio</Text>
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
                  ) : null}

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
            </div>
          </div>

          {error ? (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          ) : null}

          <div
            style={{
              display: "grid",
              gap: "20px",
              gridTemplateColumns: modelGridTemplateColumns,
              width: "100%",
              alignItems: "stretch",
            }}
          >
            {selectedModels.map(modelValue => {
              const modelResult = resultsByModel[modelValue]
              const status = modelStatuses[modelValue] ?? "unknown"
              const statusMessage = getModelStatusMessage(status)

              return (
                <div
                  key={modelValue}
                  style={{
                    minWidth: 0,
                    width: "100%",
                    maxWidth: "100%",
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <Text fw={700} mb={8}>
                    {getModelLabel(modelValue)}
                  </Text>

                  {statusMessage ? (
                    <Alert
                      color={getModelStatusAlertColor(status)}
                      variant="light"
                      mb={8}
                      p="xs"
                      styles={{ message: { fontSize: 13 } }}
                    >
                      {statusMessage}
                    </Alert>
                  ) : null}

                  <div
                    style={{
                      flex: 1,
                      minHeight: "300px",
                      maxHeight: "65vh",
                      border: "1px solid #ddd",
                      borderRadius: "8px",
                      padding: "12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      overflowY: "auto",
                    }}
                  >
                    {modelResult?.loading && modelResult.startTime ? (
                      <ActionStatus actionText="Transcribing" startTime={modelResult.startTime} />
                    ) : null}

                    {modelResult?.error ? (
                      <Alert color="red" variant="light">
                        {modelResult.error}
                      </Alert>
                    ) : null}

                    {modelResult?.data ? (
                      <>
                        <Textarea value={modelResult.data.text} readOnly autosize minRows={6} maxRows={16} />

                        <Text size="sm" c="dimmed">
                          Language: {modelResult.data.language ?? "unknown"}
                        </Text>
                        <Text size="sm" c="dimmed">
                          Model: {modelResult.data.model ?? "unknown"}
                          {modelResult.data.resolved_model
                            ? ` (resolved: ${modelResult.data.resolved_model})`
                            : ""}
                        </Text>
                        {typeof modelResult.data.duration === "number" ? (
                          <Text size="sm" c="dimmed">
                            Audio duration: {formatDurationMs(modelResult.data.duration * 1000, { compactMinutes: true })}
                          </Text>
                        ) : null}
                        {(typeof modelResult.data.transcription_time_ms === "number" ||
                          typeof modelResult.elapsedMs === "number") ? (
                          <Text size="sm" c="dimmed">
                            Transcription time: {formatDurationMs(
                              modelResult.data.transcription_time_ms ?? modelResult.elapsedMs ?? 0,
                              { compactMinutes: true },
                            )}
                          </Text>
                        ) : null}
                        {modelResult.data.segments?.length ? (
                          <Text size="sm" c="dimmed">
                            Segments: {modelResult.data.segments.length}
                          </Text>
                        ) : null}
                      </>
                    ) : null}

                    {!modelResult ? (
                      <Text size="sm" c="dimmed">
                        Run transcription to see this model output.
                      </Text>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : null}
    </div>
  )
}
