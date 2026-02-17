import { Paper, Text, Group } from "@mantine/core"
import { getModelDescription, getModelDisplayName, getModelPrice } from "../constants/models"
import { useRef, useEffect, useState } from "react"

type Props = {
  model: string | undefined
  height: number
}

export default function ModelDescriptionBox({ model, height }: Props) {
  const title = getModelDisplayName(model)
  const price = getModelPrice(model)
  const description = getModelDescription(model)

  const paragraphs = description
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean)

  const bodyRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    const body = bodyRef.current
    const inner = innerRef.current
    if (!body || !inner) return

    setIsOverflowing(inner.scrollHeight > body.clientHeight)
  }, [model, height])

  const shouldCenter = model && !isOverflowing

  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      style={{
        height,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <Group justify="space-between" align="baseline" mb={6} wrap="nowrap">
        <Text fw={700} size="sm">
          {title}
        </Text>

        <Text fw={400} size="sm" c="dimmed">
          {price}
        </Text>
      </Group>

      {/* Body */}
      <div
        ref={bodyRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: isOverflowing ? "auto" : "hidden",

          display: "flex",
          flexDirection: "column",

          justifyContent: shouldCenter ? "center" : "flex-start",
        }}
      >
        <div ref={innerRef}>
          {!model ? (
            <Text size="sm" c="dimmed">
              Select a model to see its description.
            </Text>
          ) : (
            paragraphs.map((p, idx) => (
              <Text
                key={idx}
                size="sm"
                mt={idx === 0 ? 0 : 10}
                fw={idx === 0 ? 500 : 400}
                style={{
                  textAlign: "justify",
                  hyphens: "auto",
                  overflowWrap: "break-word",
                }}
              >
                {p}
              </Text>
            ))
          )}
        </div>
      </div>
    </Paper>
  )
}
