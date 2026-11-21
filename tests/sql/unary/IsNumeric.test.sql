create or alter proc sstr.is_numeric_int_should_pass
as exec dbo._testcase_unary 'IsNumeric', 42, 'int', 1
go
create or alter proc sstr.is_numeric_decimal_should_pass
as exec dbo._testcase_unary 'IsNumeric', 3.14, 'decimal', 1
go
create or alter proc sstr.is_numeric_int_string_should_pass
as exec dbo._testcase_unary 'IsNumeric', '42', 'int-string', 1
go
create or alter proc sstr.is_numeric_decimal_string_should_pass
as exec dbo._testcase_unary 'IsNumeric', '3.14', 'decimal-string', 1
go
create or alter proc sstr.is_numeric_negative_should_pass
as exec dbo._testcase_unary 'IsNumeric', -42, 'negative', 1
go
create or alter proc sstr.is_numeric_alpha_string_should_fail
as exec dbo._testcase_unary 'IsNumeric', 'abc', 'alpha-string', 0
go
create or alter proc sstr.is_numeric_empty_string_should_fail
as exec dbo._testcase_unary 'IsNumeric', '', 'empty-string', 0
go
create or alter proc sstr.is_numeric_null_should_fail
as exec dbo._testcase_unary 'IsNumeric', null, 'null', 0
go
create or alter proc sstr.is_numeric_hex_string_should_fail
as exec dbo._testcase_unary 'IsNumeric', '0x10', 'hex-string', 0
go