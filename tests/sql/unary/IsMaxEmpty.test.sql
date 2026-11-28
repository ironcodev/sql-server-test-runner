create or alter proc sstr.is_max_empty_empty_string_should_pass
as exec dbo._testcase_unary_max 'IsMaxEmpty', '', 'empty-string', 1
go
create or alter proc sstr.is_max_empty_single_space_should_fail
as exec dbo._testcase_unary_max 'IsMaxEmpty', ' ', 'single-space', 1
go
create or alter proc sstr.is_max_empty_string_should_fail
as exec dbo._testcase_unary_max 'IsMaxEmpty', 'x', 'string', 0
go
create or alter proc sstr.is_max_empty_zero_should_fail
as exec dbo._testcase_unary_max 'IsMaxEmpty', 0, 'zero', 0
go
create or alter proc sstr.is_max_empty_null_should_pass
as exec dbo._testcase_unary_max 'IsMaxEmpty', null, 'null', 1
go
create or alter proc sstr.is_max_empty_empty_max_string_should_pass
as
begin
    declare @a nvarchar(max) = replicate(cast(N' ' as nvarchar(max)), 5000)

    exec dbo._testcase_unary_max 'IsMaxEmpty', @a, 'empty-string', 1
end
go
