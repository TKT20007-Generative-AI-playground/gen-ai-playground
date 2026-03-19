import { Box, Button, Card, Text, Title } from "@mantine/core";
import useFadeIn from "../hooks/useFadeIn";

interface HoverCardProps {
    image: string;
    title: string;
    description: string;
    buttonText: string;
    delay?: number;
    onClick?: () => void;
}

const HoverCard = ({ image, title, description, buttonText, delay = 0, onClick }: HoverCardProps) => {
    const { ref, isVisible } = useFadeIn(delay);

    return (
        <Card
            ref={ref}
            shadow="sm"
            padding={0}
            radius="md"
            withBorder
            w={300}
            h={400}
            className={`hover-card fade-in ${isVisible ? "visible" : ""}`}
        >
            <Box
                className="hover-card-bg"
                style={{
                    backgroundImage: `url(${image})`,
                }}
            />

            <Title order={3} className="hover-card-title">{title}</Title>

            <Box className="hover-card-content" p="lg">
                <Text size="sm" c="dimmed">
                    {description}
                </Text>

                <Button color="#000F65" fullWidth mt="md" radius="md" onClick={onClick}>
                    {buttonText}
                </Button>
            </Box>
        </Card>
    );
};

export default HoverCard;
