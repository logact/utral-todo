import { type Command } from "commander";
import { api, handleResponse } from "../client.js";
import { out } from "../output.js";

export function registerSyncCommand(program: Command) {
  const sync = program.command("sync").description("sync operations");

  sync
    .command("sync-repeats")
    .description("sync repeat templates for a date range")
    .requiredOption("--start <date>", "start date (ISO)")
    .requiredOption("--end <date>", "end date (ISO)")
    .action(async (opts) => {
      const body = { startDate: opts.start, endDate: opts.end };
      const res = await api.post<{ createdCount: number }>("/api/todos/sync-repeats", body);
      const data = handleResponse(res);
      if (data) out({ success: true, result: data });
    });
}
