import { Select, Stack } from "@mantine/core"
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import ModelDescriptionBox from "./ModelDescriptionBox"
import { MODEL_DESCRIPTIONS, getModelDisplayName, getModelPrice } from "../constants/models"

type Props = {
  label: string
  models: readonly string[]
  value: string | undefined
  onChange: (value: string | null) => void
  width?: number
  descriptionHeight?: number
  placeholder?: string
}

/**
 * Model selector + description box with STATIC sizing.
 * Height is computed by measuring hidden mock boxes that match the real box layout.
 */
export default function ModelSelector({
  label,
  models,
  value,
  onChange,
  width = 620,
  descriptionHeight,
  placeholder,
}: Props) {
  const [descHeight, setDescHeight] = useState<number>(360)
  const measureRef = useRef<HTMLDivElement | null>(null)

  // ref to the Select container so we can disable spellcheck on the real inputs
  const selectContainerRef = useRef<HTMLDivElement | null>(null)

  const selectData = useMemo(
    () =>
      models.map((m) => ({
        value: m,
        label: getModelDisplayName(m),
      })),
    [models]
  )

  const measurementCards = useMemo(() => {
    return models.map((m) => {
      const title = getModelDisplayName(m)
      const price = getModelPrice(m)
      const raw = MODEL_DESCRIPTIONS[m] ?? ""
      const paragraphs = raw
        .split(/\n\s*\n/g)
        .map((p) => p.trim())
        .filter(Boolean)

      return { key: m, title, price, paragraphs }
    })
  }, [models])

  useLayoutEffect(() => {
    if (descriptionHeight != null) return

    const root = measureRef.current
    if (!root) return

    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-measure-card]"))

    const computeAndSet = () => {
      let max = 0
      for (const card of cards) {
        max = Math.max(max, card.scrollHeight)
      }

      // small safety buffer for Mantine font rendering differences
      const BUFFER = 14
      const next = max + BUFFER

      setDescHeight((prev) => (prev === next ? prev : next))
    }

    // Schedule the measurement/update asynchronously to avoid "setState in effect" lint rule.
    const raf1 = requestAnimationFrame(computeAndSet)

    // If fonts/layout change after mount, re-measure.
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(computeAndSet)
    })
    ro.observe(root)

    return () => {
      cancelAnimationFrame(raf1)
      ro.disconnect()
    }
  }, [measurementCards, width, descriptionHeight])

  useLayoutEffect(() => {
    const root = selectContainerRef.current
    if (!root) return

    const inputs = root.querySelectorAll("input")
    inputs.forEach((input) => {
      input.setAttribute("spellcheck", "false")
      input.setAttribute("autocorrect", "off")
      input.setAttribute("autocapitalize", "none")
    })
  }, [value, width, models])

  function handleChange(nextValue: string | null) {
    onChange(nextValue)
    setTimeout(() => {
      const active = document.activeElement as HTMLElement | null
      active?.blur()
    }, 0)
  }

  const finalDescHeight = descriptionHeight ?? descHeight

  return (
    <>
      {/* Hidden measurement area */}
      {descriptionHeight == null && (
        <div
          ref={measureRef}
          style={{
            position: "absolute",
            left: -10000,
            top: 0,
            width,
            visibility: "hidden",
            pointerEvents: "none",
          }}
        >
          {measurementCards.map((card) => (
            <div
              key={card.key}
              data-measure-card
              style={{
                width,
                boxSizing: "border-box",
                padding: 16,
                fontSize: 14,
                lineHeight: 1.55,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 12,
                  marginBottom: 6,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.55 }}>{card.title}</div>
                <div
                  style={{
                    fontWeight: 400,
                    fontSize: 14,
                    lineHeight: 1.55,
                    whiteSpace: "nowrap",
                    opacity: 0.7,
                  }}
                >
                  {card.price}
                </div>
              </div>

              {card.paragraphs.map((p, idx) => (
                <div
                  key={idx}
                  style={{
                    marginTop: idx === 0 ? 0 : 10,
                    fontWeight: idx === 0 ? 500 : 400,
                    textAlign: "justify",
                    hyphens: "auto",
                    overflowWrap: "break-word",
                  }}
                >
                  {p}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <Stack
        gap={10}
        style={{
          width,
          minWidth: width,
          maxWidth: width,
          flexShrink: 0,
        }}
      >
        <div ref={selectContainerRef}>
          <Select
            label={label}
            placeholder={placeholder ?? "Select model"}
            data={selectData}
            value={value ?? null}
            onChange={handleChange}
            clearable
            searchable
            data-testid={label === "Model 1" ? "model-1-selector" : "model-2-selector"}
            rightSectionWidth={80}
            styles={{
              input: {
                height: 42,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              },
              root: { width: "100%" },
              wrapper: { width: "100%" },
              dropdown: { maxWidth: width },
            }}
          />
        </div>

        <ModelDescriptionBox model={value} height={finalDescHeight} />
      </Stack>
    </>
  )
}
