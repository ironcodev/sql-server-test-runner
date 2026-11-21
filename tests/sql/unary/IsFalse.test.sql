create or alter proc sstr.is_false_zero_should_pass
as exec dbo._testcase_unary 'IsFalse', 0, 'zero', 1
go
create or alter proc sstr.is_false_one_should_fail
as exec dbo._testcase_unary 'IsFalse', 1, 'one', 0
go
create or alter proc sstr.is_false_nonzero_int_should_fail
as exec dbo._testcase_unary 'IsFalse', 2, 'nonzero-int', 0
go
create or alter proc sstr.is_false_false_string_should_pass
as exec dbo._testcase_unary 'IsFalse', 'false', 'false-string', 1
go
create or alter proc sstr.is_false_true_string_should_fail
as exec dbo._testcase_unary 'IsFalse', 'true', 'true-string', 0
go
create or alter proc sstr.is_false_zero_string_should_pass
as exec dbo._testcase_unary 'IsFalse', '0', 'zero-string', 1
go
create or alter proc sstr.is_false_one_string_should_fail
as exec dbo._testcase_unary 'IsFalse', '1', 'one-string', 0
go
create or alter proc sstr.is_false_null_should_fail
as exec dbo._testcase_unary 'IsFalse', null, 'null', 0
go
create or alter proc sstr.is_false_nonconvertible_should_fail
as exec dbo._testcase_unary 'IsFalse', 'abc', 'nonconvertible', 0
go