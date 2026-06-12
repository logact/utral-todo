import { type Command } from "commander";
import { api, handleResponse } from "../client.js";
import { out } from "../output.js";

interface Roadmap {
  id: string;
  goalTodoId: string;
  phases: unknown[];
  createdAt: string;
  updatedAt: string;
}

export function registerRoadmapCommand(program: Command) {
  const roadmap = program.command("roadmap").description("manage roadmaps");

  roadmap
    .command("list")
    .description("list all roadmaps")
    .action(async () => {
      const res = await api.get<Roadmap[]>("/api/roadmaps");
      const data = handleResponse(res);
      if (data) out({ success: true, count: data.length, roadmaps: data });
    });

  roadmap
    .command("get")
    .description("get a roadmap by goal todo ID")
    .argument("<goalTodoId>", "goal todo ID")
    .action(async (goalTodoId: string) => {
      const res = await api.get<Roadmap>(`/api/roadmaps/goal/${goalTodoId}`);
      const data = handleResponse(res);
      if (data) out({ success: true, roadmap: data });
    });

  roadmap
    .command("create")
    .description("create a roadmap")
    .requiredOption("--goal <id>", "goal todo ID")
    .option("--phases <json>", "phases JSON", "[]")
    .action(async (opts) => {
      const body = {
        goalTodoId: opts.goal,
        phases: JSON.parse(opts.phases),
      };
      const res = await api.post<Roadmap>("/api/roadmaps", body);
      const data = handleResponse(res);
      if (data) out({ success: true, roadmap: data });
    });

  roadmap
    .command("update")
    .description("update a roadmap")
    .argument("<id>", "roadmap ID")
    .requiredOption("--phases <json>", "phases JSON")
    .action(async (id: string, opts) => {
      const body = { phases: JSON.parse(opts.phases) };
      const res = await api.patch<Roadmap>(`/api/roadmaps/${id}`, body);
      const data = handleResponse(res);
      if (data) out({ success: true, roadmap: data });
    });

  roadmap
    .command("delete")
    .description("delete a roadmap")
    .argument("<id>", "roadmap ID")
    .action(async (id: string) => {
      const res = await api.delete(`/api/roadmaps/${id}`);
      if (res.success) {
        out({ success: true, deleted: id });
      } else {
        handleResponse(res);
      }
    });
}
