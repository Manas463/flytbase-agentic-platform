import test from "node:test";
import assert from "node:assert/strict";
import { expandAccountTasks, expandStrategyRetryTasks } from "../agents/plannerAgent.js";

test("strategy waits for parallel research and contact discovery", () => {
  const tasks = expandAccountTasks(["Mine A"]);
  const strategy = tasks.find((task) => task.kind === "evaluate_strategy");
  assert.deepEqual(strategy?.dependsOn, ["research:Mine A", "contacts:Mine A"]);
});

test("retry plan targets only the agents that own identified gaps", () => {
  const researchOnly = expandStrategyRetryTasks("Mine A", 1, ["research_agent"]);
  assert.deepEqual(
    researchOnly.map((task) => task.kind),
    ["research_strategy_gaps", "evaluate_strategy"]
  );
  assert.deepEqual(researchOnly.at(-1)?.dependsOn, ["strategy_research:Mine A:1"]);

  const mixed = expandStrategyRetryTasks("Mine A", 1, ["research_agent", "contact_agent"]);
  assert.deepEqual(mixed.at(-1)?.dependsOn, ["strategy_research:Mine A:1", "strategy_contacts:Mine A:1"]);
});
