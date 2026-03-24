import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  Table,
  Badge,
  Button,
  Group,
  Loader,
  Text,
  Stack,
  Alert,
} from '@mantine/core'

interface User {
  username: string
  is_admin: boolean
  created_at: string | null
}

export default function DashboardUsers() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const token = localStorage.getItem('token')

  const fetchUsers = useCallback(async () => {
    try {
      setError(null)
      const res = await axios.get(`${backendUrl}/dashboard/users`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setUsers(res.data.users)
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        setError(err.response.data.detail)
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch users')
      }
    } finally {
      setLoading(false)
    }
  }, [backendUrl, token])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleDelete = async (username: string) => {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return
    setActionLoading(username)
    setError(null)
    setSuccess(null)
    try {
      await axios.delete(
        `${backendUrl}/dashboard/users/${username}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setSuccess(`User "${username}" deleted successfully`)
      await fetchUsers()
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        setError(err.response.data.detail)
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to delete user')
      }
    } finally {
      setActionLoading(null)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—'
    try {
      return new Date(dateString).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateString
    }
  }

  if (loading) {
    return (
      <Stack align="center" mt="xl">
        <Loader size="lg" />
        <Text>Loading users...</Text>
      </Stack>
    )
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Text size="xl" fw={500}>User Management</Text>
        <Button variant="light" onClick={fetchUsers}>
          Refresh
        </Button>
      </Group>

      {error && (
        <Alert color="red" title="Error" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert color="green" title="Success" withCloseButton onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {users.length === 0 ? (
        <Text c="dimmed">No users found.</Text>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Username</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map((user) => (
              <Table.Tr key={user.username}>
                <Table.Td>
                  <Text fw={500}>{user.username}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={user.is_admin ? 'blue' : 'gray'} variant="filled">
                    {user.is_admin ? 'Admin' : 'User'}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {formatDate(user.created_at)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Button
                    size="xs"
                    color="red"
                    loading={actionLoading === user.username}
                    onClick={() => handleDelete(user.username)}
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
