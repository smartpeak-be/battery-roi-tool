# Claude Code agents & skills

Selection of agents and skills from [Everything Claude Code](https://github.com/affaan-m/ECC)
(v2.2.3, MIT, see `ECC-LICENSE`). Only the agent and skill definitions are copied;
ECC's hooks, rules and install scripts are deliberately not used.

Every Claude Code session that starts in this repository can use these agents
(for example `architect`, `code-reviewer`, `security-reviewer`, `java-reviewer`).

The selection is "everything relevant" for this tool and its V2 (vanilla JS +
Firebase today, Spring Boot on Firestore planned), not the full ECC set.

## Agents (22)

| Agent | Use for |
|---|---|
| architect, code-architect, planner, code-explorer | Analysis, design and planning |
| spec-miner | Extracting the current behaviour as specs before rebuilding it (V2) |
| type-design-analyzer | Value objects / aggregates in the domain model |
| code-reviewer, typescript-reviewer | Reviewing the current JS code |
| java-reviewer, java-build-resolver | Spring Boot V2 |
| security-reviewer | Rules, public endpoints, secrets |
| tdd-guide, pr-test-analyzer, e2e-runner | Tests (pragmatic: behaviour, not every detail) |
| refactor-cleaner, code-simplifier, silent-failure-hunter, performance-optimizer | Tech debt |
| comment-analyzer, doc-updater | Comments and docs in line with the code |
| commit-reviewer | Commit messages |
| a11y-architect | Accessibility / responsive UI |

## Skills (36)

- **Architecture & planning:** hexagonal-architecture, architecture-decision-records,
  blueprint, product-capability, intent-driven-development, contract-first,
  backend-patterns, api-design, error-handling
- **Java / Spring Boot:** springboot-patterns, springboot-security, springboot-tdd,
  springboot-verification, java-coding-standards
- **Existing code:** codebase-onboarding, brownfield-retrospective, change-impact,
  module-regression, click-path-audit, coding-standards
- **Front-end:** frontend-patterns, design-system, frontend-design-direction,
  make-interfaces-feel-better, accessibility
- **Quality & tests:** tdd-workflow, e2e-testing, browser-qa, verification-loop,
  security-review, production-audit
- **Delivery & data:** deployment-patterns, docker-patterns, git-workflow,
  database-migrations, living-docs-governance

## Deliberately left out

- Other languages/frameworks (Python, Go, Rust, Kotlin, React, Vue, Django, Laravel, …)
- `database-reviewer` and `jpa-patterns`: PostgreSQL/JPA, not Firestore. Add them
  if the data store moves to a relational database later.
- `docs-lookup`: needs the Context7 MCP server.
- `build-error-resolver`: TypeScript build errors; this repo has no build.
- `seo-specialist`: SEO lives in the smartpeak-site repo.
- Meta/harness agents and skills (agent evals, loops, ECC configuration),
  marketing, finance, network and homelab items.
- ECC hooks (e.g. delivery-gate, safety-guard): they change how every session behaves.

## Updating

Copy newer versions of the same files from the ECC repository (`agents/<name>.md`,
`skills/<name>/`). Every agent and skill description is loaded into each session,
so add only what is actually used.
