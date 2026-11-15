"""Validated presentation profiles shared by colorizer, auditor and legend."""
from pathlib import Path
import json
import re

THEMES = Path(__file__).resolve().parent.parent / 'assets/themes'
ROLES = {'start', 'end', 'intermediate', 'gateway', 'activity', 'frame', 'header', 'body'}


def contrast(a, b):
    def luminance(s):
        rgb = [int(s[i:i+2], 16)/255 for i in (1, 3, 5)]
        rgb = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb]
        return sum(v*w for v, w in zip(rgb, (.2126, .7152, .0722)))
    x, y = sorted((luminance(a), luminance(b)))
    return (y+.05)/(x+.05)


def load_theme(value='tool-convention'):
    if isinstance(value, dict):
        data = value
    else:
        path = Path(value)
        if not path.is_file():
            if not re.fullmatch(r'[a-z0-9-]+', str(value)):
                raise ValueError('Theme must be a built-in name or an existing JSON file')
            path = THEMES / (str(value)+'.json')
        data = json.loads(path.read_text(encoding='utf-8'))
    allowed = {'schema_version', 'id', 'description', 'source', 'fills', 'stroke',
               'text', 'label_background', 'min_text_contrast', 'apply_ink'}
    if set(data)-allowed or data.get('schema_version') != 1 or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', str(data.get('id', ''))):
        raise ValueError('Unsupported theme schema or unknown keys (only color properties are allowed)')
    if any(not isinstance(data.get(k, ''), str) for k in ('description', 'source')):
        raise ValueError('Theme description/source must be text')
    if set(data.get('fills', {})) != ROLES:
        raise ValueError('Theme fills must define exactly: '+', '.join(sorted(ROLES)))
    colors = [*data['fills'].values(), data.get('stroke'), data.get('text'), data.get('label_background')]
    if any(not isinstance(c, str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', c) for c in colors):
        raise ValueError('Theme colors must be #rrggbb')
    threshold = data.get('min_text_contrast', 4.5)
    if not isinstance(threshold, (int, float)) or threshold < 4.5 or threshold > 21:
        raise ValueError('Minimum text contrast must be between 4.5 and 21')
    for bg in [*data['fills'].values(), data['label_background']]:
        if contrast(data['text'], bg) < threshold:
            raise ValueError('Insufficient text contrast on '+bg)
        if contrast(data['stroke'], bg) < 3:
            raise ValueError('Insufficient marker/outline contrast on '+bg)
    if not isinstance(data.get('apply_ink'), bool):
        raise ValueError('apply_ink must be boolean')
    return data


def role(data):
    kind = data['kind']
    if kind == 'startEvent': return 'start'
    if kind == 'endEvent': return 'end'
    if kind in ('boundaryEvent', 'intermediateEvent'): return 'intermediate'
    if kind.endswith('Gateway') or kind == 'gateway': return 'gateway'
    if kind in ('subProcess', 'callActivity'):
        return 'activity' if data['style'].get('isLoopSub') == '1' else 'frame'
    if kind == 'task' or kind.endswith('Task'): return 'activity'
    if kind in ('participant', 'swimlane', 'lane'): return 'header'
    if kind in ('dataObject','dataStore','dataInput','dataOutput'): return 'body'
    return None


def expected_fill(data, theme='tool-convention'):
    selected = load_theme(theme)
    return selected['fills'].get(role(data))


def legend(theme='bizagi-inspired'):
    selected = load_theme(theme)
    lines = ['| Role | Fill |', '|---|---|']
    lines += [f'| {key} | `{value}` |' for key, value in selected['fills'].items()]
    return '\n'.join(lines)+'\n'
