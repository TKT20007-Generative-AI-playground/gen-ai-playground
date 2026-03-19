import { Badge, Box, Card, Group, Overlay, Text } from "@mantine/core"
import { useState } from "react"
import type { ImageRecord } from "./historyInterfaces"
import { getTypeColor, getTypeIcon, getTypeLabel } from "./ImageUtils"
import { ClockIcon } from "./Icons"

export default function ImageCard({ item, onClick }: { item: ImageRecord; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)

  return (
    <Card
      shadow={hovered ? "xl" : "sm"}
      radius="lg"
      p={0}
      style={{
        cursor: "pointer",
        overflow: "hidden",
        transition:
          "transform 0.25s cubic-bezier(.4,0,.2,1), box-shadow 0.25s cubic-bezier(.4,0,.2,1)",
        transform: hovered ? "translateY(-4px) scale(1.015)" : "none",
        border: hovered ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.025)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {/* Image area */}
      <Box style={{ position: "relative", aspectRatio: "1 / 1", overflow: "hidden" }}>
        <img
          data-testid={`image-${item.prompt}-${item.model}`}
          src={`data:image/png;base64,${item.image_data}`}
          alt={item.prompt}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transition: "transform 0.4s cubic-bezier(.4,0,.2,1)",
            transform: hovered ? "scale(1.06)" : "scale(1)",
            display: "block",
          }}
        />

        {/* Type badge */}
        <Badge
          data-testid={item.image_type}
          size="xs"
          variant="filled"
          color={getTypeColor(item.image_type)}
          radius="sm"
          leftSection={getTypeIcon(item.image_type)}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 2,
            textTransform: "capitalize",
            fontSize: 10,
            fontWeight: 600,
            backdropFilter: "blur(8px)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
          }}
        >
          {getTypeLabel(item.image_type)}
        </Badge>

        {/* Hover overlay with prompt */}
        <Overlay
          gradient="linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.35) 40%, transparent 70%)"
          opacity={hovered ? 1 : 0}
          style={{
            transition: "opacity 0.3s ease",
            display: "flex",
            alignItems: "flex-end",
            padding: 14,
            pointerEvents: "none",
          }}
          zIndex={1}
        >
          <Text
            size="xs"
            c="white"
            lineClamp={3}
            style={{
              fontStyle: "italic",
              lineHeight: 1.5,
              textShadow: "0 1px 3px rgba(0,0,0,0.5)",
            }}
          >
            "{item.prompt}"
          </Text>
        </Overlay>
      </Box>

      {/* Info bar */}
      <Box px={2} py={10} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <Group justify="space-between" align="center" wrap="nowrap">
          <Badge
            data-testid={`model-${item.prompt}-${item.model}`}
            size="xs"
            variant="dot"
            color="blue"
            radius="sm"
            style={{ textTransform: "none", letterSpacing: 0.2, fontSize: 10, maxWidth: "60%" }}
          >
            {item.model}
          </Badge>
          <Group gap={4} align="center" wrap="nowrap">
            <Box c="dimmed" style={{ display: "flex" }}>
              <ClockIcon />
            </Box>
            <Text
              data-testid={`timestamp-${item.prompt}-${item.model}`}
              size="xs"
              c="dimmed"
              style={{ fontSize: 10, whiteSpace: "nowrap" }}
            >
              {new Date(item.timestamp).toLocaleDateString()}
            </Text>
          </Group>
        </Group>
      </Box>
    </Card>
  )
}
