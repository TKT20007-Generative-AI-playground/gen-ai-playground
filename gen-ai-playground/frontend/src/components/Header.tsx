import { Link, useLocation } from "react-router-dom"
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import LoginModal from './Login';
import { Group, Divider, Text, Button } from "@mantine/core";

export default function Header() {  
  const { isLoggedIn, isAdmin, logout } = useAuth()
  const location = useLocation()

  const [loginOpened, setLoginOpened] = useState(false);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

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
          <Text fw={500} c="white" component={Link} to="/">
            Generative AI Playground 
          </Text>
          {isLoggedIn && (
            <Button 
              variant="white"
              color="dark"
            >
              History
            </Button>
          )}

          {isAdmin && (
            <Button component={Link} to="/dashboard" variant="white" color="dark">
              Dashboard
            </Button>
          )}

          <Button component={Link} to="/playground" variant="white" color="dark">
            Playground
          </Button>
        </Group>

        {isLoggedIn ? (
          <Button variant="white" color="dark" onClick={logout}>Logout</Button>
        ) : (
          <Button variant="white" color="dark" onClick={() => setLoginOpened(true)}>Login</Button>
        )}

        <LoginModal opened={loginOpened} onClose={() => { setLoginOpened(false); setRedirectTo(null); }} redirectTo={redirectTo} />
      </Group>
      <Divider />
    </>
  );
}