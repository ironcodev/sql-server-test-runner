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

if not exists (select 1 from sys.types where name = 'label' and schema_id = schema_id('$(AssertSchema)'))
    create type $(AssertSchema).label from nvarchar(250) null;
go

if not exists (select 1 from sys.types where name = 'assert_message' and schema_id = schema_id('$(AssertSchema)'))
    create type $(AssertSchema).assert_message from nvarchar(1400) null;
go

if not exists (select 1 from sys.tables where name = 'config' and schema_id = schema_id('$(AssertSchema)'))
    create table $(AssertSchema).config([key] varchar(100) primary key, [value] nvarchar(1000));
go

create or alter proc $(AssertSchema).set_config(@key varchar(50), @value nvarchar(1000))
as
begin
    set nocount on;

    set @key = trim(isnull(@key, ''))

    if @key = ''
        raiserror('$(AssertSchema) set config: key is required', 16, 1)

    if not exists (select 1 from $(AssertSchema).config where [key] = @key)
        insert into $(AssertSchema).config([key], [value])
        values (@key, @value)
    else
        update $(AssertSchema).config set [value] = @value where [key] = @key
end
go

create or alter function $(AssertSchema).get_config(@key varchar(50))
returns nvarchar(1000)
as
begin
    return (select [value] from $(AssertSchema).config where [key] = @key)
end
go

create or alter proc $(AssertSchema).set_debugging(@category varchar(50), @value bit)
as
begin
    set nocount on;

    if @category = '*'
        set @category = 'all'

    set @category = 'debug.' + @category
    set @value = isnull(cast(@value as varchar(1)), '0')

    exec $(AssertSchema).set_config @category, @value
end
go

/*
    debugging levels:
        query , q :  dynamic queries
        vars  , v :  local variables
        dvars , vd:  deep variables
        lvars , vl:  loop variables
        errors, e :  show error_message()
        result, r :  results
        time  , t :  time
        proc  , p :  current procedure

        all   , * :  everything
*/
create or alter function $(AssertSchema).get_debugging(@category varchar(50))
returns bit
as
begin
    declare @result bit

    if @category = '*'
        set @category = 'all'

    set @category = 'debug.' + @category

    set @result = case when $(AssertSchema).get_config(@category) = '1' then 1 else 0 end

    return @result
end
go

create or alter function $(AssertSchema).is_debugging(@category varchar(500)) returns bit
as
begin
    return (case when exists
    (
        select 1 from string_split(@category, ',')
        where $(AssertSchema).get_debugging([value]) = 1
    ) or $(AssertSchema).get_debugging('all') = 1 then 1 else 0 end)
end
go

create or alter function $(AssertSchema)._quote(@value nvarchar(max))
returns nvarchar(max)
as
begin
    return isnull(N'''' + @value + N'''', N'NULL');
end
go

create or alter proc $(AssertSchema)._collate_equals
(
    @a         nvarchar(max),
    @b         nvarchar(max),
    @collation sysname,
    @equals    bit,
    @msg       $(AssertSchema).assert_message out
)
as
begin
    set nocount on;

    if @equals is null
        raiserror('$(AssertSchema)._collate_equals: @equals parameter is required', 16, 1)
    
    if @a is null and @b is null
        set @msg = case when @equals = 1 then null else N'NULL is equal to NULL' end;
    else
    if @a is null or @b is null
        set @msg = case when @equals = 0 then null else $(AssertSchema)._quote(@a) + N' is' +
                        (case when @equals = 1 then ' not ' else ' ' end) +
                        + 'equal to ' +
                        $(AssertSchema)._quote(@b)
                    end;
    else
    if @collation is null
        set @msg = N'@collation parameter is required';
    else
    if not exists (select 1 from sys.fn_helpcollations() where name = @collation)
        set @msg = N'collation ' + $(AssertSchema)._quote(@collation) + N' not found';
    else
    begin
        declare @query nvarchar(max) =
            N'begin try
                set @msg =
                    case when @a collate ' + @collation + N' ' + (case when @equals = 1 then '=' else '<>' end) + ' @b collate ' + @collation
            + N' then null else ''__mismatch__'' end
              end try
              begin catch
                if $(AssertSchema).is_debugging(''errors,e'') = 1
                    print error_message()

                set @msg = ''collation equality check failed ('' + error_message() + '')''
              end catch
            ';
        
        if $(AssertSchema).is_debugging('query,q') = 1
            print @query

        exec sp_executesql @query,
            N'  @a nvarchar(max),
                @b nvarchar(max),
                @msg $(AssertSchema).assert_message out',
                @a, @b, @msg out;

        if @msg = '__mismatch__'
            set @msg =
                $(AssertSchema)._quote(@a) +
                N' is ' +
                iif(@equals = 1, N'not equal to ', N'equal to ') +
                $(AssertSchema)._quote(@b) +
                N' under collation ' + @collation;
    end
end
go

-- ============================================================
-- Helper: parse 'schema.table.column' into its parts.
-- Accepts 1, 2, or 3 parts; missing parts default to dbo / the given table.
-- Returns a single row with (schema_name, table_name, column_name).
-- ============================================================

create or alter function $(AssertSchema).parse_table_column (@name nvarchar(1000))
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

create or alter function $(AssertSchema).parse_column_list (@name nvarchar(1000))
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

-- =============================================
-- $(AssertSchema).failed
-- =============================================
-- Raises an assertion failure with the standard shape:
--   <@sp> <@message> [<@label>]
-- and returns 0 so the calling assertion can stop after the exec.
-- =============================================
create or alter proc $(AssertSchema)._raise_if_required
(
    @sp             sysname,
    @should_raise   bit,
    @message        $(AssertSchema).assert_message,
    @label          $(AssertSchema).label = null
)
as
begin
    set nocount on;

    if @should_raise = 1
    begin
        declare @msg nvarchar(2048) =
            concat(@sp, ' failed: ', @message, isnull(N' [' + @label + N']', ''));

        raiserror(@msg, 16, 1);
    end
end
go
-- ============================================================
-- Boolean / null / numeric / empty
-- ============================================================

create or alter proc $(AssertSchema).IsTrue
(
    @a     sql_variant,
    @label $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit

    declare @sa nvarchar(max) = convert(nvarchar(max), @a);
    declare @ba bit = try_cast(@a as bit);

    set @should_raise = case
        when @a is null then 1
        when @ba is null then 1
        when @ba = 0 then 1
        else 0
    end

    set @msg = case
        when @a is null then N'value is null'
        when @ba is null then N'value ' + $(AssertSchema)._quote(@sa) + N' cannot be converted to bit'
        else N'value ' + $(AssertSchema)._quote(@sa) + N' is false'
    end

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

create or alter proc $(AssertSchema).IsFalse
(
    @a     sql_variant,
    @label $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit

    declare @sa nvarchar(max) = convert(nvarchar(max), @a);
    declare @ba bit = try_cast(@a as bit);

    set @should_raise = case
        when @a is null then 1
        when @ba is null then 1
        when @ba <> 0 then 1
        else 0
    end

    set @msg = case
        when @a is null then N'value is null'
        when @ba is null then N'value ' + $(AssertSchema)._quote(@sa) + N' cannot be converted to bit'
        else N'value ' + $(AssertSchema)._quote(@sa) + N' is true'
    end

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

create or alter proc $(AssertSchema).IsNull
(
    @a     sql_variant,
    @label $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit

    declare @sa nvarchar(max) = convert(nvarchar(max), @a);

    set @should_raise = case when @a is not null then 1 else 0 end

    set @msg = case
        when @a is not null then N'value ' + $(AssertSchema)._quote(@sa) + N' is not null'
        else N''   -- never raised
    end

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

create or alter proc $(AssertSchema).IsNotNull
(
    @a     sql_variant,
    @label $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit

    set @should_raise = case when @a is null then 1 else 0 end

    set @msg = case
        when @a is null then N'value is null'
        else N''   -- never raised
    end

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

create or alter proc $(AssertSchema).IsNumeric
(
    @a     sql_variant,
    @label $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit

    declare @sa nvarchar(max) = convert(nvarchar(max), @a);
    declare @fa float = try_cast(@a as float);

    set @should_raise = case
        when @a is null then 1
        when @fa is null then 1
        else 0
    end

    set @msg = case
        when @a is null then N'value is null'
        else N'value ' + $(AssertSchema)._quote(@sa) + N' is not numeric'
    end

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

create or alter proc $(AssertSchema).IsEmpty
(
    @a     sql_variant,
    @label $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit

    declare @sa nvarchar(max) = convert(nvarchar(max), @a);

    set @should_raise = case
        when @a is null then 1
        when @sa <> N'' then 1
        else 0
    end

    set @msg = case
        when @a is null then N'value is null'
        else N'value ' + $(AssertSchema)._quote(@sa) + N' is not empty'
    end

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

-- ============================================================
-- Equality and comparison
-- ============================================================
create or alter proc $(AssertSchema).Equals
(
    @a     sql_variant,
    @b     sql_variant,
    @label $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    if @a is null and @b is null return;

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit

    declare @sa nvarchar(max) = convert(nvarchar(max), @a);
    declare @sb nvarchar(max) = convert(nvarchar(max), @b);

    set @should_raise = case when @a is null or @b is null then 1
                             when @sa = @sb then 0
                             else 1
                     end
    
    set @msg = $(AssertSchema)._quote(@sa) + N' is not equal to ' + $(AssertSchema)._quote(@sb);

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

-- case-sensitive, accent-sensitive, trailing-space-insensitive comparison
create or alter proc $(AssertSchema).EqualsOrdinal
(
    @a     sql_variant,
    @b     sql_variant,
    @label $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    if @a is null and @b is null return;

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit

    declare @sa nvarchar(max) = isnull(convert(nvarchar(max), @a), N'NULL');
    declare @sb nvarchar(max) = isnull(convert(nvarchar(max), @b), N'NULL');

    set @should_raise = case
        when @a is null or @b is null then 1
        when @sa collate Latin1_General_100_BIN2
           = @sb collate Latin1_General_100_BIN2 then 0
        else 1
    end

    set @msg = $(AssertSchema)._quote(@sa) + N' is not equal to ' + $(AssertSchema)._quote(@sb);

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

create or alter proc $(AssertSchema).MaxEqualsOrdinal
(
    @a     nvarchar(max),
    @b     nvarchar(max),
    @label $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    if @a is null and @b is null return;

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit

    set @should_raise = case
        when @a is null or @b is null then 1
        when @a collate Latin1_General_100_BIN2
           = @b collate Latin1_General_100_BIN2 then 0
        else 1
    end

    set @msg = $(AssertSchema)._quote(@a) + N' is not equal to ' + $(AssertSchema)._quote(@b);

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

create or alter proc $(AssertSchema).MaxNotEqualsOrdinal
(
    @a     nvarchar(max),
    @b     nvarchar(max),
    @label $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit

    set @should_raise = case
        when @a is null and @b is null then 1   -- both null -> fail (they are equal)
        when @a is null or @b is null then 0    -- exactly one null -> pass (they are different)
        when @a collate Latin1_General_100_BIN2
           = @b collate Latin1_General_100_BIN2 then 1   -- byte-identical -> fail
        else 0
    end

    set @msg = case
        when @a is null and @b is null
            then N'both values are null'
        else $(AssertSchema)._quote(@a) + N' is equal to ' + $(AssertSchema)._quote(@b)
    end

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

create or alter proc $(AssertSchema).NotEquals
(
    @a     sql_variant,
    @b     sql_variant,
    @label $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit

    declare @sa nvarchar(max) = isnull(convert(nvarchar(max), @a), 'NULL');
    declare @sb nvarchar(max) = isnull(convert(nvarchar(max), @b), 'NULL');

    set @should_raise = case when @a is null and @b is null then 1
                             when @a is null or @b is null then 0
                             when @sa = @sb then 1
                             else 0
                        end
    
    set @msg = $(AssertSchema)._quote(@sa) + N' is equal to ' + $(AssertSchema)._quote(@sb);

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

-- ============================================================
-- Large-value equality assertions.
--
-- sql_variant cannot hold nvarchar/varchar values longer than 4000
-- characters. For large strings, use these procedures instead; they accept
-- nvarchar(max) directly and compare the values as-is.
--
-- For non-string types (numbers, dates, etc.), cast to nvarchar(max) before
-- calling:
--   exec Assert.MaxEquals cast(@a as nvarchar(max)), cast(@b as nvarchar(max));
-- ============================================================

create or alter proc $(AssertSchema).MaxEquals
(
    @a     nvarchar(max),
    @b     nvarchar(max),
    @label $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    if @a is null and @b is null return;

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit

    set @should_raise = case
        when @a is null or @b is null then 1   -- exactly one side null (both-null returned above)
        when @a <> @b then 1
        else 0
    end

    set @msg = $(AssertSchema)._quote(@a) + N' is not equal to ' + $(AssertSchema)._quote(@b);

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

create or alter proc $(AssertSchema).MaxNotEquals
(
    @a     nvarchar(max),
    @b     nvarchar(max),
    @label $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit

    set @should_raise = case
        when @a is null and @b is null then 1   -- both null -> fail
        when @a is null or @b is null then 0    -- exactly one null -> pass
        when @a = @b then 1                     -- both non-null and equal -> fail
        else 0
    end

    set @msg = case
        when @a is null and @b is null
            then N'both values are null'
        else $(AssertSchema)._quote(@a) + N' is equal to ' + $(AssertSchema)._quote(@b)
    end

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

create or alter proc $(AssertSchema).NotEqualsOrdinal
(
    @a     sql_variant,
    @b     sql_variant,
    @label $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit

    declare @sa nvarchar(max) = convert(nvarchar(max), @a);
    declare @sb nvarchar(max) = convert(nvarchar(max), @b);

    set @should_raise = case
        when @a is null and @b is null then 1   -- both null -> fail (they are equal)
        when @a is null or @b is null then 0    -- exactly one null -> pass (they are different)
        when @sa collate Latin1_General_100_BIN2
           = @sb collate Latin1_General_100_BIN2 then 1   -- byte-identical -> fail
        else 0
    end

    set @msg = case
        when @a is null and @b is null
            then N'both values are null'
        else $(AssertSchema)._quote(@sa) + N' is equal to ' + $(AssertSchema)._quote(@sb)
    end

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

-- =============================================
-- $(AssertSchema).CollateEquals
-- =============================================
-- Asserts that two values are equal under an explicit collation.
-- The collation name is inserted into the comparison via dynamic SQL;
-- an invalid collation name causes the assertion to fail with a
-- parse error from the dynamic statement.
--
-- Examples:
--   exec $(AssertSchema).CollateEquals N'Hello', N'hello', 'Latin1_General_CS_AS';
--   exec $(AssertSchema).CollateEquals N'e',     N'é',     'Latin1_General_CI_AI';
-- =============================================
create or alter proc $(AssertSchema).CollateEquals
(
    @a         sql_variant,
    @b         sql_variant,
    @collation sysname,
    @label     $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit = 1
    declare @sa nvarchar(max) = convert(nvarchar(max), @a);
    declare @sb nvarchar(max) = convert(nvarchar(max), @b);

    exec $(AssertSchema)._collate_equals @sa, @sb, @collation, 1, @msg out

    if @msg is null
        set @should_raise = 0

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

create or alter proc $(AssertSchema).CollateNotEquals
(
    @a         sql_variant,
    @b         sql_variant,
    @collation sysname,
    @label     $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit = 1
    declare @sa nvarchar(max) = convert(nvarchar(max), @a);
    declare @sb nvarchar(max) = convert(nvarchar(max), @b);

    exec $(AssertSchema)._collate_equals @sa, @sb, @collation, 0, @msg out

    if @msg is null
        set @should_raise = 0

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

create or alter proc $(AssertSchema).CollateMaxEquals
(
    @a         nvarchar(max),
    @b         nvarchar(max),
    @collation sysname,
    @label     $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit = 1

    exec $(AssertSchema)._collate_equals @a, @b, @collation, 1, @msg out

    if @msg is null
        set @should_raise = 0

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

create or alter proc $(AssertSchema).CollateMaxNotEquals
(
    @a         nvarchar(max),
    @b         nvarchar(max),
    @collation sysname,
    @label     $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit = 1

    exec $(AssertSchema)._collate_equals @a, @b, @collation, 0, @msg out

    if @msg is null
        set @should_raise = 0

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

create or alter proc $(AssertSchema).BinaryEquals
(
    @a     nvarchar(max),
    @b     nvarchar(max),
    @label $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    if @a is null and @b is null return;

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit

    set @should_raise = case
        when @a is null or @b is null then 1
        when convert(varbinary(max), @a) = convert(varbinary(max), @b) then 0
        else 1
    end

    set @msg = $(AssertSchema)._quote(@a) + N' is not binary equal to ' + $(AssertSchema)._quote(@b);

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

create or alter proc $(AssertSchema).BinaryNotEquals
(
    @a     nvarchar(max),
    @b     nvarchar(max),
    @label $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit

    set @should_raise = case
        when @a is null and @b is null then 1   -- both null -> fail (binary-equal)
        when @a is null or @b is null then 0    -- exactly one null -> pass
        when convert(varbinary(max), @a) = convert(varbinary(max), @b) then 1
        else 0
    end

    set @msg = case
        when @a is null and @b is null
            then N'both values are null'
        else $(AssertSchema)._quote(@a) + N' is binary equal to ' + $(AssertSchema)._quote(@b)
    end

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

create or alter proc $(AssertSchema).IsGT
(
    @a     sql_variant,
    @b     sql_variant,
    @label $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit

    declare @sa nvarchar(max) = convert(nvarchar(max), @a);
    declare @sb nvarchar(max) = convert(nvarchar(max), @b);
    declare @fa float = try_cast(@a as float);
    declare @fb float = try_cast(@b as float);

    set @should_raise = case
        when @a is null or @b is null then 1
        when @fa is null or @fb is null then 1
        when not (@fa > @fb) then 1
        else 0
    end

    set @msg = case
        when @a is null or @b is null
            then N'one of the values is null'
        when @fa is null or @fb is null
            then $(AssertSchema)._quote(@sa) + N' and ' + $(AssertSchema)._quote(@sb) + N' are not numeric'
        else $(AssertSchema)._quote(@sa) + N' is not greater than ' + $(AssertSchema)._quote(@sb)
    end

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

create or alter proc $(AssertSchema).IsGTE
(
    @a     sql_variant,
    @b     sql_variant,
    @label $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit

    declare @sa nvarchar(max) = convert(nvarchar(max), @a);
    declare @sb nvarchar(max) = convert(nvarchar(max), @b);
    declare @fa float = try_cast(@a as float);
    declare @fb float = try_cast(@b as float);

    set @should_raise = case
        when @a is null or @b is null then 1
        when @fa is null or @fb is null then 1
        when not (@fa >= @fb) then 1
        else 0
    end

    set @msg = case
        when @a is null or @b is null
            then N'one of the values is null'
        when @fa is null or @fb is null
            then $(AssertSchema)._quote(@sa) + N' and ' + $(AssertSchema)._quote(@sb) + N' are not numeric'
        else $(AssertSchema)._quote(@sa) + N' is not greater than or equal to ' + $(AssertSchema)._quote(@sb)
    end

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

create or alter proc $(AssertSchema).IsLT
(
    @a     sql_variant,
    @b     sql_variant,
    @label $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit

    declare @sa nvarchar(max) = convert(nvarchar(max), @a);
    declare @sb nvarchar(max) = convert(nvarchar(max), @b);
    declare @fa float = try_cast(@a as float);
    declare @fb float = try_cast(@b as float);

    set @should_raise = case
        when @a is null or @b is null then 1
        when @fa is null or @fb is null then 1
        when not (@fa < @fb) then 1
        else 0
    end

    set @msg = case
        when @a is null or @b is null
            then N'one of the values is null'
        when @fa is null or @fb is null
            then $(AssertSchema)._quote(@sa) + N' and ' + $(AssertSchema)._quote(@sb) + N' are not numeric'
        else $(AssertSchema)._quote(@sa) + N' is not less than ' + $(AssertSchema)._quote(@sb)
    end

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

create or alter proc $(AssertSchema).IsLTE
(
    @a     sql_variant,
    @b     sql_variant,
    @label $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit

    declare @sa nvarchar(max) = convert(nvarchar(max), @a);
    declare @sb nvarchar(max) = convert(nvarchar(max), @b);
    declare @fa float = try_cast(@a as float);
    declare @fb float = try_cast(@b as float);

    set @should_raise = case
        when @a is null or @b is null then 1
        when @fa is null or @fb is null then 1
        when not (@fa <= @fb) then 1
        else 0
    end

    set @msg = case
        when @a is null or @b is null
            then N'one of the values is null'
        when @fa is null or @fb is null
            then $(AssertSchema)._quote(@sa) + N' and ' + $(AssertSchema)._quote(@sb) + N' are not numeric'
        else $(AssertSchema)._quote(@sa) + N' is not less than or equal to ' + $(AssertSchema)._quote(@sb)
    end

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

create or alter proc $(AssertSchema).IsBetween
(
    @a     sql_variant,
    @from  sql_variant,
    @to    sql_variant,
    @label $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit

    declare @sa nvarchar(max) = convert(nvarchar(max), @a);
    declare @sf nvarchar(max) = convert(nvarchar(max), @from);
    declare @st nvarchar(max) = convert(nvarchar(max), @to);
    declare @fa float = try_cast(@a as float);
    declare @ff float = try_cast(@from as float);
    declare @ft float = try_cast(@to as float);

    set @should_raise = case
        when @a is null or @from is null or @to is null then 1
        when @fa is null or @ff is null or @ft is null then 1
        when @fa < @ff or @fa > @ft then 1
        else 0
    end

    set @msg = case
        when @a is null or @from is null or @to is null
            then N'one of the values is null'
        when @fa is null or @ff is null or @ft is null
            then $(AssertSchema)._quote(@sa) + N' / ' + $(AssertSchema)._quote(@sf)
               + N' / ' + $(AssertSchema)._quote(@st) + N' are not numeric'
        else $(AssertSchema)._quote(@sa) + N' is not between '
           + $(AssertSchema)._quote(@sf) + N' and ' + $(AssertSchema)._quote(@st)
    end

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go

create or alter proc $(AssertSchema).NotBetween
(
    @a     sql_variant,
    @from  sql_variant,
    @to    sql_variant,
    @label $(AssertSchema).label = null
)
as
begin
    set nocount on;

    print 'SSTR_ASSERTION';

    declare @sp sysname = object_name(@@procid)
    declare @msg $(AssertSchema).assert_message
    declare @should_raise bit

    declare @sa nvarchar(max) = convert(nvarchar(max), @a);
    declare @sf nvarchar(max) = convert(nvarchar(max), @from);
    declare @st nvarchar(max) = convert(nvarchar(max), @to);
    declare @fa float = try_cast(@a as float);
    declare @ff float = try_cast(@from as float);
    declare @ft float = try_cast(@to as float);

    set @should_raise = case
        when @a is null or @from is null or @to is null then 1
        when @fa is null or @ff is null or @ft is null then 1
        when @fa >= @ff and @fa <= @ft then 1
        else 0
    end

    set @msg = case
        when @a is null or @from is null or @to is null
            then N'one of the values is null'
        when @fa is null or @ff is null or @ft is null
            then $(AssertSchema)._quote(@sa) + N' / ' + $(AssertSchema)._quote(@sf)
               + N' / ' + $(AssertSchema)._quote(@st) + N' are not numeric'
        else $(AssertSchema)._quote(@sa) + N' is between '
           + $(AssertSchema)._quote(@sf) + N' and ' + $(AssertSchema)._quote(@st)
    end

    exec $(AssertSchema)._raise_if_required @sp, @should_raise, @msg, @label;
end
go