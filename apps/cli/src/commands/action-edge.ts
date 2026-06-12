import { type Command } from "commander";
import { api, handleResponse } from "../client.js";
import { out } from "../output.js";

interface ActionEdge {
  id: string;
  fromTodoId: string;
  toTodoId: string;
  type: string;
  createdAt: string;
}

export function registerActionEdgeCommand(program: Command) {
  const edge = program.command("action-edge").description("manage action edges");

  edge
    .command("list")
    .description("list all action edges")
    .action(async () => {
      const res = await api.get<ActionEdge[]>("/api/action-edges");
      const data = handleResponse(res);
      if (data) out({ success: true, count: data.length, edges: data });
    });

  edge
    .command("for-todo")
    .description("list edges connected to a todo")
    .argument("<todoId>", "todo ID")
    .action(async (todoId: string) => {
      const res = await api.get<ActionEdge[]>(`/api/action-edges/todo/${todoId}`);
      const data = handleResponse(res);
      if (data) out({ success: true, count: data.length, edges: data });
    });

  edge
    .command("create")
    .description("create an action edge")
    .requiredOption("--from <id>", "source todo ID")
    .requiredOption("--to <id>", "target todo ID")
    .requiredOption("--type <type>", "edge type")
    .action(async (opts) => {
      const body = {
        fromTodoId: opts.from,
        toTodoId: opts.to,
        type: opts.type,
      };
      const res = await api.post<ActionEdge>("/api/action-edges", body);
      const data = handleResponse(res);
      if (data) out({ success: true, edge: data });
    });

  edge
    .command("delete")
    .description("delete an action edge")
    .argument("<id>", "edge ID")
    .action(async (id: string) => {
      const res = await api.delete(`/api/action-edges/${id}`);
      if (res.success) {
        out({ success: true, deleted: id });
      } else {
        handleResponse(res);
      }
    });
}
