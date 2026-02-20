import { Text } from "@mantine/core";
import { useEffect, useState } from "react";

interface GeneratingTextProps {
  baseText?: string;
}

export default function GeneratingText({
  baseText = "Generating",
}: GeneratingTextProps) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => {
        if (prev === "") return ".";
        if (prev === ".") return "..";
        if (prev === "..") return "...";
        return "";
      });
    }, 400);

    return () => clearInterval(interval);
  }, []);

  return (
    <Text
      size="sm"
      c="dimmed"
      ta="center"
      mt="sm"
      style={{
        fontStyle: "italic",
        transition: "opacity 0.2s ease",
      }}
    >
      {baseText}
      {dots}
    </Text>
  );
}
