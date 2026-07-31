import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Box, Group, Paper, Text, ScrollArea, Switch, Select, Button, Alert, Stack, Slider } from "@mantine/core"
import { streamVision, type VisionChatMessagePayload, fetchVisionModels, fetchVisionModelStatuses, type VisionModelApiItem, type VisionModelStatuses } from "../services/visionService"
import { deployVisionModel, stopDashboardContainer } from "../services/dashboardService"
import { useDeployModel } from "../hooks/useDeployModel"
import { useAuth } from "../context/AuthContext"

interface WebcamAIAnalysisProps {
  opened?: boolean
}

type ModelStatus = "live" | "starting" | "offline" | "unknown"

const modelStatusPriority: Record<ModelStatus, number> = {
  live: 0,
  starting: 1,
  unknown: 2,
  offline: 3,
}

function buildDropdownData(modelOptions: VisionModelApiItem[], statuses: VisionModelStatuses) {
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

export default function WebcamAIAnalysis({}: WebcamAIAnalysisProps) {
  const [isActive, setIsActive] = useState(false)
  const [output, setOutput] = useState<string>("")
  const [modelOptions, setModelOptions] = useState<VisionModelApiItem[]>([])
  const [modelStatuses, setModelStatuses] = useState<VisionModelStatuses>({})
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [intervalMs, setIntervalMs] = useState(5000)
  const prompt = "Describe what you see in this image in detail."

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const loopRef = useRef<boolean>(false)
  const mountedRef = useRef<boolean>(true)
  const selectedModelRef = useRef<string | null>(null)

  const fetchModels = useCallback(async () => {
    try {
      const models = await fetchVisionModels()
      setModelOptions(models)
    } catch {
      setModelOptions([])
    }
  }, [])

  const fetchStatuses = useCallback(async () => {
    try {
      const statuses = await fetchVisionModelStatuses()
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

  // Keep ref in sync with selectedModel for unmount cleanup
  useEffect(() => {
    selectedModelRef.current = selectedModel
  }, [selectedModel])

  // Auto-select first live model
  useEffect(() => {
    if (selectedModel) return
    const liveModel = modelOptions.find(model => modelStatuses[model.value] === "live")
    if (liveModel) setSelectedModel(liveModel.value)
  }, [modelOptions, modelStatuses, selectedModel])

  const dropdownData = useMemo(
    () => buildDropdownData(modelOptions, modelStatuses),
    [modelOptions, modelStatuses],
  )

  const selectedStatus = selectedModel ? modelStatuses[selectedModel] ?? "unknown" : null
  const canAnalyze = !!selectedModel && selectedStatus === "live"

  const { isLoggedIn } = useAuth()
  const visionService = useMemo(() => ({
    fetchOptions: async () => {
      const models = await fetchVisionModels()
      return models.map(m => ({ value: m.value, label: m.label }))
    },
    deploy: async (modelPath: string) => {
      await deployVisionModel(modelPath)
    },
    fetchStatuses: async () => {
      const statuses = await fetchVisionModelStatuses()
      setModelStatuses(statuses)
    }
  }), [])

  const visionDeploy = useDeployModel(isLoggedIn, visionService)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopWebcam()
      // Do not stop deployments automatically on unmount; deployments are admin-managed/shared.

    }
  }, [])

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      setIsActive(true)
      loopRef.current = true
      runAnalysisLoop()
    } catch (err) {
      console.error("Failed to access webcam:", err)
    }
  }

  const stopWebcam = () => {
    setIsActive(false)
    loopRef.current = false
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }

  const grabFrame = (): string | null => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return null

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
    }

    const ctx = canvas.getContext("2d")
    if (!ctx) return null

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/jpeg", 0.6)
  }

  const runAnalysisLoop = async () => {
    if (!loopRef.current) return

    const base64Image = grabFrame()
    if (!base64Image) {
      setTimeout(runAnalysisLoop, intervalMs)
      return
    }

    const messages: VisionChatMessagePayload[] = [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: base64Image } },
          { type: "text", text: prompt }
        ]
      }
    ]

    try {
      setOutput("")

      console.log("[Vision] Starting stream request...")
      const iterator = await streamVision({
        deployment_name: selectedModel || "",
        messages,
        max_tokens: 256,
        temperature: 0.1
      }, loopRef)
      console.log("[Vision] Got iterator, starting to read chunks...")

      let currentReply = ""
      let chunkCount = 0
      for await (const chunk of iterator) {
        if (!loopRef.current) break
        chunkCount++
        if (chunkCount <= 3) {
          console.log(`[Vision] chunk[${chunkCount}]:`, chunk.substring(0, 80))
        }
        currentReply += chunk
        setOutput(currentReply)
      }
      console.log(`[Vision] Stream ended, total chunks: ${chunkCount}, reply length: ${currentReply.length}`)
    } catch (e) {
      console.error("[Vision] Stream failed", e)
      setOutput(`Error: ${e instanceof Error ? e.message : String(e)}`)
    }

    if (loopRef.current) {
      setTimeout(runAnalysisLoop, intervalMs)
    }
  }

  return (
    <Stack maw={1200} mx="auto" p="md" gap="md">
      <Text c="dimmed" size="sm">
        Connect your webcam and use a vision-language model to describe the live feed.
      </Text>

      <Text size="sm" fw={500}>Analysis Interval ({intervalMs / 1000}s)</Text>
      <Slider
        value={intervalMs}
        onChange={setIntervalMs}
        min={1000}
        max={30000}
        step={1000}
        disabled={isActive}
        marks={[
          { value: 1000, label: "1s" },
          { value: 5000, label: "5s" },
          { value: 10000, label: "10s" },
          { value: 20000, label: "20s" },
          { value: 30000, label: "30s" },
        ]}
      />

      <Select
        label="Model"
        placeholder="Select a live vision model"
        data={dropdownData}
        value={selectedModel}
        onChange={next => {
          const liveOnly = next && (modelStatuses[next] ?? "unknown") === "live" ? next : null
          setSelectedModel(liveOnly)
        }}
        searchable
        clearable
        disabled={isActive}
        renderOption={({ option }) => (
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
            <span>{option.label}</span>
            {(modelStatuses[option.value] ?? "unknown") !== "live" ? (
              <Button
                type="button"
                variant="filled"
                size="xs"
                color="green"
                loading={visionDeploy.isDeploying(option.value)}
                disabled={visionDeploy.isDeploying(option.value) || (modelStatuses[option.value] ?? "unknown") === "starting"}
                onClick={visionDeploy.handleDeployModel(option.value)}
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

      <Group mb="md" style={{ justifyContent: 'space-between' }}>
        <Text size="xl" style={{ fontWeight: 'bold' }}>Live Webcam Feed</Text>
        <Switch
          label="Enable Analysis"
          checked={isActive}
          disabled={!canAnalyze && !isActive}
          onChange={(e) => e.currentTarget.checked ? startWebcam() : stopWebcam()}
        />
      </Group>

      <Group grow style={{ flex: 1, alignItems: 'flex-start' }} align="flex-start">
        <Paper shadow="sm" p="md" withBorder style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Text mb="sm" fw={500}>Webcam Feed</Text>
          <Box style={{ position: 'relative', width: '100%', paddingBottom: '75%', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden' }}>
            <video
              ref={videoRef}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
              muted
              playsInline
            />
            <canvas ref={canvasRef} style={{ display: "none" }} />
          </Box>
        </Paper>

        <Paper shadow="sm" p="md" withBorder style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
          <Text mb="sm" fw={500}>Live Analysis</Text>
          <ScrollArea style={{ flex: 1, backgroundColor: '#f8f9fa', padding: '16px', borderRadius: '4px' }}>
            {output || <Text c="dimmed">Waiting for feed...</Text>}
          </ScrollArea>
        </Paper>
      </Group>
    </Stack>
  )
}
