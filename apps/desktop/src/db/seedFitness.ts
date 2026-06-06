import { db } from './database';
import { onLocalChange } from './syncEngine';
import type { Project, Todo, RepeatRule } from '../types';

async function createProject(
  title: string,
  options?: {
    description?: string;
    color?: string;
  }
): Promise<Project> {
  const now = new Date();
  const project: Project = {
    id: crypto.randomUUID(),
    title,
    description: options?.description ?? '',
    color: options?.color ?? '#22c55e',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  await db.projects.add(project);
  onLocalChange('projects', 'create', project.id).catch(() => {});
  return project;
}

async function createTodo(
  title: string,
  options?: {
    parentId?: string;
    projectId?: string;
    description?: string;
    instructions?: string;
    priority?: 'low' | 'medium' | 'high';
    estimatedMinutes?: number;
    tags?: string[];
    repeatRule?: RepeatRule;
    order?: number;
  }
): Promise<Todo> {
  const now = new Date();
  const todo: Todo = {
    id: crypto.randomUUID(),
    title,
    description: options?.description ?? '',
    instructions: options?.instructions ?? '',
    status: 'pending',
    priority: options?.priority ?? 'medium',
    estimatedMinutes: options?.estimatedMinutes ?? 60,
    tags: options?.tags ?? [],
    createdAt: now,
    updatedAt: now,
    projectId: options?.projectId,
    parentId: options?.parentId,
    repeatRule: options?.repeatRule,
    order: options?.order ?? 0,
  };
  await db.todos.add(todo);
  onLocalChange('todos', 'create', todo.id).catch(() => {});
  return todo;
}

export async function seedFitnessPlan(): Promise<void> {
  const existing = await db.projects.where('title').equals('Fitness').first();
  if (existing) {
    throw new Error('Fitness project already exists');
  }

  const project = await createProject('Fitness', {
    description: 'Weekly fitness program with strength and cardio',
    color: '#22c55e',
  });

  interface WorkoutDef {
    title: string;
    day: number;
    estimatedMinutes: number;
    instructions: string;
    exercises: string[];
  }

  const workouts: WorkoutDef[] = [
    {
      title: 'Strength — Upper Body Push',
      day: 1,
      estimatedMinutes: 50,
      instructions: 'Warm up 5 min. Rest 60–90 sec between sets.',
      exercises: [
        'Bench press or push-ups — 3×8–12',
        'Overhead press — 3×8–10',
        'Incline dumbbell press — 3×10–12',
        'Lateral raises — 3×12–15',
        'Tricep dips or extensions — 3×10–12',
      ],
    },
    {
      title: 'Cardio — Moderate Intensity',
      day: 2,
      estimatedMinutes: 35,
      instructions: 'Keep heart rate at 60–70% max. Breathe steadily.',
      exercises: [
        'Brisk walk, jog, cycle, or swim — 30 min',
        'Cool down stretch — 5 min',
      ],
    },
    {
      title: 'Strength — Lower Body',
      day: 3,
      estimatedMinutes: 55,
      instructions: 'Warm up 5 min. Focus on form over weight.',
      exercises: [
        'Squats or goblet squats — 3×8–10',
        'Romanian deadlifts — 3×10–12',
        'Walking lunges — 3×10/leg',
        'Leg curls — 3×12–15',
        'Calf raises — 3×15–20',
      ],
    },
    {
      title: 'Active Recovery',
      day: 4,
      estimatedMinutes: 25,
      instructions: 'Low intensity. Focus on mobility and breathing.',
      exercises: [
        'Light walk — 15 min',
        'Full-body stretch or yoga flow — 10 min',
      ],
    },
    {
      title: 'Strength — Upper Pull + Core',
      day: 5,
      estimatedMinutes: 50,
      instructions: 'Warm up 5 min. Control the eccentric on pulls.',
      exercises: [
        'Pull-ups or rows — 3×8–12',
        'Face pulls or rear delt fly — 3×12–15',
        'Bicep curls — 3×10–12',
        'Plank — 3×45–60 sec',
        'Dead bug or hanging leg raise — 3×10–12',
      ],
    },
    {
      title: 'Cardio — Intervals',
      day: 6,
      estimatedMinutes: 35,
      instructions: 'High intensity intervals. Warm up 5 min first.',
      exercises: [
        'Interval sprints — 30 sec hard / 90 sec easy × 8–10',
        'Cool down walk — 5 min',
      ],
    },
    {
      title: 'Rest Day',
      day: 0,
      estimatedMinutes: 10,
      instructions: 'Full rest. Light walking is fine. Hydrate and sleep.',
      exercises: ['Light walk (optional) — 10–20 min'],
    },
  ];

  for (const w of workouts) {
    const parent = await createTodo(w.title, {
      projectId: project.id,
      instructions: w.instructions,
      priority: w.day === 0 ? 'low' : 'high',
      estimatedMinutes: w.estimatedMinutes,
      tags: ['fitness', w.day === 0 ? 'rest' : 'workout'],
      repeatRule: { type: 'weekly', weekDays: [w.day] },
    });

    for (let i = 0; i < w.exercises.length; i++) {
      await createTodo(w.exercises[i], {
        parentId: parent.id,
        projectId: project.id,
        priority: 'medium',
        estimatedMinutes: Math.round(w.estimatedMinutes / w.exercises.length),
        tags: ['fitness', 'exercise'],
        order: i,
      });
    }
  }
}
