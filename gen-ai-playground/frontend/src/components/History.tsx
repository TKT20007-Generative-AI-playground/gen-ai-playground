import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Stack,
  Title,
  Text,
  Badge,
  ScrollArea,
  Loader,
  Center,
  Modal,
  Button
} from "@mantine/core";
import axios from "axios";
import { EDIT_MODELS } from "../constants/models"
import { useAuth } from "../context/AuthContext";

interface ImageRecord {
  prompt: string;
  model: string;
  timestamp: string;
  image_data: string;
  image_type: string | null | undefined;
}

interface PromptGroup {
  prompt: string;
  images: ImageRecord[];
}

const backendUrl = import.meta.env.VITE_API_URL;

export default function History() {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [history, setHistory] = useState<PromptGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<ImageRecord | null>(null);

  useEffect(() => {
    if (!isLoggedIn) {
       setLoading(false);
       setHistory([]);
       return;
     }

    async function fetchHistory() {
      setLoading(true);
      try {
        const res = await axios.get(`${backendUrl}/images/history`, {
          withCredentials: true,
        });
        const data = res.data;
        const groups: { [prompt: string]: ImageRecord[] } = {};
        (data.history || []).forEach((item: ImageRecord) => {
          if (!groups[item.prompt]) groups[item.prompt] = [];
          groups[item.prompt].push(item);
        });

        setHistory(Object.keys(groups).map((prompt) => ({
          prompt,
          images: groups[prompt],
        })));
      } catch (err) {
        console.error("Failed to fetch history:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, [isLoggedIn]);

  if (loading)
    return (
      <Center mt="md">
        <Loader data-testid="history-loader" />
      </Center>
    );

  if (history.length === 0)
    return (
      <Center mt="md">
        <Text c="dimmed">No history to show.</Text>
      </Center>
    );

  return (
    <>
      <ScrollArea h="100%">
        <Stack gap="xl">
          {history.map((group, idx) => (
            <Stack key={idx} gap="md">
              <Title order={4} data-testid={`prompt-${group.prompt}`}>
                {group.prompt}
              </Title>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "16px",
                }}
              >
                {group.images?.filter(Boolean).map((item, i) => (
                  <Stack key={i} gap="xs" align="center">
                    <img
                      data-testid={`image-${item.prompt}-${item.model}`}
                      src={`data:image/png;base64,${item.image_data}`}
                      alt={item.prompt}
                      style={{
                        width: "100%",
                        aspectRatio: "1 / 1",
                        objectFit: "cover",
                        cursor: "pointer",
                      }}
                      onClick={() => setSelectedImage(item)}
                    />

                    <Badge
                      data-testid={`model-${item.prompt}-${item.model}`}
                      variant="light"
                    >
                      {item.model}
                    </Badge>

                    <Text
                      data-testid={`timestamp-${item.prompt}-${item.model}`}
                      size="xs"
                      c="dimmed"
                    >
                      {new Date(item.timestamp).toLocaleString()}
                    </Text>

                    <Text
                      data-testid={`type-${item.prompt}-${item.model}`}
                      size="xs"
                    >
                      Type: {item.image_type || "generated"}
                    </Text>
                  </Stack>
                ))}
              </div>
            </Stack>
          ))}
        </Stack>
      </ScrollArea>

     <Modal
        opened={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        centered
        size="lg"
        withinPortal={true}
        yOffset={0}
        scrollAreaComponent={ScrollArea}
      >
  {selectedImage != null && selectedImage.image_data && (
    <Stack>
      <img
        data-testid="modal-image"
        src={`data:image/${selectedImage.image_type || "png"};base64,${selectedImage.image_data}`}
        alt={selectedImage.prompt}
        style={{
          width: "100%",
          height: "auto",
          maxHeight: "70vh",
          objectFit: "contain",
        }}
      />

      <Button
        mt="md"
        fullWidth
        onClick={() => {
          const img = selectedImage;
          setSelectedImage(null);
          setTimeout(() => {
            navigate("/playground/ImageEditor", {
              state: {
                imageToEdit: {
                  image_data: img.image_data,
                  image_type: img.image_type,
                  prompt: img.prompt,
                  model: img.model || EDIT_MODELS[0]
                }
              }
            });
          }, 0);
          }}
      >
        Edit image
      </Button>
    </Stack>
  )}
</Modal>
</>
);
}