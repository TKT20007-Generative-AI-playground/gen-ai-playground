import { useEffect, useState } from "react";
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
import { useNavigate } from "react-router-dom";

interface ImageRecord {
  id: string;
  parent_image_id?: string | null;
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

  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${backendUrl}/images/history`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
        "Content-Type": "application/json",
      },
    })
      .then((res) => res.json())
      .then((data) => {
        const groups: { [prompt: string]: ImageRecord[] } = {};

        (data.history || []).forEach((item: ImageRecord) => {
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
        <Loader />
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
              <Title order={4}>{group.prompt}</Title>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "16px",
                }}
              >
                <Stack gap="xs" align="center">
                  <img
                    src={`data:image/${group.images[0].image_type || "png"};base64,${group.images[0].image_data}`}
                    alt={group.images[0].prompt}
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      objectFit: "cover",
                      cursor: "pointer",
                    }}
                    onClick={() => setSelectedImage(group.images[0])}
                  />
                  <Badge variant="light">{group.images[0].model}</Badge>
                </Stack>

                {group.images[1] && (
                  <Stack gap="xs" align="center">
                    <img
                      src={`data:image/${group.images[1].image_type || "png"};base64,${group.images[1].image_data}`}
                      alt={group.images[1].prompt}
                      style={{
                        width: "100%",
                        aspectRatio: "1 / 1",
                        objectFit: "cover",
                        cursor: "pointer",
                      }}
                      onClick={() => setSelectedImage(group.images[1])}
                    />
                    <Badge variant="light">{group.images[1].model}</Badge>
                  </Stack>
                )}
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
          <>
            <img
              src={`data:image/${selectedImage.image_type || "png"};base64,${selectedImage.image_data}`}
              alt={selectedImage.prompt}
              style={{
                width: "100%",
                height: "auto",
                maxHeight: "80vh",
                objectFit: "contain",
              }}
            />

            <Button
              mt="md"
              fullWidth
              onClick={() => {
                navigate("/playground", { state: { imageToEdit: selectedImage } });
                setSelectedImage(null);
              }}
            >
              Edit with new prompt
            </Button>
          </>
        )}
      </Modal>
    </>
  );
}