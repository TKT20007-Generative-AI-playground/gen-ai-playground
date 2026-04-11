import { DatePickerInput } from "@mantine/dates"

export default function DateRangePicker({
  dateRange,
  setDateRange,
}: {
  dateRange: [Date | null, Date | null]
  setDateRange: (dateRange: [Date | null, Date | null]) => void
}) {
  return (
    <DatePickerInput
      type="range"
      allowSingleDateInRange
      placeholder="Pick date range"
      value={dateRange}
      onChange={value => setDateRange(value as [Date | null, Date | null])}
      clearable
      w={260}
    />
  )
}
