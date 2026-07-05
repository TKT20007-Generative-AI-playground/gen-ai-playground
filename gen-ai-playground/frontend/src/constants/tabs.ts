// Shared constants for playground tabs
export const PLAYGROUND_TABS = ['ImageGenerator', 'ImageEditor', 'TextGenerator', 'Transcribe', 'VideoGenerator', 'WebcamAnalysis'] as const

export type PlaygroundTab = typeof PLAYGROUND_TABS[number]

export const LAST_TAB_STORAGE_KEY = 'lastPlaygroundTab'

// Shared constants for dashboard tabs
export const DASHBOARD_TABS = ['containers', 'invitations', 'users'] as const

export type DashboardTab = typeof DASHBOARD_TABS[number]

export const LAST_DASHBOARD_TAB_STORAGE_KEY = 'lastDashboardTab'

/**
 * Gets the valid tab to navigate to, with fallback to default
 */
export function getTargetTab(fallback: PlaygroundTab = 'ImageGenerator'): PlaygroundTab {
  try {
    const storedTab = localStorage.getItem(LAST_TAB_STORAGE_KEY)
    return storedTab && PLAYGROUND_TABS.includes(storedTab as PlaygroundTab)
      ? (storedTab as PlaygroundTab)
      : fallback
  } catch {
    return fallback;
  }
}

/**
 * Saves the current tab to localStorage for persistence
 */
export function saveCurrentTab(tab: PlaygroundTab): void {
  try {
    localStorage.setItem(LAST_TAB_STORAGE_KEY, tab)
  } catch {
    // Silently fail if localStorage is unavailable (e.g., private browsing)
  }
}

/**
 * Gets the last used dashboard tab, with fallback to default
 */
export function getDashboardTab(fallback: DashboardTab = 'containers'): DashboardTab {
  try {
    const storedTab = localStorage.getItem(LAST_DASHBOARD_TAB_STORAGE_KEY)
    return storedTab && DASHBOARD_TABS.includes(storedTab as DashboardTab)
      ? (storedTab as DashboardTab)
      : fallback
  } catch {
    return fallback;
  }
}

/**
 * Saves the current dashboard tab to localStorage
 */
export function saveDashboardTab(tab: DashboardTab): void {
  try {
    localStorage.setItem(LAST_DASHBOARD_TAB_STORAGE_KEY, tab)
  } catch {
    // Silently fail if localStorage is unavailable (e.g., private browsing)
  }
}
