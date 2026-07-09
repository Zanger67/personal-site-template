#!/usr/bin/env python3
"""timeline-relations.py — dev tool (read-only).

Prints every RELATION GROUP and ORGANISATION on the Experience timeline and
lists what belongs to each: which roles, projects, publications, awards,
conferences, etc. would be grouped together (the drawer's "Related" list) and
cross-linked on the timeline and its detail / works pages.

Two axes drive relations on the timeline (see `inForeground` in
src/pages/experience.astro, the source of truth this mirrors):

  1. relationGroups — free-form shared tags. Any items carrying the same slug
     relate to each other, across category and org. Many-to-many.
  2. affiliations   — a project/publication names an org string; it cross-links
     to that org's bars, and selecting the org lights the work back up.

(A third, narrower axis — bars of the same category AND same org share a
`group` — is implicit in the per-org listing below.)

This tool also flags trouble: relation-group slugs with nothing to link to,
labels that are stale or missing, and affiliation strings that match no known
org (those render as unlinked chips — a silently broken cross-link).

It also reads the git-ignored src/dev archive/proofing area (src/dev/data +
src/dev/content) when present, folding those items into the same relation-group
and org listings but tagging them ⌂dev — so you can see how an archived/draft
item would relate before promoting it. Archive items are NOT on the live site.
Pass --no-archive to skip them.

This script lives in both repos (personal-site + personal-site-template) and by
default inspects the repo it physically sits in — decided by the script's own
location (__file__), independent of the current working directory.

Usage:
  python3 scripts/timeline-relations.py                 # this repo (the one holding the script)
  python3 scripts/timeline-relations.py --repo personal # force the live site
  python3 scripts/timeline-relations.py --repo template # force the template
  python3 scripts/timeline-relations.py --repo ../some/other/repo
  python3 scripts/timeline-relations.py --no-archive    # live items only
  python3 scripts/timeline-relations.py --json          # machine-readable dump
  python3 scripts/timeline-relations.py --no-color

Read-only: it never writes to the repo. Mirrors experience.astro's logic; if
that file's item-building changes, update this to match.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date
from pathlib import Path

# --------------------------------------------------------------------------
# Category model — mirrors CATEGORIES / TYPE_ORDER in experience.astro.
# --------------------------------------------------------------------------
CATEGORIES = [
    ("education", "Education"),
    ("work", "Work"),
    ("research", "Research"),
    ("awards", "awards/pubs"),
    ("projects", "Projects"),
    ("clubs", "Clubs"),
    ("misc", "Misc."),
]
TYPE_ORDER = {k: i for i, (k, _) in enumerate(CATEGORIES)}
CAT_LABEL = dict(CATEGORIES)

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# --------------------------------------------------------------------------
# Colour — ANSI, auto-disabled when not a TTY / NO_COLOR / --no-color.
# --------------------------------------------------------------------------
CAT_ANSI = {
    "education": "34",   # blue
    "work": "35",        # magenta (site accent)
    "research": "95",    # bright magenta
    "awards": "33",      # yellow
    "projects": "93",    # bright yellow (orange-ish)
    "clubs": "91",       # bright red (pink)
    "misc": "36",        # cyan
}


class Palette:
    def __init__(self, enabled: bool):
        self.on = enabled

    def _w(self, code: str, s: str) -> str:
        return f"\033[{code}m{s}\033[0m" if self.on else s

    def bold(self, s): return self._w("1", s)
    def dim(self, s): return self._w("2", s)
    def red(self, s): return self._w("31", s)
    def green(self, s): return self._w("32", s)
    def yellow(self, s): return self._w("33", s)
    def cyan(self, s): return self._w("36", s)
    def archive(self, s): return self._w("1;38;5;208", s)  # bold orange — dev/archive tag
    def cat(self, key, s): return self._w(CAT_ANSI.get(key, "37"), s)


# --------------------------------------------------------------------------
# Repo resolution — find <container>/personal-site and /personal-site-template.
# --------------------------------------------------------------------------
def resolve_repo(spec: str) -> Path:
    """Resolve `spec` to a repo root holding src/data.

    'self' (default) — the repo this script physically lives in, found by walking
    up from __file__ (so it's independent of the current working directory).
    'personal' / 'template' — the sibling repos by name. Anything else is a path.
    """
    if spec == "self":
        for base in Path(__file__).resolve().parents:
            if (base / "src" / "data").is_dir():
                return base
        sys.exit("error: --repo self could not find a repo (no src/data/ above "
                 f"{Path(__file__).resolve()}). Pass --repo personal|template|<path>.")
    named = {"personal": "personal-site", "template": "personal-site-template"}
    if spec in named:
        name = named[spec]
        bases = []
        here = Path(__file__).resolve()
        bases += list(here.parents)
        bases += [Path.cwd()] + list(Path.cwd().parents)
        seen = set()
        for base in bases:
            if base in seen:
                continue
            seen.add(base)
            cand = base / name
            if (cand / "src" / "data").is_dir():
                return cand
        sys.exit(f"error: could not locate a sibling '{name}/' with src/data near "
                 f"{here.parent} or {Path.cwd()}. Pass an explicit path with --repo.")
    p = Path(spec).expanduser().resolve()
    if (p / "src" / "data").is_dir():
        return p
    if (p / "data").is_dir() and p.name == "src":
        return p.parent
    sys.exit(f"error: '{spec}' is not a repo root (no src/data/ under it).")


# --------------------------------------------------------------------------
# Loading — JSON data files + project markdown frontmatter.
# --------------------------------------------------------------------------
def load_json(path: Path):
    if not path.exists():
        return []
    txt = path.read_text(encoding="utf-8").strip()
    if not txt:
        return []
    return json.loads(txt)


def _frontmatter_yaml(text: str):
    """Extract the leading --- frontmatter block and parse it to a dict."""
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?", text, re.DOTALL)
    if not m:
        return {}
    block = m.group(1)
    try:
        import yaml  # PyYAML if available (it is in this env) — handles all shapes
        return yaml.safe_load(block) or {}
    except Exception:
        return _frontmatter_minimal(block)


def _frontmatter_minimal(block: str):
    """Tiny fallback parser: scalars + inline JSON lists (["a","b"]). Enough for
    the fields this tool reads; block-sequence values degrade to []."""
    out = {}
    for line in block.splitlines():
        if not line.strip() or line.lstrip().startswith("#") or line.startswith((" ", "\t", "-")):
            continue
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        key, val = key.strip(), val.strip()
        if val == "" or val == "|" or val == ">":
            out[key] = []           # block value we don't parse — treat as empty list
        elif val.startswith("[") or val.startswith("{"):
            try:
                out[key] = json.loads(val)
            except Exception:
                out[key] = []
        elif val in ("null", "~"):
            out[key] = None
        elif val in ("true", "false"):
            out[key] = val == "true"
        else:
            out[key] = val.strip("\"'")
    return out


def load_projects(content_dir: Path):
    projs = []
    pdir = content_dir / "projects"
    if not pdir.is_dir():
        return projs
    for md in sorted(pdir.glob("*.md")):
        fm = _frontmatter_yaml(md.read_text(encoding="utf-8"))
        fm["_slug"] = md.stem
        projs.append(fm)
    return projs


def load_area(data_dir: Path, content_dir: Path):
    """Load the 8 item sources from one data/content pair (the live src/ tree or
    the src/dev archive). Missing files/dirs load empty."""
    return {
        "education": load_json(data_dir / "education.json"),
        "affiliations": load_json(data_dir / "affiliations.json"),
        "organizations": load_json(data_dir / "organizations.json"),
        "publications": load_json(data_dir / "publications.json"),
        "awards": load_json(data_dir / "awards.json"),
        "conferences": load_json(data_dir / "conferences.json"),
        "misc": load_json(data_dir / "misc.json"),
        "projects": load_projects(content_dir),
    }


def area_is_empty(area_data) -> bool:
    return not any(area_data.values())


def read_show_incoming(repo: Path) -> bool:
    cfg = repo / "src" / "config" / "site.ts"
    if not cfg.exists():
        return True
    m = re.search(r"showIncoming\s*:\s*(true|false)", cfg.read_text(encoding="utf-8"))
    return (m.group(1) == "true") if m else True


# --------------------------------------------------------------------------
# Date helpers — month-index arithmetic (timezone-proof, like the astro page).
# --------------------------------------------------------------------------
INF = float("inf")
_TODAY = date.today()
NOW_IDX = _TODAY.year * 12 + (_TODAY.month - 1)


def _ym(s):
    """(year, month0) from 'YYYY', 'YYYY-MM', or 'YYYY-MM-DD'. None -> None."""
    if not s:
        return None
    parts = str(s).split("-")
    y = int(parts[0])
    m = int(parts[1]) if len(parts) > 1 else 1
    return y, m - 1


def start_idx(s):
    ym = _ym(s)
    return ym[0] * 12 + ym[1] if ym else None


def excl_end_idx(s):
    """Exclusive end month index — first month AFTER the (inclusive) end month."""
    ym = _ym(s)
    return ym[0] * 12 + ym[1] + 1 if ym else None


def fmt_month_idx(idx):
    return f"{MONTHS[idx % 12]} {idx // 12}"


def fmt_range(start, end, point=False):
    si = start_idx(start)
    if si is None:
        return None
    if point:
        # year-only point keeps just the year
        return str(start) if len(str(start)) == 4 else fmt_month_idx(si)
    if end:
        return f"{fmt_month_idx(si)} – {fmt_month_idx(start_idx(end))}"
    return f"{fmt_month_idx(si)} – Present"


# --------------------------------------------------------------------------
# Timeline logic — ports of experience.astro helpers.
# --------------------------------------------------------------------------
def org_shown(org):
    return org.get("displayTimeline", True)


def role_shown(org, role):
    return role.get("displayTimeline", org_shown(org))


def role_charts(org, role):
    return role_shown(org, role) and bool(role.get("start"))


def carve_member(member_start, member_end, specifics):
    """Member window minus the union of specific-role windows → gap segments.
    Returns list of (start_idx, end_idx|INF). Mirrors carveMemberRanges."""
    m_start = start_idx(member_start)
    if m_start is None:
        return []
    is_open = member_end is None
    m_end = INF if is_open else excl_end_idx(member_end)
    if not (m_end > m_start):
        return []
    blocks = []
    for s in specifics:
        bs = max(start_idx(s["start"]), m_start)
        be = min(INF if s.get("end") is None else excl_end_idx(s["end"]), m_end)
        if be > bs:
            blocks.append((bs, be))
    blocks.sort()
    out, cursor = [], m_start
    for bs, be in blocks:
        if bs > cursor:
            out.append((cursor, bs))
        if be > cursor:
            cursor = be
    if m_end > cursor:
        out.append((cursor, m_end))
    return out


def org_timeline_roles(org):
    return [r for r in org.get("roles") or [] if role_charts(org, r)]


def membership_segments(org):
    mem = org.get("membership")
    if not mem or not mem.get("start") or not org_shown(org):
        return []
    specifics = [{"start": r.get("start"), "end": r.get("end")} for r in org_timeline_roles(org)]
    return carve_member(mem["start"], mem.get("end"), specifics)


def org_has_bars(org):
    return bool(org_timeline_roles(org)) or bool(membership_segments(org))


def affil_cats(org, role=None):
    """Primary category (+ extras) for a work-affiliation role. Clubs -> 'clubs'."""
    cats = (role or {}).get("categories") or org.get("categories") or ["work"]
    return cats[0] if cats else "work"


# --------------------------------------------------------------------------
# Item model — one record per thing that appears on / around the timeline.
# --------------------------------------------------------------------------
class Item:
    __slots__ = ("title", "category", "kind", "entity", "affiliations",
                 "relation_groups", "main", "date_label", "charted",
                 "not_charted_reason", "incoming", "is_org_entity", "area")

    def __init__(self, title, category, kind, entity, affiliations, relation_groups,
                 main, date_label, charted, not_charted_reason, incoming, is_org_entity,
                 area="live"):
        self.title = title
        self.category = category
        self.kind = kind
        self.entity = entity
        self.affiliations = affiliations
        self.relation_groups = relation_groups
        self.main = main
        self.date_label = date_label
        self.charted = charted
        self.not_charted_reason = not_charted_reason
        self.incoming = incoming
        self.is_org_entity = is_org_entity
        self.area = area  # 'live' (on the site) or 'dev' (src/dev archive/proofing)

    def as_dict(self):
        return {
            "title": self.title, "category": self.category, "kind": self.kind,
            "entity": self.entity, "affiliations": self.affiliations,
            "relationGroups": self.relation_groups, "main": self.main,
            "dateLabel": self.date_label, "charted": self.charted,
            "notChartedReason": self.not_charted_reason, "incoming": self.incoming,
            "area": self.area,
        }


def is_incoming(start):
    si = start_idx(start)
    return si is not None and si > NOW_IDX


def build_items(data, show_incoming, area="live"):
    """Rebuild the full timeline item set (charted bars + bottom-strip entries),
    mirroring the `items` array and bottom strips in experience.astro. `area` is
    'live' for the real site, or 'dev' for src/dev archive/proofing items (which
    are NOT part of the live build — the charted/incoming flags describe what they
    WOULD do if promoted)."""
    items = []

    def add(**kw):
        items.append(Item(area=area, **kw))

    def point_charted(has_date):
        return (True, None) if has_date else (False, "no date → Undated strip")

    # --- education -------------------------------------------------------
    for e in data["education"]:
        add(title=e.get("degree"), category="education", kind="education",
            entity=e.get("institution"), affiliations=[],
            relation_groups=e.get("relationGroups") or [], main=bool(e.get("main")),
            date_label=fmt_range(e.get("start"), e.get("end")),
            charted=bool(e.get("start")), not_charted_reason=None,
            incoming=is_incoming(e.get("start")), is_org_entity=True)

    # --- work affiliations + clubs (same org shape) ----------------------
    def add_org(org, club):
        rg_org = org.get("relationGroups") or []
        for r in org.get("roles") or []:
            charted = role_charts(org, r)
            reason = None
            if not charted:
                reason = ("hidden (displayTimeline:false) → Other involvements"
                          if not role_shown(org, r) else
                          "undated → Other involvements")
            add(title=r.get("role"), category="clubs" if club else affil_cats(org, r),
                kind="club-role" if club else "work-role",
                entity=org["organization"], affiliations=[],
                relation_groups=r.get("relationGroups") or rg_org, main=bool(r.get("main") or org.get("main")),
                date_label=fmt_range(r.get("start"), r.get("end")),
                charted=charted, not_charted_reason=reason,
                incoming=is_incoming(r.get("start")), is_org_entity=True)
        mem = org.get("membership")
        if mem and mem.get("start"):
            charted = len(membership_segments(org)) > 0
            reason = None if charted else (
                "hidden (displayTimeline:false)" if not org_shown(org)
                else "fully covered by roles → no gap bar")
            add(title="Member", category="clubs" if club else affil_cats(org),
                kind="club-member" if club else "work-member",
                entity=org["organization"], affiliations=[],
                relation_groups=rg_org, main=bool(org.get("main")),
                date_label=fmt_range(mem.get("start"), mem.get("end")),
                charted=charted, not_charted_reason=reason,
                incoming=is_incoming(mem.get("start")), is_org_entity=True)
        alum = org.get("alumnus")
        if alum:
            yr = (alum.get("start") or alum.get("end") or "")[:4]
            add(title=f"Alumnus ({yr})" if yr else "Alumnus",
                category="clubs" if club else affil_cats(org),
                kind="club-alumnus" if club else "work-alumnus",
                entity=org["organization"], affiliations=[],
                relation_groups=rg_org, main=bool(org.get("main")),
                date_label=fmt_range(alum.get("start"), alum.get("end")),
                charted=False, not_charted_reason="alumnus → Alumni strip",
                incoming=False, is_org_entity=True)

    for org in data["affiliations"]:
        add_org(org, club=False)
    for org in data["organizations"]:
        add_org(org, club=True)

    # --- publications (awards/pubs, point events) ------------------------
    for p in data["publications"]:
        charted, reason = point_charted(bool(p.get("date")))
        add(title=p.get("title"), category="awards", kind="publication",
            entity=p.get("title"), affiliations=p.get("affiliations") or [],
            relation_groups=p.get("relationGroups") or [], main=bool(p.get("main")),
            date_label=(str(p.get("date")) if p.get("date") else None),
            charted=charted, not_charted_reason=reason,
            incoming=is_incoming(p.get("date")), is_org_entity=False)

    # --- awards ----------------------------------------------------------
    for a in data["awards"]:
        charted, reason = point_charted(bool(a.get("date")))
        add(title=a.get("name"), category="awards", kind="award",
            entity=a.get("name"), affiliations=[],
            relation_groups=a.get("relationGroups") or [], main=bool(a.get("main")),
            date_label=(fmt_range(a.get("date"), None, point=True) if a.get("date") else None),
            charted=charted, not_charted_reason=reason,
            incoming=is_incoming(a.get("date")), is_org_entity=False)

    # --- projects (content collection) -----------------------------------
    for p in data["projects"]:
        start = p.get("startDate")
        add(title=p.get("title"), category="projects", kind="project",
            entity=p.get("title"), affiliations=p.get("affiliations") or [],
            relation_groups=p.get("relationGroups") or [], main=bool(p.get("main")),
            date_label=fmt_range(start, p.get("endDate")),
            charted=bool(start), not_charted_reason=(None if start else "no startDate"),
            incoming=is_incoming(start), is_org_entity=False)

    # --- conferences + misc (misc category, point events) ----------------
    for c in data["conferences"]:
        charted, reason = point_charted(bool(c.get("date")))
        add(title=c.get("name"), category="misc", kind="conference",
            entity=c.get("name"), affiliations=[],
            relation_groups=c.get("relationGroups") or [], main=bool(c.get("main")),
            date_label=(fmt_range(c.get("date"), None, point=True) if c.get("date") else None),
            charted=charted, not_charted_reason=reason,
            incoming=is_incoming(c.get("date")), is_org_entity=False)
    for m in data["misc"]:
        has = bool(m.get("date"))
        add(title=m.get("name"), category="misc", kind="misc",
            entity=m.get("name"), affiliations=[],
            relation_groups=m.get("relationGroups") or [], main=bool(m.get("main")),
            date_label=fmt_range(m.get("date"), m.get("end"), point=not m.get("end")) if has else None,
            charted=has, not_charted_reason=None if has else "no date → Undated strip",
            incoming=is_incoming(m.get("date")), is_org_entity=False)

    # Drop incoming entries when the config hides them (mirrors mkItem's early-out).
    if not show_incoming:
        items = [it for it in items if not it.incoming]
    return items


# --------------------------------------------------------------------------
# Rendering.
# --------------------------------------------------------------------------
def item_line(pal, it, show_entity=True):
    tag = pal.cat(it.category, f"[{it.category}]")
    title = pal.bold(it.title or "(untitled)")
    bits = [tag]
    if it.area == "dev":
        bits.append(pal.archive("⌂dev"))
    bits.append(title)
    if show_entity and it.entity and it.entity != it.title:
        bits.append(pal.dim(f"· {it.entity}"))
    if it.date_label:
        bits.append(pal.dim(f"({it.date_label})"))
    flags = []
    if it.main:
        flags.append(pal.yellow("★main"))
    if it.incoming:
        flags.append(pal.cyan("incoming"))
    if not it.charted:
        flags.append(pal.red(f"⨯ not-charted: {it.not_charted_reason}"))
    if flags:
        bits.append(" ".join(flags))
    return "  " + " ".join(bits)


def sort_items(seq):
    return sorted(seq, key=lambda it: (TYPE_ORDER.get(it.category, 9),
                                       not it.main, (it.title or "").lower()))


def hr(pal, ch="─", n=74):
    return pal.dim(ch * n)


def header(pal, text):
    bar = "═" * 74
    return f"\n{pal.cyan(bar)}\n{pal.cyan(pal.bold('  ' + text))}\n{pal.cyan(bar)}"


def humanize(slug):
    return re.sub(r"[-_]+", " ", str(slug)).strip().title()


def render(data, items, pal, out):
    p = lambda *a: print(*a, file=out)

    relation_labels = data["relationLabels"]          # org name -> tab label
    group_labels = data["relationGroupLabels"]        # slug -> human name

    # ---- indexes --------------------------------------------------------
    groups = {}                                       # slug -> [Item]
    for it in items:
        for g in it.relation_groups:
            groups.setdefault(g, []).append(it)

    org_entities = {}                                 # entity name -> [own Items]
    for it in items:
        if it.is_org_entity and it.entity:
            org_entities.setdefault(it.entity, []).append(it)

    affiliated = {}                                   # org string -> [work Items]
    for it in items:
        for a in it.affiliations:
            affiliated.setdefault(a, []).append(it)

    declared = set(data.get("definedOrgNames") or [])       # every org from raw data
    dev_only_names = set(data.get("devOnlyOrgNames") or [])
    all_org_names = set(org_entities) | set(affiliated) | declared
    defined_orgs = set(org_entities) | declared

    # ---- summary --------------------------------------------------------
    p(header(pal, "TIMELINE RELATIONS"))
    charted = [it for it in items if it.charted]
    dev_items = [it for it in items if it.area == "dev"]
    p(f"  {len(items)} items total · {len(charted)} charted · "
      f"{len(items) - len(charted)} in bottom strips (undated / hidden / alumni)")
    if dev_items:
        p("  " + pal.archive(f"⌂dev {len(dev_items)} of these are src/dev archive/"
                             f"proofing items — NOT on the live site; shown for their relations"))
    p(f"  {len(groups)} relation-group slug(s) · {len(defined_orgs)} defined org(s)")
    cat_counts = {}
    for it in items:
        cat_counts[it.category] = cat_counts.get(it.category, 0) + 1
    line = "  ".join(pal.cat(k, f"{CAT_LABEL[k]}:{cat_counts.get(k, 0)}")
                     for k, _ in CATEGORIES if cat_counts.get(k))
    p("  " + line)

    # ---- relation groups ------------------------------------------------
    p(header(pal, "RELATION GROUPS"))
    p(pal.dim("  Items sharing a slug light each other up when one is selected"))
    p(pal.dim("  (drawer 'Related' list), across category and org.\n"))
    if not groups:
        p("  (no relationGroups used anywhere)\n")
    for slug in sorted(groups):
        members = sort_items(groups[slug])
        label = group_labels.get(slug)
        head = pal.bold(pal.green(slug))
        if label:
            head += pal.dim(f'  — label "{label}"  (drawer header: "Related ({label})")')
        else:
            head += pal.dim(f'  — no label; header stays plain "Related"')
        p(f"  {head}")
        if len(members) == 1:
            p("    " + pal.red("only 1 item carries this slug — it links to nothing"))
        for it in members:
            p("  " + item_line(pal, it))
        p("")

    # ---- organisations --------------------------------------------------
    p(header(pal, "ORGANISATIONS"))
    p(pal.dim("  Each org's own bars (roles / membership) plus the projects &"))
    p(pal.dim("  publications affiliated to it — these cross-link on the timeline."))
    p(pal.dim("  Timeline highlighting groups bars by category+org; affiliation &"))
    p(pal.dim("  relation-group links reach across categories.\n"))
    for name in sorted(all_org_names, key=str.lower):
        own = sort_items(org_entities.get(name, []))
        works = sort_items([w for w in affiliated.get(name, [])])
        undefined = name not in defined_orgs
        head = pal.bold(name)
        dev_only = (own and all(it.area == "dev" for it in own)) or \
                   (not own and name in dev_only_names)
        if dev_only:
            head += "  " + pal.archive("⌂dev-only (archive)")
        if name in relation_labels:
            head += pal.dim(f'  (tab label "{relation_labels[name]}")')
        if undefined:
            head += "  " + pal.red("⨯ referenced by a work but not a defined org "
                                   "— renders as an unlinked chip")
        p(f"  {head}")
        if own:
            for it in own:
                p("  " + item_line(pal, it, show_entity=False))
        elif not undefined:
            p("    " + pal.dim("(no timeline bars — undated involvement / bottom strip)"))
        if works:
            p("    " + pal.dim("affiliated works:"))
            for w in works:
                p("    " + item_line(pal, w, show_entity=False))
        rgs = sorted({g for it in own + works for g in it.relation_groups})
        if rgs:
            p("    " + pal.dim("relation-groups here: ") + ", ".join(pal.green(g) for g in rgs))
        p("")

    # ---- warnings -------------------------------------------------------
    p(header(pal, "CHECKS"))
    issues = []
    lonely = [g for g, m in groups.items() if len({id(x) for x in m}) == 1]
    for g in sorted(lonely):
        issues.append(pal.yellow("lonely group") +
                      f"  '{g}' is on only one item — no cross-link effect")
    unlabeled = sorted(set(groups) - set(group_labels))
    for g in unlabeled:
        issues.append(pal.dim("unlabeled group") +
                      f"  '{g}' has no relationGroupLabels entry "
                      f"(drawer shows plain 'Related'; slug humanizes to '{humanize(g)}')")
    stale_labels = sorted(set(group_labels) - set(groups))
    for g in stale_labels:
        issues.append(pal.yellow("stale label") +
                      f"  relationGroupLabels['{g}'] = '{group_labels[g]}' but no item uses '{g}'")
    for name in sorted(all_org_names - defined_orgs, key=str.lower):
        who = ", ".join(sorted({w.title + (" ⌂dev" if w.area == "dev" else "")
                                for w in affiliated.get(name, [])}))
        issues.append(pal.red("broken affiliation") +
                      f"  '{name}' (from: {who}) matches no org — unlinked chip, no cross-link")
    stale_tabs = sorted(k for k in relation_labels if k not in defined_orgs)
    for k in stale_tabs:
        issues.append(pal.yellow("stale tab label") +
                      f"  relationLabels['{k}'] matches no org")
    if issues:
        for i in issues:
            p("  " + i)
    else:
        p("  " + pal.green("no issues found"))
    p("")


# --------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(
        description="Print timeline relation-groups & orgs and what belongs to each.")
    ap.add_argument("--repo", default="self",
                    help="Repo to inspect: 'self' (default — the repo this script "
                         "lives in), 'personal', 'template', or a path to a repo root.")
    ap.add_argument("--json", action="store_true",
                    help="Emit the computed structure as JSON instead of a report.")
    ap.add_argument("--no-archive", action="store_true",
                    help="Skip the src/dev archive/proofing items (included by default "
                         "when present, tagged ⌂dev).")
    ap.add_argument("--no-color", action="store_true", help="Disable ANSI colour.")
    args = ap.parse_args()

    repo = resolve_repo(args.repo)
    ddir = repo / "src" / "data"
    cdir = repo / "src" / "content"
    show_incoming = read_show_incoming(repo)

    # Live site tree.
    live = load_area(ddir, cdir)
    items = build_items(live, show_incoming, area="live")

    # src/dev archive/proofing tree — git-ignored, local-only, mirrors the live
    # schema. Included by default (tagged ⌂dev) so its items and their relations
    # show alongside; these are NOT part of the live build.
    dev = load_area(repo / "src" / "dev" / "data", repo / "src" / "dev" / "content")
    archive_present = not area_is_empty(dev)
    include_archive = archive_present and not args.no_archive
    if include_archive:
        items += build_items(dev, show_incoming, area="dev")

    # Relation-label config is live-only (the dev mirror holds data/content, not
    # config); resolve it once for rendering.
    def org_names(a):
        ns = set()
        for o in a.get("affiliations", []) + a.get("organizations", []):
            if o.get("organization"):
                ns.add(o["organization"])
        for e in a.get("education", []):
            if e.get("institution"):
                ns.add(e["institution"])
        return ns
    live_org_names = org_names(live)
    dev_org_names = org_names(dev) if include_archive else set()
    ctx = {
        "relationLabels": load_json(ddir / "relationLabels.json") or {},
        "relationGroupLabels": load_json(ddir / "relationGroupLabels.json") or {},
        # Every declared org — even ones with no roles / undated membership that
        # produce no bar (they still show as bottom-strip involvement chips).
        "definedOrgNames": live_org_names | dev_org_names,
        "devOnlyOrgNames": dev_org_names - live_org_names,
    }

    if args.json:
        groups = {}
        for it in items:
            for g in it.relation_groups:
                groups.setdefault(g, []).append(it.title)
        orgs = {}
        for it in items:
            if it.is_org_entity and it.entity:
                orgs.setdefault(it.entity, {"own": [], "affiliatedWorks": []})["own"].append(it.title)
        for it in items:
            for a in it.affiliations:
                orgs.setdefault(a, {"own": [], "affiliatedWorks": []})["affiliatedWorks"].append(it.title)
        print(json.dumps({
            "repo": str(repo),
            "showIncoming": show_incoming,
            "archiveIncluded": include_archive,
            "items": [it.as_dict() for it in items],
            "relationGroups": groups,
            "organisations": orgs,
        }, indent=2, ensure_ascii=False))
        return

    color = sys.stdout.isatty() and not args.no_color and os.environ.get("NO_COLOR") is None
    pal = Palette(color)
    archive_note = ("archive: included (⌂dev)" if include_archive
                    else "archive: present, hidden (--no-archive)" if archive_present
                    else "archive: none")
    print(pal.dim(f"repo: {repo}   showIncoming: {show_incoming}   "
                  f"{archive_note}   today: {_TODAY}"))
    render(ctx, items, pal, sys.stdout)


if __name__ == "__main__":
    main()
