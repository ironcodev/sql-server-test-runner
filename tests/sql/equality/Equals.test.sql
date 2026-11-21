create or alter proc sstr.equals_both_null_should_pass
as
    exec _testcase 'Equals', null, null, 'both-null', 1
go
create or alter proc sstr.equals_null_and_number_should_fail
as
    exec _testcase 'Equals', null, 10, 'null-number', 0
go
create or alter proc sstr.equals_number_and_null_should_fail
as
    exec _testcase 'Equals', 10, null, 'number-null', 0
go
create or alter proc sstr.equals_nullstr_and_null_should_fail
as
    exec _testcase 'Equals', 'null', null, 'nullstr-null', 0
go
create or alter proc sstr.equals_null_and_nullstr_should_fail
as
    exec _testcase 'Equals', null, 'null', 'null-nullstr', 0
go
create or alter proc sstr.equals_both_nullstr_should_pass
as
    exec _testcase 'Equals', 'null', 'null', 'both-nullstr', 1
go
create or alter proc sstr.equals_num_eq_num_should_pass
as
    exec _testcase 'Equals', 10, 10, 'num-eq-num', 1
go
create or alter proc sstr.equals_num_neq_num_should_fail
as
    exec _testcase 'Equals', 10, 20, 'num-neq-num', 0
go
create or alter proc sstr.equals_num_eq_numstr_should_pass
as
    exec _testcase 'Equals', 10, '10', 'num-eq-numstr', 1
go
create or alter proc sstr.equals_num_neq_numstr_should_fail
as
    exec _testcase 'Equals', 10, '20', 'num-neq-numstr', 0
go
create or alter proc sstr.equals_numstr_eq_numstr_should_pass
as
    exec _testcase 'Equals', '10', '10', 'numstr-eq-numstr', 1
go
create or alter proc sstr.equals_numstr_neq_numstr_should_fail
as
    exec _testcase 'Equals', '10', '20', 'numstr-neq-numstr', 0
go
create or alter proc sstr.equals_numstr_eq_num_should_pass
as
    exec _testcase 'Equals', '10', 10, 'numstr-eq-num', 1
go
create or alter proc sstr.equals_numstr_neq_num_should_fail
as
    exec _testcase 'Equals', '10', 20, 'numstr-neq-num', 0
go
