create or alter proc sstr.max_equals_ordinal_both_null_should_pass
as
    exec dbo._testcase 'MaxEqualsOrdinal', null, null, 'both-null', 1
go
create or alter proc sstr.max_equals_ordinal_null_and_number_should_fail
as
    exec dbo._testcase 'MaxEqualsOrdinal', null, 10, 'null-number', 0
go
create or alter proc sstr.max_equals_ordinal_number_and_null_should_fail
as
    exec dbo._testcase 'MaxEqualsOrdinal', 10, null, 'number-null', 0
go
create or alter proc sstr.max_equals_ordinal_nullstr_and_null_should_fail
as
    exec dbo._testcase 'MaxEqualsOrdinal', 'null', null, 'nullstr-null', 0
go
create or alter proc sstr.max_equals_ordinal_null_and_nullstr_should_fail
as
    exec dbo._testcase 'MaxEqualsOrdinal', null, 'null', 'null-nullstr', 0
go
create or alter proc sstr.max_equals_ordinal_both_nullstr_should_pass
as
    exec dbo._testcase 'MaxEqualsOrdinal', 'null', 'null', 'both-nullstr', 1
go
create or alter proc sstr.max_equals_ordinal_num_eq_num_should_pass
as
    exec dbo._testcase 'MaxEqualsOrdinal', 10, 10, 'num-eq-num', 1
go
create or alter proc sstr.max_equals_ordinal_num_neq_num_should_fail
as
    exec dbo._testcase 'MaxEqualsOrdinal', 10, 20, 'num-neq-num', 0
go
create or alter proc sstr.max_equals_ordinal_str_eq_str_should_pass
as
    exec dbo._testcase 'MaxEqualsOrdinal', N'hello', N'hello', 'str-eq-str', 1
go
create or alter proc sstr.max_equals_ordinal_str_neq_str_should_fail
as
    exec dbo._testcase 'MaxEqualsOrdinal', N'hello', N'world', 'str-neq-str', 0
go
create or alter proc sstr.max_equals_ordinal_case_differs_should_fail
as
    exec dbo._testcase 'MaxEqualsOrdinal', 'Hello', 'hello', 'case-differs', 0
go
create or alter proc sstr.max_equals_ordinal_case_same_should_pass
as
    exec dbo._testcase 'MaxEqualsOrdinal', 'Hello', 'Hello', 'case-same', 1
go
create or alter proc sstr.max_equals_ordinal_trailing_space_should_fail
as
    exec dbo._testcase 'MaxEqualsOrdinal', 'Hello', 'Hello ', 'trailing-space', 0
go
create or alter proc sstr.max_equals_ordinal_unicode_nfc_vs_nfd_should_fail
as
begin
    -- U+00E9 (é) vs U+0065 U+0301 (e + combining acute)
    -- U+00E9 (é) vs U+0065 U+0301 (e + combining acute)
    -- NFC is the single code point 233; NFD is 'e' + combining acute (769)
    declare @nfc nvarchar(2) = nchar(233)
    declare @nfd nvarchar(2) = N'e' + nchar(769)

    exec dbo._testcase 'MaxEqualsOrdinal', @nfc, @nfd, 'nfc-vs-nfd', 0
end
go

-- the reason MaxEqualsOrdinal exists: values beyond the sql_variant 4000-char cap
create or alter proc sstr.max_equals_ordinal_long_strings_should_pass
as
begin
    set nocount on;

    declare @a nvarchar(max) = replicate(cast(N'x' as nvarchar(max)), 5000)

    declare @raised bit = 0
    begin try
        exec $(AssertSchema).MaxEqualsOrdinal @a, @a, 'long-eq-long'
    end try
    begin catch
        set @raised = 1
    end catch

    exec $(AssertSchema).IsFalse @raised, 'long-eq-long'
end
go

create or alter proc sstr.max_equals_ordinal_long_strings_differ_should_fail
as
begin
    set nocount on;

    declare @a nvarchar(max) = replicate(cast(N'x' as nvarchar(max)), 5000)
    declare @b nvarchar(max) = replicate(cast(N'x' as nvarchar(max)), 4999) + N'y'

    declare @raised bit = 0
    begin try
        exec $(AssertSchema).MaxEqualsOrdinal @a, @b, 'long-neq-long'
    end try
    begin catch
        set @raised = 1
    end catch

    exec $(AssertSchema).IsTrue @raised, 'long-neq-long'
end
go