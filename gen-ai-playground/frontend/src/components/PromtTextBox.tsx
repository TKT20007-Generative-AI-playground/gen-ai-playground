import { useRef } from "react"
import { Textarea, Button, Box } from '@mantine/core'

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
    <Box style={{  overflow: 'auto', minWidth: '400px', minHeight: '150px' }}>
      <Textarea
        value={value}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        ref={promptRef}
        placeholder="Prompt here"
        autosize
        minRows={3}
        style={{ resize: 'both', overflow: 'auto' }}
        w="100%"
      />
      <Button onClick={handleSubmit} mt="sm" >
        {usage}
      </Button>
    </Box>
  )
}
