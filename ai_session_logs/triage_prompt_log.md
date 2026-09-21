# Task 4 — AI-Assisted Development Session Log

## Purpose
This document records the AI-assisted workflow used while completing the Easy Rent Bali technical assessment. The dialogue below is professionally paraphrased from the working session; it is not presented as a verbatim platform export.

## 1. Assessment Decomposition

**Candidate request**

> Review the assessment requirements, complete the four tasks, and prepare the submission in the required repository structure.

**AI response / action**

The assessment was divided into four workstreams: production incident RCA, QA edge-case coverage, fleet triage automation, and AI-session evidence. The required repository structure was identified before implementation.

**Validation**

The planned artifacts were checked against the submission instructions before packaging.

---

## 2. Task 1 — Production Incident RCA

**Candidate direction**

> Analyze the checkout failure, identify the root cause, and provide a defensive JavaScript/TypeScript approach that prevents the null-reference failure while preserving operational recovery.

**AI response / action**

The analysis identified `customer.doc_urls = null` as the immediate cause of the `passport_scan` null dereference. The proposed implementation introduced a safe fallback with nullish coalescing and explicit document validation.

**Validation performed**

- Verified that document properties are not accessed through a null object.
- Verified domestic KTP and foreign Passport requirements.
- Reviewed handling of failed in-flight requests, idempotency, availability re-checks, and controlled retry/manual-review paths.

---

## 3. Task 2 — QA Test Design

**Candidate direction**

> Build a prioritized test matrix that covers the stated rental, voucher, document, timezone, and concurrency rules, including boundary conditions.

**AI response / action**

A 14-case matrix was prepared using the assessment's required column structure. Cases covered exact 24-hour duration, below-minimum duration, WITA/UTC boundaries, voucher thresholds and case handling, document failures, overlapping bookings, and regression coverage for the production incident.

**Validation performed**

Each rule was mapped to at least one positive or negative boundary case, with severity assigned using the requested P1–P4 scale.

---

## 4. Task 3 — Fleet Triage Automation

**Candidate direction**

> Create the fleet data file and a Node.js triage script using the exact alert condition: overdue vehicles OR rented vehicles with fuel below 20 percent. Produce an operational alert format suitable for Slack or WhatsApp.

**AI response / action**

`fleet_status.json` was prepared from the supplied sample data and `triage.js` was implemented to parse the data, evaluate the two alert branches, assign urgency tags, and format the output.

**Validation performed**

The script was executed with Node.js against the supplied five-vehicle dataset. The expected alerts were produced for:

- DK 5678 CD — overdue and low fuel
- DK 3456 GH — overdue
- DK 7890 IJ — low fuel

No alert was produced for the two vehicles that satisfied neither condition. This confirmed the requested OR logic.

---

## 5. Candidate Review and Steering of the AI Output

**Candidate review**

> Re-check Task 4 against the exact wording of the assessment. Confirm whether the session evidence is sufficiently complete and identify what needs to be changed.

**AI response / action**

The Task 4 requirement was reviewed again. The evidence was reorganized so that the prompt structure, implementation response, validation activity, and candidate steering were clearly separated.

**Candidate follow-up**

> Identify exactly which repository files contain the Task 4 evidence and which files require changes.

**AI response / action**

The repository was checked and the `ai_session_logs/` directory was identified as the location for the two Task 4 evidence files. The top-level assessment artifacts did not require structural changes.

---

## 6. Authenticity and Scope Note

This log is a professional, paraphrased record of the actual working process rather than a verbatim ChatGPT export. It does not invent a bug-fix exchange that did not occur. In this session, the main candidate steering concerned requirements, validation, evidence quality, and repository structure.

If the evaluator requires a platform-generated ChatGPT export specifically, the original platform export should be supplied as additional evidence.
