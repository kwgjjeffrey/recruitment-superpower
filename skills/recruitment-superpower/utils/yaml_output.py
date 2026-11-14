"""Human-readable semantic output; packaged PyYAML needs no user-side pip install."""
from utils._vendor import yaml


class SemanticDumper(yaml.SafeDumper):
    def increase_indent(self, flow=False, indentless=False):
        return super().increase_indent(flow, False)


def render(value):
    # Preserve every value. Put routing identity before the contract it describes.
    order = ('query', 'mode', 'count', 'entities', 'results', 'type', 'asset_path',
             'semantic_ref', 'display_name', 'description', 'parent', 'default_view',
             'params', 'requires', 'views', 'view', 'returns', 'actions', 'columns',
             'ok', 'error', 'revision')
    if isinstance(value, dict):
        value = {**{key: value[key] for key in order if key in value},
                 **{key: item for key, item in value.items() if key not in order}}
    return yaml.dump(value, Dumper=SemanticDumper, allow_unicode=True,
                     sort_keys=False, default_flow_style=False, width=100)
