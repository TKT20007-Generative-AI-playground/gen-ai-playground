import { useEffect, useState } from "react";
import {
  Stack,
  Title,
  Text,
  Badge,
  ScrollArea,
  Loader,
  Center,
  Modal
} from "@mantine/core";
import axios from "axios";

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
  const [history, setHistory] = useState<PromptGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<ImageRecord | null>(null);

  useEffect(() => {
    axios.get(`${backendUrl}/images/history`, {
      withCredentials: true,
    })
      .then((res) => {
        const groups: { [prompt: string]: ImageRecord[] } = {};

        (res.data.history || []).forEach((item: ImageRecord) => {
          if (!groups[item.prompt]) groups[item.prompt] = [];
          groups[item.prompt].push(item);
        });

        const grouped = Object.keys(groups).map((prompt) => ({
          prompt,
          images: groups[prompt],
        }));

        setHistory(grouped);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch history:", err);
        setLoading(false);
      });
  }, []);

  if (loading)
    return (
      <Center mt="md">
        <Loader data-testid="history-loader"/>
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

        <Title order={4} data-testid={`prompt-${group.prompt}`}>{group.prompt}</Title>

        <div
          style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "16px",
          }}
        >
          {group.images.map((item, i) => (
            <Stack key={i} gap="xs" align="center">
              <img
                data-testid={`image-${item.prompt}-${item.model}`}
                src={`data:image/${item.image_type || "png"};base64,${item.image_data}`}
                alt={item.prompt}
                style={{
                width: "100%",
                aspectRatio: "1 / 1",
                objectFit: "cover",
                cursor: "pointer",
                }}
                onClick={() => setSelectedImage(item)}
              />

              <Badge data-testid={`model-${item.prompt}-${item.model}`} variant="light">{item.model}</Badge>

              <Text data-testid={`timestamp-${item.prompt}-${item.model}`} size="xs" c="dimmed">
                {new Date(item.timestamp).toLocaleString()}
              </Text>

              <Text data-testid={`type-${item.prompt}-${item.model}`} size="xs">
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
>
  {selectedImage && (
    <img
      data-testid="modal-image"
      src={`data:image/${selectedImage.image_type || "png"};base64,${selectedImage.image_data}`}
      alt={selectedImage.prompt}
      style={{
        width: "100%",
        height: "auto",
        maxHeight: "80vh",
        objectFit: "contain",
      }}
    />
  )}
</Modal>
</>
  );
}
