import { useEffect, useRef, useState } from "react"
import { PromptTextBox } from "./PromptTextBox"
import axios from "axios"
import { Button, FileButton, SimpleGrid, Text, Stack } from "@mantine/core"
import { EDIT_MODELS } from "../constants/models"
import ModelSelector from "./ModelSelector"
import PhotoArea from "./PhotoArea"
import GeneratingText from "./GeneratingText"
import { useAuth } from "../context/AuthContext"

export default function ImageEditor() {
  const { checkToken, getAuthHeaders } = useAuth()

  const [prompt, setPrompt] = useState("")
  const [userImage, setUserImage] = useState<File | null>(null)

  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null)
  const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null)

  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Keep ref to latest edited URL so we can revoke on unmount
  const editedUrlRef = useRef<string | null>(null)

  const backendUrl = import.meta.env.VITE_API_URL
  const selectedModel = selectedModels[0]

  function setModel(value: string | null) {
    if (!value) setSelectedModels([])
    else setSelectedModels([value])
  }

  // Original image URL is derived from the uploaded file, so "effect owns the URL"
  useEffect(() => {
    if (!userImage) {
      setOriginalImageUrl(null)
      return
    }

    const url = URL.createObjectURL(userImage)
    setOriginalImageUrl(url)

    return () => URL.revokeObjectURL(url)
  }, [userImage])

  // One-time unmount cleanup for edited URL
  useEffect(() => {
    return () => {
      if (editedUrlRef.current) URL.revokeObjectURL(editedUrlRef.current)
    }
  }, [])

  function replaceEditedUrl(next: string | null) {
    setEditedImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      editedUrlRef.current = next
      return next
    })
  }

  async function editImage(nextPrompt: string) {
    if (!checkToken()) return

    if (!userImage || !nextPrompt.trim() || !selectedModel) {
      alert("Please provide an image, a prompt, and select a model")
      return
    }

    setIsLoading(true)

    try {
      const base64 = await fileToBase64(userImage)

      const response = await axios.post(
        `${backendUrl}/images/edit-image`,
        { image: base64, prompt: nextPrompt, model: selectedModel },
        {
          headers: getAuthHeaders(),
          responseType: "blob",
        }
      )

      const url = URL.createObjectURL(response.data)
      replaceEditedUrl(url)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  function handleUpload(file: File | null) {
    if (!checkToken()) return

    setUserImage(file)

    // Clear previous edited result when uploading a new image
    replaceEditedUrl(null)
  }
  
  const FORM_WIDTH = 620

  return (
    <Stack align="center" w="100%" gap="md">
      <div style={{ width: "100%", maxWidth: FORM_WIDTH }}>
        <Text c="dimmed" size="sm">
          Upload an image, select a model, and enter a prompt to enable editing.
        </Text>
      </div>

      <div style={{ width: "100%", maxWidth: FORM_WIDTH }}>
        <ModelSelector
          label="Model"
          models={EDIT_MODELS}
          value={selectedModel}
          onChange={setModel}
          width={FORM_WIDTH}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
        <FileButton onChange={handleUpload} accept="image/png,image/jpeg,image/webp">
          {(props) => <Button {...props}>{userImage ? "Change image" : "Upload image"}</Button>}
        </FileButton>
      </div>

      {userImage && (
        <Text size="sm" style={{ textAlign: "center" }}>
          Selected image: {userImage.name}
        </Text>
      )}

      <div style={{ width: "100%", maxWidth: FORM_WIDTH }}>
        <PromptTextBox onSubmit={editImage} value={prompt} onChange={setPrompt} usage="Edit image" />
      </div>

      {isLoading && <GeneratingText baseText="Editing image" />}

      {editedImageUrl && (
        <div style={{ width: "100%" }}>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <PhotoArea src={originalImageUrl} alt="Original" height={420} header={<Text fw={600}>Original</Text>} />
            <PhotoArea
              src={editedImageUrl}
              alt="Edited result"
              height={420}
              header={<Text fw={600}>Edited result</Text>}
            />
          </SimpleGrid>
        </div>
      )}
    </Stack>
  )
}
