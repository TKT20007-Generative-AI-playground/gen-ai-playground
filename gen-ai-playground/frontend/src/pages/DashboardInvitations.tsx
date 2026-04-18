import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { getBearerAuthHeaders } from '../utils/auth'
import { formatDateTime } from '../utils/date'
import { backendUrl } from '../utils/env'
import { getRequestErrorMessage } from '../utils/errors'
import {
  Table,
  Badge,
  Button,
  Group,
  Loader,
  Text,
  Stack,
  Alert,
  Modal,
  NumberInput,
  TextInput,
  CopyButton,
  ActionIcon,
  Tooltip,
  Input,
} from '@mantine/core'
import { IconPlus, IconCopy, IconCheck, IconTrash, IconPower, IconCalendarPlus } from '@tabler/icons-react'
import { useMediaQuery } from '@mantine/hooks'

interface InvitationCode {
  code: string
  created_at: string
  expires_at: string
  max_uses: number
  uses_count: number
  is_active: boolean
  used_by: string[] | null
}

export default function DashboardInvitations() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [codes, setCodes] = useState<InvitationCode[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [addUsesModalOpen, setAddUsesModalOpen] = useState(false)
  const [selectedCode, setSelectedCode] = useState<string>('')
  const [additionalUses, setAdditionalUses] = useState<number>(1)
  const [addUsesLoading, setAddUsesLoading] = useState(false)
  
  // Extend expiration modal state
  const [extendModalOpen, setExtendModalOpen] = useState(false)
  const [extendDays, setExtendDays] = useState<number>(30)
  const [extendLoading, setExtendLoading] = useState(false)
  
  // Create form state
  const [customCode, setCustomCode] = useState<string>('')
  const [expirationDays, setExpirationDays] = useState<number>(30)
  const [maxUses, setMaxUses] = useState<number>(1)
  
  // Search and sort state
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<string>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const token = localStorage.getItem('token')

  const fetchCodes = useCallback(async () => {
    try {
      setError(null)
      const res = await axios.get(`${backendUrl}/dashboard/invitations/codes`, {
        headers: getBearerAuthHeaders(token),
      })
      setCodes(res.data.codes)
    } catch (err) {
      setError(getRequestErrorMessage(err, 'Failed to fetch invitation codes'))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchCodes()
  }, [fetchCodes])

  const handleCreateCode = async () => {
    if (!customCode || customCode.length < 5) {
      setFormError('Please enter a valid invitation code (minimum 5 characters)')
      return
    }
    setCreateLoading(true)
    setFormError(null)
    setSuccess(null)
    try {
      await axios.post(
        `${backendUrl}/dashboard/invitations/codes`,
        {
          code: customCode,
          expiration_days: expirationDays,
          max_uses: maxUses,
        },
        { headers: getBearerAuthHeaders(token) }
      )
      setSuccess('Invitation code created successfully')
      setCreateModalOpen(false)
      setCustomCode('')
      setExpirationDays(30)
      setMaxUses(1)
      await fetchCodes()
    } catch (err: unknown) {
      setFormError(getRequestErrorMessage(err, 'Failed to create invitation code'))
    } finally {
      setCreateLoading(false)
    }
  }

  const handleDelete = async (code: string) => {
    if (!confirm(`Delete invitation code "${code}"? This cannot be undone.`)) return
    setActionLoading(code)
    setError(null)
    setSuccess(null)
    try {
      await axios.delete(
        `${backendUrl}/dashboard/invitations/codes/${code}`,
        { headers: getBearerAuthHeaders(token) }
      )
      setSuccess(`Invitation code "${code}" deleted successfully`)
      await fetchCodes()
    } catch (err) {
      setError(getRequestErrorMessage(err, 'Failed to delete invitation code'))
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeactivate = async (code: string) => {
    if (!confirm(`Deactivate invitation code "${code}"? Users will no longer be able to use it.`)) return
    setActionLoading(code)
    setError(null)
    setSuccess(null)
    try {
      await axios.post(
        `${backendUrl}/dashboard/invitations/codes/${code}/deactivate`,
        {},
        { headers: getBearerAuthHeaders(token) }
      )
      setSuccess(`Invitation code "${code}" deactivated successfully`)
      await fetchCodes()
    } catch (err) {
      setError(getRequestErrorMessage(err, 'Failed to deactivate invitation code'))
    } finally {
      setActionLoading(null)
    }
  }

  const handleReactivate = async (code: string) => {
    if (!confirm(`Reactivate invitation code "${code}"?`)) return
    setActionLoading(code)
    setError(null)
    setSuccess(null)
    try {
      await axios.post(
        `${backendUrl}/dashboard/invitations/codes/${code}/reactivate`,
        {},
        { headers: getBearerAuthHeaders(token) }
      )
      setSuccess(`Invitation code "${code}" reactivated successfully`)
      await fetchCodes()
    } catch (err) {
      setError(getRequestErrorMessage(err, 'Failed to reactivate invitation code'))
    } finally {
      setActionLoading(null)
    }
  }

  const handleAddUses = (code: string) => {
    setSelectedCode(code)
    setAdditionalUses(1)
    setAddUsesModalOpen(true)
  }

  const submitAddUses = async () => {
    if (additionalUses < 1 || additionalUses > 100) {
      setError('Please enter a valid number between 1 and 100')
      return
    }
    setAddUsesLoading(true)
    setError(null)
    setSuccess(null)
    try {
      await axios.post(
        `${backendUrl}/dashboard/invitations/codes/${selectedCode}/add-uses`,
        { additional_uses: additionalUses },
        { headers: getBearerAuthHeaders(token) }
      )
      setSuccess(`Added ${additionalUses} uses to invitation code "${selectedCode}"`)
      setAddUsesModalOpen(false)
      await fetchCodes()
    } catch (err) {
      setError(getRequestErrorMessage(err, 'Failed to add uses to invitation code'))
    } finally {
      setAddUsesLoading(false)
    }
  }

  const handleExtend = (code: string) => {
    setSelectedCode(code)
    setExtendDays(30)
    setExtendModalOpen(true)
  }

  const submitExtend = async () => {
    if (extendDays < 1 || extendDays > 365) {
      setError('Please enter a valid number between 1 and 365')
      return
    }
    setExtendLoading(true)
    setError(null)
    setSuccess(null)
    try {
      await axios.post(
        `${backendUrl}/dashboard/invitations/codes/${selectedCode}/extend`,
        { expiration_days: extendDays },
        { headers: getBearerAuthHeaders(token) }
      )
      setSuccess(`Extended expiration of invitation code "${selectedCode}" by ${extendDays} days`)
      setExtendModalOpen(false)
      await fetchCodes()
    } catch (err) {
      setError(getRequestErrorMessage(err, 'Failed to extend invitation code'))
    } finally {
      setExtendLoading(false)
    }
  }

  const isCodeExpired = (code: InvitationCode): boolean => {
    const now = new Date()
    const expiresAt = new Date(code.expires_at)
    return expiresAt < now
  }

  const getStatusBadge = (code: InvitationCode) => {
    const now = new Date()
    const expiresAt = new Date(code.expires_at)
    const isExpired = expiresAt < now
    const isFullyUsed = code.uses_count >= code.max_uses
    const isActive = code.is_active

    let color = 'green'
    let label = 'Active'
    let variant: 'filled' | 'outline' = 'filled'

    if (isExpired) {
      color = 'red'
      label = 'Expired'
    } else if (isFullyUsed) {
      color = 'gray'
      label = 'Fully Used'
    } else if (!isActive) {
      color = 'gray'
      label = 'Deactivated'
      variant = 'outline'
    }

    if (isMobile) {
      return (
        <Tooltip label={label} withArrow>
          <Badge color={color} variant={variant} circle size="sm" aria-label={label} />
        </Tooltip>
      )
    }
    return <Badge color={color} variant={variant}>{label}</Badge>
  }

  // Filter and sort codes
  const filteredCodes = codes
    .filter(code => 
      code.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (code.used_by && code.used_by.some(user => user.toLowerCase().includes(searchQuery.toLowerCase())))
    )
    .sort((a, b) => {
      let aVal: string | number = a[sortBy as keyof InvitationCode] as string | number
      let bVal: string | number = b[sortBy as keyof InvitationCode] as string | number
      
      if (sortBy === 'created_at' || sortBy === 'expires_at') {
        aVal = new Date(aVal as string).getTime()
        bVal = new Date(bVal as string).getTime()
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1
      }
      return aVal < bVal ? 1 : -1
    })

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
  }

  if (loading) {
    return (
      <Stack align="center" mt="xl">
        <Loader size="lg" />
        <Text>Loading invitation codes...</Text>
      </Stack>
    )
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Text size="xl" fw={500}>Invitation Code Management</Text>
        <Group gap="sm">
          <Button variant="light" onClick={fetchCodes}>
            Refresh
          </Button>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateModalOpen(true)}>
            Create Code
          </Button>
        </Group>
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

      {/* Search Input */}
      <Input
        placeholder="Search by code or user..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{ maxWidth: 300 }}
      />

      {filteredCodes.length === 0 ? (
        <Text c="dimmed">No invitation codes found.</Text>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ cursor: 'pointer' }} onClick={() => handleSort('code')}>
                Code {sortBy === 'code' && (sortOrder === 'asc' ? '↑' : '↓')}
              </Table.Th>
              {!isMobile && (
                <Table.Th style={{ cursor: 'pointer' }} onClick={() => handleSort('created_at')}>
                  Created {sortBy === 'created_at' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Table.Th>
              )}
              {!isMobile && (
                <Table.Th style={{ cursor: 'pointer' }} onClick={() => handleSort('expires_at')}>
                  Expires {sortBy === 'expires_at' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Table.Th>
              )}
              <Table.Th>Status</Table.Th>
              <Table.Th style={{ cursor: 'pointer' }} onClick={() => handleSort('uses_count')}>
                Usage {sortBy === 'uses_count' && (sortOrder === 'asc' ? '↑' : '↓')}
              </Table.Th>
              <Table.Th>Used By</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filteredCodes.map((code) => (
              <Table.Tr 
                key={code.code}
                style={{
                  opacity: !code.is_active ? 0.6 : 1,
                }}
              >
                <Table.Td>
                  <Group gap="xs">
                    <Text fw={500} style={{ fontFamily: 'monospace' }}>{code.code}</Text>
                    <CopyButton value={code.code} timeout={2000}>
                      {({ copied, copy }) => (
                        <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow position="right">
                          <ActionIcon color={copied ? 'teal' : 'gray'} variant="subtle" onClick={copy} size="sm">
                            {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </CopyButton>
                  </Group>
                </Table.Td>
                {!isMobile && (
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {formatDateTime(code.created_at, { fallback: '-' })}
                    </Text>
                  </Table.Td>
                )}
                {!isMobile && (
                  <Table.Td>
                    <Text size="sm" c={new Date(code.expires_at) < new Date() ? 'red' : 'dimmed'}>
                      {formatDateTime(code.expires_at, { fallback: '-' })}
                    </Text>
                  </Table.Td>
                )}
                <Table.Td>{getStatusBadge(code)}</Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {code.uses_count} / {code.max_uses}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {code.used_by && code.used_by.length > 0 ? code.used_by.join(', ') : '—'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    {code.uses_count >= code.max_uses ? (
                      <Tooltip label="Add Uses">
                        <ActionIcon
                          color="blue"
                          variant="subtle"
                          loading={actionLoading === code.code}
                          onClick={() => handleAddUses(code.code)}
                        >
                          <IconPlus size={16} />
                        </ActionIcon>
                      </Tooltip>
                    ) : isCodeExpired(code) ? (
                      <Tooltip label="Extend">
                        <ActionIcon
                          color="blue"
                          variant="subtle"
                          loading={actionLoading === code.code}
                          onClick={() => handleExtend(code.code)}
                        >
                          <IconCalendarPlus size={16} />
                        </ActionIcon>
                      </Tooltip>
                    ) : (
                      !code.is_active && (
                        <Tooltip label="Reactivate">
                          <ActionIcon
                            color="green"
                            variant="subtle"
                            loading={actionLoading === code.code}
                            onClick={() => handleReactivate(code.code)}
                          >
                            <IconPower size={16} />
                          </ActionIcon>
                        </Tooltip>
                      )
                    )}
                    {code.is_active && code.uses_count < code.max_uses && !isCodeExpired(code) && (
                      <Tooltip label="Deactivate">
                        <ActionIcon
                          color="yellow"
                          variant="subtle"
                          loading={actionLoading === code.code}
                          onClick={() => handleDeactivate(code.code)}
                        >
                          <IconPower size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    <Tooltip label="Delete">
                      <ActionIcon
                        color="red"
                        variant="subtle"
                        loading={actionLoading === code.code}
                        onClick={() => handleDelete(code.code)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {/* Create Code Modal */}
      <Modal
        opened={createModalOpen}
        onClose={() => { setCreateModalOpen(false); setFormError(null); }}
        title="Create Invitation Code"
        centered
      >
        <Stack>
          {formError && (
            <Alert color="red" title="Error" withCloseButton onClose={() => setFormError(null)}>
              {formError}
            </Alert>
          )}
          <TextInput
            label="Invitation Code"
            description="Enter the invitation code (min 5 characters)"
            value={customCode}
            onChange={(e) => setCustomCode(e.target.value)}
            minLength={5}
            maxLength={64}
            required
          />
          <NumberInput
            label="Expiration (days)"
            description="Days until the code expires"
            value={expirationDays}
            onChange={(val) => setExpirationDays(typeof val === 'number' ? val : 30)}
            min={1}
            max={365}
            required
          />
          <NumberInput
            label="Max Uses"
            description="Maximum number of times this code can be used"
            value={maxUses}
            onChange={(val) => setMaxUses(typeof val === 'number' ? val : 1)}
            min={1}
            max={100}
            required
          />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCode} loading={createLoading}>
              Create Code
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Add Uses Modal */}
      <Modal
        opened={addUsesModalOpen}
        onClose={() => setAddUsesModalOpen(false)}
        title={`Add Uses to ${selectedCode}`}
        centered
      >
        <Stack>
          <NumberInput
            label="Additional Uses"
            description="Number of additional uses to add (1-100)"
            value={additionalUses}
            onChange={(val) => setAdditionalUses(typeof val === 'number' ? val : 1)}
            min={1}
            max={100}
            required
          />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setAddUsesModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitAddUses} loading={addUsesLoading}>
              Add Uses
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Extend Expiration Modal */}
      <Modal
        opened={extendModalOpen}
        onClose={() => setExtendModalOpen(false)}
        title={`Extend Expiration - ${selectedCode}`}
        centered
      >
        <Stack>
          <NumberInput
            label="Extension (days)"
            description="Number of days to extend the expiration (1-365)"
            value={extendDays}
            onChange={(val) => setExtendDays(typeof val === 'number' ? val : 30)}
            min={1}
            max={365}
            required
          />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setExtendModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitExtend} loading={extendLoading}>
              Extend
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
