import { useState, useEffect, useCallback } from "react"
import { getRequestErrorMessage, isAxiosUnauthorized } from "../utils/errors"
import {
  deployAudioModel,
  deployTextModel,
  fetchDashboardContainers,
  fetchDeployableAudioModels,
  fetchDeployableTextModels,
  stopDashboardContainer,
} from "../services/dashboardService"
import {
  Table,
  Badge,
  Button,
  Group,
  Loader,
  Text,
  Stack,
  Alert,
  ScrollArea,
  Card,
  Collapse,
  UnstyledButton,
  Chip,
  Box,
} from "@mantine/core"
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react"
import { useMediaQuery } from "@mantine/hooks"

interface Container {
  name: string
  status: string
  image: string
  container_id: string
}

interface DeployOption {
  id: string
  modelPath: string
  label: string
  kind: "text" | "audio"
}

export default function DashboardContainers() {
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [deployLoading, setDeployLoading] = useState(false)
  const [deployOptions, setDeployOptions] = useState<DeployOption[]>([])
  const [textOpen, setTextOpen] = useState(true)
  const [audioOpen, setAudioOpen] = useState(true)

  const isMobile = useMediaQuery("(max-width: 768px)")
  const textModels = deployOptions.filter(m => m.kind === "text")
  const audioModels = deployOptions.filter(m => m.kind === "audio")

  useEffect(() => {
    const fetchModels = async () => {
      const options: DeployOption[] = []

      try {
        const textModels = await fetchDeployableTextModels()
        for (const model of textModels) {
          options.push({
            id: `text::${model.value}`,
            modelPath: model.value,
            label: `Text: ${model.label}`,
            kind: "text",
          })
        }
      } catch {
        // silent
      }

      try {
        const audioModels = await fetchDeployableAudioModels()
        for (const model of audioModels) {
          options.push({
            id: `audio::${model.value}`,
            modelPath: model.value,
            label: `Audio: ${model.label}`,
            kind: "audio",
          })
        }
      } catch {
        // silent
      }

      setDeployOptions(options)
    }
    fetchModels()
  }, [])

  const fetchContainers = useCallback(async () => {
    try {
      setError(null)
      const containerList = await fetchDashboardContainers()
      setContainers(containerList)
    } catch (err) {
      if (isAxiosUnauthorized(err)) return
      setError(getRequestErrorMessage(err, "Failed to fetch deployments"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchContainers()
    const interval = setInterval(fetchContainers, 15000)
    return () => clearInterval(interval)
  }, [fetchContainers])

  const handleDelete = async (deploymentName: string) => {
    if (!confirm(`Delete deployment "${deploymentName}"? This cannot be undone.`)) return
    setActionLoading(deploymentName)
    try {
      await stopDashboardContainer(deploymentName)
      await fetchContainers()
    } catch (err) {
      if (isAxiosUnauthorized(err)) return
      setError(getRequestErrorMessage(err, "Failed to delete deployment"))
    } finally {
      setActionLoading(null)
    }
  }

  const deployByOption = async (option: DeployOption) => {
    setDeployLoading(true)
    setError(null)
    try {
      if (option.kind === "audio") {
        await deployAudioModel(option.modelPath)
      } else {
        await deployTextModel(option.modelPath)
      }
      await fetchContainers()
    } catch (err) {
      if (isAxiosUnauthorized(err)) return
      setError(getRequestErrorMessage(err, "Failed to deploy model"))
    } finally {
      setDeployLoading(false)
    }
  }

  const handleDeployById = async (modelId: string) => {
    const selectedOption = deployOptions.find(option => option.id === modelId)
    if (!selectedOption) return
    await deployByOption(selectedOption)
  }

  const handleDeploy = async () => {
    if (!selectedModelId) return
    const selectedOption = deployOptions.find(option => option.id === selectedModelId)
    if (!selectedOption) return
    await deployByOption(selectedOption)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "green"
      case "deploying":
        return "blue"
      case "error":
        return "red"
      case "unhealthy":
        return "orange"
      default:
        return "gray"
    }
  }

  if (loading) {
    return (
      <Stack align="center" mt="xl">
        <Loader size="lg" />
        <Text>Loading deployments...</Text>
      </Stack>
    )
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Text size="xl" fw={500}>Verda Deployments</Text>
        <Button variant="light" onClick={fetchContainers}>
          Refresh
        </Button>
      </Group>

      {error && (
        <Alert color="red" title="Error" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {isMobile ? (
        // MOBILE: model chips + cards
        <Stack gap="md">
          <Stack gap="xs">
            {textModels.length > 0 && (
              <>
                <Text size="sm" fw={500} c="dimmed">Text Models</Text>
                <ScrollArea>
                  <Group gap="xs" wrap="wrap">
                    {textModels.map(m => (
                      <Chip
                        key={m.id}
                        checked={selectedModelId === m.id}
                        onChange={() => setSelectedModelId(selectedModelId === m.id ? null : m.id)}
                      >
                        {m.label.replace("Text: ", "")}
                      </Chip>
                    ))}
                  </Group>
                </ScrollArea>
              </>
            )}
            {audioModels.length > 0 && (
              <>
                <Text size="sm" fw={500} c="dimmed" mt="xs">Audio Models</Text>
                <ScrollArea>
                  <Group gap="xs" wrap="wrap">
                    {audioModels.map(m => (
                      <Chip
                        key={m.id}
                        checked={selectedModelId === m.id}
                        onChange={() => setSelectedModelId(selectedModelId === m.id ? null : m.id)}
                      >
                        {m.label.replace("Audio: ", "")}
                      </Chip>
                    ))}
                  </Group>
                </ScrollArea>
              </>
            )}
          </Stack>

          {selectedModelId && (
            <Button onClick={handleDeploy} loading={deployLoading}>
              Deploy Model
            </Button>
          )}

          {containers.length === 0 ? (
            <Text c="dimmed">No deployments found.</Text>
          ) : (
            <Stack>
              {containers.map(c => (
                <Card key={c.container_id} withBorder radius="md" shadow="xs">
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <Text fw={500}>{c.name}</Text>
                      <Badge color={getStatusColor(c.status)}>{c.status}</Badge>
                    </Group>
                    <Text size="sm" c="dimmed" style={{ wordBreak: "break-all" }}>
                      {c.image || "—"}
                    </Text>
                    <Group justify="flex-end">
                      <Button
                        size="xs"
                        color="red"
                        loading={actionLoading === c.container_id}
                        onClick={() => handleDelete(c.container_id)}
                      >
                        Delete
                      </Button>
                    </Group>
                  </Stack>
                </Card>
              ))}
            </Stack>
          )}
        </Stack>
      ) : (
        // DESKTOP: sidebar + content
        <Group align="flex-start" gap="md" wrap="nowrap" style={{ overflow: "hidden" }}>
          {/* Left sidebar */}
          <Box
            style={{
              width: 320,
              flexShrink: 0,
              border: "1px solid var(--mantine-color-gray-3)",
              borderRadius: 8,
              padding: 12,
            }}
          >
            <Stack gap="xs">
              {/* Text Models section */}
              <UnstyledButton onClick={() => setTextOpen(o => !o)} style={{ width: "100%" }}>
                <Group justify="space-between">
                  <Text size="sm" fw={600}>Text Models</Text>
                  {textOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                </Group>
              </UnstyledButton>
              <Collapse in={textOpen}>
                <Stack gap={4}>
                  {textModels.length === 0 && (
                    <Text size="xs" c="dimmed" py={4}>No models available</Text>
                  )}
                  {textModels.map(m => (
                    <Group
                      key={m.id}
                      justify="space-between"
                      style={{
                        width: "100%",
                        borderRadius: 6,
                        padding: "6px 8px",
                      }}
                    >
                      <Text size="sm" style={{ userSelect: "none" }}>
                        {m.label.replace("Text: ", "")}
                      </Text>
                      <Button
                        size="xs"
                        variant="light"
                        loading={deployLoading}
                        disabled={deployLoading}
                        onClick={e => {
                          e.stopPropagation()
                          handleDeployById(m.id)
                        }}
                      >
                        Deploy
                      </Button>
                    </Group>
                  ))}
                </Stack>
              </Collapse>

              {/* Audio Models section */}
              <UnstyledButton onClick={() => setAudioOpen(o => !o)} style={{ width: "100%" }}>
                <Group justify="space-between" mt="xs">
                  <Text size="sm" fw={600}>Audio Models</Text>
                  {audioOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                </Group>
              </UnstyledButton>
              <Collapse in={audioOpen}>
                <Stack gap={4}>
                  {audioModels.length === 0 && (
                    <Text size="xs" c="dimmed" py={4}>No models available</Text>
                  )}
                  {audioModels.map(m => (
                    <Group
                      key={m.id}
                      justify="space-between"
                      style={{
                        width: "100%",
                        borderRadius: 6,
                        padding: "6px 8px",
                      }}
                    >
                      <Text size="sm" style={{ userSelect: "none" }}>
                        {m.label.replace("Audio: ", "")}
                      </Text>
                      <Button
                        size="xs"
                        variant="light"
                        loading={deployLoading}
                        disabled={deployLoading}
                        onClick={e => {
                          e.stopPropagation()
                          handleDeployById(m.id)
                        }}
                      >
                        Deploy
                      </Button>
                    </Group>
                  ))}
                </Stack>
              </Collapse>
            </Stack>
          </Box>

          {/* Right content */}
          <Stack style={{ flex: 1, minWidth: 0 }}>
            
            {containers.length === 0 ? (
              <Text c="dimmed">No deployments found.</Text>
            ) : (
              <ScrollArea w="100%">
                <Table striped highlightOnHover withColumnBorders>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Endpoint</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {containers.map(c => (
                      <Table.Tr key={c.container_id}>
                        <Table.Td>
                          <Text fw={500}>{c.name}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text
                            size="sm"
                            c="dimmed"
                            style={{
                              maxWidth: 250,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {c.image || "—"}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge color={getStatusColor(c.status)} variant="filled">
                            {c.status}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Button
                            size="xs"
                            color="red"
                            loading={actionLoading === c.container_id}
                            onClick={() => handleDelete(c.container_id)}
                          >
                            Delete
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            )}
          </Stack>
        </Group>
      )}

      </Stack>
  )
}