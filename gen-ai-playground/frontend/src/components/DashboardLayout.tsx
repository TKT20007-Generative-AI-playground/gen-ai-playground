import { Link, Outlet, useLocation, useNavigate } from "react-router-dom"
import { Group, Button, Text, Divider } from "@mantine/core"
import { useAuth } from "../context/AuthContext"
import { getTargetTab, type DashboardTab, saveDashboardTab } from "../constants/tabs"

export default function DashboardLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { logout } = useAuth()

  // Save current dashboard tab and navigate to playground
  const handlePlaygroundClick = () => {
    // Determine current dashboard tab from location
    const currentTab: DashboardTab = location.pathname === '/dashboard/users' ? 'users' : 'containers'
    saveDashboardTab(currentTab)
    
    // Navigate to the last used playground tab, defaulting to ImageGenerator
    const targetTab = getTargetTab()
    navigate(`/playground/${targetTab}`)
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f8f9fa" }}>
      {/* Top Bar - Same style as main Header */}
      <Group justify="space-between" p="md" bg="#2C4E87">
        <Group gap="md">
          <Button variant="white" color="dark" onClick={handlePlaygroundClick} style={{ flexShrink: 0 }}>
            ← Playground
          </Button>
          <Text fw={500} c="white" style={{ flexShrink: 0 }}>Generative AI Playground</Text>
          <Button
            component={Link}
            to="/dashboard/containers"
            variant={location.pathname.includes("/dashboard/containers") ? "filled" : "white"}
            color={location.pathname.includes("/dashboard/containers") ? "blue" : "dark"}
            style={{ flexShrink: 0 }}
          >
            Containers
          </Button>
          <Button
            component={Link}
            to="/dashboard/users"
            variant={location.pathname.includes("/dashboard/users") ? "filled" : "white"}
            color={location.pathname.includes("/dashboard/users") ? "blue" : "dark"}
            style={{ flexShrink: 0 }}
          >
            Users
          </Button>
        </Group>

        <Button variant="white" color="dark" onClick={logout} style={{ flexShrink: 0 }}>Logout</Button>
      </Group>
      <Divider />

      {/* Dashboard Title */}
      <div style={{ padding: "16px 20px 0" }}>
        <Text size="xl" fw={500}>Dashboard</Text>
      </div>

      {/* Content Area */}
      <div style={{ padding: "20px" }}>
        <Outlet />
      </div>
    </div>
  )
}
