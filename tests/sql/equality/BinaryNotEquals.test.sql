create or alter proc sstr.binary_not_equals_both_null_should_fail
as
    exec dbo._testcase 'BinaryNotEquals', null, null, 'both-null', 0
go
create or alter proc sstr.binary_not_equals_null_and_number_should_pass
as
    exec dbo._testcase 'BinaryNotEquals', null, 10, 'null-number', 1
go
create or alter proc sstr.binary_not_equals_num_eq_num_should_fail
as
    exec dbo._testcase 'BinaryNotEquals', 10, 10, 'num-eq-num', 0
go
create or alter proc sstr.binary_not_equals_case_differs_should_pass
as
    exec dbo._testcase 'BinaryNotEquals', 'Hello', 'hello', 'case-differs', 1
go