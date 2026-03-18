import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react"
import axios from "axios"
import { PromptTextBox } from "./PromptTextBox"
import { Text, SimpleGrid, Stack, Button } from "@mantine/core"
import { MODELS, getModelDisplayName } from "../constants/models"
import ModelSelector from "./ModelSelector"
import PhotoArea from "./PhotoArea"
import ActionStatus from "./ActionStatus"
import { useNavigate } from "react-router-dom"
import {
  getAxiosRequestErrorMessage,
  IMAGE_REQUEST_TIMEOUT_MS,
  parseGenerationTimeMs,
} from "../api/imageRequests"
import { formatDurationMs } from "../utils/time"

type SelectedModels = [string | null, string | null]

type ModelRequestStateHandlers = {
  controllerRef: MutableRefObject<AbortController | null>
  setStartTime: Dispatch<SetStateAction<number | null>>
  setGenerationTime: Dispatch<SetStateAction<number | null>>
  setError: Dispatch<SetStateAction<string | null>>
  setIsLoading: Dispatch<SetStateAction<boolean>>
  setBlob: Dispatch<SetStateAction<Blob | null>>
  replaceImageUrl: (next: string | null) => void
}

export default function ImageGenerator() {

  const navigate = useNavigate()

  const [prompt, setPrompt] = useState("")
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageUrl2, setImageUrl2] = useState<string | null>(null)
  const [blob1, setBlob1] = useState<Blob | null>(null)
  const [blob2, setBlob2] = useState<Blob | null>(null)
  const [selectedModels, setSelectedModels] = useState<SelectedModels>([null, null])
  const [isLoading1, setIsLoading1] = useState(false)
  const [isLoading2, setIsLoading2] = useState(false)
  const [startTime1, setStartTime1] = useState<number | null>(null)
  const [startTime2, setStartTime2] = useState<number | null>(null)
  const [generationTime1, setGenerationTime1] = useState<number | null>(null)
  const [generationTime2, setGenerationTime2] = useState<number | null>(null)
  const [error1, setError1] = useState<string | null>(null)
  const [error2, setError2] = useState<string | null>(null)
  // Whether each box should be visible (stays true after generation completes)
  const [showBox1, setShowBox1] = useState(false)
  const [showBox2, setShowBox2] = useState(false)

  const imageUrlRef = useRef<string | null>(null)
  const imageUrl2Ref = useRef<string | null>(null)
  const model1ControllerRef = useRef<AbortController | null>(null)
  const model2ControllerRef = useRef<AbortController | null>(null)

  const backendUrl = import.meta.env.VITE_API_URL
  const models = MODELS

  const SELECTOR_GAP = 18
  const SELECTOR_WIDTH = 500
  const CONTROLS_MAX_WIDTH = SELECTOR_WIDTH * 2 + SELECTOR_GAP
  const PROMPT_MAX_WIDTH = CONTROLS_MAX_WIDTH

  function setModelAtIndex(index: 0 | 1, value: string | null) {
    setSelectedModels((prev) => {
      const next: SelectedModels = [...prev] as SelectedModels
      next[index] = value
      return next
    })
  }

  const model1 = selectedModels[0] ?? undefined
  const model2 = selectedModels[1] ?? undefined

  const abortActiveRequests = useCallback(() => {
    model1ControllerRef.current?.abort()
    model2ControllerRef.current?.abort()
  }, [])

  useEffect(() => {
    return () => {
      abortActiveRequests()
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current)
      if (imageUrl2Ref.current) URL.revokeObjectURL(imageUrl2Ref.current)
    }
  }, [abortActiveRequests])

  function replaceImageUrl(next: string | null) {
    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      imageUrlRef.current = next
      return next
    })
  }

  function replaceImageUrl2(next: string | null) {
    setImageUrl2((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      imageUrl2Ref.current = next
      return next
    })
  }

  async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve((reader.result as string).split(",")[1])
      reader.readAsDataURL(blob)
    })
  }

  async function fetchTwoGeneratedImages(nextPrompt: string) {
    abortActiveRequests()

    setPrompt(nextPrompt)

    replaceImageUrl(null)
    replaceImageUrl2(null)
    setBlob1(null)
    setBlob2(null)
    setGenerationTime1(null)
    setGenerationTime2(null)
    setError1(null)
    setError2(null)
    setShowBox1(false)
    setShowBox2(false)

    if (!model1 && !model2) {
      alert("Please select a model")
      return
    }

    // Show boxes and start loading immediately for selected models
    if (model1) {
      setShowBox1(true)
      setIsLoading1(true)
    }
    if (model2) {
      setShowBox2(true)
      setIsLoading2(true)
    }

    // Fire requests independently so images appear as soon as each is ready.
    const startModelRequest = (
      model: string,
      {
        controllerRef,
        setStartTime,
        setGenerationTime,
        setError,
        setIsLoading,
        setBlob,
        replaceImageUrl,
      }: ModelRequestStateHandlers,
    ) => {
      const controller = new AbortController()
      controllerRef.current = controller
      setStartTime(Date.now())

      axios.post(
        `${backendUrl}/images/generate`,
        { prompt: nextPrompt, model },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          responseType: "blob",
          timeout: IMAGE_REQUEST_TIMEOUT_MS,
          signal: controller.signal,
        },
      ).then((response) => {
        window.dispatchEvent(new Event("history-update"));
        if (controllerRef.current !== controller) return

        const timeMs = parseGenerationTimeMs(response.headers as Record<string, unknown>)
        setGenerationTime(timeMs)
        setError(null)
        // Stop the in-box timer as soon as backend confirms model generation is done.
        setIsLoading(false)
        setStartTime(null)

        const blob = response.data as Blob
        setBlob(blob)
        replaceImageUrl(URL.createObjectURL(blob))
      }).catch((err) => {
        if (controllerRef.current !== controller) return

        if (axios.isCancel(err)) {
          return
        }

        console.error(err)
        setError(
          getAxiosRequestErrorMessage(
            err,
            "Image generation timed out",
            "Image generation failed",
          ),
        )
        setIsLoading(false)
        setStartTime(null)
      }).finally(() => {
        if (controllerRef.current === controller) {
          controllerRef.current = null
        }
      })
    }

    if (model1) {
      startModelRequest(model1, {
        controllerRef: model1ControllerRef,
        setStartTime: setStartTime1,
        setGenerationTime: setGenerationTime1,
        setError: setError1,
        setIsLoading: setIsLoading1,
        setBlob: setBlob1,
        replaceImageUrl,
      })
    }

    if (model2) {
      startModelRequest(model2, {
        controllerRef: model2ControllerRef,
        setStartTime: setStartTime2,
        setGenerationTime: setGenerationTime2,
        setError: setError2,
        setIsLoading: setIsLoading2,
        setBlob: setBlob2,
        replaceImageUrl: replaceImageUrl2,
      })
    }
  }

  return (
    <Stack align="center" w="100%" gap="md">
      <div style={{ width: "100%", maxWidth: CONTROLS_MAX_WIDTH }}>
        <Text size="sm" c="dimmed" mb="md">
          Select at least 1 model for image generation
        </Text>

        <SimpleGrid
          cols={{ base: 1, md: 2 }}
          spacing={SELECTOR_GAP}
          style={{ justifyItems: "center" }}
        >
          <ModelSelector
            label="Model 1"
            data-testid="model-1-selector"
            models={models}
            value={model1}
            onChange={(value) => setModelAtIndex(0, value)}
            width={SELECTOR_WIDTH}
          />

          <ModelSelector
            label="Model 2"
            data-testid="model-2-selector"
            models={models}
            value={model2}
            onChange={(value) => setModelAtIndex(1, value)}
            width={SELECTOR_WIDTH}
            placeholder="Select model (optional)"
          />
        </SimpleGrid>
      </div>

      <div style={{ width: "100%", maxWidth: PROMPT_MAX_WIDTH }}>
        <PromptTextBox onSubmit={fetchTwoGeneratedImages} value={prompt} onChange={setPrompt} usage="Create image" />
      </div>

      {(showBox1 || showBox2) && (
        <div style={{ width: "100%", maxWidth: CONTROLS_MAX_WIDTH }}>
          <SimpleGrid cols={{ base: 1, md: showBox1 && showBox2 ? 2 : 1 }} spacing="md">

            {showBox1 && (
              <Stack gap="xs" align="center">
                <PhotoArea
                  src={imageUrl}
                  alt="Generated image 1"
                  header={
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 8 }}>
                      <Text fw={600}>Model: {getModelDisplayName(model1)}</Text>
                      {generationTime1 != null && (
                        <Text size="sm" c="dimmed">
                          Generation time: {formatDurationMs(generationTime1)}
                        </Text>
                      )}
                    </div>
                  }
                  height={420}
                  placeholder={
                    isLoading1 && startTime1
                      ? <ActionStatus actionText="Generating" startTime={startTime1} />
                      : error1
                        ? <Text size="sm" c="red" ta="center">{error1}</Text>
                        : undefined
                  }
                />

                {imageUrl && (
                  <Button
                    onClick={async () => {
                      if (!blob1) return
                      const base64 = await blobToBase64(blob1)
                      navigate("/playground/ImageEditor", {
                        state: {
                          imageToEdit: {
                            image_data: base64,
                            image_type: "png",
                            prompt,
                            model: model1,
                            id: null
                          }
                        }
                      })
                    }}
                  >
                    Edit image
                  </Button>
                )}
              </Stack>
            )}

            {showBox2 && (
              <Stack gap="xs" align="center">
                <PhotoArea
                  src={imageUrl2}
                  alt="Generated image 2"
                  header={
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 8 }}>
                      <Text fw={600}>Model: {getModelDisplayName(model2)}</Text>
                      {generationTime2 != null && (
                        <Text size="sm" c="dimmed">
                          Generation time: {formatDurationMs(generationTime2)}
                        </Text>
                      )}
                    </div>
                  }
                  height={420}
                  placeholder={
                    isLoading2 && startTime2
                      ? <ActionStatus actionText="Generating" startTime={startTime2} />
                      : error2
                        ? <Text size="sm" c="red" ta="center">{error2}</Text>
                        : undefined
                  }
                />

                {imageUrl2 && (
                  <Button
                    onClick={async () => {
                      if (!blob2) return
                      const base64 = await blobToBase64(blob2)
                      navigate("/playground/ImageEditor", {
                        state: {
                          imageToEdit: {
                            image_data: base64,
                            image_type: "png",
                            prompt,
                            model: model2,
                            id: null
                          }
                        }
                      })
                    }}
                  >
                    Edit image
                  </Button>
                )}
              </Stack>
            )}

          </SimpleGrid>
        </div>
      )}
    </Stack>
  )
}
