import { Text } from "@mantine/core"
import { useEffect, useState } from "react"
import { formatDurationMs } from "../utils/time"

type ActionStatusProps = {
  actionText: string
  startTime: number
}

export default function ActionStatus({ actionText, startTime }: ActionStatusProps) {
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setElapsedMs(Date.now() - startTime)
    }, 100)

    return () => clearInterval(id)
  }, [startTime])

  const display = formatDurationMs(elapsedMs, { decimals: 1, compactMinutes: true })

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
      <Text size="md" c="dimmed" fw={600}>
        {actionText}
      </Text>
      <Text size="lg" fw={700} c="dimmed">
        {display}
      </Text>
    </div>
  )
}
