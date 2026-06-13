import type { RoadRelationType } from '../components/BigMapConstants';
import type { Todo } from '../types';

export function allowedLinkTypes(fromTodo: Todo, toTodo: Todo): RoadRelationType[] {
  if (fromTodo.nodeType === 'task' && toTodo.nodeType === 'goal') return ['achieves'];
  if (fromTodo.nodeType === 'goal' && toTodo.nodeType === 'goal') return ['parent_of', 'ordered_before'];
  if (fromTodo.nodeType === 'task' && toTodo.nodeType === 'task') {
    return ['ordered_before', 'depends_on', 'blocked_by', 'assign_from'];
  }
  return [];
}

export function inferRelationBetween(
  source: Todo,
  target: Todo
): { fromId: string; toId: string; type: RoadRelationType } | null {
  const forwardTypes = allowedLinkTypes(source, target);
  if (forwardTypes.length > 0) {
    return { fromId: source.id, toId: target.id, type: forwardTypes[0] };
  }
  const backwardTypes = allowedLinkTypes(target, source);
  if (backwardTypes.length > 0) {
    return { fromId: target.id, toId: source.id, type: backwardTypes[0] };
  }
  return null;
}
