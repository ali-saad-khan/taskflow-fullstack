import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { createMockAdapter } from "../api/mock";
import { columnOf } from "../board/logic";

async function setup(hash = "#/projects/1") {
  window.location.hash = hash;
  const api = createMockAdapter({ latency: 0 });
  render(<App api={api} />); // mock mode auto-signs in the demo user
  return api;
}

const column = (name: RegExp) => screen.getByRole("region", { name });

describe("Board (App + mockAdapter)", () => {
  it("auto-signs in, shows the demo banner and renders the three columns", async () => {
    await setup();
    expect(await screen.findByRole("heading", { name: "Website relaunch" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Demo mode: runs on an in-browser mock of the Laravel API; data stays in your browser");
    expect(within(column(/^To do/)).getByText("Fix broken redirects")).toBeInTheDocument();
    expect(within(column(/^Done/)).getByText("Audit existing pages")).toBeInTheDocument();
    expect(screen.getAllByTestId("due-badge").some((b) => b.dataset.state === "overdue")).toBe(true);
  });

  it("moves a card with the keyboard buttons, persists it, and keeps focus on the card", async () => {
    const api = await setup();
    const btn = await screen.findByRole("button", { name: "Move Set up analytics to In progress" });
    await userEvent.click(btn);

    await waitFor(() => expect(within(column(/^In progress/)).getByText("Set up analytics")).toBeInTheDocument());
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent(/Set up analytics moved to In progress, position 3 of 3/);
    expect(screen.getByRole("button", { name: "Move Set up analytics to Done" })).toHaveFocus();

    await waitFor(async () => {
      const saved = columnOf(await api.tasks.list(1), "doing").map((t) => t.title);
      expect(saved.at(-1)).toBe("Set up analytics");
    });
  });

  it("rolls back an optimistic move and shows an error when the server call fails", async () => {
    const api = await setup();
    const btn = await screen.findByRole("button", { name: "Move Set up analytics to In progress" });
    api.simulate?.setFailing(true);
    await userEvent.click(btn);

    expect(await screen.findByRole("alert")).toHaveTextContent(/rolled back/i);
    expect(within(column(/^To do/)).getByText("Set up analytics")).toBeInTheDocument();
    expect(within(column(/^In progress/)).queryByText("Set up analytics")).toBeNull();
    api.simulate?.setFailing(false);
    expect(columnOf(await api.tasks.list(1), "todo").map((t) => t.title)).toContain("Set up analytics");
  });

  it("creates a task through the dialog and shows it in the chosen column", async () => {
    const api = await setup();
    await userEvent.click(await screen.findByRole("button", { name: "Add task to In progress" }));
    await userEvent.type(screen.getByLabelText("Title"), "Brand new task");
    await userEvent.click(screen.getByRole("button", { name: "Create task" }));

    expect(await within(column(/^In progress/)).findByText("Brand new task")).toBeInTheDocument();
    await waitFor(async () => expect((await api.tasks.list(1)).some((t) => t.title === "Brand new task")).toBe(true));
  });

  it("shows the empty state for a project without tasks", async () => {
    await setup("#/projects/3");
    expect(await screen.findByText(/This board is empty/)).toBeInTheDocument();
  });

  it("shows an error state when the project does not exist", async () => {
    await setup("#/projects/999");
    expect(await screen.findByRole("alert")).toHaveTextContent("Resource not found.");
  });

  it("deep-links to the project list through the hash router", async () => {
    await setup("#/projects");
    expect(await screen.findByRole("link", { name: "Mobile app MVP" })).toHaveAttribute("href", "#/projects/2");
  });

  it("supports HTML5 drag and drop between columns", async () => {
    const api = await setup();
    const card = (await screen.findByText("Set up analytics")).closest("li") as HTMLElement;
    const dataTransfer = { setData: () => {}, effectAllowed: "", dropEffect: "" };
    const target = column(/^Done/);

    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer, clientY: 0 });
    fireEvent.drop(target, { dataTransfer, clientY: 0 });

    // jsdom has no layout (all rects are 0), so the drop lands at the end of the target column
    await waitFor(() => expect(within(column(/^Done/)).getByText("Set up analytics")).toBeInTheDocument());
    await waitFor(async () => {
      const done = columnOf(await api.tasks.list(1), "done").map((t) => t.title);
      expect(done.at(-1)).toBe("Set up analytics");
    });
  });
});
