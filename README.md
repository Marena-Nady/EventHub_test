
# EventHub QA Automation

Playwright and TypeScript tests for the EventHub ticket-booking flow. The suite
covers browser journeys and API behavior using Playwright Test and
`APIRequestContext`.

> **Test environment:** The example URLs point to the public EventHub practice
> app/API. Tests create and delete events and bookings. Use a dedicated
> automation account and an approved test environment; do not run the suite
> with a personal or shared account.

## Requirements

- Node.js 22 and npm
- Access to the EventHub web app and API
- A dedicated test account; a second account is optional for cross-account cases

## Install and configure

```powershell
npm ci
npx playwright install chromium
cp .env.example .env
```

Set these values in the local `.env` file:

| Variable | Required | Purpose |
|---|---:|---|
| `WEB_BASE_URL` | Yes | Base URL for the EventHub web app |
| `API_BASE_URL` | Yes | API base URL, including `/api` |
| `TEST_USER_EMAIL_A` | Yes | Email for the dedicated primary test account |
| `TEST_USER_PASSWORD_A` | Yes | Password for the dedicated primary test account |
| `TEST_USER_EMAIL_B` | Optional | Second account for cross-account isolation tests |
| `TEST_USER_PASSWORD_B` | Optional | Must be set together with Account B's email |

The `.env.example` file contains the public example URLs and blank credential
fields. Replace the blanks with values for your approved environment. `.env` is
git-ignored and must not be committed. Authenticated tests sign in through
framework fixtures; do not add static tokens to the source or test data.

**Credentials are not included in this repository or README.** Obtain a
dedicated test account from the environment owner and enter its values locally
or configure them as GitHub Actions secrets. Account A is required for the
authenticated suite. Account B is optional; tests that need it are skipped
without the complete B credential pair.

## Run tests

| Command | What it runs |
|---|---|
| `npm test` | API and UI suites |
| `npm run test:api` | API tests only |
| `npm run test:ui` | Chromium UI tests only |
| `npm run test:list` | List discovered tests without running them |
| `npm run typecheck` | TypeScript check |

The Playwright HTML report is generated at `playwright-report/`. To open it
after a run:

```powershell
npx playwright show-report
```

Playwright writes per-test output, including failure screenshots, to
`test-results/`. The HTML report is separate. Screenshots are captured on
failure; traces and videos are currently disabled. The report is configured
not to open automatically.

## Continuous integration

The workflow is `.github/workflows/playwright.yml`. It runs on every push to
every branch and also supports manual dispatch. The job uses Node.js 22, runs
`npm ci`, installs Chromium, type-checks and lists tests, then runs the API and
UI suites. CI forbids focused tests and uses a 45-minute job timeout.

Configure these repository settings before running the workflow:

| GitHub setting | Required | Used for |
|---|---:|---|
| Actions Variable `WEB_BASE_URL` | Yes | Web app base URL |
| Actions Variable `API_BASE_URL` | Yes | API base URL |
| Actions Secret `TEST_USER_EMAIL_A` | Yes | Primary test account |
| Actions Secret `TEST_USER_PASSWORD_A` | Yes | Primary test account |
| Actions Secret `TEST_USER_EMAIL_B` | Optional | Second test account |
| Actions Secret `TEST_USER_PASSWORD_B` | Optional | Second test account |

Account B credentials must be supplied as a pair or both left unset. The
workflow checks required settings without printing secret values. After each
run, it uploads `playwright-report/` and `test-results/` as a downloadable
artifact with 14-day retention, including when tests fail. If setup fails
before Playwright generates a report, the workflow warns that no HTML report is
available. A completed remote Actions run and downloaded artifact still need
to be verified after the workflow is pushed and configured.

---

# Business Analysis — EventHub

## 1. Assumptions,  Business Gaps,  and Findings

### 1.1 My Assumptions

1. I assumed that cancelled bookings are remains at "My bookings" page wth state "Cancelled" not being permanently deleted
2. I assumed some max length for some fields that are not mentioned in the swagger
   - max name length=30
   - max phone length=15
   - max email length =30
3. I assumed that the user can't book a ticket to an outdated event or started event, So Test cases related to an ended event(outdated) or started event are commented in the code as there's no provided test data to execute those tests (I can't create an event with dates in the past)
4. I assumed that the concurrent bookings are handeled (when 2 different users trying to book the last ticket of an event) and I considered it as a bug
5. I assumed that there's no guest mode and the user must be authenticated to performe a booking
6. I assumed that there's no refunding or payment methods during the booking process and I wrote it in the PO questions section as well

### Documented versus observed behavior

Discovery against the public practice app/API was performed on 2026-11-13.
These are dated observations, not a guarantee that shared environment data
remains unchanged.

| Finding | Reproduction / expected behavior | Observed behavior and status |
|---|---|---|
| Event/booking authentication | Compare `GET /events` and `GET /bookings` without a token and with a valid token. OpenAPI does not declare security for these operations. | Anonymous requests returned 401; authenticated requests returned 200. **Confirmed OpenAPI security-documentation gap.** |
| Registration password rules | Compare the registration UI with the documented API minimum of 6 characters. | UI guidance requires at least 8 characters, uppercase, number, and symbol. Whether the API accepts a password meeting only the documented minimum was not tested. **Clarify/update the contract.** |
| Booking reference format | Create a booking and compare the returned/displayed reference with the documented `EVT-XXXXXX` pattern. | UI and API produced `D-XXXXXX`. **Confirmed contract/runtime mismatch; intended format needs confirmation.** |
| Cancellation record | Create a booking, cancel it, then read it by ID/reference and list bookings. Swagger says DELETE permanently deletes the booking and restores seats; the schema also lists `cancelled`. | DELETE returned 200, seats were restored, and later lookups returned 404; no cancelled record remained. Runtime matches the DELETE description, but the story/schema leave retained-status expectations unclear. A spreadsheet case expecting retained cancelled records conflicts with the documented DELETE behavior. |
| Embedded seat count | Create a booking; compare `data.event.availableSeats` in the booking response/lookup with `GET /events/{id}`. | The embedded value remained stale while the event endpoint showed the updated availability. **Confirmed response inconsistency; intended representation is unknown.** |
| Past events | Browse “Upcoming Events”, inspect dates, then try booking an event dated before the observation date. | Past-dated events appeared in the list and an October 2026 event was bookable on 2026-11-13. **Observed behavior; whether this is a defect is a Product Owner decision.** |
| Invalid JSON value types | API_008 posts wrong JSON types for `eventId`, name, email, phone, and quantity; it expects HTTP 400 and no seat change. | An earlier API_008 run failed because at least one invalid-type request was not rejected as expected. The saved run summary does not identify the exact field/status. **Re-run against the approved test environment before treating the finding as current.** |

Other observed checks succeeded: booking creation/read/listing, price
calculation, UI/API visibility for the same account, missing/invalid customer
values, quantity zero, insufficient seats, and seat restoration after deletion.
The discovery-created bookings were removed and their seats restored. The
synthetic account remains because no account-deletion operation is documented.


---

## 2. Questions for the Product Owner (PO)

### 2.1 Booking and Access

1. Does “visitor” mean someone without an account, or must users sign in?(guest mode allowed or not)
2. Can users book for someone else using different contact details?(it's available in the website but not mentioned in the story)
3. Can a user view or cancel another user’s booking using its reference or ID?
4. Can users book after an event starts or ends?(It's logical to be NO but it should be handeled with error msgs in the story)
5. What should happen when:
   - An event is sold out?(error msgs ?)
   - Two users try to book the last available seat?(Concurrent case: It's not handeled in the code and I assumed it a bug)
6. What is the min and max numbers of tickets the user can book?
7. Handling the 0 and negative ticket case
8. Handling invalid inputs in APIs while filling the booking details
9. Is there's a specific time frame the user can hold tickets before confirming his booking ? (after that time tickets are released)
10. When a user holds some tickets and he didn't confirm them yet, those tickets are removed from the system as they're now holded by a current user ? Or how we can handle it ?
11. Cancelled tickets by a user should be released again to be available for another users in the system?
12. Can the same visitor create multiple bookings for the same event with DIFFERENT booking data?
13. Can the same visitor create multiple bookings for the same event with the SAME booking data?
14. Write explicitly in the story all the mandatory fields across the workflow
15. What email formats should be accepted?
16. Is email uniqueness required, or can the same email be used for multiple bookings?
17. What phone number formats are supported? Are international country codes accepted?
18. How we can handle sql injections ?
19. Should the booking remain available after refreshing the page, logging out, or reopening the application?
20. If the server successfully creates the booking but the confirmation response is lost, how should the application prevent duplicate bookings when the user retries?
21. If guest booking is supported, how does the system identify the booking owner?
22. if a customer enters an email different from their logged-in account email, who owns the booking?
23. Is pagination required if a user has multiple bookings?
24. How should bookings be sorted: newest first or by event date?
25. What should happen when a user tries to access another user's booking directly using its booking ID or reference?

### 2.2 Price and Confirmation

1. Should prices always show decimal places? What currency and rounding rules should apply?
2. Are taxes, fees, or payment part of this flow?
3. Which price applies if the price changes while the user is booking?
4. What should the confirmation include besides the reference? Should an email be sent?
5. What information should appear on the confirmation screen?
6. Which booking reference format is correct: `Q-…` or `EVT-…`?
7. Are promotional codes or discounts supported?or in the future?if Yes how can we calculate the total price? what is the provided calculation formula ?

### 2.3 Cancellation

1. Should cancelled bookings disappear or remain visible with a cancelled status(soft deletion) ?(I assumed it should be shown with "Cancelled" status not to be hard deleted so I considered it a bug
2. Can users cancel at any time?Is there a cancellation deadline?
3. Can users cancel only part of a booking?
4. What should happen if a booking is cancelled twice?What should happen if the user attempts to cancel an already cancelled booking?
5. If payment applies, should a refund be issued after cancellation?
6. Is a confirmation prompt required before cancellation?
7. Should users receive an email/SMS notification after cancellation?

### 2.4 Validation and Errors

1. What are the required rules for name, email, and phone, including accepted lengths and international formats?
2. What messages should appear for:
   - Invalid details?(In APIs and UIs)
   - Unavailable seats?
   - A missing event?
   - Cancelling an event after it already ends ?
   - Entering empty values(white spaces only)  in required fields ?
   - Confirmation messages after confirming any form?
   - Displayed message when my bookings page is empty ?
   - Placeholders for any field?
   - Highlighting the mandatory fields with an astrisk?
3. How should duplicate bookings be prevented after a double-click (spam clicks) or a retry following a timeout?(I recommend that the button should be dimmed after the first click to avoid spam clicks in booking or payment buttons)
4. Is there's a session time for holding the tickets before confirming the booking ? (session timeout)

---

## 3. Test Data Cleanup

| Item | Cleanup status |
|---|---|
| Test events | Removed |
| Bookings associated with test events | Removed |
| Test accounts | Two accounts remain |

**Note:** The two test accounts remain because no account-deletion endpoint is documented.
