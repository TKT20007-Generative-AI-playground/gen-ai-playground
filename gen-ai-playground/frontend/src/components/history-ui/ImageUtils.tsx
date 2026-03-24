import { BrushIcon, ImageIcon, SparkleIcon } from "./Icons"

export function getTypeColor(type: string | null | undefined): string {
  switch (type) {
    case "generated":
      return "teal"
    case "edited":
      return "violet"
    case "original":
      return "gray"
    default:
      return "gray"
  }
}

export function getTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case "generated":
      return "Generated"
    case "edited":
      return "Edited"
    case "original":
      return "Original"
    default:
      return type || "Unknown"
  }
}

export function getTypeIcon(type: string | null | undefined) {
  switch (type) {
    case "generated":
      return <SparkleIcon />
    case "edited":
      return <BrushIcon />
    default:
      return <ImageIcon />
  }
}
export function formatDate(ts: string) {
  const d = new Date(ts)
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
    "  ·  " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  )
}
