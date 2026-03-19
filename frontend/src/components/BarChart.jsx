import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function BarChart({ title, labels, datasets, horizontal = false, height = 280 }) {
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    plugins: {
      legend: { display: datasets.length > 1, position: 'top' },
      title: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const val = ctx.parsed[horizontal ? 'x' : 'y'];
            return ` €${val?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: '#718096' },
      },
      y: {
        grid: { color: '#f1f5f9' },
        ticks: {
          font: { size: 11 }, color: '#718096',
          callback: (v) => `€${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
        },
      },
    },
  };

  if (horizontal) {
    delete options.scales.y.ticks.callback;
    options.scales.x.ticks.callback = (v) =>
      `€${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }

  const data = { labels, datasets };

  return (
    <div className="chart-wrap">
      {title && <div className="chart-title">{title}</div>}
      <div style={{ height }}>
        <Bar data={data} options={options} />
      </div>
    </div>
  );
}
