import { useMemo } from 'react';

interface PulseEKGProps {
  intervals: number[];
  currentIndex: number;
  elapsedSeconds: number;
  isRunning: boolean;
  height?: number;
}

export function PulseEKG({
  intervals,
  currentIndex,
  elapsedSeconds,
  isRunning,
  height = 140,
}: PulseEKGProps) {
  const svgWidth = 1000;
  const paddingLeft = 50;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 36;

  const contentWidth = svgWidth - paddingLeft - paddingRight;
  const contentHeight = height - paddingTop - paddingBottom;

  const yHigh = paddingTop + contentHeight * 0.25;
  const yLow = paddingTop + contentHeight * 0.75;
  const yMid = (yHigh + yLow) / 2;

  const totalDuration = intervals.reduce((s, d) => s + d, 0);

  const segments = useMemo(() => {
    let cumul = 0;
    return intervals.map((duration, i) => {
      const startX = paddingLeft + (cumul / totalDuration) * contentWidth;
      cumul += duration;
      const endX = paddingLeft + (cumul / totalDuration) * contentWidth;
      const y = i % 2 === 0 ? yHigh : yLow;
      return { duration, startX, endX, y, index: i };
    });
  }, [intervals, totalDuration, contentWidth, yHigh, yLow]);

  // Current position
  const currentSegment = segments[currentIndex];
  const isCompleted = currentIndex >= intervals.length;
  const currentDurationSeconds = currentSegment
    ? currentSegment.duration * 60
    : 0;
  const progressInInterval = currentDurationSeconds
    ? Math.min(1, elapsedSeconds / currentDurationSeconds)
    : 0;

  const currentX = currentSegment
    ? currentSegment.startX +
      (currentSegment.endX - currentSegment.startX) * progressInInterval
    : paddingLeft + contentWidth;
  const currentY = currentSegment ? currentSegment.y : yMid;

  // Build the live path: only completed + current (no future preview)
  const livePathParts: string[] = [];
  let flatlinePath = '';

  for (let i = 0; i <= currentIndex && i < segments.length; i++) {
    const seg = segments[i];

    if (i < currentIndex) {
      // Fully completed interval
      if (livePathParts.length === 0) {
        livePathParts.push(`M ${seg.startX} ${seg.y}`);
      } else {
        const prev = segments[i - 1];
        livePathParts.push(`L ${seg.startX} ${prev.y}`);
        livePathParts.push(`L ${seg.startX} ${seg.y}`);
      }
      livePathParts.push(`L ${seg.endX} ${seg.y}`);
    } else {
      // Current interval - partial progress
      if (livePathParts.length === 0 && currentIndex > 0) {
        const prev = segments[i - 1];
        livePathParts.push(`M ${seg.startX} ${prev.y}`);
        livePathParts.push(`L ${seg.startX} ${seg.y}`);
      } else if (livePathParts.length === 0) {
        livePathParts.push(`M ${seg.startX} ${seg.y}`);
      }
      livePathParts.push(`L ${currentX} ${seg.y}`);
    }
  }

  // Flatline when paused or completed
  if (!isRunning && !isCompleted && currentSegment) {
    flatlinePath = `M ${currentX} ${currentY} L ${paddingLeft + contentWidth} ${currentY}`;
  }
  if (isCompleted) {
    flatlinePath = `M ${currentX} ${yMid} L ${paddingLeft + contentWidth} ${yMid}`;
  }

  // Ghost preview path - extremely faint outline of the full waveform
  // This gives context without making it feel static
  const ghostPathParts: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (ghostPathParts.length === 0) {
      ghostPathParts.push(`M ${seg.startX} ${seg.y}`);
    } else {
      const prev = segments[i - 1];
      ghostPathParts.push(`L ${seg.startX} ${prev.y}`);
      ghostPathParts.push(`L ${seg.startX} ${seg.y}`);
    }
    ghostPathParts.push(`L ${seg.endX} ${seg.y}`);
  }

  // Interval labels (only show if not too crowded)
  const showLabels = segments.length <= 14;

  return (
    <div className="w-full select-none">
      <svg
        viewBox={`0 0 ${svgWidth} ${height}`}
        className="w-full"
        style={{ height: `${height}px` }}
        preserveAspectRatio="none"
      >
        <defs>
          {/* Glow filter for the active line */}
          <filter id="pulseGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Gradient for the live path - fades from bright at head to dim at tail */}
          <linearGradient id="liveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
            <stop offset="70%" stopColor="currentColor" stopOpacity={0.8} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={1} />
          </linearGradient>
        </defs>

        {/* Background baseline */}
        <line
          x1={paddingLeft}
          y1={yMid}
          x2={paddingLeft + contentWidth}
          y2={yMid}
          stroke="currentColor"
          className="text-slate-100 dark:text-slate-800"
          strokeWidth={1}
          strokeDasharray="4,4"
        />

        {/* Y-axis labels */}
        <text
          x={paddingLeft - 8}
          y={yHigh + 3}
          textAnchor="end"
          fontSize="10"
          className="fill-slate-400 dark:fill-slate-500"
        >
          ON
        </text>
        <text
          x={paddingLeft - 8}
          y={yLow + 3}
          textAnchor="end"
          fontSize="10"
          className="fill-slate-400 dark:fill-slate-500"
        >
          OFF
        </text>

        {/* Ghost preview - extremely faint full waveform outline */}
        {ghostPathParts.length > 0 && (
          <path
            d={ghostPathParts.join(' ')}
            fill="none"
            stroke="currentColor"
            className="text-slate-200 dark:text-slate-800"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.35}
          />
        )}

        {/* Flatline (paused or completed) */}
        {flatlinePath && (
          <>
            <path
              d={flatlinePath}
              fill="none"
              stroke="currentColor"
              className={isCompleted ? 'text-slate-300 dark:text-slate-600' : 'text-amber-400 dark:text-amber-600'}
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={isCompleted ? undefined : '6,4'}
            />
            {!isCompleted && (
              <circle
                cx={currentX}
                cy={currentY}
                r={4}
                className="fill-amber-400 dark:fill-amber-500"
              >
                <animate
                  attributeName="r"
                  values="4;7;4"
                  dur="1.5s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="1;0.3;1"
                  dur="1.5s"
                  repeatCount="indefinite"
                />
              </circle>
            )}
          </>
        )}

        {/* Live path - grows as time passes */}
        {livePathParts.length > 0 && (
          <path
            d={livePathParts.join(' ')}
            fill="none"
            stroke="currentColor"
            className="text-indigo-500"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#softGlow)"
          />
        )}

        {/* Bright "spark" at the leading edge of the live path */}
        {isRunning && !isCompleted && livePathParts.length > 0 && (
          <>
            {/* Outer expanding ripple */}
            <circle
              cx={currentX}
              cy={currentY}
              r={6}
              fill="none"
              stroke="currentColor"
              className="text-indigo-400"
              strokeWidth={1.5}
            >
              <animate
                attributeName="r"
                values="6;28;6"
                dur="0.9s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.5;0;0.5"
                dur="0.9s"
                repeatCount="indefinite"
              />
            </circle>
            {/* Inner expanding ripple */}
            <circle
              cx={currentX}
              cy={currentY}
              r={5}
              fill="none"
              stroke="currentColor"
              className="text-indigo-300"
              strokeWidth={1}
            >
              <animate
                attributeName="r"
                values="5;20;5"
                dur="0.9s"
                begin="0.3s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.4;0;0.4"
                dur="0.9s"
                begin="0.3s"
                repeatCount="indefinite"
              />
            </circle>
            {/* Bright core dot */}
            <circle
              cx={currentX}
              cy={currentY}
              r={7}
              className="fill-indigo-500"
              opacity={0.2}
              filter="url(#pulseGlow)"
            >
              <animate
                attributeName="r"
                values="7;12;7"
                dur="0.6s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.2;0.05;0.2"
                dur="0.6s"
                repeatCount="indefinite"
              />
            </circle>
            <circle
              cx={currentX}
              cy={currentY}
              r={5}
              className="fill-indigo-400"
              filter="url(#pulseGlow)"
            >
              <animate
                attributeName="r"
                values="5;6.5;5"
                dur="0.6s"
                repeatCount="indefinite"
              />
            </circle>
            {/* White hot center */}
            <circle
              cx={currentX}
              cy={currentY}
              r={2.5}
              className="fill-white"
            />
          </>
        )}

        {/* Static dot when paused (not flatline) */}
        {!isRunning && !isCompleted && (
          <>
            <circle
              cx={currentX}
              cy={currentY}
              r={6}
              className="fill-indigo-500"
              opacity={0.3}
            />
            <circle
              cx={currentX}
              cy={currentY}
              r={3.5}
              className="fill-indigo-500"
            />
            <circle
              cx={currentX}
              cy={currentY}
              r={2}
              className="fill-white"
            />
          </>
        )}

        {/* Interval labels */}
        {showLabels &&
          segments.map((seg, i) => {
            const isActive = i === currentIndex;
            const isDone = i < currentIndex;
            const cx = (seg.startX + seg.endX) / 2;
            const labelY = height - 10;

            return (
              <g key={i}>
                {/* Vertical tick at interval boundary */}
                {i > 0 && (
                  <line
                    x1={seg.startX}
                    y1={height - 22}
                    x2={seg.startX}
                    y2={height - 16}
                    stroke="currentColor"
                    className="text-slate-200 dark:text-slate-700"
                    strokeWidth={1}
                  />
                )}
                <text
                  x={cx}
                  y={labelY}
                  textAnchor="middle"
                  fontSize={isActive ? '11' : '10'}
                  fontWeight={isActive ? '600' : '400'}
                  className={
                    isActive
                      ? 'fill-indigo-600 dark:fill-indigo-400'
                      : isDone
                        ? 'fill-slate-300 dark:fill-slate-600'
                        : 'fill-slate-400 dark:fill-slate-500'
                  }
                >
                  {seg.duration}m
                </text>
              </g>
            );
          })}

        {/* X-axis line */}
        <line
          x1={paddingLeft}
          y1={height - 24}
          x2={paddingLeft + contentWidth}
          y2={height - 24}
          stroke="currentColor"
          className="text-slate-200 dark:text-slate-700"
          strokeWidth={1}
        />

        {/* Start / End labels */}
        <text
          x={paddingLeft}
          y={height - 8}
          textAnchor="start"
          fontSize="9"
          className="fill-slate-300 dark:text-slate-600"
        >
          0m
        </text>
        <text
          x={paddingLeft + contentWidth}
          y={height - 8}
          textAnchor="end"
          fontSize="9"
          className="fill-slate-300 dark:text-slate-600"
        >
          {totalDuration}m
        </text>
      </svg>
    </div>
  );
}
