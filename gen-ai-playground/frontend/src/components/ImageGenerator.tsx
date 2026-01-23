import { useEffect, useState } from "react"
import { PromptTextBox } from "./PromtTextBox"
import PhotoArea from "./PhotoArea"



/**
 * ImageGenerator component (page) allows users to input a prompt for image generation.
 * contains a PromtTextBox component for user input and also display area component.
 */
export function ImageGenerator() {
  const [prompt, setPrompt] = useState("")
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  useEffect(() => {
    if (prompt) {
      // hardcoded backend url for now
      fetch(`https://gen-ai-backend-route-ohtuprojekti-staging.apps.ocp-prod-0.k8s.it.helsinki.fi/generate-image?prompt=${encodeURIComponent(prompt)}`)
        .then(response => response.json())
        .then(data => {
          if (data.image_url) {
            setImageUrl(data.image_url)
          } else {
            console.error("Image URL not found in response:", data)
          }
        })
        .catch(error => {
          console.error("Error fetching generated image:", error)
        })
    }
  }, [prompt])
  return (
    // styles are only for better visibility at this moment
    <>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", alignItems: "center" }}>
        <PromptTextBox onSubmit={setPrompt} />
        <p>prompt: {prompt}</p>
      </div>
      <div style={{
        display: "flex",
        justifyContent: "center",
      }}>
        <PhotoArea src={imageUrl} alt="Generated image" />
      </div>
    </>
  )
}