import {
  ActionIcon,
  Badge,
  Box,
  Button,
  CopyButton,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core"
import { useState } from "react"
import type { ConversationRecord } from "./historyInterfaces"
import { formatDate } from "./ImageUtils"
import { ClockIcon, CopyIcon } from "./Icons"

function MessageBubble({ role, content, sender }: { role: string; content: string; sender: string }) {
  const isUser = role === "user"
  return (
    <Box
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        gap: 2,
      }}
    >
      <Text style={{ fontSize: 9, color: "rgba(0,0,0,0.35)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {isUser ? (sender ?? "You") : "Assistant"}
      </Text>
      <Box
        style={{
          background: isUser ? "rgba(124,106,247,0.12)" : "rgba(0,0,0,0.05)",
          border: isUser ? "1px solid rgba(124,106,247,0.2)" : "1px solid rgba(0,0,0,0.07)",
          borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
          padding: "6px 10px",
          maxWidth: "90%",
        }}
      >
        <Text size="xs" style={{ color: "black", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
          {content}
        </Text>
      </Box>
    </Box>
  )
}

export default function ConversationCard({ item }: { item: ConversationRecord }) {
  const [copied, setCopied] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const messages = item.messages ?? []
  const firstMessage = messages[0]
  const lastAssistantMessage = [...messages].reverse().find(m => m.role === "assistant")?.content ?? ""

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(lastAssistantMessage).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

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
        {/* Title + copy */}
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Text size="sm" fw={600} style={{ color: "black", lineHeight: 1.45, flex: 1 }}>
            {item.title}
          </Text>
          <Tooltip label={copied ? "Copied!" : "Copy last response"} withArrow position="left">
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

        {/* Messages */}
        <Stack gap={8}>
          {!showAll && firstMessage && (
            <MessageBubble role={firstMessage.role} content={firstMessage.content} sender={firstMessage.sender} />
          )}

          {showAll && messages.map((msg, idx) => (
            <MessageBubble key={idx} role={msg.role} content={msg.content} sender={msg.sender} />
          ))}
        </Stack>

        {messages.length > 1 && (
          <Button
            variant="subtle"
            size="compact-xs"
            color="gray"
            style={{ width: "fit-content", fontSize: 11, opacity: 0.7 }}
            onClick={() => setShowAll(prev => !prev)}
          >
            {showAll ? "Show less" : `View all ${messages.length} messages`}
          </Button>
        )}

        {/* Meta */}
        <Group gap="sm" align="center" mt={4}>
          <Badge
            size="xs"
            variant="dot"
            color="violet"
            radius="sm"
            style={{ textTransform: "none", letterSpacing: 0.2, fontSize: 10 }}
          >
            {item.model}
          </Badge>

          <Badge
            size="xs"
            variant="outline"
            color="gray"
            radius="sm"
            style={{ textTransform: "none", fontSize: 10 }}
          >
            {messages.length} messages
          </Badge>

          <Tooltip label="Open conversation in chat view" withArrow position="top">
            <Button
              component="a"
              href={`/chat/conversations/${item._id}`}
              size="compact-xs"
              variant="subtle"
              color="blue"
              radius="sm"
              style={{ fontSize: 10, padding: "0 6px", height: 18 }}
            >
              Open conversation
            </Button>
          </Tooltip>

          <CopyButton value={`${window.location.origin}/chat/conversations/${item._id}`} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label="Copy conversation link to clipboard" withArrow>
                <Button color={copied ? "teal" : "blue"} onClick={copy} size="compact-xs" variant="subtle" radius="sm" style={{ fontSize: 10, padding: "0 6px", height: 18 }}>
                  Copy link
                </Button>
              </Tooltip>
            )}
          </CopyButton>
          
          <CopyButton value={item.invite_code}>
            {({ copied, copy }) => (
              <Tooltip label="Copy invite code to clipboard" withArrow>
                <Button color={copied ? "teal" : "blue"} onClick={copy} size="compact-xs" variant="subtle" radius="sm" style={{ fontSize: 10, padding: "0 6px", height: 18 }}>
                  Copy invite code
                </Button>
              </Tooltip>
            )}
          </CopyButton>

          <Group gap={4} align="center">
            <Box c="dimmed" style={{ display: "flex" }}>
              <ClockIcon />
            </Box>
            <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>
              {formatDate(item.created_at)}
            </Text>
          </Group>
        </Group>
      </Stack>
    </Paper>
  )
}