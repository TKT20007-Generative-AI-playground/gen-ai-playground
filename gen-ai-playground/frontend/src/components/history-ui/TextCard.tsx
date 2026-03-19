import { ActionIcon, Badge, Box, Button, Divider, Group, Paper, Stack, Text, Tooltip } from "@mantine/core"
import { useState } from "react"
import type {TextRecord} from "./historyInterfaces"
import { formatDate } from "./imageUtils"
import { ClockIcon, CopyIcon } from "./Icons"

export default function TextCard({ item }: { item: TextRecord }) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const prompt = [...item.messages].reverse().find(m => m.role === "user")?.content ?? ""

  const response = item.reply

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(response).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  const isLong = response.length > 300
  const displayText = isLong && !expanded ? response.slice(0, 300) + "…" : response

  return (
    <Paper
      p="md"
      radius="lg"
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
      }}
      styles={{
        root: {
          "&:hover": {
            borderColor: "rgba(255,255,255,0.12)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
          },
        },
      }}
    >
      <Stack gap="sm">
        {/* Prompt */}
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
            {prompt}
          </Text>

          <Tooltip label={copied ? "Copied!" : "Copy response"} withArrow position="left">
            <ActionIcon
              size="sm"
              variant="subtle"
              color={copied ? "teal" : "gray"}
              onClick={handleCopy}
              style={{ flexShrink: 0, transition: "color 0.15s" }}
            >
              <CopyIcon />
            </ActionIcon>
          </Tooltip>
        </Group>

        <Divider size="xs" style={{ opacity: 0.08 }} />

        {/* Response */}
        <Text
          size="xs"
          style={{
            color: "black",
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
          }}
        >
          {displayText}
        </Text>

        {isLong && (
          <Button
            variant="subtle"
            size="compact-xs"
            color="gray"
            style={{ width: "fit-content", fontSize: 11, opacity: 0.7 }}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Show less" : "Read more"}
          </Button>
        )}

        {/* Meta */}
        <Group gap="sm" align="center" mt={4}>
          <Badge
            size="xs"
            variant="dot"
            color="blue"
            radius="sm"
            style={{ textTransform: "none", letterSpacing: 0.2, fontSize: 10 }}
          >
            {item.model}
          </Badge>

          <Group gap={4} align="center">
            <Box c="dimmed" style={{ display: "flex" }}>
              <ClockIcon />
            </Box>
            <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>
              {formatDate(item.timestamp)}
            </Text>
          </Group>

          {item.generation_time_ms && (
            <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>
              {item.generation_time_ms} ms
            </Text>
          )}
        </Group>
      </Stack>
    </Paper>
  )
}