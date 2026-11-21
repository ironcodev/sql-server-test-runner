create or alter proc sstr.is_null_null_should_pass
as exec dbo._testcase_unary 'IsNull', null, 'null', 1
go
create or alter proc sstr.is_null_zero_should_fail
as exec dbo._testcase_unary 'IsNull', 0, 'zero', 0
go
create or alter proc sstr.is_null_empty_string_should_fail
as exec dbo._testcase_unary 'IsNull', '', 'empty-string', 0
go
create or alter proc sstr.is_null_null_string_should_fail
as exec dbo._testcase_unary 'IsNull', 'null', 'null-string', 0
go
create or alter proc sstr.is_null_uppercase_null_string_should_fail
as exec dbo._testcase_unary 'IsNull', 'NULL', 'uppercase-null-string', 0
go