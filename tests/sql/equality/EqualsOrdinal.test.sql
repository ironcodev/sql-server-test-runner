create or alter proc sstr.equals_ordinal_both_null_should_pass
as
    exec dbo._testcase 'EqualsOrdinal', null, null, 'both-null', 1
go
create or alter proc sstr.equals_ordinal_null_and_number_should_fail
as
    exec dbo._testcase 'EqualsOrdinal', null, 10, 'null-number', 0
go
create or alter proc sstr.equals_ordinal_number_and_null_should_fail
as
    exec dbo._testcase 'EqualsOrdinal', 10, null, 'number-null', 0
go
create or alter proc sstr.equals_ordinal_nullstr_and_null_should_fail
as
    exec dbo._testcase 'EqualsOrdinal', 'null', null, 'nullstr-null', 0
go
create or alter proc sstr.equals_ordinal_null_and_nullstr_should_fail
as
    exec dbo._testcase 'EqualsOrdinal', null, 'null', 'null-nullstr', 0
go
create or alter proc sstr.equals_ordinal_both_nullstr_should_pass
as
    exec dbo._testcase 'EqualsOrdinal', 'null', 'null', 'both-nullstr', 1
go
create or alter proc sstr.equals_ordinal_num_eq_num_should_pass
as
    exec dbo._testcase 'EqualsOrdinal', 10, 10, 'num-eq-num', 1
go
create or alter proc sstr.equals_ordinal_num_neq_num_should_fail
as
    exec dbo._testcase 'EqualsOrdinal', 10, 20, 'num-neq-num', 0
go
create or alter proc sstr.equals_ordinal_num_eq_numstr_should_pass
as
    exec dbo._testcase 'EqualsOrdinal', 10, '10', 'num-eq-numstr', 1
go
create or alter proc sstr.equals_ordinal_num_neq_numstr_should_fail
as
    exec dbo._testcase 'EqualsOrdinal', 10, '20', 'num-neq-numstr', 0
go
create or alter proc sstr.equals_ordinal_numstr_eq_numstr_should_pass
as
    exec dbo._testcase 'EqualsOrdinal', '10', '10', 'numstr-eq-numstr', 1
go
create or alter proc sstr.equals_ordinal_numstr_neq_numstr_should_fail
as
    exec dbo._testcase 'EqualsOrdinal', '10', '20', 'numstr-neq-numstr', 0
go

-- the cases that distinguish EqualsOrdinal from Equals

create or alter proc sstr.equals_ordinal_case_differs_should_fail
as
    exec dbo._testcase 'EqualsOrdinal', 'Hello', 'hello', 'case-differs', 0
go
create or alter proc sstr.equals_ordinal_case_same_should_pass
as
    exec dbo._testcase 'EqualsOrdinal', 'Hello', 'Hello', 'case-same', 1
go
create or alter proc sstr.equals_ordinal_trailing_space_should_fail
as
    exec dbo._testcase 'EqualsOrdinal', 'Hello', 'Hello ', 'trailing-space', 0
go
create or alter proc sstr.equals_ordinal_unicode_nfc_vs_nfd_should_fail
as
begin
    -- U+00E9 (é) vs U+0065 U+0301 (e + combining acute)
    -- NFC is the single code point 233; NFD is 'e' + combining acute (769)
    declare @nfc nvarchar(2) = nchar(233)
    declare @nfd nvarchar(2) = N'e' + nchar(769)
    exec dbo._testcase 'EqualsOrdinal', @nfc, @nfd, 'nfc-vs-nfd', 0
end
go