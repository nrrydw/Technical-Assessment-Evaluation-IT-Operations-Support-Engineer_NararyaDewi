# Easy Rent Bali — IT Operations & Support Engineer Assessment

## Repository submission map

| Assessment task | Requirement | Repository artifact |
|---|---|---|
| Task 1 | RCA, defensive patch, operational impact | `README.md` |
| Task 2 | Prioritized QA edge-case matrix, minimum 6 cases | `README.md` |
| Task 3 | Functional AI-assisted fleet triage script | `triage.js` + `fleet_status.json` |
| Task 4 | AI interaction/prompt and coding trails | `ai_session_logs/` |

> **Source of requirements:** Technical Assessment & Evaluation: IT Operations & Support Engineer, Easy Rent Bali. The assessment specifies a 2–3 hour task, GitHub repository or Google Drive ZIP submission, and the repository layout used here.

### Repository layout

```text
├── README.md
├── triage.js
├── fleet_status.json
└── ai_session_logs/
    ├── triage_prompt_log.md
    ├── agent_coding_log.txt
    └── HistoryChat_GPT.pdf
```

The first four items match the required assessment layout. `HistoryChat_GPT.pdf` is an additional evidence file containing the exported AI session.

---

# PRD / Assessment Review

## Role and scope

The assessment is for an **IT Operations & QA Support Engineer (AI-Oriented)**. It combines:

1. Production incident triage and root-cause analysis.
2. QA test design for rental-duration, voucher, timezone, identification, and booking-conflict rules.
3. AI-assisted operational scripting against a fleet JSON input.
4. Mandatory AI session evidence showing prompt structure, validation, and correction/steering.

The requested repository contains the required `README.md`, `triage.js`, `fleet_status.json`, and `ai_session_logs/` directory.

---

# Task 1 — Production Incident Triage & Root Cause Analysis

## 1. Root Cause Analysis

The checkout request fails with a **500 Internal Server Error** because the production code reaches:

```text
validateCustomerCompliance
```

and attempts to read:

```text
passport_scan
```

from a value that is `null`.

The request payload explicitly contains:

```json
"customer": {
  "id": "cust_8810",
  "license_verified": true,
  "doc_urls": null
}
```

The stack trace points to:

```text
/app/dist/services/compliance.js:42:28
```

inside `validateCustomerCompliance`, called by `processBooking`.

### Technical failure chain

1. Checkout receives a customer whose `doc_urls` is `null`.
2. Compliance validation assumes a document object exists.
3. The validator dereferences `passport_scan` from that null value.
4. JavaScript throws `TypeError: Cannot read properties of null`.
5. The exception propagates through `processBooking` and the booking controller.
6. The request returns HTTP 500 instead of a controlled validation result.

The important distinction is that `license_verified: true` does not establish that a required foreign-customer passport document object exists. The validator should independently validate the document payload before accessing nested properties.

## 2. Defensive Patch

A defensive implementation should treat the document payload as optional at the JavaScript boundary, then apply the business rule explicitly.

```ts
type Customer = {
  id: string;
  license_verified?: boolean;
  doc_urls?: {
    passport_scan?: string | null;
    ktp_scan?: string | null;
  } | null;
};

type ComplianceResult = {
  valid: boolean;
  reason?: string;
};

function validateCustomerCompliance(
  customer: Customer
): ComplianceResult {
  const documents = customer.doc_urls ?? {};

  // Do not dereference nested document properties until the object
  // has been normalized from null/undefined to a safe fallback.
  const passportScan = documents.passport_scan ?? null;
  const ktpScan = documents.ktp_scan ?? null;

  // Example defensive behavior:
  // return a controlled validation result rather than throwing a TypeError.
  if (!customer.license_verified) {
    return {
      valid: false,
      reason: "Customer license has not been verified."
    };
  }

  if (!passportScan && !ktpScan) {
    return {
      valid: false,
      reason: "Required identification document is missing."
    };
  }

  return { valid: true };
}
```

### Why this patch is safer

- `customer.doc_urls ?? {}` prevents a null/undefined dereference.
- `passport_scan ?? null` normalizes an absent value.
- Missing documentation becomes a controlled validation result instead of an unhandled exception.
- The validation layer remains responsible for deciding whether the available document satisfies the renter's identification requirement.

For the production application, the exact domestic-vs-foreign document rule should be implemented using the application's authoritative customer nationality/type field. The supplied incident payload does not include that field, so this assessment does not invent one.

## 3. Operational Impact Assessment

Existing failed checkout requests should be handled as recoverable booking attempts rather than silently discarded.

Recommended operational flow:

1. **Capture the failed booking identifier**
   - Example: `erb_live_99482`.
   - Preserve the original request context and timestamp in incident logs.

2. **Prevent duplicate booking creation**
   - Use `booking_id` as an idempotency key.
   - A retry of the same checkout should update/recover the existing attempt rather than create a second booking.

3. **Apply the defensive validation patch**
   - Missing/null document data should return a controlled validation state.

4. **Retry only after validation is safe**
   - Do not blindly replay all failed requests against the broken code path.

5. **Re-check vehicle availability before confirmation**
   - The vehicle may have been booked by another customer while the original request was failing.
   - A successful retry must still enforce the no-overlap booking rule.

6. **Preserve customer-facing state**
   - The customer should receive either a recovered confirmation or a clear action-required message.
   - Avoid reporting a booking as confirmed unless the booking transaction actually completed.

7. **Reconcile the affected incident window**
   - Search logs using the booking IDs and checkout timestamps around the incident.
   - Identify failed, retried, and successfully recovered bookings.
   - Confirm that no duplicate booking or lost booking was introduced during recovery.

---

# Task 2 — QA Edge-Case Test Matrix

### Rules under test

- Minimum rental duration is strictly 24 hours.
- `BALIFAST` gives 10% off when the order is **strictly >= IDR 500,000**.
- Overlapping bookings for the same vehicle ID must be rejected.
- Domestic renters require KTP.
- Foreign tourists require Passport.

| Test ID | Category | Scenario Description | Input Payload / Mock Data | Expected Result | Severity |
|---|---|---|---|---|---|
| QA-001 | Happy Path | Domestic renter books exactly 24 hours with valid KTP and an eligible `BALIFAST` order | `pickup=2026-08-25T10:00:00+08:00`, `return=2026-08-26T10:00:00+08:00`, `amount=500000`, `voucher=BALIFAST`, `ktp_scan=valid`, vehicle has no overlap | Booking accepted; 10% voucher discount applied; KTP accepted; no overlap | P1 |
| QA-002 | Rental Duration | Booking is 1 minute short of the minimum duration | `pickup=2026-08-25T10:00:00+08:00`, `return=2026-08-26T09:59:00+08:00` | Booking rejected because duration is `< 24 hours` | P1 |
| QA-003 | Timezone | Checkout timestamp is 23:59 WITA and request dates are serialized in UTC | Created `2026-08-24T23:59:00+08:00`; `pickup=2026-08-25T00:00:00+08:00` serialized as `2026-08-24T16:00:00Z`; return exactly +24h | Server preserves the intended instant/timezone conversion; duration remains exactly 24h; no one-hour/date shift causes a false rejection or acceptance | P1 |
| QA-004 | Voucher Boundary | Order amount is exactly IDR 500,000 using correctly cased `BALIFAST` | `amount=500000`, `voucher=BALIFAST` | 10% discount is applied because threshold is inclusive (`>= 500000`) | P1 |
| QA-005 | Voucher Boundary | Order amount is IDR 499,999 using `BALIFAST` | `amount=499999`, `voucher=BALIFAST` | No 10% discount; booking may continue if all other rules pass | P2 |
| QA-006 | Voucher Validation | Voucher casing differs from configured code | `amount=600000`, `voucher=balifast` | Reject voucher or treat it as invalid according to the specified case-sensitive implementation; must not silently grant the discount | P2 |
| QA-007 | Voucher Lifecycle | Voucher is expired but order amount meets the threshold | `amount=750000`, `voucher=BALIFAST`, `expires_at` before request time | Voucher rejected as expired; no discount applied | P2 |
| QA-008 | Data Anomaly | Foreign renter has `doc_urls: null` | `nationality=foreign`, `doc_urls=null`, `passport_scan` unavailable | Controlled validation failure; no TypeError/HTTP 500 from null dereference | P1 |
| QA-009 | Identification | Domestic renter provides Passport but no KTP | `nationality=domestic`, `passport_scan=valid`, `ktp_scan=null` | Booking rejected because domestic renter requires KTP | P1 |
| QA-010 | Identification | Foreign tourist provides valid Passport | `nationality=foreign`, `passport_scan=valid`, `ktp_scan=null` | Identification requirement passes | P1 |
| QA-011 | Concurrency / Double Booking | Two requests attempt the same vehicle for overlapping intervals at nearly the same time | Same `vehicle_id=car_avanza_04`; same or overlapping pickup/return; concurrent transactions | At most one booking succeeds; the other is rejected/rolled back without creating an overlap | P1 |
| QA-012 | Boundary / Vehicle Availability | Two bookings for the same vehicle touch exactly at the boundary | Booking A return `2026-08-26T10:00:00+08:00`; Booking B pickup `2026-08-26T10:00:00+08:00` | Adjacent bookings are allowed if the product defines intervals as non-overlapping at the exact endpoint; implementation must be consistent | P3 |

### Priority rationale

- **P1:** Can directly cause lost bookings, duplicate bookings, invalid compliance, incorrect checkout acceptance/rejection, or production 500s.
- **P2:** Important functional/business-rule defects with a narrower impact.
- **P3:** Boundary/behavior consistency issue that should be covered but is less immediately damaging.
- **P4:** No P4 case is necessary to satisfy the core risk-focused scope; the matrix prioritizes the production-critical paths.

---

# Task 3 — AI-Assisted Operational Scripting

## Functional requirement

`triage.js` reads `fleet_status.json` and flags a vehicle when:

```text
overdue_hours > 0
OR
(status == "rented" AND fuel_level < 20%)
```

Run:

```bash
node triage.js
```

or:

```bash
node triage.js fleet_status.json
```

## Expected alert behavior for the supplied mock data

The script flags:

- `DK 5678 CD` — Toyota Avanza — rented — 15% fuel — 3h overdue
- `DK 3456 GH` — Honda Scoopy — rented — 90% fuel — 5h overdue
- `DK 7890 IJ` — Yamaha NMAX — rented — 10% fuel — low fuel

`DK 9012 EF` is available at 40% fuel and has no overdue hours, so it is not alerted.

The script is intentionally dependency-free and uses only Node.js built-ins.

---

# Task 4 — Mandatory AI Session Export & Prompt Steering Log

The assessment requires verifiable AI interaction trails showing:

- how prompts were structured;
- how generated responses were validated; and
- how candidate corrections steered the agent when code was suboptimal or buggy.

This submission includes the structured prompt/coding logs together with the exported ChatGPT conversation used during the assessment. The exported conversation is included as the original session evidence; the Markdown/TXT files organize the relevant iterations and validation steps for easier review.

See:

- `ai_session_logs/triage_prompt_log.md` — structured prompt and iteration log for Tasks 1 and 2.
- `ai_session_logs/agent_coding_log.txt` — coding, validation, and correction trail for Task 3.
- `ai_session_logs/HistoryChat_GPT.pdf` — exported ChatGPT session evidence.

---

# Final Pre-Submission Checklist

- [x] `README.md` contains Task 1 RCA + defensive patch + operational impact.
- [x] `README.md` contains 6+ prioritized QA cases and required columns.
- [x] `triage.js` is a functional Node.js script.
- [x] `fleet_status.json` contains the assessment's mock fleet data.
- [x] `ai_session_logs/` contains the required prompt/coding logs.
- [x] `ai_session_logs/HistoryChat_GPT.pdf` contains the exported ChatGPT session evidence.
- [x] AI evidence documents prompt structure, validation, and correction/steering.
- [ ] Run `node triage.js` and verify the output before uploading.
- [ ] Put the final repository at the exact requested layout; do not nest these files inside another assessment folder in the repository root.
