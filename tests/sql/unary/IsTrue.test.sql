create or alter proc sstr.is_true_one_should_pass
as exec dbo._testcase_unary 'IsTrue', 1, 'one', 1
go
create or alter proc sstr.is_true_zero_should_fail
as exec dbo._testcase_unary 'IsTrue', 0, 'zero', 0
go
create or alter proc sstr.is_true_nonzero_int_should_pass
as exec dbo._testcase_unary 'IsTrue', 2, 'nonzero-int', 1
go
create or alter proc sstr.is_true_true_string_should_pass
as exec dbo._testcase_unary 'IsTrue', 'true', 'true-string', 1
go
create or alter proc sstr.is_true_false_string_should_fail
as exec dbo._testcase_unary 'IsTrue', 'false', 'false-string', 0
go
create or alter proc sstr.is_true_one_string_should_pass
as exec dbo._testcase_unary 'IsTrue', '1', 'one-string', 1
go
create or alter proc sstr.is_true_zero_string_should_fail
as exec dbo._testcase_unary 'IsTrue', '0', 'zero-string', 0
go
create or alter proc sstr.is_true_nonzero_float_should_pass
as exec dbo._testcase_unary 'IsTrue', 0.5, 'nonzero-float', 1
go
create or alter proc sstr.is_true_null_should_fail
as exec dbo._testcase_unary 'IsTrue', null, 'null', 0
go
create or alter proc sstr.is_true_nonconvertible_should_fail
as exec dbo._testcase_unary 'IsTrue', 'abc', 'nonconvertible', 0
go