create or alter proc sstr.is_not_null_zero_should_pass
as exec dbo._testcase_unary 'IsNotNull', 0, 'zero', 1
go
create or alter proc sstr.is_not_null_empty_string_should_pass
as exec dbo._testcase_unary 'IsNotNull', '', 'empty-string', 1
go
create or alter proc sstr.is_not_null_null_string_should_pass
as exec dbo._testcase_unary 'IsNotNull', 'null', 'null-string', 1
go
create or alter proc sstr.is_not_null_uppercase_null_string_should_pass
as exec dbo._testcase_unary 'IsNotNull', 'NULL', 'uppercase-null-string', 1
go
create or alter proc sstr.is_not_null_null_should_fail
as exec dbo._testcase_unary 'IsNotNull', null, 'null', 0
go