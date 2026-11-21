create or alter proc sstr.is_empty_empty_string_should_pass
as exec dbo._testcase_unary 'IsEmpty', '', 'empty-string', 1
go
create or alter proc sstr.is_empty_single_space_should_fail
as exec dbo._testcase_unary 'IsEmpty', ' ', 'single-space', 0
go
create or alter proc sstr.is_empty_string_should_fail
as exec dbo._testcase_unary 'IsEmpty', 'x', 'string', 0
go
create or alter proc sstr.is_empty_zero_should_fail
as exec dbo._testcase_unary 'IsEmpty', 0, 'zero', 0
go
create or alter proc sstr.is_empty_null_should_fail
as exec dbo._testcase_unary 'IsEmpty', null, 'null', 0
go