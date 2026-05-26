import { Badge, Box, Button, Group, Paper, Stack, Text } from "@mantine/core"
import type { VideoRecord } from "./historyInterfaces"
import { formatDate } from "./ImageUtils"
import { ClockIcon } from "./Icons"
import { formatDurationMs } from "../../utils/time"

export default function VideoCard({ item }: { item: VideoRecord }) {
  const videoSrc = `data:${item.mime_type || "video/mp4"};base64,${item.video_data}`

  const onDownload = () => {
    const link = document.createElement("a")
    link.href = videoSrc
    link.download = "generated-video.mp4"
    link.click()
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
        <Text
          size="sm"
          fw={600}
          style={{
            color: "black",
            lineHeight: 1.45,
          }}
        >
          {item.prompt}
        </Text>

        <video src={videoSrc} controls style={{ width: "100%", borderRadius: 8, background: "black" }} />

        <Group gap="sm" align="center" mt={4}>
          <Badge size="xs" variant="dot" color="violet" radius="sm" style={{ textTransform: "none" }}>
            {item.model}
          </Badge>

          {typeof item.generation_time_ms === "number" ? (
            <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>
              {formatDurationMs(item.generation_time_ms, { compactMinutes: true })}
            </Text>
          ) : null}

          {typeof item.num_frames === "number" ? (
            <Badge size="xs" variant="light" color="gray" radius="sm" style={{ textTransform: "none" }}>
              {item.num_frames} frames
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

          <Button size="xs" variant="light" onClick={onDownload}>
            Download
          </Button>
        </Group>
      </Stack>
    </Paper>
  )
}
