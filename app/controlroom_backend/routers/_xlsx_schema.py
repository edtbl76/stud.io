"""Column definitions and table configs for xlsx import/export."""
from typing import NamedTuple, Optional


class ColDef(NamedTuple):
    header: str
    export_key: str           # key in DB view row
    write_key: Optional[str]  # key in INSERT/UPDATE payload; None for id_only
    lookup: Optional[str]     # key in lookup_data dict; None for plain text
    multi: bool               # True = comma-separated list of lookup names
    id_only: bool             # True = export only, omit from template


class TableConfig(NamedTuple):
    sheet_name: str
    view: str
    table: str
    id_col: str
    cols: list[ColDef]


_C = ColDef

_H_PLUGIN_FORMATS = "Plugin Formats"
_H_TOOL_TYPES = "Tool Types"
_H_RECORDING_NOTES = "Recording Notes"

COLS_EFFECTS: list[ColDef] = [
    _C("ID",               "effect_id",       None,                None,              False, True),
    _C("Name",             "effect_name",      "effect_name",       None,              False, False),
    _C("Brand",            "brand_name",       "brand_id",          "brands",          False, False),
    _C("Collection",       "collection",       "collection",        None,              False, False),
    _C("Version",          "version",          "version",           None,              False, False),
    _C(_H_PLUGIN_FORMATS,   "plugin_formats",   "plugin_format_ids", "plugin_formats",  True,  False),
    _C("Effect Types",     "effect_types",     "effect_type_ids",   "effect_types",    True,  False),
    _C(_H_TOOL_TYPES,       "tool_types",       "tool_type_ids",     "tool_types",      True,  False),
    _C("Tags",             "tags",             "tag_ids",           "tag_types",       True,  False),
    _C("Description",      "description",      "description",       None,              False, False),
    _C("Workflow Notes",   "workflow_notes",   "workflow_notes",    None,              False, False),
    _C(_H_RECORDING_NOTES,  "recording_notes",  "recording_notes",   None,              False, False),
    _C("Artist Reference", "artist_reference", "artist_reference",  None,              False, False),
    _C("Attributes",       "attributes",       "attributes",        None,              False, False),
]

COLS_INSTRUMENTS: list[ColDef] = [
    _C("ID",               "instrument_id",     None,                 None,               False, True),
    _C("Name",             "instrument_name",   "instrument_name",    None,               False, False),
    _C("Brand",            "brand_name",        "brand_id",           "brands",           False, False),
    _C("Version",          "version",           "version",            None,               False, False),
    _C(_H_PLUGIN_FORMATS,   "plugin_formats",    "plugin_format_ids",  "plugin_formats",   True,  False),
    _C("Instrument Types", "instrument_types",  "instrument_type_ids","instrument_types", True,  False),
    _C(_H_TOOL_TYPES,       "tool_types",        "tool_type_ids",      "tool_types",       True,  False),
    _C("Tags",             "tags",              "tag_ids",            "tag_types",        True,  False),
    _C("Description",      "description",       "description",        None,               False, False),
    _C("Instrument Notes", "instrument_notes",  "instrument_notes",   None,               False, False),
    _C(_H_RECORDING_NOTES,  "recording_notes",   "recording_notes",    None,               False, False),
    _C("Attributes",       "attributes",        "attributes",         None,               False, False),
]

COLS_LIBRARIES: list[ColDef] = [
    _C("ID",               "library_id",       None,               None,          False, True),
    _C("Name",             "library_name",     "library_name",     None,          False, False),
    _C("Brand",            "brand_name",       "brand_id",         "brands",      False, False),
    _C("Description",      "description",      "description",      None,          False, False),
    _C("Instrument Notes", "instrument_notes", "instrument_notes", None,          False, False),
    _C(_H_RECORDING_NOTES,  "recording_notes",  "recording_notes",  None,          False, False),
    _C("Tags",             "tags",             "tag_ids",          "tag_types",   True,  False),
    _C("Attributes",       "attributes",       "attributes",       None,          False, False),
]

COLS_BRANDS: list[ColDef] = [
    _C("ID",           "brand_id",         None,             None,            False, True),
    _C("Name",         "brand_name",       "brand_name",     None,            False, False),
    _C("Legal Name",   "legal_name",       "legal_name",     None,            False, False),
    _C("Entity Type",  "entity_type_name", "entity_type_id", "entity_types",  False, False),
    _C("Website",      "website",          "website",        None,            False, False),
    _C("Founder",      "founder",          "founder",        None,            False, False),
    _C("Years Active", "years",            "years",          None,            False, False),
    _C("Description",  "description",      "description",    None,            False, False),
]

COLS_MODELS: list[ColDef] = [
    _C("ID",               "model_id",         None,              None,           False, True),
    _C("Name",             "model_name",        "model_name",      None,           False, False),
    _C("Brand",            "brand_name",        "brand_id",        "brands",       False, False),
    _C("Model Types",      "model_types",       "model_type_ids",  "model_types",  True,  False),
    _C("Creator",          "creator",           "creator",         None,           False, False),
    _C("Years Active",     "years_active",      "years_active",    None,           False, False),
    _C("Links",            "links",             "links",           None,           False, False),
    _C("Description",      "description",       "description",     None,           False, False),
    _C(_H_RECORDING_NOTES,  "recording_notes",   "recording_notes", None,           False, False),
    _C("Artist Reference", "artist_reference",  "artist_reference",None,           False, False),
    _C("Attributes",       "attributes",        "attributes",      None,           False, False),
]

_BASE_TOOL_COLS: list[ColDef] = [
    _C("Name",           "tool_name",      "tool_name",         None,             False, False),
    _C("Brand",          "brand_name",     "brand_id",          "brands",         False, False),
    _C("Version",        "version",        "version",           None,             False, False),
    _C(_H_PLUGIN_FORMATS, "plugin_formats", "plugin_format_ids", "plugin_formats", True,  False),
    _C(_H_TOOL_TYPES,     "tool_types",     "tool_type_ids",     "tool_types",     True,  False),
    _C("Tags",           "tags",           "tag_ids",           "tag_types",      True,  False),
    _C("Description",    "description",    "description",       None,             False, False),
    _C("Workflow Notes", "workflow_notes", "workflow_notes",    None,             False, False),
]

COLS_WORKSTATIONS     = [_C("ID", "workstation_id",       None, None, False, True)] + _BASE_TOOL_COLS
COLS_WORKFLOW_TOOLS   = [_C("ID", "workflow_tool_id",     None, None, False, True)] + _BASE_TOOL_COLS
COLS_MEASUREMENT_TOOLS = [_C("ID", "measurement_tool_id", None, None, False, True)] + _BASE_TOOL_COLS
COLS_REFERENCE_TOOLS  = [_C("ID", "reference_tool_id",   None, None, False, True)] + _BASE_TOOL_COLS
COLS_COMPOSITION_TOOLS = [_C("ID", "composition_tool_id", None, None, False, True)] + _BASE_TOOL_COLS
COLS_ADMIN_TOOLS      = [_C("ID", "admin_tool_id",        None, None, False, True)] + _BASE_TOOL_COLS

_T = TableConfig

TABLE_CONFIGS: dict[str, TableConfig] = {
    "effects":           _T("Effects",          "effects_view",           "effects",           "effect_id",          COLS_EFFECTS),
    "instruments":       _T("Instruments",      "instruments_view",       "instruments",       "instrument_id",      COLS_INSTRUMENTS),
    "libraries":         _T("Libraries",        "libraries_view",         "libraries",         "library_id",         COLS_LIBRARIES),
    "brands":            _T("Brands",           "brands_view",            "brands",            "brand_id",           COLS_BRANDS),
    "models":            _T("Models",           "models_view",            "models",            "model_id",           COLS_MODELS),
    "workstations":      _T("Workstations",     "workstations_view",      "workstations",      "workstation_id",     COLS_WORKSTATIONS),
    "workflow_tools":    _T("Workflow Tools",   "workflow_tools_view",    "workflow_tools",    "workflow_tool_id",   COLS_WORKFLOW_TOOLS),
    "measurement_tools": _T("Measurement Tools","measurement_tools_view", "measurement_tools", "measurement_tool_id",COLS_MEASUREMENT_TOOLS),
    "reference_tools":   _T("Reference Tools",  "reference_tools_view",   "reference_tools",   "reference_tool_id",  COLS_REFERENCE_TOOLS),
    "composition_tools": _T("Composition Tools","composition_tools_view", "composition_tools", "composition_tool_id",COLS_COMPOSITION_TOOLS),
    "admin_tools":       _T("Admin Tools",      "admin_tools_view",       "admin_tools",       "admin_tool_id",      COLS_ADMIN_TOOLS),
}

SHEET_TO_KEY = {v.sheet_name: k for k, v in TABLE_CONFIGS.items()}
VALID_KEYS = list(TABLE_CONFIGS.keys())

# Lookup columns written to the hidden _Lookups sheet (order = column index)
LOOKUP_COLS = [
    "brands", "entity_types", "plugin_formats", "effect_types",
    "instrument_types", "tool_types", "model_types", "tag_types",
]
LOOKUP_MAX_ROWS = 500
