import { useEffect, useState } from "react";
import { Stack, Text, Badge, ScrollArea, Loader, Center, Select, Group, Button, Paper } from "@mantine/core";
import axios from "axios";
import { useNavigate } from "react-router-dom";


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
  response?: string;
  model: string;
  timestamp: string;
  image_data?: string;
  user_base64_image?: string | null;
  image_type: string | null | undefined;
  id?: string;
}

const backendUrl = import.meta.env.VITE_API_URL;

export default function HistorySidebar({ opened }: { opened: boolean }) {
  const [items, setItems] = useState<HistoryRecord[]>([]);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(5);
  const [historyType, setHistoryType] = useState<"image" | "text">("image");

const conversations = [];
let last = null;

for (const item of items) {
  const startPrompt =
    item.type === "chat"
      ? item.messages?.[0]?.content
      : item.prompt;

  const ts = new Date(item.timestamp).getTime();

  if (
    last &&
    last.startPrompt === startPrompt &&
    Math.abs(ts - last.timestamp) < 10000 
  ) {
    last.models.push({
      model: item.model,
      response: item.generated_text ?? item.reply ?? null,
    });


  } else {

    last = {
      startPrompt,
      timestamp: ts,
      models: [
        {
          model: item.model,
          response: item.generated_text ?? item.reply ?? null,
        }
      ],
    };
    conversations.push(last);
  }
}

conversations.sort((a, b) => b.timestamp - a.timestamp);
const limited = conversations.slice(0, limit);
    

 async function refetch() {
  setLoading(true);

  try {
    const url =
      historyType === "image"
        ? `${backendUrl}/images/history`
        : `${backendUrl}/text/history-sidebar`;

    const res = await axios.get(url, { withCredentials: true });
    const history: HistoryRecord[] = res.data.history;

    setItems(history);
    
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
    let timeoutId: number | null = null;

    const handler = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        refetch();
      }, 300);
    };

    window.addEventListener("history-update", handler);
    return () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      window.removeEventListener("history-update", handler);
    };
  }, [limit, historyType, opened]);


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
    <ScrollArea 
      h="100vh"
      offsetScrollbars={false}
      type="auto"
      scrollbarSize={8}
      >
      <Stack gap="lg" p={0} m={0}>
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

    {historyType === "text" && (
      <>
        {limited.map((item, i) => {
          const startPrompt = item.startPrompt;

          return (
            <Paper
              key={i}
              p="md"
              radius="xl"
              shadow="sm"
              withBorder
              bg="rgba(0,0,0,0.06)"
            >
              <Stack gap="xs">
                <Text size="xs" c="dimmed">
                  {new Date(item.timestamp).toLocaleString()}
                </Text>

                <Stack gap={4}>
                  <Text fw={400} size="sx" c="gray.5">
                    Conversation started with:
                  </Text>

                  <Text size="md" fw={600}>
                    {startPrompt}
                  </Text>

                  <Stack gap={2} mt={4}>
                    {item.models.map((m, idx) => (
                      <Text key={idx} size="sm" c="gray.6">
                        <strong>{m.model}:</strong>{" "}
                        {m.response
                          ? m.response.length > 50
                            ? m.response.slice(0, 50) + "..."
                            : m.response
                          : "(no response)"}
                      </Text>
                    ))}
                  </Stack>
                </Stack>
              </Stack>
            </Paper>
          );
        })}
      </>
    )}

  {historyType === "image" && (
    <>
      {items
        .filter((item) => item.image_type !== "original")
        .slice(0, limit)
        .map((item, i) => {
          const base64 = item.image_data || item.user_base64_image;

          return (
            <Paper
              key={i}
              p="md"
              radius="xl"
              shadow="sm"
              withBorder
              bg="rgba(0,0,0,0.06)"
            >
              <Stack gap="xs">
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

                <Button
                  mt="xs"
                  onClick={() => {
                    navigate("/playground/ImageEditor", {
                      state: {
                        imageToEdit: {
                          image_data: item.image_data || item.user_base64_image,
                          image_type: item.image_type,
                          prompt: item.prompt,
                          model: item.model,
                          id: item.id,
                        },
                      },
                    });
                  }}
                >
                  Edit image
                </Button>
              </Stack>
            </Paper>
          );
        })}
    </>
  )}
      </Stack>
    </ScrollArea>
  );
}