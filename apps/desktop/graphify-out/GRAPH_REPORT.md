# Graph Report - desktop  (2026-06-16)

## Corpus Check
- 72 files · ~78,491 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 644 nodes · 1389 edges · 34 communities (29 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fd96551b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]

## God Nodes (most connected - your core abstractions)
1. `main()` - 51 edges
2. `callCli()` - 47 edges
3. `onLocalChange()` - 43 edges
4. `printOutput()` - 38 edges
5. `db` - 19 edges
6. `compilerOptions` - 17 edges
7. `formatDuration()` - 16 edges
8. `compilerOptions` - 16 edges
9. `useDbChangeRefresh()` - 13 edges
10. `createTodo()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `TreeNodeItem()` --calls--> `formatDuration()`  [EXTRACTED]
  src/components/TodoTree.tsx → src/utils/date.ts
- `deleteOccurrence()` --calls--> `onLocalChange()`  [EXTRACTED]
  src/db/repeatOccurrences.ts → src/db/syncEngine.ts
- `QuickTodoModal()` --calls--> `formatDate()`  [EXTRACTED]
  src/components/QuickTodoModal.tsx → src/utils/date.ts
- `RoadToGoalGraph()` --calls--> `useBigMapViewport()`  [EXTRACTED]
  src/components/RoadToGoalGraph.tsx → src/hooks/useBigMapViewport.ts
- `LogEntry()` --calls--> `formatDuration()`  [EXTRACTED]
  src/components/UnifiedLogSection.tsx → src/utils/date.ts

## Import Cycles
- None detected.

## Communities (34 total, 5 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.12
Nodes (56): actionEdgesForTodo(), bulkReorderTodos(), callCli(), CliResponse, createActionEdge(), createPluse(), createRelation(), createTimerSession() (+48 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (37): QuickTodoModalProps, useScheduleTodos(), DayDetailPanel, MONTH_NAMES, Schedule(), TimeEditor(), TodoItemRow, VIEW_LABELS (+29 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (48): dependencies, clsx, dexie, dexie-react-hooks, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, lucide-react (+40 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (34): BigMapCanvas(), BigMapCanvasProps, GraphNode, GraphNodeProps, EDGE_COLORS, EDGE_DASH, EDGE_ICONS, EDGE_LABELS (+26 more)

### Community 4 - "Community 4"
Cohesion: 0.10
Nodes (40): useTheme(), parseActionEdge(), parseDate(), parseLog(), parsePlan(), parsePluse(), parseRelation(), parseRepeatRule() (+32 more)

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (28): Theme, ThemeContext, ThemeContextType, ThemeProvider(), getBridge(), initIOSSync(), isIOSShell(), NativeBridge (+20 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (22): TodoTreeProps, TreeNodeItem(), TreeNodeProps, createTask(), createTodo(), deleteTodo(), getInProgressTodos(), getOverdueTodos() (+14 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (21): fmt(), PulseEKG(), PulseEKGProps, getPluse(), browserNotificationTimers, calcTotalMinutes(), calcTotalSeconds(), cancelAllBrowserNotifications() (+13 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (13): createTimerSession(), deleteTimerSession(), getTimerSessions(), updateTimerSession(), useTodayData(), DisplayItem, getAccent(), goalStatusConfig (+5 more)

### Community 9 - "Community 9"
Cohesion: 0.15
Nodes (12): buildTree(), countLeaves(), CrossEdge, findRoot(), layoutTree(), TreeNode, ViewState, getAllRelations() (+4 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (9): GoalPath(), GoalPathProps, deleteAssignedInstances(), deleteRelationsInvolvingTodo(), getAssignedInstances(), getOrderedPredecessors(), getOrderedSuccessors(), getTasksForGoal() (+1 more)

### Community 11 - "Community 11"
Cohesion: 0.17
Nodes (14): createActionEdge(), deleteActionEdge(), getAllActionEdgesForTodo(), updateActionEdge(), addEdgeToPlan(), addNodeToPlan(), createPlan(), deletePlan() (+6 more)

### Community 12 - "Community 12"
Cohesion: 0.10
Nodes (19): debugApplicationIdSuffix, app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl (+11 more)

### Community 13 - "Community 13"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 14 - "Community 14"
Cohesion: 0.20
Nodes (14): QuickTodoModal(), groupLogsByDayAndSession(), isSameDay(), LogDayGroup, LogEntry(), LogSession, logTypeColor(), logTypeIcon() (+6 more)

### Community 15 - "Community 15"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+9 more)

### Community 16 - "Community 16"
Cohesion: 0.27
Nodes (14): RoadToGoalGraph(), TodoExecutionPanel(), createRelation(), deleteRelation(), getSpawnedTodos(), getTemplateForInstance(), updateRelation(), useTodoLogs() (+6 more)

### Community 17 - "Community 17"
Cohesion: 0.18
Nodes (11): createPluse(), deletePluse(), getAllPluses(), updatePluse(), calcIntervalCount(), calcTotalSeconds(), PluseCard(), PluseEditor() (+3 more)

### Community 18 - "Community 18"
Cohesion: 0.23
Nodes (13): AppHandle, Header, Option, ResponseMap, cli_respond(), CliRequestEvent, json_header(), run() (+5 more)

### Community 19 - "Community 19"
Cohesion: 0.19
Nodes (8): EMPTY_LAYOUT, RoadToGoalGraphProps, db, SyncQueueItem, SyncState, ensureRootGoal(), getRootGoal(), useBigMapViewport()

### Community 20 - "Community 20"
Cohesion: 0.21
Nodes (11): useTodos(), FilterTab, getDisplayStatus(), isDone(), isInProgress(), NodeTypeFilter, priorityConfig, SortableTodoRow() (+3 more)

### Community 21 - "Community 21"
Cohesion: 0.17
Nodes (8): GoalNode(), GoalNodeProps, GoalTreeProps, statusCycle, statusLabel(), getSubGoals(), traceGoalChain(), traceParentChain()

### Community 22 - "Community 22"
Cohesion: 0.36
Nodes (6): getRelationsForTodo(), useDbChangeRefresh(), useRelations(), useTodoRelations(), useTodaysTodos(), PluseList()

### Community 23 - "Community 23"
Cohesion: 0.36
Nodes (7): deleteOccurrence(), deleteOccurrencesForTemplate(), getOccurrence(), getOccurrencesForDateRange(), getOccurrencesForTemplate(), materializeInstance(), setOccurrenceStatus()

### Community 24 - "Community 24"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 25 - "Community 25"
Cohesion: 0.53
Nodes (3): createTodoLog(), deleteTodoLog(), getTodoLogs()

## Knowledge Gaps
- **163 isolated node(s):** `CliResponse`, `name`, `private`, `version`, `type` (+158 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `onLocalChange()` connect `Community 11` to `Community 4`, `Community 6`, `Community 8`, `Community 9`, `Community 10`, `Community 16`, `Community 17`, `Community 23`, `Community 25`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `db` connect `Community 19` to `Community 4`, `Community 5`, `Community 6`, `Community 8`, `Community 10`, `Community 11`, `Community 16`, `Community 17`, `Community 23`, `Community 25`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `formatDuration()` connect `Community 16` to `Community 1`, `Community 3`, `Community 6`, `Community 8`, `Community 10`, `Community 14`, `Community 20`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `CliResponse`, `name`, `private` to the rest of the system?**
  _163 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.11554748941318814 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08078231292517007 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.04081632653061224 - nodes in this community are weakly interconnected._