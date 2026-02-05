import { Link } from "react-router-dom"
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import LoginModal from './Login';
import { Group, Divider } from "@mantine/core";

export default function Header() {
  const [loginOpened, setLoginOpened] = useState(false);
  const { isLoggedIn, logout } = useAuth();

  return (
    <>
      <Group justify="space-between" p="md">
        <Group gap="md">
          <Link to="/">Image Generator</Link>
          <Link to="/playground">Playground</Link>
        </Group>

        {isLoggedIn ? (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              logout();
            }}
          >
            Logout
          </a>
        ) : (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setLoginOpened(true);
            }}
          >
            Login
          </a>
        )}
        {/* </div> */}

        <LoginModal opened={loginOpened} onClose={() => setLoginOpened(false)} />
      </Group>
      <Divider />
    </>
  );
}
