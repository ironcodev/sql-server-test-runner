create or alter proc sstr.is_max_numeric_int_should_pass
as exec dbo._testcase_unary_max 'IsMaxNumeric', 42, 'int', 1
go
create or alter proc sstr.is_max_numeric_decimal_should_pass
as exec dbo._testcase_unary_max 'IsMaxNumeric', 3.14, 'decimal', 1
go
create or alter proc sstr.is_max_numeric_int_string_should_pass
as exec dbo._testcase_unary_max 'IsMaxNumeric', '42', 'int-string', 1
go
create or alter proc sstr.is_max_numeric_decimal_string_should_pass
as exec dbo._testcase_unary_max 'IsMaxNumeric', '3.14', 'decimal-string', 1
go
create or alter proc sstr.is_max_numeric_negative_should_pass
as exec dbo._testcase_unary_max 'IsMaxNumeric', -42, 'negative', 1
go
create or alter proc sstr.is_max_numeric_alpha_string_should_fail
as exec dbo._testcase_unary_max 'IsMaxNumeric', 'abc', 'alpha-string', 0
go
create or alter proc sstr.is_max_numeric_empty_string_should_fail
as exec dbo._testcase_unary_max 'IsMaxNumeric', '', 'empty-string', 0
go
create or alter proc sstr.is_max_numeric_null_should_fail
as exec dbo._testcase_unary_max 'IsMaxNumeric', null, 'null', 0
go
create or alter proc sstr.is_max_numeric_hex_string_should_fail
as exec dbo._testcase_unary_max 'IsMaxNumeric', '0x10', 'hex-string', 0
go
create or alter proc sstr.is_max_numeric_numeric_string_should_pass
as
begin
    declare @a nvarchar(max) = '123'

    exec dbo._testcase_unary_max 'IsMaxNumeric', @a, 'numeric-string', 1
end
go
create or alter proc sstr.is_max_numeric_not_numeric_string_should_fail
as
begin
    declare @a nvarchar(max) = '123a'

    exec dbo._testcase_unary_max 'IsMaxNumeric', @a, 'not-numeric-string', 0
end
go