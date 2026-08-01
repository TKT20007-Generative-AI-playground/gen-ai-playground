// This file contains shared TypeScript types used across the Gen AI Playground frontend application.



// DeployOption represents a model that can be deployed by the user, with an id, display label, and the path used for deployment.
export interface DeployOption {
  id: string
  label: string
  modelPath: string
}

// ModelStatus represents the lifecycle state of a deployed model as reported by the backend.
export type ModelStatus = "live" | "starting" | "offline" | "unknown"

export const modelStatusPriority: Record<ModelStatus, number> = {
  live: 0,
  starting: 1,
  unknown: 2,
  offline: 3,
}