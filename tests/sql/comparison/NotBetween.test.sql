create or alter proc sstr.not_between_below_should_pass
as exec dbo._testcase_between 'NotBetween', 0, 1, 10, 'below', 1
go
create or alter proc sstr.not_between_above_should_pass
as exec dbo._testcase_between 'NotBetween', 11, 1, 10, 'above', 1
go
create or alter proc sstr.not_between_inside_should_fail
as exec dbo._testcase_between 'NotBetween', 5, 1, 10, 'inside', 0
go
create or alter proc sstr.not_between_lower_bound_should_fail
as exec dbo._testcase_between 'NotBetween', 1, 1, 10, 'lower-bound', 0
go
create or alter proc sstr.not_between_upper_bound_should_fail
as exec dbo._testcase_between 'NotBetween', 10, 1, 10, 'upper-bound', 0
go
create or alter proc sstr.not_between_inverted_bounds_should_pass
as exec dbo._testcase_between 'NotBetween', 5, 10, 1, 'inverted-bounds', 1
go
create or alter proc sstr.not_between_a_null_should_fail
as exec dbo._testcase_between 'NotBetween', null, 1, 10, 'a-null', 0
go
create or alter proc sstr.not_between_from_null_should_fail
as exec dbo._testcase_between 'NotBetween', 5, null, 10, 'from-null', 0
go
create or alter proc sstr.not_between_to_null_should_fail
as exec dbo._testcase_between 'NotBetween', 5, 1, null, 'to-null', 0
go
create or alter proc sstr.not_between_non_numeric_should_fail
as exec dbo._testcase_between 'NotBetween', 'abc', 1, 10, 'non-numeric', 0
go