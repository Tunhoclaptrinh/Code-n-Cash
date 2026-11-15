"""Targeted rendered label/containment/connector checks, separate from BPMN semantics."""
from drawio_common import ancestors

CONTAINERS = ('lane', 'participant', 'swimlane', 'subProcess')


def overlap(a, b, pad=2):
    # Label boxes include text spacing; a contact of 2 px or less is not a visible overlap.
    return (min(a['x']+a['width'],b['x']+b['width'])-max(a['x'],b['x']) > pad and
            min(a['y']+a['height'],b['y']+b['height'])-max(a['y'],b['y']) > pad)


def inside(a, b, pad=3):
    return (a['x'] >= b['x']-pad and a['y'] >= b['y']-pad and
            a['x']+a['width'] <= b['x']+b['width']+pad and
            a['y']+a['height'] <= b['y']+b['height']+pad)


def crosses(a, b, box, inset=2):
    """True when segment a-b enters the rectangle shrunk by inset on every side."""
    x,y,w,h=(box[k] for k in ['x','y','width','height'])
    x0,x1,y0,y1=x+inset,x+w-inset,y+inset,y+h-inset
    if abs(a["x"]-b["x"])<.1:
        return x0<a["x"]<x1 and max(min(a["y"],b["y"]),y0)<min(max(a["y"],b["y"]),y1)
    if abs(a["y"]-b["y"])<.1:
        return y0<a["y"]<y1 and max(min(a["x"],b["x"]),x0)<min(max(a["x"],b["x"]),x1)
    # The general segment/rectangle test also detects diagonal routing through shapes.
    dx,dy=b["x"]-a["x"],b["y"]-a["y"]
    t0,t1=0.0,1.0
    for p,q in [(-dx,a["x"]-x0),(dx,x1-a["x"]),(-dy,a["y"]-y0),(dy,y1-a["y"])]:
        if p==0:
            if q<0:return False
        elif p<0:t0=max(t0,q/p)
        else:t1=min(t1,q/p)
    return t0<t1 and t0<1 and t1>0


def collinear_overlap(a, b, c, d, tolerance=2, minimum=8):
    """Length shared by two axis-aligned segments drawn on the same line."""
    if abs(a['y']-b['y'])<.1 and abs(c['y']-d['y'])<.1 and abs(a['y']-c['y'])<=tolerance:
        lo,hi=max(min(a['x'],b['x']),min(c['x'],d['x'])),min(max(a['x'],b['x']),max(c['x'],d['x']))
    elif abs(a['x']-b['x'])<.1 and abs(c['x']-d['x'])<.1 and abs(a['x']-c['x'])<=tolerance:
        lo,hi=max(min(a['y'],b['y']),min(c['y'],d['y'])),min(max(a['y'],b['y']),max(c['y'],d['y']))
    else:
        return 0
    return hi-lo if hi-lo>minimum else 0


def borders(data, box):
    """Container outline plus its header separator; startSize defaults as in mxGraph."""
    x,y,w,h=(box[k] for k in ('x','y','width','height'))
    corners=[(x,y),(x+w,y),(x+w,y+h),(x,y+h),(x,y)]
    lines=[({'x':a[0],'y':a[1]},{'x':b[0],'y':b[1]}) for a,b in zip(corners,corners[1:])]
    if data['kind']!='subProcess':
        size=float(data['style'].get('startSize','40'))
        if data['style'].get('horizontal','1')=='0':lines.append(({'x':x+size,'y':y},{'x':x+size,'y':y+h}))
        else:lines.append(({'x':x,'y':y+size},{'x':x+w,'y':y+size}))
    return lines


def internal_label(data):
    s=data['style']
    return (data['kind'] in ('task','subProcess','callActivity','lane','participant','swimlane') or data['kind'].endswith('Task')) and \
        s.get('verticalLabelPosition','middle') not in ('top','bottom') and s.get('labelPosition','center') not in ('left','right')


def layout_issues(records, rendered):
    issues=[]
    boxes={b['id']:b for b in rendered.get('vertices', [])}
    labels=[b for b in rendered.get('labels', []) if b.get('text','').strip() and b['width']>0 and b['height']>0]
    edges={e['id']:[p for p in e['points'] if p] for e in rendered.get('edges', []) if e['id'] in records}
    def flow(d): return d['kind'] in ('task','subProcess','callActivity') or d['kind'].endswith(('Task','Event','Gateway'))
    def container(key):
        chain=ancestors(key,records)
        if records[key]['kind']=='boundaryEvent':
            # A boundary label sits beside its activity border, not inside that activity.
            attached=records[key]['obj'].get('attachedToRef') or records[key]['parent']
            chain=ancestors(attached,records) if attached in records else chain
        return next((k for k in chain if k in records and records[k]['kind'] in CONTAINERS and k in boxes),None)
    def ends(key): return {records[key]['cell'].get('source'),records[key]['cell'].get('target')}
    for key,box in boxes.items():
        data=records.get(key)
        if not data or not flow(data) or data['kind']=='boundaryEvent': continue
        parent=data['parent']
        if parent in boxes and records[parent]['kind'] in CONTAINERS and not inside(box,boxes[parent]):
            issues.append(f'{key}: shape escapes its declared container {parent}')
    for index,label in enumerate(labels):
        key=label['id'];data=records.get(key)
        if not data: continue
        related={key,*ancestors(key,records)}
        edge=data['cell'].get('edge')=='1'
        if edge:
            # A connector label may sit inside the subprocess/container of its own endpoints.
            for end in (data['cell'].get(k) for k in ('source','target')):
                related.add(end)
                if end in records: related.update(ancestors(end,records))
        if internal_label(data) and key in boxes and not inside(label,boxes[key],pad=2):
            issues.append(f'{key}: label overflows its own shape; text may be clipped or cover the border')
        holder=container(key) if not edge or records.get(data['parent'],{}).get('kind') in CONTAINERS else None
        if holder and not internal_label(data) and not inside(label,boxes[holder],pad=3):
            issues.append(f'{key}: label extends outside its container {holder}')
        else:
            for other,box in boxes.items():
                if other!=key and records.get(other,{}).get('kind') in CONTAINERS and any(crosses(a,b,label,inset=1) for a,b in borders(records[other],box)):
                    issues.append(f'{key}: label straddles the border of {other}')
        for other,box in boxes.items():
            if other not in related and other in records and flow(records[other]) and key not in ancestors(other,records) and overlap(label,box):
                issues.append(f'{key}: label overlaps unrelated shape {other}')
        for right in labels[index+1:]:
            other=right['id']
            if other != key and other not in related and other in records and key not in ancestors(other,records) and overlap(label,right):
                issues.append(f'{key}: label overlaps label {other}')
        for other,points in edges.items():
            if other==key or not edge and key in ends(other): continue
            if any(crosses(a,b,label,inset=1) for a,b in zip(points,points[1:])):
                issues.append(f'{key}: label is crossed by connector {other}')
    ids=sorted(edges)
    for n,left in enumerate(ids):
        for right in ids[n+1:]:
            if ends(left)&ends(right): continue
            if any(collinear_overlap(a,b,c,d) for a,b in zip(edges[left],edges[left][1:]) for c,d in zip(edges[right],edges[right][1:])):
                issues.append(f'{left}: connector runs on top of {right}; the routes may look joined')
    return list(dict.fromkeys(issues))
