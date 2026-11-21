create or alter proc sstr.collate_max_equals_both_null_should_pass
as
    exec dbo._testcase_collation 'CollateMaxEquals', null, null, 'Latin1_General_100_BIN2', 'both-null', 1
go
create or alter proc sstr.collate_max_equals_null_and_number_should_fail
as
    exec dbo._testcase_collation 'CollateMaxEquals', null, 10, 'Latin1_General_100_BIN2', 'null-number', 0
go
create or alter proc sstr.collate_max_equals_number_and_null_should_fail
as
    exec dbo._testcase_collation 'CollateMaxEquals', 10, null, 'Latin1_General_100_BIN2', 'number-null', 0
go
create or alter proc sstr.collate_max_equals_num_eq_num_should_pass
as
    exec dbo._testcase_collation 'CollateMaxEquals', 10, 10, 'Latin1_General_100_BIN2', 'num-eq-num', 1
go
create or alter proc sstr.collate_max_equals_num_neq_num_should_fail
as
    exec dbo._testcase_collation 'CollateMaxEquals', 10, 20, 'Latin1_General_100_BIN2', 'num-neq-num', 0
go

-- collation-sensitive distinctions

create or alter proc sstr.collate_max_equals_cs_case_differs_should_fail
as
    exec dbo._testcase_collation 'CollateMaxEquals', 'Hello', 'hello', 'Latin1_General_CS_AS', 'cs-case-differs', 0
go
create or alter proc sstr.collate_max_equals_ci_case_differs_should_pass
as
    exec dbo._testcase_collation 'CollateMaxEquals', 'Hello', 'hello', 'Latin1_General_CI_AS', 'ci-case-differs', 1
go
create or alter proc sstr.collate_max_equals_bin_case_differs_should_fail
as
    exec dbo._testcase_collation 'CollateMaxEquals', 'Hello', 'hello', 'Latin1_General_100_BIN2', 'bin-case-differs', 0
go

-- collation parameter failures

create or alter proc sstr.collate_max_equals_null_collation_should_fail
as
    exec dbo._testcase_collation 'CollateMaxEquals', 'a', 'b', null, 'null-collation', 0
go
create or alter proc sstr.collate_max_equals_bad_collation_should_fail
as
    exec dbo._testcase_collation 'CollateMaxEquals', 'a', 'b', 'not_a_collation', 'bad-collation', 0
go

-- the reason CollateMaxEquals exists: values beyond the sql_variant
-- 4000-char cap cannot go through _testcase_collation, so these call
-- the assertion directly and assert on whether it raised.

create or alter proc sstr.collate_max_equals_long_strings_should_pass
as
begin
    set nocount on;

    declare @a nvarchar(max) = replicate(cast(N'x' as nvarchar(max)), 5000);
    declare @b nvarchar(max) = replicate(cast(N'x' as nvarchar(max)), 5000);

    declare @raised bit = 0;
    begin try
        exec $(AssertSchema).CollateMaxEquals @a, @b, 'Latin1_General_100_BIN2', 'long-eq-long';
    end try
    begin catch
        set @raised = 1;
    end catch

    exec $(AssertSchema).IsFalse @raised, 'long-eq-long';
end
go

create or alter proc sstr.collate_max_equals_long_strings_differ_should_fail
as
begin
    set nocount on;

    declare @a nvarchar(max) = replicate(cast(N'x' as nvarchar(max)), 5000);
    declare @b nvarchar(max) = replicate(cast(N'x' as nvarchar(max)), 4999) + N'y';

    declare @raised bit = 0;
    begin try
        exec $(AssertSchema).CollateMaxEquals @a, @b, 'Latin1_General_100_BIN2', 'long-neq-long';
    end try
    begin catch
        set @raised = 1;
    end catch

    exec $(AssertSchema).IsTrue @raised, 'long-neq-long';
end
go