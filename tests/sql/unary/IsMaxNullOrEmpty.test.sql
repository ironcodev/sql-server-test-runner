create or alter proc sstr.is_max_null_or_empty_empty_string_should_pass
as exec dbo._testcase_unary_max 'IsMaxNullOrEmpty', '', 'empty-string', 1
go
create or alter proc sstr.is_max_null_or_empty_single_space_should_fail
as exec dbo._testcase_unary_max 'IsMaxNullOrEmpty', ' ', 'single-space', 0
go
create or alter proc sstr.is_max_null_or_empty_string_should_fail
as exec dbo._testcase_unary_max 'IsMaxNullOrEmpty', 'x', 'string', 0
go
create or alter proc sstr.is_max_null_or_empty_zero_should_fail
as exec dbo._testcase_unary_max 'IsMaxNullOrEmpty', 0, 'zero', 0
go
create or alter proc sstr.is_max_null_or_empty_null_should_pass
as exec dbo._testcase_unary_max 'IsMaxNullOrEmpty', null, 'null', 1
go
create or alter proc sstr.is_max_null_or_empty_empty_max_null_string_should_pass
as
begin
    declare @a nvarchar(max)

    exec dbo._testcase_unary_max 'IsMaxNullOrEmpty', @a, 'null-string', 1
end
go
create or alter proc sstr.is_max_null_or_empty_empty_max_zero_length_string_should_pass
as
begin
    declare @a nvarchar(max) = N''

    exec dbo._testcase_unary_max 'IsMaxNullOrEmpty', @a, 'empty-string', 1
end
go
create or alter proc sstr.is_max_null_or_empty_empty_max_not_empty_string_should_fail
as
begin
    declare @a nvarchar(max)

    set @a = replicate(cast(N' ' as nvarchar(max)), 100)

    exec dbo._testcase_unary_max 'IsMaxNullOrEmpty', @a, 'not-empty-string-100-length', 0

    set @a = replicate(cast(N' ' as nvarchar(max)), 5000)

    exec dbo._testcase_unary_max 'IsMaxNullOrEmpty', @a, 'not-empty-string-5000-length', 0
end
go
