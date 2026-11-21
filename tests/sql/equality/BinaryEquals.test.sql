create or alter proc sstr.binary_equals_both_null_should_pass
as
    exec dbo._testcase 'BinaryEquals', null, null, 'both-null', 1
go
create or alter proc sstr.binary_equals_null_and_number_should_fail
as
    exec dbo._testcase 'BinaryEquals', null, 10, 'null-number', 0
go
create or alter proc sstr.binary_equals_num_eq_num_should_pass
as
    exec dbo._testcase 'BinaryEquals', 10, 10, 'num-eq-num', 1
go
create or alter proc sstr.binary_equals_case_differs_should_fail
as
    exec dbo._testcase 'BinaryEquals', 'Hello', 'hello', 'case-differs', 0
go
create or alter proc sstr.binary_equals_num_eq_numstr_should_pass
as
    exec dbo._testcase 'BinaryEquals', 10, '10', 'num-eq-numstr', 1
go
