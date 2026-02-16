import { useState, useEffect, useCallback } from 'react'
import {
  Title,
  Table,
  Badge,
  Button,
  Group,
  Loader,
  Text,
  Stack,
  Alert,
} from '@mantine/core'

interface Container {
  name: string
  status: string
  image: string
  container_id: string
}

export default function Dashboard() {
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const token = localStorage.getItem('token')

  const fetchContainers = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch(`${backendUrl}/dashboard/containers`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Failed to fetch deployments')
      }
      const data = await res.json()
      setContainers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch deployments')
    } finally {
      setLoading(false)
    }
  }, [backendUrl, token])

  useEffect(() => {
    fetchContainers()
    const interval = setInterval(fetchContainers, 15000)
    return () => clearInterval(interval)
  }, [fetchContainers])

  const handleDelete = async (deploymentName: string) => {
    if (!confirm(`Delete deployment "${deploymentName}"? This cannot be undone.`)) return
    setActionLoading(deploymentName)
    try {
      const res = await fetch(
        `${backendUrl}/dashboard/containers/${deploymentName}/stop`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Failed to delete deployment')
      }
      await fetchContainers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete deployment')
    } finally {
      setActionLoading(null)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'green'
      case 'deploying':
        return 'blue'
      case 'error':
        return 'red'
      case 'unhealthy':
        return 'orange'
      default:
        return 'gray'
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
    <Stack p="md">
      <Group justify="space-between">
        <Title order={2}>Dashboard - Verda Deployments</Title>
        <Button variant="light" onClick={fetchContainers}>
          Refresh
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
            {containers.map((c) => (
              <Table.Tr key={c.container_id}>
                <Table.Td>
                  <Text fw={500}>{c.name}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.image || '—'}
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
