import { useEffect, useRef, useState } from "react"
import { PromptTextBox } from "./PromptTextBox"
import axios from "axios"
import { Button, FileButton, SimpleGrid, Text, Stack } from "@mantine/core"
import { EDIT_MODELS, getModelDisplayName } from "../constants/models"
import ModelSelector from "./ModelSelector"
import PhotoArea from "./PhotoArea"
import ActionStatus from "./ActionStatus"
import {
  getAxiosRequestErrorMessage,
  IMAGE_REQUEST_TIMEOUT_MS,
  parseGenerationTimeMs,
} from "../api/imageRequests"
import { formatDurationMs } from "../utils/time"

type ImageToEdit = {
  image_data: string
  image_type: string | null | undefined
  model: string
  prompt: string
}

export default function ImageEditor({ imageToEdit }: { imageToEdit?: ImageToEdit | null }) {
  const [prompt, setPrompt] = useState("")
  const [userImage, setUserImage] = useState<File | null>(null)

  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null)
  const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null)

  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [editStartTime, setEditStartTime] = useState<number | null>(null)
  const [editTimeMs, setEditTimeMs] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showEditedResult, setShowEditedResult] = useState(false)

  const editedUrlRef = useRef<string | null>(null)
  const editControllerRef = useRef<AbortController | null>(null)
  const reeditControllerRef = useRef<AbortController | null>(null)

  const backendUrl = import.meta.env.VITE_API_URL
  const selectedModel = selectedModels[0]

  function setModel(value: string | null) {
    if (!value) setSelectedModels([])
    else setSelectedModels([value])
  }

  // Load image passed via location.state
  useEffect(() => {
    if (!imageToEdit) return

    editControllerRef.current?.abort()
    editControllerRef.current = null
    reeditControllerRef.current?.abort()
    reeditControllerRef.current = null

    try {
      const byteCharacters = atob(imageToEdit.image_data)
      const byteNumbers = Array.from(byteCharacters, c => c.charCodeAt(0))
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: "image/png" })

      const file = new File([blob], "edited.png", { type: "image/png" })
      setUserImage(file)

      replaceEditedUrl(null)
      setPrompt("")
      setModel(null)
      setEditTimeMs(null)
      setEditStartTime(null)
      setIsLoading(false)
      setShowEditedResult(false)
      setError(null)
    } catch (err) {
      console.error("Failed to load imageToEdit:", err)
    }
  }, [imageToEdit])

  // Create preview URL for uploaded image
  useEffect(() => {
    if (!userImage) {
      setOriginalImageUrl(null)
      return
    }

    const url = URL.createObjectURL(userImage)
    setOriginalImageUrl(url)

    return () => URL.revokeObjectURL(url)
  }, [userImage])

  // Cleanup edited image URL
  useEffect(() => {
    return () => {
      editControllerRef.current?.abort()
      reeditControllerRef.current?.abort()
      if (editedUrlRef.current) URL.revokeObjectURL(editedUrlRef.current)
    }
  }, [])

  function replaceEditedUrl(next: string | null) {
    setEditedImageUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      editedUrlRef.current = next
      return next
    })
  }

  async function editImage(nextPrompt: string) {
    if (!userImage || !nextPrompt.trim() || !selectedModel) {
      alert("Please provide an image, a prompt, and select a model")
      return
    }

    editControllerRef.current?.abort()
    const controller = new AbortController()
    editControllerRef.current = controller

    setIsLoading(true)
    setShowEditedResult(true)
    setEditStartTime(Date.now())
    setEditTimeMs(null)
    setError(null)
    replaceEditedUrl(null)

    try {
      const base64 = await fileToBase64(userImage)

      const response = await axios.post(
        `${backendUrl}/images/edit-image`,
        { image: base64, prompt: nextPrompt, model: selectedModel },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          responseType: "blob",
          timeout: IMAGE_REQUEST_TIMEOUT_MS,
          signal: controller.signal,
        },
      )

      if (editControllerRef.current !== controller) return

      const timeMs = parseGenerationTimeMs(response.headers as Record<string, unknown>)
      setEditTimeMs(timeMs)
      setError(null)

      const url = URL.createObjectURL(response.data)
      replaceEditedUrl(url)
    } catch (err) {
      if (editControllerRef.current !== controller) return

      if (axios.isCancel(err)) {
        return
      }

      console.error(err)
      const message = getAxiosRequestErrorMessage(
        err,
        "Image editing timed out",
        "Image editing failed",
      )
      setError(message)
    } finally {
      if (editControllerRef.current === controller) {
        editControllerRef.current = null
        setIsLoading(false)
        setEditStartTime(null)
      }
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
    editControllerRef.current?.abort()
    editControllerRef.current = null
    reeditControllerRef.current?.abort()
    reeditControllerRef.current = null

    setUserImage(file)
    replaceEditedUrl(null)
    setIsLoading(false)
    setEditTimeMs(null)
    setEditStartTime(null)
    setShowEditedResult(false)
    setError(null)
  }

  function startReeditFromUrl(sourceUrl: string) {
    reeditControllerRef.current?.abort()
    const controller = new AbortController()
    reeditControllerRef.current = controller
    setError(null)

    axios
      .get(sourceUrl, {
        responseType: "blob",
        timeout: IMAGE_REQUEST_TIMEOUT_MS,
        signal: controller.signal,
      })
      .then(response => {
        if (reeditControllerRef.current !== controller) return

        const contentTypeHeader = response.headers["content-type"]
        const contentType = Array.isArray(contentTypeHeader)
          ? (contentTypeHeader[0]?.toLowerCase() ?? "")
          : String(contentTypeHeader ?? "").toLowerCase()

        if (contentType && !contentType.startsWith("image/")) {
          throw new Error(
            `Failed to prepare image for re-edit: unexpected content type ${contentType}`,
          )
        }

        return response.data as Blob
      })
      .then(blob => {
        if (!blob) return

        if (reeditControllerRef.current !== controller) return

        const file = new File([blob], "reedit.png", { type: blob.type })
        setUserImage(file)
        replaceEditedUrl(null)
        setPrompt("")
        setEditTimeMs(null)
        setEditStartTime(null)
        setShowEditedResult(false)
      })
      .catch(err => {
        if (reeditControllerRef.current !== controller) return

        if (axios.isCancel(err)) {
          return
        }

        console.error("Failed to prepare image for re-edit:", err)
        const message = getAxiosRequestErrorMessage(
          err,
          "Preparing image for re-edit timed out",
          "Failed to prepare image for re-edit",
        )
        setError(message)
      })
      .finally(() => {
        if (reeditControllerRef.current === controller) {
          reeditControllerRef.current = null
        }
      })
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
          {props => <Button {...props}>{userImage ? "Change image" : "Upload image"}</Button>}
        </FileButton>
      </div>

      {userImage && (
        <Text size="sm" style={{ textAlign: "center" }}>
          Selected image: {userImage.name}
        </Text>
      )}

      <div style={{ width: "100%", maxWidth: FORM_WIDTH }}>
        <PromptTextBox
          onSubmit={editImage}
          value={prompt}
          onChange={setPrompt}
          usage="Edit image"
        />
      </div>

      {originalImageUrl && !showEditedResult && (
        <PhotoArea
          src={originalImageUrl}
          alt="Original"
          height={420}
          header={<Text fw={600}>Original</Text>}
        />
      )}

      {originalImageUrl && showEditedResult && (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" w="100%">
          <div>
            <PhotoArea
              src={originalImageUrl}
              alt="Original"
              height={420}
              header={<Text fw={600}>Original</Text>}
            />
            {editedImageUrl && (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <Button mt="sm" onClick={() => startReeditFromUrl(originalImageUrl!)}>
                  Edit image
                </Button>
              </div>
            )}
          </div>

          <div>
            <PhotoArea
              src={editedImageUrl}
              alt="Edited result"
              height={420}
              placeholder={
                isLoading && editStartTime ? (
                  <ActionStatus actionText="Editing" startTime={editStartTime} />
                ) : error ? (
                  <Text size="sm" c="red" ta="center">
                    {error}
                  </Text>
                ) : undefined
              }
              header={
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    gap: 8,
                  }}
                >
                  <Text fw={600}>Edited with {getModelDisplayName(selectedModel)}</Text>
                  {editedImageUrl && editTimeMs != null && (
                    <Text size="sm" c="dimmed">
                      Generation time: {formatDurationMs(editTimeMs)}
                    </Text>
                  )}
                </div>
              }
            />
            {editedImageUrl && (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <Button mt="sm" onClick={() => startReeditFromUrl(editedImageUrl!)}>
                  Edit image
                </Button>
              </div>
            )}
          </div>
        </SimpleGrid>
      )}
    </Stack>
  )
}
