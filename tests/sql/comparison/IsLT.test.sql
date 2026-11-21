create or alter proc sstr.is_lt_less_should_pass
as exec dbo._testcase 'IsLT', 3, 5, 'less', 1
go
create or alter proc sstr.is_lt_equal_should_fail
as exec dbo._testcase 'IsLT', 5, 5, 'equal', 0
go
create or alter proc sstr.is_lt_greater_should_fail
as exec dbo._testcase 'IsLT', 5, 3, 'greater', 0
go
create or alter proc sstr.is_lt_a_null_should_fail
as exec dbo._testcase 'IsLT', null, 5, 'a-null', 0
go
create or alter proc sstr.is_lt_b_null_should_fail
as exec dbo._testcase 'IsLT', 5, null, 'b-null', 0
go
create or alter proc sstr.is_lt_mixed_types_should_pass
as exec dbo._testcase 'IsLT', 3, '5', 'mixed-types', 1
go
create or alter proc sstr.is_lt_non_numeric_should_fail
as exec dbo._testcase 'IsLT', 'abc', 5, 'non-numeric', 0
go