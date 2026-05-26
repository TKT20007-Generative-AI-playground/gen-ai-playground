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
        color: hovered ? "var(--app-tab-text-hover)" : "var(--app-tab-text)",
        background: hovered ? "var(--app-tab-bg-hover)" : "transparent",
        transition: "all 0.2s ease",
      }}
      {...props}
    >
      {children}
    </Tabs.Tab>
  )
}
