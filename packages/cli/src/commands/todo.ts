import { type Command } from "commander";
import { api, handleResponse } from "../client.js";
import { out, err } from "../output.js";

interface Todo {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  estimatedMinutes: number;
  tags: string[];
  projectId: string | null;
  parentId: string | null;
  dueDate: string | null;
  scheduledDate: string | null;
  scheduledEndDate: string | null;
  repeatRule: unknown;
  order: number;
  isGoal: boolean;
  createdAt: string;
  completedAt: string | null;
}

export function registerTodoCommand(program: Command) {
  const todo = program.command("todo").description("manage todos");

  todo
    .command("list")
    .description("list todos")
    .option("-p, --project <id>", "filter by project ID")
    .option("-P, --parent <id>", "filter by parent ID")
    .option("-r, --root", "show only root todos")
    .option("-d, --date <date>", "filter by scheduled date (YYYY-MM-DD)")
    .option("-t, --tag <tag>", "filter by tag")
    .option("--unscheduled", "show unscheduled todos")
    .option("--overdue", "show overdue todos")
    .option("--unassigned", "show unassigned todos")
    .option("--repeat-templates", "show repeat template todos")
    .action(async (opts) => {
      let path = "/api/todos";
      const params = new URLSearchParams();
      if (opts.project) params.append("projectId", opts.project);
      if (opts.parent) params.append("parentId", opts.parent);
      if (opts.root) params.append("root", "true");
      if (opts.date) params.append("date", opts.date);
      if (opts.tag) params.append("tag", opts.tag);
      if (opts.unscheduled) params.append("unscheduled", "true");
      if (opts.overdue) params.append("overdue", "true");
      if (opts.unassigned) params.append("unassigned", "true");
      if (opts.repeatTemplates) params.append("repeatTemplates", "true");
      if (params.toString()) path += `?${params.toString()}`;

      const res = await api.get<Todo[]>(path);
      const data = handleResponse(res);
      if (data) out({ success: true, count: data.length, todos: data });
    });

  todo
    .command("today")
    .description("list today's todos")
    .action(async () => {
      const res = await api.get<Todo[]>("/api/todos/today");
      const data = handleResponse(res);
      if (data) out({ success: true, count: data.length, todos: data });
    });

  todo
    .command("get")
    .description("get a todo by ID")
    .argument("<id>", "todo ID")
    .action(async (id: string) => {
      const res = await api.get<Todo>(`/api/todos/${id}`);
      const data = handleResponse(res);
      if (data) out({ success: true, todo: data });
    });

  todo
    .command("create")
    .description("create a new todo")
    .requiredOption("--title <title>", "todo title")
    .option("--description <text>", "description")
    .option("--priority <p>", "priority (low/medium/high)", "medium")
    .option("--estimated <minutes>", "estimated minutes", "60")
    .option("--tags <tags>", "comma-separated tags")
    .option("--project <id>", "project ID")
    .option("--parent <id>", "parent todo ID")
    .option("--due <date>", "due date (ISO)")
    .option("--scheduled <date>", "scheduled date (ISO)")
    .option("--scheduled-end <date>", "scheduled end date (ISO)")
    .option("--repeat-rule <rule>", "repeat rule JSON")
    .option("--is-goal", "mark as goal")
    .action(async (opts) => {
      const body: Record<string, unknown> = {
        title: opts.title,
        description: opts.description ?? "",
        priority: opts.priority,
        estimatedMinutes: parseInt(opts.estimated, 10),
        tags: opts.tags ? opts.tags.split(",").map((t: string) => t.trim()) : [],
        projectId: opts.project ?? null,
        parentId: opts.parent ?? null,
        dueDate: opts.due ?? null,
        scheduledDate: opts.scheduled ?? null,
        scheduledEndDate: opts.scheduledEnd ?? null,
        repeatRule: opts.repeatRule ? JSON.parse(opts.repeatRule) : null,
        isGoal: opts.isGoal === true,
      };
      const res = await api.post<Todo>("/api/todos", body);
      const data = handleResponse(res);
      if (data) out({ success: true, todo: data });
    });

  todo
    .command("update")
    .description("update a todo")
    .argument("<id>", "todo ID")
    .option("--title <title>", "new title")
    .option("--description <text>", "new description")
    .option("--priority <p>", "new priority")
    .option("--status <s>", "new status")
    .option("--estimated <minutes>", "new estimated minutes")
    .option("--tags <tags>", "comma-separated tags")
    .option("--project <id>", "new project ID")
    .option("--due <date>", "new due date")
    .option("--scheduled <date>", "new scheduled date")
    .option("--scheduled-end <date>", "new scheduled end date")
    .option("--is-goal", "mark as goal")
    .option("--no-is-goal", "unmark as goal")
    .action(async (id: string, opts) => {
      const body: Record<string, unknown> = {};
      if (opts.title !== undefined) body.title = opts.title;
      if (opts.description !== undefined) body.description = opts.description;
      if (opts.priority !== undefined) body.priority = opts.priority;
      if (opts.status !== undefined) body.status = opts.status;
      if (opts.estimated !== undefined) body.estimatedMinutes = parseInt(opts.estimated, 10);
      if (opts.tags !== undefined) body.tags = opts.tags.split(",").map((t: string) => t.trim());
      if (opts.project !== undefined) body.projectId = opts.project;
      if (opts.due !== undefined) body.dueDate = opts.due;
      if (opts.scheduled !== undefined) body.scheduledDate = opts.scheduled;
      if (opts.scheduledEnd !== undefined) body.scheduledEndDate = opts.scheduledEnd;
      if (opts.isGoal === true) body.isGoal = true;
      if (opts.isGoal === false) body.isGoal = false;

      const res = await api.patch<Todo>(`/api/todos/${id}`, body);
      const data = handleResponse(res);
      if (data) out({ success: true, todo: data });
    });

  todo
    .command("status")
    .description("update todo status")
    .argument("<id>", "todo ID")
    .argument("<status>", "new status (pending/in_progress/done)")
    .action(async (id: string, status: string) => {
      const res = await api.patch<Todo>(`/api/todos/${id}/status`, { status });
      const data = handleResponse(res);
      if (data) out({ success: true, todo: data });
    });

  todo
    .command("schedule")
    .description("schedule a todo")
    .argument("<id>", "todo ID")
    .argument("<date>", "scheduled date (ISO, or 'null' to unschedule)")
    .action(async (id: string, date: string) => {
      const scheduledDate = date === "null" ? null : date;
      const res = await api.patch<Todo>(`/api/todos/${id}/schedule`, { scheduledDate });
      const data = handleResponse(res);
      if (data) out({ success: true, todo: data });
    });

  todo
    .command("delete")
    .description("delete a todo")
    .argument("<id>", "todo ID")
    .action(async (id: string) => {
      const res = await api.delete(`/api/todos/${id}`);
      if (res.success) {
        out({ success: true, deleted: id });
      } else {
        handleResponse(res);
      }
    });

  todo
    .command("reorder")
    .description("reorder todos")
    .argument("<ids...>", "ordered list of todo IDs")
    .action(async (ids: string[]) => {
      const res = await api.post("/api/todos/reorder", { orderedIds: ids });
      const data = handleResponse(res);
      if (data) out({ success: true, result: data });
    });
}
