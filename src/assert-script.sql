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
-- Boolean / null / numeric / empty
-- ============================================================

create or alter proc $(AssertSchema).IsTrue (@a sql_variant)
as
begin
    set nocount on;
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
    if @a is not null
        raiserror('IsNull failed: value is not null', 16, 1);
end
go

create or alter proc $(AssertSchema).IsNotNull (@a sql_variant)
as
begin
    set nocount on;
    if @a is null
        raiserror('IsNotNull failed: value is null', 16, 1);
end
go

create or alter proc $(AssertSchema).IsNumeric (@a sql_variant)
as
begin
    set nocount on;
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
    if object_id(@table, 'U') is null
        raiserror('TableExists failed: table does not exist', 16, 1);
end
go

create or alter proc $(AssertSchema).TableNotExists (@table sysname)
as
begin
    set nocount on;
    if object_id(@table, 'U') is not null
        raiserror('TableNotExists failed: table exists', 16, 1);
end
go

create or alter proc $(AssertSchema).ColumnExists (@table sysname, @column sysname)
as
begin
    set nocount on;
    if object_id(@table, 'U') is null
        raiserror('ColumnExists failed: table does not exist', 16, 1);
    else if not exists (
        select 1 from sys.columns c
        where c.object_id = object_id(@table) and c.name = @column
    )
        raiserror('ColumnExists failed: column does not exist', 16, 1);
end
go

create or alter proc $(AssertSchema).ColumnNotExists (@table sysname, @column sysname)
as
begin
    set nocount on;
    if object_id(@table, 'U') is null
        raiserror('ColumnNotExists failed: table does not exist', 16, 1);
    else if exists (
        select 1 from sys.columns c
        where c.object_id = object_id(@table) and c.name = @column
    )
        raiserror('ColumnNotExists failed: column exists', 16, 1);
end
go

create or alter proc $(AssertSchema).ForeignKeyExists (@table sysname, @fkName sysname)
as
begin
    set nocount on;
    if object_id(@table, 'U') is null
        raiserror('ForeignKeyExists failed: table does not exist', 16, 1);
    else if not exists (
        select 1 from sys.foreign_keys fk
        where fk.parent_object_id = object_id(@table)
          and fk.name = @fkName
    )
        raiserror('ForeignKeyExists failed: foreign key does not exist', 16, 1);
end
go

create or alter proc $(AssertSchema).ForeignKeyNotExists (@table sysname, @fkName sysname)
as
begin
    set nocount on;
    if object_id(@table, 'U') is null
        raiserror('ForeignKeyNotExists failed: table does not exist', 16, 1);
    else if exists (
        select 1 from sys.foreign_keys fk
        where fk.parent_object_id = object_id(@table)
          and fk.name = @fkName
    )
        raiserror('ForeignKeyNotExists failed: foreign key exists', 16, 1);
end
go

create or alter proc $(AssertSchema).DefaultExists (@table sysname, @column sysname)
as
begin
    set nocount on;
    if object_id(@table, 'U') is null
        raiserror('DefaultExists failed: table does not exist', 16, 1);
    else if not exists (
        select 1
        from sys.default_constraints dc
        join sys.columns c
          on c.object_id = dc.parent_object_id
         and c.column_id = dc.parent_column_id
        where dc.parent_object_id = object_id(@table)
          and c.name = @column
    )
        raiserror('DefaultExists failed: default constraint does not exist', 16, 1);
end
go

create or alter proc $(AssertSchema).DefaultNotExists (@table sysname, @column sysname)
as
begin
    set nocount on;
    if object_id(@table, 'U') is null
        raiserror('DefaultNotExists failed: table does not exist', 16, 1);
    else if exists (
        select 1
        from sys.default_constraints dc
        join sys.columns c
          on c.object_id = dc.parent_object_id
         and c.column_id = dc.parent_column_id
        where dc.parent_object_id = object_id(@table)
          and c.name = @column
    )
        raiserror('DefaultNotExists failed: default constraint exists', 16, 1);
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