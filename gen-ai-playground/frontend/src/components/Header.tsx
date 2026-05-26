import { useLocation, useNavigate, Link } from "react-router-dom"
import { useState, useEffect } from "react"
import { useAuth } from "../context/AuthContext"
import LoginModal from "./Login"
import {
  Group,
  Divider,
  Text,
  Button,
  Burger,
  Drawer,
  Stack,
  Switch,
  useMantineColorScheme,
} from "@mantine/core"
import { useMediaQuery } from "@mantine/hooks"
import {
  getTargetTab,
  saveCurrentTab,
  getDashboardTab,
  type PlaygroundTab,
  PLAYGROUND_TABS,
} from "../constants/tabs"
import { formatUserGreeting } from "../utils/greeting"

export default function Header() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
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

  const sunIcon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.93 19.07l1.41-1.41" />
      <path d="M17.66 6.34l1.41-1.41" />
    </svg>
  )

  const moonIcon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
    </svg>
  )

  return (
    <>
      <Group
        justify="space-between"
        p="md"
        bg="var(--app-header-gradient)"
        style={{ position: "sticky", top: 0, zIndex: 100 }}
      >
        <Group gap="md">
          {isAdmin && !isMobile && (
            <Button
              variant="white"
              color="dark"
              onClick={handleDashboardClick}
              style={{ flexShrink: 0 }}
            >
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
            <Button
              variant="white"
              color="dark"
              onClick={handlePlaygroundClick}
              style={{ flexShrink: 0 }}
            >
              Playground
            </Button>
          )}
        </Group>

        {!isMobile &&
          (isLoggedIn ? (
            <Group gap="md">
              <Switch
                size="sm"
                color="dark"
                checked={colorScheme === "dark"}
                onChange={() => toggleColorScheme()}
                label={colorScheme === "dark" ? "Dark" : "Light"}
                thumbIcon={colorScheme === "dark" ? moonIcon : sunIcon}
                styles={{
                  label: { color: "white", fontWeight: 600, minWidth: 48, textAlign: "right" },
                  track: { backgroundColor: "rgba(255, 255, 255, 0.18)" },
                  thumb: { color: "#1c1c1c" },
                }}
              />
              <Text fw={500} c="white">
                {formatUserGreeting(username)}
              </Text>
              <Button variant="white" color="dark" onClick={logout} style={{ flexShrink: 0 }}>
                Logout
              </Button>
            </Group>
          ) : (
            <Group gap="md">
              <Switch
                size="sm"
                color="dark"
                checked={colorScheme === "dark"}
                onChange={() => toggleColorScheme()}
                label={colorScheme === "dark" ? "Dark" : "Light"}
                thumbIcon={colorScheme === "dark" ? moonIcon : sunIcon}
                styles={{
                  label: { color: "white", fontWeight: 600, minWidth: 48, textAlign: "right" },
                  track: { backgroundColor: "rgba(255, 255, 255, 0.18)" },
                  thumb: { color: "#1c1c1c" },
                }}
              />
              <Button
                variant="white"
                color="dark"
                onClick={() => setLoginOpened(true)}
                style={{ flexShrink: 0 }}
              >
                Login
              </Button>
            </Group>
          ))}

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
          content: {
            backgroundColor: "var(--app-drawer-bg)",
            border: "1px solid var(--app-drawer-border)",
          },
        }}
      >
        <Stack gap="sm">
          <Switch
            size="sm"
            color="dark"
            checked={colorScheme === "dark"}
            onChange={() => toggleColorScheme()}
            label={colorScheme === "dark" ? "Dark" : "Light"}
            thumbIcon={colorScheme === "dark" ? moonIcon : sunIcon}
            labelPosition="left"
            styles={{ label: { fontWeight: 600 }, thumb: { color: "#1c1c1c" } }}
          />
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
            <Button
              variant="default"
              fullWidth
              component={Link}
              to="/history"
              onClick={() => setMenuOpen(false)}
            >
              History
            </Button>
          )}
          {isLoggedIn ? (
            <Button
              variant="default"
              fullWidth
              onClick={() => {
                logout()
                setMenuOpen(false)
              }}
            >
              Logout
            </Button>
          ) : (
            <Button
              variant="default"
              fullWidth
              onClick={() => {
                setLoginOpened(true)
                setMenuOpen(false)
              }}
            >
              Login
            </Button>
          )}
        </Stack>
      </Drawer>
    </>
  )
}
