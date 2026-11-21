create or alter proc sstr.not_equals_ordinal_both_null_should_fail
as
    exec dbo._testcase 'NotEqualsOrdinal', null, null, 'both-null', 0
go
create or alter proc sstr.not_equals_ordinal_null_and_number_should_pass
as
    exec dbo._testcase 'NotEqualsOrdinal', null, 10, 'null-number', 1
go
create or alter proc sstr.not_equals_ordinal_number_and_null_should_pass
as
    exec dbo._testcase 'NotEqualsOrdinal', 10, null, 'number-null', 1
go
create or alter proc sstr.not_equals_ordinal_nullstr_and_null_should_pass
as
    exec dbo._testcase 'NotEqualsOrdinal', 'null', null, 'nullstr-null', 1
go
create or alter proc sstr.not_equals_ordinal_null_and_nullstr_should_pass
as
    exec dbo._testcase 'NotEqualsOrdinal', null, 'null', 'null-nullstr', 1
go
create or alter proc sstr.not_equals_ordinal_both_nullstr_should_fail
as
    exec dbo._testcase 'NotEqualsOrdinal', 'null', 'null', 'both-nullstr', 0
go
create or alter proc sstr.not_equals_ordinal_num_eq_num_should_fail
as
    exec dbo._testcase 'NotEqualsOrdinal', 10, 10, 'num-eq-num', 0
go
create or alter proc sstr.not_equals_ordinal_num_neq_num_should_pass
as
    exec dbo._testcase 'NotEqualsOrdinal', 10, 20, 'num-neq-num', 1
go
create or alter proc sstr.not_equals_ordinal_num_eq_numstr_should_fail
as
    exec dbo._testcase 'NotEqualsOrdinal', 10, '10', 'num-eq-numstr', 0
go
create or alter proc sstr.not_equals_ordinal_num_neq_numstr_should_pass
as
    exec dbo._testcase 'NotEqualsOrdinal', 10, '20', 'num-neq-numstr', 1
go
create or alter proc sstr.not_equals_ordinal_numstr_eq_numstr_should_fail
as
    exec dbo._testcase 'NotEqualsOrdinal', '10', '10', 'numstr-eq-numstr', 0
go
create or alter proc sstr.not_equals_ordinal_numstr_neq_numstr_should_pass
as
    exec dbo._testcase 'NotEqualsOrdinal', '10', '20', 'numstr-neq-numstr', 1
go

-- the cases that distinguish NotEqualsOrdinal from NotEquals

create or alter proc sstr.not_equals_ordinal_case_differs_should_pass
as
    exec dbo._testcase 'NotEqualsOrdinal', 'Hello', 'hello', 'case-differs', 1
go
create or alter proc sstr.not_equals_ordinal_case_same_should_fail
as
    exec dbo._testcase 'NotEqualsOrdinal', 'Hello', 'Hello', 'case-same', 0
go
create or alter proc sstr.not_equals_ordinal_trailing_space_should_fail
as
    exec dbo._testcase 'NotEqualsOrdinal', 'Hello', 'Hello ', 'trailing-space', 0
go
create or alter proc sstr.not_equals_ordinal_unicode_nfc_vs_nfd_should_pass
as
begin
    -- U+00E9 (é) vs U+0065 U+0301 (e + combining acute)
    -- NFC is the single code point 233; NFD is 'e' + combining acute (769)
    declare @nfc nvarchar(2) = nchar(233)
    declare @nfd nvarchar(2) = N'e' + nchar(769)
    exec dbo._testcase 'NotEqualsOrdinal', @nfc, @nfd, 'nfc-vs-nfd', 1
end
go
