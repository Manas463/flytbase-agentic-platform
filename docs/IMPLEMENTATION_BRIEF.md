# IMPLEMENTATION_BRIEF.md

## Objective

Transform the existing FlytBase BDR workflow into an AI-native
orchestration platform.

Do not rebuild business logic. Extract and reuse it.

## Current Pipeline

Campaign Brief → Account Discovery → Research → Contact Discovery →
Email Generation → Critic → Output

## Future Pipeline

Campaign Brief → Planner → Task Graph

Parallel: - ICP Matching - Account Discovery - Research - Contact
Discovery

↓

Shared Memory

↓

Strategy Agent

↓

Writer

↓

Critic

↓

Reflection

↓

Planner

↓

Output

## Runtime Rules

-   Planner owns execution.
-   Agents own one responsibility.
-   Shared Memory is the communication layer.
-   Reflection drives retries.
-   Validation gates completion.

## Deliverables

-   Agent runtime
-   Shared memory
-   Planner
-   Observability
-   Updated frontend integration
-   Deployment
