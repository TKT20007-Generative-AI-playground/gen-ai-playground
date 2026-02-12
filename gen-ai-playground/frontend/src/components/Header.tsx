import { Link, useLocation } from "react-router-dom"
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import LoginModal from './Login';
import { Group, Divider, Text, Button, Drawer } from "@mantine/core";
import History from "./History";

export default function Header() {
  const { isLoggedIn, logout } = useAuth()
  const location = useLocation()

  const [loginOpened, setLoginOpened] = useState(false);
  const [historyOpened, setHistoryOpened] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(420);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    if (location.state?.openLoginModal) {
      queueMicrotask(() => setLoginOpened(true))
      window.history.replaceState({}, document.title)
    }
  }, [location])

  const onMouseMove = useCallback((e: MouseEvent) => {
  if (!resizing) return;

  const newWidth = e.clientX;

  if (newWidth > 250 && newWidth < 800) {
    setDrawerWidth(newWidth);
  }
  }, [resizing]);

  const onMouseUp = useCallback(() => {
    if (resizing) setResizing(false);
  }, [resizing]);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  return (
    <>
      <Group justify="space-between" p="md" bg="#2C4E87">
        <Group gap="md">
          <Text fw={500} c="white">Generative AI Playground </Text>
          <Button variant="white" color="dark" onClick={() => setHistoryOpened(true)}>
            History
          </Button>
          <Button component={Link} to="/playground" variant="white" color="dark">
            Playground
          </Button>
        </Group>

        {isLoggedIn ? (
          <Button variant="white" color="dark" onClick={logout}>Logout</Button>
        ) : (
          <Button variant="white" color="dark" onClick={() => setLoginOpened(true)}>Login</Button>
        )}

        <LoginModal opened={loginOpened} onClose={() => setLoginOpened(false)} />
      </Group>
      <Divider />

      <Drawer
        opened={historyOpened}
        onClose={() => setHistoryOpened(false)}
        title="History"
        position="left"
        size={drawerWidth}
        padding="md"
        overlayProps={{
          blur: 0,
          opacity: 0,
          style: { backgroundColor: "transparent" }
      }}
        styles={{
        root: { overflow: "hidden", position: "relative", transition: resizing ? "none" : "width 0.2s ease" }
     }}
      >
      <div style={{ overflow: "hidden", position: "relative", width: "100%", height: "100%" }}>
       <History />

      <div
        onMouseDown={(e) => {
          e.preventDefault();
          setResizing(true);
      }}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 6,
          height: "100%",
          cursor: "ew-resize",
          zIndex: 9999,
          backgroundColor: "gray",
      }}
       />
       </div>
      </Drawer>
    </>
  );
}