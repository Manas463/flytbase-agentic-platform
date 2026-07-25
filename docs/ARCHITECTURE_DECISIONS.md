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

------------------------------------------------------------------------

## ADR-009

**Decision:** Strategy qualification is deterministic, scored, and evidence-aware.

The score is out of 100: ICP fit (30), evidence quality (20), operational
pain (20), FlytBase relevance (20), and contact readiness (10). An account
must score at least 70 and have no high-priority evidence gap to proceed.

**Reason:** Qualification must be explainable and reproducible. An LLM may
gather evidence, but it does not get to move the pursuit threshold or waive a
missing-source rule.

------------------------------------------------------------------------

## ADR-010

**Decision:** `needs_more_research` creates targeted Planner tasks and permits
one re-evaluation.

Each gap records its criterion, description, research question, priority, and
owning agent. Research and contact agents rerun only for gaps they own. Every
attempt and reflection is persisted in Shared Memory. After one retry, the
account must either pass or be rejected honestly.

**Reason:** A bounded loop improves incomplete results without repeating a
broad search indefinitely or exhausting free-tier API credits. This is
operational learning, not autonomous prompt or policy mutation.
