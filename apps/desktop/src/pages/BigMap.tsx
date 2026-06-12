import { useSearchParams, useNavigate } from 'react-router-dom';
import { RoadToGoalGraph } from '../components/RoadToGoalGraph';

export function BigMap() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const center = searchParams.get('center') ?? undefined;

  return (
    <RoadToGoalGraph
      scope={center ? 'neighborhood' : 'global'}
      focusTodoId={center}
      layersAround={3}
      mode="page"
      title="Road to Goal"
      onNodeClick={
        center
          ? (id) => navigate(`/todo/${id}`)
          : (id) => navigate(`/map?center=${id}`)
      }
    />
  );
}
