import { useEffect, useRef, useState } from "react"
import { PromptTextBox } from "./PromptTextBox"
import axios from "axios"
import type { AxiosResponse } from "axios"
import { Text, SimpleGrid, Stack } from "@mantine/core"
import { MODELS, getModelDisplayName } from "../constants/models"
import ModelSelector from "./ModelSelector"
import PhotoArea from "./PhotoArea"
import GeneratingText from "./GeneratingText"

type SelectedModels = [string | null, string | null]

function getCsrfToken(): string {
  const value = `; ${document.cookie}`
  const parts = value.split(`; csrf_token=`)
  if (parts.length === 2) return parts.pop()!.split(";").shift()!
  return ""
}

export default function ImageGenerator() {

  const [prompt, setPrompt] = useState("")
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageUrl2, setImageUrl2] = useState<string | null>(null)
  const [selectedModels, setSelectedModels] = useState<SelectedModels>([null, null])
  const [isLoading, setIsLoading] = useState(false)

  // Keep refs to the latest URLs so we can revoke them on unmount
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

  // One-time unmount cleanup
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

  async function fetchTwoGeneratedImages(nextPrompt: string) {
    setPrompt(nextPrompt)

    // Clear previous results (this revokes old URLs too)
    replaceImageUrl(null)
    replaceImageUrl2(null)

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
                "Content-Type": "application/json",
                "X-CSRF-Token": getCsrfToken(),
              },
              withCredentials: true,
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
                "Content-Type": "application/json",
                "X-CSRF-Token": getCsrfToken(),
              },
              withCredentials: true,
              responseType: "blob",
            }
          )
        )
      }

      const results = await Promise.all(promises)

      let idx = 0
      if (model1) {
        const url = URL.createObjectURL(results[idx].data)
        replaceImageUrl(url)
        idx++
      }
      if (model2) {
        const url2 = URL.createObjectURL(results[idx].data)
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
              <PhotoArea
                src={imageUrl}
                alt="Generated image 1"
                header={<Text fw={600}>Model: {getModelDisplayName(model1)}</Text>}
                height={420}
              />
            )}

            {imageUrl2 && (
              <PhotoArea
                src={imageUrl2}
                alt="Generated image 2"
                header={<Text fw={600}>Model: {getModelDisplayName(model2)}</Text>}
                height={420}
              />
            )}
          </SimpleGrid>
        </div>
      )}
    </Stack>
  )
}
