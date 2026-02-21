import { useEffect, useRef, useState } from "react";
import { PromptTextBox } from "./PromptTextBox";
import axios from "axios";
import type { AxiosResponse } from "axios";
import { Text, SimpleGrid, Stack } from "@mantine/core";
import { MODELS, getModelDisplayName } from "../constants/models";
import ModelSelector from "./ModelSelector";
import PhotoArea from "./PhotoArea";
import GeneratingText from "./GeneratingText";
import { useLocation } from "react-router-dom";

type SelectedModels = [string | null, string | null];

function base64FromHistoryImage(img: any) { 
  return `data:image/${img.image_type || "png"};base64,${img.image_data}`; 
}

export default function ImageGenerator() {
  const location = useLocation();
  const imageToEdit = location.state?.imageToEdit || null;
  
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUrl2, setImageUrl2] = useState<string | null>(null);
  const [selectedModels, setSelectedModels] = useState<SelectedModels>([
    null,
    null,
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const isEditing = !!imageToEdit;


  const imageUrlRef = useRef<string | null>(null);
  const imageUrl2Ref = useRef<string | null>(null);

  const backendUrl = import.meta.env.VITE_API_URL;
  const models = MODELS;

  const SELECTOR_WIDTH = 500;
  const CONTROLS_MAX_WIDTH = 1100;
  const PROMPT_MAX_WIDTH = CONTROLS_MAX_WIDTH;

  useEffect(() => {
    if (isEditing) {
      setPrompt("");
    }
  }, [isEditing]);
  
  useEffect(() => {
    if (isEditing) {
      replaceImageUrl(null);
      replaceImageUrl2(null);
    }
  }, [isEditing]);

  useEffect(() => {
    if (imageToEdit) {
    setSelectedModels([null, null]);
    } 
  }, [imageToEdit]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      if (imageUrl2Ref.current) URL.revokeObjectURL(imageUrl2Ref.current);
    };
  }, []);

  function setModelAtIndex(index: 0 | 1, value: string | null) {
    setSelectedModels((prev) => {
      const next: SelectedModels = [...prev] as SelectedModels;
      next[index] = value;
      return next;
    });
  }

  const model1 = selectedModels[0] ?? undefined;
  const model2 = selectedModels[1] ?? undefined;

  function replaceImageUrl(next: string | null) {
    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      imageUrlRef.current = next;
      return next;
    });
  }

  function replaceImageUrl2(next: string | null) {
  if (!next) {
    imageUrl2Ref.current = null;
    setImageUrl2(null);
    return;
  }

  setImageUrl2((prev) => {
    if (prev) URL.revokeObjectURL(prev);
    imageUrl2Ref.current = next;
    return next;
  });
}  

  async function fetchTwoGeneratedImages(nextPrompt: string) {

    setPrompt(nextPrompt);

    replaceImageUrl(null);
    replaceImageUrl2(null);

    setIsLoading(true);

    if (!model1 && !model2) {
      alert("Please select at least one model");
      setIsLoading(false);
      return;
    }

    try {
      const promises: Promise<AxiosResponse<Blob>>[] = [];

      if (model1) {
        promises.push(
          axios.post(
            `${backendUrl}/images/generate`,
            {
              prompt: nextPrompt,
              model: model1,
              image_to_edit: imageToEdit ? base64FromHistoryImage(imageToEdit) : null,
            },
            {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
                "Content-Type": "application/json",
              },
              responseType: "blob",
            }
          )
        );
      }

      if (model2) {
        promises.push(
          axios.post(
            `${backendUrl}/images/generate`,
            {
              prompt: nextPrompt,
              model: model2,
              image_to_edit: imageToEdit ? base64FromHistoryImage(imageToEdit) : null,
            },
            {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
                "Content-Type": "application/json",
              },
              responseType: "blob",
            }
          )
        );
      }

      const results = await Promise.all(promises);

      let idx = 0;
      if (model1) {
        const url = URL.createObjectURL(results[idx].data);
        replaceImageUrl(url);
        idx++;
      }
      if (model2) {
        const url2 = URL.createObjectURL(results[idx].data);
        replaceImageUrl2(url2);
      }

      // 🔥 IMPORTANT: Clear edit mode after generating
      if (imageToEdit) {
        location.state.imageToEdit = null;
      }

    } catch (err) {
      console.error("Error generating image:", err);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Stack align="center" w="100%" gap="md">
      {/* Show original image when editing */}
      {imageToEdit && (
        <PhotoArea
          src={`data:image/${imageToEdit.image_type || "png"};base64,${
            imageToEdit.image_data
          }`}
          alt="Original image"
          header={<Text fw={600}>Editing existing image</Text>}
          height={420}
        />
      )}

      {isEditing && (
        <Stack align="center" mb="md">
          <Text size="sm" c="dimmed">
            Prompt used: {imageToEdit.prompt}
          </Text>
          <Text size="sm" c="dimmed">
            Model used: {imageToEdit.model ?? "Unknown"}
          </Text>
        </Stack>
      )}


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
            models={models}
            value={model1}
            onChange={(value) => setModelAtIndex(0, value)}
            width={SELECTOR_WIDTH}
          />

          <ModelSelector
            label="Model 2"
            models={models}
            value={model2}
            onChange={(value) => setModelAtIndex(1, value)}
            width={SELECTOR_WIDTH}
            placeholder="Select model (optional)"
          />
        </SimpleGrid>
      </div>

      <div style={{ width: "100%", maxWidth: PROMPT_MAX_WIDTH }}>
        <PromptTextBox
          onSubmit={fetchTwoGeneratedImages}
          value={prompt}
          onChange={setPrompt}
          usage={imageToEdit ? "Edit image" : "Create image"}
        />
      </div>

      {isLoading && <GeneratingText baseText="Generating image" />}

      {(imageUrl || imageUrl2) && (
        <div style={{ width: "100%", maxWidth: CONTROLS_MAX_WIDTH }}>
          <SimpleGrid
            cols={{ base: 1, md: imageUrl && imageUrl2 ? 2 : 1 }}
            spacing="md"
          >
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
  );
}