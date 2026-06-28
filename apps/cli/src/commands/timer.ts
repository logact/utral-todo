import { type Command } from "commander";
import { api, handleResponse } from "../client.js";
import { out } from "../output.js";

interface Pluse {
  id: string;
  name: string;
  description: string;
  intervals: number[];
  repeatCount: number;
  autoAdvance: boolean;
  timerStatus: 'idle' | 'running' | 'paused';
  currentIntervalIndex: number;
  startedAt: string | null;
  accumulatedSeconds: number;
  createdAt: string;
}

export function registerTimerCommand(program: Command) {
  const timer = program.command("timer").description("manage pluse timers");

  timer
    .command("active")
    .description("get active pluse timer")
    .action(async () => {
      const res = await api.get<Pluse>("/api/pluse-timers/active");
      const data = handleResponse(res);
      if (data) out({ success: true, timer: data });
    });

  timer
    .command("start")
    .description("start a pluse timer")
    .argument("<id>", "pluse ID")
    .action(async (id: string) => {
      const res = await api.post<Pluse>(`/api/pluse-timers/${id}/start`);
      const data = handleResponse(res);
      if (data) out({ success: true, timer: data });
    });

  timer
    .command("pause")
    .description("pause a pluse timer")
    .argument("<id>", "pluse ID")
    .option("--accumulated <seconds>", "accumulated seconds", "0")
    .option("--index <n>", "current interval index", "0")
    .action(async (id: string, opts) => {
      const body: Record<string, unknown> = {
        accumulatedSeconds: parseInt(opts.accumulated, 10),
        currentIntervalIndex: parseInt(opts.index, 10),
      };
      const res = await api.post<Pluse>(`/api/pluse-timers/${id}/pause`, body);
      const data = handleResponse(res);
      if (data) out({ success: true, timer: data });
    });

  timer
    .command("resume")
    .description("resume a pluse timer")
    .argument("<id>", "pluse ID")
    .action(async (id: string) => {
      const res = await api.post<Pluse>(`/api/pluse-timers/${id}/resume`);
      const data = handleResponse(res);
      if (data) out({ success: true, timer: data });
    });

  timer
    .command("stop")
    .description("stop a pluse timer")
    .argument("<id>", "pluse ID")
    .action(async (id: string) => {
      const res = await api.post(`/api/pluse-timers/${id}/stop`);
      if (res.success) {
        out({ success: true, stopped: id });
      } else {
        handleResponse(res);
      }
    });

  timer
    .command("advance")
    .description("advance to next interval")
    .argument("<id>", "pluse ID")
    .option("--index <n>", "next interval index", "0")
    .action(async (id: string, opts) => {
      const body: Record<string, unknown> = {
        currentIntervalIndex: parseInt(opts.index, 10),
      };
      const res = await api.post<Pluse>(`/api/pluse-timers/${id}/advance`, body);
      const data = handleResponse(res);
      if (data) out({ success: true, timer: data });
    });
}
