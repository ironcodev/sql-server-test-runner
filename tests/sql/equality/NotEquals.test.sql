create or alter proc sstr.not_equals_both_null_should_fail
as
    exec _testcase 'NotEquals', null, null, 'both-null', 0
go
create or alter proc sstr.not_equals_null_and_number_should_pass
as
    exec _testcase 'NotEquals', null, 10, 'null-number', 1
go
create or alter proc sstr.not_equals_number_and_null_should_pass
as
    exec _testcase 'NotEquals', 10, null, 'number-null', 1
go
create or alter proc sstr.not_equals_nullstr_and_null_should_pass
as
    exec _testcase 'NotEquals', 'null', null, 'nullstr-null', 1
go
create or alter proc sstr.not_equals_null_and_nullstr_should_pass
as
    exec _testcase 'NotEquals', null, 'null', 'null-nullstr', 1
go
create or alter proc sstr.not_equals_both_nullstr_should_fail
as
    exec _testcase 'NotEquals', 'null', 'null', 'both-nullstr', 0
go
create or alter proc sstr.not_equals_num_eq_num_should_fail
as
    exec _testcase 'NotEquals', 10, 10, 'num-eq-num', 0
go
create or alter proc sstr.not_equals_num_neq_num_should_pass
as
    exec _testcase 'NotEquals', 10, 20, 'num-neq-num', 1
go
create or alter proc sstr.not_equals_num_eq_numstr_should_fail
as
    exec _testcase 'NotEquals', 10, '10', 'num-eq-numstr', 0
go
create or alter proc sstr.not_equals_num_neq_numstr_should_pass
as
    exec _testcase 'NotEquals', 10, '20', 'num-neq-numstr', 1
go
create or alter proc sstr.not_equals_numstr_eq_numstr_should_fail
as
    exec _testcase 'NotEquals', '10', '10', 'numstr-eq-numstr', 0
go
create or alter proc sstr.not_equals_numstr_neq_numstr_should_pass
as
    exec _testcase 'NotEquals', '10', '20', 'numstr-neq-numstr', 1
go
create or alter proc sstr.not_equals_numstr_eq_num_should_fail
as
    exec _testcase 'NotEquals', '10', 10, 'numstr-eq-num', 0
go
create or alter proc sstr.not_equals_numstr_neq_num_should_pass
as
    exec _testcase 'NotEquals', '10', 20, 'numstr-neq-num', 1
go
