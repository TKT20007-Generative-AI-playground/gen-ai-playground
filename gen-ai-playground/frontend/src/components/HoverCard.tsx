import { Box, Button, Card, Text, Title } from "@mantine/core"
import type { RefObject } from "react"

interface HoverCardProps {
  image: string
  title: string
  description: string
  buttonText: string
  cardRef: RefObject<HTMLDivElement | null>
  isVisible: boolean
  onClick?: () => void
}

const HoverCard = ({
  image,
  title,
  description,
  buttonText,
  cardRef,
  isVisible,
  onClick,
}: HoverCardProps) => {
  return (
    <Card
      ref={cardRef}
      shadow="sm"
      padding={0}
      radius="md"
      withBorder
      w={300}
      h={400}
      className={`hover-card fade-in ${isVisible ? "visible" : ""}`}
    >
      {image && image.endsWith('.mp4') ? (
        <video
          autoPlay
          loop
          muted
          playsInline
          className="hover-card-bg"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        >
          <source src={image} type="video/mp4" />
        </video>
      ) : (
        <Box
          className="hover-card-bg"
          style={{
            backgroundImage: `url(${image})`,
          }}
        />
      )}

      <Title order={3} className="hover-card-title">
        {title}
      </Title>

      <Box className="hover-card-content" p="lg">
        <Text size="sm">
          {description}
        </Text>

        <Button className="btn-primary" fullWidth mt="md" onClick={onClick}>
          {buttonText}
        </Button>
      </Box>
    </Card>
  )
}

export default HoverCard
