create or alter proc sstr.is_null_or_empty_empty_string_should_pass
as exec dbo._testcase_unary 'IsNullOrEmpty', '', 'empty-string', 1
go
create or alter proc sstr.is_null_or_empty_single_space_should_fail
as exec dbo._testcase_unary 'IsNullOrEmpty', ' ', 'single-space', 0
go
create or alter proc sstr.is_null_or_empty_string_should_fail
as exec dbo._testcase_unary 'IsNullOrEmpty', 'x', 'string', 0
go
create or alter proc sstr.is_null_or_empty_zero_should_fail
as exec dbo._testcase_unary 'IsNullOrEmpty', 0, 'zero', 0
go
create or alter proc sstr.is_null_or_empty_null_should_pass
as exec dbo._testcase_unary 'IsNullOrEmpty', null, 'null', 1
go