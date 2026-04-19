export function formatUserGreeting(username: string | null): string {
  const safeName = username?.trim()
  return safeName ? `Hello ${safeName}!` : "Hello!"
}