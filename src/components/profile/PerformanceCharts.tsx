import { useMemo } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  RadialLinearScale,
  Tooltip,
  type ChartOptions,
  type TooltipItem,
} from "chart.js";
import { Bar, Line, Radar } from "react-chartjs-2";
import type { DebatePerformance, PerformanceGroup } from "@/features/debates/debateResults";

ChartJS.register(
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
  Legend,
);

// Match the site's typography and palette (see :root in styles.css).
ChartJS.defaults.font.family = '"Avenir Next", "Segoe UI", sans-serif';
ChartJS.defaults.color = "#6c635d";

const colors = {
  sage: "rgb(118, 128, 107)",
  sageFill: "rgba(118, 128, 107, 0.16)",
  sageBar: "rgba(118, 128, 107, 0.78)",
  terracottaBar: "rgba(234, 121, 103, 0.72)",
  clay: "rgb(210, 143, 107)",
  neutralBar: "rgba(53, 47, 42, 0.18)",
  grid: "rgba(53, 47, 42, 0.07)",
  tooltip: "rgba(53, 47, 42, 0.94)",
  white: "#fffdf8",
};

const percent = (value: string | number) => `${value}%`;

const tooltip = {
  backgroundColor: colors.tooltip,
  padding: 10,
  cornerRadius: 10,
  boxPadding: 4,
  usePointStyle: true,
};

const legend = {
  position: "bottom" as const,
  labels: { usePointStyle: true, pointStyle: "rectRounded" as const, padding: 16, boxHeight: 8 },
};

const recordLabel = (group: PerformanceGroup) =>
  `${group.wins}–${group.losses}${group.ties ? `–${group.ties}` : ""} (W–L${group.ties ? "–T" : ""})`;

interface PerformanceChartsProps {
  performance: DebatePerformance;
}

/**
 * Profile performance charts built from async debate results: win rate over
 * time, the monthly record, and strengths by side and format.
 */
export const PerformanceCharts = ({ performance }: PerformanceChartsProps) => {
  const months = performance.overTime;
  const hasResults = performance.results.length > 0;

  const winRateData = useMemo(() => ({
    labels: months.map((month) => month.label),
    datasets: [
      {
        label: "Win rate",
        data: months.map((month) => month.winRate),
        borderColor: colors.sage,
        backgroundColor: colors.sageFill,
        pointBackgroundColor: colors.white,
        pointBorderColor: colors.sage,
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2.5,
        cubicInterpolationMode: "monotone" as const,
        clip: 8,
        fill: true,
        spanGaps: true,
      },
      {
        label: "Avg. vote share",
        data: months.map((month) => month.voteShare),
        borderColor: colors.clay,
        backgroundColor: colors.clay,
        pointBackgroundColor: colors.white,
        pointBorderColor: colors.clay,
        pointBorderWidth: 2,
        pointRadius: 3,
        borderWidth: 2,
        borderDash: [6, 4],
        cubicInterpolationMode: "monotone" as const,
        clip: 8,
        fill: false,
        spanGaps: true,
      },
    ],
  }), [months]);

  const winRateOptions = useMemo<ChartOptions<"line">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    // Room for points sitting at 0% or 100%.
    layout: { padding: { top: 8, bottom: 2 } },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend,
      tooltip: {
        ...tooltip,
        callbacks: {
          label: (item: TooltipItem<"line">) =>
            item.parsed.y === null ? `${item.dataset.label}: no decided debates` : `${item.dataset.label}: ${item.parsed.y}%`,
          afterBody: (items: TooltipItem<"line">[]) => {
            const month = months[items[0]?.dataIndex ?? -1];
            return month ? `Record ${recordLabel(month)}` : "";
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        min: 0,
        max: 100,
        ticks: { stepSize: 25, callback: percent },
        grid: { color: colors.grid },
        border: { display: false },
      },
    },
  }), [months]);

  const hasTies = months.some((month) => month.ties > 0);
  const recordData = useMemo(() => ({
    labels: months.map((month) => month.label),
    datasets: [
      { label: "Wins", data: months.map((month) => month.wins), backgroundColor: colors.sageBar },
      { label: "Losses", data: months.map((month) => month.losses), backgroundColor: colors.terracottaBar },
      ...(hasTies ? [{ label: "Ties", data: months.map((month) => month.ties), backgroundColor: colors.neutralBar }] : []),
    ].map((dataset) => ({ ...dataset, borderRadius: 6, maxBarThickness: 38, categoryPercentage: 0.6 })),
  }), [hasTies, months]);

  const recordOptions = useMemo<ChartOptions<"bar">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend, tooltip },
    scales: {
      x: { stacked: true, grid: { display: false } },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: { precision: 0 },
        grid: { color: colors.grid },
        border: { display: false },
      },
    },
  }), []);

  // Strengths and weaknesses: vote share by side and by format.
  const strengths = useMemo(
    () => [
      ...performance.bySide.map((group) => ({ ...group, label: `As ${group.label}` })),
      ...performance.byFormat,
    ].filter((group): group is PerformanceGroup & { voteShare: number } => group.voteShare !== null),
    [performance.byFormat, performance.bySide],
  );
  const strongest = strengths.reduce<(typeof strengths)[number] | null>(
    (best, group) => (!best || group.voteShare > best.voteShare ? group : best), null);
  const weakest = strengths.reduce<(typeof strengths)[number] | null>(
    (worst, group) => (!worst || group.voteShare < worst.voteShare ? group : worst), null);
  const useRadar = strengths.length >= 3;

  const strengthsData = useMemo(() => ({
    labels: strengths.map((group) => group.label),
    datasets: [{
      label: "Avg. vote share",
      data: strengths.map((group) => group.voteShare),
      borderColor: colors.sage,
      backgroundColor: useRadar ? colors.sageFill : colors.sageBar,
      pointBackgroundColor: colors.white,
      pointBorderColor: colors.sage,
      pointBorderWidth: 2,
      pointRadius: 4,
      borderWidth: useRadar ? 2 : 0,
      borderRadius: 6,
      maxBarThickness: 30,
    }],
  }), [strengths, useRadar]);

  // Shared by the radar and its bar fallback, so only the common fields are used.
  const strengthTooltip = {
    ...tooltip,
    callbacks: {
      label: (item: Pick<TooltipItem<"bar">, "raw" | "dataIndex">) => `Avg. vote share: ${item.raw}%`,
      afterLabel: (item: Pick<TooltipItem<"bar">, "raw" | "dataIndex">) => {
        const group = strengths[item.dataIndex];
        return group ? `Record ${recordLabel(group)}` : "";
      },
    },
  };

  const radarOptions: ChartOptions<"radar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: strengthTooltip },
    scales: {
      r: {
        min: 0,
        max: 100,
        ticks: { stepSize: 25, callback: percent, showLabelBackdrop: false, font: { size: 10 } },
        grid: { color: colors.grid },
        angleLines: { color: colors.grid },
        pointLabels: { font: { size: 12, weight: 600 }, color: "#352f2a" },
      },
    },
  };

  const strengthsBarOptions: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y",
    plugins: { legend: { display: false }, tooltip: strengthTooltip },
    scales: {
      x: { min: 0, max: 100, ticks: { stepSize: 25, callback: percent }, grid: { color: colors.grid }, border: { display: false } },
      y: { grid: { display: false } },
    },
  };

  const emptyState = (title: string, copy: string) => (
    <div className="empty-state chart-empty-state">
      <h3 className="card-title">{title}</h3>
      <p className="card-copy">{copy}</p>
    </div>
  );

  return (
    <section className="settings-grid profile-performance-charts">
      <article className="app-card profile-chart-card is-wide">
        <div className="profile-chart-heading">
          <h2 className="card-title">Win rate by month</h2>
          <p className="meta-line">Share of decided debates won each month, with your average share of community votes.</p>
        </div>
        {hasResults ? (
          <div className="profile-chart-canvas">
            <Line data={winRateData} options={winRateOptions} aria-label="Line chart of win rate by month" role="img" />
          </div>
        ) : emptyState("No results yet", "Your win rate appears here once completed debates receive community votes.")}
      </article>

      <article className="app-card profile-chart-card">
        <div className="profile-chart-heading">
          <h2 className="card-title">Results by month</h2>
          <p className="meta-line">Wins and losses from completed debates.</p>
        </div>
        {hasResults ? (
          <div className="profile-chart-canvas">
            <Bar data={recordData} options={recordOptions} aria-label="Bar chart of wins and losses by month" role="img" />
          </div>
        ) : emptyState("No results yet", "Wins and losses appear here once completed debates receive community votes.")}
      </article>

      <article className="app-card profile-chart-card">
        <div className="profile-chart-heading">
          <h2 className="card-title">Strengths</h2>
          <p className="meta-line">Average share of community votes by side and format.</p>
        </div>
        {strengths.length ? (
          <>
            <div className="profile-chart-canvas">
              {useRadar ? (
                <Radar data={strengthsData} options={radarOptions} aria-label="Radar chart of vote share by side and format" role="img" />
              ) : (
                <Bar data={strengthsData} options={strengthsBarOptions} aria-label="Bar chart of vote share by side and format" role="img" />
              )}
            </div>
            {strongest && weakest && strongest !== weakest ? (
              <p className="profile-chart-summary">
                <span>Strongest: <strong>{strongest.label}</strong> ({strongest.voteShare}%)</span>
                <span>Room to grow: <strong>{weakest.label}</strong> ({weakest.voteShare}%)</span>
              </p>
            ) : null}
          </>
        ) : emptyState("No votes yet", "Strengths by side and format appear here once spectators vote on your debates.")}
      </article>
    </section>
  );
};
