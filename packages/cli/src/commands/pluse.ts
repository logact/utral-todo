import { type Command } from "commander";
import { api, handleResponse } from "../client.js";
import { out } from "../output.js";

interface Pluse {
  id: string;
  name: string;
  description: string;
  intervals: number[];
  repeatCount: number;
  intervalTodos: unknown | null;
  autoAdvance: boolean;
  createdAt: string;
}

export function registerPluseCommand(program: Command) {
  const pluse = program.command("pluse").description("manage pluses");

  pluse
    .command("list")
    .description("list all pluses")
    .action(async () => {
      const res = await api.get<Pluse[]>("/api/pluses");
      const data = handleResponse(res);
      if (data) out({ success: true, count: data.length, pluses: data });
    });

  pluse
    .command("get")
    .description("get a pluse by ID")
    .argument("<id>", "pluse ID")
    .action(async (id: string) => {
      const res = await api.get<Pluse>(`/api/pluses/${id}`);
      const data = handleResponse(res);
      if (data) out({ success: true, pluse: data });
    });

  pluse
    .command("create")
    .description("create a new pluse")
    .requiredOption("--name <name>", "pluse name")
    .option("--description <text>", "description")
    .option("--intervals <seconds>", "comma-separated interval seconds", "1500")
    .option("--repeat <count>", "repeat count", "1")
    .option("--no-auto-advance", "disable auto-advance")
    .action(async (opts) => {
      const body = {
        name: opts.name,
        description: opts.description ?? "",
        intervals: opts.intervals.split(",").map((s: string) => parseInt(s.trim(), 10)),
        repeatCount: parseInt(opts.repeat, 10),
        autoAdvance: opts.autoAdvance !== false,
      };
      const res = await api.post<Pluse>("/api/pluses", body);
      const data = handleResponse(res);
      if (data) out({ success: true, pluse: data });
    });

  pluse
    .command("update")
    .description("update a pluse")
    .argument("<id>", "pluse ID")
    .option("--name <name>", "new name")
    .option("--description <text>", "new description")
    .option("--intervals <seconds>", "comma-separated interval seconds")
    .option("--repeat <count>", "repeat count")
    .option("--auto-advance", "enable auto-advance")
    .option("--no-auto-advance", "disable auto-advance")
    .action(async (id: string, opts) => {
      const body: Record<string, unknown> = {};
      if (opts.name !== undefined) body.name = opts.name;
      if (opts.description !== undefined) body.description = opts.description;
      if (opts.intervals !== undefined) body.intervals = opts.intervals.split(",").map((s: string) => parseInt(s.trim(), 10));
      if (opts.repeat !== undefined) body.repeatCount = parseInt(opts.repeat, 10);
      if (opts.autoAdvance === true) body.autoAdvance = true;
      if (opts.autoAdvance === false) body.autoAdvance = false;

      const res = await api.patch<Pluse>(`/api/pluses/${id}`, body);
      const data = handleResponse(res);
      if (data) out({ success: true, pluse: data });
    });

  pluse
    .command("delete")
    .description("delete a pluse")
    .argument("<id>", "pluse ID")
    .action(async (id: string) => {
      const res = await api.delete(`/api/pluses/${id}`);
      if (res.success) {
        out({ success: true, deleted: id });
      } else {
        handleResponse(res);
      }
    });
}
