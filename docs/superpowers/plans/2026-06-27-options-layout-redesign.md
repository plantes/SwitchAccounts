# Options Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the SwitchAccounts options page as a left account navigation plus right-side tabbed detail workspace.

**Architecture:** Keep the existing `entrypoints/options/App.tsx` entry point and background message contract. Split the JSX inside that file into focused local components, then replace `entrypoints/options/style.css` with a responsive workbench layout. Update `tests/ui/options.test.tsx` first so the new tabs, account selection, and tool placement are covered before production code changes.

**Tech Stack:** React 19, TypeScript, WXT, Vitest, React Testing Library, CSS.

---

### Task 1: Add Failing UI Tests For Tabbed Options Workflow

**Files:**
- Modify: `tests/ui/options.test.tsx`

- [ ] **Step 1: Add account selection and tab tests**

Add a second fixture profile and tests that expect:

```ts
expect(await screen.findByRole("tab", { name: "概览" })).toHaveAttribute("aria-selected", "true");
await userEvent.click(screen.getByRole("tab", { name: "Cookie" }));
expect(screen.getByRole("tabpanel", { name: "Cookie" })).toBeInTheDocument();
await userEvent.click(screen.getByRole("tab", { name: "Web Storage" }));
expect(screen.getByRole("tabpanel", { name: "Web Storage" })).toBeInTheDocument();
await userEvent.click(screen.getByRole("tab", { name: "工具" }));
expect(screen.getByRole("tabpanel", { name: "工具" })).toBeInTheDocument();
```

Also add an account-list test:

```ts
await userEvent.click(screen.getByRole("button", { name: /Home/ }));
expect(screen.getByLabelText("账号名称")).toHaveValue("Home");
```

- [ ] **Step 2: Run tests and verify RED**

Run: `.\node_modules\.bin\vitest.cmd run tests/ui/options.test.tsx`

Expected: FAIL because the current options page has no `tab` roles and account list rows still use the old panel layout.

### Task 2: Implement Tab State And Account Navigation

**Files:**
- Modify: `entrypoints/options/App.tsx`

- [ ] **Step 1: Add local tab type and state**

Add:

```ts
type ActiveTab = "overview" | "cookies" | "storage" | "tools";
const tabs: { id: ActiveTab; label: string }[] = [
  { id: "overview", label: "概览" },
  { id: "cookies", label: "Cookie" },
  { id: "storage", label: "Web Storage" },
  { id: "tools", label: "工具" },
];
```

Inside `OptionsApp`, add `activeTab` state and derive selected profile from `selectedId` plus filtered profiles.

- [ ] **Step 2: Replace all-panel grid with workbench skeleton**

Render:

```tsx
<main className="options-shell">
  <AccountSidebar ... />
  <section className="detail-shell">
    <AccountSummary ... />
    <TabNav ... />
    <section className="tab-surface">...</section>
  </section>
</main>
```

- [ ] **Step 3: Run targeted tests and verify GREEN progress**

Run: `.\node_modules\.bin\vitest.cmd run tests/ui/options.test.tsx`

Expected: tests may still fail for tab contents until Task 3 is complete.

### Task 3: Move Existing Editors Into Tabs

**Files:**
- Modify: `entrypoints/options/App.tsx`

- [ ] **Step 1: Create tab components**

Create local components:

```ts
function OverviewTab(...)
function CookieTab(...)
function WebStorageTab(...)
function ToolsTab(...)
```

Move existing profile form behavior into `OverviewTab`, existing cookie editor behavior into `CookieTab`, existing Web Storage behavior into `WebStorageTab`, and existing import/export/settings behavior into `ToolsTab`.

- [ ] **Step 2: Preserve existing behavior**

Keep existing functions and validation:

```ts
updateCookie(...)
deleteCookie(...)
updateStorage(...)
deleteStorage(...)
exportAll(...)
removeGrantedSite(...)
readFileText(...)
```

- [ ] **Step 3: Run targeted tests and verify GREEN**

Run: `.\node_modules\.bin\vitest.cmd run tests/ui/options.test.tsx`

Expected: all options UI tests pass.

### Task 4: Replace Options CSS With Responsive Workbench Layout

**Files:**
- Modify: `entrypoints/options/style.css`

- [ ] **Step 1: Style the workbench**

Add CSS for:

```css
.options-shell
.account-sidebar
.profile-list
.profile-nav-card
.detail-shell
.account-summary
.tab-list
.tab-button
.tab-panel
.storage-row
.cookie-row
```

Use a desktop grid with a 300px-ish sidebar and `minmax(0, 1fr)` detail area.

- [ ] **Step 2: Preserve overflow protections**

Keep:

```css
* { box-sizing: border-box; }
body, #root { min-width: 0; }
input, select { min-width: 0; width: 100%; }
label:has(> input[type="checkbox"]) { display: inline-flex; white-space: nowrap; }
```

- [ ] **Step 3: Run targeted tests**

Run: `.\node_modules\.bin\vitest.cmd run tests/ui/options.test.tsx`

Expected: all options UI tests pass.

### Task 5: Full Verification And Visual Checks

**Files:**
- No planned source changes.

- [ ] **Step 1: Run project verification**

Run:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\vitest.cmd run
.\node_modules\.bin\wxt.cmd build
```

Expected: all commands exit 0.

- [ ] **Step 2: Run browser overflow checks**

Use Playwright against `.output/chrome-mv3/options.html` with seeded profiles and assert:

```ts
document.documentElement.scrollWidth - document.documentElement.clientWidth === 0
```

Check widths: 1920, 1280, 760, 420.

- [ ] **Step 3: Inspect final diff**

Run:

```powershell
git diff -- entrypoints/options/App.tsx entrypoints/options/style.css tests/ui/options.test.tsx
git status --short
```

Expected: implementation changes are limited to options UI, tests, and this plan/spec-related work. Existing `.superpowers/` scratch files remain untracked unless intentionally cleaned later.
