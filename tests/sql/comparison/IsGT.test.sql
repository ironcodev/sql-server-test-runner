create or alter proc sstr.is_gt_greater_should_pass
as exec dbo._testcase 'IsGT', 5, 3, 'greater', 1
go
create or alter proc sstr.is_gt_equal_should_fail
as exec dbo._testcase 'IsGT', 5, 5, 'equal', 0
go
create or alter proc sstr.is_gt_less_should_fail
as exec dbo._testcase 'IsGT', 3, 5, 'less', 0
go
create or alter proc sstr.is_gt_a_null_should_fail
as exec dbo._testcase 'IsGT', null, 5, 'a-null', 0
go
create or alter proc sstr.is_gt_b_null_should_fail
as exec dbo._testcase 'IsGT', 5, null, 'b-null', 0
go
create or alter proc sstr.is_gt_mixed_types_should_pass
as exec dbo._testcase 'IsGT', '5', 3, 'mixed-types', 1
go
create or alter proc sstr.is_gt_non_numeric_should_fail
as exec dbo._testcase 'IsGT', 'abc', 5, 'non-numeric', 0
go
create or alter proc sstr.is_gt_float_should_pass
as exec dbo._testcase 'IsGT', 5.5, 5, 'float', 1
go
create or alter proc sstr.is_gt_date_strings_should_fail
as exec dbo._testcase 'IsGT', '2025-01-01', '2024-12-31', 'date-strings', 0
go