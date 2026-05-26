// This file contains shared TypeScript types used across the Gen AI Playground frontend application.

// DeployOption represents a model that can be deployed by the user, with an id, display label, and the path used for deployment.
export interface DeployOption {
  id: string
  label: string
  modelPath: string
}
