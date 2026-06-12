import { type Command } from "commander";
import { api, handleResponse } from "../client.js";
import { out } from "../output.js";

interface Project {
  id: string;
  title: string;
  description: string;
  color: string | null;
  status: string;
  deadline: string | null;
  createdAt: string;
}

export function registerProjectCommand(program: Command) {
  const project = program.command("project").description("manage projects");

  project
    .command("list")
    .description("list all projects")
    .action(async () => {
      const res = await api.get<Project[]>("/api/projects");
      const data = handleResponse(res);
      if (data) out({ success: true, count: data.length, projects: data });
    });

  project
    .command("get")
    .description("get a project by ID")
    .argument("<id>", "project ID")
    .action(async (id: string) => {
      const res = await api.get<Project>(`/api/projects/${id}`);
      const data = handleResponse(res);
      if (data) out({ success: true, project: data });
    });

  project
    .command("create")
    .description("create a new project")
    .requiredOption("--title <title>", "project title")
    .option("--description <text>", "description")
    .option("--color <color>", "color code")
    .option("--deadline <date>", "deadline (ISO)")
    .action(async (opts) => {
      const body = {
        title: opts.title,
        description: opts.description ?? "",
        color: opts.color ?? null,
        deadline: opts.deadline ?? null,
      };
      const res = await api.post<Project>("/api/projects", body);
      const data = handleResponse(res);
      if (data) out({ success: true, project: data });
    });

  project
    .command("update")
    .description("update a project")
    .argument("<id>", "project ID")
    .option("--title <title>", "new title")
    .option("--description <text>", "new description")
    .option("--color <color>", "new color")
    .option("--status <s>", "new status")
    .option("--deadline <date>", "new deadline")
    .action(async (id: string, opts) => {
      const body: Record<string, unknown> = {};
      if (opts.title !== undefined) body.title = opts.title;
      if (opts.description !== undefined) body.description = opts.description;
      if (opts.color !== undefined) body.color = opts.color;
      if (opts.status !== undefined) body.status = opts.status;
      if (opts.deadline !== undefined) body.deadline = opts.deadline;

      const res = await api.patch<Project>(`/api/projects/${id}`, body);
      const data = handleResponse(res);
      if (data) out({ success: true, project: data });
    });

  project
    .command("delete")
    .description("delete a project")
    .argument("<id>", "project ID")
    .action(async (id: string) => {
      const res = await api.delete(`/api/projects/${id}`);
      if (res.success) {
        out({ success: true, deleted: id });
      } else {
        handleResponse(res);
      }
    });
}
