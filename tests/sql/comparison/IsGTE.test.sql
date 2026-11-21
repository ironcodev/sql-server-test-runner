create or alter proc sstr.is_gte_greater_should_pass
as exec dbo._testcase 'IsGTE', 5, 3, 'greater', 1
go
create or alter proc sstr.is_gte_equal_should_pass
as exec dbo._testcase 'IsGTE', 5, 5, 'equal', 1
go
create or alter proc sstr.is_gte_less_should_fail
as exec dbo._testcase 'IsGTE', 3, 5, 'less', 0
go
create or alter proc sstr.is_gte_a_null_should_fail
as exec dbo._testcase 'IsGTE', null, 5, 'a-null', 0
go
create or alter proc sstr.is_gte_b_null_should_fail
as exec dbo._testcase 'IsGTE', 5, null, 'b-null', 0
go
create or alter proc sstr.is_gte_mixed_types_should_pass
as exec dbo._testcase 'IsGTE', '5', 5, 'mixed-types', 1
go
create or alter proc sstr.is_gte_non_numeric_should_fail
as exec dbo._testcase 'IsGTE', 'abc', 5, 'non-numeric', 0
go