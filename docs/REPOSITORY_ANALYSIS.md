# REPOSITORY_ANALYSIS

## Executive Summary

The existing repository is **not a simple prompt chain**. It already
contains a well-designed outbound workflow whose primary limitation is
orchestration rather than business logic.

## Existing Pipeline

Campaign Brief → Account Identification → Company Research → Contact
Discovery → Email Writer → Critic → Output

## Strengths

-   Clear separation of workflow stages.
-   Structured JSON outputs.
-   Research before personalization.
-   Dedicated critic stage.
-   Working frontend and Supabase integration.
-   Deployed system already exists.

## Weaknesses

-   Sequential orchestration.
-   Static execution graph.
-   No planning agent.
-   No shared memory abstraction.
-   Minimal retry/reflection logic.
-   Limited observability.

## Components Worth Reusing

-   Existing prompts
-   Business logic
-   Frontend
-   Database
-   API integrations
-   Validation logic
-   Email generation prompts

## Components to Replace

-   n8n orchestration
-   Static routing
-   Fixed execution order

## Proposed Agent Mapping

  Current Stage            Future Agent
  ------------------------ ------------------
  Campaign Processing      Planner
  Account Identification   Account Agent
  Research                 Research Agent
  Contact Discovery        Contact Agent
  Qualification            Strategy Agent
  Email Writing            Writer Agent
  Review                   Critic Agent
  Retry Logic              Reflection Agent

## Recommended Migration

1.  Preserve business logic.
2.  Build planner runtime.
3.  Introduce shared memory.
4.  Convert stages into agents.
5.  Add reflection loops.
6.  Add observability.
7.  Remove orchestration dependence on n8n only after parity is
    achieved.

## Conclusion

The project should evolve from a workflow automation into an AI-native
orchestration platform without discarding the proven outbound pipeline.
