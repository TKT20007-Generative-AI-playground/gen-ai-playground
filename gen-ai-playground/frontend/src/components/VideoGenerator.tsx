import { useCallback, useEffect, useMemo, useState } from "react"
import { Alert, Badge, Button, Card, Group, Loader, NumberInput, Select, SimpleGrid, Stack, Text, Textarea } from "@mantine/core"
import { notifications } from "@mantine/notifications"

import { formatDurationMs } from "../utils/time"
import {
  fetchVideoModels,
  fetchVideoModelStatuses,
  generateVideo,
  type VideoGenerateResponse,
  type VideoModelApiItem,
  type VideoModelStatuses,
} from "../services/videoService"

type ModelStatus = "live" | "starting" | "offline" | "unknown"

const modelStatusPriority: Record<ModelStatus, number> = {
  live: 0,
  starting: 1,
  unknown: 2,
  offline: 3,
}

function buildDropdownData(modelOptions: VideoModelApiItem[], statuses: VideoModelStatuses) {
  return modelOptions
    .map(model => {
      const status = statuses[model.value] ?? "unknown"
      const labelPrefix = status === "live" ? "Live" : status === "starting" ? "Starting" : "Offline"
      return {
        value: model.value,
        label: `${labelPrefix} - ${model.label}`,
        disabled: status !== "live",
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

function getErrorDetail(err: unknown): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === "string") return detail
  if (detail && typeof detail === "object") {
    const message = (detail as { message?: unknown }).message
    if (typeof message === "string") return message
    try {
      return JSON.stringify(detail)
    } catch {
      return "Video generation failed. Please try again."
    }
  }
  return "Video generation failed. Please try again."
}

export default function VideoGenerator() {
  const [modelOptions, setModelOptions] = useState<VideoModelApiItem[]>([])
  const [modelStatuses, setModelStatuses] = useState<VideoModelStatuses>({})
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [prompt, setPrompt] = useState("")
  const [negativePrompt, setNegativePrompt] = useState("")
  const [height, setHeight] = useState<number | "">(480)
  const [width, setWidth] = useState<number | "">(832)
  const [numFrames, setNumFrames] = useState<number | "">(49)
  const [steps, setSteps] = useState<number | "">(20)
  const [guidanceScale, setGuidanceScale] = useState<number | "">(5)
  const [seed, setSeed] = useState<number | "">("")
  const [loading, setLoading] = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const [result, setResult] = useState<VideoGenerateResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchModels = useCallback(async () => {
    try {
      const models = await fetchVideoModels()
      setModelOptions(models)
    } catch {
      setModelOptions([])
    }
  }, [])

  const fetchStatuses = useCallback(async () => {
    try {
      const statuses = await fetchVideoModelStatuses()
      setModelStatuses(statuses)
    } catch {
      setModelStatuses({})
    }
  }, [])

  useEffect(() => {
    fetchModels()
    fetchStatuses()
  }, [fetchModels, fetchStatuses])

  useEffect(() => {
    const intervalId = window.setInterval(fetchStatuses, 30000)
    return () => window.clearInterval(intervalId)
  }, [fetchStatuses])

  useEffect(() => {
    if (selectedModel) return
    const liveModel = modelOptions.find(model => modelStatuses[model.value] === "live")
    if (liveModel) setSelectedModel(liveModel.value)
  }, [modelOptions, modelStatuses, selectedModel])

  useEffect(() => {
    if (!loading || startedAt === null) return
    const intervalId = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt)
    }, 500)
    return () => window.clearInterval(intervalId)
  }, [loading, startedAt])

  const dropdownData = useMemo(
    () => buildDropdownData(modelOptions, modelStatuses),
    [modelOptions, modelStatuses],
  )

  const resultVideoSrc = result
    ? `data:${result.mime_type || "video/mp4"};base64,${result.video_base64}`
    : null

  const selectedStatus = selectedModel ? modelStatuses[selectedModel] ?? "unknown" : null
  const canGenerate = !loading && !!selectedModel && selectedStatus === "live" && prompt.trim().length > 0

  const onGenerate = async () => {
    if (!selectedModel) {
      notifications.show({
        title: "Error",
        message: "Please select a live video model first.",
        color: "red",
      })
      return
    }

    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt) {
      notifications.show({
        title: "Error",
        message: "Please enter a prompt first.",
        color: "red",
      })
      return
    }

    setLoading(true)
    setStartedAt(Date.now())
    setElapsedMs(0)
    setError(null)
    setResult(null)

    try {
      const response = await generateVideo({
        prompt: trimmedPrompt,
        model_path: selectedModel,
        negative_prompt: negativePrompt.trim() || undefined,
        height: typeof height === "number" ? height : undefined,
        width: typeof width === "number" ? width : undefined,
        num_frames: typeof numFrames === "number" ? numFrames : undefined,
        num_inference_steps: typeof steps === "number" ? steps : undefined,
        guidance_scale: typeof guidanceScale === "number" ? guidanceScale : undefined,
        seed: typeof seed === "number" ? seed : undefined,
      })
      setResult(response)
      setElapsedMs(response.generation_time_ms ?? (startedAt ? Date.now() - startedAt : null))
      window.dispatchEvent(new Event("history-update"))
    } catch (err: unknown) {
      setError(getErrorDetail(err))
    } finally {
      setLoading(false)
      setStartedAt(null)
    }
  }

  const onDownload = () => {
    if (!resultVideoSrc) return
    const link = document.createElement("a")
    link.href = resultVideoSrc
    link.download = "generated-video.mp4"
    link.click()
  }

  return (
    <Stack maw={1100} mx="auto" p="md" gap="md">
      <Text c="dimmed" size="sm">
        Generate a short text-to-video clip with a deployed Verda video container.
      </Text>

      <Select
        label="Model"
        placeholder="Select a live video model"
        data={dropdownData}
        value={selectedModel}
        onChange={setSelectedModel}
        searchable
        clearable
        disabled={loading}
      />

      {selectedModel && selectedStatus !== "live" ? (
        <Alert color={selectedStatus === "starting" ? "yellow" : "gray"} variant="light">
          {selectedStatus === "starting"
            ? "This model is starting up. Please wait and try again."
            : "This model is not live. Ask an admin to deploy it from the dashboard."}
        </Alert>
      ) : null}

      <Textarea
        label="Prompt"
        placeholder="A quiet Nordic forest at dawn, low mist, slow cinematic camera movement"
        minRows={4}
        value={prompt}
        onChange={event => setPrompt(event.currentTarget.value)}
        disabled={loading}
      />

      <Textarea
        label="Negative prompt"
        placeholder="Optional"
        minRows={2}
        value={negativePrompt}
        onChange={event => setNegativePrompt(event.currentTarget.value)}
        disabled={loading}
      />

      <SimpleGrid cols={{ base: 1, sm: 2, md: 5 }} spacing="sm">
        <NumberInput label="Height" min={256} max={720} value={height} onChange={value => setHeight(value as number | "")} disabled={loading} />
        <NumberInput label="Width" min={256} max={1280} value={width} onChange={value => setWidth(value as number | "")} disabled={loading} />
        <NumberInput label="Frames" min={9} max={81} value={numFrames} onChange={value => setNumFrames(value as number | "")} disabled={loading} />
        <NumberInput label="Steps" min={4} max={40} value={steps} onChange={value => setSteps(value as number | "")} disabled={loading} />
        <NumberInput label="Seed" value={seed} onChange={value => setSeed(value as number | "")} disabled={loading} />
      </SimpleGrid>

      <NumberInput
        label="Guidance scale"
        min={1}
        max={12}
        step={0.5}
        value={guidanceScale}
        onChange={value => setGuidanceScale(value as number | "")}
        disabled={loading}
      />

      <Group justify="space-between" align="center">
        <Button className="btn-primary" onClick={onGenerate} loading={loading} disabled={!canGenerate}>
          Generate video
        </Button>
        {elapsedMs !== null ? (
          <Text size="sm" c="dimmed">
            {loading ? "Running " : "Completed in "}
            {formatDurationMs(elapsedMs, { compactMinutes: true })}
          </Text>
        ) : null}
      </Group>

      {error ? (
        <Alert color="red" title="Generation failed" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <Card withBorder radius="md" p="xl">
          <Stack align="center" gap="sm">
            <Loader />
            <Text c="dimmed" ta="center">
              Video generation can take several minutes even on a strong GPU.
            </Text>
          </Stack>
        </Card>
      ) : null}

      {result && resultVideoSrc ? (
        <Card withBorder radius="md" p="md">
          <Stack gap="sm">
            <video src={resultVideoSrc} controls style={{ width: "100%", borderRadius: 8 }} />
            <Group justify="space-between">
              <Group gap="xs">
                <Badge variant="light">{result.model}</Badge>
                {typeof result.num_frames === "number" ? <Badge variant="light">{result.num_frames} frames</Badge> : null}
                {typeof result.fps === "number" ? <Badge variant="light">{result.fps} fps</Badge> : null}
              </Group>
              <Button variant="light" onClick={onDownload}>
                Download
              </Button>
            </Group>
          </Stack>
        </Card>
      ) : null}
    </Stack>
  )
}
