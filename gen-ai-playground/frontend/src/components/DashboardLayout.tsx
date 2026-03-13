import { Link, Outlet, useLocation } from "react-router-dom"
import { Group, Button, Text, Divider } from "@mantine/core"
import { useAuth } from "../context/AuthContext"

export default function DashboardLayout() {
  const location = useLocation()
  const { logout } = useAuth()

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f8f9fa" }}>
      {/* Top Bar - Same style as main Header */}
      <Group justify="space-between" p="md" bg="#2C4E87">
        <Group gap="md">
          <Button component={Link} to="/playground" variant="white" color="dark" style={{ flexShrink: 0 }}>
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
