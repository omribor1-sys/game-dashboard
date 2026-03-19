export default function MetricCard({ label, value, sub, color, icon }) {
  return (
    <div className="metric-card">
      <div className="label">{label}</div>
      <div className={`value ${color || ''}`}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
