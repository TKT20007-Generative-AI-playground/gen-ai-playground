import { Link, Outlet, useLocation, useNavigate } from "react-router-dom"
import { Group, Button, Text, Divider, Burger, Drawer, Stack } from "@mantine/core"
import { useAuth } from "../context/AuthContext"
import { getTargetTab, type DashboardTab, saveDashboardTab } from "../constants/tabs"
import { useState } from "react"
import { useMediaQuery } from "@mantine/hooks"

export default function DashboardLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { logout } = useAuth()

  const [opened, setOpened] = useState(false)

  // Mantine v7: tämä korvaa MediaQueryn
  const isMobile = useMediaQuery("(max-width: 768px)")

  const handlePlaygroundClick = () => {
    const path = location.pathname
    let currentTab: DashboardTab = 'containers'
    if (path === '/dashboard/invitations') currentTab = 'invitations'
    if (path === '/dashboard/users') currentTab = 'users'

    saveDashboardTab(currentTab)
    const targetTab = getTargetTab()
    navigate(`/playground/${targetTab}`)
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f8f9fa" }}>
      <Group justify="space-between" p="md" bg="linear-gradient(135deg, #000F65, #0b1328)" style={{ position: "sticky", top: 0, zIndex: 100 }}>
        
        <Group gap="md">
          {!isMobile && (
            <Button variant="white" color="dark" onClick={handlePlaygroundClick}>
              ← Playground
            </Button>
          )}

          <Text fw={500} c="white">Generative AI Playground</Text>

          {/* DESKTOP NAVIGATION */}
          {!isMobile && (
            <Group gap="md">
              <Button
                component={Link}
                to="/dashboard/containers"
                variant={location.pathname.includes("/dashboard/containers") ? "filled" : "white"}
                color={location.pathname.includes("/dashboard/containers") ? "blue" : "dark"}
              >
                Containers
              </Button>

              <Button
                component={Link}
                to="/dashboard/invitations"
                variant={location.pathname.includes("/dashboard/invitations") ? "filled" : "white"}
                color={location.pathname.includes("/dashboard/invitations") ? "blue" : "dark"}
              >
                Invitations
              </Button>

              <Button
                component={Link}
                to="/dashboard/users"
                variant={location.pathname.includes("/dashboard/users") ? "filled" : "white"}
                color={location.pathname.includes("/dashboard/users") ? "blue" : "dark"}
              >
                Users
              </Button>
            </Group>
          )}

        </Group>

        {!isMobile && (
          <Button variant="white" color="dark" onClick={logout}>Logout</Button>
        )}

        {isMobile && (
          <Burger
            opened={opened}
            onClick={() => setOpened(prev => !prev)}
            color="white"
            aria-label="Toggle menu"
          />
        )}
      </Group>

      <Divider />

      {/* MOBILE DRAWER MENU */}
      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        title="Menu"
        size="xs"
        position="right"
        styles={{
          content: { backgroundColor: "white", border: "1px solid black" }
        }}
      >
        <Stack gap="sm">
          <Button variant="default" fullWidth component={Link} to="/dashboard/containers" onClick={() => setOpened(false)}>
            Containers
          </Button>
          <Button variant="default" fullWidth component={Link} to="/dashboard/invitations" onClick={() => setOpened(false)}>
            Invitations
          </Button>
          <Button variant="default" fullWidth component={Link} to="/dashboard/users" onClick={() => setOpened(false)}>
            Users
          </Button>
          <Button variant="default" fullWidth onClick={() => { handlePlaygroundClick(); setOpened(false) }}>
            Playground
          </Button>
          <Button variant="default" fullWidth onClick={() => { logout(); setOpened(false) }}>
            Logout
          </Button>
        </Stack>
      </Drawer>

      <div style={{ padding: "16px 20px 0" }}>
        <Text size="xl" fw={500}>Dashboard</Text>
      </div>

      <div style={{ padding: "20px" }}>
        <Outlet />
      </div>
    </div>
  )
}