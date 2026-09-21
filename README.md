# Easy Rent Bali — IT Operations & Support Engineer Technical Assessment

## PRD / Assessment Review

This submission addresses all four requested tasks:

1. Production Incident Triage & Root Cause Analysis
2. QA Edge-Case Test Matrix
3. AI-Assisted Operational Scripting
4. AI Session Export & Prompt Steering Log

The implementation is intentionally defensive and focuses on preventing customer booking loss while making operational failures visible and actionable.

---

# Task 1 — Production Incident Triage & Root Cause Analysis

## 1. Root Cause Analysis (RCA)

The checkout failure is caused by a null document payload being accessed as if it were an object.

The production request contains:

```json
"customer": {
  "id": "cust_8810",
  "license_verified": true,
  "doc_urls": null
}
```

The stack trace then reports:

```text
TypeError: Cannot read properties of null (reading 'passport_scan')
```

The failure occurs inside:

```text
validateCustomerCompliance
/app/dist/services/compliance.js:42:28
```

and propagates through `processBooking` into the booking controller.

### Technical root cause

`doc_urls` is explicitly `null`, but the compliance validation code attempts to read a nested property such as:

```js
customer.doc_urls.passport_scan
```

without first checking whether `doc_urls` exists.

Therefore, the request reaches the compliance layer with a valid customer object but an absent document object, and JavaScript throws a `TypeError`. This produces the observed HTTP 500 instead of a controlled validation response.

### Important observation

`license_verified: true` does not necessarily mean the required identity-document payload is present. The validation layer should independently validate the shape and completeness of `doc_urls`.

---

## 2. Defensive Patch

A safe implementation should distinguish:

- missing/null document data;
- domestic KTP requirements;
- foreign passport requirements;
- a valid document URL.

Example TypeScript implementation:

```ts
type Customer = {
  id: string;
  license_verified?: boolean;
  nationality?: "domestic" | "foreign";
  doc_urls?: {
    ktp_scan?: string | null;
    passport_scan?: string | null;
  } | null;
};

type ComplianceResult =
  | { valid: true }
  | { valid: false; reason: string };

export function validateCustomerCompliance(
  customer: Customer
): ComplianceResult {
  const docs = customer.doc_urls ?? {};

  if (!customer.license_verified) {
    return {
      valid: false,
      reason: "Customer license/identity verification is incomplete."
    };
  }

  const passportScan = docs.passport_scan ?? null;
  const ktpScan = docs.ktp_scan ?? null;

  if (customer.nationality === "foreign" && !passportScan) {
    return {
      valid: false,
      reason: "Passport scan is required for foreign renters."
    };
  }

  if (customer.nationality === "domestic" && !ktpScan) {
    return {
      valid: false,
      reason: "KTP scan is required for domestic renters."
    };
  }

  return { valid: true };
}
```

If the existing production schema does not contain `nationality`, the API should determine the renter type from the application's authoritative customer profile before applying the document rule.

### Minimum defensive fix

Even without changing the surrounding business rules, the immediate null-safety issue can be prevented with:

```js
const passportScan = customer?.doc_urls?.passport_scan ?? null;

if (!passportScan) {
  return {
    valid: false,
    reason: "Passport document is missing."
  };
}
```

The important part is that missing document data must produce a controlled validation result rather than an unhandled exception.

---

## 3. Operational Impact Assessment

The failed checkout request should be handled as a recoverable transaction rather than silently discarded.

Recommended operational flow:

1. **Do not create or confirm a duplicate booking automatically.**
   - Keep the original `booking_id` (`erb_live_99482`) as the idempotency/reference key.

2. **Persist the failed checkout attempt.**
   - Store the booking ID, customer ID, vehicle ID, requested dates, voucher, failure reason, and timestamp.

3. **Return a controlled response to the customer.**
   - Avoid exposing stack traces.
   - Tell the customer that checkout could not be completed and that the request is being reviewed/retryable.

4. **Allow a safe retry.**
   - Retry should be idempotent using `booking_id` or an equivalent idempotency key.
   - Before confirming, re-check vehicle availability and voucher validity.

5. **Do not assume the vehicle is still available.**
   - Another booking could have been created during recovery.

6. **Re-run compliance validation after the defensive patch.**
   - If required documentation is missing, the request should enter a validation/manual-review state rather than becoming a 500.

7. **Monitor and alert.**
   - Track the error rate for `validateCustomerCompliance`.
   - Alert operations if checkout failures exceed an agreed threshold.

### Suggested recovery states

```text
CHECKOUT_FAILED_RECOVERABLE
        |
        +--> documents missing --> ACTION_REQUIRED
        |
        +--> documents valid
                |
                +--> vehicle available --> RETRY / CONFIRM
                |
                +--> vehicle unavailable --> ALTERNATIVE_VEHICLE / MANUAL_REVIEW
```

This approach minimizes the risk of losing a customer booking while preventing duplicate reservations.

---

# Task 2 — QA Edge-Case Test Matrix

The matrix follows the assessment rules:

- Minimum rental duration: strictly 24 hours.
- `BALIFAST`: 10% discount only when order amount is strictly >= IDR 500,000.
- Identical vehicle IDs must not have overlapping bookings.
- Domestic renters require KTP.
- Foreign renters require Passport.

| Test ID | Category | Scenario Description | Input Payload / Mock Data | Expected Result | Severity (P1-P4) |
|---|---|---|---|---|---|
| TC-001 | Happy Path | Domestic renter books exactly 24 hours with valid KTP and no conflicting booking. | pickup `2026-08-25T10:00:00+08:00`, return `2026-08-26T10:00:00+08:00`, amount IDR 600,000, KTP present, vehicle `car_avanza_04` available | Booking is accepted; rental duration is exactly 24h; no voucher discount unless voucher supplied. | P1 |
| TC-002 | Duration Boundary | Rental is 1 minute shorter than 24 hours. | pickup `10:00`, return `09:59` next day | Booking is rejected because duration is < 24h. | P2 |
| TC-003 | Duration Boundary | Rental is exactly 24 hours. | pickup `10:00`, return `10:00` next day | Booking is accepted if all other validation rules pass. | P1 |
| TC-004 | Timezone | Booking created at 23:59 WITA and timestamps are serialized to UTC. | pickup `2026-08-25T23:59:00+08:00` => UTC `2026-08-25T15:59:00Z`; return exactly +24h | System preserves the intended 24-hour duration after timezone conversion; no accidental off-by-one-day rejection. | P1 |
| TC-005 | Voucher Boundary | `BALIFAST` is applied to exactly IDR 500,000. | order total `500000`, voucher `BALIFAST` | 10% discount is applied; discounted subtotal becomes IDR 450,000 before any other applicable fees/rules. | P1 |
| TC-006 | Voucher Boundary | `BALIFAST` is applied below threshold. | order total `499999`, voucher `BALIFAST` | Voucher is rejected/not applied because amount is < IDR 500,000. | P2 |
| TC-007 | Voucher Case | Voucher is supplied with different casing. | voucher `balifast` or `Balifast`, amount `600000` | System follows the documented case-sensitivity rule. If codes are intended to be case-sensitive, reject; if normalization is specified, normalize consistently. | P3 |
| TC-008 | Voucher Expiry | Expired `BALIFAST` is supplied for an otherwise eligible order. | amount `600000`, voucher expired | Voucher is rejected with a controlled reason; order should not receive the discount. | P2 |
| TC-009 | Identification Anomaly | Foreign renter has `doc_urls: null`. | nationality `foreign`, `doc_urls: null`, `license_verified: true` | No 500 error. Validation returns a controlled failure requiring passport documentation. | P1 |
| TC-010 | Identification Anomaly | Domestic renter has missing KTP. | nationality `domestic`, `doc_urls: { ktp_scan: null }` | Booking is rejected/held for missing KTP; no unhandled exception. | P1 |
| TC-011 | Double Booking | Two concurrent requests attempt to reserve the same vehicle for overlapping periods. | same vehicle ID; Request A and B overlap | Exactly one booking is confirmed; the other is rejected/held after an atomic availability check/transaction. | P1 |
| TC-012 | Non-Overlap | Same vehicle has sequential bookings where second pickup equals first return. | Booking A ends `10:00`; Booking B starts `10:00` | Both are accepted if the product's interval semantics define end time as available at the return boundary. | P2 |
| TC-013 | Voucher + Time Boundary | Exactly 24h rental at amount exactly IDR 500,000 with valid `BALIFAST`. | duration 24h, amount 500000, voucher `BALIFAST` | Both boundary rules pass and the 10% voucher discount is applied. | P1 |
| TC-014 | Regression | Customer has `license_verified: true` but `doc_urls: null` during checkout. | Same shape as production incident | API returns a controlled validation response and logs a structured compliance failure; no HTTP 500 from null property access. | P1 |

## Priority rationale

- **P1**: Booking, payment/checkout, identity compliance, or double-booking risks that can directly affect production transactions or customer data.
- **P2**: Important functional boundary failures with meaningful customer impact but generally more contained.
- **P3**: Lower-impact validation/consistency cases.
- **P4**: Reserved for cosmetic/non-critical issues; no P4 case was necessary for the highest-risk scenarios in this assessment.

---

# Task 3 — AI-Assisted Operational Scripting

The input file is `fleet_status.json`.

The script `triage.js`:

- loads the JSON input;
- selects vehicles where `overdue_hours > 0`;
- also selects rented vehicles with fuel below 20%;
- generates operational urgency tags;
- prints a formatted Slack/WhatsApp-style alert.

Run:

```bash
node triage.js
```

Expected operational matches:

- `DK 5678 CD` — Toyota Avanza — OVERDUE + LOW FUEL
- `DK 3456 GH` — Honda Scoopy — OVERDUE
- `DK 7890 IJ` — Yamaha NMAX — LOW FUEL

The available Mitsubishi Xpander is not included because it is neither overdue nor rented with fuel below 20%.

---

# Task 4 — AI Session Export & Prompt Steering Log

The `ai_session_logs/` directory contains a curated evidence record based on the actual ChatGPT working session used for this assessment:

- `triage_prompt_log.md` — prompt structure, AI output, validation, and actual candidate steering/corrections.
- `agent_coding_log.txt` — implementation and validation trail, including the real Task 4 evidence review.

**Evidence integrity:** these files are not represented as a raw platform-generated ChatGPT export. No fabricated CLI transcript or fake buggy-code correction is included. The available session shows requirement steering and validation; it does not contain a real event where the candidate found a buggy `triage.js` and instructed the agent to fix that specific defect. If a strict platform-generated export is required, the actual ChatGPT export should be added to this directory as additional evidence.

---

# Repository Structure

```text
easy-rent-bali-it-ops-submission/
├── README.md
├── triage.js
├── fleet_status.json
└── ai_session_logs/
    ├── triage_prompt_log.md
    └── agent_coding_log.txt
```

## Validation

Test the automation script with:

```bash
node triage.js
```

The script should exit with code `0` and print only the vehicles matching the required triage conditions.
