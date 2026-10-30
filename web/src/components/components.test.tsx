import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DueBadge, PriorityBadge } from "./Badges";
import { TaskCard } from "./TaskCard";
import { TaskDialog } from "./TaskDialog";
import { makeTask } from "../test/factories";

describe("badges", () => {
  it("shows priority as text, not only colour", () => {
    render(<PriorityBadge priority="high" />);
    expect(screen.getByTestId("priority-badge")).toHaveTextContent("high");
  });

  it("highlights overdue and due-today tasks but not finished ones", () => {
    const now = new Date(2030, 5, 15);
    const { rerender } = render(<DueBadge due="2030-06-10" status="todo" now={now} />);
    expect(screen.getByTestId("due-badge")).toHaveAttribute("data-state", "overdue");
    rerender(<DueBadge due="2030-06-15" status="todo" now={now} />);
    expect(screen.getByTestId("due-badge")).toHaveAttribute("data-state", "today");
    rerender(<DueBadge due="2030-06-10" status="done" now={now} />);
    expect(screen.queryByTestId("due-badge")).toBeNull();
  });
});

describe("TaskCard keyboard controls", () => {
  const handlers = () => ({ onEdit: vi.fn(), onKeyboardMove: vi.fn(), onDragStart: vi.fn(), onDragEnd: vi.fn() });

  it("offers labelled move buttons and reports the chosen action", async () => {
    const h = handlers();
    const task = makeTask({ title: "Ship it", status: "doing" });
    render(<ul><TaskCard task={task} index={1} columnSize={3} dragging={false} {...h} /></ul>);

    await userEvent.click(screen.getByRole("button", { name: "Move Ship it to Done" }));
    expect(h.onKeyboardMove).toHaveBeenCalledWith(task, "right");
    await userEvent.click(screen.getByRole("button", { name: "Move Ship it to To do" }));
    expect(h.onKeyboardMove).toHaveBeenLastCalledWith(task, "left");
  });

  it("disables impossible moves at the edges", () => {
    const task = makeTask({ title: "Edge", status: "todo" });
    render(<ul><TaskCard task={task} index={0} columnSize={1} dragging={false} {...handlers()} /></ul>);
    expect(screen.getByRole("button", { name: "Move Edge left" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Edge up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Edge down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Edge to In progress" })).toBeEnabled();
  });

  it("is draggable unless it is an unsaved placeholder", () => {
    const { rerender } = render(<ul><TaskCard task={makeTask({ id: 5 })} index={0} columnSize={1} dragging={false} {...handlers()} /></ul>);
    expect(screen.getByRole("listitem")).toHaveAttribute("draggable", "true");
    rerender(<ul><TaskCard task={makeTask({ id: -1 })} index={0} columnSize={1} dragging={false} {...handlers()} /></ul>);
    expect(screen.getByRole("listitem")).toHaveAttribute("draggable", "false");
  });
});

describe("TaskDialog", () => {
  it("opens as a modal dialog with a labelled heading and focused title field", () => {
    render(<TaskDialog onClose={() => {}} onSubmit={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "New task" });
    expect(dialog).toHaveAttribute("open");
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
  });

  it("validates the title before submitting", async () => {
    const onSubmit = vi.fn();
    render(<TaskDialog onClose={() => {}} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "Create task" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Title is required");
    expect(screen.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits trimmed values", async () => {
    const onSubmit = vi.fn();
    render(<TaskDialog defaultStatus="doing" onClose={() => {}} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("Title"), "  Write docs ");
    await userEvent.selectOptions(screen.getByLabelText("Priority"), "high");
    await userEvent.click(screen.getByRole("button", { name: "Create task" }));
    expect(onSubmit).toHaveBeenCalledWith({ title: "Write docs", description: null, status: "doing", priority: "high", due_date: null });
  });

  it("restores focus to the opener when it unmounts", async () => {
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button>opener</button>
          {open && <TaskDialog onClose={() => {}} onSubmit={() => {}} />}
        </>
      );
    }
    const { rerender } = render(<Harness open={false} />);
    screen.getByText("opener").focus();
    rerender(<Harness open />);
    screen.getByLabelText("Title").focus();
    rerender(<Harness open={false} />);
    expect(screen.getByText("opener")).toHaveFocus();
  });

  it("requires a second click to delete", async () => {
    const onDelete = vi.fn();
    render(<TaskDialog task={makeTask({ title: "x" })} onClose={() => {}} onSubmit={() => {}} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
