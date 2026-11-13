create or alter proc sstr.sum_with_null_args_should_return_null
as
begin
    declare @a sql_variant

    set @a = dbo.[Sum](null, null)

    exec $(AssertSchema).IsNull @a

    set @a = dbo.[Sum](null, 10)

    exec $(AssertSchema).IsNull @a

    set @a = dbo.[Sum](10, null)

    exec $(AssertSchema).IsNull @a
end

go

create or alter proc sstr.sum_of_integers_should_return_summation_of_them
as
begin
    declare @a int
    declare @b int
    declare @r sql_variant

    set @a = 10
    set @b = 20
    set @r = dbo.[Sum](@a, @b)

    exec $(AssertSchema).Equals @r, 30
end

go

create or alter proc sstr.sum_of_floats_should_return_summation_of_them
as
begin
    declare @a float
    declare @b float
    declare @r sql_variant

    set @a = 10.5
    set @b = 20.5
    set @r = dbo.[Sum](@a, @b)

    exec $(AssertSchema).Equals @r, 31
end

go

create or alter proc sstr.sum_of_numeric_strings_should_return_summation_of_them
as
begin
    declare @a varchar(20)
    declare @b varchar(20)
    declare @r sql_variant

    set @a = '10'
    set @b = '20'
    set @r = dbo.[Sum](@a, @b)

    exec $(AssertSchema).Equals @r, 30
end

go

create or alter proc sstr.sum_of_mixed_numeric_values_should_return_summation_of_them
as
begin
    declare @a sql_variant
    declare @b sql_variant
    declare @r sql_variant

    set @a = '10'
    set @b = 20
    set @r = dbo.[Sum](@a, @b)

    exec $(AssertSchema).Equals @r, 30

    set @a = 10
    set @b = '20'
    set @r = dbo.[Sum](@a, @b)

    exec $(AssertSchema).Equals @r, 30
end

go

