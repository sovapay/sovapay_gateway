"use client"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover"
import { Calendar } from "@/components/ui/calendar"
import { CalendarIcon } from "lucide-react"
import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/Card"
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/Chart"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/Select"

export const description = "An interactive area chart"

const chartConfig = {
    volume: {
        label: "Volume",
        color: "hsl(var(--chart-1))",
    },
    orders: {
        label: "Orders",
        color: "hsl(var(--chart-2))",
    },
} satisfies ChartConfig

interface Merchant {
    id: string;
    name: string;
}

interface InteractiveAreaChartProps {
    data: any[];
    period?: string;
    onPeriodChange?: (period: string) => void;
    merchants?: Merchant[];
    onMerchantChange?: (merchantId: string) => void;
    onDateRangeChange?: (from: string, to: string) => void;
}


export function InteractiveAreaChart({ data, period = "Last 90 days", onPeriodChange, merchants = [], onMerchantChange, onDateRangeChange }: InteractiveAreaChartProps) {
    // Map full string to short code for Select value
    const getPeriodValue = (p: string) => {
        if (p === "Today") return "1d"
        if (p === "Last 7 days") return "7d"
        if (p === "Last 30 days") return "30d"
        if (p === "Last 90 days") return "90d"
        if (p === "custom") return "custom"
        return "90d"
    }

    const [timeRange, setTimeRange] = React.useState(getPeriodValue(period))
    const [selectedMerchant, setSelectedMerchant] = React.useState<string>("all")
    const [fromDate, setFromDate] = React.useState<string>("")
    const [toDate, setToDate] = React.useState<string>("")
    const [calendarOpen, setCalendarOpen] = React.useState<"from" | "to" | null>(null)
    const [selectOpen, setSelectOpen] = React.useState(false)

    const handleRangeChange = (value: string) => {
        setTimeRange(value)
        if (value !== "custom") {
            setFromDate("")
            setToDate("")
            setCalendarOpen(null)
            // Fire period change to refetch data
            if (onPeriodChange) {
                let newPeriod = "Last 90 days"
                if (value === "7d") newPeriod = "Last 7 days"
                if (value === "30d") newPeriod = "Last 30 days"
                if (value === "1d") newPeriod = "Today" 
                onPeriodChange(newPeriod)
            }
            // Clear date range in parent so it stops using from_date/to_date
            onDateRangeChange?.("", "")
        }
    }

    const handleMerchantChange = (value: string) => {
        setSelectedMerchant(value)
        onMerchantChange?.(value)
    }

    const handleFromDateSelect = (date: Date | undefined) => {
        if (!date) return
        const formatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        setFromDate(formatted)
        setToDate("")
        setCalendarOpen("to") // Auto open "to" calendar
    }

    const handleToDateSelect = (date: Date | undefined) => {
        if (!date) return
        const formatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        setToDate(formatted)
        setCalendarOpen(null) // Close after selection
        onDateRangeChange?.(fromDate, formatted)
    }

    const isCustom = timeRange === "custom"

    return (
        <Card>
            <CardHeader className="border-b py-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">

                    {/* LEFT: Title + Description */}
                    <div className="flex flex-col gap-1">
                        <CardTitle>Volume & Orders</CardTitle>
                        <CardDescription>
                            {isCustom && fromDate && toDate
                                ? `${fromDate} → ${toDate}`
                                : isCustom
                                ? "Custom range"
                                : period || "Showing total volume and orders"}
                        </CardDescription>
                    </div>

                    {/* RIGHT: Filters */}
                    <div className="flex items-center gap-2 flex-wrap">

                        {/* Period Select */}
                        <Select
                            value={timeRange !== "custom" ? timeRange : ""}
                            onValueChange={handleRangeChange}
                            open={selectOpen}
                            onOpenChange={setSelectOpen}
                        >
                            <SelectTrigger className="w-[160px] rounded-lg" aria-label="Select period">
                                <SelectValue placeholder="Last 3 months">
                                    {timeRange === "custom"
                                        ? (fromDate && toDate ? `${fromDate} → ${toDate}` : "Custom range")
                                        : timeRange === "90d" ? "Last 3 months"
                                        : timeRange === "30d" ? "Last 30 days"
                                        : timeRange === "7d" ? "Last 7 days"
                                        : timeRange === "1d" ? "Today"
                                        : "Last 3 months"}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                                <SelectItem value="90d" className="rounded-lg">Last 3 months</SelectItem>
                                <SelectItem value="30d" className="rounded-lg">Last 30 days</SelectItem>
                                <SelectItem value="7d" className="rounded-lg">Last 7 days</SelectItem>
                                <SelectItem value="1d" className="rounded-lg">Today</SelectItem>
                                {/* Custom range item — just closes select and opens calendar */}
                                <div
                                    className="relative flex w-full cursor-pointer select-none items-center rounded-lg py-1.5 pl-2 pr-8 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                                    onClick={() => {
                                        setSelectOpen(false)
                                        setTimeRange("custom")
                                        onPeriodChange?.("")
                                        setTimeout(() => setCalendarOpen("from"), 50)
                                    }}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                                    {fromDate && toDate ? `${fromDate} → ${toDate}` : "Custom range"}
                                </div>
                            </SelectContent>
                        </Select>

                        {/* Popover Calendar — lives OUTSIDE the Select, anchored to a hidden ref */}
                        <Popover
                            open={calendarOpen !== null}
                            onOpenChange={(open) => { if (!open) setCalendarOpen(null) }}
                        >
                            <PopoverTrigger asChild>
                                <span className="w-0 h-0 overflow-hidden absolute" />
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <div className="p-3 border-b text-sm font-medium text-muted-foreground">
                                    {calendarOpen === "from" ? "Select start date" : "Select end date"}
                                </div>
                                <Calendar
                                    mode="single"
                                    selected={calendarOpen === "from"
                                        ? (fromDate ? new Date(fromDate) : undefined)
                                        : (toDate ? new Date(toDate) : undefined)
                                    }
                                    onSelect={calendarOpen === "from" ? handleFromDateSelect : handleToDateSelect}
                                    disabled={calendarOpen === "to"
                                        ? (date) => fromDate ? date < new Date(fromDate) : false
                                        : undefined
                                    }
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>

                        {/* Merchant */}
                        <Select value={selectedMerchant} onValueChange={handleMerchantChange}>
                            <SelectTrigger className="w-[180px] rounded-lg" aria-label="Select merchant">
                                <SelectValue placeholder="All Merchants" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                                <SelectItem value="all" className="rounded-lg">All Merchants</SelectItem>
                                {merchants.map((merchant) => (
                                    <SelectItem key={merchant.id} value={merchant.id} className="rounded-lg">
                                        {merchant.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                    </div>
                </div>
            </CardHeader>
            <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
                <ChartContainer
                    config={chartConfig}
                    className="aspect-auto h-[250px] w-full"
                >
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id="fillVolume" x1="0" y1="0" x2="0" y2="1">
                                <stop
                                    offset="5%"
                                    stopColor="var(--color-volume)"
                                    stopOpacity={0.8}
                                />
                                <stop
                                    offset="95%"
                                    stopColor="var(--color-volume)"
                                    stopOpacity={0.1}
                                />
                            </linearGradient>
                            <linearGradient id="fillOrders" x1="0" y1="0" x2="0" y2="1">
                                <stop
                                    offset="5%"
                                    stopColor="var(--color-orders)"
                                    stopOpacity={0.8}
                                />
                                <stop
                                    offset="95%"
                                    stopColor="var(--color-orders)"
                                    stopOpacity={0.1}
                                />
                            </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} />
                        <XAxis
                            dataKey="date"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            minTickGap={32}
                            tickFormatter={(value) => {
                                const date = new Date(value)
                                // Handle if value is already formatted or partial date
                                // The API returns YYYY-MM-DD or similar.
                                if (isNaN(date.getTime())) return value
                                return date.toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                })
                            }}
                        />
                        {/* Using left axis for Revenue */}
                        <YAxis
                            yAxisId="right"
                            orientation="right"
                            tickLine={false}
                            axisLine={false}
                            hide
                        />
                        <YAxis
                            yAxisId="left"
                            orientation="left"
                            tickLine={false}
                            axisLine={false}
                            hide
                        />
                        <ChartTooltip
                            cursor={false}
                            content={
                                <ChartTooltipContent
                                    labelFormatter={(value) => {
                                        return new Date(value).toLocaleDateString("en-US", {
                                            month: "short",
                                            day: "numeric",
                                        })
                                    }}
                                    indicator="dot"
                                />
                            }
                        />
                        <Area
                            yAxisId="right"
                            dataKey="orders"
                            type="monotone"
                            fill="url(#fillOrders)"
                            stroke="var(--color-orders)"
                            stackId="a"
                        />
                        <Area
                            yAxisId="left"
                            dataKey="volume"
                            type="monotone"
                            fill="url(#fillVolume)"
                            stroke="var(--color-volume)"
                            stackId="a"
                        />
                        <ChartLegend content={<ChartLegendContent />} />
                    </AreaChart>
                </ChartContainer>
            </CardContent>
        </Card>
    )
}
