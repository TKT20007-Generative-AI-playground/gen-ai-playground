import { useEffect, useRef, useState } from "react"
import { PromptTextBox } from "./PromptTextBox"
import axios from "axios"
import { Button, FileButton, SimpleGrid, Text, Stack } from "@mantine/core"
import { EDIT_MODELS } from "../constants/models"
import ModelSelector from "./ModelSelector"
import PhotoArea from "./PhotoArea"
import GeneratingText from "./GeneratingText"

type ImageToEdit = {
  image_data: string
  image_type: string | null | undefined
  model: string
  prompt: string
}


export default function ImageEditor({
  imageToEdit,
}: {
  imageToEdit?: ImageToEdit | null
}) {
  const [prompt, setPrompt] = useState("");
  const [userImage, setUserImage] = useState<File | null>(null);

  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null);

  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const editedUrlRef = useRef<string | null>(null);

  const backendUrl = import.meta.env.VITE_API_URL;
  const selectedModel = selectedModels[0];

  function setModel(value: string | null) {
    if (!value) setSelectedModels([]);
    else setSelectedModels([value]);
  }

  // Load image passed via location.state
  useEffect(() => {
    if (!imageToEdit) return;

    try {
      const byteCharacters = atob(imageToEdit.image_data);
      const byteNumbers = Array.from(byteCharacters, c => c.charCodeAt(0));
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "image/png" });

      const file = new File([blob], "edited.png", { type: "image/png" });
      setUserImage(file);

      replaceEditedUrl(null);
      setPrompt("");
      setModel(null);
    } catch (err) {
      console.error("Failed to load imageToEdit:", err);
    }
  }, [imageToEdit]);

  // Create preview URL for uploaded image
  useEffect(() => {
    if (!userImage) {
      setOriginalImageUrl(null);
      return;
    }

    const url = URL.createObjectURL(userImage);
    setOriginalImageUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [userImage]);

  // Cleanup edited image URL
  useEffect(() => {
    return () => {
      if (editedUrlRef.current) URL.revokeObjectURL(editedUrlRef.current);
    };
  }, []);

  function replaceEditedUrl(next: string | null) {
    setEditedImageUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      editedUrlRef.current = next;
      return next;
    });
  }

  async function editImage(nextPrompt: string) {
    if (!userImage || !nextPrompt.trim() || !selectedModel) {
      alert("Please provide an image, a prompt, and select a model");
      return;
    }

    setIsLoading(true);

    try {
      const base64 = await fileToBase64(userImage);

      const csrfToken = document.cookie
        .split("; ")
        .find((c) => c.startsWith("csrf_token="))
        ?.split("=")[1] ?? ""

      const response = await axios.post(
        `${backendUrl}/images/edit-image`,
        { image: base64, prompt: nextPrompt, model: selectedModel },
        {
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          withCredentials: true,
          responseType: "blob",
        }
      );

      const url = URL.createObjectURL(response.data);
      replaceEditedUrl(url);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function handleUpload(file: File | null) {
    setUserImage(file);
    replaceEditedUrl(null);
  }

  const FORM_WIDTH = 620;

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

      {originalImageUrl && !editedImageUrl && (
        <PhotoArea
          src={originalImageUrl}
          alt="Original"
          height={420}
          header={<Text fw={600}>Original</Text>}
        />
      )}

      {editedImageUrl && (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" w="100%">
          <div>
            <PhotoArea
              src={originalImageUrl}
              alt="Original"
              height={420}
              header={<Text fw={600}>Original</Text>}
            />
            <Button
              mt="sm"
              fullWidth
              onClick={() => {
                fetch(originalImageUrl!)
                  .then(res => res.blob())
                  .then(blob => {
                    const file = new File([blob], "reedit.png", { type: blob.type });
                    setUserImage(file);
                    replaceEditedUrl(null);
                    setPrompt("");
                  });
              }}
            >
              Edit image
            </Button>
          </div>

          <div>
            <PhotoArea
              src={editedImageUrl}
              alt="Edited result"
              height={420}
              header={<Text fw={600}>Edited result</Text>}
            />
            <Button
              mt="sm"
              fullWidth
              onClick={() => {
                fetch(editedImageUrl!)
                  .then(res => res.blob())
                  .then(blob => {
                    const file = new File([blob], "reedit.png", { type: blob.type });
                    setUserImage(file);
                    replaceEditedUrl(null);
                    setPrompt("");
                  });
              }}
            >
              Edit image
            </Button>
          </div>
        </SimpleGrid>
      )}
    </Stack>
  );
}
