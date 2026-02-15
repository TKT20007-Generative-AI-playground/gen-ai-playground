import { useRef } from "react"
import { Textarea, Button, Stack, Group } from "@mantine/core"

type PromptTextBoxProps = {
  onSubmit: (prompt: string) => void
  value: string
  onChange: (value: string) => void
  usage?: string
}

export function PromptTextBox({ onSubmit, value, onChange, usage }: PromptTextBoxProps) {
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const handleSubmit = () => {
    if (promptRef.current) {
      onSubmit(promptRef.current.value)
    }
  }

  return (
    <Stack gap="sm" w="100%">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        ref={promptRef}
        placeholder="Prompt here"
        autosize
        minRows={3}
        maxRows={12}
        w="100%"
        styles={{
          input: { resize: "vertical" },
        }}
      />

      <Group justify="center">
        <Button onClick={handleSubmit}>{usage}</Button>
      </Group>
    </Stack>
  )
}
