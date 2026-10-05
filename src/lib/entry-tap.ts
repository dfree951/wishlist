export type EntryTap = {
  id: number;
  x: number;
  y: number;
  startedAt: number;
  href: string;
  moved: boolean;
};

export function movedBeyondTap(start: EntryTap, x: number, y: number) {
  return Math.hypot(x - start.x, y - start.y) > 12;
}

export function isEntryTap(start: EntryTap, id: number, x: number, y: number, time: number) {
  return start.id === id && !start.moved && !movedBeyondTap(start, x, y)
    && time - start.startedAt < 600;
}
