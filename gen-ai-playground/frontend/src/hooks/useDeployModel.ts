import { useState, useEffect } from "react"
import { notifications } from "@mantine/notifications"
import { getRequestErrorMessage } from "../utils/errors"
import { type DeployOption } from "../utils/types"

interface DeployModelService {
  fetchOptions: () => Promise<{ value: string, label: string }[]>
  deploy: (modelPath: string) => Promise<void>
  fetchStatuses: () => Promise<void>
}

export function useDeployModel(isLoggedIn: boolean, service: DeployModelService) {
    const [deployOptions, setDeployOptions] = useState<DeployOption[]>([])
    const [selectedDeployId, setSelectedDeployId] = useState<string | null>(null)
    const [deployLoadingById, setDeployLoadingById] = useState<Record<string, boolean>>({})
    const [deployError, setDeployError] = useState<string | null>(null)

    useEffect(() => {
      if (!isLoggedIn) return
      const fetchDeployOptions = async () => {
        try {
          const availableModels = await service.fetchOptions()
          setDeployOptions(availableModels.map(model => ({
            id: model.value,
            label: model.label,
            modelPath: model.value,
          })))
        } catch {
          // silent
        }
      }
      fetchDeployOptions()
    }, [isLoggedIn, service])


    const runDeploy = async (targetId: string | null) => {
      if (!isLoggedIn) return
      if (!targetId) return
      if (deployLoadingById[targetId]) return
      const selected = deployOptions.find(o => o.id === targetId)
      if (!selected) return
      setDeployLoadingById(prev => ({ ...prev, [targetId]: true }))
      setDeployError(null)
      try {
        await service.deploy(selected.modelPath)
        notifications.show({ title: "Model started", message: `${selected.label} is starting up.`, color: "green" })
        await service.fetchStatuses()
      } catch (error) {
        const detail = getRequestErrorMessage(error, "Failed to deploy model")
        setDeployError(detail)
        notifications.show({ title: "Start failed", message: detail || "Please try again.", color: "red" })
      } finally {
        setDeployLoadingById(prev => ({ ...prev, [targetId]: false }))
      }
    }

    const handleDeployModel = (overrideId?: string) => {
      return (event?: { preventDefault?: () => void; stopPropagation?: () => void }) => {
        event?.preventDefault?.()
        event?.stopPropagation?.()
        void runDeploy(overrideId ?? selectedDeployId)
      }
    }

    const isDeploying = (id?: string | null) => !!(id && deployLoadingById[id])
    const deployLoading = Object.values(deployLoadingById).some(Boolean)

    return { deployOptions, selectedDeployId, setSelectedDeployId, deployLoading, deployError, handleDeployModel, isDeploying }

}
