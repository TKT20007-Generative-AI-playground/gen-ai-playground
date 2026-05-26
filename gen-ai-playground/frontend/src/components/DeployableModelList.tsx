import { Button, Collapse, Group, Stack, Text, UnstyledButton } from "@mantine/core"
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react"

type DeployableModelOption = {
  id: string
  label: string
}

type Props = {
  title: string
  models: DeployableModelOption[]
  isOpen: boolean
  onToggle: () => void
  onDeploy: (id: string) => void
  deployLoading: boolean
}

export default function DeployableModelList({
  title,
  models,
  isOpen,
  onToggle,
  onDeploy,
  deployLoading,
}: Props) {
  return (
    <>
      <UnstyledButton onClick={onToggle} style={{ width: "100%" }}>
        <Group justify="space-between">
          <Text size="sm" fw={600}>
            {title}
          </Text>
          {isOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
        </Group>
      </UnstyledButton>
      <Collapse in={isOpen}>
        <Stack gap={4}>
          {models.length === 0 && (
            <Text size="xs" c="dimmed" py={4}>
              No models available
            </Text>
          )}
          {models.map(model => (
            <Group
              key={model.id}
              justify="space-between"
              style={{
                width: "100%",
                borderRadius: 6,
                padding: "6px 8px",
              }}
            >
              <Text size="sm" style={{ userSelect: "none" }}>
                {model.label}
              </Text>
              <Button
                className="app-btn-soft-blue"
                size="xs"
                variant="light"
                loading={deployLoading}
                disabled={deployLoading}
                onClick={event => {
                  event.stopPropagation()
                  onDeploy(model.id)
                }}
              >
                Deploy
              </Button>
            </Group>
          ))}
        </Stack>
      </Collapse>
    </>
  )
}
