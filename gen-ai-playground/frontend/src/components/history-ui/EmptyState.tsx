import { Center, Stack, ThemeIcon, Text } from '@mantine/core'

type EmptyStateProps = {
  label: string
}

export default function EmptyState({ label }: EmptyStateProps) {
  return (
    <Center py={80}>
      <Stack align="center" gap="md">
        <ThemeIcon size={56} radius="xl" variant="light" color="gray" style={{ opacity: 0.5 }}>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </ThemeIcon>
        <Text size="sm" c="dimmed" ta="center">
          {label}
        </Text>
      </Stack>
    </Center>
  )
}