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
import { useNavigate } from "react-router-dom";

type SelectedModels = [string | null, string | null];

function base64FromHistoryImage(img: any) { 
  return `data:image/${img.image_type || "png"};base64,${img.image_data}`; 
}

export default function ImageGenerator() {
  const navigate = useNavigate();
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

  // reset playground
    useEffect(() => {
    if (!location.state?.imageToEdit) {
      setPrompt("");
      replaceImageUrl(null);
      replaceImageUrl2(null);
      setSelectedModels([null, null]);
    }
  }, [location.key]);

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

  const model1 = selectedModels[0] || undefined;
  const model2 = selectedModels[1] || undefined;

  function replaceImageUrl(next: string | null) {
    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      imageUrlRef.current = next;
      return next;
    });
  }

  function replaceImageUrl2(next: string | null) {
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
              parent_image_id: imageToEdit?.id ?? null,
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
              parent_image_id: imageToEdit?.id ?? null,
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
      if (model1 && results[0]) {
        const url = URL.createObjectURL(results[0].data);
        replaceImageUrl(url);
        idx++;

        if (imageToEdit) {
          setSelectedModels([model1, model2 ?? null]);
        }
      }
      if (model2 && results[1]) {
        const url2 = URL.createObjectURL(results[1].data);
        replaceImageUrl2(url2);
      }

        if (imageToEdit) {
          navigate(location.pathname, {
            replace: true,
            state: {} 
          });
        }
      

    } catch (err) {
      console.error("Error generating image:", err);
    } finally {
      setIsLoading(false);
    }
  }

 return (
  <>
    <Stack align="center" w="100%" gap="md">
      {/* Show original image when editing */}
      {imageToEdit && (
        <PhotoArea
          src={`data:image/${imageToEdit.image_type || "png"};base64,${imageToEdit.image_data}`}
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
              <Stack gap="xs" align="center">
                <PhotoArea
                  src={imageUrl}
                  alt="Generated image 1"
                  header={<Text fw={600}>Model: {getModelDisplayName(model1)}</Text>}
                  height={420}
                />
                <Text size="xs" c="dimmed">
                  Timestamp: {new Date().toLocaleString()} 
                </Text>
                <Text size="xs">
                  Type: {imageToEdit ? "edited" : "generated"}
                </Text>
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
                <Text size="xs" c="dimmed">
                  Timestamp: {new Date().toLocaleString()}
                </Text>
                <Text size="xs">
                  Type: {imageToEdit ? "edited" : "generated"}
                </Text>
              </Stack>
            )}
          </SimpleGrid>
        </div>
      )}
    </Stack>
  </>
);
}