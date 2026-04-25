import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./config";
import type {
  PlanTemplate,
  PlanInstance,
  PlanWeek,
} from "@/lib/types/meal-plan";
import { addDays, format, parseISO, differenceInCalendarDays } from "date-fns";

const TEMPLATES = "nutrition_plan_templates";
const INSTANCES = "nutrition_plan_instances";

// ── Templates ──

export async function saveTemplate(
  userId: string,
  template: Partial<PlanTemplate>
): Promise<string> {
  const db = getDb();
  if (template.id) {
    const ref = doc(db, TEMPLATES, template.id);
    await updateDoc(ref, {
      name: template.name,
      description: template.description ?? "",
      weeks: template.weeks,
      goals: template.goals ?? null,
      updatedAt: serverTimestamp(),
    });
    return template.id;
  }

  const ref = doc(collection(db, TEMPLATES));
  await setDoc(ref, {
    id: ref.id,
    userId,
    name: template.name,
    description: template.description ?? "",
    weeks: template.weeks ?? [],
    goals: template.goals ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export function subscribeToTemplates(
  userId: string,
  callback: (templates: PlanTemplate[]) => void
): Unsubscribe {
  const db = getDb();
  const q = query(
    collection(db, TEMPLATES),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as PlanTemplate));
  });
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await deleteDoc(doc(getDb(), TEMPLATES, templateId));
}

// ── Instances ──

export async function startPlanInstance(
  userId: string,
  template: PlanTemplate,
  startDateStr: string,
  startWeekIndex: number = 0
): Promise<string> {
  const db = getDb();
  // Slice weeks from the chosen starting week
  const remainingWeeks = template.weeks.slice(startWeekIndex);
  const startDate = parseISO(startDateStr);
  const startDayOfWeek = (startDate.getDay() + 6) % 7; // 0=Mon..6=Sun
  const startMonday = addDays(startDate, -startDayOfWeek);
  const endDate = addDays(startMonday, remainingWeeks.length * 7 - 1);

  const ref = doc(collection(db, INSTANCES));
  await setDoc(ref, {
    id: ref.id,
    userId,
    templateId: template.id,
    templateName: template.name,
    snapshot: remainingWeeks,
    startDate: startDateStr,
    endDate: format(endDate, "yyyy-MM-dd"),
    status: "active",
    goals: template.goals ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export function subscribeToActiveInstance(
  userId: string,
  callback: (instance: PlanInstance | null) => void
): Unsubscribe {
  const db = getDb();
  const q = query(
    collection(db, INSTANCES),
    where("userId", "==", userId),
    where("status", "==", "active")
  );
  return onSnapshot(q, (snap) => {
    if (snap.empty) {
      callback(null);
      return;
    }
    const first = snap.docs[0];
    callback({ ...first.data(), id: first.id } as PlanInstance);
  });
}

export async function getInstanceHistory(
  userId: string
): Promise<PlanInstance[]> {
  const db = getDb();
  const q = query(
    collection(db, INSTANCES),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as PlanInstance);
}

/**
 * Update a specific meal in an active plan instance's snapshot.
 * Used when the user swaps a meal on a specific day.
 */
export async function updateInstanceDay(
  instanceId: string,
  weekIndex: number,
  dayIndex: number,
  updatedDay: PlanWeek["days"][number]
): Promise<void> {
  const db = getDb();
  const ref = doc(db, INSTANCES, instanceId);
  const { getDoc: getDocFn } = await import("firebase/firestore");
  const snap = await getDocFn(ref);
  if (!snap.exists()) return;

  const data = snap.data() as PlanInstance;
  const snapshot = [...data.snapshot];
  const week = { ...snapshot[weekIndex], days: [...snapshot[weekIndex].days] };
  week.days[dayIndex] = updatedDay;
  snapshot[weekIndex] = week;

  // Firestore rejects undefined values — strip them recursively
  await updateDoc(ref, { snapshot: stripUndefined(snapshot), updatedAt: serverTimestamp() });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripUndefined(value: any): any {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) result[k] = stripUndefined(v);
    }
    return result;
  }
  return value;
}

export async function endInstanceEarly(
  instanceId: string,
  note: string
): Promise<void> {
  await updateDoc(doc(getDb(), INSTANCES, instanceId), {
    status: "ended_early",
    endedEarlyNote: note,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteInstance(instanceId: string): Promise<void> {
  await deleteDoc(doc(getDb(), INSTANCES, instanceId));
}

/**
 * Get the week index and day index for a given date within a plan instance.
 */
export function getIndicesForDate(
  instance: PlanInstance,
  date: Date
): { weekIndex: number; dayIndex: number } | null {
  const start = parseISO(instance.startDate);
  const startDayOfWeek = (start.getDay() + 6) % 7; // 0=Mon..6=Sun
  const startMonday = addDays(start, -startDayOfWeek);
  const offset = differenceInCalendarDays(date, startMonday);
  const totalDays = instance.snapshot.length * 7;
  if (differenceInCalendarDays(date, start) < 0) return null;
  if (offset < 0 || offset >= totalDays) return null;
  return {
    weekIndex: Math.floor(offset / 7),
    dayIndex: offset % 7,
  };
}
