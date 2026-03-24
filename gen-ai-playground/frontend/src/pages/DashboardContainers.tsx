import { useState, useEffect, useCallback } from "react"
import axios from "axios"
import {
  Table,
  Badge,
  Button,
  Group,
  Loader,
  Text,
  Stack,
  Alert,
  Select,
} from "@mantine/core"

interface Container {
  name: string
  status: string
  image: string
  container_id: string
}

export default function DashboardContainers() {
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [deployLoading, setDeployLoading] = useState(false)
  const [textModelOptions, setTextModelOptions] = useState<{ value: string; label: string }[]>([])

  const backendUrl = import.meta.env.VITE_API_URL || "http://localhost:8000"

  const getCsrfToken = () =>
    document.cookie
      .split("; ")
      .find(c => c.startsWith("csrf_token="))
      ?.split("=")[1] ?? ""

  // Fetch available models from backend
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await axios.get(`${backendUrl}/text/models`, {
          withCredentials: true,
          headers: { "X-CSRF-Token": getCsrfToken() },
        })
        const models = (res.data.available_models ?? []).map(
          (m: { value: string; label: string }) => ({
            value: m.value,
            label: m.label,
          }),
        )
        setTextModelOptions(models)
      } catch {
        // silent
      }
    }
    fetchModels()
  }, [backendUrl])

  const fetchContainers = useCallback(async () => {
    try {
      setError(null)
      const res = await axios.get(`${backendUrl}/dashboard/containers`, {
        withCredentials: true,
        headers: { "X-CSRF-Token": getCsrfToken() },
      })
      setContainers(res.data)
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) return
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined
      setError(detail || (err instanceof Error ? err.message : "Failed to fetch deployments"))
    } finally {
      setLoading(false)
    }
  }, [backendUrl])

  useEffect(() => {
    fetchContainers()
    const interval = setInterval(fetchContainers, 15000)
    return () => clearInterval(interval)
  }, [fetchContainers])

  const handleDelete = async (deploymentName: string) => {
    if (!confirm(`Delete deployment "${deploymentName}"? This cannot be undone.`)) return
    setActionLoading(deploymentName)
    try {
      await axios.post(`${backendUrl}/dashboard/containers/${deploymentName}/stop`, null, {
        withCredentials: true,
        headers: { "X-CSRF-Token": getCsrfToken() },
      })
      await fetchContainers()
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) return
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined
      setError(detail || (err instanceof Error ? err.message : "Failed to delete deployment"))
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeploy = async () => {
    if (!selectedModel) return
    setDeployLoading(true)
    setError(null)
    try {
      await axios.post(
        `${backendUrl}/text/deploy`,
        { model_path: selectedModel },
        {
          withCredentials: true,
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrfToken(),
          },
        },
      )
      await fetchContainers()
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) return
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined
      setError(detail || (err instanceof Error ? err.message : "Failed to deploy model"))
    } finally {
      setDeployLoading(false)
    }
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

      <Group align="end" gap="sm">
        <Select
          label="Deploy a model"
          placeholder="Select model"
          data={textModelOptions}
          value={selectedModel}
          onChange={setSelectedModel}
          style={{ minWidth: 220 }}
        />
        <Button onClick={handleDeploy} disabled={!selectedModel} loading={deployLoading}>
          Deploy
        </Button>
      </Group>

      {error && (
        <Alert color="red" title="Error" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {containers.length === 0 ? (
        <Text c="dimmed">No deployments found.</Text>
      ) : (
        <Table striped highlightOnHover>
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
                      maxWidth: 300,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
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
      )}
    </Stack>
  )
}
