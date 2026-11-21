create or alter proc sstr.collate_equals_both_null_should_pass
as
    exec dbo._testcase_collation 'CollateEquals', null, null, 'Latin1_General_100_BIN2', 'both-null', 1
go
create or alter proc sstr.collate_equals_null_and_number_should_fail
as
    exec dbo._testcase_collation 'CollateEquals', null, 10, 'Latin1_General_100_BIN2', 'null-number', 0
go
create or alter proc sstr.collate_equals_number_and_null_should_fail
as
    exec dbo._testcase_collation 'CollateEquals', 10, null, 'Latin1_General_100_BIN2', 'number-null', 0
go
create or alter proc sstr.collate_equals_num_eq_num_should_pass
as
    exec dbo._testcase_collation 'CollateEquals', 10, 10, 'Latin1_General_100_BIN2', 'num-eq-num', 1
go
create or alter proc sstr.collate_equals_num_neq_num_should_fail
as
    exec dbo._testcase_collation 'CollateEquals', 10, 20, 'Latin1_General_100_BIN2', 'num-neq-num', 0
go

-- case sensitivity: CS_AS distinguishes, CI_AS does not
create or alter proc sstr.collate_equals_cs_as_case_differs_should_fail
as
    exec dbo._testcase_collation 'CollateEquals', 'Hello', 'hello', 'Latin1_General_CS_AS', 'cs-case-differs', 0
go
create or alter proc sstr.collate_equals_ci_as_case_differs_should_pass
as
    exec dbo._testcase_collation 'CollateEquals', 'Hello', 'hello', 'Latin1_General_CI_AS', 'ci-case-differs', 1
go

-- binary: distinguishes case and trailing spaces
create or alter proc sstr.collate_equals_bin_case_differs_should_fail
as
    exec dbo._testcase_collation 'CollateEquals', 'Hello', 'hello', 'Latin1_General_100_BIN2', 'bin-case-differs', 0
go
create or alter proc sstr.collate_equals_bin_trailing_space_should_fail
as
    exec dbo._testcase_collation 'CollateEquals', 'Hello', 'Hello ', 'Latin1_General_100_BIN2', 'bin-trailing-space', 0
go

-- accent sensitivity
create or alter proc sstr.collate_equals_ai_accent_differs_should_pass
as
begin
    declare @e_acute nvarchar(1) = nchar(233);
    exec dbo._testcase_collation 'CollateEquals', N'e', @e_acute, 'Latin1_General_CI_AI', 'ai-accent-differs', 1;
end
go
create or alter proc sstr.collate_equals_as_accent_differs_should_fail
as
begin
    declare @e_acute nvarchar(1) = nchar(233);
    exec dbo._testcase_collation 'CollateEquals', N'e', @e_acute, 'Latin1_General_CI_AS', 'as-accent-differs', 0;
end
go

-- collation parameter failures
create or alter proc sstr.collate_equals_null_collation_should_fail
as
    exec dbo._testcase_collation 'CollateEquals', 'a', 'a', null, 'null-collation', 0
go
create or alter proc sstr.collate_equals_bad_collation_should_fail
as
    exec dbo._testcase_collation 'CollateEquals', 'a', 'a', 'not_a_collation', 'bad-collation', 0
go