import { useEffect, useRef, useState } from "react"
import { PromptTextBox } from "./PromptTextBox"
import axios from "axios"
import type { AxiosResponse } from "axios"
import { Text, SimpleGrid, Stack, Button } from "@mantine/core"
import { MODELS, getModelDisplayName } from "../constants/models"
import ModelSelector from "./ModelSelector"
import PhotoArea from "./PhotoArea"
import GeneratingText from "./GeneratingText"
import { useNavigate } from "react-router-dom"

type SelectedModels = [string | null, string | null]

export default function ImageGenerator() {

  const navigate = useNavigate()

  const [prompt, setPrompt] = useState("")
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageUrl2, setImageUrl2] = useState<string | null>(null)
  const [blob1, setBlob1] = useState<Blob | null>(null)
  const [blob2, setBlob2] = useState<Blob | null>(null)
  const [selectedModels, setSelectedModels] = useState<SelectedModels>([null, null])
  const [isLoading, setIsLoading] = useState(false)

  const imageUrlRef = useRef<string | null>(null)
  const imageUrl2Ref = useRef<string | null>(null)

  const backendUrl = import.meta.env.VITE_API_URL
  const models = MODELS

  const SELECTOR_WIDTH = 500
  const CONTROLS_MAX_WIDTH = 1100
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

  useEffect(() => {
    return () => {
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current)
      if (imageUrl2Ref.current) URL.revokeObjectURL(imageUrl2Ref.current)
    }
  }, [])

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
    setPrompt(nextPrompt)

    replaceImageUrl(null)
    replaceImageUrl2(null)
    setBlob1(null)
    setBlob2(null)

    setIsLoading(true)

    if (!model1 && !model2) {
      alert("Please select a model")
      setIsLoading(false)
      return
    }

    try {
      const promises: Promise<AxiosResponse<Blob>>[] = []

      if (model1) {
        promises.push(
          axios.post(
            `${backendUrl}/images/generate`,
            { prompt: nextPrompt, model: model1 },
            {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
                "Content-Type": "application/json",
              },
              responseType: "blob",
            }
          )
        )
      }

      if (model2) {
        promises.push(
          axios.post(
            `${backendUrl}/images/generate`,
            { prompt: nextPrompt, model: model2 },
            {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
                "Content-Type": "application/json",
              },
              responseType: "blob",
            }
          )
        )
      }

      const results = await Promise.all(promises)

      let idx = 0
      if (model1) {
        const blob = results[idx].data
        setBlob1(blob)
        const url = URL.createObjectURL(blob)
        replaceImageUrl(url)
        idx++
      }
      if (model2) {
        const blob = results[idx].data
        setBlob2(blob)
        const url2 = URL.createObjectURL(blob)
        replaceImageUrl2(url2)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Stack align="center" w="100%" gap="md">
      <div style={{ width: "100%", maxWidth: CONTROLS_MAX_WIDTH }}>
        <Text size="sm" c="dimmed" mb={6}>
          Select at least 1 model for image generation
        </Text>

        <SimpleGrid
          cols={{ base: 1, md: 2 }}
          spacing={18}
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

      {isLoading && <GeneratingText baseText="Generating image" />}

      {(imageUrl || imageUrl2) && (
        <div style={{ width: "100%", maxWidth: CONTROLS_MAX_WIDTH }}>
          <SimpleGrid cols={{ base: 1, md: imageUrl && imageUrl2 ? 2 : 1 }} spacing="md">

            {imageUrl && (
              <Stack gap="xs" align="center">
                <PhotoArea
                  src={imageUrl}
                  alt="Generated image 1"
                  header={<Text fw={600}>Model: {getModelDisplayName(model1)}</Text>}
                  height={420}
                />

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
              </Stack>
            )}

            {imageUrl2 && (
              <Stack gap="xs" align="center">
                <PhotoArea
                  src={imageUrl2}
                  alt="Generated image 2"
                  header={<Text fw={600}>Model: {getModelDisplayName(model2)}</Text>}
                  height={420}
                />

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
              </Stack>
            )}

          </SimpleGrid>
        </div>
      )}
    </Stack>
  )
}
