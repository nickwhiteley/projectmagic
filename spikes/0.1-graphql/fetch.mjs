// Spike 0.1: can one or two GraphQL calls per repository fetch everything §7.1 needs?
// Usage: GITHUB_TOKEN=$(gh auth token) node fetch.mjs owner/repo [owner/repo ...]
// Query 1 returns every branch with ahead/behind (folded in, see RESULT.md), PRs and the *blob oids* of the tracked files.
// Query 2 fetches text only for the distinct oids, which is what the cache would be keyed by.

const FILES = ['backlog.md', 'PROGRESS.md', '.projectmagic.yml'];
const ACTIVE_DAYS = 30;
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('GITHUB_TOKEN is not set');

async function gql(query, variables) {
  const t0 = performance.now();
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  // A missing file is a NOT_FOUND error beside partial data, not a null. Tolerate exactly that.
  const fatal = (body.errors ?? []).filter(e => !(e.type === 'NOT_FOUND' && /^f\d+$/.test(e.path?.at(-1))));
  if (fatal.length || !body.data) throw new Error(JSON.stringify(fatal, null, 2));
  return { data: body.data, ms: Math.round(performance.now() - t0), bytes: JSON.stringify(body).length };
}

const fileFields = FILES.map(
  (f, i) => `f${i}: file(path: "${f}") { oid }`
).join('\n');

const Q1 = `
query($owner: String!, $name: String!, $after: String) {
  rateLimit { cost remaining }
  repository(owner: $owner, name: $name) {
    defaultBranchRef { name }
    refs(refPrefix: "refs/heads/", first: 100, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        # base = this branch, head = main: so behindBy is the branch's own commits ahead.
        compare(headRef: "main") { aheadBy behindBy status }
        target { ... on Commit { oid committedDate messageHeadline ${fileFields} } }
        associatedPullRequests(first: 3, orderBy: {field: UPDATED_AT, direction: DESC}) {
          nodes { number title body state isDraft url baseRefName }
        }
      }
    }
  }
}`;

async function run(full) {
  const [owner, name] = full.split('/');
  const out = { repo: full, calls: [], branches: [] };
  let after = null, main = null;
  do {
    const r = await gql(Q1, { owner, name, after });
    out.calls.push({ q: 'refs', ms: r.ms, bytes: r.bytes, cost: r.data.rateLimit.cost });
    main = r.data.repository.defaultBranchRef.name;
    const refs = r.data.repository.refs;
    out.branches.push(...refs.nodes);
    after = refs.pageInfo.hasNextPage ? refs.pageInfo.endCursor : null;
  } while (after);

  const cmp = {};
  for (const b of out.branches) {
    const c = b.compare;
    cmp[b.name] = c && { aheadBy: c.behindBy, behindBy: c.aheadBy };
  }

  const cutoff = Date.now() - ACTIVE_DAYS * 864e5;
  const oids = new Set();
  let active = 0;
  for (const b of out.branches) {
    const c = cmp[b.name];
    const openPR = b.associatedPullRequests.nodes.some(p => p.state === 'OPEN');
    const recent = Date.parse(b.target.committedDate) > cutoff;
    b.isMain = b.name === main;
    b.active = b.isMain || openPR || (c && c.aheadBy > 0 && recent);
    if (b.active) {
      active++;
      FILES.forEach((_, i) => b.target[`f${i}`] && oids.add(b.target[`f${i}`].oid));
    }
  }

  // Query 2: text for the distinct blob oids on active branches only.
  const list = [...oids];
  let textBytes = 0;
  for (let i = 0; i < list.length; i += 25) {
    const chunk = list.slice(i, i + 25);
    const fields = chunk.map((o, j) => `b${j}: object(oid: "${o}") { ... on Blob { byteSize text } }`).join('\n');
    const r = await gql(`query($owner:String!,$name:String!){ rateLimit{cost}
      repository(owner:$owner,name:$name){ ${fields} } }`, { owner, name });
    out.calls.push({ q: 'blobs', ms: r.ms, bytes: r.bytes, cost: r.data.rateLimit.cost });
    chunk.forEach((_, j) => (textBytes += r.data.repository[`b${j}`]?.byteSize ?? 0));
  }

  const linked = out.branches.filter(b => !b.isMain).map(b => ({
    name: b.name, active: b.active, ...cmp[b.name],
    committed: b.target.committedDate.slice(0, 10),
    prs: b.associatedPullRequests.nodes.map(p => `#${p.number} ${p.state}${p.isDraft ? ' draft' : ''}`).join(', '),
    files: FILES.filter((_, i) => b.target[`f${i}`]).length,
  }));
  return {
    repo: full, main, branches: out.branches.length, active,
    distinctBlobs: list.length, textBytes, calls: out.calls,
    totalMs: out.calls.reduce((a, c) => a + c.ms, 0),
    totalCost: out.calls.reduce((a, c) => a + c.cost, 0),
    sample: linked.sort((a, b) => b.committed.localeCompare(a.committed)).slice(0, 12),
  };
}

for (const r of process.argv.slice(2)) console.log(JSON.stringify(await run(r), null, 2));
