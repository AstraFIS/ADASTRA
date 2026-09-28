interface Item {
  label: string;
  color: string;
}

export default function ChartLegend({ items }: { items: Item[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-5 text-sm text-ink-2" aria-label="Legend">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-sm"
            style={{ background: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
