create or alter proc sstr.max_not_equals_both_null_should_fail
as
    exec dbo._testcase 'MaxNotEquals', null, null, 'both-null', 0
go
create or alter proc sstr.max_not_equals_null_and_number_should_pass
as
    exec dbo._testcase 'MaxNotEquals', null, 10, 'null-number', 1
go
create or alter proc sstr.max_not_equals_number_and_null_should_pass
as
    exec dbo._testcase 'MaxNotEquals', 10, null, 'number-null', 1
go
create or alter proc sstr.max_not_equals_nullstr_and_null_should_pass
as
    exec dbo._testcase 'MaxNotEquals', 'null', null, 'nullstr-null', 1
go
create or alter proc sstr.max_not_equals_null_and_nullstr_should_pass
as
    exec dbo._testcase 'MaxNotEquals', null, 'null', 'null-nullstr', 1
go
create or alter proc sstr.max_not_equals_both_nullstr_should_fail
as
    exec dbo._testcase 'MaxNotEquals', 'null', 'null', 'both-nullstr', 0
go
create or alter proc sstr.max_not_equals_num_eq_num_should_fail
as
    exec dbo._testcase 'MaxNotEquals', 10, 10, 'num-eq-num', 0
go
create or alter proc sstr.max_not_equals_num_neq_num_should_pass
as
    exec dbo._testcase 'MaxNotEquals', 10, 00, 'num-neq-num', 1
go
create or alter proc sstr.max_not_equals_str_eq_str_should_fail
as
    exec dbo._testcase 'MaxNotEquals', N'hello', N'hello', 'str-eq-str', 0
go
create or alter proc sstr.max_not_equals_str_neq_str_should_pass
as
    exec dbo._testcase 'MaxNotEquals', N'hello', N'world', 'str-neq-str', 1
go

-- the reason MaxNotEquals exists: values beyond the sql_variant 4000-char cap
create or alter proc sstr.max_not_equals_long_strings_should_fail
as
begin
    set nocount on;

    declare @a nvarchar(max) = replicate(cast(N'x' as nvarchar(max)), 5000)

    declare @raised bit = 0
    begin try
        exec $(AssertSchema).MaxNotEquals @a, @a, 'long-eq-long'
    end try
    begin catch
        set @raised = 1
    end catch

    exec $(AssertSchema).IsTrue @raised, 'long-eq-long'
end
go

create or alter proc sstr.max_not_equals_long_strings_differ_should_pass
as
begin
    set nocount on;

    declare @a nvarchar(max) = replicate(cast(N'x' as nvarchar(max)), 5000)
    declare @b nvarchar(max) = replicate(cast(N'x' as nvarchar(max)), 4999) + N'y'

    declare @raised bit = 0
    begin try
        exec $(AssertSchema).MaxNotEquals @a, @b, 'long-neq-long'
    end try
    begin catch
        set @raised = 1
    end catch

    exec $(AssertSchema).IsFalse @raised, 'long-neq-long'
end
go