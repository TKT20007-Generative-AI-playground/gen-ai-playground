export async function streamText(onToken: (token: string) => void) {
  const response = await fetch("http://localhost:8000/stream", {
    method: "GET",
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) return;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const token = line.replace("data: ", "");
        if (token === "[DONE]") return;
        onToken(token);
      }
    }
  }
}