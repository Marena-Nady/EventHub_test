# EventHub QA Automation Implementation Plan

## Purpose and scope

This plan turns the practical assessment into a staged delivery for the single
end-to-end capability: booking event tickets, confirming the calculated price
and booking reference, finding the booking in **My Bookings**, and cancelling
it. The solution should cover both the web application and the documented API,
with shared framework-level authentication and a GitHub Actions workflow.

This document is a plan only. No application code, tests, configuration, or
workflow are implemented as part of this deliverable.

## Fixed assessment requirements and sources

- **UI automation:** Playwright with TypeScript.
- **API automation:** Playwright `APIRequestContext`, using the same Playwright
  Test runner. Do not substitute RestAssured, Axios, or a second API test runner.
- **Web application:** https://eventhub.rahulshettyacademy.com
- **Login entry point:** https://eventhub.rahulshettyacademy.com/login
- **Swagger:** https://api.eventhub.rahulshettyacademy.com/api/docs/
- **API base URL:** https://api.eventhub.rahulshettyacademy.com/api

Swagger is the starting contract for discovery, not a requirement to automate
every endpoint. Auth and event operations support the booking flow; unrelated
CRUD coverage is out of scope.

| Assessment requirement | Planned implementation | Required delivery evidence |
|---|---|---|
| Review the story and identify what is missing, unclear, or wrong | Phase 1 creates the README story review; later discoveries update it immediately | Specific Product Owner questions, explicit assumptions, and reproducible story/docs/application discrepancies |
| Build UI and API automation with an extensible architecture | Phases 2-5 use Playwright UI and `APIRequestContext`, typed clients, page objects, fixtures, and framework-owned authorization | Independent booking tests, documented extension points, and no login/token/header setup in booking tests |
| Run tests on every push and expose the report | Phase 6 runs both API and UI suites through GitHub Actions | Visible completed run, downloadable HTML report, and README configuration/secrets instructions |

**Current evidence boundary:** The public Swagger definition and login page
HTML have been read. No authenticated browser journey or live booking API
operation has been exercised for this document update. Contract ambiguities
below are not claims of confirmed application defects.

## Goals and completion criteria

The assessment is complete when the repository contains:

- A maintainable, strictly typed Playwright/TypeScript framework designed for
  a team to extend over the next several years.
- UI and API tests for the booking journey and its most important validation
  and business-rule cases.
- Shared authentication, isolated test data, and cleanup that only affects
  resources created by the current run.
- A GitHub Actions workflow that runs on every push, reports results, and
  publishes useful artifacts even when tests fail.
- A README with setup and run instructions, test coverage rationale, story and
  contract findings, CI configuration, key decisions, and remaining work.
- At least one successful, visible GitHub Actions run and an accessible
  repository link for submission.

Tests must verify actual behavior rather than assume that either the story or
the API documentation perfectly describes the running application. Any
discrepancy should be recorded with observed evidence and an explicit decision,
not silently reinterpreted.

## Proposed architecture

The repository currently has no established automation framework structure.
Start with a small set of clear boundaries and add abstractions only when
repeated behavior justifies them.

```text
.
├── .github/
│   └── workflows/
│       └── tests.yml
├── src/
│   ├── config/              # Base URLs, environment loading, typed config
│   ├── auth/                # Registration/login and token lifecycle
│   ├── api/                 # Typed API clients; no test assertions here
│   ├── data/                # Typed models and unique test-data factories
│   ├── fixtures/            # Playwright fixtures and per-test resource tracking
│   ├── pages/               # Page objects for event discovery, booking, bookings
│   └── support/             # Shared assertions/helpers only when reused
├── tests/
│   ├── api/                 # Booking API behavior and validation
│   └── ui/                  # Browser booking and My Bookings journeys
├── playwright.config.ts
├── package.json
├── tsconfig.json
└── README
```

### Responsibilities and boundaries

- **Configuration:** Read the web and API base URLs and optional account
  credentials from environment variables. Validate required values at startup;
  never hard-code credentials or print tokens.
- **Authentication:** Own registration/login, token storage, and attaching
  `Authorization: Bearer ...` to account-scoped API requests. Individual tests
  should request an authenticated fixture/client rather than implement
  authentication themselves. Swagger login instructs clients to send the token
  on subsequent requests, although events/bookings lack explicit OpenAPI
  security declarations. Send the account token through the framework and
  verify actual access behavior; absence of a declaration does not mean public
  access is intended.
- **API clients:** Encapsulate documented routes, request payloads, and typed
  response parsing. Keep them free of test-specific assertions so tests can
  state the expected behavior clearly.
- **Page objects:** Represent user-facing pages and meaningful actions using
  accessible locators where possible. Return locators or state and keep
  business assertions in tests. Compose shared UI components when repetition
  justifies them; avoid deep inheritance and a single application-wide object.
- **Fixtures and data lifecycle:** Provide per-test clients, browser context,
  unique customer data, and a registry of resources created by that test.
  Cleanup must run after failures as well as successes and must never target
  data not created by the current test. Report teardown failures explicitly
  without replacing the original failure or treating unsuccessful cleanup as
  success.
- **Tests:** Organize by interface and behavior. Keep tests independent; do not
  use run order or shared mutable records as setup.
- **CI:** Install deterministically with `npm ci`, install required Playwright
  browsers, run tests, and upload reports and failure diagnostics regardless
  of the test result.

### How authorization works without entering test bodies

```text
Validated environment configuration
  -> framework identity/auth fixture
     -> dedicated identity + registration/login + token validation
        -> authenticated APIRequestContext -> Events/Bookings clients
        -> fresh BrowserContext with verified UI session -> page objects
           -> booking tests perform business actions and assertions only
  -> fixture teardown: clean tracked bookings/events, then dispose contexts
```

- Discover whether the web app uses cookies, local storage, or another session
  mechanism. Reuse Playwright `storageState` only after proving it creates a
  working authenticated session; do not invent storage keys or assume an API
  token automatically authenticates the browser.
- Use separate server-side identities/resources for parallel mutations.
  Reusing authentication is not permission to share mutable bookings or seats.
  A fresh browser context alone does not isolate backend state.
- Keep token acquisition, validation, expiry handling, and request headers
  inside auth/fixtures. Re-authenticate during setup when needed, but never
  blindly replay a booking POST after an auth error: it can duplicate bookings.
- Anonymous/invalid-token tests receive an explicit unauthenticated framework
  fixture; they must not hand-roll authentication code.
- Keep session files git-ignored and outside report uploads. Review traces for
  token-bearing headers and authentication payloads; masking GitHub Secrets in
  console output does not sanitize trace ZIPs.

### Team-scale growth without premature complexity

- Add a feature by introducing its typed API client/page object, registering it
  in fixtures, and adding independent specs under the relevant UI/API folder.
  Existing booking specs should not need to change to add unrelated features.
- Use composition and dependency injection of `Page`/`APIRequestContext`; avoid
  global mutable clients, giant utility modules, and speculative base classes.
- Keep contract types and reusable business assertions shared, but do not copy
  API client calculations into test expectations. Calculate expected totals
  independently from event price and requested quantity, with verified currency
  precision/rounding rules.
- Record coverage choices and naming/fixture conventions in the README. Keep a
  lockfile and require type-checking and appropriate lint checks as the suite
  grows.
- Start with Chromium UI and a separate API project, so API tests are not
  duplicated per browser. Expand browser coverage and shard only when product
  requirements or measured runtime justify it; preserve report merging and
  per-worker data isolation when that happens.

## Implementation phases

### Phase 1 — Assessment review and live contract discovery

**Work**

1. Read the API documentation and inspect the web booking journey before
   writing expectations.
2. Record the observed screens, form fields, ticket quantity limits, price
   display, confirmation/reference behavior, My Bookings behavior, and
   cancellation result.
3. Exercise the documented API flow with a dedicated test account: registration
   and login, event lookup, booking creation, booking retrieval/listing, and
   booking deletion/cancellation behavior.
4. Compare actual results with the acceptance criteria and API contract.
   Capture response status/body shapes for material discrepancies.
5. Write the story review, assumptions, Product Owner questions, and initial
   findings into the README in this phase, before framework implementation.
   Update these sections as later phases uncover new evidence; Phase 6
   finalizes documentation rather than starting requirement analysis.

**Risks and questions to resolve**

- The documented `DELETE /bookings/{id}` permanently deletes a booking and
  restores seats, while the story says a user can cancel a booking and the
  documented model also includes a `cancelled` status. Confirm whether UI
  cancellation is a soft cancellation, permanent deletion, or differs from
  the API operation.
- The OpenAPI document does not declare events or bookings protected, while
  accounts are described as isolated sandboxes. Determine route access and
  account isolation from observed behavior.
- Confirm whether API booking creation and UI My Bookings use the same
  account/session data, and what the intended UI/API consistency boundary is.
- Confirm expected handling for boundary quantities, unavailable events,
  insufficient seats, and invalid customer details if behavior is not
  explicit in the UI.
- Does "visitor" mean a guest or an authenticated account? Who owns a booking
  when the customer email differs from the logged-in account email?
- What currency, precision, rounding, fees, or taxes apply to the stated
  price-times-quantity formula? What happens if price changes before submission?
- What constitutes valid name/phone input, and should UI and API validation
  enforce the same rules? Should a failed request leave seats/bookings unchanged?
- What are cancellation eligibility/time limits, repeat-cancellation behavior,
  and expected My Bookings state after cancellation? Is payment/refund behavior
  part of this story, or explicitly excluded?
- What should happen on double submission or a lost confirmation response?
  How is persistence demonstrated after refreshing My Bookings?

**README story-review and findings format**

- Story review: requirement, missing/unclear/contradictory detail, risk,
  Product Owner question, and provisional assumption with rationale.
- Findings: identifier, source (story or Swagger route/schema), expected
  behavior, observed behavior, reproducible steps, sanitized evidence,
  impact, and unresolved decision/status.
- Distinguish a confirmed runtime discrepancy from a documentation ambiguity.
  Keep tests checking the agreed/documented expectation; do not silently relax
  assertions or skip a defect merely to obtain a green report.

**Exit criteria**

- A written list of observed behavior versus documented behavior.
- No critical test expectation depends on an unverified assumption.
- Any unresolved product rule is stated explicitly in the README and test plan.

### Phase 2 — Framework foundation

**Work**

1. Initialize the TypeScript and Playwright project using repository-appropriate
   npm scripts and strict compiler settings.
2. Add validated environment configuration for the application and API URLs,
   plus optional credentials/secrets.
3. Define types for the event, booking request, booking response, and relevant
   error responses based on the documented contract, updating only when a
   verified runtime discrepancy is deliberately documented.
4. Create shared fixtures for API request context, browser context, test
   identity, unique customer data, and created-resource cleanup.
5. Centralize authentication and verify its behavior against `/auth/me` and
   any other route that is confirmed to need a token.
6. Add report and failure-diagnostic configuration, including Playwright
   HTML report and traces/screenshots on failure as appropriate.
7. Prove test discovery, strict type-checking, and one authenticated smoke
   journey before expanding coverage. Document how contributors add a feature
   without changing authentication or duplicating setup.

**Exit criteria**

- A clean install and a minimal framework smoke check work locally.
- Credentials are supplied externally and do not appear in source, reports, or
  CI logs.
- Authentication and cleanup are reusable and are not implemented inside
  individual tests.

### Phase 3 — API booking coverage

**Work**

Build API tests around Playwright `APIRequestContext` and the API client:

- Create a booking with valid customer details and quantity; assert success,
  required response fields, `EVT-XXXXXX` reference format, and booking lookup.
- Verify total price equals the event's ticket price multiplied by quantity.
- Verify the booking appears in the booking list and can be retrieved by the
  documented identifier/reference route.
- Cover meaningful input validation: missing/invalid fields, invalid email,
  phone/name constraints, and quantity boundaries (1 and 10) plus values
  outside the supported range.
- Cover insufficient seats and nonexistent event behavior where they can be
  tested safely with data owned by the test.
- Verify the observed cancellation/deletion outcome and seat restoration, while
  keeping permanent deletion clearly distinct from retained cancellation.
- Assert documented status codes and response shapes, recording differences
  rather than weakening assertions without explanation.

**Exit criteria**

- API coverage checks booking creation, price, reference, retrieval, errors,
  and cleanup/cancellation semantics.
- Tests run independently and do not rely on pre-existing shared events or
  bookings.
- Cleanup is limited to resources created by the test run.

### Phase 4 — UI booking coverage

**Work**

1. Implement page objects for the event list/details, booking form, confirmation,
   and My Bookings only for pages observed in Phase 1.
2. Use accessible roles/labels first and stable test IDs only when the UI has no
   durable accessible locator.
3. Automate the main flow: select an event and quantity, enter customer
   details, submit, and verify confirmation/reference and total.
4. Verify the booking is visible in My Bookings and exercise cancellation.
5. Add a focused set of UI validation checks for required fields and relevant
   quantity boundaries, based on the actual interface.
6. Avoid fixed sleeps; use Playwright auto-waiting and web-first assertions.

**Exit criteria**

- The UI happy path and key validation behavior are deterministic and readable.
- Tests do not depend on execution order or fragile selectors.
- Failure diagnostics make browser failures actionable.

### Phase 5 — UI/API consistency and regression

**Work**

- Verify a booking created through the UI is represented consistently by the
  API, if the live application supports that relationship and account model.
- Verify relevant booking details (reference, quantity, total, status) agree
  across surfaces.
- Exercise cancellation across the supported surface(s), confirming whether
  records remain, disappear, or change status and whether seats are restored.
- Keep any cross-surface scenario separate from core API/UI tests where
  independence or cleanup would otherwise become difficult.

**Exit criteria**

- Shared behavior is checked at the integration boundary without introducing
  hidden ordering dependencies.
- Any mismatch is captured as a product/API contract finding.

### Phase 6 — CI, reporting, and submission documentation

**Work**

1. Add a GitHub Actions workflow triggered on every push (and optionally pull
   requests). Do not restrict push execution to main or use path filters that
   omit the required UI/API suite.
2. Use `npm ci`, install the Playwright browser dependencies, run the suite,
   and publish the HTML report and useful diagnostics with an always-run
   artifact-upload step. Include type-checking, disallow committed `test.only`,
   preserve nonzero test exits, and set explicit job timeouts and artifact
   retention (initially 14 days). A report is available when tests run, not when
   install/setup failed before report generation; surface that distinction.
3. Store optional account credentials as GitHub Secrets and provide non-secret
   base URL configuration through environment variables.
4. Ensure logs and artifacts do not expose credentials, access tokens, or
   unnecessary customer data.
5. Update the README with prerequisites, setup, environment variables, local
   commands, UI/API test commands, report viewing, CI behavior and secrets,
   story/contract findings, coverage rationale, key decisions, and what would
   be improved with additional time.
6. Run the workflow, fix failures, and confirm a completed run is visible in
   the Actions tab before submission. Download and open the report rather than
   merely confirming the upload step is green; verify failing-run diagnostics
   and passing-run reports are useful and free of secrets.

**Planned README configuration and secrets contract**

| Setting | Local source | GitHub Actions source | Handling |
|---|---|---|---|
| `WEB_BASE_URL` | Environment or git-ignored local environment file | Repository variable or explicit non-secret workflow environment | `https://eventhub.rahulshettyacademy.com`; login path is `/login` |
| `API_BASE_URL` | Environment or git-ignored local environment file | Repository variable or explicit non-secret workflow environment | `https://api.eventhub.rahulshettyacademy.com/api`; define route resolution once to avoid dropping or duplicating `/api` |
| `TEST_USER_EMAIL`, `TEST_USER_PASSWORD` (when using a pre-provisioned account) | Private local environment | GitHub Actions Secrets | Validate as a pair; never hard-code, commit, or print values |
| Run-created identity credentials (if registration provisioning is chosen) | Generated in framework memory | Generated in framework memory | Document provisioning, parallel isolation, and account cleanup limitations |
| JWT and browser session | Acquired by framework auth fixtures | Acquired by the same fixtures | No committed/static JWT or published session files |

Choose the identity provisioning strategy after verifying sandbox and account
cleanup support in Phase 1. Do not register unbounded accounts without a cleanup
plan; if account deletion is unsupported, document retained accounts and an
approved reusable dedicated-account strategy. Shared static accounts need
collision-free data and a safe CI concurrency strategy.

The README must explain required versus optional variables, where reviewers
configure GitHub Secrets/Variables, the exact local and CI run commands, and
how to download/open artifacts from the Actions run. Supply any reviewer
credentials through an approved private channel, never in the repository.
Optional PR runs must document missing fork-secret behavior rather than silently
skipping the required push tests.

Start with one bounded CI job for both suites. Do not cancel in-progress runs
until cleanup remains safe under cancellation; future concurrency/sharding must
account for shared identities and unfinished data cleanup.

**Exit criteria**

- Push-triggered CI installs and runs the suite from a clean checkout.
- Reports and failure diagnostics are downloadable after both passing and
  failing runs.
- The README enables another engineer to reproduce the run without relying on
  undocumented local state.

## Test coverage strategy

Prioritize evidence of core value and high-risk rules over raw test count:

1. **Happy path:** Booking creation, reference, total calculation, My Bookings,
   and cancellation.
2. **Business-rule boundaries:** Minimum/maximum quantity, enough seats, and
   exact price arithmetic.
3. **Input validation:** Required fields, email, name, phone, and invalid
   quantity.
4. **API contract:** Status codes, response wrappers, lookup behavior, and
   error response shape.
5. **Isolation and reliability:** Auth/account scope, unique test data, safe
   cleanup, and test independence.
6. **Cross-surface consistency:** UI/API agreement for the same booking where
   observed account and data behavior supports a valid assertion.

Avoid duplicating every API validation case in the UI. API tests provide
efficient input and response coverage; UI tests focus on user-visible form
behavior and the end-to-end journey.

## Deliverables explained

| Deliverable | What it contains | Why it matters |
|---|---|---|
| `plan.md` | This phased implementation roadmap, architecture, risks, and exit criteria. | Aligns implementation before changes begin and makes scope and assumptions visible. |
| Framework source | Configuration, auth, API clients, page objects, fixtures, models, and data factories. | Keeps tests maintainable as the assessment expands beyond one flow. |
| API tests | Contract and business-rule coverage for booking creation, lookup, calculation, validation, and cancellation/deletion behavior. | Provides focused verification of the documented API and records runtime discrepancies. |
| UI tests | Browser tests for booking, confirmation, My Bookings, and cancellation. | Demonstrates the visitor journey through the actual product interface. |
| GitHub Actions workflow | Push-triggered test execution, deterministic install, report generation, and artifact upload. | Shows reproducible continuous verification and makes failures diagnosable. |
| Existing `README` | Setup/run guide, coverage choices, story review, questions, findings, CI secrets, decisions, and future improvements. | Makes the submission understandable and runnable by reviewers. |
| CI run and submission link | A visible completed Actions run and accessible repository URL. | Satisfies the assessment's submission evidence requirements. |

## Assumptions and non-goals

- Playwright with TypeScript for UI and Playwright `APIRequestContext` for API
  are fixed requirements, using a shared test runner and fixtures.
- The application and API are external shared environments. Test accounts and
  data must be dedicated to the run and cleaned up conservatively.
- The plan does not assume that cancellation means permanent deletion or that
  all routes require authentication; both must be verified first.
- The first implementation is limited to the assessment's booking flow. Event
  administration, broad exploratory coverage, load testing, and unrelated
  platform features are out of scope unless discovery shows they are required
  to test this flow.
- A successful CI run is a delivery goal, not a claim that the external
  application is always available or that its behavior matches documentation.
