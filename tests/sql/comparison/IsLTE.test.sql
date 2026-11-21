create or alter proc sstr.is_lte_less_should_pass
as exec dbo._testcase 'IsLTE', 3, 5, 'less', 1
go
create or alter proc sstr.is_lte_equal_should_pass
as exec dbo._testcase 'IsLTE', 5, 5, 'equal', 1
go
create or alter proc sstr.is_lte_greater_should_fail
as exec dbo._testcase 'IsLTE', 5, 3, 'greater', 0
go
create or alter proc sstr.is_lte_a_null_should_fail
as exec dbo._testcase 'IsLTE', null, 5, 'a-null', 0
go
create or alter proc sstr.is_lte_b_null_should_fail
as exec dbo._testcase 'IsLTE', 5, null, 'b-null', 0
go
create or alter proc sstr.is_lte_mixed_types_should_pass
as exec dbo._testcase 'IsLTE', '5', 5, 'mixed-types', 1
go
create or alter proc sstr.is_lte_non_numeric_should_fail
as exec dbo._testcase 'IsLTE', 'abc', 5, 'non-numeric', 0
go