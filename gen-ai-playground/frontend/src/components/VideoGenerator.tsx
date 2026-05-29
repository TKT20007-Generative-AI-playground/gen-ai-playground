import { useCallback, useEffect, useMemo, useState } from "react"
import { Alert, Badge, Button, Card, Group, Loader, NumberInput, Select, SimpleGrid, Stack, Text, Textarea } from "@mantine/core"
import { notifications } from "@mantine/notifications"

import ActionStatus from "./ActionStatus"
import { formatDurationMs } from "../utils/time"
import {
  fetchVideoModels,
  fetchVideoModelStatuses,
  generateVideo,
  type VideoGenerateResponse,
  type VideoModelApiItem,
  type VideoModelStatuses,
} from "../services/videoService"
import { deployVideoModel } from "../services/dashboardService"
import { useDeployModel } from "../hooks/useDeployModel"
import { useAuth } from "../context/AuthContext"

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
      const emoji = status === "live" ? "\u{1F7E2}" : status === "starting" ? "\u{1F7E1}" : "\u26AA"
      return {
        value: model.value,
        label: `${emoji} ${model.label}`,
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
    const startTime = Date.now()
    setStartedAt(startTime)
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
      setElapsedMs(response.generation_time_ms ?? (Date.now() - startTime))
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


  const { isLoggedIn } = useAuth()
  const videoService = useMemo(() => ({
    fetchOptions: async () => {
      const models = await fetchVideoModels()
      return models.map(m => ({ value: m.value, label: m.label }))
    },
    deploy: async (modelPath: string) => {
      await deployVideoModel(modelPath)
    },
    fetchStatuses: async () => {
        const statuses = await fetchVideoModelStatuses()
        setModelStatuses(statuses)
      }
  }), [])

  const videoDeploy = useDeployModel(isLoggedIn, videoService)

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
        onChange={next => {
          const liveOnly = next && (modelStatuses[next] ?? "unknown") === "live" ? next : null
          setSelectedModel(liveOnly)
        }}
        searchable
        clearable
        disabled={loading}
        renderOption={({ option }) => (
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
            <span>{option.label}</span>
            {(modelStatuses[option.value] ?? "unknown") !== "live" ? (
              <Button
                type="button"
                variant="filled"
                size="xs"
                color="green"
                loading={videoDeploy.isDeploying(option.value)}
                disabled={videoDeploy.isDeploying(option.value) || (modelStatuses[option.value] ?? "unknown") === "starting"}
                onClick={videoDeploy.handleDeployModel(option.value)}
              >
                Start model
              </Button>
            ) : null}
          </div>
        )}
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
        maxLength={1500}
        value={prompt}
        onChange={event => setPrompt(event.currentTarget.value)}
        disabled={loading}
      />

      <Textarea
        label="Negative prompt"
        placeholder="Optional"
        minRows={2}
        maxLength={1500}
        value={negativePrompt}
        onChange={event => setNegativePrompt(event.currentTarget.value)}
        disabled={loading}
      />

      <SimpleGrid cols={{ base: 1, sm: 2, md: 5 }} spacing="sm">
        <NumberInput label="Height" min={256} max={720} allowDecimal={false} clampBehavior="strict" value={height} onChange={value => setHeight(value as number | "")} disabled={loading} />
        <NumberInput label="Width" min={256} max={1280} allowDecimal={false} clampBehavior="strict" value={width} onChange={value => setWidth(value as number | "")} disabled={loading} />
        <NumberInput label="Frames" min={9} max={81} allowDecimal={false} clampBehavior="strict" value={numFrames} onChange={value => setNumFrames(value as number | "")} disabled={loading} />
        <NumberInput label="Steps" min={4} max={40} allowDecimal={false} clampBehavior="strict" value={steps} onChange={value => setSteps(value as number | "")} disabled={loading} />
        <NumberInput label="Seed" allowDecimal={false} value={seed} onChange={value => setSeed(value as number | "")} disabled={loading} />
      </SimpleGrid>

      <NumberInput
        label="Guidance scale"
        min={1}
        max={12}
        step={0.5}
        clampBehavior="strict"
        value={guidanceScale}
        onChange={value => setGuidanceScale(value as number | "")}
        disabled={loading}
      />

      <Group justify="space-between" align="center">
        <Button className="btn-primary" onClick={onGenerate} disabled={loading || !canGenerate}>
          Generate video
        </Button>
        {!loading && elapsedMs !== null ? (
          <Text size="sm" c="dimmed">
            Completed in {formatDurationMs(elapsedMs, { compactMinutes: true })}
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
            {startedAt && <ActionStatus actionText="Generating video" startTime={startedAt} />}
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
