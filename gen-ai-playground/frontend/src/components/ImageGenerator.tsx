import { useState } from "react"
import { PromptTextBox } from "./PromtTextBox"
import PhotoArea from "./PhotoArea"
import axios from "axios"
import { useAuth } from "../context/AuthContext"


/**
 * ImageGenerator component (page) allows users to input a prompt for image generation.
 * contains a PromtTextBox component for user input and also display area component.
 */


// TODO: add model names above the pictures 
export function ImageGenerator() {
  const { isLoggedIn } = useAuth()
  const [prompt, setPrompt] = useState("")
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageUlr2, setImageUrl2] = useState<string | null>(null)
  const [flexKontextIsSelected, setFlexKontextIsSelected] = useState(false)
  const [flux1KreaDevIsSelected, setFlux1KreaDevIsSelected] = useState(false)
  const backendUrl = import.meta.env.VITE_API_URL
  const [isLoading, setIsLoading] = useState(false)


  //TODO: change the structure so that models can be added without new states

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

    //check that at least one model is selected
    if (!flexKontextIsSelected && !flux1KreaDevIsSelected) {
      alert("please select at least one model!")
    }
    try {
      console.log("Fetching generated images for prompt:", prompt)

      const promises = []

      if (flexKontextIsSelected) {
        promises.push(
          axios.post(`${backendUrl}/images/generate`, {
            prompt: prompt,
            model: "flux_kontext"
          }, {
            responseType: 'blob'
          })
        )
      }

      if (flux1KreaDevIsSelected) {
        promises.push(
          axios.post(`${backendUrl}/images/generate`, {
            prompt: prompt,
            model: "flux1_krea_dev"
          }, {
            responseType: 'blob'
          })
        )
      }

      const results = await Promise.all(promises)

      let resultIndex = 0
      if (flexKontextIsSelected) {
        console.log("FluxKontext image generation result received")
        const image = URL.createObjectURL(results[resultIndex].data)
        setImageUrl2(image)
        resultIndex++
      }

      if (flux1KreaDevIsSelected) {
        console.log("Flux1_krea_dev image generation result received")
        const image = URL.createObjectURL(results[resultIndex].data)
        setImageUrl(image)
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
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={flexKontextIsSelected}
            onChange={(e) => setFlexKontextIsSelected(e.target.checked)}
            className="w-4 h-4"
          />
          <span>Flux Kontext</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={flux1KreaDevIsSelected}
            onChange={(e) => setFlux1KreaDevIsSelected(e.target.checked)}
            className="w-4 h-4"
          />
          <span>Flux1 Krea Dev</span>
        </label>
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
        {isLoading && <p>Generating images...</p>}
        {imageUrl === null && imageUlr2 === null && !isLoading && <p>Generated images will appear here</p>}
        <PhotoArea src={imageUrl} alt="Generated image" />
        <PhotoArea src={imageUlr2} alt="Generated image 2" />
      </div>
    </>
  )
}