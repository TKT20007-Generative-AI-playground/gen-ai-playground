import { useEffect, useState } from "react";
import {
  Stack,
  Title,
  Text,
  Badge,
  ScrollArea,
  Loader,
  Center
} from "@mantine/core";

interface ImageRecord {
  prompt: string;
  model: string;
  timestamp: string;
  image_data: string;
  image_type: string | null | undefined;
}

interface PromtGroup {
  prompt: string;
  images: ImageRecord[];
}

const backendUrl = import.meta.env.VITE_API_URL;

export default function History() {
  const [history, setHistory] = useState<PromtGroup[]>([]);
  const [loading, setLoading] = useState(true);

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
          {group.images.map((item, i) => (
            <Stack key={i} gap="xs" align="center">
              <img
                src={`data:image/${item.image_type || "png"};base64,${item.image_data}`}
                alt={item.prompt}
                style={{
                width: "100%",
                aspectRatio: "1 / 1",
                objectFit: "cover",
                }}
              />

              <Badge variant="light">{item.model}</Badge>

              <Text size="xs" c="dimmed">
                {new Date(item.timestamp).toLocaleString()}
              </Text>

              <Text size="xs">
                Type: {item.image_type || "generated"}
              </Text>
            </Stack>
          ))}
        </div>


      </Stack>
    ))}

  </Stack>
</ScrollArea>
  );
}
