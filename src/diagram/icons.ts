// Icons for diagram nodes, from three sources, all loaded only when needed:
//   dev:<name>  Devicon colour logos (MIT), copied to public/devicon/ by scripts/icons.mjs
//   si:<slug>   Simple Icons brand glyphs (CC0), drawn in the brand colour
//   lu:<Name>   Lucide generic symbols (ISC), drawn in the node colour

interface SiIcon {
  title: string;
  slug: string;
  hex: string;
  path: string;
}
type LucideNode = [string, Record<string, string | number>][];

let devIndex: { n: string; k: string }[] | null = null;
let siIcons: Map<string, SiIcon> | null = null;
let luIcons: Record<string, LucideNode> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Loads all three icon sets once. Resolves when search and drawing can use them. */
export function loadIconSets(): Promise<void> {
  loading ??= (async () => {
    const [dev, si, lu] = await Promise.all([
      fetch('/devicon/index.json').then((r) => r.json() as Promise<{ icons: { n: string; k: string }[] }>),
      import('simple-icons'),
      import('lucide'),
    ]);
    devIndex = dev.icons;
    siIcons = new Map();
    for (const v of Object.values(si) as unknown[]) {
      const ic = v as SiIcon;
      if (ic && typeof ic === 'object' && 'path' in ic && 'slug' in ic) siIcons.set(ic.slug, ic);
    }
    luIcons = lu.icons as unknown as Record<string, LucideNode>;
    listeners.forEach((f) => f());
  })();
  return loading;
}

export const iconSetsReady = () => !!(devIndex && siIcons && luIcons);

/** Called once when the icon sets finish loading (for redrawing thumbnails and panels). */
export function onIconSetsReady(f: () => void) {
  if (iconSetsReady()) return () => {};
  listeners.add(f);
  void loadIconSets();
  return () => listeners.delete(f);
}

// ---------------------------------------------------------------- names

const PRETTY: Record<string, string> = {
  apachekafka: 'Kafka', amazonwebservices: 'AWS', googlecloud: 'Google Cloud', microsoftsqlserver: 'SQL Server',
  githubactions: 'GitHub Actions', nodejs: 'Node.js', vuejs: 'Vue', nextjs: 'Next.js', dotnetcore: '.NET', csharp: 'C#',
  cplusplus: 'C++', javascript: 'JavaScript', typescript: 'TypeScript', postgresql: 'PostgreSQL', mongodb: 'MongoDB',
  mysql: 'MySQL', github: 'GitHub', gitlab: 'GitLab', argocd: 'Argo CD', sonarqube: 'SonarQube', rabbitmq: 'RabbitMQ',
  dynamodb: 'DynamoDB', elasticsearch: 'Elasticsearch', vscode: 'VS Code', intellij: 'IntelliJ', graphql: 'GraphQL',
  fastapi: 'FastAPI', vitejs: 'Vite', npm: 'npm', digitalocean: 'DigitalOcean', neo4j: 'Neo4j', mariadb: 'MariaDB',
  sqlite: 'SQLite', nginx: 'NGINX', bitbucket: 'Bitbucket', junit: 'JUnit', spring: 'Spring Boot',
};

export function iconLabel(id: string): string {
  const [src, name] = splitId(id);
  if (src === 'dev') return PRETTY[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
  if (src === 'si') return siIcons?.get(name)?.title ?? name;
  return name.replace(/([a-z])([A-Z0-9])/g, '$1 $2');
}

const splitId = (id: string): [string, string] => {
  const i = id.indexOf(':');
  return [id.slice(0, i), id.slice(i + 1)];
};

// ---------------------------------------------------------------- library, by sector

export interface IconSection {
  title: string;
  icons: string[];
}

export const SECTORS: { id: string; title: string; sections: IconSection[] }[] = [
  {
    id: 'tech',
    title: 'Tech',
    sections: [
      {
        title: 'General',
        icons: [
          'lu:User', 'lu:Users', 'lu:Globe', 'lu:AppWindow', 'lu:Smartphone', 'lu:Laptop', 'lu:Server', 'lu:Database',
          'lu:HardDrive', 'lu:Cloud', 'lu:Network', 'lu:Webhook', 'lu:Layers', 'lu:Zap', 'lu:Cpu', 'lu:ShieldCheck',
          'lu:Lock', 'lu:KeyRound', 'lu:FileText', 'lu:Folder', 'lu:Mail', 'lu:MessageSquare', 'lu:Bell', 'lu:Clock',
          'lu:CircleCheck', 'lu:CircleX', 'lu:TriangleAlert', 'lu:Settings', 'lu:Code', 'lu:Terminal', 'lu:Package', 'lu:Bot',
        ],
      },
      { title: 'Git & branching', icons: ['dev:git', 'lu:GitBranch', 'lu:GitCommitHorizontal', 'lu:GitMerge', 'lu:GitPullRequest', 'lu:Tag', 'dev:github', 'dev:gitlab', 'dev:bitbucket'] },
      { title: 'Languages', icons: ['dev:java', 'dev:python', 'dev:javascript', 'dev:typescript', 'dev:go', 'dev:kotlin', 'dev:csharp', 'dev:cplusplus', 'dev:rust', 'dev:php', 'dev:ruby', 'dev:swift'] },
      { title: 'Build & packages', icons: ['dev:maven', 'dev:gradle', 'dev:npm', 'dev:yarn', 'dev:webpack', 'dev:vitejs', 'dev:junit', 'dev:selenium'] },
      { title: 'Frameworks', icons: ['dev:spring', 'dev:nodejs', 'dev:express', 'dev:django', 'dev:flask', 'dev:fastapi', 'dev:dotnetcore', 'dev:hibernate', 'dev:react', 'dev:angular', 'dev:vuejs', 'dev:nextjs', 'dev:svelte', 'dev:graphql'] },
      { title: 'Databases', icons: ['dev:mongodb', 'dev:postgresql', 'dev:mysql', 'dev:oracle', 'dev:redis', 'dev:cassandra', 'dev:elasticsearch', 'dev:sqlite', 'dev:microsoftsqlserver', 'dev:dynamodb', 'dev:neo4j', 'dev:mariadb'] },
      { title: 'Messaging', icons: ['dev:apachekafka', 'dev:rabbitmq', 'lu:MessagesSquare', 'lu:Inbox', 'lu:Send'] },
      { title: 'Cloud', icons: ['dev:amazonwebservices', 'dev:azure', 'dev:googlecloud', 'dev:digitalocean', 'dev:heroku', 'dev:firebase', 'dev:cloudflare'] },
      { title: 'DevOps & CI/CD', icons: ['dev:jenkins', 'dev:githubactions', 'dev:argocd', 'dev:docker', 'dev:kubernetes', 'dev:helm', 'dev:terraform', 'dev:ansible', 'dev:nginx', 'dev:apache', 'dev:tomcat', 'dev:sonarqube', 'dev:linux', 'dev:bash'] },
      { title: 'Monitoring', icons: ['dev:grafana', 'dev:prometheus', 'dev:kibana', 'dev:datadog'] },
      { title: 'Team tools', icons: ['dev:jira', 'dev:confluence', 'dev:slack', 'dev:figma', 'dev:postman', 'dev:vscode', 'dev:intellij'] },
    ],
  },
  {
    id: 'finance',
    title: 'Finance',
    sections: [
      { title: 'Markets', icons: ['lu:TrendingUp', 'lu:TrendingDown', 'lu:ChartCandlestick', 'lu:ChartLine', 'lu:ChartColumn', 'lu:ChartPie', 'lu:ChartNoAxesCombined', 'lu:Percent', 'lu:Scale'] },
      { title: 'Money', icons: ['lu:DollarSign', 'lu:Euro', 'lu:IndianRupee', 'lu:Banknote', 'lu:Coins', 'lu:Wallet', 'lu:PiggyBank', 'lu:CreditCard', 'lu:Receipt', 'lu:Landmark'] },
      { title: 'Economy', icons: ['lu:Factory', 'lu:Fuel', 'lu:House', 'lu:ShoppingBasket', 'lu:ShoppingCart', 'lu:Store', 'lu:Tractor', 'lu:Wheat', 'lu:Ship', 'lu:Building2'] },
    ],
  },
  {
    id: 'business',
    title: 'Business',
    sections: [
      { title: 'Team & org', icons: ['lu:User', 'lu:Users', 'lu:Briefcase', 'lu:Handshake', 'lu:Building2', 'lu:Presentation', 'lu:ClipboardList', 'lu:CalendarDays', 'lu:Mail'] },
      { title: 'Strategy', icons: ['lu:Target', 'lu:Lightbulb', 'lu:Rocket', 'lu:Megaphone', 'lu:Award', 'lu:Trophy', 'lu:ChartColumn', 'lu:TrendingUp'] },
    ],
  },
  {
    id: 'science',
    title: 'Science',
    sections: [
      { title: 'Learning', icons: ['lu:GraduationCap', 'lu:BookOpen', 'lu:School', 'lu:Calculator', 'lu:Brain', 'lu:Lightbulb'] },
      { title: 'Science', icons: ['lu:FlaskConical', 'lu:Atom', 'lu:Dna', 'lu:Microscope', 'lu:Telescope', 'lu:Globe', 'lu:Zap', 'lu:Recycle'] },
    ],
  },
  {
    id: 'nature',
    title: 'Nature & people',
    sections: [
      { title: 'People', icons: ['lu:PersonStanding', 'lu:User', 'lu:Users', 'lu:Baby', 'lu:Footprints', 'lu:Heart', 'lu:Hospital'] },
      { title: 'Nature', icons: ['lu:Sun', 'lu:CloudSun', 'lu:Cloud', 'lu:CloudRain', 'lu:Snowflake', 'lu:Wind', 'lu:TreePine', 'lu:Trees', 'lu:Sprout', 'lu:Leaf', 'lu:Flower2', 'lu:Mountain', 'lu:Waves', 'lu:Droplets', 'lu:Flame'] },
      { title: 'Animals & food', icons: ['lu:Dog', 'lu:Cat', 'lu:Bird', 'lu:Fish', 'lu:Apple', 'lu:Wheat'] },
      { title: 'Places & travel', icons: ['lu:House', 'lu:School', 'lu:Store', 'lu:MapPin', 'lu:Car', 'lu:Bus', 'lu:Bike', 'lu:TrainFront', 'lu:Plane', 'lu:Ship'] },
    ],
  },
];

// ---------------------------------------------------------------- search

export interface IconHit {
  id: string;
  label: string;
}

export async function searchIcons(query: string, limit = 80): Promise<IconHit[]> {
  await loadIconSets();
  const q = query.trim().toLowerCase().replace(/\s+/g, '');
  if (!q) return [];
  const scored: { id: string; label: string; score: number }[] = [];
  const score = (name: string, extra = '') => {
    const n = name.toLowerCase().replace(/[\s.-]+/g, '');
    if (n === q) return 100;
    if (n.startsWith(q)) return 80;
    if (n.includes(q)) return 60;
    if (extra.toLowerCase().includes(q)) return 30;
    return 0;
  };
  for (const d of devIndex!) {
    const s = score(d.n, d.k);
    if (s) scored.push({ id: `dev:${d.n}`, label: iconLabel(`dev:${d.n}`), score: s + 5 });
  }
  for (const ic of siIcons!.values()) {
    const s = score(ic.title, ic.slug);
    // Devicon already has the colour logo for most dev tools; prefer it.
    if (s && !scored.some((x) => x.label.toLowerCase() === ic.title.toLowerCase())) scored.push({ id: `si:${ic.slug}`, label: ic.title, score: s });
  }
  for (const name of Object.keys(luIcons!)) {
    const s = score(name);
    if (s) scored.push({ id: `lu:${name}`, label: iconLabel(`lu:${name}`), score: s - 2 });
  }
  return scored.sort((a, b) => b.score - a.score || a.label.length - b.label.length).slice(0, limit);
}

/** Drops ids whose icon doesn't exist in the installed sets. */
export function existingIcons(ids: string[]) {
  if (!iconSetsReady()) return ids;
  return ids.filter((id) => {
    const [src, name] = splitId(id);
    if (src === 'dev') return devIndex!.some((d) => d.n === name);
    if (src === 'si') return siIcons!.has(name);
    return !!luIcons![name];
  });
}

// ---------------------------------------------------------------- drawing

const images = new Map<string, HTMLImageElement>();
const siPaths = new Map<string, Path2D>();

function svgImage(key: string, url: string, onLoad?: () => void) {
  let img = images.get(key);
  if (!img) {
    img = new Image();
    img.src = url;
    images.set(key, img);
  }
  if (img.complete && img.naturalWidth) return img;
  if (onLoad && !img.complete) img.addEventListener('load', onLoad, { once: true });
  return null;
}

function lucideSvg(node: LucideNode, color: string) {
  const esc = (v: string | number) => String(v).replace(/"/g, '&quot;');
  const body = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${esc(v)}"`).join(' ')}/>`).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="${color}" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  );
}

/**
 * Draws an icon into a size×size box. Returns false while it is still loading
 * (onLoad fires when it's ready, if given).
 */
export function drawIcon(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, size: number, tint: string, onLoad?: () => void): boolean {
  const [src, name] = splitId(id);
  if (src === 'dev') {
    const img = svgImage(id, `/devicon/${name}.svg`, onLoad);
    if (!img) return false;
    const k = Math.min(size / img.naturalWidth, size / img.naturalHeight);
    const w = img.naturalWidth * k, h = img.naturalHeight * k;
    ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
    return true;
  }
  if (!iconSetsReady()) {
    if (onLoad) onIconSetsReady(onLoad);
    return false;
  }
  if (src === 'si') {
    const ic = siIcons!.get(name);
    if (!ic) return false;
    let p = siPaths.get(name);
    if (!p) siPaths.set(name, (p = new Path2D(ic.path)));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 24, size / 24);
    ctx.fillStyle = `#${ic.hex}`;
    ctx.fill(p);
    ctx.restore();
    return true;
  }
  const node = luIcons![name];
  if (!node) return false;
  const key = `${id}|${tint}`;
  const img = svgImage(key, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(lucideSvg(node, tint))}`, onLoad);
  if (!img) return false;
  ctx.drawImage(img, x, y, size, size);
  return true;
}
