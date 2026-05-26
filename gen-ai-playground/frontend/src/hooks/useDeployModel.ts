import { useState, useEffect } from "react"
import { notifications } from "@mantine/notifications"
import { getRequestErrorMessage } from "../utils/errors"
import { type DeployOption } from "../utils/types"

interface DeployModelService {
  fetchOptions: () => Promise<{ value: string; label: string }[]>
  deploy: (modelPath: string) => Promise<void>
  fetchStatuses: () => Promise<void>
}

export function useDeployModel(isLoggedIn: boolean, service: DeployModelService) {
  const [deployOptions, setDeployOptions] = useState<DeployOption[]>([])
  const [selectedDeployId, setSelectedDeployId] = useState<string | null>(null)
  const [deployLoading, setDeployLoading] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoggedIn) return
    const fetchDeployOptions = async () => {
      try {
        const availableModels = await service.fetchOptions()
        setDeployOptions(
          availableModels.map(model => ({
            id: model.value,
            label: model.label,
            modelPath: model.value,
          })),
        )
      } catch {
        // silent
      }
    }
    fetchDeployOptions()
  }, [isLoggedIn, service])

  const handleDeployModel = async () => {
    if (!selectedDeployId) return
    const selected = deployOptions.find(o => o.id === selectedDeployId)
    if (!selected) return
    setDeployLoading(true)
    setDeployError(null)
    try {
      await service.deploy(selected.modelPath)
      notifications.show({
        title: "Model started",
        message: `${selected.label} is starting up.`,
        color: "green",
      })
      await service.fetchStatuses()
    } catch (error) {
      const detail = getRequestErrorMessage(error, "Failed to deploy model")
      setDeployError(detail)
      notifications.show({
        title: "Start failed",
        message: detail || "Please try again.",
        color: "red",
      })
    } finally {
      setDeployLoading(false)
    }
  }

  return {
    deployOptions,
    selectedDeployId,
    setSelectedDeployId,
    deployLoading,
    deployError,
    handleDeployModel,
  }
}
