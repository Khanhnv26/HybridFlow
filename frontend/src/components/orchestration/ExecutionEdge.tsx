import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';

export function ExecutionEdge(props: EdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath(props);
  const visual = props.data as { state?: string; reverse?: boolean; recentlyCompleted?: boolean } | undefined;
  const moving = visual?.state === 'running' || visual?.recentlyCompleted;
  return <g className={`workflow-edge workflow-edge--${visual?.state || 'idle'}${visual?.recentlyCompleted ? ' workflow-edge--recent' : ''}`}>
    {moving && <path d={path} className="workflow-edge-halo" fill="none" pointerEvents="none" />}
    <BaseEdge path={path} markerEnd={props.markerEnd} style={props.style} interactionWidth={props.interactionWidth}
      label={props.label} labelX={labelX} labelY={labelY} labelStyle={{ fill: 'var(--warning)', fontSize: 11 }} labelBgStyle={{ fill: 'var(--elevated-color)' }} />
    {moving && <>
      <path d={path} pathLength={100} fill="none" pointerEvents="none"
        className={`workflow-edge-stream${visual?.reverse ? ' workflow-edge-stream--reverse' : ''}`} />
      {[0, -0.6, -1.2].map((begin) => <g key={begin} className="workflow-edge-particle" pointerEvents="none">
        <circle r="10" className="workflow-edge-particle-halo" />
        <circle r="5" className="workflow-edge-particle-core" />
        <animateMotion path={path} begin={`${begin}s`} dur="1.8s" repeatCount="indefinite"
          keyPoints={visual?.reverse ? '1;0' : '0;1'} keyTimes="0;1" calcMode="linear" />
      </g>)}
    </>}
  </g>;
}
