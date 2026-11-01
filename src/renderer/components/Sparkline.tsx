import { sparkline } from '../../shared/chart';

const WIDTH = 240;
const HEIGHT = 30;

interface SparklineProps {
  values: readonly number[];
  color: string;
  ceiling?: number;
}

export function Sparkline({ values, color, ceiling }: SparklineProps) {
  const { line, area, last } = sparkline(values, WIDTH, HEIGHT, ceiling);
  return (
    <svg className="spark" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2={WIDTH} y1={HEIGHT - 2} y2={HEIGHT - 2} stroke="#1c2030" />
      {line !== '' && (
        <>
          <polygon points={area} fill={color} fillOpacity=".12" />
          <polyline points={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {last !== null && <circle cx={last.x} cy={last.y} r="2.5" fill={color} />}
        </>
      )}
    </svg>
  );
}
