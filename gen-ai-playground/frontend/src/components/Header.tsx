import { useLocation, useNavigate, Link } from "react-router-dom"
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import LoginModal from './Login';
import { Group, Divider, Text, Button, Burger, Drawer, Stack } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { getTargetTab, saveCurrentTab, getDashboardTab, type PlaygroundTab, PLAYGROUND_TABS } from '../constants/tabs';
import { formatUserGreeting } from "../utils/greeting";


export default function Header() {
  const { isLoggedIn, isAdmin, username, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [menuOpen, setMenuOpen] = useState(false)

  const handleDashboardClick = () => {
    const pathMatch = location.pathname.match(/^\/playground\/(\w+)$/)
    if (pathMatch && PLAYGROUND_TABS.includes(pathMatch[1] as PlaygroundTab)) {
      saveCurrentTab(pathMatch[1] as PlaygroundTab)
    }
    const dashboardTab = getDashboardTab()
    navigate(`/dashboard/${dashboardTab}`)
    setMenuOpen(false)
  }

  const handlePlaygroundClick = () => {
    const targetTab = getTargetTab()
    navigate(`/playground/${targetTab}`)
    setMenuOpen(false)
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
          {isAdmin && !isMobile && (
            <Button variant="white" color="dark" onClick={handleDashboardClick} style={{ flexShrink: 0 }}>
              Dashboard
            </Button>
          )}
          <Text fw={500} c="white" component={Link} to="/" style={{ flexShrink: 0 }}>
            Generative AI Playground
          </Text>
          {isLoggedIn && !isMobile && (
            <Button component={Link} to="/history" variant="white" color="dark">
              History
            </Button>
          )}
          {isLoggedIn && !isMobile && (
            <Button variant="white" color="dark" onClick={handlePlaygroundClick} style={{ flexShrink: 0 }}>
              Playground
            </Button>
          )}
        </Group>

        {!isMobile && (
          isLoggedIn ? (
            <Group gap="md">
              <Text fw={500} c="white">
                {formatUserGreeting(username)}
              </Text>
              <Button variant="white" color="dark" onClick={logout} style={{ flexShrink: 0 }}>Logout</Button>
            </Group>
          ) : (
            <Button variant="white" color="dark" onClick={() => setLoginOpened(true)} style={{ flexShrink: 0 }}>Login</Button>
          )
        )}

        {isMobile && (
          <Group gap="md">
            {isLoggedIn && (
              <Text fw={500} c="white">
                {formatUserGreeting(username)}
              </Text>
            )}
            <Burger
              opened={menuOpen}
              onClick={() => setMenuOpen(prev => !prev)}
              color="white"
              aria-label="Toggle menu"
            />
          </Group>
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

      <Drawer
        opened={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Menu"
        size="xs"
        position="right"
        styles={{
          content: { backgroundColor: "white", border: "1px solid black" }
        }}
      >
        <Stack gap="sm">
          {isAdmin && (
            <Button variant="default" fullWidth onClick={handleDashboardClick}>
              Dashboard
            </Button>
          )}
          {isLoggedIn && (
            <Button variant="default" fullWidth onClick={handlePlaygroundClick}>
              Playground
            </Button>
          )}
          {isLoggedIn && (
            <Button variant="default" fullWidth component={Link} to="/history" onClick={() => setMenuOpen(false)}>
              History
            </Button>
          )}
          {isLoggedIn ? (
            <Button variant="default" fullWidth onClick={() => { logout(); setMenuOpen(false) }}>
              Logout
            </Button>
          ) : (
            <Button variant="default" fullWidth onClick={() => { setLoginOpened(true); setMenuOpen(false) }}>
              Login
            </Button>
          )}
        </Stack>
      </Drawer>
    </>
  )
}
