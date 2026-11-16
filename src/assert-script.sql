-- ============================================================
-- Assertion stored procedures for sql-server-test-runner
-- Installed under $(AssertSchema) (default: Assert)
-- All parameters are sql_variant so callers can pass native values
-- without explicit casts. Casts are performed inside the procedures.
-- ============================================================

if not exists (select 1 from sys.schemas where name = '$(AssertSchema)')
    exec('create schema $(AssertSchema)');
go

if not exists (select 1 from sys.schemas where name = 'sstr')
    exec('create schema sstr');
go

-- ============================================================
-- Helper: parse 'schema.table.column' into its parts.
-- Accepts 1, 2, or 3 parts; missing parts default to dbo / the given table.
-- Returns a single row with (schema_name, table_name, column_name).
-- ============================================================

create or alter function sstr._parse_table_column (@name sysname)
returns table
as
return
(
    select
        schema_name =
            case
                when parsename(@name, 3) is not null then parsename(@name, 3)
                else 'dbo'
            end,
        table_name  = parsename(@name, 2),
        column_name = parsename(@name, 1)
);
go

-- ============================================================
-- Helper: parse a foreign-key / primary-key column list.
-- Accepts:
--   'dbo.ChildTable.(Col1,Col2)'
--   'dbo.ChildTable.Col1'
--   'ChildTable.(Col1,Col2)'          (schema defaults to dbo)
--   'ChildTable.Col1'
-- Returns rows: (schema_name, table_name, column_name, ord).
-- The "ord" column preserves the order in which columns were listed.
-- ============================================================

create or alter function sstr._parse_column_list (@name sysname)
returns table
as
return
with
    parsed as
    (
        select
            open_pos  = charindex('(', @name),
            close_pos = len(@name) - charindex(')', reverse(@name)) + 1
    ),
    parts as
    (
        select
            table_part =
                case
                    when p.open_pos > 0
                        then left(@name, p.open_pos - 1)
                    else @name
                end,
            column_part =
                case
                    when p.open_pos > 0 and p.close_pos > p.open_pos
                        then substring(@name, p.open_pos + 1, p.close_pos - p.open_pos - 1)
                    else null
                end
        from parsed p
    ),
    tbl as
    (
        select
            schema_name =
                case
                    when parsename(pp.table_part, 3) is not null then parsename(pp.table_part, 3)
                    else 'dbo'
                end,
            table_name =
                case
                    when parsename(pp.table_part, 3) is not null then parsename(pp.table_part, 2)
                    when parsename(pp.table_part, 2) is not null then parsename(pp.table_part, 1)
                    else pp.table_part
                end,
            column_part = pp.column_part
        from parts pp
    )
select
    schema_name = t.schema_name,
    table_name  = t.table_name,
    column_name = ltrim(rtrim(j.[value])),
    ord         = j.[key] + 1
from tbl t
cross apply openjson(
    '[' + isnull(
        '"' + replace(replace(t.column_part, '"', '""'), ',', '","') + '"',
        'null'
    ) + ']'
) j
where t.column_part is not null
union all
select
    schema_name = t.schema_name,
    table_name  = t.table_name,
    column_name = parsename(@name, 1),
    ord         = 1
from tbl t
where t.column_part is null
  and parsename(@name, 2) is not null;
go

-- ============================================================
-- Boolean / null / numeric / empty
-- ============================================================

create or alter proc $(AssertSchema).IsTrue (@a sql_variant)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    if @a is null
        raiserror('IsTrue failed: value is null', 16, 1);
    else if try_cast(@a as bit) is null
        raiserror('IsTrue failed: value cannot be converted to bit', 16, 1);
    else if cast(@a as bit) = 0
        raiserror('IsTrue failed: expression is false', 16, 1);
end
go

create or alter proc $(AssertSchema).IsFalse (@a sql_variant)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    if @a is null
        raiserror('IsFalse failed: value is null', 16, 1);
    else if try_cast(@a as bit) is null
        raiserror('IsFalse failed: value cannot be converted to bit', 16, 1);
    else if cast(@a as bit) <> 0
        raiserror('IsFalse failed: expression is true', 16, 1);
end
go

create or alter proc $(AssertSchema).IsNull (@a sql_variant)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    if @a is not null
        raiserror('IsNull failed: value is not null', 16, 1);
end
go

create or alter proc $(AssertSchema).IsNotNull (@a sql_variant)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    if @a is null
        raiserror('IsNotNull failed: value is null', 16, 1);
end
go

create or alter proc $(AssertSchema).IsNumeric (@a sql_variant)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    if @a is null
        raiserror('IsNumeric failed: value is null', 16, 1);
    else if try_cast(@a as float) is null
        raiserror('IsNumeric failed: value is not numeric', 16, 1);
end
go

create or alter proc $(AssertSchema).IsEmpty (@a sql_variant)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    if @a is null
        raiserror('IsEmpty failed: value is null', 16, 1);
    else if cast(@a as nvarchar(max)) <> ''
        raiserror('IsEmpty failed: value is not empty', 16, 1);
end
go

-- ============================================================
-- Equality and comparison
-- ============================================================

create or alter proc $(AssertSchema).Equals (@a sql_variant, @b sql_variant)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    -- Both NULL → equal.
    if @a is null and @b is null return;
    -- Exactly one NULL → not equal.
    if @a is null or @b is null
        raiserror('Equals failed: one value is null and the other is not', 16, 1);

    -- Compare as strings; works for numbers, dates, strings, etc.
    if cast(@a as nvarchar(max)) <> cast(@b as nvarchar(max))
        raiserror('Equals failed: values are not equal', 16, 1);
end
go

create or alter proc $(AssertSchema).NotEquals (@a sql_variant, @b sql_variant)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    if @a is null and @b is null
        raiserror('NotEquals failed: both values are null', 16, 1);

    if @a is not null and @b is not null
       and cast(@a as nvarchar(max)) = cast(@b as nvarchar(max))
        raiserror('NotEquals failed: values are equal', 16, 1);
end
go

create or alter proc $(AssertSchema).IsGT (@a sql_variant, @b sql_variant)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    if @a is null or @b is null
        raiserror('IsGT failed: one of the values is null', 16, 1);
    if try_cast(@a as float) is null or try_cast(@b as float) is null
        raiserror('IsGT failed: values are not numeric', 16, 1);
    if not (cast(@a as float) > cast(@b as float))
        raiserror('IsGT failed: a is not greater than b', 16, 1);
end
go

create or alter proc $(AssertSchema).IsGTE (@a sql_variant, @b sql_variant)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    if @a is null or @b is null
        raiserror('IsGTE failed: one of the values is null', 16, 1);
    if try_cast(@a as float) is null or try_cast(@b as float) is null
        raiserror('IsGTE failed: values are not numeric', 16, 1);
    if not (cast(@a as float) >= cast(@b as float))
        raiserror('IsGTE failed: a is not greater than or equal to b', 16, 1);
end
go

create or alter proc $(AssertSchema).IsLT (@a sql_variant, @b sql_variant)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    if @a is null or @b is null
        raiserror('IsLT failed: one of the values is null', 16, 1);
    if try_cast(@a as float) is null or try_cast(@b as float) is null
        raiserror('IsLT failed: values are not numeric', 16, 1);
    if not (cast(@a as float) < cast(@b as float))
        raiserror('IsLT failed: a is not less than b', 16, 1);
end
go

create or alter proc $(AssertSchema).IsLTE (@a sql_variant, @b sql_variant)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    if @a is null or @b is null
        raiserror('IsLTE failed: one of the values is null', 16, 1);
    if try_cast(@a as float) is null or try_cast(@b as float) is null
        raiserror('IsLTE failed: values are not numeric', 16, 1);
    if not (cast(@a as float) <= cast(@b as float))
        raiserror('IsLTE failed: a is not less than or equal to b', 16, 1);
end
go

create or alter proc $(AssertSchema).IsBetween (@a sql_variant, @from sql_variant, @to sql_variant)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    if @a is null or @from is null or @to is null
        raiserror('IsBetween failed: one of the values is null', 16, 1);
    if try_cast(@a as float) is null
       or try_cast(@from as float) is null
       or try_cast(@to as float) is null
        raiserror('IsBetween failed: values are not numeric', 16, 1);
    if cast(@a as float) < cast(@from as float) or cast(@a as float) > cast(@to as float)
        raiserror('IsBetween failed: value is not between bounds', 16, 1);
end
go

create or alter proc $(AssertSchema).NotBetween (@a sql_variant, @from sql_variant, @to sql_variant)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    if @a is null or @from is null or @to is null
        raiserror('NotBetween failed: one of the values is null', 16, 1);
    if try_cast(@a as float) is null
       or try_cast(@from as float) is null
       or try_cast(@to as float) is null
        raiserror('NotBetween failed: values are not numeric', 16, 1);
    if cast(@a as float) >= cast(@from as float) and cast(@a as float) <= cast(@to as float)
        raiserror('NotBetween failed: value is between bounds', 16, 1);
end
go