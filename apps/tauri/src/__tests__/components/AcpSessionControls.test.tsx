import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AcpSessionControls } from "@/components/AcpSessionControls";

const MODES = [
  {
    id: "https://agentclientprotocol.com/protocol/session-modes#ask",
    name: "Ask",
  },
  {
    id: "https://agentclientprotocol.com/protocol/session-modes#plan",
    name: "Plan",
  },
];

const CONFIG_OPTIONS = [
  {
    id: "model",
    name: "Model",
    category: "model",
    options: [{ id: "m1", label: "Model 1" }, { id: "m2", label: "Model 2" }],
  },
  {
    id: "preferred_agent",
    name: "Agent",
    options: [{ id: "a1", label: "Agent 1" }, { id: "a2", label: "Agent 2" }],
  },
  {
    id: "temperature",
    name: "Temperature",
    options: [{ id: "low", label: "Low" }, { id: "high", label: "High" }],
  },
];

describe("AcpSessionControls", () => {
  it("renders all chips in normal state", () => {
    render(
      <AcpSessionControls
        disabled={false}
        currentModeId={MODES[0].id}
        availableModes={MODES}
        configOptions={CONFIG_OPTIONS}
        selectedConfigOptions={{ model: "m1", preferred_agent: "a1", temperature: "low" }}
        onSelectMode={vi.fn()}
        onSelectConfigOption={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /mode:/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /model:/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /agent:/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /advanced:/i })).toBeInTheDocument();
  });

  it("disables controls in streaming/disconnected state", () => {
    render(
      <AcpSessionControls
        disabled
        currentModeId={MODES[0].id}
        availableModes={MODES}
        configOptions={CONFIG_OPTIONS}
        selectedConfigOptions={{ model: "m1", preferred_agent: "a1", temperature: "low" }}
        onSelectMode={vi.fn()}
        onSelectConfigOption={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /mode:/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /model:/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /agent:/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /advanced:/i })).toBeDisabled();
  });

  it("shows unavailable model/agent when ACP does not provide them", () => {
    render(
      <AcpSessionControls
        disabled={false}
        currentModeId={MODES[0].id}
        availableModes={MODES}
        configOptions={[]}
        selectedConfigOptions={{}}
        onSelectMode={vi.fn()}
        onSelectConfigOption={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /model:/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /agent:/i })).toBeDisabled();
    expect(screen.getAllByText(/Unavailable from ACP/i).length).toBeGreaterThan(0);
  });

  it("invokes callbacks on selector actions", async () => {
    const user = userEvent.setup();
    const onSelectMode = vi.fn();
    const onSelectConfigOption = vi.fn();

    render(
      <AcpSessionControls
        disabled={false}
        currentModeId={MODES[0].id}
        availableModes={MODES}
        configOptions={CONFIG_OPTIONS}
        selectedConfigOptions={{ model: "m1", preferred_agent: "a1", temperature: "low" }}
        onSelectMode={onSelectMode}
        onSelectConfigOption={onSelectConfigOption}
      />
    );

    await user.click(screen.getByRole("button", { name: /mode:/i }));
    await user.click(screen.getByText("Plan"));
    expect(onSelectMode).toHaveBeenCalledWith(
      "https://agentclientprotocol.com/protocol/session-modes#plan"
    );

    await user.click(screen.getByRole("button", { name: /model:/i }));
    await user.click(screen.getByText("Model 2"));
    expect(onSelectConfigOption).toHaveBeenCalledWith("model", "m2");
  });
});
