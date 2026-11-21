create or alter proc dbo._testcase
(
    @operator   varchar(50),
    @a          sql_variant,
    @b          sql_variant,
    @label      nvarchar(500),
    @expect     bit
)
as
begin
    set nocount on

    begin try
        if $(AssertSchema).is_debugging('vars,v') = 1
        begin
            print concat('@a: ', isnull(convert(nvarchar(max), @a), 'NULL'))
            print concat('@b: ', isnull(convert(nvarchar(max), @b), 'NULL'))
            print concat('expected: ', @expect)
        end

        declare @query nvarchar(1000) = N'
exec $(AssertSchema).[' + @operator + '] @a, @b, @label'

        if $(AssertSchema).is_debugging('query,q') = 1
            print @query

        if @operator in ('BinaryEquals', 'BinaryNotEquals',
                         'MaxEquals', 'MaxNotEquals',
                         'MaxEqualsOrdinal', 'MaxNotEqualsOrdinal')
        begin
            -- these assertions take nvarchar(max); sql_variant cannot be
            -- implicitly converted at the sp_executesql bind
            declare @sa nvarchar(max) = convert(nvarchar(max), @a)
            declare @sb nvarchar(max) = convert(nvarchar(max), @b)

            exec sp_executesql @query,
                N'@a nvarchar(max), @b nvarchar(max), @label nvarchar(500)',
                @a = @sa,
                @b = @sb,
                @label = @label
        end
        else
        begin
            exec sp_executesql @query,
                N'@a sql_variant, @b sql_variant, @label nvarchar(500)',
                @a = @a,
                @b = @b,
                @label = @label
        end

        if @expect = 0
        begin
            if $(AssertSchema).is_debugging('result,r') = 1
            begin
                print ''
                print concat(@label, ': failed')
            end
            raiserror('Equals failed', 16, 1)
        end
        else
        if $(AssertSchema).is_debugging('result,r') = 1
            print concat(@label, ': passed')
    end try
    begin catch
        if @expect = 1
        begin
            if $(AssertSchema).is_debugging('result,r') = 1
                print concat(@label, ': failed');
            if $(AssertSchema).is_debugging('errors') = 1
                print error_message();
            throw;
        end
        else
        begin
            if $(AssertSchema).is_debugging('result,r') = 1
                print concat(@label, ': passed');
            exec $(AssertSchema).IsTrue 1, @label;
        end
    end catch
end
go

create or alter proc dbo._testcase_collation
(
    @operator   varchar(50),
    @a          sql_variant,
    @b          sql_variant,
    @collation  sysname,
    @label      nvarchar(500),
    @expect     bit
)
as
begin
    set nocount on;

    begin try
        if $(AssertSchema).is_debugging('vars,v') = 1
        begin
            print concat('@a: ', isnull(convert(nvarchar(max), @a), 'NULL'))
            print concat('@b: ', isnull(convert(nvarchar(max), @b), 'NULL'))
            print concat('@collation: ', @collation)
            print concat('expected: ', @expect)
            print ''
        end

        declare @query nvarchar(1000) = N'
exec $(AssertSchema).[' + @operator + '] @a, @b, @collation, @label'

        if $(AssertSchema).is_debugging('query,q') = 1
            print @query

        if @operator like 'CollateMax%'
        begin
            declare @sa nvarchar(max) = convert(nvarchar(max), @a)
            declare @sb nvarchar(max) = convert(nvarchar(max), @b)

            exec sp_executesql @query,
                N'@a nvarchar(max), @b nvarchar(max), @collation sysname, @label nvarchar(500)',
                @a = @sa,
                @b = @sb,
                @collation = @collation,
                @label = @label
        end
        else
        begin
            exec sp_executesql @query,
                N'@a sql_variant, @b sql_variant, @collation sysname, @label nvarchar(500)',
                @a = @a,
                @b = @b,
                @collation = @collation,
                @label = @label
        end

        if @expect = 0
        begin
            if $(AssertSchema).is_debugging('result,r') = 1
            begin
                print ''
                print concat(@label, ': failed')
            end
            raiserror('Equals failed', 16, 1)
        end
        else
        if $(AssertSchema).is_debugging('result,r') = 1
            print concat(@label, ': passed')
    end try
    begin catch
        if @expect = 1
        begin
            if $(AssertSchema).is_debugging('result,r') = 1
                print concat(@label, ': failed');
            if $(AssertSchema).is_debugging('errors') = 1
                print error_message();
            throw;
        end
        else
        begin
            if $(AssertSchema).is_debugging('result,r') = 1
                print concat(@label, ': passed');
            exec $(AssertSchema).IsTrue 1, @label;
        end
    end catch
end
go

create or alter proc dbo._testcase_unary
(
    @operator varchar(50),
    @a        sql_variant,
    @label    nvarchar(500),
    @expect   bit
)
as
begin
    set nocount on;

    begin try
        declare @query nvarchar(1000) = N'
exec $(AssertSchema).[' + @operator + '] @a, @label'

        if $(AssertSchema).is_debugging('query,q') = 1
            print @query

        exec sp_executesql @query,
            N'@a sql_variant, @label nvarchar(500)',
            @a = @a, @label = @label

        if @expect = 0
            raiserror('expected failure did not occur', 16, 1)
    end try
    begin catch
        if @expect = 1
            throw;
        exec $(AssertSchema).IsTrue 1, @label;
    end catch
end
go

create or alter proc dbo._testcase_between
(
    @operator varchar(50),
    @a        sql_variant,
    @from     sql_variant,
    @to       sql_variant,
    @label    nvarchar(500),
    @expect   bit
)
as
begin
    set nocount on;

    begin try
        declare @query nvarchar(1000) = N'
exec $(AssertSchema).[' + @operator + '] @a, @from, @to, @label'

        if $(AssertSchema).is_debugging('query,q') = 1
            print @query

        exec sp_executesql @query,
            N'@a sql_variant, @from sql_variant, @to sql_variant, @label nvarchar(500)',
            @a = @a, @from = @from, @to = @to, @label = @label

        if @expect = 0
            raiserror('expected failure did not occur', 16, 1)
    end try
    begin catch
        if @expect = 1
            throw;
        exec $(AssertSchema).IsTrue 1, @label;
    end catch
end
go
