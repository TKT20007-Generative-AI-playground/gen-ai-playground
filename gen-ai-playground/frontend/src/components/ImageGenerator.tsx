import { useState } from "react"
import { PromptTextBox } from "./PromtTextBox"
import axios from "axios"
import { useAuth } from "../context/AuthContext"
import { Loader, Card, Text, Image, Grid, MultiSelect } from '@mantine/core';


/**
 * ImageGenerator component (page) allows users to input a prompt for image generation.
 * contains a PromtTextBox component for user input and also display area component.
 */


export default function ImageGenerator() {
  const { isLoggedIn } = useAuth()
  const [prompt, setPrompt] = useState("")
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageUlr2, setImageUrl2] = useState<string | null>(null)
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const backendUrl = import.meta.env.VITE_API_URL
  const [isLoading, setIsLoading] = useState(false)
  const models = ["FLUX.1_Kontext_dev", "FLUX.1_Krea_dev"] //TODO: Add more models

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
    if (imageUlr2) {
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

      if (selectedModels.includes("FLUX.1_Kontext_dev")) {
        promises.push(
          axios.post(`${backendUrl}/images/generate`, {
            prompt: prompt,
            model: "flux_kontext"
          }, {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
              "Content-Type": "application/json"
            },
            responseType: 'blob'
          })
        )
      }

      if (selectedModels.includes("FLUX.1_Krea_dev")) {
        promises.push(
          axios.post(`${backendUrl}/images/generate`, {
            prompt: prompt,
            model: "flux1_krea_dev"
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
      if (selectedModels.includes("FLUX.1_Kontext_dev")) {
        const image = URL.createObjectURL(results[resultIndex].data)
        setImageUrl2(image)
        resultIndex++
      }

      if (selectedModels.includes("FLUX.1_Krea_dev")) {
        const image = URL.createObjectURL(results[resultIndex].data)
        setImageUrl(image)
      }

    } catch (error) {
      console.error("Error fetching generated image:", error)
    } finally {
      setIsLoading(false)
    }
  }

  console.log("Selected models:", selectedModels);
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
        {imageUrl === null && imageUlr2 === null && !isLoading && <p>Generated images will appear here</p>}
        <Grid justify="center">
          <Grid.Col span={6}>
            {imageUrl &&
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Text weight={500} size="lg" mb="md">Model used: {selectedModels[0]}</Text>
                <Image
                  src={imageUrl}
                  alt="Genereated image"
                  height={400}
                />
              </Card>
            }
          </Grid.Col>
          <Grid.Col span={6} >
            {imageUlr2 &&
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Text weight={500} size="lg" mb="md">Model used: {selectedModels[1]}</Text>
                <Image
                  src={imageUlr2}
                  alt="Generated image 2"
                  height={400}
                />
              </Card>
            }
          </Grid.Col>
        </Grid>
      </div>
    </>
  )
}