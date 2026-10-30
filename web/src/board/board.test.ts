import { describe, expect, it } from "vitest";
import { applyMove, columnOf, dueState, groupByStatus, normalize } from "./logic";
import { boardReducer, initialBoardState } from "./reducer";
import { makeTask } from "../test/factories";

const col = (tasks: ReturnType<typeof makeTask>[], s: "todo" | "doing" | "done") => columnOf(tasks, s).map((t) => t.title);

function board() {
  return [
    makeTask({ id: 101, title: "a", status: "todo", position: 0 }),
    makeTask({ id: 102, title: "b", status: "todo", position: 1 }),
    makeTask({ id: 103, title: "c", status: "todo", position: 2 }),
    makeTask({ id: 104, title: "d", status: "doing", position: 0 }),
  ];
}

describe("applyMove", () => {
  it("reorders inside a column (down and up)", () => {
    expect(col(applyMove(board(), 101, "todo", 2), "todo")).toEqual(["b", "c", "a"]);
    expect(col(applyMove(board(), 103, "todo", 0), "todo")).toEqual(["c", "a", "b"]);
  });

  it("moves across columns and renumbers both", () => {
    const next = applyMove(board(), 101, "doing", 0);
    expect(col(next, "doing")).toEqual(["a", "d"]);
    expect(columnOf(next, "todo").map((t) => t.position)).toEqual([0, 1]);
    expect(columnOf(next, "doing").map((t) => t.position)).toEqual([0, 1]);
  });

  it("clamps positions and ignores unknown ids", () => {
    expect(col(applyMove(board(), 101, "done", 50), "done")).toEqual(["a"]);
    const b = board();
    expect(applyMove(b, 999, "done", 0)).toBe(b);
  });

  it("does not mutate its input", () => {
    const b = board();
    const snapshot = JSON.stringify(b);
    applyMove(b, 101, "done", 0);
    expect(JSON.stringify(b)).toBe(snapshot);
  });
});

describe("helpers", () => {
  it("groups and normalizes", () => {
    const g = groupByStatus(board());
    expect(g.todo).toHaveLength(3);
    expect(g.done).toEqual([]);
    const gap = [makeTask({ id: 1, position: 4 }), makeTask({ id: 2, position: 9 })];
    expect(normalize(gap).map((t) => t.position)).toEqual([0, 1]);
  });

  it("classifies due dates relative to today and ignores finished tasks", () => {
    const now = new Date(2030, 5, 15, 12, 0, 0);
    expect(dueState(null, "todo", now)).toBe("none");
    expect(dueState("2030-06-14", "todo", now)).toBe("overdue");
    expect(dueState("2030-06-15", "doing", now)).toBe("today");
    expect(dueState("2030-06-17", "todo", now)).toBe("soon");
    expect(dueState("2030-06-18", "todo", now)).toBe("later");
    expect(dueState("2030-06-01", "done", now)).toBe("none");
  });
});

describe("boardReducer", () => {
  it("handles the load lifecycle", () => {
    let s = boardReducer(initialBoardState, { type: "load_failed", error: "nope" });
    expect(s).toMatchObject({ phase: "error", error: "nope" });
    s = boardReducer(s, { type: "load_start" });
    expect(s.phase).toBe("loading");
    s = boardReducer(s, { type: "loaded", tasks: board() });
    expect(s.phase).toBe("ready");
    expect(s.tasks).toHaveLength(4);
  });

  it("optimistic move followed by rollback restores the exact snapshot", () => {
    const loaded = boardReducer(initialBoardState, { type: "loaded", tasks: board() });
    const moved = boardReducer(loaded, { type: "move", id: 101, status: "done", position: 0 });
    expect(col(moved.tasks, "done")).toEqual(["a"]);
    const rolled = boardReducer(moved, { type: "rollback", tasks: loaded.tasks });
    expect(rolled.tasks).toBe(loaded.tasks);
  });

  it("adds a pending task at the end then swaps in the server task", () => {
    const loaded = boardReducer(initialBoardState, { type: "loaded", tasks: board() });
    const temp = makeTask({ id: -1, title: "tmp", status: "todo", position: 3 });
    const pending = boardReducer(loaded, { type: "add_pending", task: temp });
    expect(col(pending.tasks, "todo")).toEqual(["a", "b", "c", "tmp"]);
    const real = { ...temp, id: 500 };
    const done = boardReducer(pending, { type: "add_confirmed", tempId: -1, task: real });
    expect(done.tasks.some((t) => t.id === -1)).toBe(false);
    expect(done.tasks.some((t) => t.id === 500)).toBe(true);
  });

  it("patch with a new status moves the task to the end of that column; remove closes gaps", () => {
    const loaded = boardReducer(initialBoardState, { type: "loaded", tasks: board() });
    const patched = boardReducer(loaded, { type: "patch", id: 101, patch: { status: "doing", title: "A!" } });
    expect(col(patched.tasks, "doing")).toEqual(["d", "A!"]);
    const removed = boardReducer(patched, { type: "remove", id: 102 });
    expect(columnOf(removed.tasks, "todo").map((t) => t.position)).toEqual([0]);
  });
});
