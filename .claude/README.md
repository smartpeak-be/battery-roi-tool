# Claude Code agents & skills

Selection of agents and skills from [Everything Claude Code](https://github.com/affaan-m/ECC)
(v2.2.3, MIT, see `ECC-LICENSE`). Only the agent and skill definitions are copied;
ECC's hooks, rules and install scripts are deliberately not used.

Every Claude Code session that starts in this repository can use these agents
(for example `architect`, `code-reviewer`, `security-reviewer`, `java-reviewer`).

## Agents

| Agent | Use for |
|---|---|
| architect, planner, code-explorer | Analysis, design and planning (V2) |
| code-reviewer, typescript-reviewer | Reviewing the current JS code |
| java-reviewer, java-build-resolver | Spring Boot V2 |
| security-reviewer | Rules, public endpoints, secrets |
| tdd-guide, pr-test-analyzer, e2e-runner | Tests (pragmatic: behaviour, not every detail) |
| refactor-cleaner, silent-failure-hunter, performance-optimizer | Tech debt |
| a11y-architect | Accessibility / responsive UI |
| doc-updater | Keeping docs in line with the code |

## Updating

Copy newer versions of the same files from the ECC repository (`agents/<name>.md`,
`skills/<name>/`). Keep the selection small: every agent description is loaded
into each session.
