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
-- Helper: normalize a default-constraint definition for comparison.
--   - trims whitespace
--   - strips any wrapping parentheses (repeatedly)
--   - collapses a single pair of parens around a numeric literal
-- Examples:
--   '((10))'   -> '10'
--   '(getdate())' -> 'getdate()'
--   'N''x'''   -> 'N''x'''
-- ============================================================

create or alter function sstr._normalize_default (@value nvarchar(max))
returns nvarchar(max)
as
begin
    if @value is null return null;

    declare @v nvarchar(max) = ltrim(rtrim(@value));

    -- Strip wrapping parentheses as long as the whole string is wrapped.
    while len(@v) >= 2
      and left(@v, 1) = '('
      and right(@v, 1) = ')'
    begin
        -- Only strip if the outer parens actually wrap the whole expression.
        -- Simple heuristic: strip and let the trim loop continue.
        set @v = ltrim(rtrim(substring(@v, 2, len(@v) - 2)));
    end

    return @v;
end;
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

-- ============================================================
-- Schema object existence
-- ============================================================

create or alter proc $(AssertSchema).TableExists (@table sysname)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    if object_id(@table, 'U') is null
        raiserror('TableExists failed: table does not exist', 16, 1);
end
go

create or alter proc $(AssertSchema).TableNotExists (@table sysname)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    if object_id(@table, 'U') is not null
        raiserror('TableNotExists failed: table exists', 16, 1);
end
go

create or alter proc $(AssertSchema).ColumnExists (@table_column sysname)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @schema sysname, @table sysname, @column sysname;

    select @schema = p.schema_name,
           @table  = p.table_name,
           @column = p.column_name
    from sstr._parse_table_column(@table_column) p;

    if @table is null or @column is null
        raiserror('ColumnExists failed: expected schema.table.column', 16, 1);

    if object_id(quotename(@schema) + '.' + quotename(@table), 'U') is null
        raiserror('ColumnExists failed: table does not exist', 16, 1);

    if not exists (
        select 1
        from sys.columns c
        where c.object_id = object_id(quotename(@schema) + '.' + quotename(@table))
          and c.name = @column
    )
        raiserror('ColumnExists failed: column does not exist', 16, 1);
end
go

create or alter proc $(AssertSchema).ColumnNotExists (@table_column sysname)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @schema sysname, @table sysname, @column sysname;

    select @schema = p.schema_name,
           @table  = p.table_name,
           @column = p.column_name
    from sstr._parse_table_column(@table_column) p;

    if @table is null or @column is null
        raiserror('ColumnNotExists failed: expected schema.table.column', 16, 1);

    if object_id(quotename(@schema) + '.' + quotename(@table), 'U') is null
        raiserror('ColumnNotExists failed: table does not exist', 16, 1);

    if exists (
        select 1
        from sys.columns c
        where c.object_id = object_id(quotename(@schema) + '.' + quotename(@table))
          and c.name = @column
    )
        raiserror('ColumnNotExists failed: column exists', 16, 1);
end
go

create or alter proc $(AssertSchema).ForeignKeyExists (
    @fk_column sysname,
    @pk_column sysname
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    -- Parse the FK side: (schema, table, column, ord).
    declare @fk_schema sysname, @fk_table sysname;
    declare @fk_cols table (ord int primary key, column_name sysname);

    insert into @fk_cols (ord, column_name)
    select ord, column_name
    from sstr._parse_column_list(@fk_column);

    if not exists (select 1 from @fk_cols)
        raiserror('ForeignKeyExists failed: expected schema.table.(col1,col2,...) for the first argument', 16, 1);

    select top (1) @fk_schema = schema_name, @fk_table = table_name
    from sstr._parse_column_list(@fk_column);

    -- Parse the PK side.
    declare @pk_schema sysname, @pk_table sysname;
    declare @pk_cols table (ord int primary key, column_name sysname);

    insert into @pk_cols (ord, column_name)
    select ord, column_name
    from sstr._parse_column_list(@pk_column);

    if not exists (select 1 from @pk_cols)
        raiserror('ForeignKeyExists failed: expected schema.table.(col1,col2,...) for the second argument', 16, 1);

    select top (1) @pk_schema = schema_name, @pk_table = table_name
    from sstr._parse_column_list(@pk_column);

    declare @fk_table_id int = object_id(quotename(@fk_schema) + '.' + quotename(@fk_table), 'U');
    declare @pk_table_id int = object_id(quotename(@pk_schema) + '.' + quotename(@pk_table), 'U');

    if @fk_table_id is null
        raiserror('ForeignKeyExists failed: referencing table does not exist', 16, 1);
    if @pk_table_id is null
        raiserror('ForeignKeyExists failed: referenced table does not exist', 16, 1);

    -- Column counts must match.
    declare @fk_count int = (select count(*) from @fk_cols);
    declare @pk_count int = (select count(*) from @pk_cols);
    if @fk_count <> @pk_count
        raiserror('ForeignKeyExists failed: FK and PK column counts differ', 16, 1);

    -- Build a mapping of (ordinal -> fk_column, pk_column) and check whether
    -- any foreign key in the database matches that exact mapping.
    if not exists (
        select 1
        from sys.foreign_key_columns fkc
        join sys.foreign_keys fk
          on fk.object_id = fkc.constraint_object_id
        join sys.columns fk_col
          on fk_col.object_id = fkc.parent_object_id
         and fk_col.column_id = fkc.parent_column_id
        join sys.columns pk_col
          on pk_col.object_id = fkc.referenced_object_id
         and pk_col.column_id = fkc.referenced_column_id
        join @fk_cols f
          on f.ord = fkc.constraint_column_id
         and f.column_name = fk_col.name
        join @pk_cols p
          on p.ord = fkc.constraint_column_id
         and p.column_name = pk_col.name
        where fkc.parent_object_id     = @fk_table_id
          and fkc.referenced_object_id = @pk_table_id
        group by fk.object_id
        having count(*) = @fk_count
    )
        raiserror('ForeignKeyExists failed: foreign key does not exist', 16, 1);
end
go

create or alter proc $(AssertSchema).ForeignKeyNotExists (
    @fk_column sysname,
    @pk_column sysname
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @fk_schema sysname, @fk_table sysname;
    declare @fk_cols table (ord int primary key, column_name sysname);

    insert into @fk_cols (ord, column_name)
    select ord, column_name
    from sstr._parse_column_list(@fk_column);

    if not exists (select 1 from @fk_cols)
        raiserror('ForeignKeyNotExists failed: expected schema.table.(col1,col2,...) for the first argument', 16, 1);

    select top (1) @fk_schema = schema_name, @fk_table = table_name
    from sstr._parse_column_list(@fk_column);

    declare @pk_schema sysname, @pk_table sysname;
    declare @pk_cols table (ord int primary key, column_name sysname);

    insert into @pk_cols (ord, column_name)
    select ord, column_name
    from sstr._parse_column_list(@pk_column);

    if not exists (select 1 from @pk_cols)
        raiserror('ForeignKeyNotExists failed: expected schema.table.(col1,col2,...) for the second argument', 16, 1);

    select top (1) @pk_schema = schema_name, @pk_table = table_name
    from sstr._parse_column_list(@pk_column);

    declare @fk_table_id int = object_id(quotename(@fk_schema) + '.' + quotename(@fk_table), 'U');
    declare @pk_table_id int = object_id(quotename(@pk_schema) + '.' + quotename(@pk_table), 'U');

    if @fk_table_id is null
        raiserror('ForeignKeyNotExists failed: referencing table does not exist', 16, 1);
    if @pk_table_id is null
        raiserror('ForeignKeyNotExists failed: referenced table does not exist', 16, 1);

    declare @fk_count int = (select count(*) from @fk_cols);
    declare @pk_count int = (select count(*) from @pk_cols);
    if @fk_count <> @pk_count
        raiserror('ForeignKeyNotExists failed: FK and PK column counts differ', 16, 1);

    if exists (
        select 1
        from sys.foreign_key_columns fkc
        join sys.foreign_keys fk
          on fk.object_id = fkc.constraint_object_id
        join sys.columns fk_col
          on fk_col.object_id = fkc.parent_object_id
         and fk_col.column_id = fkc.parent_column_id
        join sys.columns pk_col
          on pk_col.object_id = fkc.referenced_object_id
         and pk_col.column_id = fkc.referenced_column_id
        join @fk_cols f
          on f.ord = fkc.constraint_column_id
         and f.column_name = fk_col.name
        join @pk_cols p
          on p.ord = fkc.constraint_column_id
         and p.column_name = pk_col.name
        where fkc.parent_object_id     = @fk_table_id
          and fkc.referenced_object_id = @pk_table_id
        group by fk.object_id
        having count(*) = @fk_count
    )
        raiserror('ForeignKeyNotExists failed: foreign key exists', 16, 1);
end
go

create or alter proc $(AssertSchema).DefaultExists (
    @table_column sysname,
    @expected_value nvarchar(max) = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @schema sysname, @table sysname, @column sysname;

    select @schema = p.schema_name,
           @table  = p.table_name,
           @column = p.column_name
    from sstr._parse_table_column(@table_column) p;

    if @table is null or @column is null
        raiserror('DefaultExists failed: expected schema.table.column', 16, 1);

    declare @table_id int = object_id(quotename(@schema) + '.' + quotename(@table), 'U');
    if @table_id is null
        raiserror('DefaultExists failed: table does not exist', 16, 1);

    declare @definition nvarchar(max);

    select @definition = dc.definition
    from sys.default_constraints dc
    join sys.columns c
      on c.object_id = dc.parent_object_id
     and c.column_id = dc.parent_column_id
    where dc.parent_object_id = @table_id
      and c.name = @column;

    if @definition is null
        raiserror('DefaultExists failed: default constraint does not exist', 16, 1);

    -- If no expected value was provided, we are done.
    if @expected_value is null return;

    declare @normalized_actual   nvarchar(max) = sstr._normalize_default(@definition);
    declare @normalized_expected nvarchar(max) = sstr._normalize_default(@expected_value);

    if @normalized_actual <> @normalized_expected
        raiserror('DefaultExists failed: default value does not match the expected value', 16, 1);
end
go

create or alter proc $(AssertSchema).DefaultNotExists (
    @table_column sysname,
    @expected_value nvarchar(max) = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @schema sysname, @table sysname, @column sysname;

    select @schema = p.schema_name,
           @table  = p.table_name,
           @column = p.column_name
    from sstr._parse_table_column(@table_column) p;

    if @table is null or @column is null
        raiserror('DefaultNotExists failed: expected schema.table.column', 16, 1);

    declare @table_id int = object_id(quotename(@schema) + '.' + quotename(@table), 'U');
    if @table_id is null
        raiserror('DefaultNotExists failed: table does not exist', 16, 1);

    declare @definition nvarchar(max);

    select @definition = dc.definition
    from sys.default_constraints dc
    join sys.columns c
      on c.object_id = dc.parent_object_id
     and c.column_id = dc.parent_column_id
    where dc.parent_object_id = @table_id
      and c.name = @column;

    if @definition is null return; -- No default: that's what we want.

    -- If no expected value was provided, we just report the presence of a default.
    if @expected_value is null
        raiserror('DefaultNotExists failed: default constraint exists', 16, 1);

    -- Otherwise, fail only if the default matches the expected value.
    declare @normalized_actual   nvarchar(max) = sstr._normalize_default(@definition);
    declare @normalized_expected nvarchar(max) = sstr._normalize_default(@expected_value);

    if @normalized_actual = @normalized_expected
        raiserror('DefaultNotExists failed: default constraint exists with the expected value', 16, 1);
end
go

-- ============================================================
-- Record assertions with JSON filter
--   @json is an object like N'{ "id": 10, "name": "foo" }'.
--   All key/value pairs are ANDed together.
--   JSON null becomes an IS NULL check.
--   An empty object N'{}' matches all rows.
-- ============================================================

create or alter proc $(AssertSchema).RecordExists (@table sysname, @json nvarchar(max))
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    if object_id(@table, 'U') is null
    begin
        raiserror('RecordExists failed: table does not exist', 16, 1);
        return;
    end

    declare @cnt int;

    if @json is null or ltrim(rtrim(@json)) = N'' or ltrim(rtrim(@json)) = N'{}'
    begin
        declare @sql0 nvarchar(max) = N'select @cnt_out = count(*) from ' + @table;
        exec sp_executesql @sql0, N'@cnt_out int output', @cnt output;
    end
    else
    begin
        declare @where nvarchar(max) = N'';
        declare @key sysname, @val nvarchar(max);

        declare cur cursor local fast_forward for
            select [key], [value] from openjson(@json);

        open cur;
        fetch next from cur into @key, @val;
        while @@fetch_status = 0
        begin
            if @where <> N'' set @where += N' and ';

            if @val is null
                set @where += quotename(@key) + N' is null';
            else
                set @where += quotename(@key) + N' = ' + quotename(@val, '''');

            fetch next from cur into @key, @val;
        end
        close cur;
        deallocate cur;

        declare @sql nvarchar(max) =
            N'select @cnt_out = count(*) from ' + @table + N' where ' + @where;
        exec sp_executesql @sql, N'@cnt_out int output', @cnt output;
    end

    if @cnt = 0
        raiserror('RecordExists failed: no matching records found', 16, 1);
end
go

create or alter proc $(AssertSchema).RecordNotExists (@table sysname, @json nvarchar(max))
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    if object_id(@table, 'U') is null
    begin
        raiserror('RecordNotExists failed: table does not exist', 16, 1);
        return;
    end

    declare @cnt int;

    if @json is null or ltrim(rtrim(@json)) = N'' or ltrim(rtrim(@json)) = N'{}'
    begin
        declare @sql0 nvarchar(max) = N'select @cnt_out = count(*) from ' + @table;
        exec sp_executesql @sql0, N'@cnt_out int output', @cnt output;
    end
    else
    begin
        declare @where nvarchar(max) = N'';
        declare @key sysname, @val nvarchar(max);

        declare cur cursor local fast_forward for
            select [key], [value] from openjson(@json);

        open cur;
        fetch next from cur into @key, @val;
        while @@fetch_status = 0
        begin
            if @where <> N'' set @where += N' and ';

            if @val is null
                set @where += quotename(@key) + N' is null';
            else
                set @where += quotename(@key) + N' = ' + quotename(@val, '''');

            fetch next from cur into @key, @val;
        end
        close cur;
        deallocate cur;

        declare @sql nvarchar(max) =
            N'select @cnt_out = count(*) from ' + @table + N' where ' + @where;
        exec sp_executesql @sql, N'@cnt_out int output', @cnt output;
    end

    if @cnt > 0
        raiserror('RecordNotExists failed: matching records found', 16, 1);
end
go