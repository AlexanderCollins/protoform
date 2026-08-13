"""Tests for field-to-resource mapping."""

from protoform.mapping import group_values_by_resource


class TestGroupValuesByResource:
    def test_simple_mapping(self):
        values = {"first_name": "Alex", "last_name": "Smith"}
        mapping = {
            "first_name": "myapp.Person",
            "last_name": "myapp.Person",
        }
        result = group_values_by_resource(values, mapping)
        assert result == {
            "myapp.Person": {"first_name": "Alex", "last_name": "Smith"},
        }

    def test_multiple_resources(self):
        values = {"first_name": "Alex", "reg_code": "123"}
        mapping = {
            "first_name": "myapp.Person",
            "reg_code": ("myapp.Company", "business_number"),
        }
        result = group_values_by_resource(values, mapping)
        assert result == {
            "myapp.Person": {"first_name": "Alex"},
            "myapp.Company": {"business_number": "123"},
        }

    def test_unmapped_fields_ignored(self):
        values = {"first_name": "Alex", "extra": "data"}
        mapping = {"first_name": "myapp.Person"}
        result = group_values_by_resource(values, mapping)
        assert result == {"myapp.Person": {"first_name": "Alex"}}
        assert "extra" not in str(result)

    def test_empty_values(self):
        result = group_values_by_resource({}, {"x": "myapp.Model"})
        assert result == {}

    def test_tuple_mapping_renames_field(self):
        values = {"reg_code": "53004085616"}
        mapping = {"reg_code": ("myapp.Company", "business_number")}
        result = group_values_by_resource(values, mapping)
        assert result == {"myapp.Company": {"business_number": "53004085616"}}
