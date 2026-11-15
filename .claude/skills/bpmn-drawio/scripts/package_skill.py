"""Create a reproducible, verified candidate ZIP from an explicit allowlist."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import argparse
import hashlib
import json
import re
from drawio_common import tool_fingerprint

SKILL=Path(__file__).resolve().parent.parent


def package(output):
    version=(SKILL/'VERSION').read_text(encoding='utf-8').strip()
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.]+)?',version):raise ValueError('Invalid version')
    files=[]
    top={'SKILL.md','README.md','VERSION','LICENSE','NOTICE','THIRD_PARTY_NOTICES.md'}
    extensions={'.md','.py','.drawio','.json','.yaml'}
    for p in sorted(SKILL.rglob('*')):
        rel=p.relative_to(SKILL)
        if not p.is_file() or any(s.startswith('.') or s=='__pycache__' for s in rel.parts):continue
        if p.is_symlink():raise ValueError('Symlink is not allowed in candidate: '+str(rel))
        if (len(rel.parts)==1 and p.name in top) or (rel.parts[0] in {'scripts','references','agents','assets','tests'} and p.suffix in extensions):
            files.append(p)
    entries={f'bpmn-drawio/{p.relative_to(SKILL).as_posix()}':p.read_bytes() for p in files}
    # Do not copy assignment sources or personal submission identifiers by accident.
    private=re.compile(rb'B\d{2}D[A-Z]{2,5}\d{3}|/ho'+rb'me/[^\s"<>]+|[A-Z]:\\Users\\')
    for name,data in entries.items():
        if private.search(data):raise ValueError('Machine-specific or student identifier in '+name)
    hashes={k:hashlib.sha256(v).hexdigest() for k,v in entries.items()}
    manifest={'name':'bpmn-drawio','version':version,'tool':tool_fingerprint(),'license_status':'selected' if (SKILL/'LICENSE').is_file() else 'pending',
              'publication_ready':False,'purpose':'Review candidate; no public publication performed','files':hashes}
    entries['bpmn-drawio/MANIFEST.json']=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    archive=output/f'bpmn-drawio-{version}-candidate.zip'
    with ZipFile(archive,'w',ZIP_DEFLATED,compresslevel=9) as z:
        for name,data in sorted(entries.items()):
            info=ZipInfo(name,(2020,1,1,0,0,0));info.compress_type=ZIP_DEFLATED;info.external_attr=0o100644<<16
            z.writestr(info,data)
    with ZipFile(archive) as z:
        assert z.testzip() is None
        assert len(z.namelist())==len(entries)
        for name,want in hashes.items():assert hashlib.sha256(z.read(name)).hexdigest()==want,name
    report={**manifest,'archive':archive.name,'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'archive_files':len(entries)}
    (output/'MANIFEST.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:report[k] for k in ('archive','archiveSha256','archive_files','license_status','publication_ready')}))
    return archive


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output-dir',type=Path,required=True)
    package(parser.parse_args().output_dir)
