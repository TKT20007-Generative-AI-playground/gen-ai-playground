import { getCsrfHeaders, getJsonCsrfHeaders } from "../utils/auth"
import { apiClient } from "./httpClient"

export type DashboardUser = {
  username: string
  is_admin: boolean
  created_at: string | null
}

export type InvitationCode = {
  code: string
  created_at: string
  expires_at: string
  max_uses: number
  uses_count: number
  is_active: boolean
  used_by: string[] | null
}

export async function fetchDashboardUsers(): Promise<DashboardUser[]> {
  const res = await apiClient.get<{ users: DashboardUser[] }>("/dashboard/users")
  return res.data.users
}

export async function deleteDashboardUser(username: string): Promise<void> {
  await apiClient.delete(`/dashboard/users/${username}`)
}

export async function fetchInvitationCodes(): Promise<InvitationCode[]> {
  const res = await apiClient.get<{ codes: InvitationCode[] }>("/dashboard/invitations/codes")
  return res.data.codes
}

export async function createInvitationCode(payload: {
  code: string
  expiration_days: number
  max_uses: number
}): Promise<void> {
  await apiClient.post("/dashboard/invitations/codes", payload)
}

export async function deleteInvitationCode(code: string): Promise<void> {
  await apiClient.delete(`/dashboard/invitations/codes/${code}`)
}

export async function deactivateInvitationCode(code: string): Promise<void> {
  await apiClient.post(`/dashboard/invitations/codes/${code}/deactivate`, {})
}

export async function reactivateInvitationCode(code: string): Promise<void> {
  await apiClient.post(`/dashboard/invitations/codes/${code}/reactivate`, {})
}

export async function addInvitationCodeUses(code: string, additionalUses: number): Promise<void> {
  await apiClient.post(`/dashboard/invitations/codes/${code}/add-uses`, {
    additional_uses: additionalUses,
  })
}

export async function extendInvitationCode(code: string, expirationDays: number): Promise<void> {
  await apiClient.post(`/dashboard/invitations/codes/${code}/extend`, {
    expiration_days: expirationDays,
  })
}

export type ContainerRecord = {
  name: string
  status: string
  image: string
  container_id: string
}

export async function fetchDeployableTextModels(): Promise<
  Array<{ value: string; label: string }>
> {
  const res = await apiClient.get<{ available_models?: Array<{ value: string; label: string }> }>(
    "/text/models",
    {
      headers: getCsrfHeaders(),
    },
  )
  return res.data.available_models ?? []
}

export async function fetchDeployableAudioModels(): Promise<
  Array<{ value: string; label: string }>
> {
  const res = await apiClient.get<{ available_models?: Array<{ value: string; label: string }> }>(
    "/audio/models",
    {
      headers: getCsrfHeaders(),
    },
  )
  return res.data.available_models ?? []
}

export type DashboardContainer = {
  name: string
  status: string
  image: string
  container_id: string
  model_path?: string | null
}

export async function fetchDashboardContainers(): Promise<DashboardContainer[]> {
  const res = await apiClient.get<DashboardContainer[]>("/dashboard/containers", {
    headers: getCsrfHeaders(),
  })
  return res.data
}

export async function stopDashboardContainer(containerId: string): Promise<void> {
  await apiClient.post(`/dashboard/containers/${containerId}/stop`, null, {
    headers: getCsrfHeaders(),
  })
}

export async function deployTextModel(modelPath: string): Promise<{ name: string; model: string }> {
  const res = await apiClient.post(
    "/text/deploy",
    { model_path: modelPath },
    {
      headers: getJsonCsrfHeaders(),
    },
  )
  return res.data
}

export async function deployAudioModel(modelPath: string): Promise<void> {
  await apiClient.post(
    "/audio/deploy",
    { model_path: modelPath },
    {
      headers: getJsonCsrfHeaders(),
    },
  )
}
