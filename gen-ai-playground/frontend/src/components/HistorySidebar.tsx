import { useEffect, useState } from "react";
import { Stack, Text, Badge, ScrollArea, Loader, Center, Select } from "@mantine/core";

interface ImageRecord {
  prompt: string;
  model: string;
  timestamp: string;
  image_data: string;
  image_type: string | null | undefined;
}

const backendUrl = import.meta.env.VITE_API_URL;

export default function HistorySidebar({ opened }: { opened: boolean }) {
  const [items, setItems] = useState<ImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(5);

  function refetch() {
    setLoading(true);

    fetch(`${backendUrl}/images/history`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
        "Content-Type": "application/json",
      },
    })
      .then((res) => res.json())
      .then((data) => {
        const history: ImageRecord[] = data.history || [];
        const latestFive = history.slice(0, limit);
        setItems(latestFive);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  // Fetch when sidebar opens
  useEffect(() => {
    if (opened) refetch();
  }, [opened, limit]);

  // Fetch when new image is generated
  useEffect(() => {
    const handler = () => {
        setTimeout(() => {
        refetch();
        }, 300); 
    };

    window.addEventListener("history-update", handler);
    return () => window.removeEventListener("history-update", handler);
    }, [limit]);


  if (loading)
    return (
      <Center mt="md">
        <Loader />
      </Center>
    );

  if (items.length === 0)
    return (
      <Center mt="md">
        <Text c="dimmed">No recent history.</Text>
      </Center>
    );

  return (
    <ScrollArea h="100%">
      <Stack gap="lg">
        <Select
          label="Show history"
          value={String(limit)}
        onChange={(v: string | null) => {
        if (v !== null) setLimit(Number(v));
        }}
          data={[
            { value: "5", label: "Latest 5" },
            { value: "10", label: "Latest 10" },
            { value: "15", label: "Latest 15" },
          ]}
        />

        {items.length === 0 && (
          <Center mt="md">
            <Text c="dimmed">No history found.</Text>
          </Center>
        )}
        {items.map((item, i) => (
          <Stack key={i} gap="xs">
            <img
              src={`data:image/png;base64,${item.image_data}`}
              alt={item.prompt}
              style={{
                width: "100%",
                aspectRatio: "1 / 1",
                objectFit: "cover",
                borderRadius: "6px",
              }}
            />

            <Text fw={500}>{item.prompt}</Text>

            <Badge variant="light">{item.model}</Badge>

            <Text size="xs" c="dimmed">
              {new Date(item.timestamp).toLocaleString()}
            </Text>

            <Text size="xs">
              Type: {item.image_type || "generated"}
            </Text>
          </Stack>
        ))}
      </Stack>
    </ScrollArea>
  );
}
