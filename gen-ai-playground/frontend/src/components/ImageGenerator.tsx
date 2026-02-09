import { useState } from "react"
import { PromptTextBox } from "./PromtTextBox"
import axios from "axios"
import { useAuth } from "../context/AuthContext"
import {
  Loader,
  Card,
  Text,
  Image,
  MultiSelect,
  SimpleGrid
} from '@mantine/core'


/**
 * ImageGenerator component (page) allows users to input a prompt for image generation.
 * contains a PromtTextBox component for user input and also display area component.
 */


export default function ImageGenerator() {
  const { isLoggedIn } = useAuth()
  const [prompt, setPrompt] = useState("")
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageUrl2, setImageUrl2] = useState<string | null>(null)
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const backendUrl = import.meta.env.VITE_API_URL
  const [isLoading, setIsLoading] = useState(false)
  const models = [
    "FLUX1_KONTEXT_DEV",
    "FLUX1_KREA_DEV",
    "FLUX2_KLEIN_9B",
    "FLUX2_KLEIN_4B"
  ] //TODO: Add more models

  if (!isLoggedIn) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          padding: 40,
        }}
      >
        <p>You must be logged in to generate images.</p>
      </div>
    )
  }

  //function to fetch generated images from backend
  async function fetchTwoGeneratedImages() {
    // make both image urls null before fetching new ones
    if (imageUrl) {
      setImageUrl(null)
    }
    if (imageUrl2) {
      setImageUrl2(null)
    }
    //set loading state true
    setIsLoading(true)

    if (selectedModels.length === 0) {
      alert("please select at least one model!")
      setIsLoading(false)
      return
    }

    try {
      console.log("Fetching generated images for prompt:", prompt)

      const promises = []

      if (selectedModels[0]) {
        promises.push(
          axios.post(`${backendUrl}/images/generate`, {
            prompt: prompt,
            model: selectedModels[0]
          }, {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
              "Content-Type": "application/json"
            },
            responseType: 'blob'
          })
        )
      }

      if (selectedModels[1]) {
        promises.push(
          axios.post(`${backendUrl}/images/generate`, {
            prompt: prompt,
            model: selectedModels[1]
          }, {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
              "Content-Type": "application/json"
            },
            responseType: 'blob'
          })
        )
      }

      const results = await Promise.all(promises)

      let resultIndex = 0
      if (selectedModels[0]) {
        const image = URL.createObjectURL(results[resultIndex].data)
        setImageUrl(image)
        resultIndex++
      }

      if (selectedModels[1]) {
        const image = URL.createObjectURL(results[resultIndex].data)
        setImageUrl2(image)
      }

    } catch (error) {
      console.error("Error fetching generated image:", error)
    } finally {
      setIsLoading(false)
    }
  }
  return (
    // styles are only for better visibility at this moment
    <>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", alignItems: "center" }}>
        <MultiSelect
          label="Select models to generate images with, max 2"
          placeholder={selectedModels.length > 0 ? `${selectedModels.length} model(s) selected` : "Select model(s)"}
          data={models}
          maxValues={2}
          onChange={setSelectedModels}
        />
        <PromptTextBox onSubmit={fetchTwoGeneratedImages}
          value={prompt}
          onChange={setPrompt}
          usage="Create image" />
        <p>prompt: {prompt}</p>
      </div >
      <div style={{
        display: "flex",
        justifyContent: "center",
      }}>
        {isLoading &&
          <><p>Generating images...</p><Loader /></>
        }
        {imageUrl === null && imageUrl2 === null && !isLoading && <p>Generated images will appear here</p>}
        <SimpleGrid
          cols={{ base: 1, md: imageUrl && imageUrl2 ? 2 : 1 }}
          spacing="md"
        >
          {imageUrl && (
            <Card shadow="sm" padding="lg" radius="md" withBorder style={{ maxWidth: 500 }}>
              <Text fw={500} size="lg" mb="md">Model used: {selectedModels[0]}</Text>
              <Image
                src={imageUrl}
                alt="Generated image"
                fit="contain"

              />
            </Card>
          )}

          {imageUrl2 && (
            <Card shadow="sm" padding="lg" radius="md" withBorder style={{ maxWidth: 500 }}>
              <Text fw={500} size="lg" mb="md">Model used: {selectedModels[1]}</Text>
              <Image
                src={imageUrl2}
                alt="Generated image 2"
                fit="contain"
              />
            </Card>
          )}
        </SimpleGrid>
      </div>
    </>
  )
}