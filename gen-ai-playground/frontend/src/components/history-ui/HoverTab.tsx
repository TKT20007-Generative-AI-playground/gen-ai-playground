import { Tabs } from "@mantine/core"
import { useHover } from "@mantine/hooks"
export function HoverTab({
  value,
  children,
  ...props
}: {
  value: string
  children: React.ReactNode
  [key: string]: string | React.ReactNode
}) {
  const { hovered, ref } = useHover()

  return (
    <Tabs.Tab
      ref={ref}
      value={value}
      style={{
        color: hovered ? "black" : "rgba(5, 5, 5, 0.75)",
        background: hovered ? "rgba(0, 0, 0, 0.10)" : "transparent",
        transition: "all 0.2s ease",
      }}
      {...props}
    >
      {children}
    </Tabs.Tab>
  )
}
