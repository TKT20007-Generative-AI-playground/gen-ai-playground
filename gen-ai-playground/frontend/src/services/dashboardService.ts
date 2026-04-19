import { getBearerAuthHeaders, getCsrfHeaders, getJsonCsrfHeaders } from "../utils/auth"
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

export async function fetchDashboardUsers(token: string | null): Promise<DashboardUser[]> {
  const res = await apiClient.get<{ users: DashboardUser[] }>("/dashboard/users", {
    headers: getBearerAuthHeaders(token),
  })
  return res.data.users
}

export async function deleteDashboardUser(username: string, token: string | null): Promise<void> {
  await apiClient.delete(`/dashboard/users/${username}`, {
    headers: getBearerAuthHeaders(token),
  })
}

export async function fetchInvitationCodes(token: string | null): Promise<InvitationCode[]> {
  const res = await apiClient.get<{ codes: InvitationCode[] }>("/dashboard/invitations/codes", {
    headers: getBearerAuthHeaders(token),
  })
  return res.data.codes
}

export async function createInvitationCode(
  payload: { code: string; expiration_days: number; max_uses: number },
  token: string | null,
): Promise<void> {
  await apiClient.post("/dashboard/invitations/codes", payload, {
    headers: getBearerAuthHeaders(token),
  })
}

export async function deleteInvitationCode(code: string, token: string | null): Promise<void> {
  await apiClient.delete(`/dashboard/invitations/codes/${code}`, {
    headers: getBearerAuthHeaders(token),
  })
}

export async function deactivateInvitationCode(code: string, token: string | null): Promise<void> {
  await apiClient.post(
    `/dashboard/invitations/codes/${code}/deactivate`,
    {},
    { headers: getBearerAuthHeaders(token) },
  )
}

export async function reactivateInvitationCode(code: string, token: string | null): Promise<void> {
  await apiClient.post(
    `/dashboard/invitations/codes/${code}/reactivate`,
    {},
    { headers: getBearerAuthHeaders(token) },
  )
}

export async function addInvitationCodeUses(
  code: string,
  additionalUses: number,
  token: string | null,
): Promise<void> {
  await apiClient.post(
    `/dashboard/invitations/codes/${code}/add-uses`,
    { additional_uses: additionalUses },
    { headers: getBearerAuthHeaders(token) },
  )
}

export async function extendInvitationCode(
  code: string,
  expirationDays: number,
  token: string | null,
): Promise<void> {
  await apiClient.post(
    `/dashboard/invitations/codes/${code}/extend`,
    { expiration_days: expirationDays },
    { headers: getBearerAuthHeaders(token) },
  )
}

export type ContainerRecord = {
  name: string
  status: string
  image: string
  container_id: string
}

export async function fetchDeployableTextModels(): Promise<Array<{ value: string; label: string }>> {
  const res = await apiClient.get<{ available_models?: Array<{ value: string; label: string }> }>(
    "/text/models",
    {
      headers: getCsrfHeaders(),
    },
  )
  return res.data.available_models ?? []
}

export async function fetchDeployableAudioModels(): Promise<Array<{ value: string; label: string }>> {
  const res = await apiClient.get<{ available_models?: Array<{ value: string; label: string }> }>(
    "/audio/models",
    {
      headers: getCsrfHeaders(),
    },
  )
  return res.data.available_models ?? []
}

export async function fetchDashboardContainers(): Promise<ContainerRecord[]> {
  const res = await apiClient.get<ContainerRecord[]>("/dashboard/containers", {
    headers: getCsrfHeaders(),
  })
  return res.data
}

export async function stopDashboardContainer(containerId: string): Promise<void> {
  await apiClient.post(`/dashboard/containers/${containerId}/stop`, null, {
    headers: getCsrfHeaders(),
  })
}

export async function deployTextModel(modelPath: string): Promise<void> {
  await apiClient.post(
    "/text/deploy",
    { model_path: modelPath },
    {
      headers: getJsonCsrfHeaders(),
    },
  )
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
