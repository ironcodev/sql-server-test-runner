CREATE or ALTER   FUNCTION [dbo].[Sum]
(
	@a sql_variant,
	@b sql_variant
)
RETURNS sql_variant
AS
BEGIN
	declare @result sql_variant

	set @result = convert(float, @a) + convert(float, @b)

	return @result
END

GO
