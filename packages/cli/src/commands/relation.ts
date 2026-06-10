import { type Command } from "commander";
import { api, handleResponse } from "../client.js";
import { out } from "../output.js";

interface TodoRelation {
  id: string;
  fromTodoId: string;
  toTodoId: string;
  type: string;
  createdAt: string;
}

export function registerRelationCommand(program: Command) {
  const relation = program.command("relation").description("manage todo relations");

  relation
    .command("list")
    .description("list all relations")
    .action(async () => {
      const res = await api.get<TodoRelation[]>("/api/relations");
      const data = handleResponse(res);
      if (data) out({ success: true, count: data.length, relations: data });
    });

  relation
    .command("create")
    .description("create a relation")
    .requiredOption("--from <id>", "source todo ID")
    .requiredOption("--to <id>", "target todo ID")
    .requiredOption("--type <type>", "relation type")
    .action(async (opts) => {
      const body = {
        fromTodoId: opts.from,
        toTodoId: opts.to,
        type: opts.type,
      };
      const res = await api.post<TodoRelation>("/api/relations", body);
      const data = handleResponse(res);
      if (data) out({ success: true, relation: data });
    });

  relation
    .command("delete")
    .description("delete a relation")
    .argument("<id>", "relation ID")
    .action(async (id: string) => {
      const res = await api.delete(`/api/relations/${id}`);
      if (res.success) {
        out({ success: true, deleted: id });
      } else {
        handleResponse(res);
      }
    });

  relation
    .command("chain")
    .description("get source chain for a todo")
    .argument("<id>", "todo ID")
    .action(async (id: string) => {
      const res = await api.get<unknown[]>(`/api/relations/source-chain/${id}`);
      const data = handleResponse(res);
      if (data) out({ success: true, count: data.length, chain: data });
    });
}
