import { useEffect, useState } from "react";
import { Stack, Text, Badge, ScrollArea, Loader, Center, Select, Group } from "@mantine/core";
import axios from "axios";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}


interface HistoryRecord {
  type: "image" | "text" | "chat";
  prompt?: string;
  generated_text?: string;
  messages?: ChatMessage[];
  reply?: string;
  model: string;
  timestamp: string;
  image_data?: string;
  user_base64_image?: string | null;
  image_type: string | null | undefined;
}

const backendUrl = import.meta.env.VITE_API_URL;

export default function HistorySidebar({ opened }: { opened: boolean }) {
  const [items, setItems] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(5);
  const [historyType, setHistoryType] = useState<"image" | "text">("image");

  const conversations = items
    .map((item) => {
      const startPrompt =
        item.type === "chat"
          ? item.messages?.[0]?.content
          : item.prompt;

      return {
        ...item,
        startPrompt,
      };
    })
    .filter((item, index, self) =>
      index === self.findIndex((x) => x.startPrompt === item.startPrompt)
    );
  

  async function refetch() {
    setLoading(true);

    try {
      const url =
        historyType === "image"
          ? `${backendUrl}/images/history`
          : `${backendUrl}/text/history`;

      const res = await axios.get(url, { withCredentials: true });

      setItems(res.data.history.slice(0, limit));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }


  // Fetch when sidebar opens
  useEffect(() => {
    if (opened) refetch();
  }, [opened, limit, historyType]);

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
        <Group grow>
          <Select
            label="Type: "
            value={historyType}
            onChange={(value: string | null) => {
              if (value === "image" || value === "text") {
                setHistoryType(value);
              }
            }}
            data={[
              { value: "image", label: "Generated images" },
              { value: "text", label: "Generated text" },
            ]}
          />

          <Select
            label="Show latest: "
            value={String(limit)}
            onChange={(value: string | null) => {
              if (value !== null) setLimit(Number(value));
            }}
            data={[
              { value: "5", label: "5" },
              { value: "10", label: "10" },
              { value: "15", label: "15" },
            ]}
          />
        </Group>


        {items.length === 0 && (
          <Center mt="md">
            <Text c="dimmed">No history found.</Text>
          </Center>
        )}

    {historyType === "text" && (
      <>
        {conversations.map((item, i) => {
          const startPrompt =
            item.type === "chat"
              ? item.messages?.[0]?.content
              : item.prompt;

          return (
            <Stack
              key={i}
              gap="xs"
              style={{
                padding: "14px",
                borderRadius: "8px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <Text size="xs" c="dimmed">
                {new Date(item.timestamp).toLocaleString()}
              </Text>

              <Stack gap={4}>
                <Text fw={600} size="sm" c="gray.5">
                  Conversation started with:
                </Text>
                <Text size="sm">{startPrompt}</Text>
              </Stack>

              <Badge variant="light" mt="xs" size="sm">
                {item.model}
              </Badge>
            </Stack>
          );
        })}
      </>
    )}

        {historyType === "image" && (
          <>
            {items.map((item, i) => {
              const base64 = item.image_data || item.user_base64_image;

              return (
                <Stack key={i} gap="xs">
                  {base64 && (
                    <img
                      src={`data:image/png;base64,${base64}`}
                      alt={item.prompt}
                      style={{
                        width: "100%",
                        aspectRatio: "1 / 1",
                        objectFit: "cover",
                        borderRadius: "6px",
                      }}
                    />
                  )}

                  <Text fw={500}>{item.prompt}</Text>
                  <Badge variant="light">{item.model}</Badge>
                  <Text size="xs" c="dimmed">
                    {new Date(item.timestamp).toLocaleString()}
                  </Text>

                  <Text size="xs">
                    Type: {item.image_type || "generated"}
                  </Text>
                </Stack>
              );
            })}
          </>
        )}
      </Stack>
    </ScrollArea>
  );
}