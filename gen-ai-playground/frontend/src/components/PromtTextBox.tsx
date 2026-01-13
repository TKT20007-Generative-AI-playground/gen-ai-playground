import { useRef } from "react";

type PromptTextBoxProps = {
  onSubmit: (prompt: string) => void;
};

export function PromptTextBox({ onSubmit }: PromptTextBoxProps) {

  const promptRef = useRef<HTMLTextAreaElement>(null);
  const handleSubmit = () => {
    if (promptRef.current) {
      onSubmit(promptRef.current.value);
    }
  }
  return (
    <>
      <textarea
        ref={promptRef}
        placeholder="Prompt here"
        rows={5}
        cols={50}
      />
      <button onClick={handleSubmit}>Create image</button>
    </>

  );
}
