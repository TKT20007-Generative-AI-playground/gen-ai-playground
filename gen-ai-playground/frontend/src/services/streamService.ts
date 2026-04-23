export function streamText(
  prompt: string,
  deploymentName: string,
  modelPath: string,
  onToken: (token: string) => void,
  onDone?: () => void,
  onError?: (err: unknown) => void
) {
  const url = new URL("/text/stream", window.location.origin)
  url.searchParams.set("prompt", prompt)
  url.searchParams.set("deployment_name", deploymentName)
  url.searchParams.set("model_path", modelPath)

  const eventSource = new EventSource(url.toString(), { withCredentials: true })

  eventSource.onmessage = (e) => {
    if (e.data === "[DONE]") {
      eventSource.close()
      onDone?.()
      return
    }
    onToken(e.data)
  }

  eventSource.onerror = (err) => {
    eventSource.close()
    onError?.(err)
  }
}