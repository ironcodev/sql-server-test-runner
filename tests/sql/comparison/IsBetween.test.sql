create or alter proc sstr.is_between_inside_should_pass
as exec dbo._testcase_between 'IsBetween', 5, 1, 10, 'inside', 1
go
create or alter proc sstr.is_between_lower_bound_should_pass
as exec dbo._testcase_between 'IsBetween', 1, 1, 10, 'lower-bound', 1
go
create or alter proc sstr.is_between_upper_bound_should_pass
as exec dbo._testcase_between 'IsBetween', 10, 1, 10, 'upper-bound', 1
go
create or alter proc sstr.is_between_below_should_fail
as exec dbo._testcase_between 'IsBetween', 0, 1, 10, 'below', 0
go
create or alter proc sstr.is_between_above_should_fail
as exec dbo._testcase_between 'IsBetween', 11, 1, 10, 'above', 0
go
create or alter proc sstr.is_between_inverted_bounds_should_fail
as exec dbo._testcase_between 'IsBetween', 5, 10, 1, 'inverted-bounds', 0
go
create or alter proc sstr.is_between_a_null_should_fail
as exec dbo._testcase_between 'IsBetween', null, 1, 10, 'a-null', 0
go
create or alter proc sstr.is_between_from_null_should_fail
as exec dbo._testcase_between 'IsBetween', 5, null, 10, 'from-null', 0
go
create or alter proc sstr.is_between_to_null_should_fail
as exec dbo._testcase_between 'IsBetween', 5, 1, null, 'to-null', 0
go
create or alter proc sstr.is_between_non_numeric_should_fail
as exec dbo._testcase_between 'IsBetween', 'abc', 1, 10, 'non-numeric', 0
go