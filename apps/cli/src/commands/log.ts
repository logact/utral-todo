import { type Command } from "commander";
import { api, handleResponse } from "../client.js";
import { out } from "../output.js";

interface TodoLog {
  id: string;
  todoId: string;
  type: string;
  content: string;
  minutesSpent: number | null;
  metadata: unknown | null;
  createdAt: string;
}

export function registerLogCommand(program: Command) {
  const log = program.command("log").description("manage todo logs");

  log
    .command("list")
    .description("list todo logs")
    .option("--todo <id>", "filter by todo ID")
    .action(async (opts) => {
      let path = "/api/todo-logs";
      if (opts.todo) path += `?todoId=${opts.todo}`;
      const res = await api.get<TodoLog[]>(path);
      const data = handleResponse(res);
      if (data) out({ success: true, count: data.length, logs: data });
    });

  log
    .command("create")
    .description("create a log entry")
    .requiredOption("--todo <id>", "todo ID")
    .requiredOption("--type <type>", "log type")
    .option("--content <text>", "log content")
    .option("--minutes <m>", "minutes spent")
    .option("--metadata <json>", "metadata JSON")
    .action(async (opts) => {
      const body: Record<string, unknown> = {
        todoId: opts.todo,
        type: opts.type,
        content: opts.content ?? "",
      };
      if (opts.minutes !== undefined) body.minutesSpent = parseInt(opts.minutes, 10);
      if (opts.metadata !== undefined) body.metadata = JSON.parse(opts.metadata);

      const res = await api.post<TodoLog>("/api/todo-logs", body);
      const data = handleResponse(res);
      if (data) out({ success: true, log: data });
    });

  log
    .command("delete")
    .description("delete a log entry")
    .argument("<id>", "log ID")
    .action(async (id: string) => {
      const res = await api.delete(`/api/todo-logs/${id}`);
      if (res.success) {
        out({ success: true, deleted: id });
      } else {
        handleResponse(res);
      }
    });
}
