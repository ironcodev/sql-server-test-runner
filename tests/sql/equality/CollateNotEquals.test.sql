create or alter proc sstr.collate_not_equals_both_null_should_fail
as
    exec dbo._testcase_collation 'CollateNotEquals', null, null, 'Latin1_General_100_BIN2', 'both-null', 0
go
create or alter proc sstr.collate_not_equals_null_and_number_should_pass
as
    exec dbo._testcase_collation 'CollateNotEquals', null, 10, 'Latin1_General_100_BIN2', 'null-number', 1
go
create or alter proc sstr.collate_not_equals_number_and_null_should_pass
as
    exec dbo._testcase_collation 'CollateNotEquals', 10, null, 'Latin1_General_100_BIN2', 'number-null', 1
go
create or alter proc sstr.collate_not_equals_nullstr_and_null_should_pass
as
    exec dbo._testcase_collation 'CollateNotEquals', 'null', null, 'Latin1_General_100_BIN2', 'nullstr-null', 1
go
create or alter proc sstr.collate_not_equals_null_and_nullstr_should_pass
as
    exec dbo._testcase_collation 'CollateNotEquals', null, 'null', 'Latin1_General_100_BIN2', 'null-nullstr', 1
go
create or alter proc sstr.collate_not_equals_both_nullstr_should_fail
as
    exec dbo._testcase_collation 'CollateNotEquals', 'null', 'null', 'Latin1_General_100_BIN2', 'both-nullstr', 0
go
create or alter proc sstr.collate_not_equals_num_eq_num_should_fail
as
    exec dbo._testcase_collation 'CollateNotEquals', 10, 10, 'Latin1_General_100_BIN2', 'num-eq-num', 0
go
create or alter proc sstr.collate_not_equals_num_neq_num_should_pass
as
    exec dbo._testcase_collation 'CollateNotEquals', 10, 20, 'Latin1_General_100_BIN2', 'num-neq-num', 1
go

-- collation-sensitive distinctions

create or alter proc sstr.collate_not_equals_cs_case_differs_should_pass
as
    exec dbo._testcase_collation 'CollateNotEquals', 'Hello', 'hello', 'Latin1_General_CS_AS', 'cs-case-differs', 1
go
create or alter proc sstr.collate_not_equals_ci_case_differs_should_fail
as
    exec dbo._testcase_collation 'CollateNotEquals', 'Hello', 'hello', 'Latin1_General_CI_AS', 'ci-case-differs', 0
go
create or alter proc sstr.collate_not_equals_bin_case_differs_should_pass
as
    exec dbo._testcase_collation 'CollateNotEquals', 'Hello', 'hello', 'Latin1_General_100_BIN2', 'bin-case-differs', 1
go
create or alter proc sstr.collate_not_equals_bin_trailing_space_should_fail
as
    -- BIN2 still pads trailing spaces per ANSI rules; 'Hello' = 'Hello ' is TRUE
    exec dbo._testcase_collation 'CollateNotEquals', 'Hello', 'Hello ', 'Latin1_General_100_BIN2', 'bin-trailing-space', 0
go
create or alter proc sstr.collate_not_equals_ai_accent_differs_should_fail
as
    exec dbo._testcase_collation 'CollateNotEquals', N'e', N'é', 'Latin1_General_CI_AI', 'ai-accent-differs', 0
go
create or alter proc sstr.collate_not_equals_as_accent_differs_should_pass
as
    exec dbo._testcase_collation 'CollateNotEquals', N'e', N'é', 'Latin1_General_CI_AS', 'as-accent-differs', 1
go

-- collation parameter failures

create or alter proc sstr.collate_not_equals_null_collation_should_fail
as
    exec dbo._testcase_collation 'CollateNotEquals', 'a', 'b', null, 'null-collation', 0
go
create or alter proc sstr.collate_not_equals_bad_collation_should_fail
as
    exec dbo._testcase_collation 'CollateNotEquals', 'a', 'b', 'not_a_collation', 'bad-collation', 0
go