# Comparison with tSQLt

`tSQLt` is the de facto standard for SQL Server unit testing. `sstr` does not try to replace it. This page explains the differences honestly so you can choose the right tool.

## When to use tSQLt

Use `tSQLt` if any of the following apply:

- Your team already uses Visual Studio, SSDT, or the .NET tooling ecosystem.
- You need `FakeTable` to test procedures against complex schemas with many foreign keys and constraints.
- You need `AssertEqualsTable` for set-based result comparisons.
- Your organization requires a proven, industry-standard framework with a long track record.
- You are comfortable enabling CLR on the SQL Server instance.

## When to use sstr

Use `sstr` if:

- You are a Node.js developer who wants to write SQL tests without leaving your ecosystem.
- You want `npm install` and `npx` to be the only installation steps.
- You cannot or do not want to enable CLR on the server.
- You want a lightweight tool that does not require SSDT.
- You would otherwise write **no SQL tests at all** because the barrier feels too high.

## Feature comparison

| Concern | tSQLt | sstr |
|---|---|---|
| Installation | Requires enabling CLR, running `PrepareServer.sql` with `SA` permissions, and installing the framework into each development database. | `npm install -g sql-server-test-runner` plus a one-line `sqlcmd` install. Nothing to enable on the server. |
| Server-side configuration | CLR must be enabled. In some environments (Azure SQL, hardened servers) this is restricted or forbidden. | **Zero server-side configuration.** Only `sqlcmd` is required on the client. |
| Ecosystem | Deeply tied to Visual Studio, SSDT, and .NET. | Pure Node.js. Install it, import it, or run it from any terminal. |
| Learning curve | Requires understanding CLR, test classes, `FakeTable`, and tSQLt conventions. | If you know T-SQL and `npm`, you already know how to use it. |
| Table mocking | Full `FakeTable` support. | **Intentionally not included.** You provide a clean test database, seed data inside your test, and the tool rolls everything back. |
| Transaction isolation | Automatic per-test rollback. | Automatic per-test rollback (`--no-transaction` to opt out). |
| Assertion style | `tSQLt.AssertEquals`, `AssertEqualsTable`, etc. | `Assert.Equals`, `Assert.IsTrue`, `Assert.RecordExists`, … |
| CI integration | Possible, often via custom scripts. | Built-in `--report-type junit` and `--report-type json`. |
| Dependencies | CLR, SSDT (usually), Visual Studio (usually). | `sqlcmd` only. |

## Philosophical difference

`tSQLt` tries to give you **everything**. That is its strength and its weight.

`sstr` tries to give you **just enough**. You bring a clean test database (or let the tool create one), write a plain T-SQL stored procedure that calls `Assert.Equals`, and you are done. No mocking framework, no CLR, no Visual Studio.

This works because of a simple trade-off: **you provide a controlled environment, and the tool stays out of your way.**

## On `FakeTable`

`FakeTable` is powerful, but it exists to solve a specific problem: complex schemas with many foreign keys and constraints make it painful to seed data. If your test database has a simpler schema (or no foreign keys), you do not need `FakeTable`. Seed data inside your test and let the transaction rollback handle cleanup.

If you later find you need `FakeTable`-style behavior, consider whether `tSQLt` is a better fit for that part of your project.

## The one-line install

The dependency on `sqlcmd` is not a burden. Microsoft ships a standalone, cross-platform `sqlcmd` (Go) that installs in seconds:

```bash
# Windows
winget install sqlcmd

# macOS
brew install sqlcmd

# Ubuntu / Debian
apt-get install sqlcmd
```

No SQL Server installation required on your machine. No Visual Studio. No CLR.