import { type Command } from "commander";
import { api, handleResponse } from "../client.js";
import { out } from "../output.js";

interface TimerSession {
  id: string;
  type: string;
  name: string;
  pluseId: string | null;
  todoId: string | null;
  intervals: number[] | null;
  repeatCount: number;
  startedAt: string;
  pausedAt: string | null;
  completedAt: string | null;
  currentIndex: number;
  elapsedSeconds: number;
  status: string;
  createdAt: string;
}

export function registerTimerCommand(program: Command) {
  const timer = program.command("timer").description("manage timer sessions");

  timer
    .command("list")
    .description("list timer sessions")
    .option("--status <s>", "filter by status")
    .option("--type <t>", "filter by type")
    .action(async (opts) => {
      let path = "/api/timer-sessions";
      const params = new URLSearchParams();
      if (opts.status) params.append("status", opts.status);
      if (opts.type) params.append("type", opts.type);
      if (params.toString()) path += `?${params.toString()}`;

      const res = await api.get<TimerSession[]>(path);
      const data = handleResponse(res);
      if (data) out({ success: true, count: data.length, sessions: data });
    });

  timer
    .command("get")
    .description("get a timer session by ID")
    .argument("<id>", "session ID")
    .action(async (id: string) => {
      const res = await api.get<TimerSession>(`/api/timer-sessions/${id}`);
      const data = handleResponse(res);
      if (data) out({ success: true, session: data });
    });

  timer
    .command("create")
    .description("create a timer session")
    .option("--type <t>", "timer type", "default")
    .option("--name <name>", "session name", "Timer Session")
    .option("--pluse <id>", "pluse ID")
    .option("--todo <id>", "todo ID")
    .option("--intervals <seconds>", "comma-separated intervals")
    .option("--repeat <count>", "repeat count", "1")
    .option("--status <s>", "status", "running")
    .action(async (opts) => {
      const body: Record<string, unknown> = {
        type: opts.type,
        name: opts.name,
        status: opts.status,
        repeatCount: parseInt(opts.repeat, 10),
      };
      if (opts.pluse) body.pluseId = opts.pluse;
      if (opts.todo) body.todoId = opts.todo;
      if (opts.intervals) body.intervals = opts.intervals.split(",").map((s: string) => parseInt(s.trim(), 10));

      const res = await api.post<TimerSession>("/api/timer-sessions", body);
      const data = handleResponse(res);
      if (data) out({ success: true, session: data });
    });

  timer
    .command("update")
    .description("update a timer session")
    .argument("<id>", "session ID")
    .option("--name <name>", "new name")
    .option("--status <s>", "new status")
    .option("--elapsed <seconds>", "elapsed seconds")
    .option("--current-index <n>", "current interval index")
    .action(async (id: string, opts) => {
      const body: Record<string, unknown> = {};
      if (opts.name !== undefined) body.name = opts.name;
      if (opts.status !== undefined) body.status = opts.status;
      if (opts.elapsed !== undefined) body.elapsedSeconds = parseInt(opts.elapsed, 10);
      if (opts.currentIndex !== undefined) body.currentIndex = parseInt(opts.currentIndex, 10);

      const res = await api.patch<TimerSession>(`/api/timer-sessions/${id}`, body);
      const data = handleResponse(res);
      if (data) out({ success: true, session: data });
    });

  timer
    .command("delete")
    .description("delete a timer session")
    .argument("<id>", "session ID")
    .action(async (id: string) => {
      const res = await api.delete(`/api/timer-sessions/${id}`);
      if (res.success) {
        out({ success: true, deleted: id });
      } else {
        handleResponse(res);
      }
    });
}
