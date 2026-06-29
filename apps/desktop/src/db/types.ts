import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type {
  todos,
  todoRelations,
  todoLogs,
  actionEdges,
  plans,
  pluses,
  timerSessions,
  repeatOccurrences,
} from './schema';

export type TodoInsert = InferInsertModel<typeof todos>;
export type TodoSelect = InferSelectModel<typeof todos>;

export type TodoRelationInsert = InferInsertModel<typeof todoRelations>;
export type TodoRelationSelect = InferSelectModel<typeof todoRelations>;

export type TodoLogInsert = InferInsertModel<typeof todoLogs>;
export type TodoLogSelect = InferSelectModel<typeof todoLogs>;

export type ActionEdgeInsert = InferInsertModel<typeof actionEdges>;
export type ActionEdgeSelect = InferSelectModel<typeof actionEdges>;

export type PlanInsert = InferInsertModel<typeof plans>;
export type PlanSelect = InferSelectModel<typeof plans>;

export type PluseInsert = InferInsertModel<typeof pluses>;
export type PluseSelect = InferSelectModel<typeof pluses>;

export type TimerSessionInsert = InferInsertModel<typeof timerSessions>;
export type TimerSessionSelect = InferSelectModel<typeof timerSessions>;

export type RepeatOccurrenceInsert = InferInsertModel<typeof repeatOccurrences>;
export type RepeatOccurrenceSelect = InferSelectModel<typeof repeatOccurrences>;
