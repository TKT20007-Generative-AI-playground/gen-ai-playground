import { useState } from "react";
import {
  Container,
  Paper,
  TextInput,
  PasswordInput,
  Button,
  Title,
  Alert,
  Stack,
} from "@mantine/core";

export default function Register() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return "Password must be at least 8 characters long";
    }
    if (!/[A-Z]/.test(password)) {
      return "Password must contain at least one uppercase letter";
    }
    if (!/[0-9]/.test(password)) {
      return "Password must contain at least one number";
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return "Password must contain at least one special character";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    try {
      const res = await fetch("http://localhost:8000/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
          invitation_code: inviteCode,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.detail || "Registration failed")
        return
      }

      setSuccess("User registered successfully!");
      setUsername("");
      setPassword("");
      setConfirmPassword("");
      setInviteCode("");
    } catch {
      setError("Server unreachable");
    }
  }

  return (
    <Container size={420} my="xl">
      <Title ta="center" mb="md">
        Create an account
      </Title>

      <Paper withBorder shadow="md" p="lg" radius="md">
        <form onSubmit={handleSubmit}>
          <Stack>
            <TextInput
              label="Username"
              placeholder="Your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              data-testid="register-username"
            />

            <PasswordInput
              label="Password"
              placeholder="Your password"
              value={password}
              onChange={(e) => {
                const value = e.target.value;
                setPassword(value);

                const error = validatePassword(value);
                setPasswordError(error || "");
              }}
              error={passwordError}
              required
              data-testid="register-password"
            />

            <PasswordInput
              label="Confirm password"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />

            <TextInput
              label="Invitation code"
              placeholder="Required to register"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              required
            />

            <Button type="submit" fullWidth mt="sm">
              Create user
            </Button>
          </Stack>
        </form>

        {error && (
          <Alert color="red" mt="md">
          {error}
          </Alert>
        )}

        {success && (
          <Alert color="green" mt="md">
          {success}
          </Alert>
        )}
      </Paper>
    </Container>
  );
}