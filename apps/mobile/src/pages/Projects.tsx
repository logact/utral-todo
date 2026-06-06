import { useState, useEffect } from 'react';
import { db } from '../db/database';
import type { Project } from '@utral/types';

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.projects.toArray().then((all) => {
      setProjects(all);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 dark:text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      {projects.length === 0 ? (
        <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-8">
          No projects yet. Create one from the desktop app.
        </p>
      ) : (
        <div className="space-y-2">
          {projects.map((project) => (
            <div
              key={project.id}
              className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: project.color || '#6366f1' }}
                />
                <h3 className="font-medium text-slate-900 dark:text-slate-100">
                  {project.title}
                </h3>
              </div>
              {project.description && (
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {project.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="h-8" />
    </div>
  );
}
