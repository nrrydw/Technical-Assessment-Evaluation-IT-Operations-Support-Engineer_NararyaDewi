# AI Session / Prompt Steering Log

## Purpose

This file records the AI-assisted development and validation process for the Easy Rent Bali technical assessment.

> Note: This is a transparent reconstruction of the AI-assisted work performed in this submission. It is not presented as an exported transcript from a separate external CLI/IDE session.

---

## Iteration 1 — Understand the assessment

### Prompt

> Review the supplied Easy Rent Bali IT Operations & Support Engineer assessment. Identify every required deliverable and preserve the exact requested repository structure. Do not add unrelated work.

### Validation

The assessment requires:

- README.md for Task 1 and Task 2;
- triage.js or triage.py for Task 3;
- fleet_status.json;
- ai_session_logs/ with two required log files.

The requirements were taken directly from the assessment.

### Correction / Steering

The implementation must not omit the mandatory AI log directory, even though the actual operational code is small.

---

## Iteration 2 — Task 1 RCA

### Prompt

> Analyze the checkout error. Explain the root cause from the supplied request payload and stack trace. Provide a defensive JavaScript/TypeScript patch using null-safe access. Also explain how failed in-flight requests can be recovered without losing or duplicating bookings.

### Validation

The payload contains `doc_urls: null`, while the error says the application attempted to read `passport_scan` from null.

The patch therefore needs to prevent an unhandled property access and return a controlled compliance result.

### Correction / Steering

Avoid claiming that `license_verified: true` proves that a passport/KTP document exists. These are separate validation conditions.

Also avoid automatically retrying a booking without checking vehicle availability and idempotency.

---

## Iteration 3 — Task 2 QA Matrix

### Prompt

> Build a prioritized QA matrix covering the explicit assessment categories: happy path, timezone boundaries, voucher case/sub-threshold/expiry, missing document objects, and concurrent double booking. Include the exact required columns and use P1-P4 severity.

### Validation

The matrix includes more than the required six cases and explicitly covers all requested edge-case categories.

Important boundaries included:

- exactly 24 hours;
- less than 24 hours;
- exactly IDR 500,000;
- below IDR 500,000;
- voucher casing;
- expired voucher;
- null document object;
- overlapping concurrent bookings;
- timezone conversion.

### Correction / Steering

Do not invent a voucher expiry date because the assessment does not provide one. Test the expired-voucher state instead of asserting a specific date.

---

## Iteration 4 — Task 3 Script

### Prompt

> Write a functional Node.js triage script for the supplied fleet_status.json. Alert when overdue_hours > 0 OR when status is rented and fuel_level < 20%. Include plate, model, status, and urgency tags for overdue and low fuel.

### Validation

Expected matches were manually derived from the supplied data:

1. DK 5678 CD — overdue and low fuel.
2. DK 3456 GH — overdue.
3. DK 7890 IJ — low fuel.

The available Mitsubishi Xpander is excluded.

### Correction / Steering

Fuel is stored as a string such as `"15%"`, so the script must parse the numeric percentage before comparing it with `20`.

---

## Iteration 5 — Defensive script review

### Prompt

> Review the triage script for malformed JSON, missing fields, invalid fuel strings, and accidental false positives. Keep it simple enough for a technical assessment.

### Validation

The final script:

- catches file read errors;
- catches JSON parsing errors;
- validates that the root is an array;
- parses percentage strings safely;
- uses the exact OR condition required by the assessment;
- generates tags based on the same conditions.

### Final acceptance check

Command:

```bash
node triage.js
```

Expected alerts:

```text
DK 5678 CD — 🚨 OVERDUE | ⚠️ LOW FUEL
DK 3456 GH — 🚨 OVERDUE
DK 7890 IJ — ⚠️ LOW FUEL
```

No alert should be generated for:

```text
DK 1234 AB
DK 9012 EF
```
