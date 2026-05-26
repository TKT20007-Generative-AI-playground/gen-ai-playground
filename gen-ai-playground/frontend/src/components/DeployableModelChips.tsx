import { Chip, Group, ScrollArea, Text } from "@mantine/core"

type DeployableModelOption = {
  id: string
  label: string
}

type Props = {
  title: string
  models: DeployableModelOption[]
  selectedId: string | null
  onSelect: (nextId: string | null) => void
  titleMarginTop?: number | string
}

export default function DeployableModelChips({
  title,
  models,
  selectedId,
  onSelect,
  titleMarginTop,
}: Props) {
  if (models.length === 0) return null

  return (
    <div>
      <Text size="sm" fw={500} c="dimmed" mt={titleMarginTop}>
        {title}
      </Text>
      <ScrollArea>
        <Group gap="xs" wrap="wrap">
          {models.map(model => (
            <Chip
              key={model.id}
              checked={selectedId === model.id}
              onChange={() => onSelect(selectedId === model.id ? null : model.id)}
            >
              {model.label}
            </Chip>
          ))}
        </Group>
      </ScrollArea>
    </div>
  )
}
