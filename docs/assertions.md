# Assertion Procedures

> **Note:** `sstr` only ships **test assertions**. If you need general-purpose
> helpers like `table_exists`, `column_exists`, `default_exists`, or `record_exists`,
> install [DbMold](https://github.com/ironcodev/dbmold). DbMold provides them as
> reusable T-SQL functions (`m.table_exists`, `m.column_exists`, ...) that you can
> use in your own procedures and functions.

Before running any test, `sstr` deploys a set of assertion stored procedures into the schema configured by `assertSchema` (default `Assert`). Use them inside your test procedures to express expectations.

If an assertion fails, it raises an error with severity 16. `sqlcmd -b` turns that into a non-zero exit code, and `sstr` marks the test as failed.

## Customizing the schema

Change `assertSchema` in the config:

```json
{
  "assertSchema": "MyAssert"
}
```

Then call assertions as `exec MyAssert.Equals @a, @b`.

If the schema does not exist, `sstr` creates it. If you already have a schema with the same name, its procedures will be replaced by `sstr`'s deployment.

Procedures in `assertSchema` are **excluded from test discovery**, so they are never run as tests.

## Available assertions

All parameters are `sql_variant` so you can pass native values (`int`, `decimal`, `datetime`, `varchar`, …) without explicit casts. Casts are performed inside the procedures.

### Boolean / null / numeric / empty

| Procedure | Signature | Fails when |
|---|---|---|
| `IsTrue` | `@a` | `@a` is null or false. |
| `IsFalse` | `@a` | `@a` is null or true. |
| `IsNull` | `@a` | `@a` is not null. |
| `IsNotNull` | `@a` | `@a` is null. |
| `IsNumeric` | `@a` | `@a` is null or cannot be cast to `float`. |
| `IsEmpty` | `@a` | `@a` is null or not an empty string. |

### Equality and comparison

| Procedure | Signature | Fails when |
|---|---|---|
| `Equals` | `@a, @b` | values are not equal (both null is equal). |
| `NotEquals` | `@a, @b` | values are equal (both null fails). |
| `IsGT` | `@a, @b` | `@a` is not greater than `@b`. |
| `IsGTE` | `@a, @b` | `@a` is not greater than or equal to `@b`. |
| `IsLT` | `@a, @b` | `@a` is not less than `@b`. |
| `IsLTE` | `@a, @b` | `@a` is not less than or equal to `@b`. |
| `IsBetween` | `@a, @from, @to` | `@a` is not between `@from` and `@to`. |
| `NotBetween` | `@a, @from, @to` | `@a` is between `@from` and `@to`. |

`Equals` and `NotEquals` compare values as strings. Numeric comparisons (`IsGT`, `IsBetween`, …) cast to `float`.

## Examples

```sql
-- Equality
exec Assert.Equals @result, 30;
exec Assert.NotEquals @result, 0;

-- Comparison
exec Assert.IsGT @result, 10;
exec Assert.IsBetween @result, 10, 20;

-- Null
exec Assert.IsNull @maybeNull;
exec Assert.IsNotNull @result;
```

## Limitations

- `Equals`/`NotEquals` compare as strings; `1.0` (decimal) and `1.00` (decimal) may compare as different strings. For strict numeric equality, cast explicitly in the test:
  ```sql
  exec Assert.Equals cast(@a as decimal(18,2)), cast(@b as decimal(18,2));
  ```
- Numeric comparisons cast to `float`. For `datetime` comparisons, cast explicitly:
  ```sql
  exec Assert.IsGT cast(@a as float), cast(@b as float);
  ```
  (Date-specific assertions may be added in future versions.)

## Related projects

- [DbMold](https://github.com/ironcodev/dbmold) — idempotent, forward-only schema
  manipulation for SQL Server. Provides `m.table_exists`, `m.column_exists`,
  `m.default_exists`, `m.get_default`, `m.column_info`, and idempotent
  `create_*` / `drop_*` procedures. If you need general-purpose SQL helpers,
  install DbMold alongside `sstr`.