import { Card, Text } from "@mantine/core"
import type { ReactNode } from "react"

export type PhotoAreaProps = {
  src: string | null
  alt: string
  header?: ReactNode
  height?: number
}

export default function PhotoArea({ src, alt, header, height = 420 }: PhotoAreaProps) {
  const hasImage = Boolean(src)

  return (
    <Card withBorder radius="md" p="md" style={{ width: "100%" }}>
      {header && <div style={{ marginBottom: 10 }}>{header}</div>}

      <div
        style={{
          width: "100%",
          borderRadius: 0,
          overflow: "hidden",
          background: "transparent",
          height: hasImage ? "auto" : height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {hasImage ? (
          <img
            src={src as string}
            alt={alt}
            style={{
              width: "100%",
              height: "auto",
              display: "block",
              objectFit: "contain",
              maxHeight: height,
            }}
          />
        ) : (
          <Text c="dimmed" size="sm">
            No image
          </Text>
        )}
      </div>
    </Card>
  )
}
