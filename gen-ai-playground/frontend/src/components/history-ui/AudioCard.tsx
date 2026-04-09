import { Badge, Box, Button, Group, Paper, Stack, Text } from "@mantine/core"
import { useState } from "react"
import type { AudioRecord } from "./historyInterfaces"
import { formatDate } from "./ImageUtils"
import { ClockIcon } from "./Icons"
import { formatAudioModelName, getAudioInputTitle } from "./audioHistoryUtils"

export default function AudioCard({ item }: { item: AudioRecord }) {
  const [expanded, setExpanded] = useState(false)
  const title = getAudioInputTitle(item)
  const modelLabel = formatAudioModelName(item.model)
  const transcript = item.transcription_text ?? ""
  const isLong = transcript.length > 320
  const displayText = isLong && !expanded ? `${transcript.slice(0, 320)}…` : transcript

  return (
    <Paper
      p="md"
      radius="lg"
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <Stack gap="xs">
        <Text
          size="sm"
          fw={600}
          style={{
            color: "black",
            lineHeight: 1.45,
          }}
        >
          {title}
        </Text>

        <Text size="sm" style={{ color: "black", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
          {displayText || "(No transcription text)"}
        </Text>

        {isLong ? (
          <Button
            variant="subtle"
            size="compact-xs"
            color="gray"
            style={{ width: "fit-content", fontSize: 11, opacity: 0.7 }}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Show less" : "Read more"}
          </Button>
        ) : null}

        <Group gap="sm" align="center" mt={4}>
          <Badge size="xs" variant="dot" color="teal" radius="sm" style={{ textTransform: "none" }}>
            {modelLabel}
          </Badge>

          {item.language ? (
            <Badge size="xs" variant="light" color="gray" radius="sm" style={{ textTransform: "none" }}>
              {item.language}
            </Badge>
          ) : null}

          <Group gap={4} align="center">
            <Box c="dimmed" style={{ display: "flex" }}>
              <ClockIcon />
            </Box>
            <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>
              {formatDate(item.timestamp)}
            </Text>
          </Group>

          {typeof item.transcription_time_ms === "number" ? (
            <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>
              {item.transcription_time_ms} ms
            </Text>
          ) : null}
        </Group>
      </Stack>
    </Paper>
  )
}
