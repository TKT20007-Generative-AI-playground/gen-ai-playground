import { Box, Button, Group, Stack, Title } from "@mantine/core"
import { useNavigate } from "react-router-dom"

const titleStyle = {
  c: "var(--app-notfound-title)",
  ff: "'Google sans', sans-serif",
  lh: 1,
  m: 0,
}

const NotFoundPage = () => {
  const navigate = useNavigate()

  return (
    <>
      <Box style={{ position: "relative", height: "40vh", overflow: "hidden" }}>
        <Box
          style={{
            position: "relative",
            height: "100%",
            background: "var(--app-notfound-overlay)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Group
            align="center"
            gap="xl"
            w={{ base: "90%", sm: "70%", md: "40%" }}
            justify="space-between"
            wrap="wrap"
          >
            <Stack gap={0}>
              <Title {...titleStyle} fz={{ base: "2rem", sm: "3rem", md: "4rem" }}>
                404
              </Title>
              <Title {...titleStyle} fz={{ base: "2rem", sm: "3rem", md: "4rem" }}>
                PAGE NOT FOUND
              </Title>
            </Stack>
            <Box>
              <Button className="btn-primary" fullWidth mt="md" onClick={() => navigate("/")}>
                Go Home
              </Button>
            </Box>
          </Group>
        </Box>
      </Box>
    </>
  )
}

export default NotFoundPage
