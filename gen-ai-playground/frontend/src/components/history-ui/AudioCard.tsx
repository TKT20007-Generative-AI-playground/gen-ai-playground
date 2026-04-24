import { ActionIcon, Badge, Box, Button, Group, Paper, Stack, Text, Tooltip } from "@mantine/core"
import { useEffect, useRef, useState } from "react"
import type { AudioRecord } from "./historyInterfaces"
import { formatDate } from "./ImageUtils"
import { ClockIcon, CopyIcon } from "./Icons"
import { formatAudioModelName, getAudioInputTitle } from "./audioHistoryUtils"

export default function AudioCard({ item }: { item: AudioRecord }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle")
  const [expanded, setExpanded] = useState(false)
  const copyResetTimeoutRef = useRef<number | null>(null)
  const title = getAudioInputTitle(item)
  const modelLabel = formatAudioModelName(item.model)
  const transcript = item.transcription_text ?? ""
  const isLong = transcript.length > 320
  const displayText = isLong && !expanded ? `${transcript.slice(0, 320)}…` : transcript

  const scheduleCopyStateReset = () => {
    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current)
    }
    copyResetTimeoutRef.current = window.setTimeout(() => {
      setCopyState("idle")
      copyResetTimeoutRef.current = null
    }, 1800)
  }

  useEffect(
    () => () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current)
      }
    },
    [],
  )

  const handleCopy = async () => {
    if (!transcript) return

    if (!navigator?.clipboard?.writeText) {
      setCopyState("error")
      scheduleCopyStateReset()
      return
    }

    try {
      await navigator.clipboard.writeText(transcript)
      setCopyState("copied")
      scheduleCopyStateReset()
    } catch {
      setCopyState("error")
      scheduleCopyStateReset()
    }
  }

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
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Text
            size="sm"
            fw={600}
            style={{
              color: "black",
              lineHeight: 1.45,
              flex: 1,
            }}
          >
            {title}
          </Text>

          <Tooltip
            label={copyState === "copied" ? "Copied!" : copyState === "error" ? "Copy failed" : "Copy transcription"}
            withArrow
            position="left"
          >
            <ActionIcon
              size="sm"
              variant="subtle"
              color={copyState === "copied" ? "teal" : copyState === "error" ? "red" : "gray"}
              onClick={handleCopy}
              disabled={!transcript}
              style={{ flexShrink: 0, transition: "color 0.15s" }}
            >
              <CopyIcon />
            </ActionIcon>
          </Tooltip>
        </Group>

        <Text size="sm" style={{ color: "black", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
          {displayText || "(No transcription text)"}
        </Text>

        {isLong ? (
          <Button
            className="app-history-small-action"
            variant="subtle"
            size="xs"
            color="gray"
            style={{ width: "fit-content", opacity: 0.8 }}
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
