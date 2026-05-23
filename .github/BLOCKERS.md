# Blockers & Issues Log

> **Project**: Strix IDE  
> **Purpose**: Track unresolved issues that block workflow progress  
> **Owner**: strix-troubleshooter (writes), strix-workflow-coordinator (reads)

---

## Active Blockers

(None at this time)

---

## Blocker Template

```markdown
## Blocker #N: [Issue Title]

- **Severity**: [Critical/Blocking/High/Medium/Low]
- **Affected Phase**: [Phase number]
- **Affected Agent(s)**: [List agents]
- **Date Reported**: YYYY-MM-DD
- **Date Resolved**: (if resolved)

### Issue Description
[What is the problem?]

### Root Cause
[What caused it? (from troubleshooter diagnosis)]

### Impact
[What doesn't work as a result?]

### Resolution Steps
1. [Step 1]
2. [Step 2]
3. [Step 3]

### Status
- [ ] Reported
- [ ] Diagnosed
- [ ] In Progress
- [ ] Resolved
- [ ] Verified

---
```

## Historical Blockers

(To be populated as issues are resolved)

---

## Escalation Path

1. **Agent encounters issue** → Calls **strix-troubleshooter**
2. **Troubleshooter diagnoses** → Adds blocker to this file
3. **Workflow Coordinator checks** → Blocks subsequent agents if `blockers[]` array not empty
4. **User resolves** → Updates ARCHITECTURE.md or fixes root cause
5. **Troubleshooter verifies** → Removes from blockers, updates status
