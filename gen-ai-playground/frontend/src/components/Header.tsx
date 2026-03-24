import { useLocation, useNavigate, Link } from "react-router-dom"
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import LoginModal from './Login';
import { Group, Divider, Text, Button } from "@mantine/core";
import { getTargetTab, saveCurrentTab, getDashboardTab, type PlaygroundTab, PLAYGROUND_TABS } from '../constants/tabs';


export default function Header() {
  const { isLoggedIn, isAdmin, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  // Store current playground tab when navigating to dashboard
  const handleDashboardClick = () => {
    const pathMatch = location.pathname.match(/^\/playground\/(\w+)$/)
    if (pathMatch && PLAYGROUND_TABS.includes(pathMatch[1] as PlaygroundTab)) {
      saveCurrentTab(pathMatch[1] as PlaygroundTab)
    }
    // Navigate to the last used dashboard tab
    const dashboardTab = getDashboardTab()
    navigate(`/dashboard/${dashboardTab}`)
  }

  // Navigate to the last used playground tab, defaulting to ImageGenerator
  const handlePlaygroundClick = () => {
    const targetTab = getTargetTab()
    navigate(`/playground/${targetTab}`)
  }

  const [loginOpened, setLoginOpened] = useState(false)
  const [redirectTo, setRedirectTo] = useState<string | null>(null)

  useEffect(() => {
    if (location.state?.openLoginModal) {
      queueMicrotask(() => {
        setRedirectTo(location.state?.redirectTo || null)
        setLoginOpened(true)
      })
      window.history.replaceState({}, document.title)
    }
  }, [location])

  return (
    <>
      <Group
        justify="space-between"
        p="md"
        bg="linear-gradient(135deg, #000F65, #0b1328)"
        style={{ position: "sticky", top: 0, zIndex: 100 }}
      >
        <Group gap="md">
          {isAdmin && (
            <Button variant="white" color="dark" onClick={handleDashboardClick} style={{ flexShrink: 0 }}>
              Dashboard
            </Button>
          )}
          <Text fw={500} c="white" style={{ flexShrink: 0 }}>Generative AI Playground</Text>
          {isLoggedIn && (
            <Button component={Link} to="/history" variant="white" color="dark">
              History
            </Button>
          )}
          <Button variant="white" color="dark" onClick={handlePlaygroundClick} style={{ flexShrink: 0 }}>
            Playground
          </Button>
        </Group>

        {isLoggedIn ? (
          <Button variant="white" color="dark" onClick={logout} style={{ flexShrink: 0 }}>Logout</Button>
        ) : (
          <Button variant="white" color="dark" onClick={() => setLoginOpened(true)} style={{ flexShrink: 0 }}>Login</Button>
        )}

        <LoginModal
          opened={loginOpened}
          onClose={() => {
            setLoginOpened(false)
            setRedirectTo(null)
          }}
          redirectTo={redirectTo}
        />
      </Group>
      <Divider />
    </>
  )
}
