import { useRef } from "react"

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
    <>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        ref={promptRef}
        placeholder="Prompt here "
        rows={5}
        cols={50}
      />
      <button onClick={handleSubmit}>{usage}</button>
    </>

  )
}
