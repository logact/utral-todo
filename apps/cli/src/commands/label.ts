import { type Command } from "commander";
import { api, handleResponse } from "../client.js";
import { out } from "../output.js";

interface Label {
  name: string;
  count: number;
}

export function registerLabelCommand(program: Command) {
  const label = program.command("label").description("manage labels");

  label
    .command("list")
    .description("list all labels with usage counts")
    .action(async () => {
      const res = await api.get<Label[]>("/api/labels");
      const data = handleResponse(res);
      if (data) out({ success: true, count: data.length, labels: data });
    });

  label
    .command("rename")
    .description("rename a label across all tasks")
    .argument("<old>", "current label name")
    .argument("<new>", "new label name")
    .action(async (oldName: string, newName: string) => {
      const res = await api.patch<{ renamed: string; to: string; updatedTodos: number }>(
        "/api/labels/rename",
        { oldName, newName }
      );
      const data = handleResponse(res);
      if (data) out({ success: true, ...data });
    });

  label
    .command("delete")
    .description("remove a label from all tasks")
    .argument("<name>", "label name to delete")
    .action(async (name: string) => {
      const res = await api.delete<{ deleted: string; updatedTodos: number }>(
        `/api/labels/${encodeURIComponent(name)}`
      );
      const data = handleResponse(res);
      if (data) out({ success: true, ...data });
    });
}
