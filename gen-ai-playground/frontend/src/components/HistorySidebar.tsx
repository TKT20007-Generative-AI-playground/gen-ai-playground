import { useCallback, useEffect, useState } from "react"
import {
  Stack,
  Text,
  Badge,
  ScrollArea,
  Loader,
  Center,
  Select,
  Group,
  Button,
  Paper,
} from "@mantine/core"
import axios from "axios"
import { useNavigate } from "react-router-dom"
import { formatDate } from "./history-ui/ImageUtils"
import { formatAudioModelName, getAudioInputTitle } from "./history-ui/audioHistoryUtils"

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

interface HistoryRecord {
  type: "image" | "text" | "chat" | "transcription"
  prompt?: string
  generated_text?: string
  messages?: ChatMessage[]
  reply?: string
  response?: string
  transcription_text?: string
  language?: string
  transcription_time_ms?: number
  source?: string
  input_name?: string
  run_id?: string
  model: string
  timestamp: string
  image_data?: string
  user_base64_image?: string | null
  image_type: string | null | undefined
  id?: string
}

interface SharedConversationMessage {
  role: "user" | "assistant"
  content: string
}

interface SharedConversationRecord {
  _id: string
  title?: string
  model?: string
  messages?: SharedConversationMessage[]
  created_at?: string
  updated_at?: string
}

const backendUrl = import.meta.env.VITE_API_URL
const AUDIO_SIDEBAR_MAX_FETCH = 200
const AUDIO_RECORDS_PER_SESSION = 4

export default function HistorySidebar({ opened }: { opened: boolean }) {
  const [items, setItems] = useState<HistoryRecord[]>([])
  const [sharedConversations, setSharedConversations] = useState<SharedConversationRecord[]>([])
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [limit, setLimit] = useState(5)
  const [historyType, setHistoryType] = useState<"image" | "text" | "shared-chat" | "audio" >("image")

  const conversations = []
  let last = null

  for (const item of items) {
    const startPrompt = item.type === "chat" ? item.messages?.[0]?.content : item.prompt

    const ts = new Date(item.timestamp).getTime()

    if (last && last.startPrompt === startPrompt && Math.abs(ts - last.timestamp) < 10000) {
      last.models.push({
        model: item.model,
        response: item.generated_text ?? item.reply ?? null,
      })
    } else {
      last = {
        startPrompt,
        timestamp: ts,
        models: [
          {
            model: item.model,
            response: item.generated_text ?? item.reply ?? null,
          },
        ],
      }
      conversations.push(last)
    }
  }

  conversations.sort((a, b) => b.timestamp - a.timestamp)
  const limited = conversations.slice(0, limit)

  const audioRuns = []
  let lastAudioRun = null

  for (const item of items) {
    const ts = new Date(item.timestamp).getTime()
    const response = item.transcription_text ?? item.response ?? item.reply ?? null
    const title = getAudioInputTitle(item)

    const normalizedRunId = item.run_id?.trim() || null
    const lastRunId = lastAudioRun?.runId ?? null
    const hasRunIdPair = !!normalizedRunId && !!lastRunId

    const isSameRun =
      lastAudioRun &&
      (hasRunIdPair
        ? normalizedRunId === lastRunId
        : Math.abs(ts - lastAudioRun.timestamp) < 10000 &&
        (lastAudioRun.source ?? null) === (item.source ?? null))

    if (isSameRun && lastAudioRun) {
      lastAudioRun.models.push({
        model: item.model,
        response,
        language: item.language,
        transcriptionTimeMs: item.transcription_time_ms ?? null,
      })
    } else {
      lastAudioRun = {
        timestamp: ts,
        runId: normalizedRunId,
        source: item.source,
        title,
        models: [
          {
            model: item.model,
            response,
            language: item.language,
            transcriptionTimeMs: item.transcription_time_ms ?? null,
          },
        ],
      }
      audioRuns.push(lastAudioRun)
    }
  }

  audioRuns.sort((a, b) => b.timestamp - a.timestamp)
  const limitedAudioRuns = audioRuns.slice(0, limit)

  const refetch = useCallback(async () => {
    setLoading(true)

    try {
      const url =
        historyType === "image"
          ? `${backendUrl}/images/history`
          : historyType === "text"
            ? `${backendUrl}/text/history-sidebar`
            : historyType === "audio"
              ? `${backendUrl}/audio/history-sidebar`
              : `${backendUrl}/text/shared-conversations-sidebar`

      const audioFetchLimit = Math.min(AUDIO_SIDEBAR_MAX_FETCH, limit * AUDIO_RECORDS_PER_SESSION)

      const res = await axios.get(url, {
        withCredentials: true,
        params:
          historyType === "audio"
            ? { limit: audioFetchLimit }
            : historyType === "shared-chat"
              ? { limit }
              : undefined,
      })
      if (historyType === "shared-chat") {
        setSharedConversations(res.data.history ?? [])
        setItems([])
      } else {
        const history: HistoryRecord[] = res.data.history
        setItems(history)
        setSharedConversations([])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [historyType, limit])

  // Fetch when sidebar opens
  useEffect(() => {
    if (opened) refetch()
  }, [opened, limit, historyType, refetch])

  // Fetch when new image is generated
  useEffect(() => {
    let timeoutId: number | null = null

    const handler = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
      timeoutId = window.setTimeout(() => {
        refetch()
      }, 300)
    }

    window.addEventListener("history-update", handler)
    return () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
      window.removeEventListener("history-update", handler)
    }
  }, [limit, historyType, opened, refetch])

  if (loading)
    return (
      <Center mt="md">
        <Loader />
      </Center>
    )

  if (items.length === 0 && sharedConversations.length === 0)
    return (
      <Center mt="md">
        <Text c="dimmed">No recent history.</Text>
      </Center>
    )

  return (
    <ScrollArea h="100vh" offsetScrollbars={false} type="auto" scrollbarSize={8}>
      <Stack gap="lg" p={0} m={0}>
        <Group grow>
          <Select
            label="Type: "
            value={historyType}
            onChange={(value: string | null) => {
              if (value === "image" || value === "text" || value === "audio" || value === "shared-chat") {
                setHistoryType(value)
              }
            }}
            data={[
              { value: "image", label: "Generated images" },
              { value: "text", label: "Generated text" },
              { value: "shared-chat", label: "Shared conversations" },
              { value: "audio", label: "Transcriptions" },
            ]}
          />

          <Select
            label="Show latest: "
            value={String(limit)}
            onChange={(value: string | null) => {
              if (value !== null) setLimit(Number(value))
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
              const startPrompt = item.startPrompt

              return (
                <Paper key={i} p="md" radius="xl" shadow="sm" withBorder bg="rgba(0,0,0,0.06)">
                  <Stack gap="xs">
                    <Text size="xs" c="dimmed">
                      {formatDate(item.timestamp)}
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
                      <Button
                        mt="xs"
                        size="xs"
                        variant="light"
                        onClick={() => navigate("/history", { state: { tab: "text" } })}
                      >
                        View in History
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              )
            })}
          </>
        )}
        {historyType === "shared-chat" && (
          <>
            {sharedConversations.map((item, i) => {
              const firstUserMessage = item.messages?.find(message => message.role === "user")?.content
              const timestamp = item.updated_at ?? item.created_at
              const conversationTitle = item.title?.trim() || "Untitled Conversation"

              return (
                <Paper key={i} p="md" radius="xl" shadow="sm" withBorder bg="rgba(0,0,0,0.06)">
                  <Stack gap="xs">
                    {timestamp && (
                      <Text size="xs" c="dimmed">
                        {formatDate(timestamp)}
                      </Text>
                    )}

                    <Stack gap={4}>
                      <Text fw={400} size="sx" c="gray.5">
                        Conversation:
                      </Text>

                      <Text size="md" fw={600}>
                        {conversationTitle}
                      </Text>

                      <Text size="sm" c="gray.6" mt={4}>
                        {firstUserMessage
                          ? (firstUserMessage.length > 70 ? `${firstUserMessage.slice(0, 70)}...` : firstUserMessage)
                          : "(no messages yet)"}
                      </Text>

                      <Badge variant="light" w="fit-content">
                        {item.model || "default"}
                      </Badge>
                      <Button
                        mt="xs"
                        size="xs"
                        variant="light"
                        onClick={() => navigate("/history", { state: { tab: "conversations" } })}
                      >
                        View in History
                      </Button>
                      <Button
                        mt="xs"
                        size="xs"
                        variant="light"
                        onClick={() => navigate(`/chat/conversations/${item._id}`)}
                      >
                        Open conversation
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              )
            })}
          </>
        )}

        {historyType === "audio" && (
          <>
            {limitedAudioRuns.map((run, i) => {
              return (
                <Paper key={i} p="md" radius="xl" shadow="sm" withBorder bg="rgba(0,0,0,0.06)">
                  <Stack gap="xs">
                    <Text size="xs" c="dimmed">
                      {formatDate(run.timestamp)}
                    </Text>

                    <Stack gap={4}>
                      <Text size="md" fw={600} style={{ whiteSpace: "pre-wrap" }}>
                        {run.title}
                      </Text>

                      <Stack gap={2} mt={4}>
                        {run.models.map((m, idx) => (
                          <Text key={idx} size="sm" c="gray.6">
                            <strong>{formatAudioModelName(m.model)}:</strong>{" "}
                            {m.response
                              ? m.response.length > 50
                                ? m.response.slice(0, 50) + "..."
                                : m.response
                              : "(no transcription)"}
                            {typeof m.transcriptionTimeMs === "number" ? ` (${m.transcriptionTimeMs} ms)` : ""}
                          </Text>
                        ))}
                      </Stack>
                      <Button
                        mt="xs"
                        size="xs"
                        variant="light"
                        onClick={() => navigate("/history", { state: { tab: "audio" } })}
                      >
                        View in History
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              )
            })}
          </>
        )}

        {historyType === "image" && (
          <>
            {items
              .filter(item => item.image_type !== "original")
              .slice(0, limit)
              .map((item, i) => {
                const base64 = item.image_data || item.user_base64_image

                return (
                  <Paper key={i} p="md" radius="xl" shadow="sm" withBorder bg="rgba(0,0,0,0.06)">
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

                      <Text size="xs">Type: {item.image_type || "generated"}</Text>
                      <Button
                        mt="xs"
                        size="xs"
                        variant="light"
                        onClick={() => navigate("/history", { state: { tab: "images" } })}
                      >
                        View in History
                      </Button>
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
                          })
                        }}
                      >
                        Edit image
                      </Button>
                    </Stack>
                  </Paper>
                )
              })}
          </>
        )}
      </Stack>
    </ScrollArea>
  )
}