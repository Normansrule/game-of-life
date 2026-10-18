import type { Cell } from '../engine/life';

/** Cross-view messages, e.g. "grow a lineage tree from this pattern". */
export interface BusEvents {
  'lineage:load': { cells: Cell[]; name: string };
  'sim:load': { cells: Cell[]; name: string; rule?: string };
  'deep:load': { cells: Cell[]; name: string };
  'space:load': { cells: Cell[]; name: string };
  navigate: { route: string };
}

type Handler<T> = (payload: T) => void;
const handlers = new Map<string, Handler<unknown>[]>();

export function on<K extends keyof BusEvents>(ev: K, fn: Handler<BusEvents[K]>): void {
  const list = handlers.get(ev) ?? [];
  list.push(fn as Handler<unknown>);
  handlers.set(ev, list);
}

export function emit<K extends keyof BusEvents>(ev: K, payload: BusEvents[K]): void {
  for (const fn of handlers.get(ev) ?? []) fn(payload);
}
