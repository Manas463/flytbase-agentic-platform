# ARCHITECTURE_DECISIONS.md

# Decision Log

## ADR-001

**Decision:** Replace fixed n8n orchestration with a Planner Agent.

**Reason** Dynamic planning, retries and adaptive execution are
required.

------------------------------------------------------------------------

## ADR-002

**Decision:** Introduce Shared Memory.

**Reason** Agents remain loosely coupled and exchange structured state
instead of prompts.

------------------------------------------------------------------------

## ADR-003

**Decision:** Parallelize where dependencies allow.

Parallel stages: - Account Discovery - Company Research - Contact
Discovery

------------------------------------------------------------------------

## ADR-004

**Decision:** Add Strategy Agent.

Purpose: Determine whether an account should be pursued before
generating outreach.

------------------------------------------------------------------------

## ADR-005

**Decision:** Reflection after every major stage.

Each agent emits: - Confidence - Failures - Suggestions - Retry
recommendation

Planner consumes reflections.

------------------------------------------------------------------------

## ADR-006

**Decision:** Writer never performs research.

Writer only consumes validated context from Shared Memory.

------------------------------------------------------------------------

## ADR-007

**Decision:** Every run is observable.

Persist: - Planner decisions - Tool calls - Agent outputs - Reflection
logs - Final artifacts

------------------------------------------------------------------------

## ADR-008

**Decision:** Skills and Tools remain independent.

Skills = reasoning.

Tools = execution.

Agents combine both dynamically.
